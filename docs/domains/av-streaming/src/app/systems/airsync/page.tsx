import { Callout, PageHeader, Prose } from '@/components/Prose'
import { Mermaid } from '@/components/Mermaid'
import { RepoTable } from '@/components/RepoTable'
import { REPOS } from '@/data/repos'

const SENDER_TO_RECEIVER = `sequenceDiagram
  autonumber
  participant S as sender App<br/>(display_cast_flutter)
  participant N as 區網
  participant R as receiver App<br/>(display_flutter)
  participant B as Display Backend<br/>(presentation-gateway)

  R->>N: 廣播自己的存在 (mDNS)
  S->>N: 掃描可投放裝置
  S->>B: 用 OTP / license 換取連線許可
  B-->>S: 允許，回房間資訊
  S->>R: SDP offer（走 display-channel：direct 或 tunnel）
  R-->>S: SDP answer
  S->>R: ICE candidate 交換
  Note over S,R: DTLS 握手完成，SRTP 通道建立

  loop 投影中
    S->>S: 從虛擬顯示器讀畫面 → libwebrtc 編碼 H.264
    S->>R: SRTP 媒體封包
    R->>R: 解碼 → 畫到浮動視窗
    R-->>S: 觸控事件（反向控制，input-injection）
  end
`

export default function AirSyncPage() {
  const repos = REPOS.filter((r) => r.system.includes('airsync'))

  return (
    <>
      <PageHeader
        eyebrow="system"
        title="AirSync"
        lede={
          <>
            無線投影產品線，{repos.length} 個 repo。技術跨度從 Windows 顯示驅動、C++ libwebrtc
            fork、Go SFU，一路到 AirPlay/Google Cast 的相容實作 ——
            這是整個 domain 裡技術密度最高的一塊。
          </>
        }
      />

      <Prose>
        <h2>一、兩個主應用是一對</h2>
        <p>
          整條線的入口是兩個 Flutter App，repo 名與內部名不一致（讀 code 時會撞到）：
        </p>
        <ul>
          <li>
            <code>edu-as-airsync-sender</code> → 內部叫 <code>display_cast_flutter</code>，
            送畫面的那端，跨 Android / iOS / macOS / Windows / Web。
          </li>
          <li>
            <code>edu-as-airsync-receiver</code> → 內部叫 <code>display_flutter</code>，
            跑在 IFP／EDLA 大螢幕上收畫面。
          </li>
        </ul>
        <p>
          兩個都釘 Flutter SDK 3.24.2。C++ 那批（libwebrtc、AirPlay、Google Cast）是用{' '}
          <strong>git submodule</strong> 掛進來的，不是 pub 依賴 —— 所以 clone sender 時要記得{' '}
          <code>--recursive</code>，否則會少一大塊。
        </p>

        <h3>flavor 差異藏著權限模型</h3>
        <p>
          receiver 的 Android flavor 有四個，差別不只是簽章：
        </p>
        <ul>
          <li>
            <strong>IFP</strong>（ViewSonic AOSP 機種）— 用 platform key 簽，
            <strong>並且</strong>設 <code>android:sharedUserId=&quot;android.uid.system&quot;</code>
          </li>
          <li>
            <strong>EDLA</strong>（ViewSonic EDLA 機種）— 用 platform key 簽，
            <strong>但不設</strong> sharedUserId
          </li>
          <li>
            <strong>OPEN</strong>（別家 AOSP，從 myviewboard.com 下載）— 普通 key
          </li>
          <li>
            <strong>STORE</strong>（Google Play）— 普通 key
          </li>
        </ul>
        <p>
          那個 <code>sharedUserId</code> 的有無決定 App 能不能碰系統級 API。
          這直接影響反向控制能不能做 —— <code>edu-as-input-injection</code>{' '}
          要把觸控事件注入系統，沒有系統權限是做不到的。
          所以「哪個機種能反控」不是產品決策，是簽章決策。
        </p>
      </Prose>

      <Callout kind="warn" title="sender 的 flavor 少一個">
        sender 只有 IFP / OPEN / STORE，沒有 EDLA。合理推測是 EDLA 機種只當接收端不當發送端，
        但這點沒查證。
      </Callout>

      <Prose>
        <h2>二、一次投影從頭到尾發生什麼</h2>
        <p>
          這是 WebRTC 那條路徑（自家 App 對自家 App）。第三方協議那條走的是完全不同的流程。
        </p>
      </Prose>

      <Mermaid
        chart={SENDER_TO_RECEIVER}
        caption="注意 Display Backend 只出現在配對階段 —— 媒體流從不經過雲端。這是理解整個架構的關鍵。"
      />

      <Prose>
        <h2>三、為什麼 SFU 在裝置上</h2>
        <p>
          一對一投影用 P2P 就夠了。但教室情境是<strong>多台學生機同時投到一台大螢幕</strong>，
          或反過來一台送多台 —— 這時需要一個轉發節點。
        </p>
        <p>
          常規做法是在雲端架 SFU。但 <code>edu-as-golang-server</code> 選了另一條路：
          用 Gobind 把 Go 寫的 <code>ion-sfu</code> 編成 Android <code>.aar</code>，
          讓 SFU 直接跑在大螢幕本機。
        </p>
        <p>
          這個選擇的代價與好處都很明確：媒體完全不出區網（延遲低、頻寬省、隱私好），
          但大螢幕的 CPU 要吃下轉發成本，而且沒有雲端可以幫忙穿透 NAT。
          同 repo 還有 <code>flutter_webtransport</code>，代表除了 WebRTC 還有一條 QUIC 路徑，
          附帶自簽憑證與 hash 清單要塞進 receiver 的 <code>assets/channel</code> ——
          <strong>憑證到期輪替是個真實的運維坑</strong>。
        </p>

        <h2>四、第三方協議那條路</h2>
        <p>
          訪客拿 iPhone 走進教室，不會為了投影裝一個 App。所以必須實作 AirPlay 與 Google Cast
          的<strong>接收端</strong>，讓對方用原生功能就能投。
        </p>
        <p>
          入口是 <code>edu-as-mirror</code>（Flutter plugin），它的{' '}
          <code>android/src/main/cpp/</code> 底下 clone 了 <code>airplay</code> 與{' '}
          <code>googlecast</code> 兩個 C++ 專案。難的不是媒體解碼，是<strong>認證</strong>：
        </p>
        <ul>
          <li>
            AirPlay 要過 FairPlay 握手 → <code>edu-as-fairplay</code>，README 自稱
            <strong>clean-room implementation</strong>。這是法律用語，意思是刻意不參考 Apple
            的實作而重寫。這個措辭本身就說明了這塊的敏感度。
          </li>
          <li>
            Google Cast 要有裝置憑證 keyset，而且<strong>按日期輪替</strong> →{' '}
            <code>edu-as-libcastauth</code> 在執行期取用，<code>edu-as-castauthtool</code>{' '}
            負責從第三方產品裡提取。
          </li>
        </ul>
      </Prose>

      <Callout kind="warn" title="合規敏感區">
        <code>edu-as-castauthtool</code> 的手法（提權、關網路、關防毒、配 Windows Debugger）
        就是逆向工程，README 內還有第三方軟體的授權碼明文。這份筆記刻意不複製任何憑證內容。
        這塊對外討論前先確認 —— 包含對公司內其他團隊。
      </Callout>

      <Prose>
        <h2>五、Repo 地圖</h2>
        <p>
          依功能分群。<code>先讀</code> 標記是建議的學習順序起點；<code>上游</code>{' '}
          表示是幾乎原封不動的第三方專案，知道它為何在這就夠，不必深讀；
          <code>推論</code> 表示該條描述是從名稱推的，尚未查證。
        </p>
        <p>
          <code>local</code> / <code>offloaded</code> badge 是 render 時即時查{' '}
          <code>local.workspace.json</code> 與檔案系統得到的，不是寫死的。
        </p>
      </Prose>

      <RepoTable repos={repos} />
    </>
  )
}
