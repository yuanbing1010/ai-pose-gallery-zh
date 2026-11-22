"""从 霧島澪 · 设计档案 (https://sleepyzone.online/mio-design-archive/) 导入/同步姿势与服装元数据；不下载或镜像图片。

python scripts/import_mio.py           # 从已提交快照 data/mio/data.json 离线重建中文目录（校验 SHA-256）
python scripts/import_mio.py --sync    # 从原站抓取最新 data.json 更新快照与中文目录
"""
import argparse
import hashlib
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
MIO_DIR = DATA_DIR / "mio"

MIO_ARCHIVE_ORIGIN = "https://sleepyzone.online/mio-design-archive/"
MIO_DATA_URL = "https://sleepyzone.online/mio-design-archive/data.json"
MIO_AUTHOR_NAME = "霧島澪"
MIO_AUTHOR_HANDLE = "@Mio_2am"
MIO_AUTHOR_URL = "https://x.com/Mio_2am"
MIO_SOURCE_LABEL = "霧島澪 · 设计档案"
MIO_POSE_SYSTEM = "霧島澪 · 设计档案"
MAX_DATA_BYTES = 5 * 1024 * 1024

POSE_NAME_ZH_MAP = {
    "tree pose": "树式",
    "triangle pose": "三角式",
    "warrior ii": "战士二式",
    "cobra pose": "眼镜蛇式",
    "camel pose": "骆驼式",
    "bridge pose": "桥式",
    "chair pose": "幻椅式",
    "dancer pose": "舞王式",
    "pigeon pose": "鸽子式",
    "bow pose": "弓式",
    "wheel pose": "轮式",
    "boat pose": "船式",
    "plank pose": "平板支撑",
    "child pose": "婴儿式",
    "child's pose": "婴儿式",
    "lotus pose": "莲花坐",
    "split leap": "劈叉跳",
    "arabesque": "阿拉贝斯克舞姿",
    "attitude": "鹤立舞姿",
    "passé": "单腿立（Passé）",
    "passe": "单腿立（Passé）",
    "pirouette": "单脚旋转",
    "grand jeté": "大跳（Grand Jeté）",
    "grand jete": "大跳（Grand Jeté）",
    "walking together": "并肩行走",
    "selfie pose": "并肩自拍",
    "heart pose": "双人比心",
    "back to back": "背靠背站姿",
    "v sign": "双人比 V 合影",
    "squat pose": "双人并排蹲姿",
    "sitting together": "双人背靠坐",
    "arm around": "双人揽肩合影",
    "relax recline": "双人并排斜倚",
    "sitting chat": "长椅对坐交谈",
    "photo pose": "并肩比 V 合影",
    "stroll side by side": "并肩漫步",
    "relax together": "并排仰靠坐",
    "ready stance": "接球准备姿",
    "ready receive": "接球准备姿",
    "dribble low": "低位运球",
    "hip pop": "顶胯舞姿",
    "side recline": "侧卧撑头",
    "stomach lift": "俯卧撑肘抬腿",
    "prone stretch": "俯卧伸展",
    "reclining arch": "仰卧反弓",
    "knee hug": "坐地抱膝",
    "heel sit": "跪坐脚跟",
    "half kneel": "单膝跪地",
    "kneel reach": "双膝跪地斜伸",
    "fan sit": "分腿展坐",
}

COSTUME_PROMPT_TAG_RULES = [
    (re.compile(r"\bblack\b", re.I), "黑色"),
    (re.compile(r"\bwhite\b|\bivory\b|\bcream\b", re.I), "白色"),
    (re.compile(r"\bred\b|\bburgundy\b|\bcrimson\b|\bmaroon\b", re.I), "红色"),
    (re.compile(r"\bpink\b", re.I), "粉色"),
    (re.compile(r"\bblue\b|\bnavy\b|\bdenim\b", re.I), "蓝色"),
    (re.compile(r"\bgreen\b|\bmint\b|\bolive\b", re.I), "绿色"),
    (re.compile(r"\borange\b|\brust\b", re.I), "橙色"),
    (re.compile(r"\bbrown\b|\btan\b|\bbeige\b|\bcamel\b", re.I), "棕色"),
    (re.compile(r"\b(?:grey|gray|charcoal)\b", re.I), "灰色"),
    (re.compile(r"\bgold\b|\bgolden\b", re.I), "金色"),
    (re.compile(r"\blace\b", re.I), "蕾丝"),
    (re.compile(r"\bleather\b|\bvinyl\b|\bpatent\b", re.I), "皮革"),
    (re.compile(r"\bcorset\b", re.I), "束腰"),
    (re.compile(r"\bmini skirt\b|\bpleated skirt\b|\bskirt\b", re.I), "半身裙"),
    (re.compile(r"\bdress\b|\bgown\b", re.I), "连衣裙"),
    (re.compile(r"\bblazer\b|\bsuit\b", re.I), "西装"),
    (re.compile(r"\bcoat\b|\btrench\b|\bjacket\b", re.I), "外套"),
    (re.compile(r"\bknit\b|\bsweater\b|\bcardigan\b|\bturtleneck\b", re.I), "针织"),
    (re.compile(r"\bscarf\b|\bshawl\b", re.I), "围巾"),
    (re.compile(r"\bboots?\b|\bthigh high boots\b", re.I), "长靴"),
    (re.compile(r"\bhigh heels\b|\bpumps\b|\bheels\b", re.I), "高跟鞋"),
    (re.compile(r"\bsneakers?\b", re.I), "运动鞋"),
    (re.compile(r"\bstockings\b|\btights\b|\bpantyhose\b|\bgarter\b", re.I), "丝袜"),
    (re.compile(r"\bshorts\b", re.I), "短裤"),
    (re.compile(r"\bjeans\b|\bpants\b|\btrousers\b|\bsweatpants\b", re.I), "长裤"),
    (re.compile(r"\bshirt\b|\bblouse\b", re.I), "衬衫"),
    (re.compile(r"\bt-?shirt\b|\btee\b|\bcrop top\b", re.I), "T恤"),
    (re.compile(r"\bjersey\b|\bsports bra\b|\bathleisure\b", re.I), "运动风"),
    (re.compile(r"\bbodysuit\b|\bcatsuit\b", re.I), "连体衣"),
    (re.compile(r"\bembroider", re.I), "刺绣"),
    (re.compile(r"\bplaid\b|\bpinstripe\b", re.I), "格纹条纹"),
]


def sha256_bytes(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def resolve_mio_asset_url(rel_path) -> str | None:
    if not isinstance(rel_path, str):
        return None
    clean = rel_path.strip().lstrip("/").split("?")[0].split("#")[0]
    if not clean or ".." in clean or "\\" in clean:
        return None
    if not re.fullmatch(r"[a-zA-Z0-9_./-]+", clean):
        return None
    return f"{MIO_ARCHIVE_ORIGIN}{clean}"


def resolve_mio_post_url(raw_url) -> str:
    if not isinstance(raw_url, str):
        return MIO_ARCHIVE_ORIGIN
    trimmed = raw_url.strip()
    try:
        parsed = urllib.parse.urlparse(trimmed)
        if parsed.scheme == "https" and parsed.hostname in ("x.com", "twitter.com", "sleepyzone.online"):
            return trimmed
    except Exception:
        pass
    return MIO_ARCHIVE_ORIGIN


def split_zh_clauses(zh: str) -> list[str]:
    stripped = re.sub(r"[。！？；]+$", "", zh)
    return [part.strip() for part in re.split(r"[，,；;。]+", stripped) if part.strip()]


def join_concise_clauses(clauses: list[str], max_len: int) -> str:
    picked: list[str] = []
    length = 0
    for part in clauses:
        next_len = len(part) if length == 0 else length + 1 + len(part)
        if picked and next_len > max_len:
            break
        picked.append(part)
        length = next_len
        if len(picked) >= 2 and length >= 12:
            break
    return " · ".join(picked)


def build_costume_title(vol: dict, item: dict) -> str:
    zh = (item.get("zh") or "").strip()
    if zh:
        all_clauses = split_zh_clauses(zh)
        filtered = [
            c
            for idx, c in enumerate(all_clauses)
            if not (idx == 0 and re.fullmatch(r"[红黑白灰粉蓝绿紫棕米橙黄银金藏青酒红奶白]+主色", c))
        ]
        concise = join_concise_clauses(filtered or all_clauses, 28)
        if concise:
            return concise
    theme = (vol.get("theme_zh") or vol.get("theme_en") or vol.get("slug") or "設計穿搭").strip()
    name = (item.get("name") or "").strip()
    if name and not re.fullmatch(r"Look\s*\d+", name, re.I):
        return f"{theme} · {name}"
    no = str(item.get("no") or 0).zfill(2)
    return f"{theme} #{no}"


def build_pose_title(vol: dict, item: dict) -> str:
    raw_name = (item.get("name") or "").strip()
    if raw_name and re.search(r"[\u4e00-\u9fff]", raw_name):
        return raw_name
    if raw_name:
        mapped = POSE_NAME_ZH_MAP.get(raw_name.lower())
        if mapped:
            return mapped
    zh = (item.get("zh") or "").strip()
    if zh:
        concise = join_concise_clauses(split_zh_clauses(zh), 22)
        if concise:
            return concise
    if raw_name and not re.fullmatch(r"Pose\s+\d+-\d+", raw_name, re.I):
        return raw_name
    theme = (vol.get("theme_zh") or vol.get("theme_en") or vol.get("slug") or "动态参考").strip()
    no = str(item.get("no") or 0).zfill(2)
    return f"{theme} #{no}"


def classify_costume_category(vol: dict, item: dict) -> str:
    theme_text = f"{vol.get('theme_zh', '')} {vol.get('theme_en', '')} {' '.join(vol.get('tags') or [])}"
    vol_text = f"{theme_text} {vol.get('note', '')}"
    item_text = f"{item.get('zh', '')} {item.get('prompt', '')}"
    combined = f"{vol_text} {item_text}"

    if re.search(r"万圣节|哥特|洛丽塔|暗黑|机能|gothic|halloween|techwear|lolita", theme_text, re.I):
        return "哥特与暗黑"
    if re.search(r"礼服|婚纱|晚礼|gown|evening dress", theme_text, re.I):
        return "礼服与派对"
    if re.search(r"通勤|西装|职场|office|blazer", theme_text, re.I):
        return "通勤与职场"
    if re.search(r"排球|网球|篮球|高尔夫|运动|健身|athleisure|sport|volleyball", theme_text, re.I):
        return "运动"
    if re.search(r"泳装|比基尼|swimsuit|bikini", combined, re.I):
        return "泳装"
    if re.search(r"睡衣|居家|内衣|pajamas|lingerie", theme_text, re.I):
        return "居家与睡衣"
    if re.search(r"和服|浴衣|kimono|yukata", combined, re.I):
        return "和服"
    if re.search(r"秋装|冬装|秋冬|针织|大衣|围巾|长靴|连体衣|autumn|winter|knit|catsuit", theme_text, re.I):
        return "秋冬穿搭"
    if re.search(r"春装|夏装|春夏|露肩|休闲|波西米亚|bohemian|summer|spring", theme_text, re.I):
        return "春夏穿搭"
    if re.search(r"礼服|礼裙", vol_text, re.I):
        return "礼服与派对"
    if re.search(r"通勤|西装|职场", vol_text, re.I):
        return "通勤与职场"
    return "创意穿搭"


def classify_pose_category(vol: dict, item: dict) -> str:
    item_text = f"{item.get('name', '')} {item.get('zh', '')} {item.get('prompt', '')} {' '.join(item.get('tags') or [])}"
    vol_text = f"{vol.get('theme_zh', '')} {vol.get('theme_en', '')} {' '.join(vol.get('tags') or [])}"

    if re.search(r"\b2girls\b|\b2boys\b|\bduo\b|双人|两人", item_text, re.I) or "双人" in vol_text:
        return "双人合影"
    if re.search(r"芭蕾|\bballet\b|arabesque|pirouette|grand jet[eé]", f"{vol_text} {item_text}", re.I):
        return "芭蕾"
    if re.search(r"瑜伽|\byoga\b|tree pose|triangle pose|warrior|cobra pose|camel pose|bridge pose", f"{vol_text} {item_text}", re.I):
        return "瑜伽"
    if re.search(r"舞蹈|\bdance\b|hip pop", vol_text, re.I) or re.search(r"\bdance\b|舞姿", item_text, re.I):
        return "舞蹈"
    if re.search(r"排球|网球|篮球|高尔夫|健身|运动|volleyball|tennis|basketball|golf|workout", vol_text, re.I):
        return "运动"
    if re.search(r"俯卧|仰卧|侧卧|平躺|侧躺|趴地|躺姿|\blying\b|\bprone\b|\bsupine\b|side recline", item_text, re.I):
        return "卧姿"
    if re.search(r"蹲|跪|\bsquat|\bcrouch|\bkneel", item_text, re.I):
        return "蹲跪"
    if re.search(r"站立|站姿|\bstanding\b|\bwalking\b", item_text, re.I):
        return "站姿"
    if re.search(r"坐|盘腿|\bsit\b|\bsitting\b|\bseated\b", item_text, re.I):
        return "坐姿"
    if re.search(r"站|行走|迈步", item_text, re.I):
        return "站姿"
    if re.search(r"坐|椅|凳", vol_text):
        return "坐姿"
    if re.search(r"蹲|跪", vol_text):
        return "蹲跪"
    if re.search(r"卧|躺", vol_text):
        return "卧姿"
    if "站" in vol_text:
        return "站姿"
    return "人体动态"


def extract_pose_angle(item: dict) -> str:
    prompt = (item.get("prompt") or "").lower()
    zh = item.get("zh") or ""
    if re.search(r"\b(?:back view|from behind|back to camera|rear view)\b", prompt) or re.search(r"背对镜头|背向镜头", zh):
        return "背面"
    if re.search(r"\b(?:from above|high angle|overhead|top-down)\b", prompt) or re.search(r"俯拍|俯视", zh):
        return "俯视"
    if re.search(r"\b(?:from below|low angle)\b", prompt) or re.search(r"仰拍|仰视", zh):
        return "仰视"
    if re.search(r"\b(?:three[- ]quarter|3/4 view|diagonal)\b", prompt) or "斜侧" in zh:
        return "斜侧"
    if re.search(r"\b(?:side view|profile)\b", prompt) or re.search(r"侧视角|侧面", zh):
        return "侧面"
    return "正面"


def extract_costume_tags(vol: dict, item: dict, category: str) -> list[str]:
    tags = [category]
    for raw_tag in vol.get("tags") or []:
        clean = str(raw_tag).strip()
        if clean and clean not in tags:
            tags.append(clean)
    prompt = item.get("prompt") or ""
    for pattern, label in COSTUME_PROMPT_TAG_RULES:
        if pattern.search(prompt) and label not in tags:
            tags.append(label)
    return tags[:12]


def extract_pose_tags(vol: dict, item: dict, category: str) -> list[str]:
    tags = [category]
    for raw_tag in [*(vol.get("tags") or []), *(item.get("tags") or [])]:
        clean = str(raw_tag).strip()
        if clean and clean not in tags:
            tags.append(clean)
    return tags[:10]


def transform_mio_archive(raw: dict) -> tuple[list[dict], list[dict], dict]:
    volumes = raw.get("volumes")
    if not isinstance(volumes, list):
        raise ValueError("上游 data.json 缺少 volumes 数组")

    poses: list[dict] = []
    costumes: list[dict] = []
    seen_pose_ids: set[str] = set()
    seen_costume_ids: set[str] = set()
    pose_vol_count = 0
    costume_vol_count = 0

    for vol in volumes:
        if not isinstance(vol, dict):
            continue
        series = str(vol.get("series") or "").strip()
        if series not in ("pose", "cloth"):
            continue
        items = vol.get("items") or []
        post_url = resolve_mio_post_url(vol.get("url"))

        if series == "pose":
            pose_vol_count += 1
            for item in items:
                raw_id = str(item.get("id") or "").strip()
                tile_url = resolve_mio_asset_url(item.get("tile"))
                if not raw_id or not tile_url:
                    continue
                full_id = f"mio-{raw_id}"
                if full_id in seen_pose_ids:
                    continue
                seen_pose_ids.add(full_id)

                category = classify_pose_category(vol, item)
                title = build_pose_title(vol, item)
                angle = extract_pose_angle(item)
                tags = extract_pose_tags(vol, item, category)
                desc = str(item.get("zh") or "").strip() or str(vol.get("note") or "").strip()
                prompt = str(item.get("prompt") or "").strip()
                prompt_zh = str(item.get("prompt_zh") or "").strip()

                search_parts = [
                    full_id,
                    raw_id,
                    MIO_POSE_SYSTEM,
                    category,
                    title,
                    str(item.get("name") or ""),
                    str(vol.get("theme_zh") or ""),
                    str(vol.get("theme_en") or ""),
                    desc,
                    prompt,
                    prompt_zh,
                    " ".join(tags),
                    "mio",
                    "霧島澪",
                    "雾岛澪",
                    "sleepyzone",
                ]
                entry = {
                    "id": full_id,
                    "source": "mio",
                    "体系": MIO_POSE_SYSTEM,
                    "姿势编号": raw_id,
                    "分类": category,
                    "姿势名称": title,
                    "角度": angle,
                    "缩略图": tile_url,
                    "原图": tile_url,
                    "来源": MIO_SOURCE_LABEL,
                    "来源地址": MIO_ARCHIVE_ORIGIN,
                    "原帖地址": post_url,
                    "检索": " ".join(part for part in search_parts if part),
                }
                if desc:
                    entry["描述"] = desc
                if tags:
                    entry["标签"] = tags
                if prompt:
                    entry["关键词"] = prompt
                poses.append(entry)
        else:
            costume_vol_count += 1
            for item in items:
                raw_id = str(item.get("id") or "").strip()
                tile_url = resolve_mio_asset_url(item.get("tile"))
                if not raw_id or not tile_url:
                    continue
                full_id = f"mio-{raw_id}"
                if full_id in seen_costume_ids:
                    continue
                seen_costume_ids.add(full_id)

                category = classify_costume_category(vol, item)
                title = build_costume_title(vol, item)
                tags = extract_costume_tags(vol, item, category)
                desc = str(item.get("zh") or "").strip() or str(vol.get("note") or "").strip()
                prompt = str(item.get("prompt") or "").strip()
                prompt_zh = str(item.get("prompt_zh") or "").strip()
                sensitive = bool(
                    re.search(
                        r"lingerie|bikini|underwear|see-through|cleavage|内衣|睡衣|泳装|比基尼",
                        f"{vol.get('theme_zh', '')} {prompt}",
                        re.I,
                    )
                )

                search_parts = [
                    full_id,
                    raw_id,
                    category,
                    title,
                    str(item.get("name") or ""),
                    str(vol.get("theme_zh") or ""),
                    str(vol.get("theme_en") or ""),
                    desc,
                    prompt,
                    prompt_zh,
                    " ".join(tags),
                    "mio",
                    "霧島澪",
                    "雾岛澪",
                    "sleepyzone",
                ]
                entry = {
                    "id": full_id,
                    "source": "mio",
                    "一级分类": "现实",
                    "分类": category,
                    "服装名称": title,
                    "标签": tags,
                    "关键词": prompt,
                    "缩略图": tile_url,
                    "预览图": tile_url,
                    "原图": tile_url,
                    "来源": MIO_SOURCE_LABEL,
                    "来源地址": MIO_ARCHIVE_ORIGIN,
                    "原帖地址": post_url,
                    "检索": " ".join(part for part in search_parts if part),
                }
                if desc:
                    entry["描述"] = desc
                if sensitive:
                    entry["敏感"] = True
                costumes.append(entry)

    if not poses or not costumes:
        raise ValueError(f"解析异常：poses={len(poses)}, costumes={len(costumes)}")

    meta = {
        "generated": str(raw.get("generated") or ""),
        "source": str(raw.get("source") or MIO_AUTHOR_URL),
        "pose_volumes": pose_vol_count,
        "costume_volumes": costume_vol_count,
        "pose_count": len(poses),
        "costume_count": len(costumes),
    }
    return poses, costumes, meta


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sync", action="store_true", help="从原站抓取最新 data.json 并更新本地快照")
    parser.add_argument("--source-url", default=MIO_DATA_URL, help="自定义 data.json 地址（默认原站）")
    args = parser.parse_args()

    snapshot_path = MIO_DIR / "data.json"
    source_meta_path = MIO_DIR / "source.json"

    if args.sync:
        parsed_url = urllib.parse.urlparse(args.source_url)
        if parsed_url.scheme != "https":
            raise ValueError("仅允许 HTTPS 来源地址")
        req = urllib.request.Request(
            args.source_url,
            headers={"User-Agent": "ai-pose-gallery-zh/2.0", "Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw_bytes = resp.read(MAX_DATA_BYTES + 1)
        if len(raw_bytes) > MAX_DATA_BYTES:
            raise ValueError("上游 data.json 超过 5 MiB 上限")
        raw_obj = json.loads(raw_bytes.decode("utf-8"))
        # 规范化持久化，保证换行与编码一致
        canonical_bytes = (json.dumps(raw_obj, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
        snapshot_path.parent.mkdir(parents=True, exist_ok=True)
        snapshot_path.write_bytes(canonical_bytes)
        snapshot_sha = sha256_bytes(canonical_bytes)
    else:
        if not snapshot_path.exists():
            raise FileNotFoundError("缺少 data/mio/data.json，请先运行 --sync")
        raw_bytes = snapshot_path.read_bytes()
        snapshot_sha = sha256_bytes(raw_bytes)
        if source_meta_path.exists():
            prev_meta = json.loads(source_meta_path.read_text(encoding="utf-8"))
            expected_sha = prev_meta.get("snapshot_sha256")
            if expected_sha and expected_sha != snapshot_sha:
                raise ValueError("快照哈希与 data/mio/source.json 不符，请审核后使用 --sync 重建")
        raw_obj = json.loads(raw_bytes.decode("utf-8"))

    poses, costumes, meta = transform_mio_archive(raw_obj)

    write_json(DATA_DIR / "pose-mio-zh.json", poses)
    write_json(DATA_DIR / "costume-mio-zh.json", costumes)
    write_json(
        source_meta_path,
        {
            "origin": MIO_ARCHIVE_ORIGIN,
            "data_url": args.source_url if args.sync else MIO_DATA_URL,
            "repository": "https://github.com/sleepy-zone/mio-design-archive",
            "author": MIO_AUTHOR_NAME,
            "author_handle": MIO_AUTHOR_HANDLE,
            "author_url": MIO_AUTHOR_URL,
            "generated": meta["generated"],
            "snapshot_sha256": snapshot_sha,
            "pose_volumes": meta["pose_volumes"],
            "costume_volumes": meta["costume_volumes"],
            "pose_count": meta["pose_count"],
            "costume_count": meta["costume_count"],
            "images": "remote-only; no image mirroring",
            "copyright": "设计与图片版权归原网站（sleepyzone.online/mio-design-archive）及原作者 霧島澪（@Mio_2am）所有，禁止二次分发图片本体或商业再发布",
        },
    )

    print(
        f"mio sync ok: generated={meta['generated']} "
        f"poses={meta['pose_count']} ({meta['pose_volumes']} vols), "
        f"costumes={meta['costume_count']} ({meta['costume_volumes']} vols), "
        f"images=remote-only"
    )


if __name__ == "__main__":
    main()
