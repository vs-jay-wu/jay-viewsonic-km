import type { Metadata } from "next";
import { titleForPath } from "@/lib/navRules";

/*
 * 分頁標題。**用 Next 自己的 metadata，不要在 client 端設 `document.title`** ——
 * root layout 的 metadata 會在 hydrate 與每次導覽後把它蓋回去（2026-09-22 踩過）。
 */
export const metadata: Metadata = { title: titleForPath("/repo/git") };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
