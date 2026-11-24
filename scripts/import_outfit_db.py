# -*- coding: utf-8 -*-
"""从 ChiHAL · 服装档案 (https://sleepyzone.online/outfit-db-cn/) 导入/同步服装元数据；不下载或镜像图片。

用法:
  python scripts/import_outfit_db.py           # 从已提交快照 data/outfit-db/data.js 离线重建中文目录（校验 SHA-256）
  python scripts/import_outfit_db.py --sync    # 从原站抓取最新 data.js 更新快照与中文目录
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
OUTFIT_DB_DIR = DATA_DIR / "outfit-db"

OUTFIT_DB_ORIGIN = "https://sleepyzone.online/outfit-db-cn/"
OUTFIT_DB_DATA_URL = "https://sleepyzone.online/outfit-db-cn/data.js"
OUTFIT_DB_REPO_URL = "https://github.com/sleepy-zone/outfit-db-cn"
OUTFIT_DB_AUTHOR_NAME = "ChiHAL"
OUTFIT_DB_AUTHOR_HANDLE = "@chihal_ai0509"
OUTFIT_DB_AUTHOR_URL = "https://x.com/chihal_ai0509"
OUTFIT_DB_SOURCE_LABEL = "ChiHAL · 服装档案"
MAX_DATA_BYTES = 5 * 1024 * 1024

FAMILY_CATEGORY_MAP: dict[str, str] = {
    "高定裁缝": "通勤与职场",
    "暗黑朋克": "哥特与暗黑",
    "学院运动": "运动",
    "夜场华丽": "礼服与派对",
}

ASSET_RE = re.compile(r"^[a-zA-Z0-9_./-]+$")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def write_json(path: Path, obj: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(obj, ensure_ascii=False, indent=2) + "\n"
    path.write_text(text, encoding="utf-8", newline="\n")


def resolve_outfit_db_asset_url(rel_path) -> str | None:
    if not isinstance(rel_path, str):
        return None
    clean = rel_path.strip().lstrip("/").split("?")[0].split("#")[0]
    if not clean or ".." in clean or "\\" in clean:
        return None
    if not ASSET_RE.match(clean):
        return None
    return f"{OUTFIT_DB_ORIGIN}{clean}"


def resolve_outfit_db_post_url(raw_url, num: str) -> str:
    if isinstance(raw_url, str):
        trimmed = raw_url.strip()
        parsed = urllib.parse.urlparse(trimmed)
        if parsed.scheme == "https" and parsed.hostname in ("x.com", "twitter.com", "sleepyzone.online"):
            return trimmed
    return f"{OUTFIT_DB_ORIGIN}#{num}" if num else OUTFIT_DB_ORIGIN


def parse_outfit_db_script(raw_text: str) -> dict:
    trimmed = raw_text.strip()
    if trimmed.startswith("{"):
        return json.loads(trimmed)
    marker_idx = trimmed.find("OUTFIT_DB")
    search_from = marker_idx if marker_idx >= 0 else 0
    start = trimmed.find("{", search_from)
    end = trimmed.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("上游 data.js 格式异常：未找到 OUTFIT_DB JSON 对象")
    return json.loads(trimmed[start : end + 1])


def classify_outfit_db_category(family) -> str:
    clean = family.strip() if isinstance(family, str) else ""
    if not clean:
        return "创意穿搭"
    return FAMILY_CATEGORY_MAP.get(clean, clean)


def build_views(item: dict) -> list[dict]:
    views: list[dict] = []
    board_thumb = resolve_outfit_db_asset_url(item.get("board"))
    board_preview = resolve_outfit_db_asset_url(item.get("preview")) or board_thumb
    if board_thumb and board_preview:
        views.append(
            {
                "id": "front",
                "label": "规格板",
                "缩略图": board_thumb,
                "预览图": board_preview,
                "原图": board_preview,
            }
        )

    looks = item.get("looks") if isinstance(item.get("looks"), list) else []
    looks_preview = item.get("looksPreview") if isinstance(item.get("looksPreview"), list) else []
    look_count = max(len(looks), len(looks_preview))
    for i in range(look_count):
        thumb = resolve_outfit_db_asset_url(looks[i] if i < len(looks) else None) or resolve_outfit_db_asset_url(
            looks_preview[i] if i < len(looks_preview) else None
        )
        prev = resolve_outfit_db_asset_url(looks_preview[i] if i < len(looks_preview) else None) or thumb
        if not thumb or not prev:
            continue
        views.append(
            {
                "id": "front" if len(views) == 0 else f"look-{i + 1}",
                "label": f"试穿 {i + 1}",
                "缩略图": thumb,
                "预览图": prev,
                "原图": prev,
            }
        )
    return views


def dedupe_trimmed(values: list, max_count: int) -> list[str]:
    out: list[str] = []
    for val in values:
        if not isinstance(val, str):
            continue
        clean = val.strip()
        if clean and clean not in out:
            out.append(clean)
            if len(out) >= max_count:
                break
    return out


def transform_outfit_db(raw: dict) -> tuple[list[dict], dict]:
    raw_items = raw.get("items") if isinstance(raw.get("items"), list) else []
    costumes: list[dict] = []
    families: set[str] = set()
    max_date = str(raw.get("updated") or "").strip()
    total_views = 0

    for item in raw_items:
        if not isinstance(item, dict):
            continue
        views = build_views(item)
        if not views:
            continue

        item_date = str(item.get("date") or "").strip()
        if item_date and item_date > max_date:
            max_date = item_date

        num_raw = str(item.get("num") or "").strip()
        raw_id = str(item.get("id") or (f"CH{num_raw}" if num_raw else "")).strip()
        if not raw_id:
            continue
        num = num_raw or re.sub(r"^CH", "", raw_id, flags=re.IGNORECASE)
        full_id = f"outfit-db-{raw_id}"

        family = str(item.get("family") or "").strip()
        if family:
            families.add(family)
        category = classify_outfit_db_category(family)

        name_zh = str(item.get("nameZh") or "").strip()
        name_en = str(item.get("name") or "").strip()
        title = name_zh or name_en or (f"ChiHAL #{num}" if num else full_id)

        styles = item.get("styles") if isinstance(item.get("styles"), list) else []
        pieces = item.get("pieces") if isinstance(item.get("pieces"), list) else []
        colors = item.get("colors") if isinstance(item.get("colors"), list) else []
        color_names = [c.get("n", "") for c in colors if isinstance(c, dict)]
        tags = dedupe_trimmed([category, family, *styles, *pieces, *color_names], 14)

        formula = str(item.get("formula") or "").strip()
        formula_zh = str(item.get("formulaZh") or "").strip()
        summary_items = str(item.get("items") or "").strip()
        note = str(item.get("note") or "").strip()
        use = str(item.get("use") or "").strip()
        sections = item.get("sections") if isinstance(item.get("sections"), list) else []
        section_text = " ".join(
            f"{s.get('k', '')} {s.get('t', '')}".strip()
            for s in sections
            if isinstance(s, dict) and (s.get("k") or s.get("t"))
        )

        keywords = ", ".join(
            part.strip()
            for part in [formula, name_en, summary_items, *(str(p) for p in pieces)]
            if str(part).strip()
        )

        desc = "；".join(part for part in [formula_zh, summary_items, note] if part)
        primary = views[0]
        total_views += len(views)

        search_parts = [
            full_id,
            raw_id,
            f"No.{num}" if num else "",
            num,
            title,
            name_en,
            category,
            family,
            formula_zh,
            formula,
            *tags,
            summary_items,
            note,
            use,
            section_text,
            OUTFIT_DB_AUTHOR_NAME,
            OUTFIT_DB_AUTHOR_HANDLE,
            OUTFIT_DB_SOURCE_LABEL,
        ]
        search_text = " ".join(part for part in search_parts if part)

        entry: dict = {
            "id": full_id,
            "source": "outfit-db",
            "一级分类": "现实",
            "分类": category,
            "服装名称": title,
            "标签": tags,
            "关键词": keywords or title,
            "缩略图": primary["缩略图"],
            "预览图": primary["预览图"],
            "原图": primary["原图"],
            "selectedView": primary["id"],
            "views": views,
            "来源": OUTFIT_DB_SOURCE_LABEL,
            "来源地址": f"{OUTFIT_DB_ORIGIN}#{num}" if num else OUTFIT_DB_ORIGIN,
            "原帖地址": resolve_outfit_db_post_url(item.get("post"), num),
        }
        if desc:
            entry["描述"] = desc
        entry["检索"] = search_text
        costumes.append(entry)

    if not costumes:
        raise ValueError("解析异常：costumes 为空")

    meta = {
        "updated": max_date,
        "item_count": len(costumes),
        "family_count": len(families),
        "view_count": total_views,
    }
    return costumes, meta


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sync", action="store_true", help="从原站抓取最新 data.js 并更新本地快照")
    parser.add_argument("--source-url", default=OUTFIT_DB_DATA_URL, help="自定义 data.js 地址（默认原站）")
    args = parser.parse_args()

    snapshot_path = OUTFIT_DB_DIR / "data.js"
    source_meta_path = OUTFIT_DB_DIR / "source.json"

    if args.sync:
        parsed_url = urllib.parse.urlparse(args.source_url)
        if parsed_url.scheme != "https":
            raise ValueError("仅允许 HTTPS 来源地址")
        req = urllib.request.Request(
            args.source_url,
            headers={
                "User-Agent": "ai-pose-gallery-zh/2.0",
                "Accept": "application/javascript, text/javascript, application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw_bytes = resp.read(MAX_DATA_BYTES + 1)
        if len(raw_bytes) > MAX_DATA_BYTES:
            raise ValueError("上游 data.js 超过 5 MiB 上限")
        raw_text = raw_bytes.decode("utf-8")
        raw_obj = parse_outfit_db_script(raw_text)
        canonical_bytes = raw_text.replace("\r\n", "\n").encode("utf-8")
        snapshot_path.parent.mkdir(parents=True, exist_ok=True)
        snapshot_path.write_bytes(canonical_bytes)
        snapshot_sha = sha256_bytes(canonical_bytes)
    else:
        if not snapshot_path.exists():
            raise FileNotFoundError("缺少 data/outfit-db/data.js，请先运行 --sync")
        raw_bytes = snapshot_path.read_bytes()
        snapshot_sha = sha256_bytes(raw_bytes)
        if source_meta_path.exists():
            prev_meta = json.loads(source_meta_path.read_text(encoding="utf-8"))
            expected_sha = prev_meta.get("snapshot_sha256")
            if expected_sha and expected_sha != snapshot_sha:
                raise ValueError("快照哈希与 data/outfit-db/source.json 不符，请审核后使用 --sync 重建")
        raw_obj = parse_outfit_db_script(raw_bytes.decode("utf-8"))

    costumes, meta = transform_outfit_db(raw_obj)

    write_json(DATA_DIR / "costume-outfit-db-zh.json", costumes)
    write_json(
        source_meta_path,
        {
            "origin": OUTFIT_DB_ORIGIN,
            "data_url": args.source_url if args.sync else OUTFIT_DB_DATA_URL,
            "repository": OUTFIT_DB_REPO_URL,
            "author": OUTFIT_DB_AUTHOR_NAME,
            "author_handle": OUTFIT_DB_AUTHOR_HANDLE,
            "author_url": OUTFIT_DB_AUTHOR_URL,
            "updated": meta["updated"],
            "snapshot_sha256": snapshot_sha,
            "item_count": meta["item_count"],
            "family_count": meta["family_count"],
            "view_count": meta["view_count"],
            "images": "remote-only; no image mirroring",
            "copyright": "设计与图片版权归原作者 ChiHAL（@chihal_ai0509）所有，中文索引整理源自 sleepyzone.online/outfit-db-cn，禁止二次分发图片本体或商业再发布",
        },
    )

    print(
        f"outfit-db sync ok: updated={meta['updated']} "
        f"costumes={meta['item_count']} ({meta['family_count']} families, {meta['view_count']} views), "
        f"images=remote-only"
    )


if __name__ == "__main__":
    main()
