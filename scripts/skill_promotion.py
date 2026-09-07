import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SKILL_PATHS = {
    "discover-financial-topics": ROOT / "skills" / "discover-financial-topics" / "SKILL.md",
    "package-financial-video": ROOT / "skills" / "package-financial-video" / "SKILL.md",
    "write-financial-video-script": ROOT / "skills" / "write-financial-video-script" / "SKILL.md",
}
VERSION_DIR = ROOT / "data" / "skill-versions"
LOG_PATH = VERSION_DIR / "promotion-log.json"


def promote_skill_rule(request_data):
    candidate = request_data.get("candidate") or {}
    candidate_id = re.sub(r"[^a-zA-Z0-9_-]", "", str(candidate.get("id") or ""))[:80]
    target = str(candidate.get("targetSkill") or "")
    rule = re.sub(r"\s+", " ", str(candidate.get("rule") or "")).strip()
    if not candidate_id or target not in SKILL_PATHS or not rule:
        return {"ok": False, "status": 400, "error": "待晋升规则缺少有效ID、目标Skill或规则正文。"}
    if candidate.get("status") not in (None, "pending"):
        return {"ok": False, "status": 409, "error": "该规则已处理，不能重复晋升。"}
    path = SKILL_PATHS[target]
    if not path.is_file():
        return {"ok": False, "status": 404, "error": "目标Skill不存在。"}
    current = path.read_text("utf-8")
    marker = f"<!-- strategy-promotion:{candidate_id} -->"
    if marker in current:
        return {"ok": True, "alreadyApplied": True, "targetSkill": target, "message": "该规则已经写入Skill。"}
    VERSION_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = VERSION_DIR / f"{target}-{timestamp}.md"
    shutil.copy2(path, backup)
    block = (
        f"\n{marker}\n"
        f"- {rule}\n"
        f"  - 数据依据：{candidate.get('rationale') or '见策略迭代记录'}\n"
        f"  - 适用边界：{candidate.get('risks') or '继续以当前事实与选题为准'}\n"
    )
    path.write_text(current.rstrip() + "\n" + block, "utf-8")
    try: logs = json.loads(LOG_PATH.read_text("utf-8")) if LOG_PATH.is_file() else []
    except (ValueError, OSError): logs = []
    log = {"candidateId": candidate_id, "targetSkill": target, "rule": rule, "approvedAt": datetime.now(timezone.utc).isoformat(), "backup": str(backup.relative_to(ROOT)).replace("\\", "/")}
    LOG_PATH.write_text(json.dumps([log, *logs][:200], ensure_ascii=False, indent=2), "utf-8")
    return {"ok": True, "targetSkill": target, "backup": log["backup"], "approvedAt": log["approvedAt"], "message": "规则已写入稳定Skill并创建版本备份。"}
