export const runtime = "edge";

const platforms = [
  { id: "youtube", label: "YouTube", hosts: ["youtube.com", "youtu.be"] },
  { id: "bilibili", label: "Bilibili", hosts: ["bilibili.com", "b23.tv"] },
  { id: "douyin", label: "抖音", hosts: ["douyin.com", "iesdouyin.com"] },
  { id: "tiktok", label: "TikTok", hosts: ["tiktok.com"] },
];

function compactNumber(value?: string | null) {
  if (!value) return null;
  const normalized = value.replace(/,/g, "").trim();
  const match = normalized.match(/([\d.]+)\s*([万亿kKmMbB]?)/);
  if (!match) return null;
  const factors: Record<string, number> = { 万: 1e4, 亿: 1e8, k: 1e3, K: 1e3, m: 1e6, M: 1e6, b: 1e9, B: 1e9 };
  return Math.round(Number(match[1]) * (factors[match[2]] || 1));
}

function firstMatch(html: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return compactNumber(match[1]);
  }
  return null;
}

function extractTitle(html: string) {
  return html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)?.[1]
    || html.match(/<title[^>]*>([^<]+)/i)?.[1]
    || "";
}

export async function POST(request: Request) {
  try {
    const { url } = await request.json();
    const target = new URL(String(url || "").trim());
    if (target.protocol !== "https:" && target.protocol !== "http:") throw new Error("链接必须以 http 或 https 开头。");
    const platform = platforms.find((item) => item.hosts.some((host) => target.hostname === host || target.hostname.endsWith(`.${host}`)));
    if (!platform) return Response.json({ error: "暂只支持抖音、Bilibili、YouTube 和 TikTok 链接。" }, { status: 400 });

    const response = await fetch(target.toString(), {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
      },
    });
    if (!response.ok) return Response.json({ error: `${platform.label} 页面读取失败（${response.status}）` }, { status: 502 });
    const html = await response.text();

    const metrics = {
      views: firstMatch(html, [
        /"viewCount"\s*:\s*"?(\d[\d,]*)/i, /"playCount"\s*:\s*(\d+)/i,
        /"play_count"\s*:\s*(\d+)/i, /itemprop=["']interactionCount["'][^>]+content=["'](\d+)/i,
      ]),
      likes: firstMatch(html, [
        /"likeCount"\s*:\s*"?(\d[\d,]*)/i, /"diggCount"\s*:\s*(\d+)/i,
        /"digg_count"\s*:\s*(\d+)/i, /"like"\s*:\s*(\d+)/i,
      ]),
      comments: firstMatch(html, [
        /"commentCount"\s*:\s*"?(\d[\d,]*)/i, /"comment_count"\s*:\s*(\d+)/i,
        /"reply"\s*:\s*(\d+)/i,
      ]),
      shares: firstMatch(html, [
        /"shareCount"\s*:\s*"?(\d[\d,]*)/i, /"share_count"\s*:\s*(\d+)/i,
        /"share"\s*:\s*(\d+)/i,
      ]),
      favorites: firstMatch(html, [
        /"collectCount"\s*:\s*"?(\d[\d,]*)/i, /"collect_count"\s*:\s*(\d+)/i,
        /"favoriteCount"\s*:\s*"?(\d[\d,]*)/i, /"favorite"\s*:\s*(\d+)/i,
      ]),
    };
    const visibleCount = Object.values(metrics).filter((value) => value !== null).length;
    return Response.json({
      platform: platform.label,
      url: response.url,
      title: extractTitle(html),
      metrics,
      collectedAt: new Date().toISOString(),
      status: visibleCount ? "collected" : "page_restricted",
      note: visibleCount
        ? "仅记录公开页面可见数据；完播率、3秒留存和涨粉归因无法从公开视频页获得。"
        : "平台未在公开页面正文中提供指标，可能需要登录或由浏览器执行页面脚本。",
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "链接读取失败。" }, { status: 400 });
  }
}
