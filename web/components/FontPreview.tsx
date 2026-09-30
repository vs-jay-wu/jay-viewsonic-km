"use client";

import { useEffect, useId, useState } from "react";
import Icon from "@/components/Icon";
import { SCRIPT_PROBES, fontCoverage } from "@/lib/fontCoverageRules";

/**
 * 字型檔的預覽：用 `FontFace` 把它載進來，直接拿它排幾段字。
 *
 * **不掛在 `document.fonts` 之外的地方**：載進來的 family 名字帶著 React 的
 * `useId`，所以同時開兩個字型不會互相蓋掉；離開這個檔就把它移除，
 * 不然整個 app 的字型清單會愈積愈多。
 *
 * **樣本照字型實際涵蓋的文字挑**：讀它自己的 `cmap` 表
 * （`lib/fontCoverageRules.ts`，有測試），沒有中文字的字型就不要排一行中文 ——
 * 排了瀏覽器會拿 fallback 字型畫，看起來像這個字型有中文，那是假的。
 *
 * 檔名與 `OS/2` 的宣告都不可靠；`meta` 表的 `dlng`／`slng` 才是正式的「設計給
 * 哪些語言」，但很少見（抽查 `AbrilFatface-Regular.ttf` 連 `meta` 都沒有）。
 */
const SAMPLE_BY_SCRIPT: Record<string, string> = {
  latin: "The quick brown fox jumps over the lazy dog",
  cjk: "中文字型樣本：ViewBoard 白板、體驗導覽",
  kana: "日本語のサンプル：ひらがな カタカナ",
  hangul: "한글 샘플: 화이트보드",
  cyrillic: "Съешь же ещё этих мягких французских булок",
  greek: "Ζεφύρων πνοιαί, χρυσαλλίδες",
  arabic: "نص تجريبي للخط العربي",
  thai: "ตัวอย่างฟอนต์ภาษาไทย",
  emoji: "😀 🎨 📐 ✅ ⚠️",
};
const DIGITS = "0123456789 · ( ) [ ] { } — … “ ” ‘ ’";

export default function FontPreview({ src, name }: { src: string; name: string }) {
  const family = `km-font-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [text, setText] = useState("");
  /** 這個字型實際涵蓋哪些語系（null＝還沒讀到，或讀不出來） */
  const [scripts, setScripts] = useState<string[] | null>(null);

  useEffect(() => {
    let face: FontFace | null = null;
    let alive = true;
    (async () => {
      try {
        face = new FontFace(family, `url("${src}")`);
        await face.load();
        if (!alive) return;
        document.fonts.add(face);
        setState("ready");
        // 樣本要照涵蓋範圍挑，所以另外把位元組抓回來讀 cmap（同一條唯讀路由）
        const buf = await fetch(src).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
        if (alive && buf) setScripts(fontCoverage(buf));
      } catch {
        if (alive) setState("error");
      }
    })();
    return () => {
      alive = false;
      if (face) document.fonts.delete(face);
    };
  }, [family, src]);

  if (state === "error") {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <p className="flex items-center gap-2 text-sm text-warn">
          <Icon name="alert" size={14} />
          這個字型檔載不起來（格式不支援，或檔案壞了）
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-1.5 text-[11px] text-fg-muted">
        <span className="font-mono">{name}</span>
        {/* 涵蓋哪些文字是讀 cmap 得到的事實，不是從檔名猜的 */}
        {scripts && (
          <span className="text-fg-subtle">
            涵蓋：
            {scripts.length
              ? SCRIPT_PROBES.filter((p) => scripts.includes(p.key))
                  .map((p) => p.label)
                  .join("、")
              : "讀不出 cmap"}
          </span>
        )}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="打字試試看…"
          className="ml-auto w-56 rounded-md border border-line px-2 py-1 text-xs outline-none focus:border-line-strong"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
        {state === "loading" ? (
          <p className="text-sm text-fg-subtle">載入字型中…</p>
        ) : (
          <div style={{ fontFamily: `"${family}", sans-serif` }}>
            {text && (
              <p className="mb-6 break-words border-b border-line pb-6 text-fg" style={{ fontSize: 40 }}>
                {text}
              </p>
            )}
            {(scripts?.length
              ? scripts.map((k) => SAMPLE_BY_SCRIPT[k]).filter(Boolean)
              : Object.values(SAMPLE_BY_SCRIPT).slice(0, 2)
            )
              .concat(DIGITS)
              .map((sample) => (
                <div key={sample} className="mb-5">
                  {[40, 24, 16, 12].map((size) => (
                    <p
                      key={size}
                      className="break-words text-fg"
                      style={{ fontSize: size, lineHeight: 1.4 }}
                    >
                      {sample}
                    </p>
                  ))}
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
