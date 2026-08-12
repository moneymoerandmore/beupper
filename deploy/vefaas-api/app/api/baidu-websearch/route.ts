import { discoveryQueries } from "../../topic-taxonomy";
import { buildCausalAnalysisTopics, deriveMarketFollowUpQueries, scoreCausalAnalysisTopic, scoreSemanticEvent, standardizeFinancialEvents } from "../../hotspot-semantic";

export const runtime = "edge";

const authorityPattern = /reuters|bloomberg|cnbc|wsj|ft\.com|apnews|sec\.gov|fcc\.gov|bis\.gov|commerce\.gov|federalregister\.gov|nasdaq\.com|nyse\.com|fed|treasury|imf|财联社|证券时报|上海证券报|中国证券报|交易所|证监会|人民银行|统计局|公司公告/i;
const socialPattern = /weibo|微博|douyin|抖音|bilibili|b站|雪球|xueqiu|reddit|youtube|tiktok|x\.com/i;
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

function buildScanQueries(now = new Date()) {
  const chinaNow = new Date(now.getTime() + 8 * 3_600_000);
  const chinaDate = `${chinaNow.getUTCFullYear()}年${chinaNow.getUTCMonth() + 1}月${chinaNow.getUTCDate()}日`;
  const nyParts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const nyDate = `${nyParts.find((item) => item.type === "year")?.value}-${nyParts.find((item) => item.type === "month")?.value}-${nyParts.find((item) => item.type === "day")?.value}`;
  return [...new Set(discoveryQueries().map((query) => {
    if (/美股|标普|纳斯达克|道琼斯|wall street|global stocks/i.test(query)) return `${chinaDate} 美东交易日${nyDate} 最新收盘 ${query}`;
    if (chinaNow.getUTCHours() >= 15 && /A股|沪指|上证|深成指|创业板|科创|两市/.test(query)) return `${chinaDate} 今日收盘 收盘后发布 ${query}`;
    return `${chinaDate} 过去48小时 ${query}`;
  }))];
}

function isFreshReference(reference: any) {
  const rawDate = reference.date || reference.published_time || reference.publish_time;
  const date = parseReferenceDate(rawDate);
  if (!date) return false;
  const ageMs = Date.now() - date.getTime();
  if (ageMs < 0 || ageMs > 48 * 3_600_000) return false;
  // 搜索接口偶尔把重新抓取时间当成发布时间。URL 中明确存在旧发布日期时，
  // 以原始文章日期为准，防止 2018 年行情被包装成今天的实时价格。
  const urlDate = parseUrlDate(reference.url);
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

async function throttledSearch(apiKey: string, query: string, previousRequestAt = 0) {
  const gap = Date.now() - previousRequestAt;
  if (gap < 1100) await sleep(1100 - gap);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return { result: await search(apiKey, query), requestedAt: Date.now() }; }
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
    const { apiKey, deepseekApiKey, action = "test" } = await request.json();
    if (!apiKey) return Response.json({ error: "请填写百度 WebSearch API Key。" }, { status: 400 });
    if (action === "test") {
      const result = await search(apiKey, "今日全球资本市场热点", 3);
      return Response.json({ ok: true, requestId: result.requestId, resultCount: result.references.length, sample: result.references.slice(0, 3) });
    }
    if (!deepseekApiKey) return Response.json({ error: "请填写 DeepSeek API Key，用于动态实体、动作提取与事件标准化。" }, { status: 400 });

    const baseQueries = buildScanQueries(); const batches: any[] = []; let previousRequestAt = 0;
    for (const query of baseQueries) {
      const response = await throttledSearch(apiKey, query, previousRequestAt); previousRequestAt = response.requestedAt; batches.push(response.result);
    }
    const firstPass = batches.flatMap((batch, batchIndex) => batch.references.map((reference: any, index: number) => formatReference(reference, batch, batchIndex, index)));
    const firstPassSemantic = firstPass.map((item: any) => ({
      traceId: item.traceId, title: item.title || "", snippet: item.snippet || item.abstract || item.content || "", url: item.url || "",
      site: item.site_name || "", publishedAt: item.date || item.published_time || item.publish_time || "", query: item.query,
      authoritative: authorityPattern.test(referenceText(item)),
    }));
    const followUp = await deriveMarketFollowUpQueries(deepseekApiKey, firstPassSemantic);
    for (const query of followUp.queries.filter((item) => !baseQueries.includes(item))) {
      const response = await throttledSearch(apiKey, query, previousRequestAt); previousRequestAt = response.requestedAt; batches.push(response.result);
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
    }));
    const semantic = await standardizeFinancialEvents(deepseekApiKey, semanticReferences);
    const referenceById = new Map(semanticReferences.map((item) => [item.traceId, item]));
    const ranked = semantic.events.map((event) => {
      const eventEvidence = event.evidenceIds.map((id) => referenceById.get(id)).filter(Boolean) as any[];
      const scoring = scoreSemanticEvent(event, eventEvidence);
      return {
        ...event, ...scoring, thesis: event.summary, category: event.family,
        trigger: [event.actors.join("、"), event.actions.join("、")].filter(Boolean).join(" · ") || event.title,
        socialCount: eventEvidence.filter((item) => socialPattern.test(`${item.url} ${item.site}`)).length,
        heat: event.marketReaction, fit: Math.round((event.novelty + event.confidence) / 2), depth: Math.min(100, event.transmission.length * 18 + event.confidence * 0.6),
        freshness: `${scoring.ageHours}小时前`, gates: { hardGate: true, reasons: scoring.warnings }, rejectionReasons: scoring.warnings,
        evidence: eventEvidence.map((item) => ({
          title: item.title, url: item.url, site: item.site, publishedAt: item.publishedAt,
          snippet: item.snippet, query: item.query, authoritative: item.authoritative, score: 0,
        })),
      };
    }).sort((a, b) => b.score - a.score);
    const events = ranked.map((event, index) => ({ ...event, id: `event-${index + 1}`, rank: index + 1, eligible: true, status: "已发现", eventRole: event.family === "market_move" ? "行情事实" : "原因事件" }));
    const causal = await buildCausalAnalysisTopics(deepseekApiKey, events);
    const eventById = new Map(events.flatMap((event: any) => [[event.id, event], [event.eventId, event]]));
    const topics = causal.topics.map((analysis, index) => {
      const linkedEvents = [...new Set([...analysis.observedEventIds, ...analysis.causalEventIds])]
        .map((id) => eventById.get(id)).filter(Boolean) as any[];
      const evidence = [...new Map(linkedEvents.flatMap((event) => event.evidence || []).map((item: any) => [item.url || item.title, item])).values()];
      const sourceCount = new Set(evidence.map((item: any) => item.site || item.url).filter(Boolean)).size;
      const authorityCount = linkedEvents.reduce((sum, event) => sum + (event.authorityCount || 0), 0);
      const score = scoreCausalAnalysisTopic(analysis);
      return {
        ...analysis, id: index + 1, score, title: analysis.title,
        thesis: `${analysis.mechanism}${analysis.counterEvidence ? ` 反证是：${analysis.counterEvidence}` : ""}`,
        category: "原因分析", markets: analysis.markets, trigger: `${analysis.causality} · ${analysis.verificationSignals.join("、")}`,
        sourceCount, authorityCount, socialCount: linkedEvents.reduce((sum, event) => sum + (event.socialCount || 0), 0),
        heat: analysis.marketImportance, fit: analysis.explanatoryPower, depth: analysis.evidenceStrength,
        freshness: "基于本轮事件全集", gates: { hardGate: true, reasons: [] }, rejectionReasons: [], evidence,
        observedEvents: analysis.observedEventIds, causalEvents: analysis.causalEventIds,
      };
    }).sort((a, b) => b.score - a.score).slice(0, 6).map((topic, index) => ({ ...topic, id: index + 1, status: index < 3 ? "立即做" : "备选" }));
    const eventForEvidence = new Map<string, string>(); events.forEach((event) => event.evidenceIds.forEach((id) => eventForEvidence.set(id, event.eventId)));
    const unclassified = new Set(semantic.unclassifiedEvidenceIds); const retainedIds = new Set(references.map((item: any) => item.traceId));
    const traces = collected.map((item) => ({
      traceId: item.traceId, title: item.title, url: item.url, query: item.query, publishedAt: item.date || item.published_time || item.publish_time || "",
      status: timeFilteredIds.has(item.traceId) ? "time_filtered" : urlDuplicateIds.has(item.traceId) ? "url_duplicate" : deduped.duplicateIds.has(item.traceId) ? "content_duplicate" : unclassified.has(item.traceId) ? "unclassified" : eventForEvidence.has(item.traceId) ? "assigned_to_event" : retainedIds.has(item.traceId) ? "unassigned" : "unknown",
      eventId: eventForEvidence.get(item.traceId) || "",
    }));
    const counts = traces.reduce((acc: any, item: any) => ({ ...acc, [item.status]: (acc[item.status] || 0) + 1 }), {});

    return Response.json({
      ok: true, scannedAt: new Date().toISOString(), queryCount: batches.length, baseQueryCount: baseQueries.length,
      followUpQueryCount: followUp.queries.length, followUpQueries: followUp.queries, references,
      collectedReferenceCount: collected.length, timeFilteredOut: timeFilteredIds.size, timeWindowHours: 48,
      rawReferenceCount: fresh.length, contentDedupCount: references.length, passed: references,
      topics, rejectedTopics: [], events, discoveredEventCount: events.length,
      categoryCoverage: [...new Set(events.map((item) => item.category || "other"))], mainTopicCount: Math.min(3, topics.length),
      semanticReceipts: semantic.receipts, followUpSemanticReceipt: followUp.receipt, causalSemanticReceipt: causal.receipt,
      diagnostics: { traces, counts, unclassifiedEvidenceIds: semantic.unclassifiedEvidenceIds },
      requestIds: batches.map((batch) => batch.requestId),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "热点扫描失败。" }, { status: 502 });
  }
}
