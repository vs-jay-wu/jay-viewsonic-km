import { ConceptPage, Section } from '@/components/ConceptPage'
import { Callout } from '@/components/Prose'
import { CompareGrid, Steps } from '@/components/diagrams'
import { Mermaid } from '@/components/Mermaid'

const HOL = `flowchart TB
  subgraph T["TCP：一條有序的位元流"]
    T1["封包 1 到達"] --> T2["封包 2 丟了"] --> T3["封包 3、4、5 已到<br/>但被扣在緩衝區等重傳"]
    T3 --> T4["整條流停住"]
  end
  subgraph U["UDP：獨立的訊息"]
    U1["封包 1 到達 → 交出去"]
    U2["封包 2 丟了 → 這一幀壞掉"]
    U3["封包 3、4、5 到達 → 照樣交出去"]
  end
`

export default function Page() {
  return (
    <ConceptPage id="transport">
      <Section title="一、為什麼即時影音幾乎都在 UDP 上">
        <p>
          直覺上 TCP 比較好 —— 保證送到、保證順序、自動重傳。
          但對即時影音來說，這三個「保證」全都是缺點。
        </p>
        <p>
          核心問題是 <strong>head-of-line blocking</strong>：TCP 把資料視為一條連續的位元流，
          第 2 個封包沒到，後面已經到的封包就不能交給應用程式 —— 因為那會破壞順序保證。
        </p>
      </Section>

      <Mermaid
        chart={HOL}
        caption="TCP 丟一包，整條流停住等重傳（一個 RTT，可能 30–200 ms）。UDP 丟一包只毀掉那一幀，下一幀照樣播。"
      />

      <Callout kind="insight" title="關鍵在於「遲到的資料是垃圾」">
        <p>
          即時影音有一個檔案傳輸沒有的性質：<strong>過期的資料完全沒有價值</strong>。
          第 100 幀重傳成功時已經該播第 106 幀了，那一幀拿到也沒用。
        </p>
        <p>
          所以正確的策略不是「保證送到」，而是「送不到就算了，趕快補一個新的」——
          這就是為什麼 WebRTC 收到丟包時的反應是請求一個新的 I-frame（PLI），
          而不是重傳舊資料。
        </p>
        <p>
          （WebRTC 也有選擇性重傳 <strong>NACK</strong>，但只在 RTT 很短、來得及的情況下用。
          原則沒變：來不及就放棄。）
        </p>
      </Callout>

      <Section title="二、擁塞控制：畫面變糊是誰決定的">
        <p>
          UDP 本身沒有擁塞控制 —— 你想發多快就發多快。這對網路是災難，
          所以 WebRTC 在應用層自己做了一套，主流是 <strong>GCC</strong>
          （Google Congestion Control）。
        </p>
        <Steps
          items={[
            {
              label: '量測封包到達的時間差',
              detail:
                '發送端在每個封包標記送出時間，接收端回報到達時間。如果封包間隔在接收端變得比發送端更大，代表某處開始排隊 —— 這是壅塞的早期訊號，比等到丟包才反應快得多。',
            },
            {
              label: '估測可用頻寬',
              detail:
                '結合延遲趨勢與丟包率，算出一個目標位元率。接收端會透過 RTCP 的 REMB 或 transport-cc 回報。',
            },
            {
              label: '通知編碼器調整',
              detail: (
                <>
                  這是整條鏈的關鍵一環：<strong>傳輸層去命令編碼器降低 bitrate</strong>。
                  編碼器降 bitrate 的手段是加大量化參數 —— 畫面就變糊了。
                </>
              ),
            },
          ]}
        />
        <p>
          所以「投影畫面突然變糊」通常不是編碼器的問題，也不是網路真的斷了，
          而是<strong>擁塞控制判斷網路變差，主動選擇了糊而不頓</strong>。
          這是刻意的取捨：對投影來說模糊比卡頓可接受。
        </p>
      </Section>

      <Section title="三、QUIC 與 WebTransport">
        <p>
          QUIC 是建在 UDP 上、把 TLS 內建進去的傳輸協議（HTTP/3 的底層）。
          它解決 TCP 的 head-of-line blocking 方式很聰明：
          <strong>支援多個獨立的 stream，一個 stream 卡住不影響其他</strong>。
        </p>
        <p>
          <strong>WebTransport</strong> 是把 QUIC 的能力開放給應用層的 API。
          它同時提供可靠有序的 stream 與不可靠的 datagram —— 也就是說，
          一條連線上就能同時做「控制訊息要保證送到」與「媒體丟了算了」。
        </p>
        <CompareGrid
          columns={['WebRTC', 'WebTransport']}
          rows={[
            {
              label: '底層',
              cells: ['UDP + ICE + DTLS + SRTP', 'UDP + QUIC（TLS 內建）'],
            },
            {
              label: '連線建立',
              cells: ['ICE 打洞，複雜但能穿 NAT', '像 HTTPS 一樣連伺服器，簡單但需要可連入的端點'],
            },
            {
              label: 'P2P',
              cells: ['原生支援', '不支援 —— 是 client-server 模型'],
            },
            {
              label: '媒體處理',
              cells: ['內建 RTP、jitter buffer、擁塞控制', '什麼都沒有，全部自己實作'],
            },
          ]}
          verdict={
            <>
              WebTransport 不是 WebRTC 的替代品，是另一種取捨：
              放棄 P2P 與內建媒體處理，換取簡單得多的連線建立與更好的多路獨立性。
              適合「明確有一個伺服器端點」的場景。
            </>
          }
        />
      </Section>

      <Section title="四、WebTransport 的自簽憑證機制與那個運維坑">
        <p>
          QUIC 強制 TLS，所以 WebTransport 一定要憑證。但投影的接收端是教室裡的 IFP ——
          它沒有網域名稱，拿不到正常的 CA 憑證。
        </p>
        <p>
          解法是 WebTransport 規格提供的 <code>serverCertificateHashes</code>：
          client 可以帶著「我預期伺服器憑證的 SHA-256 是這個」去連線，
          憑證是自簽的也接受。這跟 WebRTC 的 <code>a=fingerprint</code> 是同一個思路。
        </p>
        <p>
          <code>edu-as-golang-server</code> 的 README 把這套流程寫得很清楚：
        </p>
        <ul>
          <li>
            <code>./script/generate_certs.sh 20250201 20350201</code> 產生憑證
          </li>
          <li>
            <code>certs/webtransport_certs_list.json</code> 放進{' '}
            <code>Display_Flutter/assets/channel</code>
          </li>
          <li>
            <code>./script/generate_certs_hash.sh certs</code> 產生 hash，也放進 assets
          </li>
        </ul>
      </Section>

      <Callout kind="warn" title="憑證清單被烤進 App 裡">
        <p>
          注意那三步的結果：<strong>憑證與 hash 清單是 App 的 asset</strong>，
          意思是它們隨著版本一起發佈。
        </p>
        <p>
          所以憑證到期不是「換一個檔案」就好，是<strong>要發新版 App</strong>。
          而 IFP 上的 App 更新往往依賴 OTA、依賴使用者、依賴機器有連網 ——
          舊版永遠會存在。
        </p>
        <p>
          這也解釋了為什麼腳本的有效期給到 <code>20350201</code>（十年）：
          不是不知道長效憑證有風險，是<strong>更新路徑的現實讓短效憑證不可行</strong>。
          這種取捨在文件裡看不到，只能從參數推出來。
        </p>
      </Callout>

      <Section title="五、direct 與 tunnel：企業網路的現實">
        <p>
          <code>edu-as-display-channel</code> 的 example 有兩種模式：
          <code>--mode direct</code> 與 <code>--mode tunnel</code>。
          雖然實作細節還沒查（這是待釘問題之一），但這組命名對應的問題很明確。
        </p>
        <p>
          <strong>教室的網路通常不是為 P2P 設計的。</strong>常見的三種阻擋：
        </p>
        <ul>
          <li>
            <strong>Client isolation</strong>（又叫 AP isolation）— 無線 AP 刻意禁止
            同一個 SSID 下的裝置互通。這是飯店與校園 Wi-Fi 的預設安全設定，
            會讓所有區網直連與 mDNS 一起失效
          </li>
          <li>
            <strong>VLAN 隔離</strong> — 學生網段與教師網段分開，廣播不跨網段
          </li>
          <li>
            <strong>防火牆規則</strong> — 只放行 80/443，UDP 全擋
          </li>
        </ul>
        <p>
          所以任何投影產品都需要退路，而退路通常長成「走一個雙方都連得到的中繼點」——
          也就是 tunnel。這條路慢、貴、但至少能用。
          <strong>direct 是理想、tunnel 是保底</strong>，能不能自動判斷並切換，
          就是產品在真實環境的成敗關鍵。
        </p>
      </Section>

      <Callout kind="insight" title="先釐清：這裡的問題通常不是 NAT">
        <p>
          兩台機器在同一個區網時，ICE 用 host candidate 直接連就好，
          <strong>根本不經過 NAT</strong>。所以「NAT 穿透」在教室投影的場景其實不是主要難題。
        </p>
        <p>
          真正會擋死的是 <strong>L2／L3 的隔離</strong> —— AP 禁止同 SSID
          的裝置互通、或兩邊在不同 VLAN。這是完全不同的問題，
          而且它擋掉的不只是媒體，連 mDNS 發現都一起死。
        </p>
      </Callout>

      <Section title="五之二、被擋住時網路端能做什麼">
        <p>
          好消息是「沒救」不成立 —— 只要有一個雙方都連得到的中繼點，永遠有解。
          但在動用中繼之前，多數情況其實可以靠網路設定解決，而且效果好得多。
        </p>

        <h3>三種擋法，中繼救不救得了</h3>
      </Section>

      <CompareGrid
        columns={['擋在哪一層', '中繼／TURN 救得了嗎']}
        rows={[
          {
            label: 'Client isolation',
            cells: [
              'L2 —— AP 直接禁止同 SSID 裝置互通',
              <>
                <strong>救得了</strong>。雙方都是「往外連中繼點」，不是互連
              </>,
            ],
          },
          {
            label: 'VLAN 隔離',
            cells: [
              'L3 —— 學生網段與教師網段分開',
              <>
                <strong>救得了</strong>，同理
              </>,
            ],
          },
          {
            label: '只放行 80/443',
            cells: [
              '防火牆',
              <>
                要中繼點<strong>能用 443/TCP</strong> 才行（TURN over TLS）
              </>,
            ],
          },
        ]}
        verdict={
          <>
            中繼能救所有情況，代價是延遲、頻寬成本，
            以及<strong>媒體會離開區網</strong> —— 在教室情境這本身可能就是個政策問題。
          </>
        }
      />

      <Section title="五之三、實際的白名單清單">
        <h3>發現層（mDNS）—— 最常壞的一層</h3>
        <ul>
          <li>
            關掉該 SSID 的 client isolation。各家名稱不同：Cisco 叫{' '}
            <em>P2P Blocking Action</em>、Aruba 叫 <em>deny-inter-user-bridging</em>、
            UniFi 叫 <em>Client Device Isolation</em>、Meraki 叫 <em>LAN isolation</em>
          </li>
          <li>
            放行 <strong>UDP 5353 → 224.0.0.251</strong>（IPv6 是 <code>ff02::fb</code>）
          </li>
          <li>
            跨 VLAN 要投的話，需要 <strong>mDNS reflector / Bonjour gateway</strong>{' '}
            把廣播橋接過去 —— Cisco Wide Area Bonjour、Aruba AirGroup、UniFi 的 mDNS
            forwarding。<strong>這是「兩個網段分開但要能投」的標準答案</strong>，
            不需要把網段合併
          </li>
          <li>
            檢查 IGMP snooping 有沒有配 querier —— 配錯的話多播會被整段吃掉
          </li>
        </ul>

        <h3>媒體層（WebRTC）</h3>
        <ul>
          <li>兩台裝置之間的 UDP 高埠要通。App 若有鎖埠範圍就能收窄，沒有就是動態埠</li>
          <li>
            若有用 STUN/TURN：UDP/TCP <strong>3478</strong>、TLS <strong>5349</strong>
          </li>
        </ul>

        <h3>第三方協議（訪客不裝 App 那條路）</h3>
        <p>
          這條路的埠比較固定，因為要相容別人家的實作：
        </p>
        <ul>
          <li>
            <strong>Google Cast</strong> — TCP <strong>8008</strong>（HTTP）與{' '}
            <strong>8009</strong>（TLS，協議主體）；媒體走 Google 文件列的 UDP{' '}
            32768–61000；舊版發現還會用 SSDP UDP 1900
          </li>
          <li>
            <strong>AirPlay</strong> — TCP <strong>7000</strong> 與 7100、RAOP 的 TCP 5000，
            加一段動態 UDP。AirPlay 2 還會用 <strong>PTP（UDP 319/320）</strong>做時鐘同步
            —— 這個特別容易被忽略，<strong>時鐘同步不過的表現是「連上了但畫面不動」</strong>
          </li>
        </ul>
      </Section>

      <Callout kind="warn" title="埠號請以廠商當版文件為準">
        <p>
          5353、8009、7000 這幾個是穩定的。但<strong>動態 UDP 範圍各版本會變</strong>，
          而且 AirPlay 的埠在不同 iOS 版本上調整過。
          要開白名單前請對照 Apple / Google 當版的支援文件，不要照抄這頁。
        </p>
      </Callout>

      <Section title="五之四、所以裝置本機 SFU 的代價在這裡">
        <p>
          把這一節接回 <a href="/concepts/webrtc">WebRTC</a>「AirSync 的反直覺選擇」：
          AirSync 把 SFU 跑在大螢幕本機，好處是零雲端成本、最低延遲、資料不出教室。
        </p>
        <p>
          但它<strong>不提供中繼點</strong>。雲端 SFU 天生有公網位址，
          好情況壞情況用同一套機制就解決了；裝置本機 SFU 把「好情況」做到極致，
          代價是<strong>壞情況必須另外養一條 tunnel 路徑</strong>。
        </p>
        <p>
          這就是 <code>edu-as-display-channel</code> 那個 <code>direct</code> /{' '}
          <code>tunnel</code> 二分存在的理由。它的實作細節還沒查證，
          列在待釘問題裡 —— 但從架構上看，它必須存在。
        </p>
      </Section>

      <Section title="六、多播：完全不同的成本模型">
        <p>
          前面所有討論都是單播 —— 一個接收端一份封包。
          一台送四台就要送四份，發送端頻寬乘四。
        </p>
        <p>
          <strong>多播</strong>（multicast）改變這個模型：發送端只發<strong>一份</strong>，
          封包送到一個群組位址（IPv4 的 224.0.0.0/4），
          由網路設備複製給所有加入該群組的裝置。接收端加入或離開透過 IGMP 通知。
        </p>
        <p>
          發送端成本與接收端數量<strong>完全無關</strong> —— 對「一台老師機投給三十台學生機」
          這種場景是唯一合理的解法。這是 <code>edu-as-multicast-plugin</code> 存在的理由。
        </p>
        <p>
          代價非常大：多播沒有重傳、沒有擁塞控制、沒有per-receiver 調整
          （所以不能 simulcast），而且<strong>依賴網路設備正確支援 IGMP snooping</strong>。
          設備不支援時的表現是最糟的那種：封包被當成廣播灌給整個網段，
          把網路打爆。這是為什麼多播在企業環境常常被直接關掉。
        </p>
      </Section>
    </ConceptPage>
  )
}
