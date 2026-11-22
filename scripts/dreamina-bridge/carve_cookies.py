"""
从 Chrome Cookies 库的空闲页里回收被删除的 Cookie 行（只读分析，不写回）。

背景：Chrome 在「用户目录路径与加密绑定的路径不一致」时收不到 App-Bound 解密，
会把解不开的 Cookie 行 DELETE 掉。SQLite 删除只标记空闲页，文件大小不变，
因此旧行仍可能留在页内。本脚本暴力扫描全部字节偏移，按 SQLite 记录格式还原。

用法：
  python carve_cookies.py <Cookies.work>

输出：可回收行数、按域名分布、与现存行的一致性自检结果。
"""

import sqlite3
import struct
import sys
from collections import Counter

INT_SIZES = {1: 1, 2: 2, 3: 3, 4: 4, 5: 6, 6: 8}


def read_varint(buf, i):
    v = 0
    for k in range(9):
        if i + k >= len(buf):
            raise ValueError
        b = buf[i + k]
        if k == 8:
            return (v << 8) | b, i + 9
        v = (v << 7) | (b & 0x7F)
        if b < 0x80:
            return v, i + k + 1
    raise ValueError


def parse_record(buf, off):
    """从 off 处尝试解析一个 SQLite 记录，返回 (values, end) 或 None。values 中 TEXT 保留原始字节。"""
    try:
        hdr_size, p = read_varint(buf, off)
    except ValueError:
        return None
    if hdr_size < 2 or hdr_size > 4096 or off + hdr_size > len(buf):
        return None
    types = []
    q = p
    while q < off + hdr_size:
        try:
            t, q = read_varint(buf, q)
        except ValueError:
            return None
        types.append(t)
        if len(types) > 64:
            return None
    if q != off + hdr_size:
        return None

    values = []
    r = off + hdr_size
    for t in types:
        if t == 0:
            values.append(None)
        elif t in INT_SIZES:
            n = INT_SIZES[t]
            if r + n > len(buf):
                return None
            values.append(int.from_bytes(buf[r:r + n], "big", signed=True))
            r += n
        elif t == 7:
            if r + 8 > len(buf):
                return None
            values.append(struct.unpack(">d", buf[r:r + 8])[0])
            r += 8
        elif t == 8:
            values.append(0)
        elif t == 9:
            values.append(1)
        elif t in (10, 11):
            return None
        else:
            n = (t - 12) // 2 if t % 2 == 0 else (t - 13) // 2
            if r + n > len(buf):
                return None
            values.append(buf[r:r + n])
            r += n
    return values, r


def looks_like_cookie(row, cols):
    """用 Chrome 写入的强特征过滤误判：域名形态 + v10/v20 密文前缀（密文在 encrypted_value 列）。"""
    if len(row) != cols:
        return None
    idx = {name: i for i, name in enumerate(COLS)}
    try:
        host = row[idx["host_key"]]
        name = row[idx["name"]]
        value = row[idx["value"]]
        enc = row[idx["encrypted_value"]]
        path = row[idx["path"]]
        expiry = row[idx["expires_utc"]]
        secure = row[idx["is_secure"]]
        httponly = row[idx["is_httponly"]]
        port = row[idx["source_port"]]
    except (KeyError, IndexError):
        return None
    if not isinstance(host, bytes) or not (3 <= len(host) <= 255):
        return None
    try:
        host_s = host.decode("ascii")
    except UnicodeDecodeError:
        return None
    if "." not in host_s or not all(c.isalnum() or c in ".-_" for c in host_s):
        return None
    if not isinstance(name, bytes) or not (1 <= len(name) <= 255):
        return None
    # 明文 value 或密文 encrypted_value 至少有一个，密文必须带 Chrome 的版本前缀
    plain_ok = isinstance(value, bytes) and len(value) > 0
    enc_ok = isinstance(enc, bytes) and (enc.startswith(b"v10") or enc.startswith(b"v20"))
    if not (plain_ok or enc_ok):
        return None
    if not isinstance(path, bytes) or not path.startswith(b"/"):
        return None
    if not isinstance(expiry, int) or not isinstance(port, int):
        return None
    if secure not in (0, 1) or httponly not in (0, 1):
        return None
    return host_s, name.decode("ascii", "replace"), path.decode("ascii", "replace")


path = sys.argv[1]
con = sqlite3.connect(path)
COLS = [r[1] for r in con.execute("PRAGMA table_info(cookies)")]
version = con.execute("PRAGMA user_version").fetchone()[0]
live = con.execute("SELECT host_key, name, path FROM cookies").fetchall()
live_keys = {(h, n, p) for h, n, p in live}
con.close()
print(f"schema: {len(COLS)} columns, user_version={version}")
print(f"columns: {', '.join(COLS)}")
print(f"live rows now: {len(live)}")

buf = open(path, "rb").read()
print(f"file bytes: {len(buf)}")

found = {}
raw_hits = 0
for off in range(len(buf)):
    parsed = parse_record(buf, off)
    if not parsed:
        continue
    row, _ = parsed
    key = looks_like_cookie(row, len(COLS))
    if not key:
        continue
    raw_hits += 1
    found.setdefault(key, row)

print(f"raw parse hits: {raw_hits}")
print(f"unique cookies recovered: {len(found)}")

hosts = Counter(k[0] for k in found)
print("top hosts:")
for h, c in hosts.most_common(15):
    print(f"  {c:5d}  {h}")

google = sum(c for h, c in hosts.items() if "google" in h)
capcut = sum(c for h, c in hosts.items() if "capcut" in h or "dreamina" in h)
print(f"google-related: {google}")
print(f"capcut/dreamina: {capcut}")

recovered_live = live_keys & set(found)
print(f"self-check: {len(recovered_live)}/{len(live_keys)} 现存行也被同一解析器识别（应为全部）")

out = path.replace(".work", ".rows")
with open(out, "wb") as f:
    import pickle
    pickle.dump({"cols": COLS, "rows": list(found.values())}, f)
print(f"saved candidate rows -> {out}")
