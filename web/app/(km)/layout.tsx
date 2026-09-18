import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "@/app/globals.css";
import AppShell from "@/components/AppShell";
import ConfirmProvider from "@/components/Confirm";
import PromptProvider from "@/components/Prompt";
import ToastProvider from "@/components/Toast";

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
            <ToastProvider>
              <AppShell>{children}</AppShell>
            </ToastProvider>
          </PromptProvider>
        </ConfirmProvider>
      </body>
    </html>
  );
}
