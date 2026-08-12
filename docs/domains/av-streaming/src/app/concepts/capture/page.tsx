import { ConceptPage, Section } from '@/components/ConceptPage'
import { Callout } from '@/components/Prose'
import { CompareGrid } from '@/components/diagrams'
import { Mermaid } from '@/components/Mermaid'

const THREE_SOURCES = `flowchart LR
  subgraph OS["A · 作業系統 API"]
    A1["應用程式要求擷取"] --> A2["系統給一塊 Surface"]
  end
  subgraph VD["B · 虛擬驅動"]
    B1["造一個假螢幕 / 假音效卡"] --> B2["系統主動把內容送進來"]
  end
  subgraph HW["C · 硬體擷取"]
    C1["HDMI 訊號"] --> C2["擷取卡"]
  end
`

export default function Page() {
  return (
    <ConceptPage id="capture">
      <Section title="一、像素只有三種來源">
        <p>
          「擷取」聽起來像一件事，實際上有三條機制完全不同的路。搞清楚差別，就能理解為什麼
          AirSync 在 Android 與 Windows 上用了完全不同的做法。
        </p>
      </Section>

      <Mermaid chart={THREE_SOURCES} />

      <Section title="A · 作業系統 API — 你去問系統要">
        <p>
          最常見的一條。應用程式呼叫系統 API，系統給你一塊畫面緩衝區。 Android 是{' '}
          <code>MediaProjection</code>，macOS 是 <code>ScreenCaptureKit</code>，Windows 是{' '}
          <code>Desktop Duplication API</code> 或 <code>Windows.Graphics.Capture</code>，
          瀏覽器則是 <code>getDisplayMedia()</code>。
        </p>
        <p>
          共同特徵是<strong>系統會擋你</strong>：都要使用者明確授權，而且授權過程通常伴隨
          一個無法跳過的對話框或狀態列圖示。這是刻意的設計 ——
          螢幕內容是最敏感的資料之一，作業系統不會讓程式偷偷拿。
        </p>
        <h3>Android 的 MediaProjection 與那個對話框</h3>
        <p>
          <code>MediaProjection</code> 的流程是：向系統要一個 <code>Intent</code>、跳出「開始錄製或投放？」
          對話框、使用者同意後拿到 token，再用 token 建立 <code>VirtualDisplay</code>，
          把畫面導進一個 <code>Surface</code>。
        </p>
        <p>
          那個對話框在產品上很礙眼 —— 大螢幕當接收端不需要，但當發送端每次都要點。
          能繞過的唯一方式是<strong>系統級權限</strong>：App 用平台金鑰簽章，
          且宣告 <code>android.permission.CAPTURE_VIDEO_OUTPUT</code> 這類 signature 級權限。
        </p>
      </Section>

      <Callout kind="insight" title="這就是 receiver 那四個 flavor 的意義">
        <p>
          <code>edu-as-airsync-receiver</code> 的 IFP flavor 用 platform key 簽章並設{' '}
          <code>android:sharedUserId=&quot;android.uid.system&quot;</code>，EDLA flavor 只簽
          platform key，OPEN / STORE 用普通 key。
        </p>
        <p>
          所以「哪個機種可以無感擷取／可以反向控制」不是產品功能開關，
          <strong>是簽章與 shared UID 決定的</strong>。普通 key 的版本永遠得跳對話框，
          這是 Android 的安全模型，不是實作偷懶。
        </p>
      </Callout>

      <Section title="B · 虛擬驅動 — 讓系統主動送進來">
        <p>
          方向完全相反：不去要畫面，而是<strong>造一個裝置</strong>，讓作業系統以為它真實存在，
          然後系統會自己把內容送過來。
        </p>
        <blockquote>
          這條路各平台的門檻差距極大 —— <strong>只有 Windows 需要寫核心驅動</strong>，
          Android 把同一件事做成公開 API，Linux 內建，macOS 顯示端沒有官方路徑但音訊端有，
          iOS 完全封閉。完整比較見{' '}
          <a href="/concepts/capture/virtual-devices">虛擬裝置的跨平台現實</a>。
          下面只講 Windows，因為那是 AirSync 主要投入的地方。
        </blockquote>
        <h3>虛擬顯示器（Indirect Display Driver）</h3>
        <p>
          Windows 的 IDD 是一種 WDDM 驅動，向系統註冊成一台顯示器。系統看到多了一台螢幕，
          就把桌面延伸到它上面 —— 使用者把視窗拖進那個「螢幕」，內容就進了驅動的緩衝區，
          而驅動就是投影程式的一部分。
        </p>
        <p>
          好處很實際：<strong>不需要任何擷取權限</strong>（你是螢幕，不是偷看螢幕的人）、
          解析度與更新率可以自己定（不受實體螢幕限制）、而且天然做到「只投這個視窗」
          而不是整個桌面。
        </p>
        <p>
          代價是驅動開發的門檻：需要 WDK 建置、程式碼簽章，還要走微軟的{' '}
          <strong>Driver Attestation</strong> 流程（得先加入 Hardware Developer Program）。
          這解釋了為什麼 <code>edu-as-indirect-display</code> 的 README 有一半在講簽章。
        </p>
        <h3>虛擬音效卡</h3>
        <p>
          同一個思路用在音訊上。<code>edu-as-virtual-audio-cable</code>（VAC4 的 fork，
          產出 <code>airsyncaudio</code> 驅動）註冊成一張音效卡；把系統輸出切到它，
          所有應用程式的聲音就流進驅動。
        </p>
        <p>
          為什麼不錄麥克風？因為麥克風錄到的是<strong>從喇叭放出來、經過空氣、混了環境噪音</strong>
          的聲音，品質差且有回音。虛擬音效卡拿到的是原始數位訊號。
        </p>
      </Section>

      <Section title="C · 硬體擷取 — 不在這批 repo 裡">
        <p>
          HDMI 進來、擷取卡轉成 USB/PCIe 視訊流。優點是對來源裝置零要求（連遊戲主機都能投），
          缺點是要多一個硬體。IFP 的實體 HDMI 輸入走的是另一條路，
          不經過這裡討論的軟體投影管線，所以這批 repo 裡沒有對應的東西。
        </p>
      </Section>

      <Section title="四、三條路的取捨">
        <CompareGrid
          columns={['作業系統 API', '虛擬驅動', '硬體擷取']}
          rows={[
            {
              label: '權限門檻',
              cells: ['高，通常要使用者按同意', '無，你就是裝置', '無'],
            },
            {
              label: '開發門檻',
              cells: ['低，都是公開 API', '很高，驅動 + 簽章 + 認證', '中，要處理硬體'],
            },
            {
              label: '可控程度',
              cells: ['系統給什麼拿什麼', '解析度／更新率自己定', '受擷取卡規格限制'],
            },
            {
              label: '延遲',
              cells: ['中', '低（少一次複製）', '低但多一段硬體延遲'],
            },
            {
              label: '對來源的要求',
              cells: ['要裝 App', '要裝驅動', '完全不用'],
            },
          ]}
          verdict={
            <>
              AirSync 在 Android 走 A、在 Windows 走 B，不是技術偏好而是各平台的最佳解 ——
              Android 沒有 IDD 這種東西，Windows 的擷取 API 又比 IDD 難控制。
            </>
          }
        />
      </Section>

      <Section title="五、擷取要處理的兩件雜事">
        <p>
          <strong>螢幕關了就該停。</strong>
          <code>edu-as-desktop-screenstate</code> 存在的原因：螢幕熄滅或鎖定時繼續擷取送流，
          是隱私問題（鎖定畫面被投出去）也是耗電問題。這種「感覺很邊緣」的 plugin
          通常是踩過事故才生出來的。
        </p>
        <p>
          <strong>音訊焦點要協調。</strong>
          <code>edu-as-audioswitch</code>（Twilio 的函式庫）處理 Android 的 audio focus
          與輸出裝置路由 —— 投影中來電、藍牙耳機接上、使用者切喇叭，
          都要正確搶到或讓出音訊。
        </p>
      </Section>
    </ConceptPage>
  )
}
