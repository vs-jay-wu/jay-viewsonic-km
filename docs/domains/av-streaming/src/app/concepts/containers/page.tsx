import { ConceptPage, Section } from '@/components/ConceptPage'
import { Callout } from '@/components/Prose'
import { BoxDiagram, Steps } from '@/components/diagrams'

export default function Page() {
  return (
    <ConceptPage id="containers">
      <Section title="一、為什麼需要容器這種東西">
        <p>
          編碼器吐出來的是什麼？<strong>一串 bytes。</strong>
          沒有時間、沒有邊界、也沒有「這是視訊還是音訊」的資訊。
        </p>
        <p>
          想像你手上有一疊壓縮好的畫面資料和一疊壓縮好的聲音資料。
          要能播放，你必須先回答五個問題：
        </p>
        <ol>
          <li>
            <strong>邊界</strong> —— 哪一段 bytes 是一幀？從哪裡到哪裡？
          </li>
          <li>
            <strong>時間</strong> —— 這一幀什麼時候該顯示？
          </li>
          <li>
            <strong>軌道</strong> —— 哪些是視訊、哪些是音訊、有幾個聲道？
          </li>
          <li>
            <strong>解碼參數</strong> —— 用什麼 codec 解？解析度多少？
          </li>
          <li>
            <strong>索引</strong> —— 總共多長？能不能從第 10 分鐘開始播？
          </li>
        </ol>
        <p>
          <strong>容器就是回答這五個問題的那層包裝。</strong>
        </p>
        <p>
          用書來比喻：codec 是「把內容壓縮成速記」，container 是「裝訂成書」——
          目錄、頁碼、章節分隔。沒有裝訂，你有一疊紙但不知道順序，也不知道哪幾頁是插圖。
        </p>

        <h3>沒有容器會怎樣</h3>
        <p>
          這不是假設 —— 你真的可以把 H.264 直接存成 <code>.h264</code> 檔
          （所謂 Annex B 格式），用固定的 start code <code>0x000001</code> 分隔每個單位。
          它能播，但：
        </p>
        <ul>
          <li>
            <strong>沒有時間戳</strong> —— 播放器只能猜 frame rate，猜錯就快轉或慢動作
          </li>
          <li>
            <strong>沒有音訊</strong> —— 一個檔案只能裝一條流
          </li>
          <li>
            <strong>不能 seek</strong> —— 想跳到中間只能從頭掃過去
          </li>
        </ul>
        <p>
          所以裸流只在測試與管線中間用，不會拿來當成品。
        </p>
      </Section>

      <Callout kind="insight" title="RTP 是「串流版的容器」">
        <p>
          本頁後半會講到即時傳輸不用容器。但那五個問題並沒有消失 ——
          只是換一套方式回答：
        </p>
        <ul>
          <li>
            <strong>邊界＋順序</strong> → RTP 的序號
          </li>
          <li>
            <strong>時間</strong> → RTP 的時間戳
          </li>
          <li>
            <strong>軌道</strong> → SSRC（同步來源識別）
          </li>
          <li>
            <strong>解碼參數</strong> → payload type，細節在 SDP 裡先講好
          </li>
          <li>
            <strong>索引</strong> → <em>放棄</em>。串流沒有「總長度」，也不需要 seek
          </li>
        </ul>
        <p>
          <strong>差別只在最後一項。</strong>容器為「檔案」設計（完整、有頭尾、可回頭讀），
          RTP 為「流」設計（會丟、會亂序、永遠不知道何時結束）。
          看懂這個對照，容器與 RTP 就不是兩套無關的知識了。
        </p>
      </Callout>

      <Section title="二、H.264 不是 MP4">
        <p>
          這是最常被混在一起的兩件事，分清楚之後很多東西會突然變清楚：
        </p>
        <ul>
          <li>
            <strong>codec</strong>（H.264、AAC）決定「一幀畫面怎麼被壓成一串 bytes」。
            它的輸出是一串沒有時間概念的壓縮資料。
          </li>
          <li>
            <strong>container</strong>（MP4、WebM、MKV）決定「這些 bytes 怎麼被組織起來」
            —— 哪段是視訊哪段是音訊、每段對應第幾毫秒、總長多久、可以從哪裡開始播。
          </li>
        </ul>
        <p>
          所以「MP4 檔」沒有告訴你裡面是什麼 codec；一個 MP4 可以裝 H.264+AAC，
          也可以裝 H.265+Opus。播不出來的檔案，問題通常在 codec 不支援而不是容器。
        </p>
        <p>
          <strong>即時串流沒有容器</strong>，或者說它用的是另一種東西：RTP。
          RTP 不是檔案格式，是封包格式 —— 這是本頁後半的重點。
        </p>
      </Section>

      <Section title="三、MP4 的結構與那個 moov 問題">
        <p>
          MP4（ISO BMFF）由一堆嵌套的 <strong>box</strong>（也叫 atom）組成，
          每個 box 有長度與四字元類型。關鍵的三個：
        </p>
        <ul>
          <li>
            <code>ftyp</code> — 檔案類型宣告，在最前面
          </li>
          <li>
            <code>moov</code> — <strong>索引</strong>。每一幀在檔案的哪個位元組、對應第幾毫秒、
            是不是 keyframe，全在這裡
          </li>
          <li>
            <code>mdat</code> — 實際的壓縮資料
          </li>
        </ul>
      </Section>

      <BoxDiagram
        rows={[
          {
            title: '一般 MP4',
            boxes: [
              { label: 'ftyp', tone: 'meta' },
              { label: 'mdat', note: '所有壓縮資料', span: 8, tone: 'data' },
              { label: 'moov', note: '索引', span: 2, tone: 'meta' },
            ],
            hint: 'moov 通常寫在最後 —— 因為要等全部編完才知道每一幀的位移。錄影中當機 → 沒有 moov → 整個檔案打不開。',
          },
          {
            title: 'fragmented MP4',
            boxes: [
              { label: 'ftyp', tone: 'meta' },
              { label: 'moov', note: '只有格式資訊', span: 1.5, tone: 'meta' },
              { label: 'moof', tone: 'frag' },
              { label: 'mdat', span: 2, tone: 'data' },
              { label: 'moof', tone: 'frag' },
              { label: 'mdat', span: 2, tone: 'data' },
              { label: 'moof', tone: 'frag' },
              { label: 'mdat', span: 2, tone: 'data' },
            ],
            hint: '每個片段自帶索引（moof）。寫到哪就有效到哪，當機只損失最後一個片段。也是 HLS/DASH 能邊下載邊播的基礎。',
          },
        ]}
        caption="同樣是 MP4，索引放哪決定了它能不能邊寫邊用。"
      />

      <Callout kind="insight" title="faststart 與 moov 前移">
        你可能見過 <code>-movflags +faststart</code> 這個 ffmpeg 參數。它做的事就是
        轉檔完成後<strong>把 moov 搬到檔案前面</strong>，這樣網頁播放器下載前幾百 KB
        就能知道整個檔案的結構、可以立刻開始播並支援拖曳。 代價是要多讀寫一次整個檔案。
      </Callout>

      <Section title="四、muxing 在做什麼">
        <p>
          視訊與音訊是兩條獨立編出來的流，取樣率完全不同（視訊 60 fps、音訊 48000 Hz）。
          muxer 的工作就是把它們交錯寫進同一個容器，並且讓播放時能對上。
        </p>
        <Steps
          items={[
            {
              label: '拿到帶時間戳的壓縮資料',
              detail: (
                <>
                  編碼器輸出的每個單位（access unit）都有 PTS（presentation timestamp，
                  什麼時候該顯示）與 DTS（decode timestamp，什麼時候該解碼）。
                  有 B-frame 時這兩個不相等 —— 這就是 DTS 存在的唯一理由。
                </>
              ),
            },
            {
              label: '換算到容器的時間基準',
              detail: (
                <>
                  容器有自己的 timescale（例如每秒 90000 個刻度）。muxer 把編碼器的時間戳
                  換算過去。這裡的整數除法誤差累積起來就是「播久了聲音跟畫面差一點」。
                </>
              ),
            },
            {
              label: '交錯寫入並記錄位移',
              detail: '按時間順序交錯寫視訊與音訊片段，同時累積索引資訊。',
            },
            {
              label: '收尾寫索引',
              detail: (
                <>
                  一般 MP4 在這一步寫 <code>moov</code>；fMP4 則是每個片段結束就寫一次{' '}
                  <code>moof</code>，所以沒有「收尾」這個單點風險。
                </>
              ),
            },
          ]}
        />
        <p>
          Android 的 <code>MediaMuxer</code> 就是這件事的系統實作。它的限制值得記住：
          一次只能一個輸出檔、<code>stop()</code> 沒被呼叫到檔案就不完整
          （對應上面的 moov 問題）、而且對 track 數量與格式有限制。
        </p>
      </Section>

      <Section title="五、RTP：即時傳輸不用容器">
        <p>
          容器是為「檔案」設計的 —— 假設資料完整、有頭有尾、可以回頭讀。
          即時傳輸三個假設都不成立：封包會丟、會亂序、而且永遠不知道什麼時候結束。
        </p>
        <p>
          所以 WebRTC 用 <strong>RTP</strong>。它不是容器，是封包標頭：序號、時間戳、
          同步來源識別碼（SSRC）、payload type。丟包靠序號發現，亂序靠序號重排，
          音視訊同步靠時間戳配合 RTCP 的對應資訊。
        </p>
        <h3>一幀怎麼塞進封包</h3>
        <p>
          網路的 MTU 通常是 1500 bytes（扣掉 IP/UDP/RTP/SRTP 標頭大概剩 1200 出頭）。
          一個 1080p 的 I-frame 可能有 100 KB —— 所以必須切。這叫 <strong>packetization</strong>，
          H.264 的規則定在 RFC 6184：
        </p>
        <ul>
          <li>
            <strong>Single NAL unit</strong> — 小的 NAL 直接一個一包
          </li>
          <li>
            <strong>FU-A</strong>（Fragmentation Unit）— 大的 NAL 切成多包，
            每包標明「是不是開頭／結尾」
          </li>
          <li>
            <strong>STAP-A</strong> — 把好幾個很小的 NAL（例如 SPS + PPS）合併進一包，
            省標頭開銷
          </li>
        </ul>
        <p>
          這個機制帶來一個重要後果：<strong>丟一個封包就毀掉整個 NAL</strong>。
          一個 I-frame 切成 90 包，丟任何一包整幀就解不出來 ——
          這是為什麼 I-frame 越大越脆弱，也是為什麼即時場景寧願多發小一點的 I-frame。
        </p>
      </Section>

      <Section title="六、jitter buffer：把亂序的世界變整齊">
        <p>
          封包到達的間隔不會平均，這個抖動叫 jitter。解碼器需要穩定的輸入，
          所以中間要有一個緩衝區：收到的封包先排好序、等一段時間讓落後的封包追上、
          再按時間戳餵給解碼器。
        </p>
        <p>
          <strong>jitter buffer 的大小就是延遲與流暢的直接取捨</strong> ——
          等久一點畫面順但延遲高，等短一點延遲低但會頓。
          真實實作會動態調整：網路穩就縮小，開始丟包就放大。
        </p>
        <p>
          所以「投影會頓」有三個完全不同的可能原因，要分清楚才debug得動：
          編碼跟不上（CPU）、頻寬不足（擁塞控制降 bitrate 或丟包）、
          或是 jitter buffer 在跟抖動搏鬥。
        </p>
      </Section>

      <Section title="七、GStreamer 的模型最好懂">
        <p>
          <code>edu-as-multicast-plugin</code> 用 GStreamer。GStreamer 把整條管線寫成
          一行文字，每個元素用 <code>!</code> 串起來：
        </p>
        <p>
          <code>
            videotestsrc ! x264enc ! rtph264pay ! udpsink host=224.1.1.1
          </code>
        </p>
        <p>
          擷取 → 編碼 → 封包化 → 送出，四個環節一目瞭然。
          <strong>這行字就是這個 domain 的資料路徑</strong>，
          所以想快速建立整條管線的直覺，玩 GStreamer 比讀 libwebrtc 快得多。
        </p>
      </Section>
    </ConceptPage>
  )
}
