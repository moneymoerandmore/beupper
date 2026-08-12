export type SemanticReference = {
  traceId: string;
  title: string;
  snippet: string;
  url: string;
  site: string;
  publishedAt: string;
  query: string;
  authoritative: boolean;
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
      publishedAt: item.publishedAt, query: item.query,
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
  const marketReferences = references
    .filter((item) => /收盘|盘后|close|closed|涨|跌|surge|plunge|rally|selloff/i.test(`${item.title} ${item.snippet}`))
    .slice(0, 35)
    .map((item) => ({ title: item.title, summary: item.snippet.slice(0, 320), publishedAt: item.publishedAt }));
  if (!marketReferences.length) return { queries: [], receipt: "" };
  const result = await deepSeekJson(apiKey, [
    { role: "system", content: "你是财经行情追因编辑。根据最新收盘与异动摘要，找出尚需追查的具体公司、行业、政策动作或供应链原因，生成最多4条互不重复的搜索查询。不得沿用历史偏好，不得生成泛泛的汇率或宏观查询。只输出JSON：{\"queries\":[\"...\"]}。每条不超过60个字符。" },
    { role: "user", content: `北京时间${new Date().toISOString()}，最新行情证据：${JSON.stringify(marketReferences)}` },
  ]);
  return { queries: [...new Set((result.data.queries || []).map(String).map((item: string) => item.trim()).filter(Boolean))].slice(0, 4), receipt: result.receipt };
}

export async function buildCausalAnalysisTopics(apiKey: string, events: any[]) {
  if (!events.length) return { topics: [], receipt: "" };
  const compactEvents = events.slice(0, 60).map((event) => ({
    eventId: event.id || event.eventId, title: event.title, summary: event.summary || event.thesis,
    occurredAt: event.occurredAt, family: event.family, stage: event.stage, actors: event.actors,
    actions: event.actions, objects: event.objects, sectors: event.sectors, markets: event.markets,
    assets: event.assets, transmission: event.transmission, marketReaction: event.marketReaction,
    sourceCount: event.sourceCount, authorityCount: event.authorityCount,
  }));
  const system = `你是全球资本市场因果分析编辑。输入是已经标准化的今日事件全集。请把“行情事实”和“原因事件”连接成适合深度视频的分析型选题，而不是重新罗列新闻。

先识别 observed events：指数、行业、公司、债券、汇率或商品的实际价格与资金变化；再识别 causal events：政策监管、财报指引、利率流动性、产业供需、资本流向、地缘冲击等。只有满足时间顺序合理、影响对象匹配、存在清晰传导机制时才能连接。一个监管事件可能解释某个细分板块，不得擅自解释整个大盘；相关性不能写成已确认因果。

优先形成“重要行情 + 具体原因 + 可验证机制”的选题。没有充分根因的重大行情保留为 unresolved；没有明显行情但影响重大的原因事件可以单独进入，但marketImportance应较低。禁止给任何特定国家、汇率、行业或用户曾提及事件固定加权。

只输出JSON：{"topics":[{"title":"具体分析命题","observedEventIds":[],"causalEventIds":[],"mechanism":"原因如何传到价格，不超过120字","causality":"confirmed|strong_hypothesis|possible|unresolved","counterEvidence":"最强反证，不超过80字","verificationSignals":[],"markets":[],"marketImportance":0,"explanatoryPower":0,"evidenceStrength":0,"novelty":0,"confidence":0}]}。所有分数0到100，最多输出12个互不重复的分析命题。`;
  const result = await deepSeekJson(apiKey, [
    { role: "system", content: system },
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

export function scoreCausalAnalysisTopic(topic: CausalAnalysisTopic) {
  const causalDepth = topic.causalEventIds.length && topic.mechanism ? topic.explanatoryPower : topic.explanatoryPower * 0.45;
  const causalityFactor = topic.causality === "confirmed" ? 100 : topic.causality === "strong_hypothesis" ? 82 : topic.causality === "possible" ? 60 : 38;
  return Math.round(
    causalDepth * 0.3 + topic.marketImportance * 0.24 + topic.evidenceStrength * 0.18 +
    topic.novelty * 0.12 + causalityFactor * 0.1 + topic.confidence * 0.06,
  );
}

export function scoreSemanticEvent(event: SemanticEvent, evidence: SemanticReference[]) {
  const sources = new Set(evidence.map((item) => item.site || item.url).filter(Boolean));
  const authorityCount = evidence.filter((item) => item.authoritative).length;
  const occurredAt = Date.parse(event.occurredAt || "");
  const fallbackTimes = evidence.map((item) => Date.parse(item.publishedAt)).filter(Number.isFinite);
  const timestamp = Number.isFinite(occurredAt) ? occurredAt : Math.max(...fallbackTimes, Date.now() - 48 * 3_600_000);
  const ageHours = Math.max(0, (Date.now() - timestamp) / 3_600_000);
  const freshness = ageHours <= 6 ? 100 : ageHours <= 24 ? 88 : ageHours <= 48 ? 58 : 0;
  const evidenceQuality = Math.min(100, sources.size * 18 + authorityCount * 16 + event.confidence * 0.35);
  const breadth = Math.min(100, event.markets.length * 18 + event.sectors.length * 10 + event.assets.length * 7);
  const score = Math.round(
    freshness * 0.26 + event.marketReaction * 0.22 + evidenceQuality * 0.2 +
    event.novelty * 0.16 + breadth * 0.1 + event.confidence * 0.06,
  );
  const warnings: string[] = [];
  if (sources.size < 2) warnings.push("独立来源少于2个");
  if (!authorityCount) warnings.push("缺少一级或权威信源");
  if (event.confidence < 60) warnings.push("事件理解置信度偏低");
  if (!event.markets.length && !event.assets.length) warnings.push("尚未识别具体资产映射");
  return { score, ageHours: Math.round(ageHours * 10) / 10, sourceCount: sources.size, authorityCount, warnings };
}
