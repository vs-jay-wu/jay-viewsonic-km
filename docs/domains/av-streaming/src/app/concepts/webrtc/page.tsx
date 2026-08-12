import { ConceptPage, Section } from '@/components/ConceptPage'
import { Callout } from '@/components/Prose'
import { CompareGrid, Steps } from '@/components/diagrams'
import { Mermaid } from '@/components/Mermaid'

const ICE_FLOW = `sequenceDiagram
  participant A as Peer A
  participant S as STUN / TURN
  participant B as Peer B

  Note over A,B: 1 · 各自蒐集 candidate
  A->>A: host candidate（自己的區網 IP）
  A->>S: 我從外面看起來是什麼 IP？
  S-->>A: srflx candidate（你的公網位址）
  A->>S: 幫我開一個中繼
  S-->>A: relay candidate（TURN 的位址）

  Note over A,B: 2 · 透過信令交換
  A->>B: SDP offer + candidates
  B-->>A: SDP answer + candidates

  Note over A,B: 3 · 連通性檢查（打洞）
  A->>B: STUN binding request（每一組配對都試）
  B->>A: STUN binding request（雙向同時打）
  Note over A,B: 第一組成功的配對就是勝出者

  Note over A,B: 4 · DTLS 握手 → 導出 SRTP 金鑰
  A->>B: 加密後的媒體
`

export default function Page() {
  return (
    <ConceptPage id="webrtc">
      <Section title="一、先問：為什麼兩台機器直接連這麼難">
        <p>
          平常上網的模型是 <strong>client → server</strong>，而伺服器有四個很好用的前提：
        </p>
        <ul>
          <li>
            <strong>固定的公網 IP</strong> —— 你知道要連去哪
          </li>
          <li>
            <strong>永遠在監聽</strong> —— 它隨時準備接受連入
          </li>
          <li>
            <strong>有網域名稱與 CA 憑證</strong> —— 你能驗證「它真的是它」
          </li>
          <li>
            <strong>你知道它支援什麼</strong> —— 它是服務提供者，規格由它定
          </li>
        </ul>
        <p>
          <strong>P2P 把這四個前提全部打破。</strong>
          對方是一台隨便哪裡的筆電或平板 —— 沒有公網 IP、防火牆預設擋掉所有主動連入、
          不可能給每台機器發 CA 憑證、而且兩邊支援的 codec 還不一樣。
        </p>

        <h3>NAT 到底做了什麼</h3>
        <p>
          你家或公司只有<strong>一個</strong>公網 IP，內部卻有幾十台裝置。
          路由器靠 <code>NAT</code>（網路位址轉換）解決：
        </p>
        <p>
          當你往外連時，路由器記下一筆對應 ——
          <code>內部 192.168.1.5:5000 ↔ 外部 203.0.113.7:41234</code> ——
          回來的封包才知道要轉給哪台機器。
        </p>
        <p>
          <strong>關鍵在於：這筆對應是「你先往外送」才會建立的。</strong>
          沒有人主動連進來的路 —— 封包送到你家路由器時，它查不到對應表，直接丟掉。
        </p>
        <p>
          所以兩台都在 NAT 後面時，問題是雙重的：
          <strong>誰都不知道對方的外部位址</strong>，而且<strong>就算知道也送不進去</strong>。
        </p>
      </Section>

      <Callout kind="insight" title="打洞：靠「同時往外送」建立雙向通道">
        <p>
          解法很聰明。假設 A 與 B 透過某個管道（信令伺服器）交換了彼此的外部位址，
          然後<strong>兩邊同時往對方的外部位址送封包</strong>：
        </p>
        <ul>
          <li>
            A 送出的封包 —— 在 <strong>A 的路由器</strong>建立了一筆對應，
            但到 B 的路由器時被丟掉
          </li>
          <li>
            B 送出的封包 —— 同樣在 <strong>B 的路由器</strong>建立了對應，到 A 這邊被丟掉
          </li>
          <li>
            <strong>但現在兩邊的對應表都有了。</strong>
            第二輪封包就雙向都通了
          </li>
        </ul>
        <p>
          這叫 <strong>hole punching</strong>（打洞），也是 ICE 實際在做的事。
          「洞」指的就是路由器對應表裡那一筆暫時的紀錄。
        </p>
        <p>
          兩件事值得注意：<strong>必須先有一個雙方都連得到的第三方</strong>來交換位址
          （這就是信令伺服器存在的理由），以及<strong>不是每種 NAT 都打得通</strong> ——
          打不通時就只能走中繼。
        </p>
      </Callout>

      <Section title="二、WebRTC 是一包東西，不是一個協議">
        <p>
          WebRTC 常被當成單一技術講，實際上它是把好幾個既有標準綁在一起的集合：
        </p>
        <ul>
          <li>
            <strong>SDP</strong> — 描述「我支援什麼」的文字格式
          </li>
          <li>
            <strong>ICE / STUN / TURN</strong> — 想辦法在 NAT 後面建立連線
          </li>
          <li>
            <strong>DTLS</strong> — 交換金鑰
          </li>
          <li>
            <strong>SRTP</strong> — 加密的媒體傳輸
          </li>
          <li>
            <strong>SCTP over DTLS</strong> — DataChannel 走的路
          </li>
        </ul>
        <p>
          而且它<strong>刻意不定義信令</strong>。SDP 怎麼從 A 送到 B 完全由你決定 ——
          WebSocket、HTTP、甚至人工複製貼上都行。這是理解整個架構的第一個關鍵：
          <strong>信令伺服器與媒體傳輸是兩件完全獨立的事</strong>。
        </p>
      </Section>

      <Callout kind="insight" title="這解釋了 AirSync 的架構">
        <code>edu-mvb-presentation-gateway</code>（Display Backend）只參與配對與授權 ——
        OTP、license、presenter 名額。一旦 SDP 交換完成，
        <strong>媒體流直接在區網裡走，雲端完全不碰</strong>。
        所以「後端掛了正在投影的會不會斷」答案是不會，但「新的人能不能加入」答案是不能。
      </Callout>

      <Section title="三、SDP：一份可以讀的協商文件">
        <p>
          SDP 是純文字，一行一個欄位。實務上要會讀的就幾種：
        </p>
        <ul>
          <li>
            <code>m=video 9 UDP/TLS/RTP/SAVPF 96 97 98</code> — 一個媒體區段。
            後面那串數字是<strong>按偏好排序</strong>的 payload type
          </li>
          <li>
            <code>a=rtpmap:96 H264/90000</code> — payload type 96 是 H.264，時間基準 90000
          </li>
          <li>
            <code>a=fmtp:96 profile-level-id=42e01f</code> — codec 的細部參數。
            <strong>兩端這裡不相容就會連上但沒畫面</strong>
          </li>
          <li>
            <code>a=sendrecv</code> / <code>a=recvonly</code> / <code>a=sendonly</code> — 方向。
            投影的 receiver 常常是 <code>recvonly</code>
          </li>
          <li>
            <code>a=ice-ufrag</code> / <code>a=ice-pwd</code> — ICE 的認證資訊
          </li>
          <li>
            <code>a=fingerprint:sha-256 ...</code> — DTLS 憑證指紋。
            這是安全模型的關鍵：憑證是自簽的，但指紋透過（可信的）信令通道傳遞，
            所以能防中間人
          </li>
        </ul>
        <p>
          <strong>offer/answer</strong> 的邏輯是：A 送出自己支援的所有東西，
          B 回一份「我們兩個的交集」。所以答案裡的 codec 一定是雙方都有的。
          debug「連上了但沒畫面」的第一步永遠是把兩邊 SDP 抓出來比對。
        </p>
      </Section>

      <Section title="四、ICE：在 NAT 後面找到彼此">
        <p>
          兩台機器都在 NAT 後面，都沒有可以被連入的公網位址 —— 這是 P2P 最核心的難題。
          ICE 的解法是「把所有可能的位址都列出來，然後全部試一遍」。
        </p>
      </Section>

      <Mermaid chart={ICE_FLOW} />

      <Section title="五、三種 candidate 與 TURN 的成本">
        <CompareGrid
          columns={['是什麼', '成功條件', '成本']}
          rows={[
            {
              label: 'host',
              cells: [
                '自己網卡上的 IP',
                '兩端在同一個區網',
                '零。教室投影絕大多數走這條',
              ],
            },
            {
              label: 'srflx',
              cells: [
                '透過 STUN 問到的公網位址',
                'NAT 行為配合，打洞成功',
                '幾乎零。STUN 只回一句話就結束',
              ],
            },
            {
              label: 'relay',
              cells: [
                'TURN 伺服器上的一個轉發位址',
                '幾乎總是成功',
                '高。所有媒體都經過伺服器，頻寬成本直接乘上去',
              ],
            },
          ]}
          verdict={
            <>
              TURN 是最後的退路而不是常態。它會成功但很貴 ——
              每一路 2 Mbps 的投影經過 TURN，就是伺服器上進出各 2 Mbps。
              <code>edu-mvb-geticeserver-svc</code>（已停用）就是負責發 TURN 憑證的服務；
              AirSync 因為主打同網段投影，對 TURN 的依賴比一般視訊會議低得多。
            </>
          }
        />
      </Section>

      <Section title="六、加密：DTLS-SRTP">
        <p>
          WebRTC <strong>強制加密</strong>，沒有關掉的選項。流程是先用 DTLS
          （TCP 上的 TLS 搬到 UDP 的版本）做握手交換金鑰，
          然後用導出的金鑰以 SRTP 加密實際的媒體封包。
        </p>
        <p>
          憑證是<strong>自簽的</strong> —— 沒有 CA、沒有網域驗證。安全性來自那個{' '}
          <code>a=fingerprint</code>：如果信令通道可信，你就知道對面的憑證該長什麼樣，
          中間人換掉憑證會被指紋比對抓到。
        </p>
        <p>
          這也意味著<strong>信令通道的安全性是整個系統的信任根</strong>。
          信令能被篡改，加密就形同虛設。
        </p>
      </Section>

      <Section title="七、DataChannel：媒體之外的那條路">
        <p>
          DataChannel 走 SCTP over DTLS，跟媒體共用同一條已打通的連線。
          它可以設成可靠（像 TCP）或不可靠（像 UDP），有序或無序。
        </p>
        <p>
          <strong>反向控制大概走這條</strong>（待查證）。原因是觸控事件需要可靠有序 ——
          丟掉一個 touch-up 事件會讓畫面卡在按住的狀態。用 DataChannel
          比另開一條連線好，因為 NAT 已經打通了，不用再打一次。
        </p>
      </Section>

      <Section title="八、一對多的三種架構">
        <CompareGrid
          columns={['P2P mesh', 'SFU', 'MCU']}
          rows={[
            {
              label: '怎麼做',
              cells: [
                '每個人跟每個人都建一條連線',
                '中間人只複製轉發，不解碼',
                '中間人解碼、合成一張大畫面、重新編碼',
              ],
            },
            {
              label: '發送端負擔',
              cells: ['N−1 路上傳，很快就爆', '1 路（或 simulcast 幾路）', '1 路'],
            },
            {
              label: '伺服器負擔',
              cells: ['無', '低（只搬封包）', '極高（每個房間都要轉碼）'],
            },
            {
              label: '延遲',
              cells: ['最低', '低（多一跳）', '高（轉碼一定要緩衝）'],
            },
            {
              label: '接收端負擔',
              cells: ['N−1 路解碼', 'N−1 路解碼', '一路解碼'],
            },
          ]}
          verdict={
            <>
              人數少（2–4）用 mesh 最簡單。人數上去就要 SFU。
              MCU 只在接收端很弱（例如電話撥入、老舊裝置）時才值得。
              但實務上還有第四種 —— 見下。
            </>
          }
        />

        <h3>第四種：peer 中繼樹（scalable broadcast）</h3>
        <p>
          MVB Cast 的信令伺服器裡有 <code>Scalable-Broadcast.js</code>，
          而它的 <code>maxRelayLimitPerUser</code> 預設是 <strong>2</strong>。
        </p>
        <p>
          這是 mesh 與 SFU 之間的第三條路：<strong>用觀眾自己當中繼節點</strong>。
          發送端只上傳給 2 個 peer，那 2 個各自再轉給 2 個，形成一棵二元樹。
          N 個觀眾的發送端負擔是常數，而且<strong>完全不需要伺服器轉發媒體</strong>。
        </p>
        <p>
          代價很明確：延遲隨樹的深度累積（第三層要經過兩次轉發），
          而且<strong>中間節點離線會斷掉它下面整棵子樹</strong>。
          所以它適合「觀眾多、但可以容忍偶發重連」的廣播場景，
          不適合互動式會議。
        </p>
        <p>
          對照 <code>edu-mvb-cast-app</code> 裡有 <code>cast-out-module-scalable.js</code> ——
          客戶端有對應的模組，所以這條路是真的在用，不只是函式庫附帶的功能。
        </p>
      </Section>

      <Section title="九、AirSync 的反直覺選擇：SFU 在裝置上">
        <p>
          常規做法是在雲端架 SFU。<code>edu-as-golang-server</code> 選了另一條路：
          用 Gobind 把 Go 寫的 <code>ion-sfu</code> 編成 Android <code>.aar</code>，
          SFU 直接跑在大螢幕本機。
        </p>
        <Steps
          items={[
            {
              label: '好處：媒體完全不出區網',
              detail:
                '延遲最低、不吃網際網路頻寬、資料不離開教室（隱私與法規上都好講）、雲端成本為零。',
            },
            {
              label: '代價：大螢幕要吃轉發成本',
              detail:
                'CPU 與記憶體都要負擔。而且 IFP 的算力遠不如雲端主機，能撐幾路是硬限制。',
            },
            {
              label: '代價：沒有雲端幫忙穿透',
              detail:
                '雲端 SFU 天然有公網位址，所有人連它就好，NAT 問題自動消失。裝置本機 SFU 沒這個好處，所以更依賴「大家在同一個區網」這個前提。',
            },
          ]}
        />
        <p>
          這個選擇跟產品定位是自洽的：AirSync 的場景就是一間教室裡的裝置互投，
          不是跨網際網路的會議。<strong>把架構決策放回使用情境看，就不覺得奇怪了。</strong>
        </p>
      </Section>

      <Section title="十、為什麼要維護 libwebrtc fork">
        <p>
          <code>edu-as-webrtc</code> 起源是 LiveKit 的 WebRTC-SDK，README 列的是上游那批改動 ——
          每一條都是真實的平台坑：動態取得 decoder 繞過硬體解碼器實例數上限、
          Android/iOS/Mac 補上 simulcast、iOS 播放模式不要求麥克風權限、
          Windows 內建 AEC 開啟時搶不到麥克風、Mac 螢幕擷取。
        </p>
        <p>
          <strong>但 ViewSonic 已經在這份 fork 上長出自己的一整條開發線</strong>，
          而 README 沒更新，所以光看 README 會誤判成純 vendored。
          從分支與 commit 看得出實際在改什麼：
        </p>
        <ul>
          <li>
            default branch 是 <code>v0.9.36-windows</code>，分支以人名開頭並帶內部 user story 編號
          </li>
          <li>
            <code>Rick/94173-dynamic-bitrate-h264-mf</code>、
            <code>Rick/100006-optimize-h264-encoder-quality-parameters</code>、
            <code>Rick/99861-Implement-FPS-compensation-with-bitrate-adjustment</code> ——
            <strong>MF = Media Foundation</strong>，也就是 Windows 的硬體編碼器。
            主戰場是它的速率控制
          </li>
          <li>
            commit 訊息幾乎就是本頁的實戰版：「reduce ALR max paced queue time」、
            「fix pacing to 2.0」、「mitigate stutter caused by high RTT fluctuation」、
            「set encoder <code>has_trusted_rate_controller</code>」、
            「set max framerate as 25」、「encoder uses PeakConstraintVBR」
          </li>
          <li>
            CI 把 git tag 與 commit hash 埋進 <code>libwebrtc.dll</code> 的版本資訊 ——
            產出物是 Windows DLL
          </li>
        </ul>
        <p>
          這批改動全部繞著同一件事：<strong>Windows 硬體編碼器的速率控制不夠好</strong>。
          <code>has_trusted_rate_controller</code> 這個旗標是在告訴 WebRTC
          「編碼器自己會控 bitrate，你不要再插手」；<code>PeakConstraintVBR</code>{' '}
          是換一種 MF 的速率控制模式；把 framerate 上限壓到 25 是為了讓編碼器有餘裕。
          對照 <a href="/concepts/codecs">編解碼器</a>「硬編 vs 軟編」講的可控性問題，
          這就是實際被那個問題咬到之後的修法。
        </p>
      </Section>
    </ConceptPage>
  )
}
