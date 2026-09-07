import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

const contentTypes: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export async function GET(request: Request) {
  const filename = new URL(request.url).searchParams.get("file") || "";
  const safeName = path.basename(filename);
  const extension = path.extname(safeName).toLowerCase();
  if (!safeName || safeName !== filename || !contentTypes[extension]) {
    return Response.json({ error: "封面文件名无效。" }, { status: 400 });
  }
  try {
    const content = await readFile(path.join(process.cwd(), "data", "covers", safeName));
    return new Response(content, {
      headers: {
        "Content-Type": contentTypes[extension],
        "Content-Length": String(content.byteLength),
        "Cache-Control": "no-cache, max-age=0, must-revalidate",
      },
    });
  } catch {
    return Response.json({ error: "本地封面文件不存在。" }, { status: 404 });
  }
}
