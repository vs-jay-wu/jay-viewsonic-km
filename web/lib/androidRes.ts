import { readdir, readFile } from "fs/promises";
import path from "path";
import {
  adaptiveIconToSvg, isAdaptiveIconXml, isVectorDrawableXml, parseAdaptiveIcon,
  parseColorsXml, resourceName, vectorDrawableToSvg, type SvgSizing,
} from "@/lib/vectorDrawableRules";

/**
 * Android `res/` 的伺服器端讀取（`/code` 的預覽與 `/changes` 的圖片比對共用）。
 *
 * 純轉換規則在 `lib/vectorDrawableRules.ts`（客戶端也 import 得到），
 * 這裡只負責碰檔案系統的部分。
 */

/** 一個 res 目錄最多讀幾個 values 檔 —— 大 repo 的 `values-<語系>` 有上百個 */
const MAX_VALUES_FILES = 60;

/**
 * 讀這個 drawable 所屬 `res/` 底下所有 `values*` 的顏色定義。
 *
 * **只找最近的那個 `res/`**（同一個 source set）。跨模組的 `@color/` 解析不到，
 * 畫面會把它列成「解析不到的顏色」—— 那比默默畫成別的顏色好。
 */
export async function readResColors(
  repo: string,
  rel: string
): Promise<Record<string, string> | undefined> {
  const parts = rel.split("/");
  const i = parts.lastIndexOf("res");
  if (i < 0) return undefined;
  const resAbs = path.resolve(repo, parts.slice(0, i + 1).join("/"));
  const dirs = await readdir(resAbs, { withFileTypes: true }).catch(() => null);
  if (!dirs) return undefined;

  const out: Record<string, string> = {};
  let read = 0;
  for (const d of dirs) {
    if (!d.isDirectory() || !d.name.startsWith("values")) continue;
    const files = await readdir(path.join(resAbs, d.name)).catch(() => []);
    for (const f of files) {
      if (!f.endsWith(".xml") || read >= MAX_VALUES_FILES) continue;
      read++;
      const s = await readFile(path.join(resAbs, d.name, f), "utf8").catch(() => null);
      // 後讀到的不覆蓋先讀到的：`values/` 在 `values-night` 之前（readdir 是字典序），
      // 所以亮色定義優先 —— 預覽固定畫亮色版，跟 Android Studio 的預設一致
      if (s) for (const [k, v] of Object.entries(parseColorsXml(s))) if (!(k in out)) out[k] = v;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * 把一份 VectorDrawable 的原文轉成可以直接給瀏覽器的 SVG。
 *
 * 顏色一律讀**工作區現在**的 `values*`（不是那個 commit 當時的）——
 * 色票很少跟著單一 icon 一起改，而要按 revision 取就得對每個 values 檔各跑一次
 * `git cat-file`。差異只會出現在「這次同時改了色票」的情況，而那時原始碼分頁看得到。
 */
/**
 * 讀 adaptive icon 三層指到的那幾個 drawable 的原文。
 *
 * 只收**同一個 `res/` 底下、而且是 `<vector>`** 的：指到 PNG／webp 的那種
 * （`mipmap-hdpi/ic_launcher_foreground.png`）在這裡拿不到，呼叫端會把它列成
 * 解析不到的層 —— 那比畫一張少一層的圖好。
 */
export async function readResDrawables(
  repo: string,
  rel: string,
  refs: (string | null)[]
): Promise<Record<string, string> | undefined> {
  const names = refs.filter((r): r is string => !!r && r.startsWith("@")).map(resourceName);
  if (!names.length) return undefined;

  const parts = rel.split("/");
  const i = parts.lastIndexOf("res");
  if (i < 0) return undefined;
  const resAbs = path.resolve(repo, parts.slice(0, i + 1).join("/"));
  const dirs = await readdir(resAbs, { withFileTypes: true }).catch(() => null);
  if (!dirs) return undefined;

  const out: Record<string, string> = {};
  for (const d of dirs) {
    if (!d.isDirectory() || !/^(drawable|mipmap)/.test(d.name)) continue;
    for (const name of names) {
      if (out[name]) continue;
      const s = await readFile(path.join(resAbs, d.name, `${name}.xml`), "utf8").catch(() => null);
      if (s && isVectorDrawableXml(s)) out[name] = s;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

export async function vectorDrawableSvg(
  repo: string,
  rel: string,
  xml: string,
  sizing: SvgSizing = "intrinsic"
): Promise<string | null> {
  const colors = (await readResColors(repo, rel)) ?? {};
  if (isAdaptiveIconXml(xml)) {
    const refs = parseAdaptiveIcon(xml);
    if (!refs) return null;
    const drawables = await readResDrawables(repo, rel, [refs.background, refs.foreground]);
    const a = adaptiveIconToSvg(xml, { colors, drawables }, sizing);
    return "error" in a ? null : a.svg;
  }
  if (!isVectorDrawableXml(xml)) return null;
  const r = vectorDrawableToSvg(xml, colors, sizing);
  return "error" in r ? null : r.svg;
}
