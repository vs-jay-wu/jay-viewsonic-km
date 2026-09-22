import hljs from "highlight.js/lib/common";
import dart from "highlight.js/lib/languages/dart";
import groovy from "highlight.js/lib/languages/groovy";
import dockerfile from "highlight.js/lib/languages/dockerfile";

/**
 * 全 app 共用的 highlight.js 實例。
 *
 * `highlight.js/lib/common` 只含最常見的 37 種，**我們的副檔名表比它多**：
 * `dart`（mvbf 整個專案）、`groovy`（`*.gradle`）、`dockerfile` 三種不在裡面。
 * 沒註冊就呼叫 `hljs.highlight()` 會丟例外，而且**在丟之前先印一行 console.error**
 * —— 呼叫端的 try/catch 擋得住例外，擋不住那行 log，於是 Next 的錯誤浮層會一直跳
 * 「Could not find the language 'dart'」（Jay 2026-09-22 回報）。
 *
 * 所以：**要嘛在這裡註冊，要嘛就不要放進 `changesRules.ts` 的 `LANG` 表。**
 * 兩邊有沒有對上由 `test/highlight.test.ts` 守著。
 *
 * 不直接用完整包（`highlight.js`）是因為它含 190 種語言，體積差很多，
 * 而這裡全是本機瀏覽用的畫面，沒必要為了三種語言把整包拉進來。
 */
hljs.registerLanguage("dart", dart);
hljs.registerLanguage("groovy", groovy);
hljs.registerLanguage("dockerfile", dockerfile);

export default hljs;
