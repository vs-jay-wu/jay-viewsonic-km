/**
 * 從字型檔的 `cmap` 表判斷它**實際涵蓋哪些文字**（純規則，有測試）。
 *
 * 為什麼不是看檔名或 `OS/2`：
 * - 檔名（`NotoSansTC-Regular.otf`）是慣例不是契約。
 * - `OS/2.ulUnicodeRange` 是**宣告**的範圍，字型廠常常設得太寬或忘了更新。
 * - `meta` 表的 `dlng`／`slng` 才是「設計給哪些語言」的正式欄位，但**很少見**
 *   —— 這個工作區抽查的 `AbrilFatface-Regular.ttf` 連 `meta` 都沒有。
 *
 * 所以看 `cmap`：那是「這個碼位到底有沒有字」的地面真相，而預覽要的正是這個
 * （沒有中文字卻排一行中文，瀏覽器會用 fallback 畫，看起來像字型有中文）。
 *
 * 只解析兩種子表：format 4（BMP）與 format 12（含增補平面）。其餘（format 0／6／
 * 13…）現代字型幾乎不用，遇到就當作「查不到」而不是猜。
 */

export interface ScriptProbe {
  key: string;
  label: string;
  /** 代表字的碼位。有它就當作這個語系有字 */
  codePoint: number;
}

/** 探針刻意挑**常用且不可能被替代**的字，不是挑罕見字 */
export const SCRIPT_PROBES: ScriptProbe[] = [
  { key: "latin", label: "拉丁", codePoint: 0x41 }, // A
  { key: "cjk", label: "中日韓漢字", codePoint: 0x4e2d }, // 中
  { key: "kana", label: "日文假名", codePoint: 0x3042 }, // あ
  { key: "hangul", label: "韓文", codePoint: 0xac00 }, // 가
  { key: "cyrillic", label: "西里爾", codePoint: 0x0410 }, // А
  { key: "greek", label: "希臘", codePoint: 0x0391 }, // Α
  { key: "arabic", label: "阿拉伯", codePoint: 0x0627 }, // ا
  { key: "thai", label: "泰文", codePoint: 0x0e01 }, // ก
  { key: "emoji", label: "emoji", codePoint: 0x1f600 },
];

function u16(v: DataView, o: number) {
  return v.getUint16(o);
}
function u32(v: DataView, o: number) {
  return v.getUint32(o);
}

/** 表目錄：tag → offset。`ttcf`（字型集合）取第一個字型 */
export function fontTables(buf: ArrayBuffer): Map<string, number> {
  const v = new DataView(buf);
  const out = new Map<string, number>();
  if (buf.byteLength < 12) return out;
  let base = 0;
  if (u32(v, 0) === 0x74746366) {
    // 'ttcf'
    if (buf.byteLength < 16) return out;
    base = u32(v, 12);
    if (base + 12 > buf.byteLength) return out;
  }
  const num = u16(v, base + 4);
  for (let i = 0; i < num; i++) {
    const rec = base + 12 + i * 16;
    if (rec + 16 > buf.byteLength) break;
    let tag = "";
    for (let k = 0; k < 4; k++) tag += String.fromCharCode(v.getUint8(rec + k));
    out.set(tag, u32(v, rec + 8));
  }
  return out;
}

function hasInFormat4(v: DataView, sub: number, cp: number): boolean {
  if (cp > 0xffff) return false;
  const segX2 = u16(v, sub + 6);
  const ends = sub + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const ranges = deltas + segX2;
  for (let i = 0; i < segX2; i += 2) {
    const end = u16(v, ends + i);
    if (cp > end) continue;
    const start = u16(v, starts + i);
    if (cp < start) return false;
    const ro = u16(v, ranges + i);
    if (ro === 0) return ((cp + u16(v, deltas + i)) & 0xffff) !== 0;
    const gi = ranges + i + ro + (cp - start) * 2;
    if (gi + 2 > v.byteLength) return false;
    return u16(v, gi) !== 0;
  }
  return false;
}

function hasInFormat12(v: DataView, sub: number, cp: number): boolean {
  const n = u32(v, sub + 12);
  for (let i = 0; i < n; i++) {
    const g = sub + 16 + i * 12;
    if (g + 12 > v.byteLength) return false;
    const start = u32(v, g);
    const end = u32(v, g + 4);
    if (cp < start) return false;
    if (cp <= end) return true;
  }
  return false;
}

/** 這個字型有沒有這個碼位的字 */
export function hasCodePoint(buf: ArrayBuffer, cmapOffset: number, cp: number): boolean {
  const v = new DataView(buf);
  if (cmapOffset + 4 > buf.byteLength) return false;
  const n = u16(v, cmapOffset + 2);
  let best4 = -1;
  let best12 = -1;
  for (let i = 0; i < n; i++) {
    const rec = cmapOffset + 4 + i * 8;
    if (rec + 8 > buf.byteLength) break;
    const sub = cmapOffset + u32(v, rec + 4);
    if (sub + 4 > buf.byteLength) continue;
    const fmt = u16(v, sub);
    if (fmt === 12) best12 = sub;
    else if (fmt === 4 && best4 < 0) best4 = sub;
  }
  // format 12 涵蓋增補平面，優先用它
  if (best12 >= 0 && hasInFormat12(v, best12, cp)) return true;
  if (best4 >= 0) return hasInFormat4(v, best4, cp);
  return false;
}

/** 這個字型涵蓋哪些語系（探針表裡有字的那些） */
export function fontCoverage(buf: ArrayBuffer): string[] {
  const cmap = fontTables(buf).get("cmap");
  if (cmap === undefined) return [];
  return SCRIPT_PROBES.filter((p) => hasCodePoint(buf, cmap, p.codePoint)).map((p) => p.key);
}
