/**
 * 狀態名的顯示用文字。
 *
 * 這個 Jira 站是**中文介面**，所以 API 回來的狀態有幾個是中文（`進行中`、
 * `待辦事項`），其餘是英文（`BACKLOG`、`IN CODE REVIEW`、`Pending`…）。
 * 畫面一律顯示英文（Jay 2026-09-11：整個 km web 都照這條）。
 *
 * ⚠️ **比對仍然用 API 回來的原字串**（見各 rules 檔的 statuses 陣列）——
 * 這裡只換顯示，不要拿翻譯後的字去分組，否則哪天介面語言換了就整批對不上。
 */
export const STATUS_DISPLAY: Record<string, string> = {
  進行中: "In Progress",
  待辦事項: "To Do",
  擱置: "Pending",
  完成: "Done",
};

export function statusLabel(status: string): string {
  return STATUS_DISPLAY[status] ?? status;
}
