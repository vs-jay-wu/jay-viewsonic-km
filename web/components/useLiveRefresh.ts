"use client";

import { useEffect, useRef } from "react";
import { shouldRefetch } from "@/lib/gitFingerprintRules";

/**
 * 本機有變動就自動更新。
 *
 * 輪詢的是 `/api/git/fingerprint`（9–15ms 的探針），**不是重資料** ——
 * 指紋沒變就完全不做事，連 `setState` 都不會發生。捲動位置、展開狀態、
 * 選取的檔案因此天然不受影響，不必每個頁面各自去保護。
 *
 * 三條刻意的規則：
 *
 * 1. **安靜更新**（Jay 2026-09-22）：`onChange` 不可以開讀取中的狀態。
 *    自動更新是背景行為，跳出 spinner 會打斷正在看的人。
 * 2. **分頁看不到就不跑**：`visibilitychange` 收到隱藏就停掉 timer，
 *    不在背景磨 CPU；切回來先立刻檢查一次（你剛在終端機做完事回來看）。
 * 3. **第一次拿到的指紋不算變動**：那時畫面上的資料本來就跟它同一批。
 *
 * ⚠️ **全域指紋看不到工作區的檔案編輯**（改檔案不會動到 `.git` 底下任何東西）。
 * 所以「切回分頁就更新」的頁面要開 `alsoOnVisible` —— 只靠指紋的話，
 * 你在終端機新增一個檔案再切回瀏覽器，畫面不會有任何反應（實測過，
 * 這正是把舊的無條件重掃換成指紋時弄壞的地方）。
 */
export function useLiveRefresh(
  onChange: () => void,
  opts: {
    dir?: string | null;
    intervalMs?: number;
    enabled?: boolean;
    /** 切回這個分頁時不看指紋、一律更新一次（工作區的檔案編輯只有這條抓得到） */
    alsoOnVisible?: boolean;
  } = {}
): void {
  const { dir, intervalMs = 4_000, enabled = true, alsoOnVisible = false } = opts;
  const seen = useRef<string | null>(null);
  // onChange 每次 render 都是新的函式，放進相依會讓 timer 一直重建
  const cb = useRef(onChange);
  cb.current = onChange;

  // 換 repo 就重新建立基準，否則會拿 A 的指紋去比 B 的
  useEffect(() => {
    seen.current = null;
  }, [dir]);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const check = async (force = false) => {
      try {
        const qs = dir ? `?dir=${encodeURIComponent(dir)}` : "";
        const res = await fetch(`/api/git/fingerprint${qs}`, { cache: "no-store" });
        if (!res.ok) return;
        const { fingerprint } = (await res.json()) as { fingerprint: string };
        if (stopped) return;
        if (force || shouldRefetch(seen.current, fingerprint)) cb.current();
        seen.current = fingerprint;
      } catch {
        // 探針失敗就當作沒事 —— 下一輪會再問一次，不要為此打擾使用者
      }
    };

    const tick = async () => {
      if (document.visibilityState === "visible") await check();
      if (!stopped) timer = setTimeout(tick, intervalMs);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void check(alsoOnVisible);
    };

    void tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [dir, intervalMs, enabled, alsoOnVisible]);
}
