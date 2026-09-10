// server 啟動時跑一次（每個 Next.js server instance 一次）。
// PR 巡邏的排程掛在這裡：設定存在 data/local-state/pr-inbox-watch.json，
// 所以 dev server 重開會自己接回上次的狀態。
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { initScheduler } = await import("@/lib/prInboxScheduler");
  await initScheduler();
}
