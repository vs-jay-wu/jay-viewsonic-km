/**
 * markdown 大綱（目錄）的錨點規則。
 *
 * **目錄是從畫好的 DOM 反讀出來的**（見 `components/MarkdownPreview.tsx`），
 * 不是另外再解析一次 markdown —— 兩邊各算一次的話，只要有一種寫法（setext 標題、
 * 內嵌 HTML、圍欄裡的 `#`）兩邊解讀不同，點了就跳不過去，而且沒有任何錯誤訊息。
 * 這裡只留「文字 → 錨點」這段共用規則。
 */

export interface Heading {
  level: number;
  text: string;
  slug: string;
}

/**
 * GitHub 風格的錨點：小寫、空白換成 `-`、丟掉標點。
 * **中日文要留著**（km 的文件標題幾乎都是中文）—— 只留 `[a-z0-9]` 的話
 * 整份文件的 slug 會全部變成空字串，然後互相覆蓋。
 */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[`*_~[\]()<>#!.,:;"'?/\\|{}+=$%^&@]/g, "")
    // 半形與全形標點都要去掉 —— km 的標題常有「：」「，」「（）」
    .replace(/[：，。、！？；「」『』（）《》〈〉【】…—～·]/g, "")
    .replace(/\s+/g, "-");
}

/** 同名標題加序號，跟 GitHub 一樣（`x`、`x-1`、`x-2`）。`seen` 要跨整份文件共用 */
export function dedupe(slug: string, seen: Map<string, number>): string {
  const n = seen.get(slug) ?? 0;
  seen.set(slug, n + 1);
  return n === 0 ? slug : `${slug}-${n}`;
}
