import { ConceptPage, Section } from '@/components/ConceptPage'
import { Callout } from '@/components/Prose'
import { CompareGrid, Steps } from '@/components/diagrams'

export default function Page() {
  return (
    <ConceptPage id="vendor-protocols">
      <Section title="一、為什麼非做不可">
        <p>
          訪客拿著 iPhone 走進會議室，不會為了投一頁簡報去下載一個 App。
          <strong>「不裝任何東西就能投」是 IFP 的核心賣點</strong>，
          而要做到這件事，只能去相容別人家的協議。
        </p>
        <p>
          這條路跟自家 App 的 WebRTC 路徑是<strong>完全平行的兩套機制</strong>，
          共用的只有最後的顯示。理解這點就能理解為什麼 47 個 repo 裡有一大塊
          跟 WebRTC 毫無關係。
        </p>
      </Section>

      <Section title="二、三套協議的定位">
        <CompareGrid
          columns={['誰的', '走什麼網路', '現況']}
          rows={[
            {
              label: 'AirPlay',
              cells: [
                'Apple',
                '一般 Wi-Fi（也支援 P2P 直連）',
                'iPhone / iPad / Mac 內建，實務上最重要',
              ],
            },
            {
              label: 'Google Cast',
              cells: ['Google', '一般 Wi-Fi', 'Chrome 瀏覽器與 Android 內建'],
            },
            {
              label: 'Miracast',
              cells: [
                'Wi-Fi Alliance',
                'Wi-Fi Direct（點對點，不走 AP）',
                '逐漸退場',
              ],
            },
          ]}
          verdict={
            <>
              Miracast 在規格上最漂亮 —— 不需要既有網路，兩台機器直接連。
              但它把畫面品質綁在無線晶片的實作上，各家表現落差巨大、配對常常失敗，
              debug 幾乎不可能（問題在驅動層）。
              <strong>AirPlay 與 Cast 建在普通 IP 網路上，反而可控得多</strong> ——
              這是為什麼這批 repo 裡沒有 Miracast。
            </>
          }
        />
      </Section>

      <Section title="三、AirPlay 的三層結構">
        <Steps
          items={[
            {
              label: '發現 — mDNS/Bonjour',
              detail: (
                <>
                  接收端宣告 <code>_airplay._tcp</code>（視訊／鏡射）與{' '}
                  <code>_raop._tcp</code>（音訊，RAOP = Remote Audio Output Protocol）。
                  TXT 記錄裡帶能力旗標，iPhone 在連線前就靠這些判斷能不能鏡射。
                </>
              ),
            },
            {
              label: '認證 — FairPlay 握手',
              detail: (
                <>
                  這是真正的門檻。Apple 用一套挑戰／回應機制確認對面是「授權的」接收端。
                  沒過這關後面什麼都拿不到。細節見{' '}
                  <a href="/concepts/drm-auth">裝置認證與 DRM</a>。
                </>
              ),
            },
            {
              label: '媒體 — 兩種完全不同的模式',
              detail: (
                <>
                  <strong>鏡射模式</strong>送的是即時編碼的 H.264 流（螢幕鏡射）。
                  <strong>串流模式</strong>送的只是一個 URL —— 接收端自己去抓影片播。
                  後者延遲與畫質都好得多，但只適用於播放既有影片。
                  這兩個模式在實作上幾乎是兩個獨立子系統。
                </>
              ),
            },
          ]}
        />
        <p>
          協議大量使用 Apple 的 <strong>property list</strong> 格式做結構化資料交換 ——
          這就是 <code>edu-as-libplist</code> 存在的原因。
          它本身是 libimobiledevice 專案的一部分，純粹的解析函式庫，不必深讀。
        </p>
      </Section>

      <Section title="四、Google Cast 的結構">
        <Steps
          items={[
            {
              label: '發現 — mDNS，服務名 _googlecast._tcp',
              detail: 'TXT 記錄帶裝置 ID、型號、目前正在跑的 app。',
            },
            {
              label: '連線 — TLS 到 8009 埠',
              detail: (
                <>
                  Cast 的協議（CASTV2）跑在 TLS 上，訊息用 <strong>protobuf</strong> 編碼，
                  按「命名空間」分流（例如 <code>urn:x-cast:com.google.cast.media</code>）。
                  這比 AirPlay 的多協議混用乾淨得多。
                </>
              ),
            },
            {
              label: '認證 — 裝置憑證',
              detail: (
                <>
                  Google 要求接收端出示由 Google 簽發的裝置憑證。
                  正規途徑是加入 Cast 認證方案；這批 repo 走的不是正規途徑（見下）。
                </>
              ),
            },
            {
              label: '媒體 — 多數是 URL，鏡射是另一套',
              detail: (
                <>
                  Cast 的主要模式其實是「叫接收端自己去播這個 URL」（所以 YouTube
                  投放很省手機電力）。螢幕鏡射走的是另一條基於 WebRTC 的路徑。
                </>
              ),
            },
          ]}
        />
      </Section>

      <Section title="五、為什麼做接收端比做發送端難得多">
        <p>
          這是整頁最重要的一點。同一個協議，兩個方向的難度完全不對稱：
        </p>
        <ul>
          <li>
            <strong>發送端只要「能被接受」。</strong>官方通常提供 SDK，
            而且發送端不必處理認證的被驗證方 —— 是它去驗別人。
          </li>
          <li>
            <strong>接收端必須「通過驗證」。</strong>認證機制的設計目的就是
            <em>阻止未授權的接收端</em>。所以做接收端等於要正面處理一套刻意為了擋你而存在的機制。
          </li>
          <li>
            <strong>接收端要吃下所有版本。</strong>發送端可以只支援新版；
            接收端面對的是使用者手上任何一支 iPhone，從舊系統到最新版都要能投。
            協議每年變，而你的 IFP 在牆上掛五年。
          </li>
          <li>
            <strong>沒有規格書。</strong>兩套協議都不是開放標準，
            所以行為要靠觀察真實裝置推出來。
          </li>
        </ul>
      </Section>

      <Callout kind="insight" title="所以工具才是重點">
        <p>
          <code>edu-as-googlecast-proxy</code> 是個中間人 proxy：
          <code>npm start &lt;本機 IP&gt; &lt;埠&gt; &lt;chromecast IP&gt; 8009</code>，
          把流量轉發到一台真的 Chromecast 並記錄下來。
        </p>
        <p>
          <strong>這是逆向協議最有效的方法</strong> —— 不用讀規格（也沒有規格），
          直接看官方發送端與官方接收端怎麼對話，然後照著做。
          它不在產品的資料路徑上，但沒有它就寫不出 <code>edu-as-googlecast</code>。
        </p>
        <p>
          <code>edu-as-openscreen</code>（Chromium 的 Open Screen Library）也實作了
          Chromecast 協議，而且是官方程式碼與完整文件 —— 這是另一條比逆向更省力的參考路徑。
        </p>
      </Callout>

      <Section title="六、這批 repo 怎麼組起來">
        <p>
          入口是 <code>edu-as-mirror</code>（Flutter plugin）。它的{' '}
          <code>android/src/main/cpp/</code> 底下另外 clone 了 <code>airplay</code> 與{' '}
          <code>googlecast</code> 兩個 C++ 專案 —— 也就是說：
        </p>
        <ul>
          <li>
            <code>edu-as-airplay</code> + <code>edu-as-fairplay</code> +{' '}
            <code>edu-as-libplist</code> → AirPlay 那半
          </li>
          <li>
            <code>edu-as-googlecast</code> + <code>edu-as-libcastauth</code> → Cast 那半
          </li>
          <li>
            <code>edu-as-mdns-responder</code> / <code>edu-as-openscreen</code> → 兩邊共用的發現層
          </li>
          <li>
            <code>edu-as-libevent</code> / <code>edu-as-openssl-cmake</code> → C++ 的網路與加密基礎
          </li>
          <li>
            <code>edu-as-mirror</code> → 把上面全部包成一個 Dart 可以呼叫的 plugin
          </li>
        </ul>
        <p>
          <code>edu-as-mirror</code> 同時有 <code>android/</code> 與 <code>windows/</code>，
          所以 Windows 端的 AirPlay/Cast 接收也走同一套 C++。
        </p>
      </Section>
    </ConceptPage>
  )
}
