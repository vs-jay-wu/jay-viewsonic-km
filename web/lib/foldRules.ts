/**
 * 可以收合的區段（純規則，有測試）。
 *
 * 目前只給 JSON 用：括號配對算得準，而且長設定檔最需要收合。
 * 不做「按縮排收合」那種通用版 —— 縮排在 JSON 以外的語言歧義太多
 * （續行、字串裡的排版），猜錯會把使用者的內容藏起來，而那不會有徵兆。
 */

export interface FoldRange {
  /** 起始行（0-based）＝ 出現左括號的那一行，收合時它自己還看得見 */
  start: number;
  /** 結束行（0-based）＝ 對應的右括號那一行 */
  end: number;
}

/**
 * 掃括號算出可收合的區段。
 *
 * **字串裡的括號不算**（`{"a": "}{"}`），跳脫也要跟著處理，否則一個
 * `"\\"` 就會讓後面整份都被當成字串、一個區段都收不起來。
 *
 * 同一行開兩層（`"a": [{`）時只留最外面那一層：一行只有一個收合把手，
 * 而收起外層本來就連內層一起收。
 */
export function foldRanges(lines: string[]): FoldRange[] {
  const stack: number[] = [];
  const out: FoldRange[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const ch of line) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        // 跳脫只在字串裡有意義，但無條件吃掉下一個字也不會出錯
        if (inString) escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === "{" || ch === "[") stack.push(i);
      else if (ch === "}" || ch === "]") {
        const start = stack.pop();
        // 括號不成對（檔案壞了、或被截斷）就當作沒有這一段，不要硬湊
        if (start === undefined) continue;
        if (i > start) out.push({ start, end: i });
      }
    }
    // 字串不跨行（JSON 的字串本來就不能有裸換行），行尾一律重置
    inString = false;
    escaped = false;
  }

  const seen = new Set<number>();
  return out
    .sort((a, b) => a.start - b.start || b.end - a.end)
    .filter((r) => (seen.has(r.start) ? false : (seen.add(r.start), true)));
}

/** 收合起來之後，哪些行要藏起來（起始行本身留著） */
export function hiddenLines(ranges: FoldRange[], folded: ReadonlySet<number>): Set<number> {
  const hidden = new Set<number>();
  for (const r of ranges) {
    if (!folded.has(r.start)) continue;
    for (let i = r.start + 1; i <= r.end; i++) hidden.add(i);
  }
  return hidden;
}
