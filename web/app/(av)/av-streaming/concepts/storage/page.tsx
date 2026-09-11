import { ConceptPage, Section } from '@/components/ConceptPage'
import { Callout } from '@/components/Prose'
import { CompareGrid, Steps } from '@/components/diagrams'

export default function Page() {
  return (
    <ConceptPage id="storage">
      <Section title="一、錄影是最乾淨的教材">
        <p>
          錄影只用到資料路徑的前四段：擷取 → 編碼 → 封裝 → 寫檔。
          <strong>沒有網路</strong>，所以沒有丟包、沒有亂序、沒有 jitter、沒有擁塞控制。
          四步都是確定性的。
        </p>
        <p>
          這是為什麼建議先從 <code>edu-droid-screen-recorder</code> 建立 codec 與 container
          的直覺，再回去看串流 —— 串流會把四五個變因混在一起，
          「畫面糊掉」可能是編碼、頻寬、jitter buffer 任一個造成的，很難分辨。
        </p>
      </Section>

      <Section title="二、即時流與落地檔的需求完全不同">
        <CompareGrid
          columns={['即時串流', '錄影檔']}
          rows={[
            {
              label: '延遲',
              cells: ['是唯一重要的指標', '完全不在乎'],
            },
            {
              label: 'B-frame',
              cells: ['不能用（要等未來的幀）', '該用，壓縮率明顯更好'],
            },
            {
              label: 'bitrate 策略',
              cells: ['CBR，配合網路上限', 'VBR 或 CRF，追求品質／體積比'],
            },
            {
              label: '丟資料',
              cells: ['可以接受，補一個 I-frame 就好', '完全不能接受'],
            },
            {
              label: '要能 seek',
              cells: ['不需要', '必須 —— 決定了容器結構'],
            },
            {
              label: '格式',
              cells: ['RTP 封包，沒有容器', 'MP4／fMP4 容器'],
            },
          ]}
          verdict={
            <>
              教科書答案是「另外編一路」：串流用 CBR + 只有 I/P，錄影用 VBR + B-frame。
              但實務上 CPU 成本是真的 —— 見下一節，
              <code>edu-droid-screen-recorder</code> 選了共用一路編碼，
              然後承擔了參數被綁走的代價。
            </>
          }
        />
      </Section>

      <Section title="三、Android 的四個 class 對應四個環節">
        <Steps
          items={[
            {
              label: 'MediaProjection — 擷取',
              detail: (
                <>
                  拿到螢幕擷取授權，建立 <code>VirtualDisplay</code>，
                  把畫面導進一個 <code>Surface</code>。詳見{' '}
                  <a href="/concepts/capture">畫面與音訊擷取</a>。
                </>
              ),
            },
            {
              label: 'MediaCodec — 編碼',
              detail: (
                <>
                  以那個 Surface 當輸入，硬體編碼器直接讀，
                  <strong>整個過程不需要把像素複製到 CPU 記憶體</strong> ——
                  這是能在手機上做到 1080p60 的關鍵。輸出是一串帶時間戳的 H.264 資料。
                </>
              ),
            },
            {
              label: 'MediaMuxer — 封裝',
              detail: (
                <>
                  把視訊與音訊兩條 track 交錯寫進 MP4。要注意它的限制：
                  一次一個輸出檔、track 格式要在開始前確定、
                  而且 <code>stop()</code> 沒被呼叫到檔案就不完整。
                </>
              ),
            },
            {
              label: 'AudioRecord / AudioPlaybackCapture — 音訊那條線',
              detail: (
                <>
                  麥克風走 <code>AudioRecord</code>；
                  要錄「裝置本身播出的聲音」則要用{' '}
                  <code>AudioPlaybackCapture</code>（Android 10+），
                  而且<strong>播放端 App 可以拒絕被錄</strong> ——
                  所以錄下來沒聲音有可能是對方 App 設了 <code>ALLOW_CAPTURE_BY_NONE</code>，
                  不是你的 bug。
                </>
              ),
            },
          ]}
        />
        <p>
          這四個 class 一對一對應資料路徑的前四格，是 Android 影音 API 設計得很清楚的地方。
        </p>
      </Section>

      <Callout kind="insight" title="已查證，並且有兩處要修正">
        <p>
          <code>edu-droid-screen-recorder</code> 確實走這條路徑（已讀過原始碼）。
          但我原本猜錯兩件事：
        </p>
        <ul>
          <li>
            <strong>音源是麥克風不是內部音訊。</strong>用的是{' '}
            <code>MediaRecorder.AudioSource.MIC</code>，沒有用{' '}
            <code>AudioPlaybackCapture</code>。所以畫面裡播的影片聲音是透過空氣錄進去的。
            這是產品定位（錄人講課）的選擇。
          </li>
          <li>
            <strong>音訊是 96 kbps 單聲道</strong>（44100 Hz、AAC-LC），不是我先前寫的 128 kbps。
            對人聲夠用，對音樂明顯不足。
          </li>
        </ul>
        <p>
          另外它<strong>不只寫檔</strong> —— 同一份編碼同時推 RTMP 直播。
          完整內容見 <a href="/systems/recorder">Recorder / Live</a>。
        </p>
      </Callout>

      <Section title="三之二、共用一路編碼的實際代價">
        <p>
          上一節說「教科書答案是另外編一路」。實際的實作不是這樣，
          而它的取捨很值得看：
        </p>
        <p>
          <code>MediaHelper.java</code> 把同一份編碼輸出餵給兩個 muxer ——
          <code>MediaMuxer</code>（MP4）與 <code>SrsFlvMuxer</code>（RTMP）。
          省下一整路編碼的 CPU 與發熱，在手機／平板上這個差別很實際。
        </p>
        <p>
          代價是<strong>參數必須由要求較嚴的那一方決定</strong>。
          <code>IFRAME_INTERVAL = 1</code> ——每秒一個 I-frame。
          單就存檔來說這密得沒必要（一般 2 秒以上），
          但直播觀眾要等下一個 I-frame 才能出畫面，所以 GOP 不能拉長。
        </p>
        <p>
          <strong>結果是錄影檔為了直播體驗付出了額外的體積。</strong>
          I-frame 比 P-frame 大一個量級，每秒一個跟每兩秒一個的差別是實質的。
          這種成本從單一功能看不出來，要把兩個功能放在一起看才會發現。
        </p>
        <h3>還有一個螢幕錄影專屬的參數</h3>
        <p>
          <code>KEY_REPEAT_PREVIOUS_FRAME_AFTER = 1000000 / 30</code>。
          螢幕不動時系統不產生 frame，編碼器就會停止輸出 ——
          檔案時間軸壞掉、直播端判定斷線。這個參數讓編碼器在沒有新 frame 時
          重複送上一張。攝影機錄影完全不需要它。
        </p>
      </Section>

      <Section title="四、當機就整檔壞掉這個坑">
        <p>
          一般 MP4 把索引（<code>moov</code>）寫在檔案最後，因為要等全部編完才知道
          每一幀的位移。後果是：<strong>錄影中程式被殺掉 → 沒有 moov → 整個檔案打不開</strong>，
          即使 99% 的影像資料都好好躺在裡面。
        </p>
        <p>
          這在手機上不是罕見情況 —— 錄影是耗電大戶，系統很願意在背景把它殺掉。
        </p>
        <p>兩種解法：</p>
        <ul>
          <li>
            <strong>fragmented MP4</strong> —— 每隔幾秒寫一個自帶索引的片段
            （<code>moof</code> + <code>mdat</code>）。寫到哪就有效到哪，
            當機只損失最後一個片段。結構細節見{' '}
            <a href="/concepts/containers">容器與封裝</a>
          </li>
          <li>
            <strong>分段錄檔</strong> —— 關檔開新檔，事後合併。
            比 fMP4 土但更好實作
          </li>
        </ul>
        <p>
          <code>edu-droid-screen-recorder</code> 走的是第二種，但<strong>理由不是防當機</strong>
          —— 而是因為 <code>MediaMuxer</code> 沒有暫停功能。使用者按暫停就收掉當前檔案、
          續錄時開新檔並記進 <code>mFileList</code>，停止時用{' '}
          <code>org.mp4parser</code> 的 <code>MovieCreator</code> + <code>AppendTrack</code>{' '}
          在 box 層級把 track 接起來（<strong>不重新編碼</strong>）。
        </p>
        <p>
          防當機只是順帶的好處。這是個不錯的例子：
          <strong>同一個實作可以同時解掉一個你沒想要解的問題</strong>，
          但如果不知道原始動機，就會誤以為它是為了穩定性而設計的。
        </p>
        <p>
          另外 <code>MediaMuxer</code> 必須等第一個 <code>BUFFER_FLAG_KEY_FRAME</code> 才{' '}
          <code>start()</code> —— 否則檔案開頭是解不出來的 P-frame，有些播放器會直接放棄。
        </p>
      </Section>

      <Section title="五、檔案大小怎麼估">
        <p>
          公式很簡單：<strong>bitrate ÷ 8 = 每秒 bytes</strong>。
          用 recorder 實際的階梯（<code>setBitRateWithResolution()</code>）算：
        </p>
        <ul>
          <li>720p @ 4 Mbps → 每秒 0.5 MB → <strong>每小時約 1.8 GB</strong></li>
          <li>1080p @ 6 Mbps → <strong>每小時約 2.7 GB</strong></li>
          <li>2K @ 13 Mbps → 每小時約 5.9 GB</li>
          <li>4K @ 34 Mbps → <strong>每小時約 15 GB</strong></li>
          <li>音訊 96 kbps AAC → 每小時約 43 MB，相對可忽略</li>
        </ul>
        <p>
          注意這個階梯偏保守偏高（720p 給到 4 Mbps）——
          螢幕內容有大量文字與細線，壓太狠會糊掉不能讀，所以螢幕錄影的 bitrate
          需求本來就比同解析度的攝影機影片高。
        </p>
        <p>
          兩個實務推論：<strong>一堂課錄下來就是 GB 級</strong>，
          所以「錄在裝置上」很快會撞到儲存空間，上傳是必要的而不是加分項。
          而且<strong>螢幕錄影的 bitrate 需求跟內容關係極大</strong> ——
          純簡報幾乎沒有畫面變動（P-frame 幾乎是空的），
          播影片或捲動網頁則每一幀都在變，兩者可以差好幾倍。
          所以這種場景 VBR 比 CBR 划算得多。
        </p>
      </Section>

      <Section title="六、上傳與取用">
        <p>
          <code>edu-mvb-storage-libs</code> 是共用的儲存函式庫（AWS、加密、session store），
          錄影檔的上傳與取用大概走這裡（待查證）。這類流程通常長成：
        </p>
        <ul>
          <li>
            <strong>分段／可續傳上傳</strong> —— GB 級檔案在教室 Wi-Fi 上一次傳完成功率太低。
            S3 multipart upload 允許斷了只重傳失敗的那一段
          </li>
          <li>
            <strong>簽名 URL</strong> —— 客戶端直接對 S3 上傳／下載，
            不經過應用伺服器。後端只負責發一張有時效的通行證，
            這樣頻寬成本不會壓在自己的服務上
          </li>
          <li>
            <strong>取用時的權限</strong> —— 錄影檔含教室畫面，
            可能有學生的臉與作業內容。保留期限與存取控制是隱私問題不只是技術問題
          </li>
        </ul>
      </Section>

      <Section title="七、「live」已經釘清了">
        <p>
          原本的學習範圍寫 live/recorder，但掃不到 live 的 repo。
          答案是：<strong>live 不是獨立產品，就在 recorder 這個 repo 裡</strong>
          （<code>docs/recorder_live_app.md</code>、<code>rtmp/</code> package）。
        </p>
        <p>
          走的是 <strong>RTMP</strong>（<code>net.ossrs.rtmp.SrsFlvMuxer</code>，yasea 系列），
          目標是<strong>外部社群平台</strong>：YouTube、Facebook、Workplace、Twitch，
          URL 都寫死在 <code>FloatWindowStreamSettingsView.java</code> 裡。
          所以它是「老師直播上課」而不是內部投影。
        </p>
        <p>
          為什麼是 RTMP 而不是 WebRTC？因為<strong>目標平台只吃 RTMP</strong>。
          RTMP 建在 TCP 上、延遲以秒計，對直播（單向、觀眾容忍幾秒延遲）完全夠用，
          而且是所有直播平台二十年來的通用入口。用 WebRTC 反而沒地方推。
        </p>
        <p>
          完整內容見 <a href="/systems/recorder">Recorder / Live</a>。
        </p>
      </Section>
    </ConceptPage>
  )
}
