import json
import re
import sys
import hashlib
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / ".python_packages"))

import httpx
import openai


SYSTEM = """你是“金融巨子”的内容增长策略总编。根据抖音创作者后台的真实逐稿数据，迭代选题、研究底稿与口播成稿能力。

必须区分相关性与因果：单条爆款只能形成假设，不能形成永久规则；优先比较同类题材、发布时间、时长、搜索/推荐来源、2秒跳出、5秒完播、平均观看时长、完播、互动和涨粉。缺失指标必须明确写入数据边界，禁止估算。播放量高但搜索占比高，优先解释为选题搜索需求；曝光尚可但早期留存差，才归因于Hook；平均观看强但播放低，优先判断需求或分发不足。不要用封面点击率解释抖音推荐流，除非输入有明确可比证据。

输出一个JSON对象，不要Markdown：
{"summary":"本轮一句话结论","dataBoundary":"样本与缺失说明","insights":[{"finding":"发现","evidence":"具体对比数据","confidence":"high|medium|low"}],"topicDirectives":["可直接用于选题排序的规则"],"researchDirectives":["可直接用于研究底稿的规则"],"scriptDirectives":["可直接用于口播成稿的规则"],"avoid":["需要停止或降权的做法"],"experiments":[{"name":"实验名","change":"只改变一个变量","successMetric":"观察指标","sampleSize":"建议样本"}]}。

每类directive最多6条，每条必须具体、可执行且不绑定某一家公司的偶然性。动态策略不得推翻事实核验、合规边界、纯口播输出、当前事件主体、标题承诺和禁止编造等稳定Skill硬规则。保留已被数据支持的旧策略，推翻旧策略时说明新证据。"""

PROMOTION_SYSTEM = """你是内容方法论审计员。输入包含多轮抖音策略迭代及每轮去重后的作品指标摘要。找出跨轮反复成立、可能晋升为稳定Skill的通用规则。

候选必须满足：至少3轮独立迭代、跨度至少14天、至少8个不同作品、至少2类题材；不能由单条爆款驱动；移除最高与最低播放样本后仍有方向一致的证据；confidence必须为high。至少满足一项效果门槛：同类播放中位数提升30%以上、平均观看时长提升15%以上、5秒完播率提升10个百分点以上、或2秒跳出率下降10个百分点以上。缺失数据不得估算。规则不能绑定具体公司、数字或一次性热点，也不得削弱事实、合规和输出硬规则。

只输出JSON：{"candidates":[{"rule":"可以直接写入Skill的一条规则","targetSkill":"discover-financial-topics|package-financial-video|write-financial-video-script","rationale":"为何具有通用性","confidence":"high","evidenceIterationIds":[],"supportingPostIds":[],"supportingCategories":[],"outlierCheck":"去掉最高最低样本后的结论","metricEvidence":[{"metric":"views_median_pct|average_watch_pct|five_second_completion_pp|two_second_bounce_pp","baseline":0,"test":0,"change":0}],"risks":"适用边界"}]}。不满足全部硬条件就返回空数组。"""


def parse_json(text):
    clean = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.I | re.S)
    match = re.search(r"\{.*\}", clean, re.S)
    return json.loads(match.group(0) if match else clean)


def sample_digest(records):
    digest = []
    for item in records[:80]:
        perf = item.get("performance") or {}
        digest.append({
            "postId": str(perf.get("platformId") or perf.get("id") or item.get("projectId") or ""),
            "topic": str(item.get("topic") or "")[:100],
            "title": str(item.get("title") or "")[:100],
            "publishedAt": perf.get("publishedAt"),
            "views": perf.get("views"), "likes": perf.get("likes"), "comments": perf.get("comments"),
            "shares": perf.get("shares"), "followers": perf.get("followers"),
            "durationSeconds": perf.get("durationSeconds"), "averageWatchSeconds": perf.get("averageWatchSeconds"),
            "completionRate": perf.get("completionRate"), "twoSecondBounceRate": perf.get("twoSecondBounceRate"),
            "fiveSecondCompletionRate": perf.get("fiveSecondCompletionRate"), "trafficSources": perf.get("trafficSources"),
        })
    return digest


def eligible_candidates(raw_candidates, iterations):
    iteration_by_id = {str(item.get("id")): item for item in iterations if item.get("id")}
    all_posts = {str(post.get("postId")) for item in iterations for post in (item.get("sampleDigest") or []) if post.get("postId")}
    result = []
    for raw in raw_candidates if isinstance(raw_candidates, list) else []:
        ids = list(dict.fromkeys(str(value) for value in (raw.get("evidenceIterationIds") or []) if str(value) in iteration_by_id))
        dates = []
        for value in ids:
            try: dates.append(datetime.fromisoformat(str(iteration_by_id[value].get("createdAt", "")).replace("Z", "+00:00")))
            except ValueError: pass
        posts = list(dict.fromkeys(str(value) for value in (raw.get("supportingPostIds") or []) if str(value) in all_posts))
        categories = list(dict.fromkeys(str(value).strip() for value in (raw.get("supportingCategories") or []) if str(value).strip()))
        metrics = raw.get("metricEvidence") if isinstance(raw.get("metricEvidence"), list) else []
        threshold = any(
            (item.get("metric") == "views_median_pct" and float(item.get("change") or 0) >= 30)
            or (item.get("metric") == "average_watch_pct" and float(item.get("change") or 0) >= 15)
            or (item.get("metric") == "five_second_completion_pp" and float(item.get("change") or 0) >= 10)
            or (item.get("metric") == "two_second_bounce_pp" and float(item.get("change") or 0) <= -10)
            for item in metrics
        )
        span_days = (max(dates) - min(dates)).days if len(dates) >= 2 else 0
        if len(ids) < 3 or span_days < 14 or len(posts) < 8 or len(categories) < 2 or raw.get("confidence") != "high" or not threshold or not raw.get("outlierCheck"):
            continue
        rule = str(raw.get("rule") or "").strip()
        target = str(raw.get("targetSkill") or "")
        if not rule or target not in {"discover-financial-topics", "package-financial-video", "write-financial-video-script"}:
            continue
        candidate_id = "promotion-" + hashlib.sha256(f"{target}|{rule}".encode("utf-8")).hexdigest()[:16]
        result.append({**raw, "id": candidate_id, "status": "pending", "spanDays": span_days, "uniquePostCount": len(posts)})
    return result


def generate_strategy_iteration(request_data):
    api_key = str(request_data.get("apiKey", "")).strip()
    model = str(request_data.get("model", "deepseek-v4-pro")).strip() or "deepseek-v4-pro"
    records = request_data.get("records") or []
    previous = request_data.get("previousStrategy") or {}
    history = request_data.get("strategyHistory") or []
    if not api_key or not records:
        return {"ok": False, "status": 400, "error": "缺少 DeepSeek API Key 或已匹配的抖音逐稿数据。"}
    payload = {"previousStrategy": previous, "matchedDouyinPosts": records[:80]}
    try:
        client = openai.OpenAI(api_key=api_key, base_url="https://api.deepseek.com", timeout=httpx.Timeout(240.0, connect=30.0), max_retries=2)
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": SYSTEM}, {"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
            max_tokens=6000,
            response_format={"type": "json_object"},
            extra_body={"thinking": {"type": "disabled"}},
        )
        strategy = parse_json(response.choices[0].message.content or "")
        usage = getattr(response, "usage", None)
        iteration_id = f"strategy-{int(datetime.now(timezone.utc).timestamp() * 1000)}"
        iteration = {
            "id": iteration_id,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "sampleCount": len(records),
            "sampleDigest": sample_digest(records),
            "model": getattr(response, "model", "") or model,
            "receipt": getattr(response, "id", "") or "",
            "usage": {"inputTokens": getattr(usage, "prompt_tokens", None), "outputTokens": getattr(usage, "completion_tokens", None)} if usage else {},
            **strategy,
        }
        all_iterations = [iteration, *[item for item in history if item.get("id") != iteration_id]][:50]
        promotion_candidates = []
        valid_dates = []
        for item in all_iterations:
            try: valid_dates.append(datetime.fromisoformat(str(item.get("createdAt", "")).replace("Z", "+00:00")))
            except ValueError: pass
        if len(all_iterations) >= 3 and len(valid_dates) >= 3 and (max(valid_dates) - min(valid_dates)).days >= 14:
            audit_response = client.chat.completions.create(
                model=model,
                messages=[{"role": "system", "content": PROMOTION_SYSTEM}, {"role": "user", "content": json.dumps({"iterations": all_iterations}, ensure_ascii=False)}],
                max_tokens=6000, response_format={"type": "json_object"}, extra_body={"thinking": {"type": "disabled"}},
            )
            audited = parse_json(audit_response.choices[0].message.content or "")
            promotion_candidates = eligible_candidates(audited.get("candidates") or [], all_iterations)
        return {
            "ok": True,
            "iteration": iteration,
            "promotionCandidates": promotion_candidates,
        }
    except openai.APIStatusError as error:
        return {"ok": False, "status": error.status_code, "error": f"DeepSeek {error.status_code}：{error.message}"}
    except openai.APITimeoutError:
        return {"ok": False, "status": 504, "error": "DeepSeek 策略复盘超过4分钟仍未返回。"}
    except openai.APIConnectionError as error:
        return {"ok": False, "status": 502, "error": f"连接 DeepSeek 失败：{error}"}
    except Exception as error:
        return {"ok": False, "status": 502, "error": f"策略复盘失败：{type(error).__name__}: {error}"}
