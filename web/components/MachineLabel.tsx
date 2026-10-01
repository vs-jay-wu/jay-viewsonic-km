"use client";

import { useHubStatus } from "@/components/useHubStatus";

/**
 * 側邊欄標題底下的「這是哪一台」。
 *
 * 多機器之後，**「我現在看的是哪一台的 km」會是最常問的問題** —— 兩個分頁長得
 * 一模一樣（B 自己的 9487 與轉發過來的 hub），光看畫面分不出來。
 *
 * ⚠️ 側邊欄是**固定深底**（`bg-[#2d2d2d]`，兩個主題都一樣），所以顏色**寫死**，
 * 不走會翻色的 token —— 用 token 的話深色主題下整行會幾乎消失（`web/AGENTS.md`）。
 *
 * 單機（沒設角色）時不顯示：那時只有一台，講「這是哪一台」是純噪音。
 */
export default function MachineLabel({ hidden }: { hidden?: boolean }) {
  const s = useHubStatus();
  if (hidden || !s.role || !s.machineName) return null;

  return (
    <p className="truncate text-[11px] text-white/45">
      {s.machineName}
      {s.role === "satellite" && (
        <span className={s.ok ? "text-white/45" : "text-amber-400"}>
          {s.ok ? " · satellite" : " · satellite（hub 未連線）"}
        </span>
      )}
    </p>
  );
}
