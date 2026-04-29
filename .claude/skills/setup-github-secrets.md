# setup-github-secrets

引導使用者透過 `scripts/set-repo-secrets.sh` 為 GitHub repo 設定 Actions secrets / variables。

## 使用者需求：`$ARGUMENTS`

根據使用者提供的需求，引導他執行以下步驟。

---

## 步驟 1：確認前置條件

```bash
gh auth status
```

若未登入，請先執行：

```bash
gh auth login
```

---

## 步驟 2：執行腳本

從 `jay-viewsonic-km` 專案根目錄執行：

```bash
./scripts/set-repo-secrets.sh <repo-name>
```

預設 org 為 `Viewsonic-EDU`，若有不同可指定：

```bash
./scripts/set-repo-secrets.sh <repo-name> --org <org>
```

---

## 步驟 3：回答腳本互動提示

腳本會依序詢問：

1. **層級**
   - `1` → Repo 層級（所有 workflow 皆可讀取）
   - `2` → Environment 層級（指定 `dev` / `stage` / `rc` / `prod`）

2. **類型**
   - `s` → Secret（加密，workflow 執行時隱藏）
   - `v` → Variable（明文，顯示於 Actions UI）

3. **KEY**：secret / variable 的名稱，全大寫慣例（如 `ECR_REGISTRY`）

4. **VALUE**：
   - Secret 輸入時不會顯示在畫面上
   - Variable 正常顯示

---

## 設定多個 key

一次執行設定一個 key，重複執行即可：

```bash
./scripts/set-repo-secrets.sh edu-droid-flutter   # 設定第一個
./scripts/set-repo-secrets.sh edu-droid-flutter   # 設定第二個
```

---

## 確認結果

腳本完成後會印出對應連結：

- Repo secrets：`https://github.com/<org>/<repo>/settings/secrets/actions`
- Environment secrets：`https://github.com/<org>/<repo>/settings/environments`

---

## 常見情境對照

| 需求 | 層級 | 類型 |
|---|---|---|
| AWS Region、ECR Repository 名稱 | Repo | Variable |
| ECR Registry、GitHub PAT、Slack Webhook | Repo | Secret |
| 各環境 AWS Role ARN | Environment | Secret |
| 各環境 CloudFront Distribution ID | Environment | Variable |
