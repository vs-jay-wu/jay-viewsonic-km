import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 這個站只給本機閱讀，不部署。
  // lib/workspace.ts 會在 server 端讀 repo 根的 local.workspace.json（gitignored），
  // 所以不能 static export —— 要保留 server render 才能拿到即時的 local/offloaded 狀態。
  outputFileTracingRoot: __dirname,
}

export default nextConfig
