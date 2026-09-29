import { describe, expect, it } from "vitest";
import { splitHighlightedLines } from "@/lib/highlightLines";

describe("splitHighlightedLines", () => {
  it("跨行的 span 每一行都要自己帶著 class", () => {
    // hljs 對多行註解的實際輸出形狀（只開一個 span）
    const html = '<span class="hljs-comment">/**\n * a\n * b\n */</span>';
    expect(splitHighlightedLines(html)).toEqual([
      '<span class="hljs-comment">/**</span>',
      '<span class="hljs-comment"> * a</span>',
      '<span class="hljs-comment"> * b</span>',
      '<span class="hljs-comment"> */</span>',
    ]);
  });

  it("單行的不受影響", () => {
    const html = '<span class="hljs-keyword">val</span> y = <span class="hljs-number">1</span>';
    expect(splitHighlightedLines(html)).toEqual([html]);
  });

  it("巢狀的 span 照順序關、照順序開回來", () => {
    const html = '<span class="a">1<span class="b">2\n3</span>4</span>';
    expect(splitHighlightedLines(html)).toEqual([
      '<span class="a">1<span class="b">2</span></span>',
      '<span class="a"><span class="b">3</span>4</span>',
    ]);
  });

  it("行數跟原文的換行數一致（空行不會被吃掉）", () => {
    expect(splitHighlightedLines("a\n\nb")).toEqual(["a", "", "b"]);
    expect(splitHighlightedLines("")).toEqual([""]);
  });

  it("不改動文字內容，也不吞掉跳脫過的角括號", () => {
    const html = '<span class="hljs-string">"&lt;a&gt;"</span>\nx';
    expect(splitHighlightedLines(html)).toEqual(['<span class="hljs-string">"&lt;a&gt;"</span>', "x"]);
  });
});
