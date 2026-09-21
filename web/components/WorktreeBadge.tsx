"use client";

import Icon from "@/components/Icon";
import Tooltip from "@/components/Tooltip";

/**
 * 「這是一個 linked worktree」的標記。**全站只有這一份**（Jay 2026-09-21）——
 * 原本四個地方各畫各的：`/changes` 是文字 badge「worktree」／「session worktree」、
 * `/git` 是紫色小藥丸「wt」、`/code` 的下拉是紫色的「wt」兩個字、`/work` 又是
 * 另一顆紫色「worktree」。同一個概念長四種樣子，每加一頁就再多一種。
 *
 * 樣式的決定：
 *
 * - **圖示是分支岔出去那張**（`Icon` 的 `worktree`），不再用「wt」這種縮寫 ——
 *   縮寫要先學過才看得懂，而這個標記出現的地方常常只有幾個字的寬度。
 * - **tooltip 就只有「worktree」這個字**（Jay 2026-09-21）：圖示省掉了文字，
 *   那個字要在 hover 時拿得到；但也**只要那個字** —— 路徑、會不會消失這些說明
 *   放在這裡是雜訊，路徑本來就列在旁邊了。
 * - **一般的 worktree 用中性灰**：它是常態，不是警告（web/AGENTS.md）。
 * - **session 綁的用琥珀色**：`.claude/worktrees/<name>` 底下那種會**跟著 session
 *   消失**，未 commit 的東西一起不見（`.claude/rules/cross-repo-workflow.md` §4）。
 *   那是真的要警告的事，正好是琥珀色的用途。
 */
export default function WorktreeBadge({ sessionBound = false }: { sessionBound?: boolean }) {
  const badge = (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-full border px-1 py-0.5 leading-none ${
        sessionBound
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-gray-200 bg-white text-gray-500"
      }`}
    >
      <Icon name="worktree" size={11} />
      {sessionBound && <span className="text-[10px]">session</span>}
    </span>
  );
  return <Tooltip label={sessionBound ? "session worktree" : "worktree"}>{badge}</Tooltip>;
}
