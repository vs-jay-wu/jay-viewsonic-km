/**
 * 把 highlight.js 的輸出切成「每行一段、而且各自閉合」的 HTML。
 *
 * ⚠️ **不能只做 `value.split("\n")`**：hljs 對跨行的東西（block 註解、多行字串、
 * heredoc）只開一個 `<span>`，所以切完之後 —— 第一行的 span 沒有關、
 * **中間幾行完全沒有 class**、最後一行多一個 `</span>`。
 *
 * 每行各自 `dangerouslySetInnerHTML` 進自己的 `<td>` 時，瀏覽器會自己補關、
 * 丟掉多餘的關閉標籤，所以**不會壞版**，只是中間那幾行用預設顏色畫 ——
 * 看起來就是「同一段註解裡有幾行顏色不一樣」（Jay 2026-09-24 在 Kotlin 的
 * KDoc 上看到的就是這個）。沒有錯誤訊息，只有顏色不對。
 *
 * 做法：走訪標籤維護一個開啟中的堆疊，遇到換行就把堆疊倒著關掉、
 * 下一行開頭再原樣開回來。
 */
export function splitHighlightedLines(html: string): string[] {
  const lines: string[] = [];
  const open: string[] = []; // 尚未關閉的開始標籤原文
  let cur = "";
  let i = 0;

  const flush = () => {
    lines.push(cur + "</span>".repeat(open.length));
    cur = open.join("");
  };

  while (i < html.length) {
    const lt = html.indexOf("<", i);
    const nl = html.indexOf("\n", i);

    if (nl >= 0 && (lt < 0 || nl < lt)) {
      cur += html.slice(i, nl);
      flush();
      i = nl + 1;
      continue;
    }
    if (lt < 0) {
      cur += html.slice(i);
      break;
    }

    cur += html.slice(i, lt);
    const gt = html.indexOf(">", lt);
    if (gt < 0) {
      // 標籤沒收尾（理論上不會發生）——當純文字處理，不要吞掉內容
      cur += html.slice(lt);
      break;
    }
    const tag = html.slice(lt, gt + 1);
    if (tag.startsWith("</")) open.pop();
    else if (!tag.endsWith("/>")) open.push(tag);
    cur += tag;
    i = gt + 1;
  }

  lines.push(cur + "</span>".repeat(open.length));
  return lines;
}
