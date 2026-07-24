import type { Metadata } from "next";
import "./globals.css";
import NavBar from "./NavBar";
import { AuthProvider } from "@/components/AuthProvider";
import { CloudSyncInitializer } from "./CloudSyncInitializer";

export const metadata: Metadata = {
  title: "AXIA | 理财伙伴",
  description: "您的智能理财伙伴，轻松管理资产配置与投资组合",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased scroll-smooth">
      <body className="min-h-full flex flex-col bg-[linear-gradient(to_bottom,#f8fafc_0%,#ffffff_20%,#f8fafc_100%)] text-zinc-900 pb-16 md:pb-0">
        <AuthProvider>
          <CloudSyncInitializer />
          <NavBar />
          <div className="flex-1 w-full">{children}</div>
        </AuthProvider>
      </body>
    </html>
  );
}
