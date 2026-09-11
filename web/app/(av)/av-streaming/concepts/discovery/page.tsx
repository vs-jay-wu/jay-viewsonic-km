import { ConceptPage, Section } from '@/components/ConceptPage'
import { Callout } from '@/components/Prose'
import { CompareGrid, Steps } from '@/components/diagrams'
import { Mermaid } from '@/components/Mermaid'

const MDNS = `sequenceDiagram
  participant S as sender（要找裝置）
  participant M as 224.0.0.251:5353<br/>多播群組
  participant R as receiver（IFP）

  R->>M: 我是 "教室 301"，服務 _airplay._tcp，IP 192.168.1.50
  Note over M: 沒有伺服器，就是往群組廣播

  S->>M: 有誰提供 _airplay._tcp？（PTR query）
  R->>M: 有，我叫 "教室 301"（PTR response）
  S->>M: "教室 301" 的位址與埠？（SRV query）
  R->>M: 192.168.1.50:7000（SRV + A record）
  R->>M: 附帶能力資訊（TXT record）
`

export default function Page() {
  return (
    <ConceptPage id="discovery">
      <Section title="一、單播、廣播、多播：三種送封包的方式">
        <p>
          要理解裝置發現，得先分清楚封包有三種送法。
        </p>
      </Section>

      <CompareGrid
        columns={['送給誰', '沒訂閱的機器', '能跨路由器嗎']}
        rows={[
          {
            label: '單播 unicast',
            cells: [
              '一個明確的 IP',
              '根本收不到',
              <>
                能。日常 <strong>99%</strong> 的流量都是這種
              </>,
            ],
          },
          {
            label: '廣播 broadcast',
            cells: [
              '這個網段上的所有人',
              <>
                <strong>要收下、拆開、確認不是給自己的才丟掉</strong> —— 白花 CPU
              </>,
              <>
                <strong>不能。</strong>路由器不轉發廣播，否則整個網際網路會爆炸
              </>,
            ],
          },
          {
            label: '多播 multicast',
            cells: [
              <>
                有訂閱這個「群組」的人（IPv4 位址範圍 <code>224.0.0.0/4</code>）
              </>,
              <>
                <strong>網卡層就過濾掉</strong>，完全不吵到 CPU
              </>,
              '技術上可以，但實務上幾乎都被擋（見下）',
            ],
          },
        ]}
        verdict={
          <>
            廣播與多播的差別不在「送給幾個人」，在於
            <strong>不相關的機器要不要被打擾</strong>。
            這就是 mDNS 選多播而不是廣播的原因 —— 只有跑 mDNS 的裝置訂閱{' '}
            <code>224.0.0.251</code>，其他機器完全無感。
          </>
        }
      />

      <Callout kind="insight" title="為什麼發現一定要用廣播或多播">
        <p>
          因為這是個<strong>雞生蛋問題</strong>：你想找的正是「對方的 IP」，
          所以你不可能用單播去問它 —— 你根本不知道要問誰。
        </p>
        <p>
          唯一的辦法是<strong>對整個網段喊一聲</strong>：「有誰提供投影服務？」
          然後讓聽得懂的裝置自己回話。這就是 mDNS 的全部精神。
        </p>
      </Callout>

      <Section title="二、TTL = 1：一個決定了很多事的設計">
        <p>
          mDNS 的封包<strong>存活時間（TTL）刻意設成 1</strong>，意思是
          「不准經過任何一個路由器」。
        </p>
        <p>
          這是規格層級的設計決定 —— mDNS 定位是 <em>link-local</em>（同一個網段內），
          不是要跨網路運作。好處是不會污染整個網際網路，代價是：
        </p>
        <p>
          <strong>跨 VLAN 一定看不到對方，而且這不是 bug。</strong>
          所以企業網路要跨網段投影，唯一的解是裝一個{' '}
          <strong>mDNS reflector / Bonjour gateway</strong> ——
          由它在兩個網段之間代為轉述。細節見{' '}
          <a href="/concepts/transport">傳輸層</a>的白名單那節。
        </p>

        <h3>IGMP 是誰在管訂閱</h3>
        <p>
          機器要收多播，得先告訴網路設備「我要訂閱 <code>224.0.0.251</code> 這個群組」。
          這個通知走 <code>IGMP</code>，而交換器監聽這些通知、記錄「哪個埠有人訂了哪個群組」的
          機制叫 <strong>IGMP snooping</strong>。
        </p>
        <p>
          <strong>沒做 snooping 的交換器只能把多播當廣播處理</strong> —— 灌給所有埠。
          這就是為什麼設定錯誤的網路上，多播會變成把整個網段打爆的元凶。
          多播的效率優勢完全建立在網路設備有正確支援之上。
        </p>
      </Section>

      <Section title="三、三個名字講的是不是同一件事">
        <p>幾乎是，但層次不同，分清楚會少很多混亂：</p>
        <ul>
          <li>
            <strong>mDNS</strong>（Multicast DNS）— 協議本身。沒有 DNS 伺服器，
            改成往多播位址 <code>224.0.0.251:5353</code> 問，誰認得自己就自己回答。
            解析 <code>.local</code> 網域
          </li>
          <li>
            <strong>DNS-SD</strong>（Service Discovery）— 建在 DNS 記錄之上的<em>慣例</em>，
            規定「怎麼用 PTR / SRV / TXT 記錄描述一個服務」。它不限定要跑在 mDNS 上，
            但實務上通常是
          </li>
          <li>
            <strong>Bonjour</strong> — Apple 對 mDNS + DNS-SD 的實作與品牌名。
            <code>edu-as-mdns-responder</code> 就是 Apple 開源的那份參考實作
          </li>
        </ul>
        <p>
          所以正確的說法是：Bonjour 是 mDNS + DNS-SD 的一個實作。
          Android 的 <code>NsdManager</code>、Linux 的 Avahi 是別的實作，可以互通。
        </p>
      </Section>

      <Section title="四、一次發現長什麼樣">
        <p>
          關鍵是<strong>沒有中心</strong>。沒有伺服器記錄誰在線上，
          每台裝置自己宣告、自己回答。
        </p>
      </Section>

      <Mermaid chart={MDNS} />

      <Section title="五、四種記錄各自的角色">
        <Steps
          items={[
            {
              label: 'PTR — 「有誰提供這種服務？」',
              detail: (
                <>
                  從服務類型（<code>_airplay._tcp.local</code>）問到實例名稱。
                  這是瀏覽清單的那一步 —— 使用者看到的「可投放裝置列表」就是一堆 PTR 回應。
                </>
              ),
            },
            {
              label: 'SRV — 「這個實例在哪個埠？」',
              detail: (
                <>
                  從實例名稱問到主機名 + 埠號。AirPlay 慣用 7000，Google Cast 用 8009。
                </>
              ),
            },
            {
              label: 'A / AAAA — 「這個主機名是什麼 IP？」',
              detail: '最後才拿到真正的位址。',
            },
            {
              label: 'TXT — 附帶能力資訊',
              detail: (
                <>
                  key=value 的字串陣列，塞裝置能力：支援哪些解析度、要不要密碼、
                  韌體版本、機型。<strong>這是最容易被忽略但很實用的一塊</strong> ——
                  很多相容性判斷在連線前就靠 TXT 完成。
                </>
              ),
            },
          ]}
        />
        <p>
          一個裝置通常同時宣告多種服務。IFP 可能同時有 <code>_airplay._tcp</code>、
          <code>_raop._tcp</code>（AirPlay 音訊）與 <code>_googlecast._tcp</code>，
          這樣 iPhone 與 Chrome 都能看到它。
        </p>
      </Section>

      <Section title="六、多播在真實網路裡為什麼常常壞掉">
        <p>
          mDNS 依賴多播，而多播是網路管理員最喜歡關掉的東西之一。
          實務上會撞到的：
        </p>
        <ul>
          <li>
            <strong>Client isolation / AP isolation</strong> —
            無線 AP 禁止同 SSID 下的裝置互通。飯店、校園、公共 Wi-Fi 的預設安全設定。
            這一條會讓 mDNS 與後續的直連<strong>一起死</strong>，是最常見的元凶
          </li>
          <li>
            <strong>VLAN 隔離</strong> — 學生網段與教師網段分開。多播 TTL 是 1，
            設計上就不跨網段，所以隔著 VLAN 一定看不到
          </li>
          <li>
            <strong>大型網路刻意抑制</strong> — 幾百台裝置一起發 mDNS 會產生可觀的廣播流量，
            所以企業級控制器常有 mDNS proxy 或直接過濾
          </li>
          <li>
            <strong>Wi-Fi 省電機制</strong> — 裝置睡著時收不到多播，
            表現是「明明在同一個網路但列表裡沒出現，重新開關 Wi-Fi 就好了」
          </li>
        </ul>
      </Section>

      <Callout kind="insight" title="所以每個投影產品都需要退路">
        <p>
          發現失敗是常態不是例外，這決定了產品設計。常見的三種退路：
        </p>
        <ul>
          <li>
            <strong>手動輸入 IP</strong> — 最原始但總是有效。前提是使用者知道 IP
          </li>
          <li>
            <strong>螢幕上顯示配對碼</strong> — 大螢幕顯示一組 OTP，使用者在自己裝置輸入。
            這繞過了發現：改成問雲端「這個 OTP 對應哪台機器」。
            <code>edu-mvb-presentation-gateway</code> 做的就是這件事
          </li>
          <li>
            <strong>雲端裝置清單</strong> — 裝置主動向雲端註冊，使用者從清單挑。
            完全不依賴區網廣播
          </li>
        </ul>
        <p>
          <strong>OTP 在教室情境比帳號登入好用得多</strong>：老師不需要知道機器名稱，
          抬頭看螢幕、輸入四到六位數就好，而且天然帶有「你人在這間教室」的驗證性質。
        </p>
      </Callout>

      <Section title="七、Open Screen Protocol 想解決什麼">
        <p>
          AirPlay 是 Apple 的、Google Cast 是 Google 的，兩套互不相通，
          而且都不是開放標準（相容實作要靠逆向）。
          <strong>Open Screen Protocol</strong> 是 W3C 想推的開放替代品：
          標準化的發現（就是用 mDNS/DNS-SD）加上標準化的控制與串流。
        </p>
        <p>
          <code>edu-as-openscreen</code> 是 Chromium 的實作。它的價值有兩層：
        </p>
        <ul>
          <li>
            <strong>OSP 本身</strong> —— 但市場採用率低，實務重要性有限
          </li>
          <li>
            <strong>它同時實作了 mDNS/DNS-SD 與 Chromecast 協議</strong>（發現、
            應用控制、媒體串流），而且是 Chromium 官方專案 ——
            <strong>文件與程式碼品質是這批 repo 裡最好的</strong>
          </li>
        </ul>
        <p>
          所以想學「裝置發現 + 投放協議」怎麼正確實作，從這裡讀最有效率，
          比讀那些沒有 README 的 C++ repo 好得多。它的模組可以獨立使用，不必整包吃下。
        </p>
      </Section>

      <Section title="八、Go 那條路徑有自己的一份">
        <p>
          <code>edu-as-pion-mdns</code> 的存在只是因為語言邊界：
          裝置本機的 SFU 是 Go 寫的，需要 Go 的 mDNS 實作。
        </p>
        <p>
          順帶一提，<strong>WebRTC 自己也用 mDNS</strong>，但目的完全不同 ——
          瀏覽器為了不洩漏使用者的區網 IP，會把 host candidate 換成一個隨機的{' '}
          <code>.local</code> 名稱，讓對方用 mDNS 去解。
          這是隱私機制，不是裝置發現。看到 SDP 裡有 <code>.local</code> candidate
          不要以為是 Bonjour 在做事。
        </p>
      </Section>
    </ConceptPage>
  )
}
