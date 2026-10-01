/**
 * 「這台的 km 是不是落後了，該怎麼辦」（純規則，有測試）。
 *
 * 比較基準是**每台各自與 `origin/master`**，不是互比
 * （`docs/ideas/km-multi-machine.md` §11）—— hub 自己也可能落後，互比的話
 * 兩台都落後時會說「一致」。
 *
 * ⚠️ **`git pull` ≠ 生效。** dev 模式的 HMR 覆蓋不到 `instrumentation.ts` 的排程、
 * `next.config.ts`、`package.json` 的相依、新的巢狀 API route。所以「更新」一定
 * 伴隨重啟 —— 只 pull 不重啟會變成「原始碼一致、行為不一致」，**比版本不一致更難查**。
 */

export interface KmVersionState {
  /** `HEAD..origin/master`：落後幾個 commit */
  behind: number;
  /** `origin/master..HEAD`：自己多出幾個（hub 上開發就會有） */
  ahead: number;
  /** 工作區有沒有未提交的東西 */
  dirty: boolean;
  checkedAt: string;
  /** 查不到（沒網路、git 壞了）時的訊息。有它的話其餘欄位不可信 */
  error?: string;
}

export type UpdatePlan =
  | { kind: "unknown"; reason: string }
  | { kind: "up-to-date" }
  | { kind: "offer"; behind: number }
  | { kind: "auto"; behind: number }
  | { kind: "blocked"; behind: number; reason: string };

/**
 * 該做什麼。
 *
 * - **hub 永遠只是「提議」**，不自動更新：km 就是開發 km 的地方，工作區不乾淨是
 *   常態，而且自動 pull 等於在你編輯到一半時抽換程式碼。
 * - **satellite 自動**，條件是工作區乾淨 —— 不在 satellite 上開發 km 是規則
 *   （`.claude/rules/km-multi-machine.md`）。不乾淨時**不要默默跳過**：
 *   那正是「有人在這台上動了 km」的徵兆，要講出來。
 * - 沒設角色（單機）當 hub 看待。
 */
export function updatePlan(state: KmVersionState, role?: string): UpdatePlan {
  if (state.error) return { kind: "unknown", reason: state.error };
  // ahead 不是問題：hub 上開發本來就會領先。只有落後才需要做事
  if (state.behind === 0) return { kind: "up-to-date" };
  if (role !== "satellite") return { kind: "offer", behind: state.behind };
  if (state.dirty) {
    return {
      kind: "blocked",
      behind: state.behind,
      reason: "工作區不乾淨，不自動更新 —— satellite 上不該開發 km，先看看是誰改了",
    };
  }
  return { kind: "auto", behind: state.behind };
}

/** 畫面上那句話。`null` ＝ 不用顯示任何東西 */
export function updateMessage(plan: UpdatePlan, machineName: string): string | null {
  switch (plan.kind) {
    case "up-to-date":
      return null;
    case "unknown":
      return `查不到「${machineName}」的 km 版本：${plan.reason}`;
    case "offer":
      return `「${machineName}」的 km 落後 ${plan.behind} 個 commit`;
    case "auto":
      return `「${machineName}」的 km 落後 ${plan.behind} 個 commit，正在自動更新`;
    case "blocked":
      return `「${machineName}」的 km 落後 ${plan.behind} 個 commit，但${plan.reason}`;
  }
}
