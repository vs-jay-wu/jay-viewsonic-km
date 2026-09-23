import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * 建置產物寫到哪。
   *
   * **`npm run build` 走 `.next-build`，dev server 留在 `.next`**：兩邊共用同一個
   * 目錄時，dev server 會開始送舊的產物，而且沒有任何徵兆 —— 2026-09-23 實測，
   * 對話紀錄面板的 CSS 停在做深色模式之前的版本（對比只剩 1.12），而源碼一直是
   * 對的。詳見 `AGENTS.md`。
   *
   * ⚠️ 這個版本的 Next **沒有 `--distDir` 這個 CLI 旗標**（實測 `unknown option`），
   * 只能從設定檔給，所以用環境變數切。
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
