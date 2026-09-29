import { describe, expect, it } from "vitest";
import {
  adaptiveIconToSvg, isAdaptiveIconXml, isVectorDrawableXml, looksLikeAndroidDrawable,
  parseAdaptiveIcon, parseAndroidColor, parseColorsXml, resourceName, vectorDrawableToSvg,
} from "@/lib/vectorDrawableRules";

/** 包一層 <vector>，只測裡面那幾行 */
const V = (inner: string, rootAttrs = "") =>
  `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp"
    android:viewportWidth="24" android:viewportHeight="24" ${rootAttrs}>
  ${inner}
</vector>`;

const svgOf = (xml: string, colors: Record<string, string> = {}) => {
  const r = vectorDrawableToSvg(xml, colors);
  if ("error" in r) throw new Error(r.error);
  return r;
};

describe("parseAndroidColor", () => {
  it("#AARRGGBB 的 alpha 在前，不是 CSS 的 #RRGGBBAA", () => {
    expect(parseAndroidColor("#80FF0000")).toEqual({ color: "#FF0000", alpha: 128 / 255 });
  });

  it("#00000000 是完全透明（drawable 拿它當「不填色」）", () => {
    expect(parseAndroidColor("#00000000")).toEqual({ color: "#000000", alpha: 0 });
  });

  it("三碼與六碼都是不透明", () => {
    expect(parseAndroidColor("#f00")).toEqual({ color: "#ff0000", alpha: 1 });
    expect(parseAndroidColor("#123456")).toEqual({ color: "#123456", alpha: 1 });
  });

  it("@color/x 查得到就展開，查不到回報 unresolved", () => {
    expect(parseAndroidColor("@color/brand", { brand: "#123456" })).toEqual({
      color: "#123456",
      alpha: 1,
    });
    expect(parseAndroidColor("@color/nope", {})).toEqual({ unresolved: "@color/nope" });
  });

  it("參考可以連鎖，但自我參照不會無限迴圈", () => {
    expect(parseAndroidColor("@color/a", { a: "@color/b", b: "#00ff00" })).toEqual({
      color: "#00ff00",
      alpha: 1,
    });
    expect(parseAndroidColor("@color/a", { a: "@color/a" })).toEqual({ unresolved: "@color/a" });
  });
});

describe("vectorDrawableToSvg", () => {
  it("沒有 fillColor 的 path 不能被塗黑（SVG 的預設是黑，Android 的是不填）", () => {
    const { svg } = svgOf(V('<path android:pathData="M0,0h10" android:strokeColor="#fff" android:strokeWidth="2"/>'));
    expect(svg).toContain('fill="none"');
  });

  it("fillAlpha 與顏色自帶的 alpha 相乘", () => {
    const { svg } = svgOf(V('<path android:pathData="M0,0h1" android:fillColor="#80ff0000" android:fillAlpha="0.5"/>'));
    expect(svg).toContain('fill="#ff0000"');
    expect(svg).toContain('fill-opacity="0.251"');
  });

  it("fillType=evenOdd 轉成 fill-rule", () => {
    const { svg } = svgOf(V('<path android:pathData="M0,0h1" android:fillColor="#fff" android:fillType="evenOdd"/>'));
    expect(svg).toContain('fill-rule="evenodd"');
  });

  it("strokeWidth 是 0（或沒寫）時不畫描邊", () => {
    const { svg } = svgOf(V('<path android:pathData="M0,0h1" android:strokeColor="#fff"/>'));
    expect(svg).not.toContain("stroke=");
  });

  it("group 的變換順序是 translate → pivot → rotate → scale", () => {
    const { svg } = svgOf(
      V(`<group android:translateX="2" android:translateY="3" android:pivotX="12" android:pivotY="12"
                android:rotation="90" android:scaleX="2" android:scaleY="0.5">
           <path android:pathData="M0,0h1" android:fillColor="#fff"/>
         </group>`)
    );
    expect(svg).toContain(
      'transform="translate(2 3) translate(12 12) rotate(90) scale(2 0.5) translate(-12 -12)"'
    );
  });

  it("clip-path 跟 transform 掛在同一個 g 上（Android 是在 group 自己的座標系裁切）", () => {
    const { svg } = svgOf(
      V(`<group android:translateX="5">
           <clip-path android:pathData="M0,0h24v24h-24z"/>
           <path android:pathData="M0,0h1" android:fillColor="#fff"/>
         </group>`)
    );
    expect(svg).toMatch(/<g transform="translate\(5 0\)" clip-path="url\(#kmc0\)">/);
    expect(svg).toContain('<clipPath id="kmc0"><path d="M0,0h24v24h-24z"/></clipPath>');
  });

  it("aapt:attr 包的 gradient 轉成 linearGradient 並被 fill 參考", () => {
    const { svg } = svgOf(
      V(`<path android:pathData="M0,0h1">
           <aapt:attr name="android:fillColor">
             <gradient android:type="linear" android:startX="0" android:startY="0"
                       android:endX="24" android:endY="0">
               <item android:offset="0" android:color="#ff0000"/>
               <item android:offset="1" android:color="#0000ff"/>
             </gradient>
           </aapt:attr>
         </path>`)
    );
    expect(svg).toContain('<linearGradient id="kmg0"');
    expect(svg).toContain('fill="url(#kmg0)"');
    expect(svg).toContain('<stop offset="0" stop-color="#ff0000" stop-opacity="1"/>');
  });

  it("解析不到的顏色會被列出來，而且畫成灰色而不是消失", () => {
    const r = svgOf(V('<path android:pathData="M0,0h1" android:fillColor="@color/gone"/>'));
    expect(r.unresolved).toEqual(["@color/gone"]);
    expect(r.svg).toContain('fill="#9ca3af"');
  });

  it("viewBox 走 viewport，width/height 另外回報（dp 不是座標）", () => {
    const r = svgOf(V('<path android:pathData="M0,0h1" android:fillColor="#fff"/>', "").replace(
      'android:viewportWidth="24" android:viewportHeight="24"',
      'android:viewportWidth="48" android:viewportHeight="60"'
    ));
    expect(r.svg).toContain('viewBox="0 0 48 60"');
    expect(r).toMatchObject({ widthDp: 24, heightDp: 24, viewportWidth: 48, viewportHeight: 60 });
  });

  it("缺 viewport 或根元素不是 vector 都回 error，不會畫出半張圖", () => {
    expect(vectorDrawableToSvg("<shape><solid android:color=\"#fff\"/></shape>")).toHaveProperty("error");
    expect(
      vectorDrawableToSvg('<vector xmlns:android="x"><path android:pathData="M0,0"/></vector>')
    ).toHaveProperty("error");
  });

  it("輸出只含白名單元素 —— 原文裡的 script／onload 不會流到 DOM", () => {
    const { svg } = svgOf(
      V(`<script>alert(1)</script>
         <path android:pathData="M0,0h1&quot; onload=&quot;alert(1)" android:fillColor="#fff"/>`)
    );
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain("onload=\"");
  });
});

describe("判斷是不是 drawable", () => {
  it("宣告與註解不影響根元素的判斷", () => {
    expect(isVectorDrawableXml('<?xml version="1.0"?>\n<!-- x -->\n<vector/>')).toBe(true);
    expect(isVectorDrawableXml('<?xml version="1.0"?>\n<shape/>')).toBe(false);
  });

  it("只有 res/drawable 之類底下的 xml 才當 drawable 看", () => {
    expect(looksLikeAndroidDrawable("app/src/main/res/drawable/ic_a.xml")).toBe(true);
    expect(looksLikeAndroidDrawable("app/src/main/res/drawable-night/ic_a.xml")).toBe(true);
    expect(looksLikeAndroidDrawable("app/src/main/res/layout/a.xml")).toBe(false);
    expect(looksLikeAndroidDrawable("pubspec.xml")).toBe(false);
  });
});

describe("parseColorsXml", () => {
  it("抓得到 name 與值，值可以是另一個參考", () => {
    expect(
      parseColorsXml(`<resources>
        <color name="white">#FFFFFFFF</color>
        <color name="brand">@color/white</color>
      </resources>`)
    ).toEqual({ white: "#FFFFFFFF", brand: "@color/white" });
  });
});

// ─── adaptive icon ──────────────────────────────────────────────

const ADAPTIVE = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@color/ic_launcher_background" />
  <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>`;

/** 前景那層：viewport 24，跟畫布的 108 不一樣，才測得出有沒有縮放 */
const FG = `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp"
    android:viewportWidth="24" android:viewportHeight="24">
  <path android:pathData="M0,0h24v24h-24z" android:fillColor="#ff0000"/>
</vector>`;

const adaptiveOf = (
  res: Parameters<typeof adaptiveIconToSvg>[1],
  mask?: Parameters<typeof adaptiveIconToSvg>[3]
) => {
  const r = adaptiveIconToSvg(ADAPTIVE, res, "fill", mask);
  if ("error" in r) throw new Error(r.error);
  return r;
};

describe("adaptive icon", () => {
  it("認得根元素，並取出三層各自指到什麼", () => {
    expect(isAdaptiveIconXml(ADAPTIVE)).toBe(true);
    expect(parseAdaptiveIcon(ADAPTIVE)).toEqual({
      background: "@color/ic_launcher_background",
      foreground: "@drawable/ic_launcher_foreground",
      monochrome: null,
    });
    expect(resourceName("@drawable/ic_launcher_foreground")).toBe("ic_launcher_foreground");
  });

  it("背景是顏色參考就畫成整塊底色", () => {
    const { svg } = adaptiveOf({ colors: { ic_launcher_background: "#123456" } });
    expect(svg).toContain('<rect width="108" height="108" fill="#123456"');
  });

  it("前景的 viewport 不是 108 時要縮放（不縮的話只佔左上角 24/108）", () => {
    const { svg } = adaptiveOf({ drawables: { ic_launcher_foreground: FG } });
    expect(svg).toContain('transform="scale(4.5 4.5)"');
  });

  it("畫布固定 108×108（adaptive icon 的規格），viewBox 不跟著子層走", () => {
    const r = adaptiveOf({ drawables: { ic_launcher_foreground: FG } });
    expect(r.svg).toContain('viewBox="0 0 108 108"');
    expect(r).toMatchObject({ viewportWidth: 108, viewportHeight: 108 });
  });

  it("遮罩：預設裁切，選 full 就完全不裁", () => {
    expect(adaptiveOf({ colors: { ic_launcher_background: "#fff" } }).svg).toContain(
      'clip-path="url(#admask)"'
    );
    expect(adaptiveOf({ colors: { ic_launcher_background: "#fff" } }, "circle").svg).toContain(
      "<circle"
    );
    expect(adaptiveOf({ colors: { ic_launcher_background: "#fff" } }, "full").svg).not.toContain(
      "clip-path"
    );
  });

  it("兩層各自的 gradient id 不會撞在一起", () => {
    const grad = `<vector xmlns:android="http://schemas.android.com/apk/res/android"
        android:width="108dp" android:height="108dp"
        android:viewportWidth="108" android:viewportHeight="108">
      <path android:pathData="M0,0h108v108h-108z">
        <aapt:attr name="android:fillColor">
          <gradient android:startX="0" android:startY="0" android:endX="108" android:endY="0">
            <item android:offset="0" android:color="#000"/>
            <item android:offset="1" android:color="#fff"/>
          </gradient>
        </aapt:attr>
      </path>
    </vector>`;
    const r = adaptiveIconToSvg(ADAPTIVE, {
      drawables: { ic_launcher_background: grad, ic_launcher_foreground: grad },
    });
    if ("error" in r) throw new Error(r.error);
    const ids = [...r.svg.matchAll(/<linearGradient id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it("指到 PNG（拿不到原文）的那層列進 unresolved，不是默默少一層", () => {
    expect(adaptiveOf({ colors: { ic_launcher_background: "#fff" } }).unresolved).toEqual([
      "@drawable/ic_launcher_foreground",
    ]);
  });
});
