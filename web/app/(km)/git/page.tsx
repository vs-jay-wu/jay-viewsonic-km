import { redirect } from "next/navigation";

/**
 * `/git` 已經併進 `/repo`（Jay 2026-09-23）。留著轉址是為了**舊書籤與舊連結**
 * ——「選 repo → 看 history」的網址被貼在 Jira 留言與 session 標題裡。
 *
 * `repo=` 是舊參數名，新的叫 `dir=`；`sha`／`file`／`side` 原樣帶過去。
 */
export default async function GitRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  const next = new URLSearchParams();
  const one = (k: string) => (Array.isArray(q[k]) ? q[k]?.[0] : q[k]);
  const dir = one("repo") ?? one("dir");
  if (dir) next.set("dir", dir);
  for (const k of ["sha", "file", "side"]) {
    const v = one(k);
    if (v) next.set(k, v);
  }
  const qs = next.toString();
  redirect(`/repo/git${qs ? `?${qs}` : ""}`);
}
