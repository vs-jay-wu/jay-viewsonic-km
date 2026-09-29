/**
 * km 工作台的標記（側邊欄用）。
 *
 * ⚠️ **形狀與顏色跟分頁圖示 `app/(km)/icon.svg` 是同一組，改一邊要改另一邊。**
 * 沒辦法共用同一個檔：Next 的 metadata 圖示會被改寫成帶雜湊的網址
 * （`/icon-35zecd.svg?…`），前端引用不到；而那個檔又必須留在 app 目錄下才會
 * 被當成 favicon。所以 `test/kmMark.test.ts` 把兩邊的色碼與 path 釘在一起，
 * 漂掉會紅。
 */
export default function KmMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <rect width="32" height="32" rx="7" fill="#efd9b8" />
      <path
        d="M11 8v16M11 16l8-8M13.5 13.5 20 24"
        fill="none"
        stroke="#7c2d12"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
