export const runtime = "edge";

const scanQueries = [
  "今日 A股 港股 美股 科技 半导体 暴涨 暴跌 最新",
  "过去24小时 美股科技股 财报 异动 AI 芯片",
  "今日 微博 抖音 B站 雪球 热议 股票 半导体",
  "today US stocks semiconductors AI earnings surge plunge",
  "今日 A股 消费 红利 政策 盘中 异动",
  "今日 港股 科技 恒生科技 南向资金 异动",
];

const entityGroups = [
  { key: "半导体", terms: ["半导体", "芯片", "英伟达", "台积电", "费城半导体", "光模块", "算力", "存储", "设备"] },
  { key: "AI", terms: ["人工智能", "ai", "大模型", "云计算", "微软", "meta", "谷歌", "openai"] },
  { key: "港股科技", terms: ["恒生科技", "港股科技", "腾讯", "阿里", "美团", "小米"] },
  { key: "消费", terms: ["消费", "白酒", "零售", "免税", "汽车", "家电"] },
  { key: "红利", terms: ["红利", "高股息", "银行", "煤炭", "电力", "运营商"] },
  { key: "宏观政策", terms: ["美联储", "降息", "加息", "关税", "监管", "央行", "财政", "政策"] },
];

const authorityPattern = /reuters|bloomberg|cnbc|wsj|sec\.gov|nasdaq\.com|nyse\.com|财联社|证券时报|上海证券报|中国证券报|交易所|证监会|人民银行|统计局|公司公告/i;
const socialPattern = /weibo|微博|douyin|抖音|bilibili|b站|雪球|xueqiu|reddit|youtube|tiktok|x\.com/i;
const intensityPattern = /暴涨|暴跌|大涨|大跌|涨停|跌停|异动|反弹|跳水|新高|新低|财报|超预期|不及预期|降息|加息|关税|监管|收购|破产|surge|plunge|rally|selloff|earnings|record high/i;

async function search(apiKey: string, query: string, topK = 10) {
  const rawKey = apiKey.trim().replace(/^Bearer\s+/i, "").trim().replace(/^["']|["']$/g, "");
  const qianfanMatch = rawKey.match(/bce-v3\/[A-Za-z0-9._/-]+/);
  const cleanKey = qianfanMatch?.[0] || rawKey.replace(/^(?:API_KEY|BAIDU_API_KEY)\s*=\s*/i, "").trim();
  const body = JSON.stringify({
    messages: [{ role: "user", content: query.slice(0, 72) }],
    edition: "standard",
    search_source: "baidu_search_v2",
    resource_type_filter: [
      { type: "web", top_k: topK },
      { type: "video", top_k: Math.min(5, topK) },
    ],
    search_recency_filter: "week",
    sort: { priority: "auto" },
  });
  const isQianfanV2Key = cleanKey.startsWith("bce-v3/");
  const looksLikeBraveSearchKey = /^bsk/i.test(cleanKey);
  if (looksLikeBraveSearchKey) {
    throw new Error("这个 Key 以 BSK 开头，属于 Brave Search 常见格式，百度千帆无法解析。请在千帆控制台创建并复制完整的 bce-v3/... API Key；不要填写 Access Key / Secret Key。");
  }
  const headerNames = isQianfanV2Key
    ? ["Authorization"]
    : ["X-Appbuilder-Authorization", "Authorization"];
  let lastError = "";
  for (const headerName of headerNames) {
    const response = await fetch("https://qianfan.baidubce.com/v2/ai_search/web_search", {
      method: "POST",
      headers: { [headerName]: `Bearer ${cleanKey}`, "Content-Type": "application/json" },
      body,
    });
    const text = await response.text();
    let payload: any = {};
    try { payload = text ? JSON.parse(text) : {}; } catch {}
    if (response.ok && !payload.code) {
      return { query, requestId: payload.request_id, references: payload.references || payload.data || [] };
    }
    const detail = payload.message || payload.error?.message || text.slice(0, 300) || `百度搜索请求失败（${response.status}）`;
    const credentialType = headerName === "Authorization" ? "千帆 V2 Key" : "AppBuilder Key";
    lastError = `${credentialType} 鉴权失败：${detail}`;
    const authFailure = response.status === 401 || response.status === 403 || /auth|apikey|authorization/i.test(lastError);
    if (!authFailure) break;
  }
  throw new Error(lastError);
}

function scoreReference(reference: any) {
  const text = `${reference.title || ""} ${reference.snippet || reference.abstract || reference.content || ""}`.toLowerCase();
  const url = String(reference.url || "");
  let score = 0;
  if (/今日|最新|刚刚|盘中|盘前|盘后|today|hours? ago/.test(text)) score += 25;
  if (/暴涨|暴跌|大涨|大跌|异动|财报|降息|加息|关税|监管|收购|破产|surge|plunge|earnings/.test(text)) score += 30;
  if (/美股|a股|港股|纳指|标普|半导体|芯片|科技|ai|nasdaq|semiconductor/.test(text)) score += 20;
  if (/微博|抖音|b站|雪球|reddit|youtube|tiktok|x\.com/.test(`${text} ${url}`)) score += 15;
  if (/reuters|bloomberg|cnbc|财联社|证券时报|上证报|交易所|sec\.gov/.test(`${text} ${url}`)) score += 10;
  const publishedAt = parseReferenceDate(reference.date);
  if (publishedAt && Date.now() - publishedAt.getTime() <= 48 * 60 * 60 * 1000) score += 20;
  return Math.min(100, score);
}

function parseReferenceDate(value: unknown) {
  if (!value) return null;
  const normalized = String(value).trim().replace(" ", "T");
  const parsed = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(normalized) ? normalized : `${normalized}+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isFreshReference(reference: any) {
  const date = parseReferenceDate(reference.date);
  return Boolean(date && Date.now() - date.getTime() >= 0 && Date.now() - date.getTime() <= 48 * 60 * 60 * 1000);
}

function referenceText(reference: any) {
  return `${reference.title || ""} ${reference.snippet || reference.abstract || reference.content || ""} ${reference.url || ""}`;
}

function detectMarkets(text: string) {
  const markets: string[] = [];
  if (/美股|纳指|标普|道指|nasdaq|s&p|wall street|英伟达|微软|meta/i.test(text)) markets.push("美股");
  if (/港股|恒生|南向|腾讯|阿里|美团|小米/i.test(text)) markets.push("港股");
  if (/a股|沪指|深成指|创业板|科创板|北向|涨停/i.test(text)) markets.push("A股");
  return markets;
}

function eventKey(reference: any) {
  const text = referenceText(reference).toLowerCase();
  const group = entityGroups.find((item) => item.terms.some((term) => text.includes(term.toLowerCase())));
  if (group) return group.key;
  return String(reference.title || "市场异动").replace(/[，。！？：,.!?\s]/g, "").slice(0, 12);
}

function buildTopicTitle(key: string, markets: string[], leadTitle: string) {
  const cross = markets.length >= 2 ? `${markets.join("、")}正在联动` : `${markets[0] || "资本市场"}出现异动`;
  const templates: Record<string, string> = {
    半导体: `${cross}：半导体这轮行情是趋势确认，还是情绪反弹？`,
    AI: `${cross}：AI交易重新升温，市场真正奖励的是什么？`,
    港股科技: `港股科技出现强信号：会不会继续映射A股与美股科技？`,
    消费: `A股消费突然升温：是政策催化，还是基本面拐点？`,
    红利: `红利资产再度异动：防守交易为什么又回来了？`,
    宏观政策: `${cross}：最新政策信号将如何重估科技与高股息资产？`,
  };
  return templates[key] || `${leadTitle.replace(/[。！!]$/, "")}：这次市场在交易什么？`;
}

function buildTopics(references: any[]) {
  const clusters = new Map<string, any[]>();
  for (const reference of references) {
    const key = eventKey(reference);
    clusters.set(key, [...(clusters.get(key) || []), reference]);
  }
  return [...clusters.entries()].map(([key, items], index) => {
    const ranked = [...items].sort((a, b) => b.score - a.score);
    const allText = ranked.map(referenceText).join(" ");
    const markets = [...new Set(ranked.flatMap((item) => detectMarkets(referenceText(item))))];
    const authorityCount = ranked.filter((item) => authorityPattern.test(referenceText(item))).length;
    const socialCount = ranked.filter((item) => socialPattern.test(referenceText(item))).length;
    const intensityCount = ranked.filter((item) => intensityPattern.test(referenceText(item))).length;
    const sourceHosts = new Set(ranked.map((item) => { try { return new URL(item.url).hostname; } catch { return item.site_name || ""; } }).filter(Boolean));
    const gates = {
      multiSource: sourceHosts.size >= 2,
      authoritative: authorityCount >= 1,
      catalyst: intensityCount >= 1,
      fresh: ranked.some(isFreshReference),
    };
    const passedGateCount = Object.values(gates).filter(Boolean).length;
    const heat = Math.min(100, 42 + Math.min(sourceHosts.size, 6) * 7 + socialCount * 5 + intensityCount * 4);
    const fit = Math.min(100, 58 + markets.length * 9 + (/半导体|AI|港股科技/.test(key) ? 18 : 8));
    const depth = Math.min(100, 55 + markets.length * 10 + Math.min(authorityCount, 3) * 7 + (ranked.length >= 4 ? 8 : 0));
    const score = Math.round(heat * .42 + fit * .30 + depth * .28);
    const allGatesPassed = passedGateCount === 4;
    const status = allGatesPassed && score >= 85 ? "立即做" : allGatesPassed && score >= 75 ? "备选" : "观察";
    const lead = ranked[0];
    return {
      id: index + 1,
      eventKey: key,
      title: buildTopicTitle(key, markets, lead.title || key),
      thesis: `${lead.title || key}。当前聚合 ${sourceHosts.size} 个独立站点、${authorityCount} 个高可信来源${socialCount ? `、${socialCount} 个社交信号` : ""}；核心判断需验证催化能否从${markets.join("向") || "单一市场"}继续扩散。`,
      markets: markets.length ? markets : ["待确认"],
      heat, fit, depth, score, status,
      accent: status === "立即做" ? "violet" : status === "备选" ? "blue" : "amber",
      freshness: "最近 48 小时",
      trigger: lead.title || key,
      gates,
      sourceCount: sourceHosts.size,
      authorityCount,
      socialCount,
      evidence: ranked.slice(0, 5).map((item) => ({ title: item.title, url: item.url, site: item.site_name, score: item.score })),
    };
  }).filter((topic) => topic.sourceCount >= 2 && topic.gates.catalyst)
    .sort((a, b) => (b.status === "立即做" ? 1 : 0) - (a.status === "立即做" ? 1 : 0) || b.score - a.score)
    .slice(0, 6)
    .map((topic, index) => ({ ...topic, id: index + 1 }));
}

export async function POST(request: Request) {
  try {
    const { apiKey, action = "test" } = await request.json();
    if (!apiKey) return Response.json({ error: "请填写百度 WebSearch API Key。" }, { status: 400 });
    if (action === "test") {
      const result = await search(apiKey, "今日全球资本市场热点", 3);
      return Response.json({ ok: true, requestId: result.requestId, resultCount: result.references.length, sample: result.references.slice(0, 3) });
    }
    const batches = await Promise.all(scanQueries.map((query) => search(apiKey, query, 10)));
    const seen = new Set<string>();
    const references = batches.flatMap((batch) => batch.references.map((reference: any) => ({
      ...reference,
      site_name: reference.website || reference.site_name || "",
      query: batch.query,
      score: scoreReference(reference),
    }))).filter((reference: any) => {
      const key = reference.url || reference.title;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a: any, b: any) => b.score - a.score);
    const topics = buildTopics(references);
    return Response.json({
      ok: true,
      scannedAt: new Date().toISOString(),
      queryCount: scanQueries.length,
      references,
      passed: references.filter((item: any) => item.score >= 45),
      topics,
      mainTopicCount: topics.filter((item) => item.status === "立即做").length,
      requestIds: batches.map((batch) => batch.requestId),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "百度搜索连接失败。" }, { status: 502 });
  }
}
