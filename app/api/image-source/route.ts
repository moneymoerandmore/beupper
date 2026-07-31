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
    if (target.protocol !== "https:" || unsafeHost(target.hostname)) return new Response("Unsupported image URL", { status: 400 });
    const response = await fetch(target.toString(), { redirect: "follow" });
    if (!response.ok) return new Response(`Image download failed (${response.status})`, { status: 502 });
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    if (!contentType.startsWith("image/")) return new Response("Source is not an image", { status: 415 });
    return new Response(response.body, { headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=3600" } });
  } catch {
    return new Response("Invalid image URL", { status: 400 });
  }
}
