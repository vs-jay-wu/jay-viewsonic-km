/**
 * 這個 domain 的型別骨幹。
 *
 * 設計原則：知識存成 typed data，不寫死在 JSX 裡。
 * 這樣分群表、資料路徑圖、概念頁的「哪些 repo 用到」全部由同一份資料生成，
 * 改一次就同步；壞連結會變成 TS 編譯錯誤而不是點下去 404。
 */

/** 影音資料從螢幕到對面螢幕，會經過的環節。順序即 pipeline 順序。 */
export const PIPELINE_STAGES = [
  'discover',
  'auth',
  'capture',
  'encode',
  'mux',
  'signal',
  'transport',
  'relay',
  'demux',
  'decode',
  'render',
  'store',
  'control',
] as const

export type PipelineStage = (typeof PIPELINE_STAGES)[number]

/** repo 的功能分群（讀 repo 地圖時的第一層切法）。 */
export const REPO_GROUPS = [
  'app',
  'webrtc-core',
  'go-transport',
  'vendor-protocol',
  'discovery',
  'virtual-display',
  'virtual-audio',
  'remote-control',
  'backend',
  'tooling',
  'vendored',
] as const

export type RepoGroup = (typeof REPO_GROUPS)[number]

/** 通用技術概念頁的 id。新增概念頁時要同步加在這裡，repo 才連得過去。 */
export const CONCEPT_IDS = [
  'capture',
  'codecs',
  'containers',
  'webrtc',
  'transport',
  'discovery',
  'vendor-protocols',
  'drm-auth',
  'storage',
] as const

export type ConceptId = (typeof CONCEPT_IDS)[number]

/** 這個 domain 涵蓋的子系統。 */
export type SystemId = 'airsync' | 'mvb-cast' | 'recorder'

/**
 * 每條 repo 記錄的可信度。
 *
 * 這是給「你自己讀的時候知道能不能信」用的 —— 我沒 clone 任何 repo，
 * 只讀了遠端 README 與頂層目錄，所以有些欄位是推論而非查證。
 */
export type Confidence =
  /** 讀過這個 repo 的原始碼，描述可以當事實用 */
  | 'code'
  /** 從該 repo 的 README / 頂層檔案結構直接讀到 */
  | 'readme'
  /** 從 repo 名稱、語言、與同群 repo 的關係推論，尚未查證 */
  | 'inferred'

export type Repo = {
  /** GitHub repo 名（Viewsonic-EDU org）。也是查 local/offloaded 狀態的 key。 */
  name: string
  /** repo 內部的真名（很多 repo 名與 README 標題不一致，這欄很省事） */
  realName?: string
  lang: string
  group: RepoGroup
  system: SystemId[]
  /** 它在 pipeline 上負責哪幾段 */
  stages: PipelineStage[]
  /** 讀它能學到哪些通用概念 */
  concepts: ConceptId[]
  /** 一句話講它是什麼 */
  summary: string
  /** 值得注意的細節：學習價值、坑、與其他 repo 的關係 */
  notes?: string[]
  confidence: Confidence
  /** 上游第三方，原則上不深入讀（只需知道它存在與為何在這） */
  vendored?: true
  /** 已停用 / 已被取代 */
  deprecated?: true
  /** 學習優先度：1 = 先讀這個 */
  priority?: 1 | 2 | 3
}
