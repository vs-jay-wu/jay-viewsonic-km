import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Teams Archive",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW" className="h-full">
      <body className={`${geist.className} h-full antialiased`}>
        <div className="flex h-full bg-gray-50">
          <Sidebar />
          <main className="flex-1 flex flex-col min-w-0 bg-white overflow-hidden">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
