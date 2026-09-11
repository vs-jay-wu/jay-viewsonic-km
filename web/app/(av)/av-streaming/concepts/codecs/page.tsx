import { ConceptPage, Section } from '@/components/ConceptPage'
import { Callout } from '@/components/Prose'
import { CompareGrid, GopDiagram } from '@/components/diagrams'

export default function Page() {
  return (
    <ConceptPage id="codecs">
      <Section title="一、壓縮在壓什麼">
        <p>
          1080p60 的未經壓縮視訊，資料量是 1920 × 1080 × 3 bytes × 60 ≈{' '}
          <strong>每秒 373 MB</strong>。Wi-Fi 給不了，所以一定要壓，而且要壓到大約
          千分之一（2–8 Mbps 是投影常見的區間）。
        </p>
        <p>壓縮靠的是兩種冗餘：</p>
        <ul>
          <li>
            <strong>空間冗餘</strong>（畫面內）— 相鄰像素通常很像。這部分跟 JPEG 同一套思路：
            轉到頻率域、把人眼不敏感的高頻量化掉。
          </li>
          <li>
            <strong>時間冗餘</strong>（畫面之間）— 連續兩幀通常只有一小塊在動。
            這是視訊壓縮真正的主力，也是 I/P/B frame 的來源。
          </li>
        </ul>
      </Section>

      <Section title="二、I / P / B frame 與 GOP">
        <p>
          <strong>I-frame</strong>（keyframe）只用空間壓縮，可以獨立解出完整畫面，
          代價是體積大 —— 通常是 P-frame 的十倍以上。
          <strong>P-frame</strong> 只存「跟前面那幀的差異」。
          <strong>B-frame</strong> 同時參考前後兩邊，壓縮率最好。
        </p>
        <p>
          從一個 I-frame 到下一個 I-frame 之間叫一個 <strong>GOP</strong>（Group of Pictures）。
        </p>
      </Section>

      <GopDiagram
        pattern="IPPPPPPP"
        refs={[
          [0, 1],
          [1, 2],
          [2, 3],
          [3, 4],
          [4, 5],
          [5, 6],
          [6, 7],
        ]}
        caption="投影／視訊通話用的結構：只有 I 與 P，每一幀只參考前一幀。收到就能立刻解，延遲最低。"
      />

      <GopDiagram
        pattern="IBBPBBP"
        refs={[
          [0, 3],
          [3, 6],
          [0, 1],
          [3, 1],
          [0, 2],
          [3, 2],
        ]}
        caption="影片檔用的結構。橙色箭頭是「往回參考」—— 第 1、2 幀要等第 3 幀先到才能解，所以編碼器必須先緩衝、播放器也必須先緩衝。壓縮率好，但憑空多出好幾幀的延遲。"
      />

      <Callout kind="insight" title="為什麼即時投影不用 B-frame">
        B-frame 要參考「未來」的幀，所以編碼端必須先攢幾幀才能開始編，解碼端也必須先收到後面
        的幀才能解前面的。這在錄影或串流影片上完全沒問題（反正不是即時），
        但投影每多 2–3 幀就是多 30–50 ms 的延遲 —— 而投影的體感延遲門檻大約在 100 ms。
        <strong>所以幾乎所有即時場景都用 I + P 的 baseline 式結構，主動放棄那部分壓縮率。</strong>
      </Callout>

      <Section title="三、GOP 長度是一個取捨">
        <p>
          I-frame 越密，體積越大、頻寬越貴；I-frame 越疏，出問題時越慘 ——
          因為<strong>新加入的人、或丟包後的畫面，都要等下一個 I-frame 才能恢復</strong>。
        </p>
        <p>
          串流影片通常 2 秒一個 I-frame（配合 HLS/DASH 的切片邊界）。
          即時通訊則往往<strong>不設固定 GOP</strong>，改成「需要時才發」：
          接收端偵測到解不出來，透過 RTCP 送一個 <code>PLI</code>（Picture Loss Indication）
          回去，發送端才臨時插一個 I-frame。
        </p>
        <p>
          這比固定 GOP 有效率得多 —— 平順的時候完全不浪費頻寬，
          出事的時候恢復得比等下一個週期更快。
        </p>

        <h3>PLI 與 FIR：兩種 keyframe 請求，用途不同</h3>
        <p>
          RTCP 上有兩個看起來很像的訊息，實務上常被混用，但規格把它們分得很清楚：
        </p>
        <ul>
          <li>
            <strong>
              <code>PLI</code>
            </strong>
            （Picture Loss Indication，RFC 4585）——「我丟包了、解不出來」。
            這是<strong>丟包復原</strong>用的，也是 WebRTC 日常在跑的那個。
          </li>
          <li>
            <strong>
              <code>FIR</code>
            </strong>
            （Full Intra Request，RFC 5104）——「給我一個可以開始解的點」。
            用在<strong>不是因為丟包</strong>的情況：新的接收端剛加入、
            或 SFU／MCU 切換了來源，這時對方手上根本沒有任何參考幀。
          </li>
        </ul>
        <p>
          RFC 5104 明確講 FIR <strong>不應該</strong>拿來做一般的丟包復原 —— 那是 PLI 的工作。
          分開的理由是語意不同：PLI 是「我壞了」，FIR 是「我是新來的」。
          發送端可以據此做不同決策，例如對 FIR 一律照發，對 PLI 則做頻率限制
          （避免一堆人同時丟包時被 keyframe 洪水打死）。
        </p>
        <p>
          這個區別在<a href="/concepts/webrtc">一對多架構</a>裡特別有感 ——
          有 SFU 的場合，「新加入者要畫面」是常態事件而不是異常事件。
        </p>
      </Section>

      <Section title="四、bitrate：先講清楚它是什麼">
        <p>
          <strong>bitrate 就是「每秒鐘用多少 bit 來描述這段影片」</strong>，
          單位是 bps / kbps / Mbps。注意它是<strong>編碼器每秒產出的資料量</strong> ——
          傳輸只是下游的結果，同一份編碼存成檔案也是這個 bitrate。
        </p>
        <p>
          最好用的心智模型是<strong>預算</strong>：「我每秒只准你用 4 Mbps
          來描述這一秒的畫面」。編碼器拿到這個預算，要自己想辦法把這一秒塞進去。
        </p>

        <h3>不是「超過就降畫質」，是持續在調</h3>
        <p>
          常見的誤解是以為超標會被砍掉。實際上編碼器是<strong>持續調整，讓輸出一直落在預算內</strong>，
          而調的旋鈕就是 <code>QP</code>（量化強度）—— 把人眼不敏感的細節丟掉。
          QP 越大丟越多、資料越小、畫面越糊。
        </p>
        <p>
          <code>預算不夠 → 加大 QP → 丟掉更多細節 → 畫面變糊</code>
        </p>
        <p>這是連續的旋鈕，不是超標才觸發的開關。</p>
      </Section>

      <Callout kind="insight" title="bitrate 不等於畫質">
        <p>同樣 4 Mbps：</p>
        <ul>
          <li>
            <strong>簡報畫面</strong> —— 綽綽有餘，看起來完美
          </li>
          <li>
            <strong>球賽或捲動網頁</strong> —— 明顯糊掉
          </li>
        </ul>
        <p>
          因為 bitrate 是<strong>預算</strong>，畫質是「這個預算夠不夠描述這一秒的內容」。
        </p>
        <p>
          換個比喻：假設你要用文字即時描述每一秒發生的事，bitrate 就是「每秒最多幾個字」。
          描述一面靜止的白牆，10 個字很夠；描述一場混戰，1000 個字都不夠。
        </p>
        <p>
          這也是為什麼 <a href="/concepts/storage">螢幕錄影的 bitrate 需求跟內容關係極大</a>
          —— 純簡報幾乎沒有畫面變動，播影片則每一幀都在變。
        </p>
      </Callout>

      <Callout kind="warn" title="很常踩的單位坑：bit 與 byte 差 8 倍">
        <p>
          <strong>bitrate 用 bit，檔案大小用 byte。</strong>
          4 Mbps <strong>不是</strong> 4 MB/s，而是 0.5 MB/s。
        </p>
        <p>
          算錄影檔多大就是 <code>bitrate ÷ 8</code>。
          小寫 b 是 bit、大寫 B 是 byte —— 這個大小寫差異在規格文件裡是有意義的。
        </p>
      </Callout>

      <Section title="五、bitrate 控制：CBR / VBR / CRF">
        <p>
          知道 bitrate 是預算之後，「bitrate 控制」就是
          <strong>編碼器怎麼把這個預算分配到時間軸上</strong>的策略。
        </p>
        <CompareGrid
          columns={['做法', '適合', '不適合']}
          rows={[
            {
              label: 'CBR',
              cells: [
                '鎖定固定位元率，畫面複雜時就犧牲品質',
                '即時串流。頻寬可預測，網路好規劃',
                '存檔（簡單畫面浪費位元）',
              ],
            },
            {
              label: 'VBR',
              cells: [
                '給一個目標平均值，允許瞬間衝高',
                '點播影片、錄影檔',
                '即時傳輸（突發峰值會塞爆連線）',
              ],
            },
            {
              label: 'CRF',
              cells: [
                '鎖定「品質」，位元率完全由內容決定',
                '離線轉檔、追求最小檔案',
                '任何有頻寬上限的即時場景',
              ],
            },
          ]}
          verdict={
            <>
              即時投影一定是 CBR 或近似 CBR。而且真實系統<strong>不會固定一個數字</strong> ——
              目標值是動態的。
            </>
          }
        />

        <h3>目標值是誰給的</h3>
        <p>
          這是最後一塊拼圖：bitrate 的目標值不是設定檔裡的常數，
          而是 <code>BWE</code>（頻寬估測）持續算出來的。整條鏈是：
        </p>
        <p>
          <code>網路變差 → BWE 降目標 → 編碼器加大 QP → 你看到畫面變糊</code>
        </p>
        <p>
          所以「畫面突然變糊」通常不是編碼器的錯，也不是網路真的斷了 ——
          是<strong>擁塞控制判斷網路變差，主動選擇了糊而不是頓</strong>。
          這是刻意的取捨。詳見 <a href="/concepts/transport">傳輸層</a>。
        </p>
        <p>
          而當<strong>編碼器自己也有一套速率控制</strong>時，兩層就會打架 ——
          那正是 <a href="/systems/airsync/webrtc-fork">libwebrtc fork</a>{' '}
          那批改動在搏鬥的核心。
        </p>
      </Section>

      <Section title="六、選哪個 codec">
        <CompareGrid
          columns={['硬體支援', '授權', '效率']}
          rows={[
            {
              label: 'H.264 / AVC',
              cells: [
                '幾乎所有裝置都有硬編硬解',
                'MPEG LA 專利池，商用要授權',
                '基準線',
              ],
            },
            {
              label: 'H.265 / HEVC',
              cells: ['中高，但硬解比硬編普及', '授權最麻煩（多個專利池）', '約省 40%'],
            },
            {
              label: 'VP8',
              cells: ['軟解為主，硬體支援少', '免費（Google）', '約等於 H.264'],
            },
            {
              label: 'VP9',
              cells: ['中等', '免費', '約省 30%'],
            },
            {
              label: 'AV1',
              cells: ['新裝置才有，編碼硬體更少', '免費（AOMedia）', '約省 50%'],
            },
          ]}
          verdict={
            <>
              投影場景的決定因素幾乎只有一個：<strong>兩端都要有硬體編解碼</strong>。
              所以答案通常是 H.264 —— 不是因為它最好，是因為它在任何裝置上都能用硬體跑，
              而軟體編碼 1080p60 會讓平板燙手且掉幀。
            </>
          }
        />
      </Section>

      <Section title="七、硬編 vs 軟編的真實差異">
        <ul>
          <li>
            <strong>延遲</strong>：硬編在專屬電路上跑，通常一幀之內完成。軟編要吃 CPU，
            而且會跟應用程式本身搶資源。
          </li>
          <li>
            <strong>品質</strong>：同 bitrate 下軟編通常<em>更好</em>。硬編為了速度會簡化
            動態估測的搜尋範圍。所以離線轉檔幾乎都用軟編。
          </li>
          <li>
            <strong>可控性</strong>：這是最痛的一點。軟編（x264）可以逐幀調數十個參數；
            硬編只能透過廠商驅動暴露的少數旋鈕，而且<strong>不同 SoC 的行為不一致</strong>
            —— 同一段設定在某家晶片上會產生額外延遲或忽略 bitrate 設定。
          </li>
        </ul>
        <p>
          這個「不一致」是維護 libwebrtc fork 的主要理由之一。
          原生 libwebrtc 的硬體編碼路徑對特定平台有假設，撞到實際機種就要改。
        </p>
      </Section>

      <Section title="八、simulcast：一對多的必要條件">
        <p>
          一台學生機投到大螢幕，同時大螢幕又要把畫面轉給其他三台 —— 這三台的網路狀況不一樣。
          如果只有一路 2 Mbps 的流，那條最差的連線會拖垮所有人。
        </p>
        <p>
          <strong>simulcast</strong> 的做法是發送端<strong>同時編出多路不同解析度／位元率</strong>
          （例如 180p / 360p / 720p），全部送給 SFU；SFU 再按每個接收端的實際頻寬
          挑一路轉發。SFU 完全不需要轉碼 —— 這是 SFU 能做到低成本的關鍵。
        </p>
        <p>
          代價是發送端要編三次，CPU／GPU 成本上升。
          <code>edu-as-webrtc</code>（LiveKit 的 fork）的改動清單裡就有好幾條是
          「Android / iOS / Mac 支援 video simulcast」—— 上游沒做完，社群補的。
        </p>
      </Section>

      <Section title="九、音訊：直覺跟視訊幾乎相反">
        <p>
          前面八節全部在講視訊。音訊值得單獨拉出來，
          因為它有幾件事跟視訊的直覺<strong>完全相反</strong>，用視訊的思路去想會做錯決策。
        </p>

        <h3>容錯遠低於視訊</h3>
        <p>
          畫面掉幾幀，多數人根本沒感覺；<strong>聲音破一下，每個人都會立刻抱怨</strong>。
          人耳對斷續、爆音、忽大忽小的敏感度遠高於眼睛對掉幀的敏感度。
        </p>
        <p>
          所以實務上<strong>音訊的優先級高於視訊</strong> ——
          網路吃緊時，正確的策略是保音訊、犧牲視訊。
        </p>

        <h3>而且這個優先幾乎是免費的</h3>
        <p>
          看一下量級差距：投影的視訊是 <strong>2–6 Mbps</strong>，音訊是{' '}
          <strong>96–128 kbps</strong> —— <strong>差大約 50 倍</strong>。
        </p>
        <p>
          意思是「保音訊」這個決定，成本低到可以忽略。
          你不需要在音訊與視訊之間做痛苦的取捨 —— 直接把音訊當成必須送到的那份，
          剩下的頻寬全給視訊就好。
        </p>

        <h3>沒有 I-frame 這種東西</h3>
        <p>
          視訊的整個 GOP 概念建立在「這一幀參考前一幀」上。音訊編碼的單位是{' '}
          <strong>frame</strong>（Opus 典型 20 ms、AAC 約 21 ms），
          而且<strong>每個 frame 基本上都能獨立解</strong>。
        </p>
        <p>
          後果是：<strong>音訊丟包不需要「等下一個 keyframe」</strong>，
          下一個 frame 到了就恢復。所以你聽到的是短暫的破音而不是長時間靜音 ——
          跟視訊丟包可能凍結好幾秒完全不同。
        </p>
      </Section>

      <CompareGrid
        columns={['誰在用', '特性']}
        rows={[
          {
            label: 'Opus',
            cells: [
              'WebRTC 的預設與必備 codec',
              '免權利金、延遲低（可到 5 ms）、同一個 codec 同時涵蓋語音與音樂、能動態調 bitrate 不必重建編碼器',
            ],
          },
          {
            label: 'AAC',
            cells: [
              'AirPlay、RTMP／FLV、MP4 檔',
              <>
                硬體支援最普及，但延遲較高。<code>edu-droid-screen-recorder</code>{' '}
                用 AAC-LC 是<strong>被目標決定的</strong> —— YouTube/Facebook 的 RTMP
                只吃 AAC
              </>,
            ],
          },
          {
            label: 'G.711',
            cells: ['傳統電話、WebRTC 的保底', '幾乎不壓縮（64 kbps）、品質差，但保證任何裝置都能解'],
          },
        ]}
        verdict={
          <>
            選擇邏輯跟視訊一樣是「對面解得了嗎」，
            但音訊的答案更常被<strong>下游平台</strong>決定而不是裝置 ——
            要推 RTMP 就只能 AAC，沒有討論空間。
          </>
        }
      />

      <Section title="十、音視訊同步（lip sync）">
        <p>
          畫面與聲音是<strong>兩條完全獨立編出來的流</strong>，取樣率也不同
          （視訊 30 fps、音訊 48000 Hz）。要讓它們在播放端對上，靠的是時間戳 ——
          細節在 <a href="/concepts/containers">容器與封裝</a>。
        </p>
        <p>
          值得記住的是<strong>人耳與人眼的容忍度不對稱</strong>：
        </p>
        <ul>
          <li>
            <strong>聲音比畫面早</strong> —— 很難忍。大約幾十毫秒就會察覺不對勁
          </li>
          <li>
            <strong>聲音比畫面晚</strong> —— 容忍度高得多，可以到一百多毫秒
          </li>
        </ul>
        <p>
          直覺上的解釋是：現實世界裡光比聲音快，所以「先看到、後聽到」是自然的
          （打雷就是這樣），反過來則違反物理經驗。
        </p>
        <p>
          <strong>實務推論：寧可讓音訊稍微落後，也不要讓它超前。</strong>
          這也是為什麼同步出問題時，調整方向通常是延遲音訊而不是延遲視訊。
        </p>
      </Section>

      <Callout kind="insight" title="AEC / AGC / 降噪在投影場景要關掉">
        <p>
          WebRTC 內建一整套音訊前處理：<code>AEC</code>（回音消除）、AGC（自動增益）、
          噪音抑制、高通濾波。這些對<strong>語音通話</strong>是必要的 ——
          麥克風會錄到喇叭放出來的聲音、每個人音量不一、環境有冷氣聲。
        </p>
        <p>
          但投影場景擷取的是<strong>系統音訊</strong>（虛擬音效卡拿到的原始數位訊號），
          不是麥克風。這時那套前處理全部變成傷害：
        </p>
        <ul>
          <li>
            <strong>AEC</strong> 會誤判音樂是回音而把它削掉
          </li>
          <li>
            <strong>AGC</strong> 會把刻意的動態範圍（安靜段落、爆點）壓平
          </li>
          <li>
            <strong>噪音抑制</strong> 會把它不認識的聲音當噪音處理
          </li>
        </ul>
        <p>
          所以 <a href="/systems/airsync/webrtc-fork">libwebrtc fork</a>{' '}
          最早期的 commit 之一就是{' '}
          <strong>
            <code>Disable all audio processing options by default</code>
          </strong>
          。這是個很好的例子：<strong>同一個函式庫的預設值，換一個使用情境就從必要變成有害。</strong>
        </p>
      </Callout>

      <Section title="十一、decoder 數量上限這個坑">
        <p>
          硬體解碼器的<strong>實例數量是有限的</strong>，通常一顆 SoC 只有幾個。
          大螢幕要同時顯示四路學生畫面，就需要四個解碼器實例 —— 很容易撞到上限，
          而且撞到的表現往往不是明確的錯誤，是某一路畫面單純不出來。
        </p>
        <p>
          <code>edu-as-webrtc</code> README 的第一條改動就是這個：
          <em>「Dynamically acquire decoder to mitigate decoder limitations」</em>
          —— 原本的實作是一開始就佔住 decoder，改成需要時才取、不用就還。
        </p>
        <p>
          <strong>這是教科書不會講、但實際做投影一定會撞到的那種知識。</strong>
          也是為什麼那份 fork 的改動清單值得完整讀一遍。
        </p>
      </Section>
    </ConceptPage>
  )
}
