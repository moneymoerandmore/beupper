import { discoveryQueries } from "../../topic-taxonomy";
import { buildCausalAnalysisTopics, deriveCorporateReleaseFollowUpQueries, deriveMarketFollowUpQueries, scoreCausalAnalysisTopic, scoreSemanticEvent, standardizeFinancialEvents } from "../../hotspot-semantic";

export const runtime = "edge";

const authorityPattern = /reuters|bloomberg|cnbc|wsj|ft\.com|apnews|sec\.gov|investor\.|\/ir(?:\/|-)|gcs-web|hkexnews|hkex\.com|sse\.com|szse\.cn|bse\.cn|fcc\.gov|bis\.gov|commerce\.gov|federalregister\.gov|nasdaq\.com|nyse\.com|fed|treasury|imf|财联社|证券时报|上海证券报|中国证券报|交易所|证监会|人民银行|统计局|公司公告/i;
const socialPattern = /twitter|weibo|微博|douyin|抖音|bilibili|b站|雪球|xueqiu|reddit|youtube|tiktok|x\.com/i;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function referenceText(reference: any) {
  return `${reference.title || ""} ${reference.snippet || reference.abstract || reference.content || ""} ${reference.url || ""}`;
}

function parseReferenceDate(value: unknown) {
  if (!value) return null;
  const normalized = String(value).trim().replace(" ", "T");
  const parsed = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(normalized) ? normalized : `${normalized}+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseUrlDate(value: unknown) {
  try {
    const url = new URL(String(value || ""));
    const match = url.pathname.match(/(?:^|\/)(20\d{2})[-_/]?(0[1-9]|1[0-2])[-_/]?([0-2]\d|3[01])(?:\/|[-_.]|$)/);
    if (!match) return null;
    const parsed = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00+08:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch { return null; }
}

function parseInlineDate(reference: any) {
  const text = referenceText(reference);
  const chinaNow = new Date(Date.now() + 8 * 3_600_000);
  const year = chinaNow.getUTCFullYear();
  const full = text.match(/(20\d{2})[年\-/](\d{1,2})[月\-/](\d{1,2})日?/);
  const short = text.match(/(?:^|\D)(\d{1,2})月(\d{1,2})日/);
  const parts = full ? [Number(full[1]), Number(full[2]), Number(full[3])] : short ? [year, Number(short[1]), Number(short[2])] : null;
  if (!parts) return null;
  const parsed = new Date(`${parts[0]}-${String(parts[1]).padStart(2, "0")}-${String(parts[2]).padStart(2, "0")}T12:00:00+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildScanQueries(now = new Date()) {
  const chinaNow = new Date(now.getTime() + 8 * 3_600_000);
  const chinaDate = `${chinaNow.getUTCFullYear()}年${chinaNow.getUTCMonth() + 1}月${chinaNow.getUTCDate()}日`;
  const nyParts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const nyDate = `${nyParts.find((item) => item.type === "year")?.value}-${nyParts.find((item) => item.type === "month")?.value}-${nyParts.find((item) => item.type === "day")?.value}`;
  return [...new Set(discoveryQueries().map((query) => {
    if (/美股|标普|纳斯达克|道琼斯|wall street|global stocks/i.test(query)) return `${chinaDate} 美东交易日${nyDate} 最新收盘 ${query}`;
    if (chinaNow.getUTCHours() >= 15 && /A股|沪指|上证|深成指|创业板|科创|两市/.test(query)) return `${chinaDate} 今日收盘 收盘后发布 ${query}`;
    if (/财报|业绩|公告|披露|盘前盘后|earnings|results|guidance|filing/i.test(query)) return `${chinaDate} 刚刚 今日最新 ${query}`;
    return `${chinaDate} 过去48小时 ${query}`;
  }))];
}

function isFreshReference(reference: any) {
  const rawDate = reference.date || reference.published_time || reference.publish_time;
  const urlDate = parseUrlDate(reference.url);
  const date = parseReferenceDate(rawDate) || urlDate || parseInlineDate(reference);
  if (!date) return false;
  const ageMs = Date.now() - date.getTime();
  if (ageMs < 0 || ageMs > 48 * 3_600_000) return false;
  // 搜索接口偶尔把重新抓取时间当成发布时间。URL 中明确存在旧发布日期时，
  // 以原始文章日期为准，防止 2018 年行情被包装成今天的实时价格。
  if (urlDate) {
    const urlAgeMs = Date.now() - urlDate.getTime();
    if (urlAgeMs < 0 || urlAgeMs > 48 * 3_600_000) return false;
    if (Math.abs(date.getTime() - urlDate.getTime()) > 72 * 3_600_000) return false;
  }
  const query = String(reference.query || "");
  const chinaNow = new Date(Date.now() + 8 * 3_600_000);
  const chinaPublished = new Date(date.getTime() + 8 * 3_600_000);
  const sameChinaDate = chinaPublished.getUTCFullYear() === chinaNow.getUTCFullYear()
    && chinaPublished.getUTCMonth() === chinaNow.getUTCMonth()
    && chinaPublished.getUTCDate() === chinaNow.getUTCDate();
  if (/今日收盘|收盘后发布/.test(query) && !sameChinaDate) return false;
  const usSession = query.match(/美东交易日(\d{4}-\d{2}-\d{2})/);
  if (usSession && !sameChinaDate && !String(rawDate).startsWith(usSession[1])) return false;
  return true;
}

// 财报预告通常提前数日发布。它不能直接进入“今日事件全集”，但可以作为
// 今日公司名单的发现种子，触发对正式财报、电话会和价格反应的二次核验。
function isCorporateCalendarSeed(reference: any) {
  const query = String(reference.query || "");
  const text = referenceText(reference);
  if (!/财报日历|业绩发布时间|earnings calendar|reporting before open|after close/i.test(query)) return false;
  if (!/财报|业绩|earnings|results|report|conference call/i.test(text)) return false;
  const date = parseReferenceDate(reference.date || reference.published_time || reference.publish_time) || parseUrlDate(reference.url) || parseInlineDate(reference);
  if (!date) return false;
  const ageMs = Date.now() - date.getTime();
  return ageMs >= 0 && ageMs <= 14 * 24 * 3_600_000;
}

function freshnessForAge(ageHours: number) {
  return ageHours <= 2 ? 100 : ageHours <= 8 ? 94 : ageHours <= 24 ? 70 : ageHours <= 48 ? 28 : 0;
}

function freshnessLane(ageHours: number) {
  return ageHours <= 2 ? "breaking_2h" : ageHours <= 8 ? "current_session_8h" : ageHours <= 24 ? "today_24h" : "background_48h";
}

function standaloneAnalysisForEvent(event: any) {
  const headline = String(event.title || "重要财经事件").replace(/[。？！?!]+$/g, "");
  const isCorporate = event.family === "corporate" || /财报|业绩|盈利|指引|公告|披露|回购|分红|earnings|guidance/i.test(`${event.title} ${event.summary} ${(event.actions || []).join(" ")}`);
  const isMarketMove = event.family === "market_move";
  const title = isCorporate
    ? `${headline}：本股估值要重算吗？`
    : isMarketMove ? `${headline}之后，行情还能延续吗？` : `${headline}之后，市场在重估什么？`;
  const evidenceStrength = Math.min(100, (event.sourceCount || 0) * 18 + (event.authorityCount || 0) * 16 + (event.confidence || 0) * 0.35);
  return {
    title, observedEventIds: isMarketMove ? [event.id] : [], causalEventIds: isMarketMove ? [] : [event.id],
    mechanism: `${event.summary || event.thesis || event.title} ${isCorporate ? "重点判断盈利预期、估值锚与本股价格是否已经充分反映。" : "重点判断影响资产、传导路径和后续价格验证。"}`.slice(0, 120),
    causality: "possible" as const, counterEvidence: "",
    verificationSignals: isCorporate
      ? ["本股价格与成交反应", "盈利预期与估值变化", "管理层后续指引"]
      : ["相关资产价格反应", "成交与资金持续性", "后续官方信息"],
    markets: event.markets || [], marketImportance: Math.max(event.marketReaction || 0, isCorporate ? 58 : 50),
    explanatoryPower: Math.max(event.fit || 0, 64), evidenceStrength,
    novelty: event.novelty || 0, confidence: event.confidence || 0,
    searchDemand: Math.min(100, (event.ageHours <= 8 ? 35 : 10) + (isCorporate ? 30 : 10) + (event.marketReaction || 0) * 0.25),
    stakeholderConflict: isCorporate ? 65 : isMarketMove ? 45 : 35,
    entitySpecificity: (event.actors || []).length || (event.assets || []).length ? 75 : 40,
    timelinessOpportunity: freshnessForAge(event.ageHours ?? 48),
    discoveryLane: isCorporate ? "dual" as const : "recommendation" as const,
  };
}

async function search(apiKey: string, query: string, topK = 10) {
  const rawKey = apiKey.trim().replace(/^Bearer\s+/i, "").replace(/^["']|["']$/g, "");
  const qianfanMatch = rawKey.match(/bce-v3\/[A-Za-z0-9._/-]+/);
  const cleanKey = qianfanMatch?.[0] || rawKey.replace(/^(?:API_KEY|BAIDU_API_KEY)\s*=\s*/i, "").trim();
  if (/^bsk/i.test(cleanKey)) throw new Error("BSK Key 不能用于百度千帆，请填写完整的 bce-v3/... Key。");
  const body = JSON.stringify({
    messages: [{ role: "user", content: query.slice(0, 72) }],
    edition: "standard", search_source: "baidu_search_v2",
    resource_type_filter: [{ type: "web", top_k: topK }, { type: "video", top_k: Math.min(5, topK) }],
    search_recency_filter: "week", sort: { priority: "auto" },
  });
  const headerNames = cleanKey.startsWith("bce-v3/") ? ["Authorization"] : ["X-Appbuilder-Authorization", "Authorization"];
  let lastError = "";
  for (const headerName of headerNames) {
    const response = await fetch("https://qianfan.baidubce.com/v2/ai_search/web_search", {
      method: "POST", headers: { [headerName]: `Bearer ${cleanKey}`, "Content-Type": "application/json" }, body,
      signal: AbortSignal.timeout(25_000),
    });
    const text = await response.text();
    let payload: any = {};
    try { payload = text ? JSON.parse(text) : {}; } catch {}
    if (response.ok && !payload.code) return { query, requestId: payload.request_id, references: payload.references || payload.data || [] };
    lastError = `千帆 V2 Key 请求失败：${payload.message || payload.error?.message || text.slice(0, 300) || response.status}`;
    if (![401, 403].includes(response.status)) break;
  }
  throw new Error(lastError);
}

async function throttledSearch(apiKey: string, query: string, previousRequestAt = 0, topK = 10) {
  const gap = Date.now() - previousRequestAt;
  if (gap < 1100) await sleep(1100 - gap);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return { result: await search(apiKey, query, topK), requestedAt: Date.now() }; }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/qps|rate.?limit|429|too many|频率|并发/i.test(message) || attempt === 2) throw error;
      await sleep(3000 * (attempt + 1));
    }
  }
  throw new Error("百度搜索请求未完成");
}

function normalize(value: string) { return String(value || "").replace(/<[^>]+>/g, "").replace(/[\s\u3000]+/g, "").toLowerCase(); }
function bigrams(value: string) { const text = normalize(value); return text.length < 2 ? [text] : Array.from({ length: text.length - 1 }, (_, index) => text.slice(index, index + 2)); }
function similarity(left: string, right: string) {
  const a = new Set(bigrams(left)); const b = new Set(bigrams(right));
  const intersection = [...a].filter((item) => b.has(item)).length;
  return intersection / Math.max(1, a.size + b.size - intersection);
}

function contentDeduplicate(references: any[]) {
  const kept: any[] = []; const duplicateIds = new Set<string>();
  for (const reference of references) {
    const text = `${reference.title || ""}${reference.snippet || reference.abstract || reference.content || ""}`;
    const duplicate = kept.find((item) => similarity(text, `${item.title || ""}${item.snippet || item.abstract || item.content || ""}`) >= 0.72);
    if (duplicate) duplicateIds.add(reference.traceId); else kept.push(reference);
  }
  return { kept, duplicateIds };
}

function formatReference(reference: any, batch: any, batchIndex: number, referenceIndex: number) {
  return {
    ...reference, traceId: `ref-${batchIndex + 1}-${referenceIndex + 1}`,
    site_name: reference.website || reference.site_name || "", query: batch.query,
  };
}

export async function POST(request: Request) {
  try {
    const { apiKey, deepseekApiKey, xueqiuCookie = "", twitterAuthToken = "", twitterCt0 = "", action = "test" } = await request.json();
    if (!apiKey) return Response.json({ error: "请填写百度 WebSearch API Key。" }, { status: 400 });
    if (action === "test") {
      const result = await search(apiKey, "今日全球资本市场热点", 3);
      return Response.json({ ok: true, requestId: result.requestId, resultCount: result.references.length, sample: result.references.slice(0, 3) });
    }
    if (!deepseekApiKey) return Response.json({ error: "请填写 DeepSeek API Key，用于动态实体、动作提取与事件标准化。" }, { status: 400 });

    const baseQueries = buildScanQueries(); const batches: any[] = []; let previousRequestAt = 0;
    for (const query of baseQueries) {
      const calendarQuery = /财报日历|业绩发布时间|earnings calendar|reporting before open|after close/i.test(query);
      const response = await throttledSearch(apiKey, query, previousRequestAt, calendarQuery ? 20 : 10); previousRequestAt = response.requestedAt; batches.push(response.result);
    }
    const firstPass = batches.flatMap((batch, batchIndex) => batch.references.map((reference: any, index: number) => formatReference(reference, batch, batchIndex, index)));
    const firstPassSeeds = firstPass.filter((item) => isFreshReference(item) || isCorporateCalendarSeed(item));
    const firstPassSemantic = firstPassSeeds.map((item: any) => ({
      traceId: item.traceId, title: item.title || "", snippet: item.snippet || item.abstract || item.content || "", url: item.url || "",
      site: item.site_name || "", publishedAt: item.date || item.published_time || item.publish_time || "", query: item.query,
      authoritative: authorityPattern.test(referenceText(item)),
      social: socialPattern.test(referenceText(item)),
    }));
    const [corporateFollowUp, followUp] = await Promise.all([
      deriveCorporateReleaseFollowUpQueries(deepseekApiKey, firstPassSemantic),
      deriveMarketFollowUpQueries(deepseekApiKey, firstPassSemantic),
    ]);
    const allFollowUpQueries: string[] = [...new Set<string>([...corporateFollowUp.queries, ...followUp.queries].map(String))];
    for (const query of allFollowUpQueries.filter((item) => !baseQueries.includes(item))) {
      const response = await throttledSearch(apiKey, query, previousRequestAt); previousRequestAt = response.requestedAt; batches.push(response.result);
    }
    let socialChannels: any = { xueqiu: { ok: false, count: 0, error: "未执行" }, twitter: { ok: false, count: 0, error: "未执行" } };
    // The scan only samples discussion for discovery/heat. The selected event
    // receives a full, frozen social-evidence refresh in the research stage.
    const socialQueries = allFollowUpQueries.filter((item) => /雪球|twitter|x\/twitter|投资者讨论|分歧|热议/i.test(item)).slice(0, 3);
    // Browser sessions live in the local gateway. Manual credentials are only
    // a backward-compatible fallback and must not gate social recall.
    if (socialQueries.length) {
      try {
        const socialResponse = await fetch("http://127.0.0.1:4318/api/social-search", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ queries: socialQueries, xueqiuCookie, twitterAuthToken, twitterCt0 }),
          signal: AbortSignal.timeout(60_000),
        });
        const socialPayload: any = await socialResponse.json();
        if (socialResponse.ok && socialPayload.ok) {
          socialChannels = socialPayload.channels || socialChannels;
          if (socialPayload.references?.length) batches.push({ query: "Agent-Reach社交直连", requestId: "social-local", references: socialPayload.references });
        } else socialChannels = { ...socialChannels, gatewayError: socialPayload.error || `HTTP ${socialResponse.status}` };
      } catch (error) {
        socialChannels = { ...socialChannels, gatewayError: error instanceof Error ? error.message : String(error) };
      }
    }

    const collected = batches.flatMap((batch, batchIndex) => batch.references.map((reference: any, index: number) => formatReference(reference, batch, batchIndex, index)));
    const fresh = collected.filter(isFreshReference); const timeFilteredIds = new Set(collected.filter((item) => !isFreshReference(item)).map((item) => item.traceId));
    const seenUrls = new Set<string>(); const urlDuplicateIds = new Set<string>();
    const urlUnique = fresh.filter((item) => { const key = item.url || item.title; if (!key || seenUrls.has(key)) { urlDuplicateIds.add(item.traceId); return false; } seenUrls.add(key); return true; });
    const deduped = contentDeduplicate(urlUnique); const references = deduped.kept;
    const semanticReferences = references.map((item: any) => ({
      traceId: item.traceId, title: item.title || "", snippet: item.snippet || item.abstract || item.content || "", url: item.url || "",
      site: item.site_name || "", publishedAt: item.date || item.published_time || item.publish_time || "", query: item.query,
      authoritative: authorityPattern.test(referenceText(item)),
      social: socialPattern.test(referenceText(item)),
    }));
    const semantic = await standardizeFinancialEvents(deepseekApiKey, semanticReferences);
    const referenceById = new Map(semanticReferences.map((item) => [item.traceId, item]));
    const ranked = semantic.events.map((event: any) => {
      const eventEvidence = event.evidenceIds.map((id: string) => referenceById.get(id)).filter(Boolean) as any[];
      const scoring = scoreSemanticEvent(event, eventEvidence);
      return {
        ...event, ...scoring, thesis: event.summary, category: event.family,
        trigger: [event.actors.join("、"), event.actions.join("、")].filter(Boolean).join(" · ") || event.title,
        socialCount: eventEvidence.filter((item) => socialPattern.test(`${item.url} ${item.site}`)).length,
        heat: event.marketReaction, fit: Math.round((event.novelty + event.confidence) / 2), depth: Math.min(100, event.transmission.length * 18 + event.confidence * 0.6),
        freshness: `${scoring.ageHours}小时前`, freshnessScore: freshnessForAge(scoring.ageHours), freshnessLane: freshnessLane(scoring.ageHours),
        gates: { hardGate: true, reasons: scoring.warnings }, rejectionReasons: scoring.warnings,
        evidence: eventEvidence.map((item) => ({
          title: item.title, url: item.url, site: item.site, publishedAt: item.publishedAt,
          snippet: item.snippet, query: item.query, authoritative: item.authoritative, social: Boolean(item.social), score: 0,
        })),
      };
    }).sort((a: any, b: any) => b.score - a.score);
    const events = ranked.map((event: any, index: number) => ({ ...event, id: `event-${index + 1}`, rank: index + 1, eligible: true, status: "已发现", eventRole: event.family === "market_move" ? "行情事实" : "原因事件" }));
    const causal = await buildCausalAnalysisTopics(deepseekApiKey, events);
    const eventById = new Map(events.flatMap((event: any) => [[event.id, event], [event.eventId, event]]));
    const augmentedAnalyses = [...causal.topics];
    const modelCoveredEventIds = new Set(causal.topics.flatMap((topic) => [...topic.observedEventIds, ...topic.causalEventIds]));
    const recentCorporateEvents = events.filter((event: any) =>
      event.ageHours <= 8 && (event.family === "corporate" || /财报|业绩|盈利|指引|earnings|results|guidance/i.test(`${event.title} ${event.summary}`)),
    ).slice(0, 4);
    const protectedEvents = [...new Map([...events.slice(0, 8), ...recentCorporateEvents].map((event: any) => [event.id, event])).values()];
    for (const event of protectedEvents) {
      if (!modelCoveredEventIds.has(event.id) && !modelCoveredEventIds.has(event.eventId)) augmentedAnalyses.push(standaloneAnalysisForEvent(event));
    }
    const topicCandidates = augmentedAnalyses.map((analysis, index) => {
      const linkedEvents = [...new Set([...analysis.observedEventIds, ...analysis.causalEventIds])]
        .map((id) => eventById.get(id)).filter(Boolean) as any[];
      const evidence = [...new Map(linkedEvents.flatMap((event) => event.evidence || []).map((item: any) => [item.url || item.title, item])).values()];
      const sourceCount = new Set(evidence.map((item: any) => item.site || item.url).filter(Boolean)).size;
      const authorityCount = linkedEvents.reduce((sum, event) => sum + (event.authorityCount || 0), 0);
      const latestAgeHours = linkedEvents.length ? Math.min(...linkedEvents.map((event: any) => Number(event.ageHours ?? 48))) : 48;
      const topicFreshnessScore = freshnessForAge(latestAgeHours);
      const score = scoreCausalAnalysisTopic(analysis, topicFreshnessScore);
      return {
        ...analysis, id: index + 1, score, title: analysis.title,
        thesis: `${analysis.mechanism}${analysis.counterEvidence ? ` 反证是：${analysis.counterEvidence}` : ""}`,
        category: "原因分析", markets: analysis.markets, trigger: `${analysis.causality} · ${analysis.verificationSignals.join("、")}`,
        sourceCount, authorityCount, socialCount: linkedEvents.reduce((sum, event) => sum + (event.socialCount || 0), 0),
        heat: Math.round(analysis.marketImportance * 0.55 + analysis.searchDemand * 0.45),
        fit: Math.round(analysis.explanatoryPower * 0.6 + analysis.stakeholderConflict * 0.25 + analysis.entitySpecificity * 0.15),
        depth: analysis.evidenceStrength,
        searchDemand: analysis.searchDemand, stakeholderConflict: analysis.stakeholderConflict,
        entitySpecificity: analysis.entitySpecificity, timelinessOpportunity: analysis.timelinessOpportunity,
        discoveryLane: analysis.discoveryLane,
        freshness: `${latestAgeHours}小时前最新动作`, ageHours: latestAgeHours, freshnessScore: topicFreshnessScore, freshnessLane: freshnessLane(latestAgeHours),
        gates: { hardGate: true, reasons: [] }, rejectionReasons: [], evidence,
        observedEvents: analysis.observedEventIds, causalEvents: analysis.causalEventIds,
      };
    }).sort((a, b) => b.score - a.score);
    const selectedTopics: any[] = [];
    const requiredTitles = new Set<string>();
    for (const event of protectedEvents) {
      const candidate = topicCandidates.find((topic) => [...topic.observedEvents, ...topic.causalEvents].some((id: string) => id === event.id || id === event.eventId));
      if (candidate && !selectedTopics.some((topic) => topic.title === candidate.title)) {
        selectedTopics.push(candidate);
        requiredTitles.add(candidate.title);
      }
    }
    for (const candidate of topicCandidates) {
      if (selectedTopics.length >= 10) break;
      if (!selectedTopics.some((topic) => topic.title === candidate.title)) selectedTopics.push(candidate);
    }
    selectedTopics.sort((a, b) => b.score - a.score);
    // 刚发布的公司财报不应因为美股尚未开盘、市场反应分暂时为零而消失。
    // 最多保护三个不同公司的财报题；它们仍按事件证据和时效排序，不固定任何公司名单。
    const recentCorporateTopics = recentCorporateEvents
      .map((event: any) => topicCandidates.find((topic) => [...topic.observedEvents, ...topic.causalEvents].some((id: string) => id === event.id || id === event.eventId)))
      .filter(Boolean)
      .filter((topic: any, index: number, list: any[]) => list.findIndex((item: any) => item.title === topic.title) === index)
      .slice(0, 3);
    for (const corporateTopic of recentCorporateTopics) {
      if (selectedTopics.some((topic) => topic.title === corporateTopic.title)) continue;
      const replaceAt = [...selectedTopics].reverse().findIndex((topic) => !requiredTitles.has(topic.title));
      if (replaceAt >= 0) selectedTopics.splice(selectedTopics.length - 1 - replaceAt, 1, corporateTopic);
      else if (selectedTopics.length < 10) selectedTopics.push(corporateTopic);
      requiredTitles.add(corporateTopic.title);
    }
    const freshTopics = topicCandidates.filter((topic) => topic.ageHours <= 8);
    if (freshTopics.length && !selectedTopics.slice(0, 5).some((topic) => topic.ageHours <= 8)) {
      const fresh = freshTopics[0];
      const existing = selectedTopics.findIndex((topic) => topic.title === fresh.title);
      if (existing >= 0) {
        selectedTopics.splice(existing, 1);
        selectedTopics.splice(Math.min(4, selectedTopics.length), 0, fresh);
      } else {
        const replaceAt = [...selectedTopics].reverse().findIndex((topic) => !requiredTitles.has(topic.title));
        if (replaceAt >= 0) selectedTopics.splice(selectedTopics.length - 1 - replaceAt, 1, fresh);
      }
    }
    const desiredFreshCount = Math.min(2, freshTopics.length);
    for (const fresh of freshTopics) {
      if (selectedTopics.filter((topic) => topic.ageHours <= 8).length >= desiredFreshCount) break;
      if (selectedTopics.some((topic) => topic.title === fresh.title)) continue;
      const replaceAt = [...selectedTopics].reverse().findIndex((topic) => topic.ageHours > 8 && !requiredTitles.has(topic.title));
      if (replaceAt >= 0) selectedTopics.splice(selectedTopics.length - 1 - replaceAt, 1, fresh);
    }
    const topics = selectedTopics.slice(0, 10).map((topic, index) => ({ ...topic, id: index + 1, status: index < 5 ? "立即做" : "备选" }));
    const topicCoverage = new Map<string, number>();
    for (const topic of topics) for (const id of [...topic.observedEvents, ...topic.causalEvents]) topicCoverage.set(id, (topicCoverage.get(id) || 0) + 1);
    for (const event of events) {
      const count = [...new Set([event.id, event.eventId])].reduce((sum, id) => sum + (topicCoverage.get(id) || 0), 0);
      event.topicCount = count;
      event.status = count ? "已进入高潜选题" : "已发现，未进入高潜";
    }
    const eventForEvidence = new Map<string, string>(); events.forEach((event: any) => event.evidenceIds.forEach((id: string) => eventForEvidence.set(id, event.eventId)));
    const unclassified = new Set(semantic.unclassifiedEvidenceIds); const retainedIds = new Set(references.map((item: any) => item.traceId));
    const traces = collected.map((item) => ({
      traceId: item.traceId, title: item.title, url: item.url, query: item.query, publishedAt: item.date || item.published_time || item.publish_time || "",
      status: timeFilteredIds.has(item.traceId) ? "time_filtered" : urlDuplicateIds.has(item.traceId) ? "url_duplicate" : deduped.duplicateIds.has(item.traceId) ? "content_duplicate" : unclassified.has(item.traceId) ? "unclassified" : eventForEvidence.has(item.traceId) ? "assigned_to_event" : retainedIds.has(item.traceId) ? "unassigned" : "unknown",
      eventId: eventForEvidence.get(item.traceId) || "",
    }));
    const counts = traces.reduce((acc: any, item: any) => ({ ...acc, [item.status]: (acc[item.status] || 0) + 1 }), {});

    const freshnessBuckets = events.reduce((acc: Record<string, number>, event: any) => {
      acc[event.freshnessLane] = (acc[event.freshnessLane] || 0) + 1; return acc;
    }, { breaking_2h: 0, current_session_8h: 0, today_24h: 0, background_48h: 0 });
    const latestByMarket = events.reduce((acc: Record<string, any>, event: any) => {
      for (const market of event.markets || []) {
        if (!acc[market] || event.ageHours < acc[market].ageHours) acc[market] = { title: event.title, ageHours: event.ageHours, occurredAt: event.occurredAt };
      }
      return acc;
    }, {});

    return Response.json({
      ok: true, scannedAt: new Date().toISOString(), queryCount: batches.length, baseQueryCount: baseQueries.length,
      followUpQueryCount: allFollowUpQueries.length, followUpQueries: allFollowUpQueries, references,
      collectedReferenceCount: collected.length, timeFilteredOut: timeFilteredIds.size, timeWindowHours: 48,
      rawReferenceCount: fresh.length, contentDedupCount: references.length, passed: references,
      topics, rejectedTopics: [], events, discoveredEventCount: events.length,
      categoryCoverage: [...new Set(events.map((item: any) => item.category || "other"))], mainTopicCount: Math.min(5, topics.length),
      semanticReceipts: semantic.receipts, followUpSemanticReceipt: [corporateFollowUp.receipt, followUp.receipt].filter(Boolean).join(","), causalSemanticReceipt: causal.receipt,
      diagnostics: {
        traces, counts, freshnessBuckets, latestByMarket,
        calendarSeedCount: firstPass.filter(isCorporateCalendarSeed).length,
        corporateCalendarCompanies: corporateFollowUp.companies,
        recentCorporateEventCount: recentCorporateEvents.length,
        socialReferenceCount: semanticReferences.filter((item) => item.social).length,
        socialChannels,
        extendedHoursReferenceCount: semanticReferences.filter((item) => /盘前|盘后|premarket|pre-market|after.hours|extended.hours/i.test(`${item.title} ${item.snippet} ${item.query}`)).length,
        unclassifiedEvidenceIds: semantic.unclassifiedEvidenceIds,
      },
      requestIds: batches.map((batch) => batch.requestId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "热点扫描失败。";
    const timedOut = /timeout|timed out|abort/i.test(message) || (error instanceof Error && error.name === "TimeoutError");
    return Response.json({
      error: timedOut ? "热点扫描的外部数据源超过阶段时限，本轮已停止，避免页面无限等待。请稍后重试；已保存的上一次扫描不会被覆盖。" : message,
    }, { status: timedOut ? 504 : 502 });
  }
}
