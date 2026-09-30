import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "@/app/globals.css";
import AppShell from "@/components/AppShell";
import ConfirmProvider from "@/components/Confirm";
import PromptProvider from "@/components/Prompt";
import ToastProvider from "@/components/Toast";
import { readUiSettings } from "@/lib/uiSettings";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "KM 工作台",
};

/*
 * `data-theme` 在 server 這裡就決定好 —— 設定存在 `data/machine/ui-settings.json`，
 * 不是 localStorage，所以 SSR 的時候就知道要出哪個值，**不會先閃一下淺色**。
 * `system` 那一態交給 CSS 的 `@media` 判斷，同樣不需要 JS。
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { theme } = await readUiSettings();
  return (
    <html lang="zh-TW" className="h-full" data-theme={theme}>
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
