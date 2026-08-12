import Link from 'next/link'
import { Callout, PageHeader, Prose } from '@/components/Prose'
import { CompareGrid, Steps } from '@/components/diagrams'
import { Mermaid } from '@/components/Mermaid'

const TWO_CONTROLLERS = `flowchart LR
  BWE["WebRTC BWE<br/>估測可用頻寬"] --> FD["FrameDropper<br/>leaky bucket"]
  FD -->|"丟幀"| OUT["送出"]
  BWE -->|"目標 bitrate"| MF["MF 編碼器<br/>自己的 CBR 控制器"]
  MF --> OUT
  FD -.->|"互相不知道對方在做什麼"| MF
`

export default function WebRtcForkPage() {
  return (
    <>
      <PageHeader
        eyebrow="system · airsync · deep dive"
        title="libwebrtc fork 到底改了什麼"
        lede={
          <>
            <code>edu-as-webrtc</code> 上 58 個自家 commit 的實際內容。
            全部繞著同一件事：<strong>讓 Windows 的硬體 H.264 編碼器在投影場景下不要卡</strong>。
            這是「教科書的 WebRTC」與「產品裡的 WebRTC」之間的差距本身。
          </>
        }
      />

      <Callout kind="note" title="怎麼查到的">
        <p>
          沒有 clone。用 GitHub API 列出 <code>v0.9.36-windows</code> 分支 2024 年後的 commit
          （共 66 個），按作者篩掉上游 LiveKit 的 8 個，剩下 58 個自家 commit，
          再逐個抓 patch。<strong>比 clone 393 MB 快得多，而且不會漏。</strong>
        </p>
        <p>
          作者是三個人：Stephen Yang（27）、eugene.chen（21）、VSI\hsuric（10）。
        </p>
      </Callout>

      <Prose>
        <h2>一、三個階段</h2>
      </Prose>

      <Steps
        items={[
          {
            label: '2025-09 · 把 MF 硬體編碼器接進來',
            detail: (
              <>
                <code>Add MF based H264 hardware encoder and decoder</code> 是起點。
                同期做完 Windows 零複製螢幕擷取、虛擬顯示器擷取、GPU 選擇、
                以及一連串 Desktop Duplication 的穩定性修補。
              </>
            ),
          },
          {
            label: '2025-12 · 讓 bitrate 動得起來',
            detail: (
              <>
                透過 <code>ICodecAPI</code> 做動態 bitrate 調整
                「without rebuilding」—— 也就是不重建編碼器就能改速率。
                同期關掉了動態 FPS 切換，並開始動 pacing。
              </>
            ),
          },
          {
            label: '2026-01 ~ 02 · USER STORY #100316：卡頓戰役',
            detail: (
              <>
                <strong>這是主戰場</strong>，光這個 user story 就有 15 個 commit。
                票名是「playback with very brief pauses」——
                畫面會有很短的停頓。整頁下半都在講這個。
              </>
            ),
          },
          {
            label: '2026-03 ~ 04 · 收尾',
            detail:
              '壓縮日誌、移除高頻 log、CI 從 Azure DevOps 搬到 GitHub、把 git tag 與 commit hash 埋進 libwebrtc.dll 版本資訊、符號上傳 Sentry。',
          },
        ]}
      />

      <Prose>
        <h2>二、階段一的坑：硬體編碼器每一台都不一樣</h2>
        <p>
          接 Media Foundation 編碼器最大的問題不是 API 難用，是<strong>行為不一致</strong>。
          程式碼裡到處是這種防禦：
        </p>
        <ul>
          <li>
            每個參數設定前先 <code>codec_api_-&gt;IsSupported(&amp;CODECAPI_...)</code> 探測，
            不支援就跳過而不是失敗
          </li>
          <li>
            <code>VT_BOOL</code> 設不進去就退回 <code>VT_UI4</code> 再試一次
          </li>
          <li>
            連 <code>ICodecAPI</code> 本身都可能拿不到 —— 原始碼裡的註解直接寫：
            <em>「This is common on Intel Quick Sync Video encoders」</em>
          </li>
          <li>
            用 <code>MFT_FRIENDLY_NAME_Attribute</code> 把編碼器名稱印到 log ——
            因為現場出問題時第一個要知道的就是「這台用的是哪家的編碼器」
          </li>
        </ul>
        <p>
          還有一個很典型的硬體限制：<strong>解析度不是 16 的倍數就出黑畫面</strong>
          （<code>#95313</code>）。修法是把長寬對齊到 16 的倍數
          （<code>aligned_length = input_length - (input_length % 16)</code>）。
          螢幕解析度是使用者的螢幕決定的，不像攝影機可以挑，所以這個坑一定會踩到。
        </p>
      </Prose>

      <Prose>
        <h2>三、卡頓戰役的核心：兩個速率控制器在互打</h2>
        <p>
          整批 diff 裡最有價值的一行，是這個 commit 的程式碼註解：
        </p>
      </Prose>

      <Callout kind="insight" title="feat: set encoder has_trusted_rate_controller as true">
        <p className="font-mono text-[12px] text-emerald-300">
          MF encoder has its own CBR rate controller (via ICodecAPI), so disable WebRTC&apos;s
          frame dropper (leaky-bucket) which over-reacts to BWE changes and causes FPS to
          plummet on minor RTT fluctuations.
        </p>
        <p>
          翻成中文：MF 編碼器自己有 CBR 速率控制器，所以要關掉 WebRTC 的 frame dropper ——
          它對頻寬估測的變化反應過度，RTT 稍微抖一下就會讓 FPS 直接崩掉。
        </p>
      </Callout>

      <Prose>
        <p>
          這是<strong>兩層都在做速率控制</strong>的經典衝突。WebRTC 假設編碼器是「笨」的
          —— 它會估測頻寬、算出目標 bitrate，然後如果送出量還是超標，
          就用 <code>FrameDropper</code> 主動丟幀。但 MF 硬體編碼器<em>自己</em>也有 CBR 控制器，
          會為了達成目標 bitrate 而調整品質。
        </p>
        <p>
          結果是：網路稍微抖動 → WebRTC 降目標 bitrate → 編碼器降品質（正確反應）
          <strong>並且</strong> WebRTC 的 frame dropper 也開始丟幀（多餘反應）→ FPS 崩掉 → 使用者看到停頓。
        </p>
      </Prose>

      <Mermaid
        chart={TWO_CONTROLLERS}
        caption="has_trusted_rate_controller = true 的作用就是告訴 WebRTC「編碼器自己會控，你的 frame dropper 不要動」。"
      />

      <Prose>
        <h2>四、那串神秘的實驗字串</h2>
        <p>
          有兩個 commit 只改了一行，而那一行是這個：
        </p>
        <p>
          <code>
            rtc_base/experiments/alr_experiment.cc
          </code>
        </p>
        <p>
          <code>kDefaultProbingScreenshareBweSettings</code> 的值從{' '}
          <code>&quot;1.0,2875,80,40,-60,3&quot;</code> 一路改成{' '}
          <code>&quot;2.0,100,80,40,-60,3&quot;</code>。
        </p>
        <p>
          <strong>ALR</strong> 是 application-limited region —— 應用程式送不滿可用頻寬的狀態，
          螢幕分享因為畫面常常不動，天生大量處在這個狀態。libwebrtc 為螢幕分享準備了一組
          專屬的 BWE 參數，就藏在這個逗號分隔的字串裡。前兩個欄位是：
        </p>
        <ul>
          <li>
            <strong>pacing factor</strong>：1.0 → 2.0。允許以兩倍於估測頻寬的速度送出，
            也就是「畫面終於動了的時候，讓它一次衝出去」
          </li>
          <li>
            <strong>max paced queue time</strong>：2875 ms → 100 ms。
            這是允許封包在 pacer 佇列裡排多久。<strong>2875 ms 是將近三秒</strong>——
            對檔案傳輸合理，對投影是災難：畫面已經變了，佇列裡還積著三秒前的舊幀
          </li>
        </ul>
        <p>
          <strong>這是整批改動裡投報率最高的一行。</strong>
          一個字串常數，直接砍掉最多 2.7 秒的延遲。而它藏在一個叫 &quot;experiment&quot;
          的檔案裡，預設值對投影完全不適用 —— 沒踩過根本不會去看。
        </p>
      </Prose>

      <Prose>
        <h2>五、速率控制模式的路線變化</h2>
      </Prose>

      <CompareGrid
        columns={['改成什麼', '為什麼']}
        rows={[
          {
            label: '一開始',
            cells: [
              <code key="a">eAVEncCommonRateControlMode_CBR</code>,
              '原始碼註解：「Use CBR to reduce bitrate spikes that can cause send-side stalls」—— 怕突發峰值塞住送出端',
            ],
          },
          {
            label: '後來',
            cells: [
              <code key="b">eAVEncCommonRateControlMode_PeakConstrainedVBR</code>,
              '純 CBR 為了填滿位元率，畫面不動時也在浪費；改成有峰值上限的 VBR，靜態畫面省下來、動態畫面允許衝高但不失控',
            ],
          },
        ]}
        verdict={
          <>
            這條路線很有意思：CBR 是<Link href="/concepts/codecs">教科書給即時串流的答案</Link>，
            他們照做了，然後在真實的螢幕內容上發現「畫面經常完全不動」讓 CBR
            的假設失效，於是往回退了半步。
          </>
        }
      />

      <Prose>
        <h2>六、關掉週期性 IDR，改用 PIR</h2>
        <p>
          這個 commit 一次改了 425 行，做的事是：
        </p>
        <ul>
          <li>
            <code>CODECAPI_AVEncMPVGOPSize = 0xFFFFFFFF</code> ——
            把 GOP 長度設成最大值，實際效果是<strong>關掉週期性 IDR</strong>
          </li>
          <li>
            <code>CODECAPI_AVEncVideoNumGOPsPerIDR = 0xFFFFFFFF</code> —— 同上，雙重保險
          </li>
          <li>
            <code>CODECAPI_AVEncVideoGradualIntraRefresh</code> —— 改用{' '}
            <strong>PIR（Progressive Intra Refresh）</strong>
          </li>
        </ul>
        <p>
          原始碼註解特別註明：<em>「Using 0 may mean &apos;default&apos; on some encoders,
          so we use a large value instead」</em> —— 又一個硬體行為不一致的實例。
        </p>
        <h3>PIR 是什麼，為什麼對投影更好</h3>
        <p>
          I-frame 的問題是它很大。<Link href="/concepts/containers">封包化那頁</Link>
          講過，一個 I-frame 可能切成 90 個封包，丟一個就整幀報廢；
          而且它會造成 bitrate 的尖峰，剛好是 pacer 佇列積起來的原因。
        </p>
        <p>
          <strong>PIR 的做法是把 I-frame 攤開</strong>：不發完整的 I-frame，
          而是每一幀刷新畫面的一小條區域，幾十幀之後整個畫面就都被刷新過一遍。
          效果等價於定期 I-frame，但<strong>bitrate 完全平順，沒有尖峰</strong>。
        </p>
        <p>
          代價是新加入的接收端要等一整輪刷新才能得到完整畫面 ——
          但 AirSync 的加入流程本來就會另外請求一個 keyframe，所以這個代價可以吸收。
        </p>
      </Prose>

      <Prose>
        <h2>七、frame dropper 的鐘擺</h2>
        <p>
          這段最誠實地反映了調參的真實過程。<code>modules/video_coding/utility/frame_dropper.cc</code>{' '}
          裡兩個常數被改了三次：
        </p>
      </Prose>

      <CompareGrid
        columns={['上游預設', '第一次改', '第二次改']}
        rows={[
          {
            label: 'kDefaultMaxDropDurationSecs',
            cells: ['4.0', '0.2', '1.0'],
          },
          {
            label: 'kLeakyBucketSizeSeconds',
            cells: ['0.5', '0.75', '0.5'],
          },
          {
            label: 'kDefaultIncomingFrameRate',
            cells: ['30', '30', '25'],
          },
        ]}
        verdict={
          <>
            第一次從 4 秒砍到 0.2 秒（commit 附註「At 30fps, this limits continuous frame drops
            to ~15 frames max」），顯然是為了消滅長時間凍結；但砍太狠之後又退回 1.0 秒。
            <strong>這不是失誤，這就是調參 —— 先過衝找到邊界，再退回可用值。</strong>
          </>
        }
      />

      <Prose>
        <p>
          上游預設允許<strong>連續丟幀最多 4 秒</strong>。對視訊通話也許合理（反正臉不太動），
          對投影就是「畫面凍結四秒」—— 而使用者對這件事的容忍度是零。
        </p>
        <p>
          附帶一個小細節：commit 訊息寫「reduce from 4s to 0.25s」，程式碼裡實際是{' '}
          <code>0.2f</code>。訊息與程式碼不一致，這種事很常見，所以
          <strong>看 diff 比看 commit 訊息可靠</strong>。
        </p>
      </Prose>

      <Prose>
        <h2>八、從這批 diff 學到的通則</h2>
        <ul>
          <li>
            <strong>不要讓兩層同時做同一種控制。</strong>
            WebRTC 的 frame dropper 與 MF 的 CBR 控制器互打，是整個卡頓問題的根源。
            解法不是把兩邊都調好，是<strong>關掉一邊</strong>。
          </li>
          <li>
            <strong>上游預設值是為「一般視訊通話」調的。</strong>
            4 秒丟幀上限、2875 ms pacer 佇列 —— 這些對投影全都太寬鬆。
            換場景就要重新檢查所有時間常數。
          </li>
          <li>
            <strong>硬體編碼器要當成「不可信的第三方」寫。</strong>
            每個能力都探測、每個設定都容許失敗、把型號印進 log。
          </li>
          <li>
            <strong>尖峰是延遲的敵人，不只是頻寬的敵人。</strong>
            PIR 取代 I-frame、PeakConstrainedVBR 取代 CBR、pacing factor 調高 ——
            三個改動都在對付「突發的大量資料」。
          </li>
          <li>
            <strong>螢幕內容不是影片。</strong>
            經常完全靜止、解析度由使用者的螢幕決定、有大量細線文字。
            這三件事各自都推翻了一個為攝影機影片設計的預設。
          </li>
        </ul>
      </Prose>

      <Callout kind="warn" title="幾個不太漂亮的地方（誠實記錄）">
        <ul>
          <li>
            <code>frame_rate_ = 25;//codec_settings-&gt;maxFramerate;</code> ——
            上限被硬寫成 25 並把原本的邏輯註解掉。這是 hack 不是修正，
            意味著真正的問題（動態 FPS 不穩）還沒解決。
          </li>
          <li>
            <strong>大量 <code>LS_INFO</code> 被改成 <code>LS_WARNING</code></strong>，
            並加上 <code>[UG-FRAME]</code> 標籤。這是為了讓 log 在正式版的等級下也印出來 ——
            典型的「現場問題重現不了，只能靠客戶的 log」的痕跡。
            後來 2026-03 又有 commit 在移除高頻 log。
          </li>
          <li>
            歷史裡有多個 revert：pacing 改動被還原、<code>SwitchToThread()</code> 退回{' '}
            <code>Sleep(1)</code>、<code>ReconfigureSinkWriter</code> 重新打開。
            這條線是一路試出來的。
          </li>
          <li>
            動態 FPS 切換被明確關掉（<em>disable dynamic FPS switching</em>），
            因為改 FPS 需要重建編碼器。所以「畫面順暢度自動適應」這件事目前是放棄的。
          </li>
        </ul>
      </Callout>

      <Prose>
        <h2>九、還沒查的</h2>
        <ul>
          <li>
            <code>kPreEncodeReduceRatio = 0.7f</code>、<code>kPreEncodeOverrideFrames = 3</code>、
            <code>kMinPreEncodeBps = 300000</code> —— 有一套「預先降速」機制，
            大概是切換或 keyframe 前先降 bitrate 留餘裕，但還沒讀懂細節。
          </li>
          <li>
            <code>kLargeKeyFrameBytes = 600 * 1024</code> —— 對過大的 keyframe 有特殊處理。
          </li>
          <li>
            引入了 <code>mmcss_thread_priority_win.h</code>（Multimedia Class Scheduler
            Service）與「persistent high-resolution timer」，
            是 Windows 計時精度那條線。<code>#100316</code> 有一部分是純粹的計時問題而非編碼問題。
          </li>
          <li>
            <code>EncoderBitrateAdjuster</code> 被引入做「smooth bitrate control」，
            但後來有 commit 說 <em>remove bitrate adjust to approve bitrate too smooth</em>
            —— 太平滑反而不好，這段的來回還沒釐清。
          </li>
        </ul>
      </Prose>
    </>
  )
}
