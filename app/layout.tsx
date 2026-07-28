import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "品物AI设计工作站",
  description: "面向工业设计师的 AI 产品外观设计工作站"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <Script
          type="module"
          src="https://cdn.jsdelivr.net/npm/@google/model-viewer@4.2.0/dist/model-viewer.min.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
