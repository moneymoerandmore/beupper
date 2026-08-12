import { apiUrl } from "./api-client";

export async function downloadCover(imageUrl: string, format: "png" | "jpg", name: string) {
  const source = imageUrl.startsWith("data:") ? imageUrl : apiUrl(`/api/image-source?url=${encodeURIComponent(imageUrl)}`);
  const image = new Image();
  image.decoding = "async";
  image.src = source;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器无法创建图片画布");
  if (format === "jpg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(image, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
    (result) => result ? resolve(result) : reject(new Error("图片转码失败")),
    format === "png" ? "image/png" : "image/jpeg",
    format === "jpg" ? 0.94 : undefined,
  ));
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `${name}.${format}`;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}
