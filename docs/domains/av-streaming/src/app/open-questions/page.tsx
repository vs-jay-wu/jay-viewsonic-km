import Link from 'next/link'
import type { ReactNode } from 'react'
import { PageHeader, Prose } from '@/components/Prose'
import { IconCheck, IconCorrection } from '@/components/icons'

type Question = {
  q: string
  why: string
  how: string
  blocking?: true
}

type Resolved = {
  q: string
  answer: ReactNode
  /** 查證後發現原本的判斷是錯的 */
  correction?: true
}

const RESOLVED: Resolved[] = [
  {
    q: '「live」指的是什麼？對應哪個 repo？',
    answer: (
      <>
        <strong>就在 recorder 這個 repo 裡</strong>，不是獨立產品 ——
        <code>docs/recorder_live_app.md</code> 標題就叫「Recorder、Live APP」，
        且有 <code>rtmp/</code> package。走 RTMP（<code>net.ossrs.rtmp.SrsFlvMuxer</code>），
        目標是 <strong>YouTube / Facebook / Workplace / Twitch</strong> —— 外部社群平台，
        不是內部投影。同一份編碼同時寫 MP4 與推 RTMP。
        詳見 <Link href="/systems/recorder">Recorder / Live</Link>。
      </>
    ),
  },
  {
    q: 'edu-as-webrtc-airsync 相對於上游 Google libwebrtc 到底改了什麼？',
    correction: true,
    answer: (
      <>
        <strong>問錯 repo 了。</strong>
        <code>edu-as-webrtc-airsync</code> 的 master 全是上游 commit（作者是
        webrtc-version-updater 與 Google 工程師，日期停在 2021-08），分支是上游的{' '}
        <code>branch-heads/*</code> —— 它是個鏡像，不是產品線。
        <br />
        實際在開發的是 <code>edu-as-webrtc</code>：default branch{' '}
        <code>v0.9.36-windows</code>，分支 <code>Rick/…</code> / <code>eugene/…</code> /{' '}
        <code>stephen/…</code> 帶內部 user story 編號，commit 到 2026-04。
        改動集中在 <strong>Windows Media Foundation 硬體編碼器的速率控制</strong>。
        詳見 <Link href="/concepts/webrtc">WebRTC</Link>「為什麼要維護 libwebrtc fork」。
      </>
    ),
  },
  {
    q: 'edu-mvb-webrtc-signal-server 與 -cast-control 的實際分工是什麼？',
    answer: (
      <>
        <strong>同一份 RTCMultiConnection 程式碼，cast-control 是改良版</strong>，
        只有三個檔案不同。最重要的差異是<strong>房間隔離</strong>：base 版用{' '}
        <code>socket.broadcast.emit()</code> 廣播給所有連線者，cast-control 改成{' '}
        <code>socket.join(room)</code> + <code>io.sockets.to(room).emit()</code>。
        另外加了 <code>socket.role</code> 與 Azure Application Insights 遙測。
        詳見 <Link href="/systems/mvb-cast">MVB Cast</Link>「兩台信令伺服器的實際分工」。
      </>
    ),
  },
  {
    q: 'edu-droid-screen-recorder 真的走 MediaProjection + MediaCodec + MediaMuxer 嗎？',
    answer: (
      <>
        <strong>是，但有兩處我猜錯。</strong>
        音源是 <code>MediaRecorder.AudioSource.MIC</code>（麥克風，不是{' '}
        <code>AudioPlaybackCapture</code>），音訊是 96 kbps 單聲道而非 128 kbps。
        另外它不只寫檔，同時推 RTMP。確切參數（GOP 1 秒、bitrate 階梯、
        <code>KEY_REPEAT_PREVIOUS_FRAME_AFTER</code>）見{' '}
        <Link href="/systems/recorder">Recorder / Live</Link>。
      </>
    ),
  },
  {
    q: 'MVB Cast 的一對多是 P2P mesh 嗎？',
    correction: true,
    answer: (
      <>
        <strong>不是 mesh，是 peer 中繼樹。</strong>
        <code>Scalable-Broadcast.js</code> 的 <code>maxRelayLimitPerUser</code> 預設 2，
        每個 peer 最多再轉給兩個人。客戶端有對應的{' '}
        <code>cast-out-module-scalable.js</code>。這是 mesh 與 SFU 之外的第四種架構，
        見 <Link href="/concepts/webrtc">WebRTC</Link>「一對多的三種架構」。
      </>
    ),
  },
]

const QUESTIONS: Question[] = [
  {
    q: 'edu-as-webrtc 的自家改動具體怎麼改的？',
    why: '已經知道改在哪（Windows Media Foundation 的速率控制）與改了什麼主題，但 commit 訊息只給結論。「set has_trusted_rate_controller」「PeakConstraintVBR」「fix pacing to 2.0」這些背後的判斷過程，是這批 repo 裡最濃的實戰知識。',
    how: 'clone edu-as-webrtc（約 393 MB，比 -airsync 的 340 MB 稍大但可接受），看 v0.9.36-windows 相對 LiveKit 上游的 diff，重點在 modules/video_coding 與 Windows MF 編碼器那塊。',
    blocking: true,
  },
  {
    q: 'edu-as-webrtc-airsync 那幾個自家分支在做什麼？',
    why: 'master 是 2021 年的上游鏡像，但有 duan/m125-update、duan/migrate-patches-from-m104、dl/independent_apm、expose-e2ee-api 這些分支。如果那是一次未完成的版本升級，就代表產品目前卡在舊版 libwebrtc —— 這對理解技術債很重要。',
    how: '比對那幾個分支與 master 的 diff，看 migrate-patches-from-m104 搬了哪些 patch。也可以問 duan 這個人。',
  },
  {
    q: 'edu-as-display-channel 的 direct 與 tunnel 兩種模式差在哪？',
    why: '這對應「企業網路擋掉多播與 P2P 時怎麼辦」這個真實問題，是理解部署現實的關鍵。',
    how: '讀 example/native_client.dart，它有 --mode tunnel 與 --mode direct 兩種跑法。repo 是 Dart，體積小，成本低。',
    blocking: true,
  },
  {
    q: 'AirSync 在 macOS / Linux 桌面端怎麼擷取畫面？',
    why: 'sender 的 CI 有 azure-pipelines-macos.yml，所以 macOS 版存在。但 macOS 沒有官方的虛擬顯示器 API（只有私有的 CGVirtualDisplay），所以它可能走 ScreenCaptureKit、可能賭私有 API。這決定了非 Windows 桌面端的能力上限，而虛擬裝置頁目前只把它寫成「沒查證」。',
    how: 'sender 的 macos/ 目錄與 edu-as-desktop-screenstate 的 macOS 實作。後者 README 說支援 Linux / macOS / Windows，所以三平台都有涉及。',
  },
  {
    q: 'AirSync 的反向控制走 DataChannel 還是另一條連線？',
    why: '概念頁目前寫「大概走 DataChannel（待查證）」。這影響對整個連線模型的理解 —— 如果是另開連線，就代表 NAT 要打兩次洞。',
    how: '讀 edu-as-input-injection 的 Dart 端，或在 sender/receiver 裡搜 dataChannel。',
  },
  {
    q: 'edu-mvb-geticeserver-svc 停用後，ICE/TURN 憑證由誰發？',
    why: 'TURN 是 NAT 穿透失敗時的唯一退路。這個服務停用了但需求不會消失。',
    how: '在 edu-mvb-cast-app 裡搜 iceServers / turn 的設定來源。',
  },
  {
    q: 'edu-as-vac-four 與 edu-as-virtual-audio-cable 誰是誰的上游？',
    why: 'README 說 virtual-audio-cable 是 VAC4 的 fork，但 org 裡同時有 vac-four（且無 README）。關係不清會誤判哪份是實際在用的。',
    how: '比對兩邊的 git 歷史起點。',
  },
  {
    q: 'sender 為何沒有 EDLA flavor？',
    why: 'receiver 有 EDLA / IFP / OPEN / STORE 四個，sender 只有三個。推測是 EDLA 機種只當接收端，但沒查證。影響對產品形態的理解。',
    how: '看 sender 的 build.gradle flavor 定義，或問人。',
  },
  {
    q: 'edu-as-mixin-network-flutter-plugins 為什麼在這裡？',
    why: 'Mixin Network 是區塊鏈相關專案，跟影音投影沒有明顯關係。',
    how: '看它的 pubspec 與 sender/receiver 的依賴清單有沒有引用它。',
  },
  {
    q: 'offloaded 清單裡的 AirSync_SR_POC_model 是什麼？',
    why: 'SR 可能是 super resolution —— 如果是，代表投影路徑上還有 AI 放大這一層，是完全沒被這份地圖涵蓋的東西。',
    how: '直接看那個資料夾的內容（不是 GitHub repo，是本機資料夾）。',
  },
  {
    q: 'recorder 的錄影檔上傳走 edu-mvb-storage-libs 嗎？',
    why: 'storage 頁的上傳那節目前是推論。GB 級檔案在教室 Wi-Fi 上傳的實際策略（分段？簽名 URL？）是值得學的一段。',
    how: '在 edu-droid-screen-recorder 的 RestApiHelper.java / FileHelper.java 裡追上傳流程。這兩個檔案都在本機。',
  },
]

export default function OpenQuestionsPage() {
  const blocking = QUESTIONS.filter((q) => q.blocking)
  const rest = QUESTIONS.filter((q) => !q.blocking)
  const corrections = RESOLVED.filter((r) => r.correction).length

  return (
    <>
      <PageHeader
        eyebrow="open questions"
        title="待釘問題"
        lede={
          <>
            這份地圖大部分是只讀遠端 README 建立的，所以會有懸著的問題。
            每條都附「為什麼值得查」與「怎麼查」—— 不然待辦清單會變成永遠不動的墳場。
          </>
        }
      />

      <Prose>
        <h2>
          已結案（{RESOLVED.length}）
          {corrections > 0 && (
            <span className="ml-2 font-mono text-xs font-normal text-amber-500">
              其中 {corrections} 條推翻了原本的判斷
            </span>
          )}
        </h2>
        <p>
          留著不刪 —— 尤其是被推翻的那幾條，它們是「只讀 README 會錯在哪」的實例。
        </p>
      </Prose>

      <div className="my-6 space-y-4">
        {RESOLVED.map((item) => (
          <div
            key={item.q}
            className={`max-w-3xl rounded-lg border px-5 py-4 ${
              item.correction
                ? 'border-amber-700/40 bg-amber-950/15'
                : 'border-emerald-800/40 bg-emerald-950/15'
            }`}
          >
            <h3 className="flex items-start gap-2 text-[15px] font-semibold text-slate-300">
              {item.correction ? (
                <IconCorrection className="mt-1 text-amber-500" title="修正" />
              ) : (
                <IconCheck className="mt-1 text-emerald-500" title="已答" />
              )}
              <span className="line-through decoration-slate-600">{item.q}</span>
            </h3>
            <div className="prose-note mt-2.5 text-[13px]">
              <p>{item.answer}</p>
            </div>
          </div>
        ))}
      </div>

      <Prose>
        <h2>會擋住理解的（{blocking.length}）</h2>
      </Prose>

      <div className="my-6 space-y-4">
        {blocking.map((item) => (
          <QuestionCard key={item.q} item={item} accent />
        ))}
      </div>

      <Prose>
        <h2>其他（{rest.length}）</h2>
        <p>不擋路，但每答一題地圖就準一點。</p>
      </Prose>

      <div className="my-6 space-y-4">
        {rest.map((item) => (
          <QuestionCard key={item.q} item={item} />
        ))}
      </div>
    </>
  )
}

function QuestionCard({ item, accent }: { item: Question; accent?: boolean }) {
  return (
    <div
      className={`max-w-3xl rounded-lg border px-5 py-4 ${
        accent ? 'border-amber-600/40 bg-amber-950/20' : 'border-slate-800 bg-slate-900/40'
      }`}
    >
      <h3 className="text-[15px] font-semibold text-slate-100">{item.q}</h3>
      <dl className="mt-3 space-y-2 text-[13px] leading-6">
        <div className="flex gap-3">
          <dt className="w-16 shrink-0 font-mono text-[11px] text-slate-600">為什麼</dt>
          <dd className="text-slate-400">{item.why}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-16 shrink-0 font-mono text-[11px] text-slate-600">怎麼查</dt>
          <dd className="text-slate-400">{item.how}</dd>
        </div>
      </dl>
    </div>
  )
}
