import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "观市 · A股研究工作台",
  description: "基于可追溯证据理解 A 股市场状态、主要矛盾与判断改变条件。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
