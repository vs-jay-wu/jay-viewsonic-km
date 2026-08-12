import fs from 'node:fs'
import path from 'node:path'

/**
 * repo 在本機是 local 還是外接，是 local.workspace.json 管的動態狀態。
 * 所以這裡在 render 時去查，絕不寫進 data/repos.ts。
 *
 * 檔案系統是權威來源（真的在不在），offloaded 清單只是宣告的意圖 ——
 * 兩者不一致時（例如剛搬完還沒更新清單）以檔案系統為準。
 */
export type RepoLocation = 'local' | 'offloaded' | 'excluded' | 'unknown'

type WorkspaceOrg = {
  localPath: string
  externalPath: string
  offloaded?: string[]
  excluded?: string[]
}

const ORG = 'Viewsonic-EDU'

/** docs/domains/av-streaming/src/lib → repo 根 */
const REPO_ROOT = path.resolve(process.cwd(), '..', '..', '..')
const CONFIG_PATH = path.join(REPO_ROOT, 'local.workspace.json')

function readOrg(): WorkspaceOrg | null {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8')
    // 這個檔案含 token，只取需要的欄位，不要整包往外傳。
    const parsed = JSON.parse(raw) as { orgs?: Record<string, WorkspaceOrg> }
    const org = parsed.orgs?.[ORG]
    if (!org) return null
    return {
      localPath: org.localPath,
      externalPath: org.externalPath,
      offloaded: org.offloaded ?? [],
      excluded: org.excluded ?? [],
    }
  } catch {
    // 檔案不存在（別台機器 clone 下來時）就降級成 unknown，不要讓整站掛掉。
    return null
  }
}

function exists(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory()
  } catch {
    return false
  }
}

export type WorkspaceIndex = {
  available: boolean
  locate: (repoName: string) => RepoLocation
}

export function loadWorkspaceIndex(): WorkspaceIndex {
  const org = readOrg()
  if (!org) {
    return { available: false, locate: () => 'unknown' }
  }

  const excluded = new Set(org.excluded)
  const offloaded = new Set(org.offloaded)

  return {
    available: true,
    locate(repoName: string): RepoLocation {
      if (excluded.has(repoName)) return 'excluded'
      if (org.localPath && exists(path.join(org.localPath, repoName))) return 'local'
      if (org.externalPath && exists(path.join(org.externalPath, repoName))) return 'offloaded'
      // 檔案系統上兩邊都找不到 —— 只能回報清單怎麼說。
      if (offloaded.has(repoName)) return 'offloaded'
      return 'unknown'
    },
  }
}

export const LOCATION_META: Record<
  RepoLocation,
  { label: string; hint: string; className: string }
> = {
  local: {
    label: 'local',
    hint: '在本機主碟，可直接開',
    className: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  },
  offloaded: {
    label: 'offloaded',
    hint: '在外接碟，需接上才能開',
    className: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  },
  excluded: {
    label: 'excluded',
    hint: '受保護的敏感資料夾，不讀取',
    className: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  },
  unknown: {
    label: '?',
    hint: '兩邊都找不到，可能尚未 clone',
    className: 'bg-slate-500/15 text-slate-400 ring-slate-500/30',
  },
}
