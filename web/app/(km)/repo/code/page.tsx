import { Suspense } from "react";
import type { Metadata } from "next";
import RepoWorkbench from "@/components/RepoWorkbench";
import { repoViewTitle } from "@/lib/navRules";

/**
 * 分頁標題要帶 repo 名字，而名字只在網址的 `?dir=` 裡 —— 所以這一頁是
 * **server component**（`generateMetadata` 拿得到 `searchParams`），
 * 真正的畫面在 client 的 `RepoWorkbench`。
 *
 * **不要改成在 client 端設 `document.title`**：root layout 的 metadata 會在
 * hydrate 與每次導覽後把它蓋回去（2026-09-22 踩過）。
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ dir?: string }>;
}): Promise<Metadata> {
  const { dir } = await searchParams;
  return { title: repoViewTitle(dir, "code") };
}

/** 程式碼視圖。內容與另一個視圖共用 `RepoWorkbench`，差別只有這個 prop */
export default function Page() {
  return (
    <Suspense fallback={<p className="px-6 py-10 text-sm text-fg-subtle">載入中…</p>}>
      <RepoWorkbench view="code" />
    </Suspense>
  );
}
