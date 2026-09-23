"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { readLastView } from "@/lib/repoViewPref";

/**
 * 工作台的入口。側邊欄只有這一個項目，進來之後導到**你上次看的視圖**。
 *
 * 為什麼是客戶端轉址：偏好存在 localStorage，server 讀不到。代價是會閃一下
 * 「載入中…」—— 本機而且只有一次 replace，比在側邊欄放兩個項目划算。
 *
 * ⚠️ **參數原樣帶過去**：有人可能貼 `/repo?dir=…` 這種半舊的網址。
 */
export default function RepoIndex() {
  return (
    <Suspense fallback={<p className="px-6 py-10 text-sm text-fg-subtle">載入中…</p>}>
      <Redirect />
    </Suspense>
  );
}

function Redirect() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const q = new URLSearchParams(params.toString());
    // `view=` 是舊網址的寫法，現在是路徑的一段
    const fromUrl = q.get("view");
    q.delete("view");
    const view = fromUrl === "git" || fromUrl === "code" ? fromUrl : readLastView();
    const s = q.toString();
    router.replace(`/repo/${view}${s ? `?${s}` : ""}`);
  }, [params, router]);

  return <p className="px-6 py-10 text-sm text-fg-subtle">載入中…</p>;
}
