import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "@/app/globals.css";
import AppShell from "@/components/AppShell";
import ConfirmProvider from "@/components/Confirm";
import PromptProvider from "@/components/Prompt";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "KM 工作台",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW" className="h-full">
      <body className={`${geist.className} h-full antialiased`}>
        <ConfirmProvider>
          <PromptProvider>
            <AppShell>{children}</AppShell>
          </PromptProvider>
        </ConfirmProvider>
      </body>
    </html>
  );
}
