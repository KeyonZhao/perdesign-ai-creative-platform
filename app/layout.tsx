import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "品物AI设计工作站",
  description: "面向工业设计师的 AI 产品外观设计工作站"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
