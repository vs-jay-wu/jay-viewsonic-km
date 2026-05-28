# Out-of-Scope 建議

> 調查 VSFT-8368 過程中發現的、**不屬於本 ticket 範圍**但值得記錄的後續建議。
> 主要服務 mvbf 之外的團隊（mvb backend / 行銷 / Data team / cs / mvbw…），
> 供未來 ticket 規劃時參考。
>
> VSFT-8368 的範圍 = mvbf Amplitude 事件埋點與 user property。其他相關工作不在本 ticket 內。

---

## 1. mvbf 點 Beta button 後呼叫 `POST /v1/entity/beta-program/register` 自動加入名單

**Owner**：行銷 / mvbf v2 / mvb backend 協同（**不在 VSFT-8368**）

**背景**
- mvb backend 已有 `POST /v1/entity/beta-program/register` endpoint（`edu-mvb-api-core` 的 `mvb-legacy/src/entity/beta-program/beta-program-registration.controller.ts`），含 email drip campaign scheduler + `beta-program-enrollment` model + migration `models/_migrations/20260522.sql`
- mvbf 已實作 `Beta Program Joined Clicked` Amplitude event（含 `email` 屬性，在 VSFT-8368 完成）—— 但**沒有打 backend register endpoint**

**建議內容**
- 點 Beta button 時除了 fire Amplitude event，**同時呼叫** `POST /v1/entity/beta-program/register` 把使用者寫進 enrollment 名單
- backend 自動觸發 email drip
- 行銷團隊不用手動從 Amplitude 撈名單再餵 email 系統

**待釐清（為何不直接 mvbf 做）**
1. **行銷 drip 內容 / 頻率 / 啟動時機** 都需要行銷團隊定義
2. **GDPR / 隱私同意**：使用者按 Beta button 是不是已等同同意收行銷信？需要 PM / 法務確認
3. **`VsOIDCGuard` token 相容性**：mvbf 用 mvb OIDC 拿到的 access token，需確認跟 VS account token 是同一張或可替換；若不相容，要 mvb backend 改 guard 或 mvbf 取另一張 token

**對 VSFT-8368 的影響**：無（mvbf 端 Amplitude 追蹤已完整，能用 Amplitude event + email 屬性出名單，只是行銷要手動撈）

**相關**：原本是 `open-questions.md` Q7，因為超出 VSFT-8368 範圍，移到本文件保留

---

> 之後其他「mvbf 不該自己決定 / 需要其他 team 接手」的建議都加在這裡。
