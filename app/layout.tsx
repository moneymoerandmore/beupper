import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "金融巨子 · 内容作战室",
  description: "跨市场金融热点的选题、研究、创作、发布与复盘工作台",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
