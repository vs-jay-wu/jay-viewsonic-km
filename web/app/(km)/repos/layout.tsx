import type { Metadata } from "next";
import { titleForPath } from "@/lib/navRules";

/*
 * 分頁標題。**用 Next 自己的 metadata，不要在 client 端設 `document.title`** ——
 * root layout 的 metadata 會在 hydrate 與每次導覽後把它蓋回去，表現是標題時有時無
 * （2026-09-22 踩過）。字從 `lib/navRules.ts` 來，跟側邊欄同一份，不會漂移。
 */
export const metadata: Metadata = { title: titleForPath("/repos") };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
