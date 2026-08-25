export type SemanticReference = {
  traceId: string;
  title: string;
  snippet: string;
  url: string;
  site: string;
  publishedAt: string;
  query: string;
  authoritative: boolean;
  social?: boolean;
};

export type SemanticEvent = {
  eventId: string;
  title: string;
  summary: string;
  occurredAt: string;
  family: string;
  stage: "rumor" | "discussion" | "proposal" | "official" | "implemented" | "market_reaction" | "unknown";
  actors: string[];
  actions: string[];
  objects: string[];
  sectors: string[];
  markets: string[];
  assets: string[];
  transmission: string[];
  evidenceIds: string[];
  marketReaction: number;
  novelty: number;
  confidence: number;
};

export type CausalAnalysisTopic = {
  title: string;
  observedEventIds: string[];
  causalEventIds: string[];
  mechanism: string;
  causality: "confirmed" | "strong_hypothesis" | "possible" | "unresolved";
  counterEvidence: string;
  verificationSignals: string[];
  markets: string[];
  marketImportance: number;
  explanatoryPower: number;
  evidenceStrength: number;
  novelty: number;
  confidence: number;
};

const extractionSystem = `你是全球财经新闻事件编辑。你的任务不是选题、评分或写观点，而是把搜索结果穷尽地标准化成“今天真实发生的事件全集”。

事件必须是具体的“行动者—动作—对象—时间”或“资产—价格变化—时间”，不能写成“市场关注汇率”“科技板块值得关注”等主题。动态提取所有公司、机构、官员、国家、产品、行业和资产，不依赖预设名单。

严格区分 rumor、discussion、proposal、official、implemented、market_reaction；拟议措施不能写成已经实施。不同来源描述同一具体动作时合并；同属一个行业但动作、主体或时间不同，必须拆开。每条有效证据必须分配给一个事件；确实无法判断的证据放入 unclassifiedEvidenceIds，禁止静默丢弃。

社交平台内容只用于识别讨论度、主要分歧、拥挤预期和待核验线索，不能把单个用户观点、未经证实数字或涨跌预测写成事实。与某家公司财报有关的雪球、X/Twitter、Reddit讨论，优先把evidenceId并入对应公司事件；只有讨论本身发生异常扩散且构成独立市场现象时，才建立stage=discussion的事件。公司正式披露与盘前/盘后价格变化是两件事件：前者family=corporate，后者family=market_move，并通过transmission描述先后关系。

只输出JSON对象：{"events":[{"eventId":"临时稳定ID","title":"具体事实标题","summary":"两句事实摘要","occurredAt":"ISO时间或空字符串","family":"market_move|monetary|fiscal_macro|regulation_trade|corporate|industry_supply|capital_flow|geopolitics|credit_risk|commodity_fx_rates|other","stage":"rumor|discussion|proposal|official|implemented|market_reaction|unknown","actors":[],"actions":[],"objects":[],"sectors":[],"markets":[],"assets":[],"transmission":[],"evidenceIds":[],"marketReaction":0,"novelty":0,"confidence":0}],"unclassifiedEvidenceIds":[]}。后三个分数为0到100。保持紧凑：title不超过45字，summary不超过100字，每个数组最多8项，不要重复解释。`;

function parseJson(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

async function deepSeekJson(apiKey: string, messages: any[]) {
  async function requestJson(requestMessages: any[]) {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(90_000),
      body: JSON.stringify({
        model: "deepseek-v4-flash", messages: requestMessages, thinking: { type: "disabled" },
        response_format: { type: "json_object" }, max_tokens: 20000,
      }),
    });
    const text = await response.text();
    let payload: any = {};
    try { payload = text ? JSON.parse(text) : {}; } catch {}
    if (!response.ok) throw new Error(`DeepSeek事件标准化失败：${payload.error?.message || text.slice(0, 300) || response.status}`);
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("DeepSeek事件标准化返回空内容");
    return { content, receipt: payload.id || "", model: payload.model || "deepseek-v4-flash" };
  }
  const first = await requestJson(messages);
  try {
    return { data: parseJson(first.content), receipt: first.receipt, model: first.model };
  } catch (error) {
    const repaired = await requestJson([
      { role: "system", content: "你是JSON修复器。把用户提供的残缺或非法JSON修复为一个完整合法的JSON对象。保留已有事件和evidenceIds；若尾部被截断，闭合当前对象和数组。只输出JSON，不解释。" },
      { role: "user", content: first.content },
    ]);
    try {
      return { data: parseJson(repaired.content), receipt: `${first.receipt},${repaired.receipt}`, model: repaired.model };
    } catch {
      throw new Error(`DeepSeek连续两次返回非法JSON：${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function cleanEvent(raw: any, fallbackId: string): SemanticEvent {
  const list = (value: any) => Array.isArray(value) ? [...new Set(value.map(String).map((item) => item.trim()).filter(Boolean))] : [];
  const number = (value: any) => Math.max(0, Math.min(100, Number(value) || 0));
  return {
    eventId: String(raw.eventId || fallbackId),
    title: String(raw.title || "未命名财经事件").trim(),
    summary: String(raw.summary || "").trim(),
    occurredAt: String(raw.occurredAt || "").trim(),
    family: String(raw.family || "other"),
    stage: raw.stage || "unknown",
    actors: list(raw.actors), actions: list(raw.actions), objects: list(raw.objects), sectors: list(raw.sectors),
    markets: list(raw.markets), assets: list(raw.assets), transmission: list(raw.transmission), evidenceIds: list(raw.evidenceIds),
    marketReaction: number(raw.marketReaction), novelty: number(raw.novelty), confidence: number(raw.confidence),
  };
}

export async function standardizeFinancialEvents(apiKey: string, references: SemanticReference[]) {
  const chunks: SemanticReference[][] = [];
  for (let index = 0; index < references.length; index += 12) chunks.push(references.slice(index, index + 12));
  const extracted: SemanticEvent[] = [];
  const unclassified = new Set<string>();
  const receipts: string[] = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const compact = chunks[index].map((item) => ({
      evidenceId: item.traceId, title: item.title, summary: item.snippet.slice(0, 320), site: item.site,
      publishedAt: item.publishedAt, query: item.query, authoritative: item.authoritative, social: Boolean(item.social),
    }));
    const result = await deepSeekJson(apiKey, [
      { role: "system", content: extractionSystem },
      { role: "user", content: `北京时间：${new Date().toISOString()}。标准化第${index + 1}批搜索证据：\n${JSON.stringify(compact)}` },
    ]);
    receipts.push(result.receipt);
    (result.data.events || []).forEach((event: any, eventIndex: number) => extracted.push(cleanEvent(event, `batch-${index + 1}-${eventIndex + 1}`)));
    (result.data.unclassifiedEvidenceIds || []).forEach((id: any) => unclassified.add(String(id)));
  }

  if (extracted.length <= 1) return { events: extracted, unclassifiedEvidenceIds: [...unclassified], receipts };
  const mergeInput = extracted.map((event) => ({ ...event, summary: event.summary.slice(0, 350) }));
  const mergeSystem = `${extractionSystem}\n现在执行跨批次事件合并。只有同一行动者在同一时间针对同一对象实施或讨论同一动作，才能合并。严禁因为同属汇率、芯片、AI、监管或同一国家而合并。保留全部evidenceIds。`;
  const merged = await deepSeekJson(apiKey, [
    { role: "system", content: mergeSystem },
    { role: "user", content: `合并以下候选事件并重新编号：\n${JSON.stringify(mergeInput)}` },
  ]);
  receipts.push(merged.receipt);
  const events = (merged.data.events || []).map((event: any, index: number) => cleanEvent(event, `event-${index + 1}`));
  (merged.data.unclassifiedEvidenceIds || []).forEach((id: any) => unclassified.add(String(id)));
  return { events, unclassifiedEvidenceIds: [...unclassified], receipts };
}

export async function deriveMarketFollowUpQueries(apiKey: string, references: SemanticReference[]) {
  const actionableReferences = references
    .filter((item) => /收盘|盘前|盘后|close|closed|premarket|after.hours|涨|跌|surge|plunge|rally|selloff|财报|业绩|盈利|指引|公告|披露|earnings|results|guidance|filing|conference call|雪球|twitter|x\.com|reddit|热议|讨论|sentiment/i.test(`${item.title} ${item.snippet} ${item.site} ${item.url}`))
    .sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0))
    .slice(0, 45)
    .map((item) => ({ title: item.title, summary: item.snippet.slice(0, 320), publishedAt: item.publishedAt }));
  if (!actionableReferences.length) return { queries: [], receipt: "" };
  const result = await deepSeekJson(apiKey, [
    { role: "system", content: "你是实时财经编辑。输入同时包含最新行情、公司公告、今日财报日历和社交讨论。生成二次检索：第一类追查指数、行业或个股异动的具体原因；第二类逐一核验日历中今天应发布业绩的重要上市公司；第三类对重要财报公司补齐三个窗口：正式财报/公告原文与预期差、盘前或盘后实时涨跌与成交、雪球及X/Twitter投资者正在争论的核心问题。预告或日历只负责发现公司，绝不能当成已经发布。只追输入中动态出现的实体，不得沿用历史偏好，不得生成泛泛宏观查询。优先覆盖不同公司；同一公司最多生成官方结果、实时价格、社交讨论三条功能不同的查询，禁止近义重复。最多12条，互不重复，优先最近8小时。只输出JSON：{\"queries\":[\"...\"]}。每条不超过60个字符。" },
    { role: "user", content: `北京时间${new Date().toISOString()}，最新可追踪证据：${JSON.stringify(actionableReferences)}` },
  ]);
  return { queries: [...new Set((result.data.queries || []).map(String).map((item: string) => item.trim()).filter(Boolean))].slice(0, 12), receipt: result.receipt };
}

export async function deriveCorporateReleaseFollowUpQueries(apiKey: string, references: SemanticReference[]) {
  const calendarEvidence = references
    .filter((item) => /财报日历|业绩发布时间|earnings calendar|reporting before open|after close/i.test(`${item.query} ${item.title} ${item.snippet}`))
    .slice(0, 30)
    .map((item) => ({ title: item.title, summary: item.snippet.slice(0, 500), publishedAt: item.publishedAt, site: item.site }));
  if (!calendarEvidence.length) return { queries: [], companies: [], receipt: "" };
  const result = await deepSeekJson(apiKey, [
    { role: "system", content: "你是上市公司财报日历编辑。只从输入证据中提取按北京时间今天计划发布或已经发布财报的重要上市公司，不得补充记忆中的公司。日历页面可以提前发布，判断对象是页面所写的财报发布日期。公司去重，优先大型公司、热门股票、中概股及对A股港股有映射的公司，最多6家。只输出JSON：{\"companies\":[{\"name\":\"公司常用中文或英文名\",\"ticker\":\"股票代码或空\",\"market\":\"市场或空\"}]}。" },
    { role: "user", content: `北京时间${new Date().toISOString()}。从这些日历证据提取今日财报公司：${JSON.stringify(calendarEvidence)}` },
  ]);
  const companies = (result.data.companies || [])
    .map((item: any) => ({ name: String(item.name || "").trim(), ticker: String(item.ticker || "").trim(), market: String(item.market || "").trim() }))
    .filter((item: any) => item.name)
    .filter((item: any, index: number, list: any[]) => list.findIndex((other: any) => `${other.name}|${other.ticker}`.toLowerCase() === `${item.name}|${item.ticker}`.toLowerCase()) === index)
    .slice(0, 6);
  const queries = companies.flatMap((company: any) => {
    const entity = `${company.name} ${company.ticker}`.trim();
    return [
      `${entity} 今日最新财报 正式公告 实际值 市场预期 指引`,
      `${entity} 财报后 盘前盘后 股价涨跌 成交量 premarket after hours`,
      `${entity} 财报 雪球 X Twitter 投资者讨论 分歧`,
    ];
  });
  return { queries: [...new Set(queries)].slice(0, 18), companies, receipt: result.receipt };
}

export async function buildCausalAnalysisTopics(apiKey: string, events: any[]) {
  if (!events.length) return { topics: [], receipt: "" };
  const compactEvents = events.slice(0, 60).map((event) => ({
    eventId: event.id || event.eventId, title: event.title, summary: event.summary || event.thesis,
    occurredAt: event.occurredAt, family: event.family, stage: event.stage, actors: event.actors,
    actions: event.actions, objects: event.objects, sectors: event.sectors, markets: event.markets,
    assets: event.assets, transmission: event.transmission, marketReaction: event.marketReaction,
    sourceCount: event.sourceCount, authorityCount: event.authorityCount, socialCount: event.socialCount, rank: event.rank,
    eventScore: event.score, ageHours: event.ageHours,
  }));
  const system = `你是全球资本市场因果分析编辑。输入是已经标准化的今日事件全集。请把“行情事实”和“原因事件”连接成适合深度视频的分析型选题，而不是重新罗列新闻。

先识别 observed events：指数、行业、公司、债券、汇率或商品的实际价格与资金变化；再识别 causal events：政策监管、财报指引、利率流动性、产业供需、资本流向、地缘冲击等。只有满足时间顺序合理、影响对象匹配、存在清晰传导机制时才能连接。一个监管事件可能解释某个细分板块，不得擅自解释整个大盘；相关性不能写成已确认因果。

优先形成“重要行情 + 具体原因 + 可验证机制”的选题。没有充分根因的重大行情保留为 unresolved；没有明显行情但影响重大的原因事件必须形成可独立成立的分析题，不能因为暂时缺少股价反应而从选题池消失。事件榜前8名必须各自出现在至少一个题目的 observedEventIds 或 causalEventIds 中；一个题可以覆盖确有因果关系的多个事件，但禁止为了完成覆盖而虚构联系。禁止给任何特定国家、汇率、行业或用户曾提及事件固定加权。

只输出JSON：{"topics":[{"title":"具体分析命题","observedEventIds":[],"causalEventIds":[],"mechanism":"原因如何传到价格，不超过120字","causality":"confirmed|strong_hypothesis|possible|unresolved","counterEvidence":"最强反证，不超过80字","verificationSignals":[],"markets":[],"marketImportance":0,"explanatoryPower":0,"evidenceStrength":0,"novelty":0,"confidence":0}]}。所有分数0到100，最多输出18个互不重复的分析命题。`;
  const result = await deepSeekJson(apiKey, [
    { role: "system", content: `${system}\n公司财报、业绩预告、经营指引或资本开支更新属于公司定价事件。只要事件明确指向一家上市公司，首要选题必须围绕该公司本股：盈利预期发生了什么变化、估值锚如何移动、盘后或次日价格是否充分反映、未来上涨或下跌由哪些可验证信号决定。行业、供应链和跨市场外溢只能作为第二层影响，不能取代本股成为标题和核心机制。只有证据显示多家公司同步变化、行业盈利预测被普遍上修或下修时，才可以另建行业级选题。不得因为公司规模大，就自动把单家公司财报改写成行业趋势。` },
    { role: "user", content: `北京时间${new Date().toISOString()}。从以下事件全集构建因果分析型选题：${JSON.stringify(compactEvents)}` },
  ]);
  const list = (value: any) => Array.isArray(value) ? [...new Set(value.map(String).filter(Boolean))] : [];
  const number = (value: any) => Math.max(0, Math.min(100, Number(value) || 0));
  const topics: CausalAnalysisTopic[] = (result.data.topics || []).map((item: any) => ({
    title: String(item.title || "未命名分析题").trim(), observedEventIds: list(item.observedEventIds), causalEventIds: list(item.causalEventIds),
    mechanism: String(item.mechanism || "").trim(), causality: item.causality || "unresolved",
    counterEvidence: String(item.counterEvidence || "").trim(), verificationSignals: list(item.verificationSignals), markets: list(item.markets),
    marketImportance: number(item.marketImportance), explanatoryPower: number(item.explanatoryPower), evidenceStrength: number(item.evidenceStrength),
    novelty: number(item.novelty), confidence: number(item.confidence),
  }));
  return { topics, receipt: result.receipt };
}

export function scoreCausalAnalysisTopic(topic: CausalAnalysisTopic, freshness = 0) {
  const causalDepth = topic.causalEventIds.length && topic.mechanism ? topic.explanatoryPower : topic.explanatoryPower * 0.45;
  const causalityFactor = topic.causality === "confirmed" ? 100 : topic.causality === "strong_hypothesis" ? 82 : topic.causality === "possible" ? 60 : 38;
  return Math.round(
    causalDepth * 0.25 + topic.marketImportance * 0.2 + topic.evidenceStrength * 0.16 +
    topic.novelty * 0.1 + causalityFactor * 0.09 + topic.confidence * 0.05 + freshness * 0.15,
  );
}

export function scoreSemanticEvent(event: SemanticEvent, evidence: SemanticReference[]) {
  const sources = new Set(evidence.map((item) => item.site || item.url).filter(Boolean));
  const authorityCount = evidence.filter((item) => item.authoritative).length;
  const occurredAt = Date.parse(event.occurredAt || "");
  const fallbackTimes = evidence.map((item) => Date.parse(item.publishedAt)).filter(Number.isFinite);
  const timestamp = Number.isFinite(occurredAt) ? occurredAt : Math.max(...fallbackTimes, Date.now() - 48 * 3_600_000);
  const ageHours = Math.max(0, (Date.now() - timestamp) / 3_600_000);
  const freshness = ageHours <= 2 ? 100 : ageHours <= 8 ? 94 : ageHours <= 24 ? 70 : ageHours <= 48 ? 28 : 0;
  const evidenceQuality = Math.min(100, sources.size * 18 + authorityCount * 16 + event.confidence * 0.35);
  const breadth = Math.min(100, event.markets.length * 18 + event.sectors.length * 10 + event.assets.length * 7);
  const score = Math.round(
    freshness * 0.34 + event.marketReaction * 0.19 + evidenceQuality * 0.18 +
    event.novelty * 0.14 + breadth * 0.09 + event.confidence * 0.06,
  );
  const warnings: string[] = [];
  if (sources.size < 2) warnings.push("独立来源少于2个");
  if (!authorityCount) warnings.push("缺少一级或权威信源");
  if (event.confidence < 60) warnings.push("事件理解置信度偏低");
  if (!event.markets.length && !event.assets.length) warnings.push("尚未识别具体资产映射");
  return { score, ageHours: Math.round(ageHours * 10) / 10, sourceCount: sources.size, authorityCount, warnings };
}
