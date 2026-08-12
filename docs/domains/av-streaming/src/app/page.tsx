import Link from 'next/link'
import { Callout, PageHeader, Prose } from '@/components/Prose'
import { PipelineBar } from '@/components/PipelineBar'
import { Mermaid } from '@/components/Mermaid'
import { REPOS } from '@/data/repos'
import { SYSTEM_META } from '@/data/taxonomy'
import type { SystemId } from '@/data/types'
import { loadWorkspaceIndex } from '@/lib/workspace'

const PIPELINE_WEBRTC = `flowchart LR
  S["sender App<br/>display_cast_flutter"]
  R["receiver App<br/>display_flutter"]
  F["裝置本機 SFU<br/>ion-sfu → .aar"]
  B["Display Backend<br/>只管配對"]
  S -->|"SDP / ICE 協商"| R
  S ==>|"SRTP 媒體"| R
  S -.->|"OTP / license"| B
  B -.-> R
  R -->|"一對多時自己轉發"| F
`

const PIPELINE_VENDOR = `flowchart LR
  I["iPhone / Mac"]
  C["Chrome / Android"]
  M["mirror plugin<br/>包 C++ 接收端"]
  A["airplay + fairplay"]
  G["googlecast + libcastauth"]
  I -->|"AirPlay"| A
  C -->|"Google Cast :8009"| G
  A --> M
  G --> M
  M --> D["receiver 顯示"]
`

const PIPELINE_MULTICAST = `flowchart LR
  SRC["來源"] -->|"GStreamer pipeline"| ENC["編碼 + 封裝"]
  ENC ==>|"UDP multicast"| R1["receiver 1"]
  ENC ==>|"同一份封包"| R2["receiver 2"]
  ENC ==>|"…"| R3["receiver N"]
`

function SystemCard({ id }: { id: SystemId }) {
  const meta = SYSTEM_META[id]
  const repos = REPOS.filter((r) => r.system.includes(id))
  const index = loadWorkspaceIndex()
  const localCount = repos.filter((r) => index.locate(r.name) === 'local').length

  return (
    <Link
      href={meta.href}
      className="block rounded-xl border border-slate-800 bg-slate-900/40 p-5 transition hover:border-slate-700 hover:bg-slate-900/70"
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-base font-semibold text-slate-100">{meta.label}</h3>
        <span className="font-mono text-[11px] text-slate-500">{repos.length} repo</span>
      </div>
      <p className="mt-2 text-[13px] leading-6 text-slate-400">{meta.blurb}</p>
      {index.available && (
        <p className="mt-3 font-mono text-[11px] text-slate-600">
          本機主碟 {localCount} / {repos.length}
        </p>
      )}
    </Link>
  )
}

export default function Home() {
  const index = loadWorkspaceIndex()

  return (
    <>
      <PageHeader
        eyebrow="domain"
        title="影音格式、串流與儲存"
        lede={
          <>
            這裡的目標不是學會維護這些 repo，而是搞懂一件事：
            <strong className="text-slate-200">
              這一秒在這台機器上發生的畫面與聲音，怎麼變成另一個地方看得到、聽得到的東西
            </strong>
            。那個「另一個地方」可能是隔壁的大螢幕、一個 MP4 檔，或 YouTube 上的直播 ——
            剛好對應下面三個子系統。所有 repo 都只回答一個問題：它在這條路上負責哪一段。
          </>
        }
      />

      <Prose>
        <h2>一、資料路徑</h2>
        <p>
          整個 domain 的骨架就是下面這條路。左到右是媒體流的方向，
          <strong>畫面與聲音各自走一遍</strong>（編碼、封裝、傳輸都是兩條獨立的流，
          最後才在播放端對上時間）。
        </p>
        <p>
          唯一的例外是最後一格 <code>control</code> —— 它是<strong>倒著走的</strong>，
          接收端把觸控事件送回發送端。這是整條路上唯一逆向的資料。
        </p>
        <p>
          每一格都連到對應的通用概念頁。子系統頁會用同一張圖、只亮它涉及的那幾格 ——
          例如 <Link href="/systems/recorder">Recorder / Live</Link> 只用到前段加上{' '}
          <code>transport</code>。
        </p>
      </Prose>

      <PipelineBar />

      <Prose>
        <h2>二、三條平行的 pipeline</h2>
        <p>
          最容易搞混的地方在這裡：ViewSonic 的投影不是一套機制，而是<strong>三套平行的機制</strong>
          ，各自解決不同情境。看懂這張圖，47 個 repo 的分工就有地方掛了。
        </p>
      </Prose>

      <Prose>
        <h3>1 · WebRTC —— 自家 App 對自家 App</h3>
        <p>
          最完整、最可控的一條。編碼參數、硬體編碼器、simulcast 全都碰得到，代價是要維護一份
          libwebrtc C++ fork。注意 <strong>Display Backend 只出現在配對階段</strong> ——
          媒體流從不經過雲端。
        </p>
      </Prose>
      <Mermaid chart={PIPELINE_WEBRTC} />

      <Prose>
        <h3>2 · 第三方協議 —— 訪客不裝 App 直接投</h3>
        <p>
          訪客拿 iPhone 走進教室不會為了投影裝 App，所以必須實作 AirPlay 與 Google Cast 的
          <strong>接收端</strong>。難的不是解碼，是認證 —— FairPlay 握手與 Cast keyset
          輪替都在這一層。
        </p>
      </Prose>
      <Mermaid chart={PIPELINE_VENDOR} />

      <Prose>
        <h3>3 · GStreamer 多播 —— 一台送多台同網段</h3>
        <p>
          完全不走 WebRTC。同一份封包用 UDP 多播送出，接收端數量不影響發送端頻寬 ——
          教室情境的最佳解。代價是多播在真實企業網路裡經常被擋掉。
        </p>
      </Prose>
      <Mermaid chart={PIPELINE_MULTICAST} />

      <Callout kind="insight" title="兩個最反直覺的發現">
        <ul>
          <li>
            <strong>Windows 端的畫面不是「抓」來的，是「造」出來的。</strong>
            <code>edu-as-indirect-display</code> 是一個真的 Windows 顯示驅動，
            造出一個作業系統認為存在的假螢幕；使用者把視窗拖進去，內容就投出去了。 音訊同理 ——
            <code>edu-as-virtual-audio-cable</code> 造的是假音效卡。
          </li>
          <li>
            <strong>SFU 跑在裝置上，不在雲端。</strong>
            <code>edu-as-golang-server</code> 用 Gobind 把 Go 寫的 ion-sfu 編成 <code>.aar</code>，
            讓大螢幕自己當轉發節點。這解釋了為什麼會有一整批 <code>pion-*</code> 的 Go repo。
          </li>
        </ul>
      </Callout>

      <Prose>
        <h2>三、子系統</h2>
      </Prose>

      <div className="my-6 grid max-w-4xl gap-4 sm:grid-cols-3">
        {(Object.keys(SYSTEM_META) as SystemId[]).map((id) => (
          <SystemCard key={id} id={id} />
        ))}
      </div>

      <Prose>
        <h2>四、怎麼讀這份筆記</h2>
        <ul>
          <li>
            <strong>通用概念與公司實作是分開的。</strong>左側「通用概念」那批講的是換公司也不會過期的東西
            （codec、容器、WebRTC、mDNS）；「子系統」那批講 ViewSonic 實際怎麼選、卡在哪。 兩邊互相連結。
          </li>
          <li>
            <strong>看可信度標記。</strong>標<code>已讀 code</code>的可以當事實用；
            沒標的是從 README 讀到的；標<code>推論</code>的是從名稱猜的，不要當結論。
            這個區分不是形式 ——{' '}
            <Link href="/open-questions">已結案的問題</Link>{' '}
            裡有兩條是查證後<strong>推翻</strong>了原本只看 README 的判斷。
          </li>
          <li>
            <strong>不記錄 repo 在本機還是外接。</strong>那是{' '}
            <code>local.workspace.json</code> 管的動態狀態，
            由頁面在 render 時即時查，所以表格上的 badge 永遠是當下的真相。
          </li>
          <li>
            <strong>縮寫看不懂就去查。</strong>
            <Link href="/glossary">縮寫對照</Link> 收了 70 條，有搜尋框，
            而且標出了 DRM、SIP 這類「同一個縮寫在不同領域指完全不同東西」的地雷。
          </li>
        </ul>

        {!index.available && (
          <blockquote>
            目前讀不到 <code>local.workspace.json</code>，所以 local/offloaded badge 全部顯示{' '}
            <code>?</code>。這個檔案是 gitignored 的本機設定，正常。
          </blockquote>
        )}

        <h2>五、目前狀態</h2>
        <ul>
          <li>
            <strong>repo 地圖完成</strong> —— {REPOS.length} 筆，含分群、pipeline 環節、
            學習優先度、可信度標記。
          </li>
          <li>
            <strong>通用概念九頁都寫完了</strong> —— 不是大綱，是完整內容，
            而且每頁都拉回對應的 repo 講。
          </li>
          <li>
            <strong>子系統三頁</strong>：AirSync 最完整；MVB Cast 的信令與一對多架構已查證；
            Recorder / Live 已完整讀過原始碼。
          </li>
          <li>
            <strong>已釘掉 5 題</strong>（含 2 條推翻原判斷）——「live」是 recorder 的 RTMP
            推流、實際在動的 libwebrtc fork 是 <code>edu-as-webrtc</code> 而不是{' '}
            <code>-airsync</code>、MVB Cast 的一對多是 peer 中繼樹而不是 mesh。
          </li>
          <li>
            <strong>還懸著 10 題</strong>，見{' '}
            <Link href="/open-questions">待釘問題</Link>。最擋路的兩題：
            <code>edu-as-webrtc</code> 的自家 diff 具體怎麼改、
            <code>display-channel</code> 的 direct/tunnel 差異。
          </li>
        </ul>
      </Prose>
    </>
  )
}
