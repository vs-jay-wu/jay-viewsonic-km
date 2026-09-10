// server 啟動時跑一次（每個 Next.js server instance 一次）。
// 兩個排程掛在這裡，設定都存在 data/local-state/ 底下，所以 dev server
// 重開會自己接回上次的狀態：
//   - PR 巡邏（別人的單，會叫 AI）
//   - 我的 PR（自己的單，只抓狀態與通知，不用 AI）
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const [{ initScheduler: initPrInbox }, { initScheduler: initMyPrs }] = await Promise.all([
    import("@/lib/prInboxScheduler"),
    import("@/lib/myPrs"),
  ]);
  await Promise.all([
    initPrInbox().catch(() => undefined),
    initMyPrs().catch(() => undefined),
  ]);
}
