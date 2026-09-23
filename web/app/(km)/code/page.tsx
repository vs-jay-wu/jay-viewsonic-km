import { redirect } from "next/navigation";

/** `/code` 已經併進 `/repo`（Jay 2026-09-23）。舊網址的 `repo=` 對應新的 `dir=` */
export default async function CodeRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  const one = (k: string) => (Array.isArray(q[k]) ? q[k]?.[0] : q[k]);
  const next = new URLSearchParams();
  const dir = one("repo") ?? one("dir");
  if (dir) next.set("dir", dir);
  const qs = next.toString();
  redirect(`/repo/code${qs ? `?${qs}` : ""}`);
}
