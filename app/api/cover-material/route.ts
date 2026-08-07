export const runtime = "edge";

const trustedSource = /reuters|bloomberg|cnbc|wsj|ft\.com|apnews|sec\.gov|nasdaq|nyse|新华社|人民网|央视|财联社|证券时报|上海证券报|中国证券报|交易所|公司官网|官方/i;
const lowQuality = /logo|icon|头像|壁纸|素材网|图库|表情包|gif|二维码|水印|广告/i;

function cleanApiKey(value: string) {
  const raw = String(value || "").trim().replace(/^Bearer\s+/i, "").replace(/^["']|["']$/g, "");
  const match = raw.match(/bce-v3\/[A-Za-z0-9._/-]+/);
  return match?.[0] || raw.replace(/^(?:API_KEY|BAIDU_API_KEY)\s*=\s*/i, "").trim();
}

function tokens(value: string) {
  const clean = value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const words = clean.split(/\s+/).filter((item) => item.length >= 2);
  const chinese = clean.replace(/[^\u4e00-\u9fff]/g, "");
  const pairs = Array.from({ length: Math.max(0, chinese.length - 1) }, (_, index) => chinese.slice(index, index + 2));
  return [...new Set([...words, ...pairs])];
}

function imageCandidates(references: any[]) {
  return references.flatMap((reference) => {
    const base = {
      title: reference.title || reference.web_anchor || "主题素材",
      pageUrl: reference.url || "",
      site: reference.website || reference.site_name || "",
      context: `${reference.title || ""} ${reference.content || ""} ${reference.web_anchor || ""}`,
    };
    const candidates: any[] = [];
    if (reference.image?.url) candidates.push({ ...base, imageUrl: reference.image.url, width: Number(reference.image.width) || 0, height: Number(reference.image.height) || 0 });
    for (const image of reference.web_extensions?.images || []) {
      if (image?.url) candidates.push({ ...base, imageUrl: image.url, width: Number(image.width) || 0, height: Number(image.height) || 0 });
    }
    return candidates;
  });
}

function scoreCandidate(candidate: any, queryTokens: string[]) {
  const text = `${candidate.title} ${candidate.site} ${candidate.context}`.toLowerCase();
  const matches = queryTokens.filter((token) => text.includes(token)).length;
  const width = Number(candidate.width) || 0; const height = Number(candidate.height) || 0;
  const pixels = width * height;
  const ratio = height ? width / height : 0;
  return matches * 9
    + (trustedSource.test(`${candidate.site} ${candidate.pageUrl}`) ? 22 : 0)
    + (pixels >= 1_000_000 ? 18 : pixels >= 400_000 ? 10 : 0)
    + (ratio >= 1.15 && ratio <= 2.2 ? 10 : 0)
    - (lowQuality.test(`${candidate.title} ${candidate.imageUrl} ${candidate.site}`) ? 30 : 0)
    - (/\.gif(?:\?|$)/i.test(candidate.imageUrl) ? 40 : 0);
}

async function searchableImages(apiKey: string, query: string) {
  const key = cleanApiKey(apiKey);
  if (!key) throw new Error("请先在首页配置百度 WebSearch API Key。");
  const response = await fetch("https://qianfan.baidubce.com/v2/ai_search/web_search", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: query.slice(0, 72) }],
      edition: "standard",
      search_source: "baidu_search_v2",
      resource_type_filter: [{ type: "image", top_k: 24 }, { type: "web", top_k: 6 }],
      search_filter: { match: { image: { size: 6, ratio: 4, format: 0 } } },
    }),
  });
  const text = await response.text();
  let payload: any = {};
  try { payload = text ? JSON.parse(text) : {}; } catch {}
  if (!response.ok || payload.code) throw new Error(payload.message || payload.error?.message || `百度图片搜索失败（${response.status}）`);
  return { requestId: payload.request_id || "", references: payload.references || payload.data || [] };
}

async function downloadable(candidate: any) {
  try {
    const target = new URL(candidate.imageUrl);
    if (target.protocol !== "https:") return false;
    const response = await fetch(target.toString(), { method: "GET", redirect: "follow" });
    const type = response.headers.get("content-type") || "";
    if (!response.ok || !type.startsWith("image/") || type.includes("gif")) return false;
    const length = Number(response.headers.get("content-length") || 0);
    return !length || length >= 20_000;
  } catch { return false; }
}

export async function POST(request: Request) {
  try {
    const { apiKey, topic, title = "", visual = "" } = await request.json();
    if (!topic) return Response.json({ error: "缺少当前封面主题。" }, { status: 400 });
    const query = `${String(topic).slice(0, 42)} ${String(visual).slice(0, 18)} 高清 新闻图`;
    const result = await searchableImages(apiKey, query);
    const queryTokens = tokens(`${topic} ${title} ${visual}`).slice(0, 36);
    const unique = [...new Map(imageCandidates(result.references).map((item) => [item.imageUrl, item])).values()]
      .map((item: any) => ({ ...item, score: scoreCandidate(item, queryTokens) }))
      .filter((item: any) => item.score > 0)
      .sort((a: any, b: any) => b.score - a.score);
    let selected: any = null;
    for (const candidate of unique.slice(0, 8)) {
      if (await downloadable(candidate)) { selected = candidate; break; }
    }
    if (!selected) return Response.json({ error: "没有找到可验证、可下载的高相关主题素材。" }, { status: 404 });
    return Response.json({ ok: true, query, requestId: result.requestId, selected, candidateCount: unique.length });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "主题素材搜索失败。" }, { status: 502 });
  }
}
