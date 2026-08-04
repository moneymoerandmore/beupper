import { classifyDomains, discoveryQueries, marketDomains } from "../../topic-taxonomy";
import { rankTopic } from "../../topic-engine";

export const runtime = "edge";

// 广度来自互不相同的市场入口，而不是把同一查询机械扩成三个近义版本。
// 查询带北京时间当天日期；A股收盘后明确要求当天收盘稿，避免昨天复盘占据首位。
function buildScanQueries(now = new Date()) {
  const chinaNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const dateLabel = `${chinaNow.getUTCFullYear()}年${chinaNow.getUTCMonth() + 1}月${chinaNow.getUTCDate()}日`;
  const afterAShareClose = chinaNow.getUTCHours() >= 15;
  return [...new Set(discoveryQueries().map((query) => {
    const aShareCloseIntent = afterAShareClose && /A股|沪指|上证|深成指|创业板|科创|两市/.test(query);
    return `${dateLabel} ${query} ${aShareCloseIntent ? "今日收盘 收盘后发布" : "过去48小时"}`;
  }))];
}

const entityGroups = [
  { key: "A股行情", terms: ["A股", "沪指", "上证指数", "深成指", "创业板", "科创50", "两市成交", "涨停", "跌停"] },
  { key: "港股行情", terms: ["港股", "恒生指数", "恒生科技", "国企指数", "南向资金", "港股通"] },
  { key: "美股行情", terms: ["美股", "标普500", "纳斯达克", "纳指", "道琼斯", "费城半导体", "罗素2000"] },
  { key: "半导体", terms: ["半导体", "芯片", "英伟达", "台积电", "费城半导体", "光模块", "算力", "存储", "设备"] },
  { key: "AI", terms: ["人工智能", "ai", "大模型", "云计算", "微软", "meta", "谷歌", "openai"] },
  { key: "港股科技", terms: ["恒生科技", "港股科技", "腾讯", "阿里", "美团", "小米"] },
  { key: "消费", terms: ["消费", "白酒", "零售", "免税", "汽车", "家电"] },
  { key: "红利", terms: ["红利", "高股息", "银行", "煤炭", "电力", "运营商"] },
  { key: "宏观政策", terms: ["美联储", "降息", "加息", "关税", "监管", "央行", "财政", "政策"] },
];

const authorityPattern = /reuters|bloomberg|cnbc|wsj|ft\.com|apnews|sec\.gov|nasdaq\.com|nyse\.com|boj\.or\.jp|mof\.go\.jp|fed|treasury|imf|财经|财联社|证券时报|上海证券报|中国证券报|交易所|证监会|人民银行|统计局|公司公告|日本银行|日本财务省/i;
const socialPattern = /weibo|微博|douyin|抖音|bilibili|b站|雪球|xueqiu|reddit|youtube|tiktok|x\.com/i;
const intensityPattern = /暴涨|暴跌|大涨|大跌|涨停|跌停|异动|反弹|跳水|新高|新低|干预|联合干预|汇率询价|官方确认|政策转向|财报|超预期|不及预期|降息|加息|降准|关税|制裁|监管|收购|破产|surge|plunge|rally|selloff|intervention|rate check|earnings|record high/i;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function search(apiKey: string, query: string, topK = 50) {
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
    // web_search 当前只稳定接受 week/month/semiyear/year；精确48小时在召回后本地硬过滤。
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

async function throttledSearch(apiKey: string, query: string, topK = 50, previousRequestAt = 0) {
  const gap = Date.now() - previousRequestAt;
  if (gap < 1100) await sleep(1100 - gap);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return { result: await search(apiKey, query, topK), requestedAt: Date.now() };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const rateLimited = /qps|rate.?limit|429|too many|频率|并发/i.test(message);
      if (!rateLimited || attempt === 2) throw error;
      await sleep(3000 * (attempt + 1));
    }
  }
  throw new Error("百度搜索请求未完成。");
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
  const publishedAt = parseReferenceDate(reference.date || reference.published_time || reference.publish_time);
  if (publishedAt) {
    const ageHours = (Date.now() - publishedAt.getTime()) / 3_600_000;
    if (ageHours >= 0 && ageHours <= 6) score += 35;
    else if (ageHours <= 24) score += 24;
    else if (ageHours <= 48) score += 8;
  }
  return Math.min(100, score);
}

function parseReferenceDate(value: unknown) {
  if (!value) return null;
  const normalized = String(value).trim().replace(" ", "T");
  const parsed = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(normalized) ? normalized : `${normalized}+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isFreshReference(reference: any) {
  const date = parseReferenceDate(reference.date || reference.published_time || reference.publish_time);
  if (!date) return false;
  const ageMs = Date.now() - date.getTime();
  if (ageMs < 0 || ageMs > 48 * 60 * 60 * 1000) return false;
  const chinaNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const afterAShareClose = chinaNow.getUTCHours() >= 15;
  const isAShareCloseQuery = /A股|沪指|上证|深成指|创业板|科创|两市/.test(reference.query || "") && /今日收盘|收盘后发布/.test(reference.query || "");
  if (afterAShareClose && isAShareCloseQuery) {
    const chinaPublished = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    const sameChinaDate = chinaPublished.getUTCFullYear() === chinaNow.getUTCFullYear()
      && chinaPublished.getUTCMonth() === chinaNow.getUTCMonth()
      && chinaPublished.getUTCDate() === chinaNow.getUTCDate();
    if (!sameChinaDate) return false;
  }
  return true;
}

function referenceText(reference: any) {
  return `${reference.title || ""} ${reference.snippet || reference.abstract || reference.content || ""} ${reference.url || ""}`;
}

// FinanceMCP 的核心去重链路：标题+摘要归一化后，用二元组 Jaccard 判断同一新闻的不同转载。
function normalizeNewsText(value: string) {
  return String(value || "").replace(/<[^>]+>/g, "").replace(/[\s\u3000]+/g, "").toLowerCase();
}

function bigrams(value: string) {
  const text = normalizeNewsText(value);
  const grams: string[] = [];
  for (let i = 0; i < text.length - 1; i += 1) grams.push(text.slice(i, i + 2));
  return grams.length ? grams : text ? [text] : [];
}

function jaccardSimilarity(left: string[], right: string[]) {
  const a = new Set(left);
  const b = new Set(right);
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union ? intersection / union : 0;
}

function financeMcpDeduplicate(references: any[], threshold = 0.8) {
  const representatives: any[] = [];
  for (const reference of references) {
    const content = `${reference.title || ""}\n${reference.snippet || reference.abstract || reference.content || ""}`;
    const grams = bigrams(content);
    const duplicate = representatives.find((representative) => {
      const representativeContent = `${representative.title || ""}\n${representative.snippet || representative.abstract || representative.content || ""}`;
      return jaccardSimilarity(grams, bigrams(representativeContent)) >= threshold;
    });
    if (duplicate) {
      duplicate.duplicateCount = (duplicate.duplicateCount || 1) + 1;
      duplicate.relatedSources = [...new Set([...(duplicate.relatedSources || []), reference.website || reference.site_name || reference.url].filter(Boolean))];
    } else {
      representatives.push({ ...reference, duplicateCount: 1, relatedSources: [reference.website || reference.site_name || reference.url].filter(Boolean) });
    }
  }
  return representatives;
}

const genericTerms = new Set(["央行", "政策", "市场", "股市", "最新", "全球", "影响", "今日", "消息", "经济"]);

function primaryDomain(text: string) {
  const lower = text.toLowerCase();
  return [...classifyDomains(text)].sort((a, b) => {
    const aSpecific = a.terms.filter((term) => term.length >= 3 && !genericTerms.has(term) && lower.includes(term.toLowerCase())).length;
    const bSpecific = b.terms.filter((term) => term.length >= 3 && !genericTerms.has(term) && lower.includes(term.toLowerCase())).length;
    return bSpecific - aSpecific;
  })[0];
}

function eventFingerprint(reference: any) {
  const text = referenceText(reference);
  const lower = text.toLowerCase();
  const domain = primaryDomain(text);
  const isYenIntervention = /美元|日元|美元兑日元|美元日元|yen|usd\/jpy|日本/.test(lower)
    && /干预|联合干预|汇率询价|财政部|财务省|treasury|bessent|贝森特|intervention|rate check/.test(lower);
  if (isYenIntervention) return "fx_intervention:us-japan-yen";
  if (/日本央行|boj|植田|ueda/.test(lower)) return "monetary_policy:boj";
  if (/美联储|fomc|fed|powell|鲍威尔/.test(lower)) return "monetary_policy:fed";
  if (/中国人民银行|央行|pboc|mlf|逆回购|降准|lpr/.test(lower) && /利率|降息|降准|流动性|资金面/.test(lower)) return "monetary_policy:pboc";
  if (/美债|美国国债|treasury yield|国债收益率/.test(lower)) return "rates_bonds:us-treasury";
  const entities = (domain?.terms || [])
    .filter((term) => term.length >= 3 && !genericTerms.has(term) && lower.includes(term.toLowerCase()))
    .sort((a, b) => b.length - a.length)
    .slice(0, 3);
  const actions = ["干预", "联合干预", "降息", "加息", "降准", "制裁", "关税", "监管", "财报", "并购", "收购", "破产", "暴涨", "暴跌", "跳水", "反弹", "intervention", "rate check", "earnings", "surge", "plunge"]
    .filter((term) => lower.includes(term));
  const title = String(reference.title || "").replace(/[，。！？：,.!?\s]/g, "").slice(0, 18);
  return `${domain?.key || "market"}:${entities.join("+") || title}:${actions.slice(0, 2).join("+") || "signal"}`;
}

function detectMarkets(text: string) {
  const markets: string[] = [];
  if (/美股|纳指|纳斯达克|标普|道指|道琼斯|费城半导体|罗素2000|nasdaq|s&p|wall street|英伟达|微软|meta/i.test(text)) markets.push("美股");
  if (/港股|恒生|国企指数|南向|港股通|腾讯|阿里|美团|小米/i.test(text)) markets.push("港股");
  if (/a股|沪指|上证指数|深成指|创业板|科创板|科创50|两市成交|北向|涨停|跌停/i.test(text)) markets.push("A股");
  if (/日元|日本|美元兑日元|boj|日本央行|财务省|yen|usd\/jpy/i.test(text)) markets.push("日股", "外汇");
  if (/汇率|外汇|美元指数|dxy|currency|forex/i.test(text)) markets.push("外汇");
  if (/美债|国债|收益率|债券|yield|treasury/i.test(text)) markets.push("债券");
  if (/原油|黄金|铜|天然气|铁矿|商品|oil|gold|commodity/i.test(text)) markets.push("大宗商品");
  return markets;
}

function eventKey(reference: any) {
  return eventFingerprint(reference);
}

function buildTopicTitle(key: string, markets: string[], leadTitle: string, context = "") {
  const cross = markets.length >= 2 ? `${markets.join("、")}正在联动` : `${markets[0] || "资本市场"}出现异动`;
  const text = `${leadTitle} ${context}`;
  const isConfirmed = /确认|宣布|实施|出手|正式|confirmed|announced|implemented/i.test(text);
  const isSignal = /暗示|释放|警告|考虑|可能|询价|signal|threat|consider/i.test(text);
  const centralBank = text.match(/美联储|日本央行|日本银行|中国人民银行|央行|Fed|BOJ|FOMC|ECB/i)?.[0] || "央行";
  const company = text.match(/英伟达|微软|Meta|谷歌|苹果|台积电|腾讯|阿里|美团|小米|英特尔|AMD/i)?.[0];
  const templates: Record<string, string> = {
    A股行情: `A股今天的涨跌不是重点：资金正在从哪些板块撤出，又流向哪里？`,
    港股行情: `港股今天谁在领涨、谁在拖累：南向资金与外资在交易什么？`,
    美股行情: `昨夜美股真正的主线是什么：指数涨跌背后，资金风格变了吗？`,
    半导体: `${cross}：半导体这轮行情是趋势确认，还是情绪反弹？`,
    AI: `${cross}：AI交易重新升温，市场真正奖励的是什么？`,
    港股科技: `港股科技出现强信号：会不会继续映射A股与美股科技？`,
    消费: `A股消费突然升温：是政策催化，还是基本面拐点？`,
    红利: `红利资产再度异动：防守交易为什么又回来了？`,
    宏观政策: `${cross}：最新政策信号将如何重估科技与高股息资产？`,
  };
  const domainKey = key.split(":")[0];
  const domainTemplates: Record<string, string> = {
    a_share_session: `A股今日复盘：指数、成交和板块轮动透露了哪条真正主线？`,
    hk_session: `港股今日复盘：恒指与恒生科技为何分化，资金下一步看什么？`,
    us_session: `美股隔夜复盘：三大指数背后，盈利、利率和科技交易谁在主导？`,
    fx_intervention: `${isConfirmed ? "美日官方确认" : isSignal ? "美日官员释放" : "美日市场出现"}汇率干预信号，美元兑日元快速波动：这是短期救火，还是全球资金风向变了？`,
    monetary_policy: `${centralBank}${isConfirmed ? "正式调整" : isSignal ? "释放政策信号" : "政策预期升温"}，利率与流动性预期变化：股市估值会先重估还是盈利先变化？`,
    fiscal_economic: `财政与经济数据出现新信号：市场先交易利率，还是先交易企业盈利？`,
    liquidity: `资金面与流动性出现变化：这次是增量资金进场，还是杠杆风险开始收缩？`,
    rates_bonds: `国债收益率与债券价格出现异动：无风险利率变化会把哪些股票重新定价？`,
    commodities: `原油、黄金或工业金属出现价格冲击：成本与通胀会如何传导到股市？`,
    geopolitics_trade: `贸易与地缘政策出现新动作：供应链、风险溢价和哪些行业会先受影响？`,
    regulation: `监管规则出现实质变化：改变的是短期情绪，还是公司的商业模式？`,
    corporate_earnings: `${company || "龙头公司"}财报或业绩指引出现变化：这是单家公司问题，还是行业预期拐点？`,
  };
  if (domainTemplates[domainKey]) return domainTemplates[domainKey];
  if (templates[domainKey]) return `${leadTitle.replace(/[。！!]$/, "")}：市场在交易趋势确认，还是情绪反弹？`;
  return `${leadTitle.replace(/[。！!]$/, "")}：这件事会怎样传导到股价？`;
}

function buildTopics(references: any[]) {
  const clusters = new Map<string, any[]>();
  for (const reference of references) {
    const key = eventKey(reference);
    clusters.set(key, [...(clusters.get(key) || []), reference]);
  }
  const rawCandidates = [...clusters.entries()].map(([key, items], index) => {
    const ranked = [...items].sort((a, b) => b.score - a.score);
    const allText = ranked.map(referenceText).join(" ");
    const markets = [...new Set(ranked.flatMap((item) => detectMarkets(referenceText(item))))];
    const authorityHosts = new Set(ranked.filter((item) => authorityPattern.test(referenceText(item))).map((item) => {
      try { return new URL(item.url).hostname; } catch { return item.site_name || item.url || ""; }
    }).filter(Boolean));
    const authorityCount = authorityHosts.size;
    const chinaSocialCount = ranked.filter((item) => /微博|抖音|b站|雪球|weibo|douyin|bilibili|xueqiu/i.test(`${referenceText(item)} ${item.query || ""}`)).length;
    const overseasSocialCount = ranked.filter((item) => /reddit|youtube|tiktok|x\.com|wallstreetbets/i.test(`${referenceText(item)} ${item.query || ""}`)).length;
    const socialCount = chinaSocialCount + overseasSocialCount;
    const intensityCount = ranked.filter((item) => intensityPattern.test(referenceText(item))).length;
    const sourceHosts = new Set(ranked.map((item) => { try { return new URL(item.url).hostname; } catch { return item.site_name || ""; } }).filter(Boolean));
    const domain = primaryDomain(allText);
    const officialAction = /官方确认|政府|财政部|财务省|央行|中央银行|国务院|监管机构|联合干预|intervention|treasury|finance ministry|central bank|official/i.test(allText);
    const eventClass = officialAction || ["monetary_policy", "fx_intervention", "fiscal_economic", "regulation", "geopolitics_trade"].includes(domain?.key || "")
      ? "policy_shock" as const
      : ["liquidity", "rates_bonds"].includes(domain?.key || "") ? "liquidity_shock" as const
        : ["corporate_earnings"].includes(domain?.key || "") ? "corporate_event" as const
          : ["a_share_session", "hk_session", "us_session"].includes(domain?.key || "") ? "market_move" as const
            : "theme" as const;
    const occurredAt = ranked.map((item) => item.date || item.published_time || item.publish_time).find(Boolean) || new Date().toISOString();
    const priceMovePercentile = intensityCount ? (markets.length >= 3 ? 92 : 82) : 55;
    const chinaSocialPercentile = Math.min(100, chinaSocialCount * 28 + (chinaSocialCount ? 18 : 0));
    const overseasSocialPercentile = Math.min(100, overseasSocialCount * 28 + (overseasSocialCount ? 18 : 0));
    const accountFit = ["a_share_session", "hk_session", "us_session"].includes(domain?.key || "")
      ? 96
      : domain?.key === "technology_sector" || domain?.key === "fx_intervention" || domain?.key === "monetary_policy" || domain?.key === "liquidity" ? 92 : 78;
    const engineScore = rankTopic({
      occurredAt,
      authoritativeSources: authorityCount,
      priceMovePercentile,
      chinaSocialPercentile,
      overseasSocialPercentile,
      marketCount: markets.length,
      transmissionConfirmed: markets.length >= 3,
      accountFit,
      thesisTension: Math.min(100, 58 + intensityCount * 14 + (markets.length >= 3 ? 15 : 0)),
      evidenceQuality: Math.min(100, 52 + Math.min(authorityCount, 4) * 12 + (sourceHosts.size >= 3 ? 10 : 0)),
      similarityToRecent: 0,
      eventClass,
      officialAction,
    });
    const heat = Math.round(engineScore.breakdown.socialHeat);
    const fit = Math.round(accountFit);
    const depth = Math.round(engineScore.breakdown.fitAndDepth);
    const score = engineScore.score;
    const status = engineScore.eligible && score >= 85 ? "立即做" : engineScore.eligible ? "备选" : "观察";
    const lead = ranked[0];
    const rejectionReasons = [...engineScore.reasons];
    if (sourceHosts.size < 2) rejectionReasons.push("独立来源少于2个");
    return {
      id: index + 1,
      eventKey: key,
      title: buildTopicTitle(key, markets, lead.title || key, allText),
      thesis: `${lead.title || key}。当前聚合 ${sourceHosts.size} 个独立站点、${authorityCount} 个高可信来源${socialCount ? `、${socialCount} 个社交信号` : ""}；核心判断需验证催化能否从${markets.join("向") || "单一市场"}继续扩散。`,
      category: domain?.label || "市场事件",
      channels: domain?.channels || [],
      markets: markets.length ? markets : ["待确认"],
      heat, fit, depth, score, status,
      accent: status === "立即做" ? "violet" : status === "备选" ? "blue" : "amber",
      freshness: "最近 48 小时",
      trigger: lead.title || key,
      gates: { hardGate: engineScore.eligible, reasons: engineScore.reasons },
      sourceCount: sourceHosts.size,
      authorityCount,
      socialCount,
      scoring: engineScore,
      rejectionReasons,
      evidence: ranked.slice(0, 5).map((item) => ({ title: item.title, url: item.url, site: item.site_name, score: item.score })),
    };
  });
  const merged = new Map<string, any>();
  for (const candidate of rawCandidates) {
    // 标题冒号后的判断句是事件语义；前面的市场列表只是映射结果，不应造成重复选题。
    const semanticKey = candidate.title.includes("：") ? candidate.title.split("：").slice(1).join("：") : candidate.eventKey;
    const existing = merged.get(semanticKey);
    if (!existing) {
      merged.set(semanticKey, candidate);
      continue;
    }
    existing.markets = [...new Set([...(existing.markets || []), ...(candidate.markets || [])])];
    existing.sourceCount = Math.max(existing.sourceCount || 0, candidate.sourceCount || 0);
    existing.authorityCount = Math.max(existing.authorityCount || 0, candidate.authorityCount || 0);
    existing.socialCount = Math.max(existing.socialCount || 0, candidate.socialCount || 0);
    existing.evidence = [...(existing.evidence || []), ...(candidate.evidence || [])].slice(0, 8);
    existing.rejectionReasons = [...new Set([...(existing.rejectionReasons || []), ...(candidate.rejectionReasons || [])])];
    existing.score = Math.max(existing.score || 0, candidate.score || 0);
    existing.heat = Math.max(existing.heat || 0, candidate.heat || 0);
    existing.depth = Math.max(existing.depth || 0, candidate.depth || 0);
    // 合并后的事件只要任一来源分支通过硬门槛即可继续评估；不能因为同一事件的
    // 某个低质量转载分支失败，就把整个事件判死。
    existing.gates.hardGate = existing.gates.hardGate || candidate.gates.hardGate;
  }
  const candidates = [...merged.values()];
  // 高分事件进入候选池，证据不足只降级为“待补证据”，不再直接丢失。
  const isEligible = (topic: any) =>
    (topic.sourceCount >= 2 && topic.gates.hardGate) ||
    (topic.score >= 90 && topic.sourceCount >= 1);
  const eligible = candidates.filter(isEligible)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((topic, index) => ({ ...topic, id: index + 1 }));
  const rejected = candidates.filter((topic) => !isEligible(topic))
    .sort((a, b) => b.score - a.score)
    .map((topic, index) => ({ ...topic, id: `rejected-${index + 1}` }));
  const events = candidates.sort((a, b) => b.score - a.score).map((event, index) => ({
    ...event,
    rank: index + 1,
    eligible: isEligible(event),
    status: isEligible(event) ? (event.score >= 90 && !(event.sourceCount >= 2 && event.gates.hardGate) ? "待补证据" : event.score >= 85 ? "立即做" : "备选") : "未过门槛",
  }));
  return { topics: eligible, rejected, events, discoveredEventCount: events.length };
}

export async function POST(request: Request) {
  try {
    const { apiKey, action = "test" } = await request.json();
    if (!apiKey) return Response.json({ error: "请填写百度 WebSearch API Key。" }, { status: 400 });
    if (action === "test") {
      const result = await search(apiKey, "今日全球资本市场热点", 3);
      return Response.json({ ok: true, requestId: result.requestId, resultCount: result.references.length, sample: result.references.slice(0, 3) });
    }
    const scanQueries = buildScanQueries();
    const batches: { query: string; requestId?: string; references: any[] }[] = [];
    let previousRequestAt = 0;
    for (const query of scanQueries) {
      const response = await throttledSearch(apiKey, query, 10, previousRequestAt);
      previousRequestAt = response.requestedAt;
      batches.push(response.result);
    }
    const collectedReferences = batches.flatMap((batch) => batch.references.map((reference: any) => ({
      ...reference,
      site_name: reference.website || reference.site_name || "",
      query: batch.query,
      score: scoreReference(reference),
    })));
    const timeScopedReferences = collectedReferences.filter(isFreshReference);
    const timeFilteredOut = collectedReferences.length - timeScopedReferences.length;
    const seen = new Set<string>();
    const rawReferences = timeScopedReferences.filter((reference: any) => {
      const key = reference.url || reference.title;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const references = financeMcpDeduplicate(rawReferences).map((reference: any) => ({ ...reference, score: scoreReference(reference) })).sort((a: any, b: any) => b.score - a.score);
    const topicResult = buildTopics(references);
    const categoryCoverage = [...new Set(topicResult.rejected.concat(topicResult.topics).map((item) => item.category || "市场事件"))];
    return Response.json({
      ok: true,
      scannedAt: new Date().toISOString(),
      queryCount: scanQueries.length,
      references,
      collectedReferenceCount: collectedReferences.length,
      timeFilteredOut,
      timeWindowHours: 48,
      rawReferenceCount: rawReferences.length,
      contentDedupCount: references.length,
      passed: references.filter((item: any) => item.score >= 45),
      topics: topicResult.topics,
      rejectedTopics: topicResult.rejected,
      events: topicResult.events,
      discoveredEventCount: topicResult.discoveredEventCount,
      categoryCoverage,
      mainTopicCount: topicResult.topics.filter((item) => item.status === "立即做").length,
      requestIds: batches.map((batch) => batch.requestId),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "百度搜索连接失败。" }, { status: 502 });
  }
}
