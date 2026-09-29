/**
 * Android VectorDrawable（`res/drawable/*.xml` 裡 `<vector>` 開頭的那種）轉 SVG。
 *
 * **不是換個副檔名就能用**：瀏覽器看不懂 `<vector>`／`android:pathData`。
 * 兩者唯一共通的是 path 的 `d` 語法（Android 的 `pathData` 就是 SVG path 語法），
 * 其餘元素、屬性名、顏色格式、預設值全都要翻譯。
 *
 * 這裡**自己組出 SVG**、不是把原文轉手丟進 DOM：輸出只會有這個檔白名單內的
 * 元素與屬性，所以拿去 `dangerouslySetInnerHTML` 是安全的（repo 裡的檔案不可信到
 * 可以直接注入的程度 —— 外接碟上的 repo 也看得到）。
 *
 * 不碰檔案系統，所以客戶端也能 import（見 AGENTS.md「純規則要跟碰檔案的程式分開」）。
 */

export interface VectorSvg {
  /** 完整的 `<svg …>…</svg>` 字串 */
  svg: string;
  /** `android:width` / `android:height`（dp），畫面上標示用 */
  widthDp: number | null;
  heightDp: number | null;
  viewportWidth: number;
  viewportHeight: number;
  /**
   * 解析不掉的顏色參考（`@color/x`、`?attr/x`）。
   * **要顯示出來** —— 不講的話畫面上只會少一塊顏色，看起來像圖檔本身有問題。
   */
  unresolved: string[];
}

/** 解析不到的顏色用它頂替。刻意挑一個「一看就知道不對」的中性灰 */
const UNRESOLVED_FILL = "#9ca3af";

// ─── 極簡 XML 解析 ───────────────────────────────────────────────
// 只處理 drawable 會出現的形狀：宣告、註解、成對／自閉標籤、屬性。
// 不支援 DTD、CDATA、實體以外的文字節點（drawable 沒有文字內容）。

interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'",
};

function decode(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m]);
}

export function parseXml(src: string): XmlNode | null {
  let i = 0;
  const stack: XmlNode[] = [];
  let root: XmlNode | null = null;

  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt < 0) break;
    i = lt + 1;

    if (src.startsWith("!--", i)) {
      const end = src.indexOf("-->", i);
      i = end < 0 ? src.length : end + 3;
      continue;
    }
    if (src[i] === "?" || src[i] === "!") {
      const end = src.indexOf(">", i);
      i = end < 0 ? src.length : end + 1;
      continue;
    }
    if (src[i] === "/") {
      const end = src.indexOf(">", i);
      i = end < 0 ? src.length : end + 1;
      stack.pop();
      continue;
    }

    const m = /^[A-Za-z_][\w.:-]*/.exec(src.slice(i));
    if (!m) return null;
    const tag = m[0];
    i += tag.length;

    const attrs: Record<string, string> = {};
    for (;;) {
      while (i < src.length && /\s/.test(src[i])) i++;
      if (src[i] === ">" || src.startsWith("/>", i)) break;
      const am = /^([A-Za-z_][\w.:-]*)\s*=\s*("([^"]*)"|'([^']*)')/.exec(src.slice(i));
      if (!am) {
        // 屬性寫壞了就跳到標籤結尾，不要整份放棄
        const end = src.indexOf(">", i);
        i = end < 0 ? src.length : end;
        break;
      }
      attrs[am[1]] = decode(am[3] ?? am[4] ?? "");
      i += am[0].length;
    }

    const selfClose = src.startsWith("/>", i);
    i = src.indexOf(">", i) + 1 || src.length;

    const node: XmlNode = { tag, attrs, children: [] };
    if (stack.length) stack[stack.length - 1].children.push(node);
    else if (root) return root; // 第二個根節點：忽略
    else root = node;
    if (!selfClose) stack.push(node);
  }
  return root;
}

/** `android:foo` / `foo` 都收；回傳第一個有值的 */
function attr(n: XmlNode, name: string): string | undefined {
  return n.attrs[`android:${name}`] ?? n.attrs[name];
}

function num(v: string | undefined): number | null {
  if (v === undefined) return null;
  const f = parseFloat(v);
  return Number.isFinite(f) ? f : null;
}

// ─── 顏色 ───────────────────────────────────────────────────────

interface Paint {
  color: string;
  /** 顏色自帶的 alpha（`#AARRGGBB` 的 AA）。1 代表不透明 */
  alpha: number;
}

/**
 * Android 的顏色字面值有四種長度，而且**帶 alpha 的是 `#AARRGGBB`（alpha 在前）**，
 * 跟 CSS 的 `#RRGGBBAA` 剛好相反。照 CSS 解會把
 * `#00000000`（完全透明，這個 repo 裡 1000+ 個 path 拿它當「不填色」）
 * 讀成不透明的黑，整張圖變成一塊黑。
 */
export function parseAndroidColor(
  raw: string | undefined,
  colors: Record<string, string> = {},
  seen = new Set<string>()
): Paint | { unresolved: string } | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!v) return null;

  if (v.startsWith("@") || v.startsWith("?")) {
    const key = v.replace(/^[@?]/, "").replace(/^\+?(android:)?(color|attr)\//, "");
    const hit = colors[key];
    if (hit === undefined || seen.has(key)) return { unresolved: v };
    seen.add(key); // `@color/a` → `@color/b` 的鏈，擋住自我參照
    return parseAndroidColor(hit, colors, seen);
  }

  if (!v.startsWith("#")) return { unresolved: v };
  const h = v.slice(1);
  const ok = /^[0-9a-fA-F]+$/.test(h);
  if (!ok) return { unresolved: v };
  const x2 = (c: string) => c + c;
  if (h.length === 3) return { color: `#${x2(h[0])}${x2(h[1])}${x2(h[2])}`, alpha: 1 };
  if (h.length === 4) {
    return { color: `#${x2(h[1])}${x2(h[2])}${x2(h[3])}`, alpha: parseInt(x2(h[0]), 16) / 255 };
  }
  if (h.length === 6) return { color: `#${h}`, alpha: 1 };
  if (h.length === 8) return { color: `#${h.slice(2)}`, alpha: parseInt(h.slice(0, 2), 16) / 255 };
  return { unresolved: v };
}

// ─── 轉換 ───────────────────────────────────────────────────────

const CAP: Record<string, string> = { butt: "butt", round: "round", square: "square" };
const JOIN: Record<string, string> = { miter: "miter", round: "round", bevel: "bevel" };

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 只讓數值屬性進輸出，擋掉任何字串注入 */
function fmt(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

export function isVectorDrawableXml(text: string): boolean {
  // 去掉宣告與註解之後，第一個元素是不是 <vector
  const head = text.replace(/<\?[\s\S]*?\?>/g, "").replace(/<!--[\s\S]*?-->/g, "").trimStart();
  return head.startsWith("<vector");
}

/** 副檔名 ＋ 位置的粗篩（內容才是真正的判準，這只是省一次解析） */
export function looksLikeAndroidDrawable(filePath: string): boolean {
  return /(^|\/)res\/(drawable|mipmap|color)[^/]*\/[^/]+\.xml$/.test(filePath);
}

/**
 * `fill` ＝ `width/height="100%"`，撐滿容器（畫面上的預覽用）。
 * `intrinsic` ＝ 寫出 dp 尺寸，這樣當 `<img src>` 用時瀏覽器才量得到
 * `naturalWidth/Height` —— 圖片比對的共用縮放比是靠它算的，沒有的話
 * Chrome 會回預設的 300×150，兩側看起來一樣大。
 */
export type SvgSizing = "fill" | "intrinsic";

interface VectorParts {
  defs: string[];
  /** `<defs>` 以外的內容（已套用 vector 自己的 alpha） */
  content: string;
  vw: number;
  vh: number;
  wDp: number | null;
  hDp: number | null;
  unresolved: string[];
}

/**
 * 轉換的本體。**`idPrefix` 不能省** —— adaptive icon 會把兩份轉換結果放進同一份
 * SVG，兩邊各自產生的 `kmg0` / `kmc0` 會撞在一起（SVG 的 id 是整份文件共用的），
 * 撞到的那一層會靜默吃到另一層的漸層或裁切路徑。
 */
function buildVector(
  xml: string,
  colors: Record<string, string> = {},
  idPrefix = ""
): VectorParts | { error: string } {
  const root = parseXml(xml);
  if (!root) return { error: "XML 解析失敗" };
  if (root.tag !== "vector") return { error: `根元素是 <${root.tag}>，不是 <vector>` };

  const vw = num(attr(root, "viewportWidth"));
  const vh = num(attr(root, "viewportHeight"));
  if (!vw || !vh) return { error: "缺少 viewportWidth / viewportHeight" };

  const unresolved = new Set<string>();
  const defs: string[] = [];
  let seq = 0;

  const paintOf = (raw: string | undefined): Paint | null => {
    const p = parseAndroidColor(raw, colors);
    if (!p) return null;
    if ("unresolved" in p) {
      unresolved.add(p.unresolved);
      return { color: UNRESOLVED_FILL, alpha: 1 };
    }
    return p;
  };

  /** `<aapt:attr name="android:fillColor"><gradient>` → `<linearGradient>` / `<radialGradient>` */
  const gradientOf = (holder: XmlNode, which: string): string | null => {
    const wrap = holder.children.find(
      (c) => c.tag === "aapt:attr" && (c.attrs.name === `android:${which}` || c.attrs.name === which)
    );
    const g = wrap?.children.find((c) => c.tag === "gradient");
    if (!g) return null;

    const id = `${idPrefix}kmg${seq++}`;
    const stops: string[] = [];
    const push = (offset: number, raw: string | undefined) => {
      const p = raw === undefined ? null : paintOf(raw);
      if (!p) return;
      stops.push(
        `<stop offset="${fmt(offset)}" stop-color="${esc(p.color)}" stop-opacity="${fmt(p.alpha)}"/>`
      );
    };
    const items = g.children.filter((c) => c.tag === "item");
    if (items.length) {
      for (const it of items) push(num(attr(it, "offset")) ?? 0, attr(it, "color"));
    } else {
      push(0, attr(g, "startColor"));
      if (attr(g, "centerColor")) push(0.5, attr(g, "centerColor"));
      push(1, attr(g, "endColor"));
    }
    if (!stops.length) return null;

    const type = attr(g, "type") ?? "linear";
    if (type === "radial") {
      const cx = num(attr(g, "centerX")) ?? 0;
      const cy = num(attr(g, "centerY")) ?? 0;
      const r = num(attr(g, "gradientRadius")) ?? 0;
      defs.push(
        `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(r)}">${stops.join("")}</radialGradient>`
      );
    } else {
      // sweep 沒有 SVG 對應，退回線性 —— 總比整塊不畫好，且會在 unresolved 之外自己看得出來
      const x1 = num(attr(g, "startX")) ?? 0;
      const y1 = num(attr(g, "startY")) ?? 0;
      const x2 = num(attr(g, "endX")) ?? 0;
      const y2 = num(attr(g, "endY")) ?? 0;
      defs.push(
        `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}">${stops.join("")}</linearGradient>`
      );
    }
    return `url(#${id})`;
  };

  const pathEl = (n: XmlNode): string => {
    const d = attr(n, "pathData");
    if (!d) return "";
    const a: string[] = [`d="${esc(d)}"`];

    const fillGrad = gradientOf(n, "fillColor");
    const fill = paintOf(attr(n, "fillColor"));
    const fillAlpha = num(attr(n, "fillAlpha")) ?? 1;
    if (fillGrad) {
      a.push(`fill="${fillGrad}"`, `fill-opacity="${fmt(fillAlpha)}"`);
    } else if (fill) {
      a.push(`fill="${esc(fill.color)}"`, `fill-opacity="${fmt(fill.alpha * fillAlpha)}"`);
    } else {
      // ⚠️ SVG 的 fill 預設是黑色，Android 的 fillColor 預設是「不填」。
      // 不寫死 none 的話，所有只有描邊的 path 都會被塗黑。
      a.push(`fill="none"`);
    }
    if (attr(n, "fillType")?.toLowerCase() === "evenodd") a.push(`fill-rule="evenodd"`);

    const strokeGrad = gradientOf(n, "strokeColor");
    const stroke = paintOf(attr(n, "strokeColor"));
    const sw = num(attr(n, "strokeWidth")) ?? 0;
    if ((strokeGrad || stroke) && sw > 0) {
      a.push(`stroke="${strokeGrad ?? esc(stroke!.color)}"`, `stroke-width="${fmt(sw)}"`);
      const sa = (num(attr(n, "strokeAlpha")) ?? 1) * (strokeGrad ? 1 : stroke!.alpha);
      a.push(`stroke-opacity="${fmt(sa)}"`);
      const cap = CAP[attr(n, "strokeLineCap") ?? ""];
      if (cap) a.push(`stroke-linecap="${cap}"`);
      const join = JOIN[attr(n, "strokeLineJoin") ?? ""];
      if (join) a.push(`stroke-linejoin="${join}"`);
      const ml = num(attr(n, "strokeMiterLimit"));
      if (ml !== null) a.push(`stroke-miterlimit="${fmt(ml)}"`);
    }
    return `<path ${a.join(" ")}/>`;
  };

  /**
   * group 的變換順序跟 Android 一致：先 translate、再繞 pivot 旋轉、最後縮放。
   * 寫錯順序不會有錯誤訊息，只會讓圖歪掉。
   */
  const groupEl = (n: XmlNode): string => {
    const tx = num(attr(n, "translateX")) ?? 0;
    const ty = num(attr(n, "translateY")) ?? 0;
    const px = num(attr(n, "pivotX")) ?? 0;
    const py = num(attr(n, "pivotY")) ?? 0;
    const rot = num(attr(n, "rotation")) ?? 0;
    const sx = num(attr(n, "scaleX")) ?? 1;
    const sy = num(attr(n, "scaleY")) ?? 1;

    const t: string[] = [];
    if (tx || ty) t.push(`translate(${fmt(tx)} ${fmt(ty)})`);
    if (rot || sx !== 1 || sy !== 1) {
      if (px || py) t.push(`translate(${fmt(px)} ${fmt(py)})`);
      if (rot) t.push(`rotate(${fmt(rot)})`);
      if (sx !== 1 || sy !== 1) t.push(`scale(${fmt(sx)} ${fmt(sy)})`);
      if (px || py) t.push(`translate(${fmt(-px)} ${fmt(-py)})`);
    }

    const clips = n.children.filter((c) => c.tag === "clip-path").map((c) => attr(c, "pathData")).filter(Boolean);
    const a: string[] = [];
    if (t.length) a.push(`transform="${t.join(" ")}"`);
    if (clips.length) {
      const id = `${idPrefix}kmc${seq++}`;
      defs.push(`<clipPath id="${id}">${clips.map((d) => `<path d="${esc(d!)}"/>`).join("")}</clipPath>`);
      a.push(`clip-path="url(#${id})"`);
    }
    return `<g${a.length ? " " + a.join(" ") : ""}>${body(n)}</g>`;
  };

  const body = (n: XmlNode): string =>
    n.children
      .map((c) => (c.tag === "path" ? pathEl(c) : c.tag === "group" ? groupEl(c) : ""))
      .join("");

  const inner = body(root);
  const alpha = num(attr(root, "alpha"));
  const wrapped = alpha !== null && alpha < 1 ? `<g opacity="${fmt(alpha)}">${inner}</g>` : inner;

  return {
    defs,
    content: wrapped,
    vw,
    vh,
    wDp: num((attr(root, "width") ?? "").replace(/dp|dip|px/i, "")),
    hDp: num((attr(root, "height") ?? "").replace(/dp|dip|px/i, "")),
    unresolved: [...unresolved],
  };
}

/** 依 sizing 給外層 `<svg>` 的 width/height 屬性 */
function sizeAttrs(sizing: SvgSizing, w: number, h: number): string {
  return sizing === "intrinsic"
    ? `width="${fmt(w)}" height="${fmt(h)}"`
    : `width="100%" height="100%"`;
}

export function vectorDrawableToSvg(
  xml: string,
  colors: Record<string, string> = {},
  sizing: SvgSizing = "fill"
): VectorSvg | { error: string } {
  const v = buildVector(xml, colors);
  if ("error" in v) return v;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(v.vw)} ${fmt(v.vh)}" ` +
    `${sizeAttrs(sizing, v.wDp ?? v.vw, v.hDp ?? v.vh)} preserveAspectRatio="xMidYMid meet">` +
    (v.defs.length ? `<defs>${v.defs.join("")}</defs>` : "") +
    v.content +
    `</svg>`;
  return {
    svg,
    widthDp: v.wDp,
    heightDp: v.hDp,
    viewportWidth: v.vw,
    viewportHeight: v.vh,
    unresolved: v.unresolved,
  };
}

/**
 * 從 `res/values`（含 `values-night` 等）底下的 xml 抓 `<color name="x">#…</color>`。
 *
 * 值可能再指到另一個名字（`@color/y`），所以這裡只收原文，
 * 解析鏈交給 `parseAndroidColor`。
 */
export function parseColorsXml(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<color\s+name\s*=\s*"([^"]+)"\s*>([^<]*)<\/color>/g;
  for (let m = re.exec(xml); m; m = re.exec(xml)) out[m[1]] = m[2].trim();
  return out;
}

// ─── adaptive icon（`mipmap-anydpi-v26/ic_launcher.xml`）────────────────────

/**
 * adaptive icon 的畫布是 **108×108dp**，而啟動器只保證中間 **72×72** 看得到
 * （四周 18dp 是給視差／縮放動畫用的裁切餘裕）。
 * 預覽把遮罩畫出來，才看得出「圖被切掉多少」—— 這是這種檔案最常出的問題。
 */
export const ADAPTIVE_SIZE = 108;
/** 遮罩形狀。`full` 是不裁切（看得到完整 108 的內容，含會被切掉的部分） */
export type AdaptiveMask = "squircle" | "circle" | "square" | "full";

export interface AdaptiveIconRefs {
  background: string | null;
  foreground: string | null;
  monochrome: string | null;
}

export function isAdaptiveIconXml(text: string): boolean {
  const head = text.replace(/<\?[\s\S]*?\?>/g, "").replace(/<!--[\s\S]*?-->/g, "").trimStart();
  return head.startsWith("<adaptive-icon");
}

/**
 * 取出三層各自指到什麼（`@drawable/x`、`@color/y`、`@mipmap/z` 的原文）。
 *
 * 兩種寫法都收：屬性形（`<background android:drawable="@color/x"/>`）與
 * 子元素形（`<background><color android:color="#fff"/></background>`）。
 */
export function parseAdaptiveIcon(xml: string): AdaptiveIconRefs | null {
  const root = parseXml(xml);
  if (!root || root.tag !== "adaptive-icon") return null;
  const layer = (tag: string): string | null => {
    const n = root.children.find((c) => c.tag === tag);
    if (!n) return null;
    const d = attr(n, "drawable");
    if (d) return d;
    const color = n.children.find((c) => c.tag === "color");
    return color ? attr(color, "color") ?? null : null;
  };
  return {
    background: layer("background"),
    foreground: layer("foreground"),
    monochrome: layer("monochrome"),
  };
}

/** `@drawable/ic_x` → `ic_x`（`@mipmap/`、`@android:drawable/` 也一樣） */
export function resourceName(ref: string): string {
  return ref.replace(/^[@?]/, "").replace(/^\+?(android:)?[a-z]+\//, "");
}

function maskPath(mask: AdaptiveMask): string | null {
  const s = ADAPTIVE_SIZE;
  switch (mask) {
    // 圓角方形。Android 的實際遮罩由各家啟動器決定，這裡取 Google 預設那種
    // 「圓角很大的方形」，比例是實測 Pixel 啟動器的近似值
    case "squircle":
      return `<rect x="9" y="9" width="${s - 18}" height="${s - 18}" rx="${(s - 18) * 0.28}"/>`;
    case "circle":
      return `<circle cx="${s / 2}" cy="${s / 2}" r="${(s - 18) / 2}"/>`;
    case "square":
      return `<rect x="9" y="9" width="${s - 18}" height="${s - 18}"/>`;
    case "full":
      return null;
  }
}

/**
 * 把 adaptive icon 合成一張 SVG。
 *
 * `drawables` 是「資源名 → 那個 drawable 的原文」，由呼叫端先讀好
 * （純規則檔不碰檔案系統）。指到 PNG／webp 的那種這裡拿不到，會列進 unresolved。
 */
export function adaptiveIconToSvg(
  xml: string,
  res: { colors?: Record<string, string>; drawables?: Record<string, string> } = {},
  sizing: SvgSizing = "fill",
  mask: AdaptiveMask = "squircle"
): VectorSvg | { error: string } {
  const refs = parseAdaptiveIcon(xml);
  if (!refs) return { error: "根元素不是 <adaptive-icon>" };
  const colors = res.colors ?? {};
  const drawables = res.drawables ?? {};

  const unresolved: string[] = [];
  const defs: string[] = [];
  const layers: string[] = [];
  const S = ADAPTIVE_SIZE;

  const addLayer = (ref: string | null, key: string) => {
    if (!ref) return;
    // 先當顏色試（`@color/x` 或字面值）——背景最常見的就是純色
    const paint = parseAndroidColor(ref, colors);
    if (paint && !("unresolved" in paint)) {
      layers.push(
        `<rect width="${S}" height="${S}" fill="${esc(paint.color)}" fill-opacity="${fmt(paint.alpha)}"/>`
      );
      return;
    }
    const name = resourceName(ref);
    const child = drawables[name];
    if (!child) {
      unresolved.push(ref);
      return;
    }
    const v = buildVector(child, colors, `${key}_`);
    if ("error" in v) {
      unresolved.push(ref);
      return;
    }
    defs.push(...v.defs);
    unresolved.push(...v.unresolved);
    // 子層自己的 viewport 未必是 108，縮放到畫布上
    const sx = S / v.vw;
    const sy = S / v.vh;
    layers.push(
      sx === 1 && sy === 1 ? v.content : `<g transform="scale(${fmt(sx)} ${fmt(sy)})">${v.content}</g>`
    );
  };

  addLayer(refs.background, "bg");
  addLayer(refs.foreground, "fg");

  const shape = maskPath(mask);
  let body = layers.join("");
  if (shape) {
    defs.push(`<clipPath id="admask">${shape}</clipPath>`);
    body = `<g clip-path="url(#admask)">${body}</g>`;
  }

  return {
    svg:
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" ` +
      `${sizeAttrs(sizing, S, S)} preserveAspectRatio="xMidYMid meet">` +
      (defs.length ? `<defs>${defs.join("")}</defs>` : "") +
      body +
      `</svg>`,
    widthDp: S,
    heightDp: S,
    viewportWidth: S,
    viewportHeight: S,
    unresolved: [...new Set(unresolved)],
  };
}
