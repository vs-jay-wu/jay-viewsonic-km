import { Callout, PageHeader, Prose } from '@/components/Prose'
import { RepoTable } from '@/components/RepoTable'
import { REPOS } from '@/data/repos'

export default function MvbCastPage() {
  const repos = REPOS.filter((r) => r.system.includes('mvb-cast'))

  return (
    <>
      <PageHeader
        eyebrow="system"
        title="MVB Cast In/Out"
        lede={
          <>
            myViewBoard 內建的投放功能。做的事跟 AirSync 高度重疊，但技術棧完全不同 ——
            這是這個 domain 裡最好的對照組。
          </>
        }
      />

      <Prose>
        <h2>一、與 AirSync 的對照</h2>
        <p>
          兩邊都在做「把畫面送到另一台機器」，選的路徑卻南北相反：
        </p>
        <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>MVB Cast</th>
              <th>AirSync</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>WebRTC 實作</td>
              <td>瀏覽器內建 API（RTCMultiConnection.js 包裝）</td>
              <td>原生 libwebrtc C++ fork</td>
            </tr>
            <tr>
              <td>畫面來源</td>
              <td>
                <code>getDisplayMedia()</code> —— 瀏覽器要使用者選視窗
              </td>
              <td>虛擬顯示器驅動 —— 造一個假螢幕</td>
            </tr>
            <tr>
              <td>錄影</td>
              <td>
                <code>RecordRTC</code> / MediaRecorder
              </td>
              <td>不在此範圍（走 recorder 子系統）
              </td>
            </tr>
            <tr>
              <td>一對多</td>
              <td>
                <strong>peer 中繼樹</strong>（scalable broadcast，每人最多轉 2 個）
              </td>
              <td>裝置本機 SFU</td>
            </tr>
            <tr>
              <td>可控制的層次</td>
              <td>瀏覽器給多少就多少</td>
              <td>編碼參數、硬編選擇全都碰得到</td>
            </tr>
          </tbody>
        </table>
        </div>
        <p>
          <strong>trade-off 很直白</strong>：MVB Cast 幾乎零安裝成本、任何瀏覽器都能跑，
          但 codec 選擇、bitrate 控制、硬體編碼器都被瀏覽器綁死。 AirSync 反過來 ——
          要裝 App、要簽驅動、要維護 C++ fork，但每一層都能調。
        </p>

        <h2>二、一對多不是 mesh，是 peer 中繼樹</h2>
        <p>
          我原本猜是 P2P mesh，查證後要修正。信令伺服器裡有{' '}
          <code>Scalable-Broadcast.js</code>（來自 RTCMultiConnection），
          <code>maxRelayLimitPerUser</code> 預設 <strong>2</strong> ——
          也就是每個 peer 最多再轉給兩個人，形成一棵二元中繼樹。
        </p>
        <p>
          客戶端有對應的 <code>cast-out-module-scalable.js</code>，所以這條路是真的在用。
          好處是發送端負擔與觀眾數無關、伺服器完全不轉發媒體；
          代價是延遲隨樹深累積，而且中間節點離線會斷掉它下面整棵子樹。
          細節見 <a href="/concepts/webrtc">WebRTC</a>「一對多的三種架構」。
        </p>

        <h2>三、兩台信令伺服器的實際分工</h2>
        <p>
          兩個 repo 的 README 都只有一行 Azure DevOps 連結，而且指向同一個來源。
          比對之後答案很清楚：<strong>同一份程式碼，cast-control 是改良版</strong>。
          只有三個檔案不同（<code>Signaling-Server.js</code>、<code>app.js</code>、
          <code>socketHandler.js</code>），差異是：
        </p>
        <ul>
          <li>
            <strong>房間隔離（最重要）</strong> —— base 版用{' '}
            <code>socket.broadcast.emit()</code>，也就是把控制訊息廣播給
            <em>所有</em>連上這台伺服器的 client。cast-control 改成{' '}
            <code>socket.join(room)</code> + <code>io.sockets.to(room).emit()</code>。
            這不只是效能問題，base 版等於讓不同會議的控制訊息互相看得到
          </li>
          <li>
            <strong>role 概念</strong> —— 多了 <code>socket.role</code>，
            對應 moderator / presenter 這類角色
          </li>
          <li>
            <strong>遙測</strong> —— <code>InsightTracker.js</code> 用 Azure Application
            Insights 記錄每個自訂事件
          </li>
          <li>
            <strong>socket.io 調校</strong> —— pingInterval 10s / pingTimeout 5s，
            transport 只留 <code>websocket</code>（拿掉 xhr-polling 與 jsonp-polling 的退路）
          </li>
        </ul>
      </Prose>

      <Callout kind="warn" title="兩個在 code 裡看到的問題">
        <ul>
          <li>
            <code>InsightTracker.js</code> 的 Application Insights instrumentation key
            是<strong>明文寫在 repo 裡</strong>的。這份筆記不複製它，但這件事本身值得回報
          </li>
          <li>
            cast-control 的 <code>app.js</code> 把 socket.io-client 端點寫死成{' '}
            <code>http://localhost:9001</code>（base 版是可設定的 endpoint）——
            可能是配合特定部署形態，但是個環境寫死
          </li>
        </ul>
      </Callout>

      <Callout kind="warn" title="geticeserver 已停用">
        <code>edu-mvb-geticeserver-svc</code> 的 README 只有一句「This repo is deprecated.」。
        取代它的是什麼還沒查到。即使停用，它仍是理解「為什麼需要 TURN
        伺服器」的好切入點 —— NAT 後面的兩台機器要直連，多數情況需要中繼。
      </Callout>

      <Prose>
        <h2>四、一個分群修正</h2>
        <p>
          <code>edu-mvb-presentation-gateway</code> 名字看起來像 MVB Cast 的一部分，
          但它的 README 自稱 <strong>Display Backend</strong>，網域是{' '}
          <code>presentation-gateway.myviewboard.cloud</code> 與{' '}
          <code>myviewboarddisplay.com</code> —— 它其實屬於 <strong>AirSync</strong> 家族。
          所以它列在 AirSync 頁而不是這裡。
        </p>
        <p>
          這類命名與歸屬不一致的情況在這批 repo 裡不少，所以資料層有{' '}
          <code>realName</code> 欄位專門記這件事。
        </p>
      </Prose>

      <RepoTable repos={repos} />
    </>
  )
}
