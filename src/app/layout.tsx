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
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col pb-16 md:pb-0">
        <AuthProvider>
          <CloudSyncInitializer />
          <NavBar />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
