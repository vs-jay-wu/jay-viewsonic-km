"use client";

import { Suspense } from "react";
import RepoWorkbench from "@/components/RepoWorkbench";

/** 程式碼視圖。內容與另一個視圖共用 `RepoWorkbench`，差別只有這個 prop */
export default function Page() {
  return (
    <Suspense fallback={<p className="px-6 py-10 text-sm text-fg-subtle">載入中…</p>}>
      <RepoWorkbench view="code" />
    </Suspense>
  );
}
