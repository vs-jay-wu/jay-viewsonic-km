# Build / Run 指南

## 一次性環境設定

### Node 22.12.0

```bash
nvm install 22.12.0
nvm use 22.12.0
```

### pnpm 9.15.1（透過 corepack）

```bash
corepack enable
corepack prepare pnpm@9.15.1 --activate
```

### GitHub Packages 認證

`.npmrc` 會從 `${NODE_AUTH_TOKEN}` 讀 token，缺它 `pnpm i` 會 403。

**Token 需要 `read:packages` scope。** `gh auth token` 預設出來的 OAuth token（`gho_...`）**沒有**這個 scope。兩個解法：

1. `gh auth refresh -h github.com -s read:packages`（會跳瀏覽器，需用對的 GitHub 帳號授權，會跟 gh 既有帳號的快取名比對）
2. 到 https://github.com/settings/tokens/new 產一個 Classic PAT 勾 `read:packages`

帳號權限方面，要對發布 package 的 mono-repo `Viewsonic-EDU/edu-fe-common-lib` 有 pull 權限。

```bash
export NODE_AUTH_TOKEN=$(gh auth token)   # 或貼自己的 PAT
pnpm i
```

> 安裝會看到一個 `mockgen` bin 的 WARN，無害（postinstall 還是會跑完 msw init + husky install）。

---

## 環境檔

```
.env             ← 預設（本地讀），目前指向 dev API
.env.dev         ← CI 用，模板會 mv 成 .env.production
.env.rc          ← 同上，rc 環境
.env.stage       ← 同上，stage 環境
.env.production  ← Next.js build 時讀；目前已含 production 值
.env.test        ← 測試
```

⚠️ `package.json` 的 `env:dev` / `env:rc` / `env:stage` scripts 會 **`mv .env.xxx .env.production`**（覆蓋原檔）— 是 CI 用的，本地誤跑會回不去。

## 跑法

### 跑 dev、連 dev API

```bash
pnpm dev
# → http://localhost:3000/originals/picker/contents
```

`.env` 預設指向 `api.dev.myviewboard.com`。

### 跑 dev、連 production API

把 `.env` 對應變數改成 production 值（或 `cp .env.production .env`）：

```ini
NEXT_PUBLIC_API_ENDPOINT=https://api.myviewboard.com
NEXT_PUBLIC_GQL_BASEURL=https://originals-api.myviewboard.com/graphql
NEXT_PUBLIC_AUTH_ENV=prod
NEXT_PUBLIC_MVB_HUB_ORIGIN=https://hub.myviewboard.com
```

然後 `pnpm dev`。

> Production build 模式（`pnpm build && pnpm start`）會自動讀 `.env.production`，不需要動 `.env`。

### 開啟瀏覽器

```bash
open http://localhost:3000/originals/picker/contents
```

不要打 `/originals/picker` —— 沒有 index page，會 404。

---

## 登入

獨立瀏覽器走 `useConvertMVBAppToken.ts` 的 dev fallback：讀 `sessionStorage.ocv2_token_info`。手動取得 token 的方法見 [features/webview-auth-sync](../features/webview-auth-sync/README.md)。
