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

/**
 * XML／HTML 的可收合區段：**跨行的元素**（開標籤與收標籤不在同一行）。
 *
 * 跟 JSON 那支一樣是掃 token、不是看縮排 —— 縮排在 XML 更不可信
 * （屬性換行、mixed content）。判準：
 *
 * - 自閉標籤（`<x/>`）、宣告（`<?xml …?>`）、DOCTYPE、註解一律不算開標籤。
 * - **同一行開又關的不算**（`<a>x</a>`）：收起來不會少佔一行，只是多一個把手。
 * - 對不起來的收標籤（多一個 `</x>`）就丟掉，不要硬配 —— 配錯會把不相干的
 *   區段藏起來，而那在畫面上看不出異常。
 * - 註解內容整段跳過，裡面的 `<tag>` 不參與配對。
 */
export function xmlFoldRanges(lines: string[]): FoldRange[] {
  const stack: { name: string; line: number }[] = [];
  const out: FoldRange[] = [];
  let inComment = false;

  for (let i = 0; i < lines.length; i++) {
    let s = lines[i];

    // 註解可能跨行；先把這一行裡的註解區段吃掉
    for (;;) {
      if (inComment) {
        const end = s.indexOf("-->");
        if (end < 0) {
          s = "";
          break;
        }
        s = s.slice(end + 3);
        inComment = false;
        continue;
      }
      const start = s.indexOf("<!--");
      if (start < 0) break;
      const end = s.indexOf("-->", start + 4);
      if (end < 0) {
        s = s.slice(0, start);
        inComment = true;
        break;
      }
      s = s.slice(0, start) + s.slice(end + 3);
    }

    const re = /<\/?([A-Za-z_][\w.:-]*)([^<>]*)>/g;
    for (let m = re.exec(s); m; m = re.exec(s)) {
      const [tag, name, rest] = m;
      if (tag.startsWith("</")) {
        // 找最近的同名開標籤；對不起來就整個丟掉
        const at = [...stack].reverse().findIndex((x) => x.name === name);
        if (at < 0) continue;
        const idx = stack.length - 1 - at;
        const open = stack[idx];
        stack.length = idx;
        if (open.line < i) out.push({ start: open.line, end: i });
      } else if (!rest.trimEnd().endsWith("/")) {
        stack.push({ name, line: i });
      }
    }
  }
  // 起始行小的排前面，跟 JSON 那支一致（畫面靠 start 找把手）
  return out.sort((a, b) => a.start - b.start || b.end - a.end);
}
