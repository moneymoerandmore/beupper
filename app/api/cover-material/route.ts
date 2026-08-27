export const runtime = "edge";

const trustedSource = /reuters|bloomberg|cnbc|wsj|ft\.com|apnews|sec\.gov|nasdaq|nyse|新华社|人民网|央视|财联社|证券时报|上海证券报|中国证券报|交易所|公司官网|官方/i;
const lowQuality = /logo|icon|头像|壁纸|素材网|图库|表情包|gif|二维码|水印|广告/i;
const likelyPersonMaterial = /人物|人像|肖像|头像|写真|出席|会见|讲话|演讲|发布会|记者会|官员|总统|主席|部长|首相|ceo|founder|portrait|headshot|speech|speaks|meeting|press conference/i;

function unsafeHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
    || /^10\./.test(hostname) || /^192\.168\./.test(hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
}

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
  return references.flatMap((reference, referenceIndex) => {
    const base = {
      title: reference.title || reference.web_anchor || "主题素材",
      pageUrl: reference.url || "",
      site: reference.website || reference.site_name || "",
      context: `${reference.title || ""} ${reference.content || ""} ${reference.web_anchor || ""}`,
      searchRank: referenceIndex,
    };
    const candidates: any[] = [];
    const append = (image: any, fallbackUrl = "") => {
      const imageUrl = typeof image === "string" ? image : image?.url || image?.image_url || image?.imageUrl || image?.src || fallbackUrl;
      if (!imageUrl) return;
      candidates.push({
        ...base,
        imageUrl,
        imageLabel: typeof image === "string" ? "" : image?.title || image?.alt || image?.description || "",
        width: Number(image?.width) || 0,
        height: Number(image?.height) || 0,
      });
    };
    append(reference.image);
    append(reference.image_url || reference.imageUrl);
    if (/image/i.test(String(reference.resource_type || reference.type || ""))) append(reference.url);
    for (const image of reference.web_extensions?.images || []) {
      append(image);
    }
    append(reference.web_extensions?.image || reference.web_extensions?.image_url);
    return candidates;
  });
}

function isLikelyPersonImage(candidate: any) {
  // Article bodies often mention a CEO or official even when the attached image
  // is a factory, product or chart. Person filtering must stay image-scoped.
  return likelyPersonMaterial.test(`${candidate.imageLabel || ""} ${candidate.title || ""} ${candidate.imageUrl || ""}`);
}

function scoreCandidate(candidate: any, queryTokens: string[], allowPerson: boolean) {
  const text = `${candidate.title} ${candidate.site} ${candidate.context}`.toLowerCase();
  const matches = queryTokens.filter((token) => text.includes(token)).length;
  const width = Number(candidate.width) || 0; const height = Number(candidate.height) || 0;
  const pixels = width * height;
  const ratio = height ? width / height : 0;
  return matches * 9
    + (trustedSource.test(`${candidate.site} ${candidate.pageUrl}`) ? 22 : 0)
    + (pixels >= 1_000_000 ? 18 : pixels >= 400_000 ? 10 : 0)
    + (ratio >= 1.15 && ratio <= 2.2 ? 10 : 0)
    + Math.max(0, 16 - Number(candidate.searchRank || 0))
    - (lowQuality.test(`${candidate.title} ${candidate.imageUrl} ${candidate.site}`) ? 30 : 0)
    - (!allowPerson && isLikelyPersonImage(candidate) ? 120 : 0)
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
      resource_type_filter: [{ type: "image", top_k: 30 }, { type: "web", top_k: 8 }],
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
    if (!["http:", "https:"].includes(target.protocol) || unsafeHost(target.hostname)) return false;
    const response = await fetch(target.toString(), {
      method: "GET", redirect: "follow",
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        ...(candidate.pageUrl ? { Referer: candidate.pageUrl } : {}),
      },
      signal: AbortSignal.timeout(12_000),
    });
    const type = response.headers.get("content-type") || "";
    if (response.url && unsafeHost(new URL(response.url).hostname)) return false;
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > 15_000_000) return false;
    if (!response.ok || type.includes("gif") || /\.gif(?:\?|$)/i.test(target.pathname)) return false;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength < 8_000) return false;
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const isWebp = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
    return type.startsWith("image/") || isJpeg || isPng || isWebp;
  } catch { return false; }
}

export async function POST(request: Request) {
  try {
    const { apiKey, topic, title = "", visual = "", allowPerson = false, namedPerson = "" } = await request.json();
    if (!topic) return Response.json({ error: "缺少当前封面主题。" }, { status: 400 });
    const subjectHint = allowPerson && namedPerson
      ? String(namedPerson).slice(0, 24)
      : String(visual || "市场现场 公司产品 产业场景").replace(/人物|人像|肖像|头像|小人|模型/g, "").slice(0, 42);
    const query = `${String(topic).slice(0, 34)} ${subjectHint} 高清 新闻图片`;
    const result = await searchableImages(apiKey, query);
    const queryTokens = tokens(`${topic} ${title} ${visual}`).slice(0, 36);
    const rawCandidates = imageCandidates(result.references);
    const personRejected = rawCandidates.filter((item: any) => !allowPerson && isLikelyPersonImage(item)).length;
    const unique = [...new Map(rawCandidates.map((item) => [item.imageUrl, item])).values()]
      .map((item: any) => ({ ...item, score: scoreCandidate(item, queryTokens, Boolean(allowPerson)) }))
      .filter((item: any) => Boolean(allowPerson) || !isLikelyPersonImage(item))
      .filter((item: any) => item.score > -10)
      .sort((a: any, b: any) => b.score - a.score);
    let selected: any = null;
    let attempted = 0;
    for (const candidate of unique.slice(0, 24)) {
      attempted += 1;
      if (await downloadable(candidate)) { selected = candidate; break; }
    }
    if (!selected) return Response.json({
      error: rawCandidates.length === 0
        ? "百度本次没有返回任何图片素材，请稍后重试。"
        : unique.length === 0
          ? "图片结果存在，但都未通过主题相关性或人物素材规则。"
          : `找到${unique.length}张相关候选图，但前${attempted}张均无法从来源站下载。`,
      diagnostics: { referenceCount: result.references.length, rawImageCount: rawCandidates.length, personRejected, eligibleCount: unique.length, attempted },
    }, { status: 404 });
    return Response.json({ ok: true, query, requestId: result.requestId, selected, candidateCount: unique.length, diagnostics: { referenceCount: result.references.length, rawImageCount: rawCandidates.length, personRejected, attempted } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "主题素材搜索失败。" }, { status: 502 });
  }
}
