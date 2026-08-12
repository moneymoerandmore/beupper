declare const __TOY_API_BASE_URL__: string | undefined;
declare const __TOY_AI_BASE_URL__: string | undefined;

const apiBase = typeof __TOY_API_BASE_URL__ === "string"
  ? __TOY_API_BASE_URL__.replace(/\/$/, "")
  : "";
const aiBase = typeof __TOY_AI_BASE_URL__ === "string"
  ? __TOY_AI_BASE_URL__.replace(/\/$/, "")
  : apiBase;

const aiPaths = new Set([
  "/api/generate",
  "/api/generate-packaging",
  "/api/generate-script",
]);

export function apiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const isAiRequest = aiPaths.has(normalizedPath.split("?", 1)[0]);
  const browserHost = typeof window !== "undefined" ? window.location.hostname : "";
  const localGatewayHost = browserHost === "localhost" || browserHost === "127.0.0.1"
    ? "127.0.0.1"
    : browserHost;
  const localAiBase = typeof window !== "undefined" && !aiBase
    ? `${window.location.protocol}//${localGatewayHost}:4318`
    : "";
  const base = isAiRequest ? (aiBase || localAiBase) : apiBase;
  return `${base}${normalizedPath}`;
}

export async function readJsonResponse(response: Response, action: string) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    const excerpt = text.trim().slice(0, 160) || "空响应";
    throw new Error(`${action}接口返回异常（HTTP ${response.status}）：${excerpt}`);
  }
}
