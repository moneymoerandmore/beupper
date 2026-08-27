export const runtime = "edge";

function unsafeHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
    || /^10\./.test(hostname) || /^192\.168\./.test(hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
}

export async function GET(request: Request) {
  try {
    const source = new URL(request.url).searchParams.get("url");
    if (!source) return new Response("Missing image URL", { status: 400 });
    const target = new URL(source);
    if (!["http:", "https:"].includes(target.protocol) || unsafeHost(target.hostname)) return new Response("Unsupported image URL", { status: 400 });
    const pageUrl = new URL(request.url).searchParams.get("pageUrl") || "";
    const response = await fetch(target.toString(), {
      redirect: "follow",
      headers: { Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8", ...(pageUrl ? { Referer: pageUrl } : {}) },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return new Response(`Image download failed (${response.status})`, { status: 502 });
    if (response.url && unsafeHost(new URL(response.url).hostname)) return new Response("Unsafe image redirect", { status: 400 });
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > 15_000_000) return new Response("Image is too large", { status: 413 });
    let contentType = response.headers.get("content-type") || "application/octet-stream";
    const bytes = new Uint8Array(await response.arrayBuffer());
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const isWebp = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
    if (!contentType.startsWith("image/")) contentType = isJpeg ? "image/jpeg" : isPng ? "image/png" : isWebp ? "image/webp" : "";
    if (!contentType || bytes.byteLength < 8_000) return new Response("Source is not a usable image", { status: 415 });
    return new Response(bytes, { headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=3600" } });
  } catch {
    return new Response("Invalid image URL", { status: 400 });
  }
}
