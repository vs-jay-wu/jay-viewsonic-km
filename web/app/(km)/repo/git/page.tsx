import { Suspense } from "react";
import type { Metadata } from "next";
import RepoWorkbench from "@/components/RepoWorkbench";
import { repoViewTitle } from "@/lib/navRules";
import { dirFromParams, redirectLegacyDir, type RepoSearchParams } from "@/lib/repoPageParams";

/**
 * 分頁標題要帶 repo 名字，而名字只在網址的 `?repo=` 裡 —— 所以這一頁是
 * **server component**（`generateMetadata` 拿得到 `searchParams`），
 * 真正的畫面在 client 的 `RepoWorkbench`。
 *
 * **不要改成在 client 端設 `document.title`**：root layout 的 metadata 會在
 * hydrate 與每次導覽後把它蓋回去（2026-09-22 踩過）。
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<RepoSearchParams>;
}): Promise<Metadata> {
  const q = await searchParams;
  /*
   * 標題取**解析出來的絕對路徑**的最後一段，不是 ref 的最後一段。
   *
   * 多數情況兩者相同（`Viewsonic-EDU/ragdoll-cat` → `ragdoll-cat`），但
   * **`km` 這個 ref 不是**：資料夾叫 `jay-viewsonic-km`。拿 ref 當名字的話，
   * 清單上寫 `jay-viewsonic-km` 而分頁寫 `km`，同一個東西兩個名字。
   */
  const dir = await dirFromParams(q);
  return { title: repoViewTitle(dir || q.repo || q.dir, "git") };
}

/** Repo 檢視視圖。內容與另一個視圖共用 `RepoWorkbench`，差別只有這個 prop */
export default async function Page({ searchParams }: { searchParams: Promise<RepoSearchParams> }) {
  const q = await searchParams;
  await redirectLegacyDir("git", q);
  return (
    <Suspense fallback={<p className="px-6 py-10 text-sm text-fg-subtle">載入中…</p>}>
      <RepoWorkbench view="git" dir={await dirFromParams(q)} />
    </Suspense>
  );
}
