import { apiUrl } from "./api-client";

function isLocalGeneratedCover(imageUrl: string) {
  try {
    const url = new URL(imageUrl);
    return ["localhost", "127.0.0.1"].includes(url.hostname)
      && url.port === "4318"
      && url.pathname.startsWith("/covers/");
  } catch {
    return false;
  }
}

export async function downloadCover(imageUrl: string, format: "png" | "jpg", name: string) {
  const source = imageUrl.startsWith("data:") || isLocalGeneratedCover(imageUrl)
    ? imageUrl
    : apiUrl(`/api/image-source?url=${encodeURIComponent(imageUrl)}`);
  const response = await fetch(source);
  if (!response.ok) {
    const detail = (await response.text()).trim().slice(0, 120);
    throw new Error(`封面读取失败（HTTP ${response.status}）${detail ? `：${detail}` : ""}`);
  }
  const contentType = response.headers.get("content-type") || "";
  const sourceBlob = await response.blob();
  if (!contentType.startsWith("image/") && !sourceBlob.type.startsWith("image/")) {
    throw new Error("封面地址返回的不是图片，请重新生成该封面。");
  }

  const objectSource = URL.createObjectURL(sourceBlob);
  const image = new Image();
  image.decoding = "async";
  image.src = objectSource;
  try {
    await image.decode();
  } catch {
    URL.revokeObjectURL(objectSource);
    throw new Error("封面文件无法解码，请重新生成该封面。");
  }

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    URL.revokeObjectURL(objectSource);
    throw new Error("浏览器无法创建图片画布。");
  }
  if (format === "jpg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(image, 0, 0);
  URL.revokeObjectURL(objectSource);

  const outputBlob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
    (result) => result ? resolve(result) : reject(new Error("图片转码失败。")),
    format === "png" ? "image/png" : "image/jpeg",
    format === "jpg" ? 0.94 : undefined,
  ));
  const objectUrl = URL.createObjectURL(outputBlob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `${name}.${format}`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}
