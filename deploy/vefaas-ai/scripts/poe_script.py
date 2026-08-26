import sys
import re
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / ".python_packages"))

import openai
import httpx


WRITING_SKILL_PATH = Path(__file__).resolve().parents[1] / "skills" / "write-financial-video-script" / "SKILL.md"
WRITING_SKILL = WRITING_SKILL_PATH.read_text(encoding="utf-8") if WRITING_SKILL_PATH.is_file() else ""


WRITER_SYSTEM = """你是“金融巨子”的首席财经视频作者。你写的不是财经文章、研究报告或视频文案提纲，而是一个真正懂市场的人，坐在镜头前，把一件复杂财经事件讲成观众愿意一路听完的故事。每个字都必须是人会真的说出口的话。

严格执行 peanutcut-creator 的文稿方法：写前先在内部确定唯一核心判断、受众情绪弧线和4至6个留存单元，但不要输出规划。创作底稿只是幕后决策与可选弹药，不是正文目录；事实护栏必须遵守，其余卡片可以取舍，严禁按卡片顺序报菜名。全文只讲透一个核心概念，常识必须加深一层或删除。数字必须有来源和可感知的比较；没有可靠出处的数字、人名、历史案例和大师观点不得编造。必须有一个敢下判断的“我”，但要区分事实、推断和验证条件，不给个股买卖建议。

把事件讲成真实叙事，而不是观点拼盘。优先寻找一条能够被证据支持的故事线：谁在什么时点做了什么或说了什么，市场第一反应是什么，哪一个资产先动，谁随后跟进，哪一个市场拒绝跟随，随后暴露出什么矛盾。正文沿着行动、反应、后果向前走。每一段都要让局面发生变化，不能停下来做抽象总结。没有真实人物时，就让政策动作、资金仓位或价格变化成为故事主角；绝不能虚构人物、会议、对白和现场细节。

深度来自把因果拆开讲透，不来自堆术语。每个重要结论都顺着“谁改变了什么变量—这个变量怎样影响资金或盈利—哪个资产为什么先反应”一步一步说明；只有当前选题确有跨市场关联时，才继续解释传到A股、港股或其他市场还缺什么条件。专业词第一次出现，立刻用中国观众熟悉的生活经验解释；类比必须比原概念更容易懂，并且全文最多保留一个真正有记忆点的原创意象。

叙述要有发现过程。开头必须使用当前包装锁定的Hook与核心矛盾，用一个真实、具体、可核验的异常瞬间把观众带进事件，随后立刻交付一句有因果方向的核心判断；只报行情、日期或涨跌纪录不算观点先行。不要一次公布全部证据和边界。中间随着证据展开，让观众和讲述者一起发现表面解释哪里不对，再修正、加深或限定开头判断。反方不是例行公事，而是故事里的另一种可能：指出哪一个后续信号出现，当前判断就会被推翻。结尾回到开头的异常，明确总结当前判断，并交付一套类似事件可复用的观察顺序。

像真人一样说话：句子有长有短，关键处停一下，解释处允许展开；可以有克制的幽默、惊讶或不耐烦，但不能表演情绪。不要频繁使用“你可能以为”“真正的问题是”“更重要的是”“换句话说”“说白了”“这意味着什么”“不是A而是B”等AI常用接缝。转场优先依靠事件本身的新动作、新证据或价格变化，不靠修辞口号。

口播手艺要求：每个自然段集中推进一个信息点，句子长短交替，让主播有自然换气位置。要让观众感觉你在跟他说话，合理使用“我”“你”“咱们”，不能全篇用“市场、该事件、投资者”作主语。信源自然说成“根据某机构当天发布的数据”，不能写脚注、括号引用或网址。禁止“首先、其次、最后”“综上所述”“值得注意的是”“从某某维度来看”“该事件表明”等报告腔。写完必须在心里完整朗读一遍，凡是嘴会打结、听一遍抓不住主语、或像机器总结出来的句子都要重写。

你不能和编辑对话，不能索要补充材料，不能说“如果你愿意”“把信息给我”“我可以继续完善”。现有证据不够时，删掉无依据细节、降低判断强度或写成观众可理解的待验证条件，但仍须一次性交付完整稿件。

最终只输出1000至3000个汉字的纯口播正文。不要标题、章节名、项目符号、舞台说明、写作解释、信源清单或Markdown。第一个字就是主播开口说的第一个字，最后一个字就是主播收尾说的最后一个字。"""

REVIEWER_SYSTEM = """你是独立于主笔的财经视频口播总编，也是一位擅长非虚构叙事的编辑。拿到选题、包装承诺、证据池和草稿后，先在心里把它读出声。它必须像一个有判断力的真人：事件型内容可沿时间线推进，原因分析型内容则围绕同一问题按解释力逐层下探；不是把财经研报分成自然段，也不是观点金句合集。不要写评语，直接交付终审重写的最终逐字口播稿。

强制检查事实是否只来自证据池且不伪造、因果是否闭环、标题承诺是否兑现、第一段是否使用当前包装的Hook与核心矛盾、异常之后是否在前220个汉字内给出一句有因果方向的核心判断、全文是否只讲一个核心判断、动态创作底稿是否被正确取舍而不是逐卡扩写、证据是否按解释力排序、跨市场内容是否确有主题依据、反方是否具体且可验证、结尾是否明确总结并给出可复用观察顺序，以及是否存在AI腔、空话、重复、裸设问接缝和生硬互动。只报行情、日期、涨跌幅或连涨连跌纪录不算核心判断。发现问题直接重写。宁可删除无依据的细节，也不要补造事实。

额外检查：是否有一条真实事件线推动全文；每一段之后局面有没有发生变化；核心因果是否拆到普通人能跟上；是否有具体证据而不是抽象判断；认知转折是否由新证据产生；反方是否真能推翻结论；是否滥用“不是A而是B”和套路转折。句子长短要自然，不要把所有句子切成同一种节拍。让“我、你、咱们”自然出现，专业概念听一遍就懂，删除任何像摘要、报告、评论文章或新闻播报的句子。绝不向编辑提问或索要资料；信息不足就收窄判断并完成稿件。

最终只输出1000至3000个汉字、可直接朗读的中文正文，不输出审查报告、标题、章节标记、列表或Markdown。"""

FINALIZER_SYSTEM = """你是短视频逐字口播稿交付编辑。输入内容是尚未达到交付标准的中间产物。你的唯一任务是把它彻底改写成博主坐在镜头前能自然说出口、观众只听一遍就能跟上的完整中文财经口播稿。不是文章，不是研报，不是新闻播报。不要讨论怎么改，不要输出计划，不要解释你做了什么。

硬性要求：1000至3000个汉字；第一句进入当前包装锁定的真实事件瞬间与冲突，前220个汉字内必须紧跟一句有因果方向的核心判断，只报行情或涨跌纪录不算判断；全文只有一个核心判断。根据动态研究底稿选择结构：事件型内容可沿“行动—市场反应—新证据—认知转折—后续影响”推进；原因分析型内容围绕同一问题，按解释力从主因到次因逐层下探。不能把观点并排罗列。把核心因果一步步讲成人话；只有主题确有跨市场关联时，才继续解释传到其他市场还缺什么条件。句子长短自然交替，每段集中推进一个信息点，合理使用“我、你、咱们”。全文最多使用一个真正好懂的原创意象。反方必须能用具体信号推翻当前判断。结尾必须明确总结当前判断，给出类似事件可复用的观察顺序、最关键验证信号和判断失效条件。禁止报告体连接词、论文句式、新闻播音腔，以及反复使用“你可能以为”“真正的问题是”“不是A而是B”等套路接缝。绝对禁止标题、Markdown、提纲、编号、项目符号、创作思路、情绪弧线、留存单元说明、审稿意见、修改说明、字数统计、开场白或“以下是正文”。绝对不能向用户索要信息、征求是否继续、提出合作建议或解释还缺什么；证据不足就删除、限定或转成验证条件，然后直接完成稿件。

输出协议：只输出一组<口播正文>和</口播正文>标签，完整逐字稿放在标签中间。标签中间的第一个字必须是主播开口说的第一个字，不能再放标题或说明。"""


FINANCIAL_STORY_STYLE = """

“金融巨子”的独立叙事配方：吸收优秀中文财经内容的两类长处，但绝不模仿任何具体创作者的口头禅、固定句式、人设、自称或标志性表达。

第一类长处，是把复杂机制翻译成普通人的利益故事。先指出谁想得到什么、谁在转嫁成本、谁最终承担风险，再用一个贴近生活而且准确的类比拆开机制。允许克制吐槽，但笑点必须落在利益错位、荒诞规则或市场的反常反应上，不能拿事实准确性换段子。每篇最多一至三处观察式幽默；禁止网络梗大礼包、强行抖机灵、嘲讽普通投资者，以及复制任何创作者的成名梗。

第二类长处，是把当天行情放回更大的资本故事。交代关键玩家、各自筹码、现实约束与必要的历史坐标，让观众理解钱为什么这样流、价格为什么此时动、这次与历史上的相似事件究竟哪里相同、哪里不同。宏大叙事只能从具体证据长出来，禁止空喊时代、格局、资本、周期或历史车轮。

正文使用“双发动机”推进。叙事发动机不断制造具体问题：眼前发生了什么怪事，谁最先行动，他为什么偏偏此时行动，哪个市场没有按常识走；解释发动机紧跟着用最少的术语回答。每解释清一层，必须带出一个新的矛盾、利益变化或价格信号，推动观众进入下一层。不要先讲大段背景再分析，也不要连续堆知识点；背景只在故事需要它的那一刻出现。

把机构、政府、央行和资金写成“有目标、有筹码、有约束的行动者”，但不得虚构心理活动。可以依据证据说某类资金面临再平衡、止损、汇率对冲或业绩压力，不能凭空说“华尔街慌了”“主力偷偷布局”“资本早有预谋”。

全篇至少完成三次有效推进：用具体异常把人拉进来并交付判断方向；最强解释因素先成立；一条反常证据修正、加深或限制表层解释；主题确有必要时再连接跨市场影响；最终给出带条件的判断。转折必须由新事实触发，不能靠“但是事情没那么简单”空转。结尾回扣开头，不做宏大升华、不喊口号；先明确总结当前判断，再给出类似事件可复用的观察顺序、最关键验证信号和判断失效条件。
"""

FINANCIAL_STORY_REVIEW = """

额外按“金融巨子”叙事配方终审：稿件必须同时具备通俗的利益故事和扎实的资本机制。检查是否写清关键行动者的目标、筹码与约束；幽默是否帮助理解而非代替论证；历史参照是否真正提供比较而非装饰；每一次转折是否由新证据触发；背景是否在需要时才出现；是否存在空洞宏大词、虚构心理、强行网络梗或对具体创作者的腔调模仿。任何一项不合格，直接改写正文，不要输出评价。
"""

COMPANY_EARNINGS_PRIORITY = """
财报稿遵循公司优先原则：如果核心事件是单一上市公司的财报、业绩预告、经营指引或资本开支更新，全文主角必须是该公司及其股票。主线依次回答盈利预期发生了什么变化、估值锚如何移动、财报后价格是否透支、未来上涨或下跌由哪些可验证信号决定。行业、供应链和跨市场联动只能在本股判断讲清后作为第二层影响，篇幅与重要性不得压过本股。只有多家公司数据形成共同证据时，才可升级为行业主线。
"""

WRITER_SYSTEM += FINANCIAL_STORY_STYLE + COMPANY_EARNINGS_PRIORITY
REVIEWER_SYSTEM += FINANCIAL_STORY_STYLE + FINANCIAL_STORY_REVIEW + COMPANY_EARNINGS_PRIORITY
FINALIZER_SYSTEM += FINANCIAL_STORY_STYLE + FINANCIAL_STORY_REVIEW + COMPANY_EARNINGS_PRIORITY

# Keep the reusable writing skill as the final authority shared by the writer,
# reviewer and repair pass. Updating the skill therefore changes real output,
# instead of leaving methodology in documentation that the model never sees.
if WRITING_SKILL:
    WRITER_SYSTEM += "\n\n以下是本项目当前生效的口播稿 Skill，逐条执行：\n" + WRITING_SKILL
    REVIEWER_SYSTEM += "\n\n以下是本项目当前生效的口播稿 Skill，逐条终审：\n" + WRITING_SKILL
    FINALIZER_SYSTEM += "\n\n以下是本项目当前生效的口播稿 Skill，逐条修复：\n" + WRITING_SKILL


def extract_script(text):
    match = re.search(r"<口播正文>\s*(.*?)\s*</口播正文>", text, re.S)
    return match.group(1).strip() if match else text.strip()


def normalize_oral_paragraphs(text, target=190, hard_limit=230):
    """Only changes paragraph breaks; it never rewrites or deletes model text."""
    source_paragraphs = [item.strip() for item in re.split(r"\n\s*\n", text) if item.strip()]
    normalized = []
    for paragraph in source_paragraphs:
        if len(re.sub(r"\s+", "", paragraph)) <= hard_limit:
            normalized.append(paragraph)
            continue
        units = [item.strip() for item in re.findall(r".*?[。！？!?；;](?:[”’」』])?|.+$", paragraph) if item.strip()]
        buffer = ""
        for unit in units:
            if len(re.sub(r"\s+", "", buffer + unit)) <= target:
                buffer += unit
                continue
            if buffer:
                normalized.append(buffer.strip())
                buffer = ""
            if len(re.sub(r"\s+", "", unit)) <= hard_limit:
                buffer = unit
                continue
            clauses = [item.strip() for item in re.findall(r".*?[，,：:、](?:[”’」』])?|.+$", unit) if item.strip()]
            for clause in clauses:
                if buffer and len(re.sub(r"\s+", "", buffer + clause)) > target:
                    normalized.append(buffer.strip())
                    buffer = ""
                buffer += clause
        if buffer:
            normalized.append(buffer.strip())
    return "\n\n".join(normalized)


def delivery_problems(text):
    compact_length = len(re.sub(r"\s+", "", text))
    problems = []
    if compact_length < 1000:
        problems.append(f"正文不足1000字（当前约{compact_length}字）")
    if compact_length > 3000:
        problems.append(f"正文超过3000字（当前约{compact_length}字）")
    if re.search(r"(?m)^\s*(#{1,6}\s|```|[-*+]\s+|\d+[.、)]\s*)", text):
        problems.append("包含Markdown标题、代码围栏或列表")
    if re.search(r"(?m)^\s*(写作思路|创作思路|核心判断|情绪弧线|留存单元|内容大纲|审稿意见|修改说明|成稿策略|结构设计)\s*[:：]", text):
        problems.append("包含提纲或审稿说明")
    if re.search(r"^\s*(下面|以下)(是|为).{0,20}(口播|正文|文稿|成稿)", text):
        problems.append("包含交付前言")
    if re.search(r"你愿意的话|如果你愿意|把.{0,20}(补给我|发给我|告诉我)|请.{0,12}(提供|补充|告诉)|需要你.{0,12}(提供|补充)|我可以.{0,18}(继续|再帮|进一步)|等你.{0,12}(回复|补充)|你只需要.{0,12}(提供|告诉)", text):
        problems.append("仍在与编辑对话或索要补充信息，没有直接交付口播稿")
    paragraphs = [item.strip() for item in re.split(r"\n\s*\n", text) if item.strip()]
    if paragraphs and max(len(re.sub(r"\s+", "", item)) for item in paragraphs) > 240:
        problems.append("存在超过240字的超长段落，不适合照读")
    sentences = [item for item in re.split(r"[。！？]", text) if re.sub(r"\s+", "", item)]
    if sentences:
        average_sentence = compact_length / len(sentences)
        long_sentences = sum(1 for item in sentences if len(re.sub(r"\s+", "", item)) > 60)
        if average_sentence > 58:
            problems.append(f"平均句长约{average_sentence:.0f}字，明显是文章体")
        if long_sentences > max(3, len(sentences) // 4):
            problems.append("超过60字的长句过多，主播难以换气")
    formal_markers = re.findall(r"综上所述|值得注意的是|从.{0,12}(角度|维度)来看|该事件(表明|说明)|首先|其次|最后", text)
    if len(formal_markers) >= 3:
        problems.append("报告体连接词过多")
    audience_words = re.findall(r"我|你|咱们|我们", text)
    if len(audience_words) < 3:
        problems.append("几乎没有真人对观众说话的感觉")
    ai_connectors = re.findall(r"你可能以为|真正的问题是|更重要的是|换句话说|说白了|这意味着什么|不是.{0,22}而是", text)
    if len(ai_connectors) >= 5:
        problems.append("AI常用转折和对称句式重复过多")
    return problems


def _parse_evidence_time(value):
    raw = str(value or "").strip().replace("Z", "+00:00")
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone(timedelta(hours=8)))
        return parsed.astimezone(timezone.utc)
    except ValueError:
        return None


def _url_intrinsic_date(value):
    try:
        path = urlparse(str(value or "")).path
        match = re.search(r"(?:^/|/)(20\d{2})[-_/]?(0[1-9]|1[0-2])[-_/]?([0-2]\d|3[01])(?:/|[-_.]|$)", path)
        if not match:
            return None
        return datetime(int(match.group(1)), int(match.group(2)), int(match.group(3)), tzinfo=timezone(timedelta(hours=8))).astimezone(timezone.utc)
    except (ValueError, TypeError):
        return None


def build_fresh_fact_corpus(topic_context):
    """Only recent, traceable source text may authorize market numbers."""
    now = datetime.now(timezone.utc)
    accepted = []
    rejected = []
    for item in topic_context.get("evidence", []) if isinstance(topic_context, dict) else []:
        if not isinstance(item, dict):
            continue
        published = _parse_evidence_time(item.get("publishedAt"))
        intrinsic = _url_intrinsic_date(item.get("url"))
        effective = intrinsic or published
        if not effective or effective > now + timedelta(hours=2) or now - effective > timedelta(hours=72):
            rejected.append(item.get("title") or item.get("url") or "无标题证据")
            continue
        if intrinsic and published and abs((intrinsic - published).total_seconds()) > 72 * 3600:
            rejected.append(item.get("title") or item.get("url") or "日期冲突证据")
            continue
        accepted.append(" ".join(str(item.get(key, "")) for key in ("title", "snippet", "publishedAt", "site", "url")))
    return "\n".join(accepted), rejected


def factual_number_problems(text, topic_context):
    corpus, rejected = build_fresh_fact_corpus(topic_context)
    normalized_corpus = re.sub(r"\D", "", corpus)
    problems = []
    sensitive = re.compile(r"人民币|离岸|在岸|汇率|美元|日元|欧元|股价|指数|收益率|利率|基点|市值|成交|涨|跌|新高|新低|最高|最低|收盘|开盘")
    claim_pattern = re.compile(r"\d+(?:\.\d+)?(?:%|％)?|[一二三四五六七八九十两]+年(?:半)?")
    for sentence in re.split(r"(?<=[。！？])", text):
        if not sensitive.search(sentence):
            continue
        claims = claim_pattern.findall(sentence)
        for claim in claims:
            digits = re.sub(r"\D", "", claim)
            grounded = claim in corpus or (digits and digits in normalized_corpus)
            if not grounded:
                excerpt = re.sub(r"\s+", "", sentence)[:90]
                problems.append(f"行情数字或期限“{claim}”没有出现在任何72小时内的原始证据中（{excerpt}）")
    if rejected and not corpus and claim_pattern.search(text) and sensitive.search(text):
        problems.append("本项目没有可用于核验行情数字的近期原始证据，禁止写入具体报价、涨跌幅、日期或历史极值")
    return list(dict.fromkeys(problems))


def completion(client, model, system, user, receipts=None):
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
    for attempt in range(2):
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=6000,
            extra_body={"thinking": {"type": "disabled"}},
        )
        text = response.choices[0].message.content or ""
        if receipts is not None:
            usage = getattr(response, "usage", None)
            receipts.append({
                "responseId": getattr(response, "id", "") or "",
                "requestedModel": model,
                "actualModel": getattr(response, "model", "") or model,
                "inputTokens": getattr(usage, "prompt_tokens", None) if usage else None,
                "outputTokens": getattr(usage, "completion_tokens", None) if usage else None,
            })
        if text.strip():
            return text.strip()
        messages = messages + [{
            "role": "user",
            "content": "上一次响应正文为空。不要输出思考过程，立即直接输出完整的最终口播正文。",
        }]
    raise RuntimeError("DeepSeek 连续两次返回空正文，本次稿件未写入。")


def generate_script(request_data):
    api_key = str(request_data.get("apiKey", "")).strip()
    model = str(request_data.get("model", "deepseek-v4-pro")).strip().lower() or "deepseek-v4-pro"
    topic = str(request_data.get("topic", "")).strip()
    research = request_data.get("research") or []
    packaging = request_data.get("packaging") or {}
    topic_context = request_data.get("topicContext") or {}
    packaging_options = request_data.get("packagingOptions") or []
    workflow_context = request_data.get("workflowContext") or {}
    if not api_key or not topic or not isinstance(research, list):
        return {"ok": False, "status": 400, "error": "缺少 DeepSeek API Key、选题或研究底稿。"}

    evidence = "\n\n".join(
        f"{item.get('key', '证据')}｜{item.get('title', '')}\n{item.get('body', '')}"
        for item in research if isinstance(item, dict)
    )
    raw_event_context = json.dumps(topic_context, ensure_ascii=False, indent=2)
    fresh_fact_corpus, rejected_fact_sources = build_fresh_fact_corpus(topic_context)
    if not fresh_fact_corpus:
        return {
            "ok": False,
            "status": 422,
            "error": "当前项目没有携带可核验的72小时内原始证据正文与发布时间，已停止写稿。请回到首页重新扫描热点并用新结果开稿；系统不会再让模型凭标题或常识补写行情事实。",
        }
    workflow_brief = json.dumps(workflow_context, ensure_ascii=False, indent=2)
    alternative_packaging = json.dumps(packaging_options, ensure_ascii=False, indent=2)
    brief = (
        "【账号与交付目标】\n"
        "账号：金融巨子。目标受众是关注A股、港股、美股、外汇、债券和大宗商品联动的中文投资者。内容必须提供观点和判断，不荐股。\n"
        f"工作流要求：\n{workflow_brief}\n\n"
        "【已经锁定的选题】\n"
        f"{topic}\n\n"
        "【热点扫描保留下来的原始事件上下文】\n"
        "这里包含事件摘要、触发因素、时间新鲜度、市场范围、热度和账号匹配评分、硬门结果、来源数量、社交信号以及证据标题/站点/链接。"
        "评分只用于判断选题重要性，不能当作对观众宣读的市场事实；证据链接和标题用于约束事实，不要在正文堆网址。\n"
        f"{raw_event_context}\n\n"
        "【允许引用具体数字的近期事实账本】\n"
        "只有下面逐字出现的报价、涨跌幅、日期、基点和历史极值才可进入正文。事实账本为空时，禁止自行补充任何行情数字。\n"
        f"{fresh_fact_corpus or '空：当前没有包含正文摘要与可信发布时间的近期原始证据。'}\n"
        f"已排除的无日期、过期或日期冲突来源：{json.dumps(rejected_fact_sources, ensure_ascii=False)}\n\n"
        "【当前已经选定的包装承诺】\n"
        f"标题：{packaging.get('title', topic)}\n"
        f"Hook方向：{packaging.get('hook', '')}\n"
        f"核心矛盾：{packaging.get('conflict', '')}\n"
        f"标题类型：{packaging.get('type', '')}\n"
        f"受众动机：{packaging.get('motive', '')}\n"
        f"搜索关键词：{packaging.get('keyword', '')}\n"
        f"封面分工：{packaging.get('coverMode', '')}\n\n"
        "【包装阶段产生的其他方案，仅用于理解取舍，不能混写多个标题承诺】\n"
        f"{alternative_packaging}\n\n"
        "【动态创作底稿】\n"
        "这些卡片分为事实硬门、写前决策和可选弹药，不是文章结构，也不要求全部使用。只选能被原始事件上下文支持、且真正服务于唯一核心判断的内容；任何空泛、错配、矛盾、重复或无来源内容必须舍弃。\n"
        f"{evidence}\n\n"
        "约束发生冲突时，依次服从可核验事实与安全边界、当前选题、当前包装承诺、当前动态研究底稿、当前写稿Skill、通用叙事习惯。旧模板、默认案例、固定时间线、固定段数和通用跨市场要求不得覆盖当前底稿。写作前必须在内部完成：从原始证据确认事件主体和时间，选择唯一核心判断；仅在主题确有跨市场关联时确定传导链及其成立条件；核对标题承诺。然后直接写成篇口播，不要把上述内部工作输出。"
    )
    try:
        receipts = []
        client = openai.OpenAI(
            api_key=api_key,
            base_url="https://api.deepseek.com",
            timeout=httpx.Timeout(240.0, connect=30.0),
            max_retries=2,
        )
        draft = completion(client, model, WRITER_SYSTEM, brief, receipts)
        final_script = completion(client, model, REVIEWER_SYSTEM, f"{brief}\n\n主笔草稿：\n{draft}", receipts)
        final_script = normalize_oral_paragraphs(extract_script(final_script))
        problems = delivery_problems(final_script) + factual_number_problems(final_script, topic_context)
        stages = ["主笔创作", "独立终审重写"]
        repair_round = 0
        while problems and repair_round < 2:
            repair_round += 1
            repaired = completion(
                client,
                model,
                FINALIZER_SYSTEM,
                f"{brief}\n\n这是第{repair_round}轮成稿修复。当前文本未通过的具体原因：{'；'.join(problems)}。必须逐项修复；找不到近期原始证据的数字必须删除，不能猜测、换一个数字或返回修改建议。\n\n待彻底改写的中间产物：\n{final_script}",
                receipts,
            )
            final_script = normalize_oral_paragraphs(extract_script(repaired))
            stages.append(f"强制成稿{repair_round}")
            problems = delivery_problems(final_script) + factual_number_problems(final_script, topic_context)
        if problems:
            return {
                "ok": False,
                "status": 422,
                "error": f"模型返回的仍是中间产物，已拒绝写入稿件框：{'；'.join(problems)}。旧稿未被覆盖，请重新生成。",
            }
        return {
            "ok": True,
            "script": final_script,
            "model": model,
            "warning": "",
            "stages": stages,
            "provenance": {
                "provider": "DeepSeek API",
                "endpoint": "https://api.deepseek.com/chat/completions",
                "callCount": len(receipts),
                "receipts": receipts,
            },
        }
    except openai.APIStatusError as error:
        return {"ok": False, "status": error.status_code, "error": f"DeepSeek {error.status_code}：{error.message}"}
    except openai.APITimeoutError:
        return {"ok": False, "status": 504, "error": "DeepSeek 写稿超过4分钟仍未返回。"}
    except openai.APIConnectionError as error:
        return {"ok": False, "status": 502, "error": f"连接 DeepSeek 失败：{error}；底层原因：{error.__cause__!r}"}
    except Exception as error:
        return {"ok": False, "status": 502, "error": f"DeepSeek Python 调用失败：{type(error).__name__}: {error}"}
