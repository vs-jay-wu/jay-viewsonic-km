import { Suspense } from "react";
import type { Metadata } from "next";
import RepoWorkbench from "@/components/RepoWorkbench";
import { repoViewTitle } from "@/lib/navRules";
import { dirFromParams, type RepoParams } from "@/lib/repoPageParams";

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
  searchParams: Promise<RepoParams>;
}): Promise<Metadata> {
  const { repo, dir } = await searchParams;
  // ref 的最後一段就是 repo 名（`Viewsonic-EDU/ragdoll-cat` → `ragdoll-cat`），
  // 跟絕對路徑取最後一段是同一個結果，所以共用同一支
  return { title: repoViewTitle(repo ?? dir, "git") };
}

/** Repo 檢視視圖。內容與另一個視圖共用 `RepoWorkbench`，差別只有這個 prop */
export default async function Page({ searchParams }: { searchParams: Promise<RepoParams> }) {
  return (
    <Suspense fallback={<p className="px-6 py-10 text-sm text-fg-subtle">載入中…</p>}>
      <RepoWorkbench view="git" dir={await dirFromParams(await searchParams)} />
    </Suspense>
  );
}
