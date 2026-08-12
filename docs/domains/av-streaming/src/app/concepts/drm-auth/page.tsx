import { ConceptPage, Section } from '@/components/ConceptPage'
import { Callout } from '@/components/Prose'
import { CompareGrid, Steps } from '@/components/diagrams'

export default function Page() {
  return (
    <ConceptPage id="drm-auth">
      <Section title="一、這一層在防什麼">
        <p>
          先把三種容易混在一起的東西分開 —— 它們保護的對象完全不同：
        </p>
        <CompareGrid
          columns={['保護什麼', '對象', '例子']}
          rows={[
            {
              label: '內容 DRM',
              cells: [
                '影片本身不被錄下來',
                '防使用者',
                'Widevine、PlayReady、FairPlay Streaming',
              ],
            },
            {
              label: '裝置認證',
              cells: [
                '只有授權硬體能參與',
                '防競爭對手',
                'AirPlay 的 FairPlay 握手、Cast 裝置憑證',
              ],
            },
            {
              label: '連線授權',
              cells: ['只有在場的人能投', '防隔壁教室的人亂投', 'OTP、密碼、moderator 核准'],
            },
          ]}
          verdict={
            <>
              這批 repo 碰的<strong>幾乎都是中間那類</strong>。這點很重要：
              裝置認證的目的不是保護內容或使用者，是<strong>控制誰能做相容裝置</strong> ——
              它是商業護城河，用密碼學實作。
            </>
          }
        />
      </Section>

      <Section title="二、AirPlay 的 FairPlay 握手">
        <p>
          名字容易誤導。這裡的 FairPlay <strong>不是</strong> Apple 用在 iTunes 影片上的
          FairPlay Streaming DRM，而是 AirPlay 協議裡的一段<strong>裝置認證</strong>交換。
        </p>
        <Steps
          items={[
            {
              label: '發送端送出挑戰',
              detail: '一段隨機資料，要求接收端用只有授權裝置才有的資訊做運算。',
            },
            {
              label: '接收端計算回應',
              detail:
                '正規的授權接收端有 Apple 提供的金鑰材料。相容實作必須自己重建出等價的運算。',
            },
            {
              label: '驗證通過才進入媒體階段',
              detail: '沒過就什麼都拿不到 —— 這是硬性的門。',
            },
          ]}
        />
        <p>
          <code>edu-as-fairplay</code> 的 README 自述是{' '}
          <strong>「A clean-room implementation of AirPlay&apos;s FairPlay」</strong>。
          注意「clean-room」不是技術形容詞，是<strong>法律用語</strong>。
        </p>
      </Section>

      <Callout kind="insight" title="clean-room 為什麼重要">
        <p>
          clean-room（淨室）實作指的是：<strong>刻意隔絕原始實作的程式碼</strong>，
          由一組人分析行為並寫出規格，另一組沒看過原始碼的人照規格重寫。
        </p>
        <p>
          目的是切斷著作權侵權的因果鏈 —— 你的程式碼不可能抄自你沒看過的東西。
          歷史上最有名的例子是 1980 年代 Phoenix 重寫 IBM PC BIOS，
          那個案例奠定了 PC 相容機產業。
        </p>
        <p>
          <strong>所以 README 寫這句話是刻意的、有法律意義的聲明</strong>，
          不是隨手描述。看到這種措辭就該意識到這塊有律師參與過。
        </p>
      </Callout>

      <Section title="三、Google Cast 的 keyset 與輪替">
        <p>
          Cast 要求接收端出示 Google 簽發的裝置憑證。正規途徑是加入 Cast 認證方案，
          由 Google 發給你的硬體憑證。
        </p>
        <p>
          <code>edu-as-libcastauth</code> 的 README 描述的是另一條路徑：
          <em>「依日期從 SecureData 取出 Google Cast 的 auth keyset」</em>。
          兩個細節值得注意：
        </p>
        <ul>
          <li>
            <strong>「依日期」意味著 keyset 會輪替。</strong>
            所以這不是一次取得就永久有效的東西 —— 需要持續供應新的 keyset，
            這是一個長期的維護負擔而不是一次性工作。
          </li>
          <li>
            <strong>keyset 是從別處提取的，不是自己簽發的。</strong>
            <code>edu-as-castauthtool</code> 就是提取工具，來源是第三方投放產品 Reflector。
          </li>
        </ul>
        <p>
          <code>edu-as-castauthtool</code> 的使用前提從 README 就看得出手法：
          需要提權執行、關閉網路、關閉防毒、搭配 Windows Debugger。
          <strong>這是記憶體層級的逆向工程。</strong>
        </p>
      </Section>

      <Callout kind="warn" title="合規邊界 —— 這頁最需要注意的一段">
        <p>
          <code>edu-as-castauthtool</code> 是這批 repo 裡合規敏感度最高的一個，理由有三層：
        </p>
        <ul>
          <li>
            它從第三方商業軟體中提取憑證材料，手法是記憶體逆向
          </li>
          <li>
            README 內含該第三方軟體的<strong>授權碼明文</strong>。
            這份筆記刻意不複製任何憑證或授權內容
          </li>
          <li>
            繞過 Google Cast 的裝置認證，在授權條款與可能的法律責任上都有風險
          </li>
        </ul>
        <p>
          <strong>可以寫進內部筆記的</strong>：這個 repo 存在、它的角色是什麼、
          它與 <code>libcastauth</code> 的分工、keyset 為何要輪替 —— 也就是架構理解。
        </p>
        <p>
          <strong>不該外流的</strong>：具體手法細節、任何憑證／金鑰／授權碼內容、
          以及「我們用逆向手段取得第三方認證憑證」這個事實本身。
          對公司內其他團隊討論前也建議先確認 ——
          這不是保密癖，是這類事實的擴散本身就會擴大風險。
        </p>
      </Callout>

      <Section title="四、OTP：完全不同的一層">
        <p>
          前面兩節講的是「裝置有沒有資格」，OTP 講的是「這個人現在有沒有資格」。
          <code>edu-mvb-presentation-gateway</code>（Display Backend）負責這一層。
        </p>
        <p>
          機制很簡單：大螢幕顯示一組短碼，使用者在自己裝置輸入，
          後端比對後才放行。但它在教室情境有幾個難以取代的優點：
        </p>
        <ul>
          <li>
            <strong>天然的在場證明。</strong>
            要看到螢幕才知道碼 —— 所以「你人在這間教室」這件事不需要另外驗證。
            這比帳號密碼更貼近實際的授權意圖
          </li>
          <li>
            <strong>不需要帳號。</strong>訪客不必註冊，老師不必管使用者清單
          </li>
          <li>
            <strong>繞過裝置發現。</strong>
            mDNS 被網路擋掉時，OTP 這條路仍然有效 —— 因為它問的是雲端而不是區網
          </li>
          <li>
            <strong>可以短效。</strong>碼會過期或投影結束就換，
            所以洩漏的損害有時間上限
          </li>
        </ul>
        <p>
          README 的更新記錄裡有一條很說明問題：
          <em>「User can use previous 3 OTP to connect Host now is 1 step」</em>
          —— 原本接受前三組舊碼（為了容忍碼剛好換掉的競態），後來收緊。
          <strong>這種修正就是安全性與可用性拉鋸的實際痕跡。</strong>
        </p>
        <p>
          同一份記錄還提到 <strong>moderator mode</strong> 與 presenter 名額上限 ——
          也就是「老師核准才能投」與「同時最多幾個人投」。
          這兩個都是授權邏輯，不是媒體技術，但它們決定了產品在教室裡好不好用。
        </p>
      </Section>

      <Section title="五、WebRTC 的加密不在這一層">
        <p>
          容易搞混，所以特別分開講：WebRTC 的 DTLS-SRTP 是<strong>傳輸加密</strong>，
          用自簽憑證加上信令通道傳遞的指紋來防中間人。
          它不驗證「你是誰」，只保證「這條連線上的內容沒被第三方看到或改掉」。
        </p>
        <p>
          所以 AirSync 的完整信任鏈是三段拼起來的：
          雲端的 OTP／license 決定<strong>誰可以連</strong>、
          DTLS 指紋確保<strong>連到的是同一個對象</strong>、
          SRTP 保護<strong>路上的內容</strong>。
          三段各自獨立，缺一段就有洞。
        </p>
      </Section>
    </ConceptPage>
  )
}
