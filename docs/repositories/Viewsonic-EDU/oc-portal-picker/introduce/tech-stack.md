# 技術棧

## Runtime / 套件管理

- **Node 22.12.0**（`.nvmrc`）
- **pnpm 9.15.1**（`package.json#engines`，可用 corepack）

## Framework

- Next.js 15.3.6（pages router，`src/pages/`）
- React 19.1.2
- TypeScript 5.0.4

## 樣式

- TailwindCSS 3.4 + daisyUI 4
- 額外 config：`tailwind.config.js`、`tailwind.picker-guideline.js`

## 狀態 / 資料

- TanStack Query 4.36
- GraphQL（graphql-codegen，schema in `graphql-codegen.yml`）
- Apollo-less，直接走 axios

## i18n

- next-i18next 15 + i18next 23
- 翻譯檔在 `public/locales/`，主要透過 PoEditor 同步
- 自動翻譯腳本：`scripts/translate/translateI18n.mjs`

## 測試

- Vitest 3.2 + Testing Library
- MSW 1.3（mock API）

## Observability

- Sentry (`@sentry/nextjs` 8.54)
- Azure Application Insights v1 + v2 並存

## 私有套件（GitHub Packages, `@viewsonic-edu/` scope）

| Package | 用途 | 來源 repo |
|---|---|---|
| `mvb-fe-auth` | OIDC auth lib（store + bridge） | `Viewsonic-EDU/edu-fe-common-lib` |
| `mvb-fe-gql-codegen-op-mock` | GraphQL operation mock 產生器 | 同上 |
| `mvb-fe-poeditor-sync` | PoEditor 同步 CLI | 同上 |

需要 PAT with `read:packages` scope 才能 `pnpm i`。詳見 `build.md`。
