# 拉風輸入法驗證集共筆

以 Nuxt 建立的驗證集投稿網站。使用者透過 GitHub 登入後，可以提供前文、唯一預期答案、逐字注音與 1–5 整體判讀難度；難度綜合語境歧義、詞彙罕見性、專業性與所需背景知識。

後端將每筆 CC BY 4.0 樣本送至 `llavon-ime/validation-set`，再由 GitHub Actions 串行追加至 `validation.jsonl`。使用者可選擇在 commit 中加入 GitHub `Co-authored-by` 紀錄。

## 專案結構

```text
app/       Vue 頁面、元件與樣式
server/    Nitro API、OAuth 路由與 GitHub App 服務
shared/    前後端共用 schema、注音候選表與驗證邏輯
public/    靜態資源
tests/     schema、注音與 API 測試
scripts/   品牌資源及注音候選表同步工具
docs/      資料格式與授權文件
```

網站使用 Nuxt 的預設 universal rendering；初始頁面由伺服器渲染，登入狀態、草稿保存與表單互動在瀏覽器端接續執行。OAuth 與加密 cookie session 使用 Nuxt 官方模組 `nuxt-auth-utils`，GitHub App installation token 由 Octokit 管理；專案本身只保留投稿驗證及事件格式等應用邏輯。

## 本機開發

需求：Node.js 22.19 或更新版本。

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

網站與 API 位於 `http://localhost:5173`。本機也使用真正的 GitHub OAuth；請在 GitHub App 加入 callback：

```text
http://localhost:5173/auth/github
```

常用指令：

```powershell
npm run typecheck
npm test
npm run build
npm run preview
npm run sync:brand
npm run sync:bopomofo
```

`sync:bopomofo` 從 `llavon-ime/ime-windows-frontend` 同步注音候選表，並在寫入前驗證 Git blob SHA。`sync:brand` 從 `llavon-ime` GitHub 組織頭像同步網站 Logo，並以 SHA-256 鎖定已審核版本。

## GitHub App

建立一個由 `llavon-ime` 擁有的 GitHub App：

1. Homepage URL 設為正式網站網址。
2. Callback URL 設為 `https://你的網域/auth/github`。
3. Repository permissions 僅開啟 `Contents: Read and write`。
4. 將 App 安裝到 `llavon-ime/validation-set`，並選擇 Only select repositories。
5. 不需要 Email、Profile write 或其他 repository 權限。

`nuxt-auth-utils` 完成 GitHub OAuth 後，只把使用者 ID、帳號與頭像放入加密 session cookie，不保存 user access token。Octokit 以 GitHub App installation 身分向設定中的 `validation-set` 發送 `repository_dispatch`；實際 commit 由該 repository 的 GitHub Actions 建立。

## 環境變數

本機變數使用 Nuxt 預設的 `.env`，正式環境則設定在部署平台。完整範本見 [.env.example](.env.example)。OAuth 與 GitHub App credentials 只由 `server/` 程式透過 `process.env` 讀取，不放入 Nuxt `runtimeConfig`；session 密碼則依 `nuxt-auth-utils` 的介面使用 `NUXT_SESSION_PASSWORD`。

| 名稱 | 用途 |
| --- | --- |
| `NUXT_SESSION_PASSWORD` | 至少 32 字元，用於 Nuxt 加密 session 與同意書 cookie |
| `GITHUB_CLIENT_ID` | GitHub App Client ID，傳給 `nuxt-auth-utils` 的 OAuth handler |
| `GITHUB_CLIENT_SECRET` | GitHub App Client secret，傳給 `nuxt-auth-utils` 的 OAuth handler |
| `GITHUB_APP_ID` | GitHub App ID |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App private key PEM，可使用真正換行或 `\n` |
| `GITHUB_INSTALLATION_ID` | App 安裝至 `llavon-ime` 後的 installation ID |

`GITHUB_APP_PRIVATE_KEY` 接受 GitHub 下載的 private key PEM，以及多行 PEM 或以 `\n` 表示換行的單行字串。GitHub App 三項環境變數由 Zod 在 server-only service 集中驗證；PEM 解析與 GitHub App JWT／installation token 交換由 Octokit 處理。資料庫目標固定為 `llavon-ime/validation-set`，不另外使用環境變數。

## 部署至 Vercel

1. 在 Vercel 匯入 `llavon-ime/validation-web`。
2. Framework Preset 使用 Nuxt.js；Root Directory 保持 repository root。
3. 不覆寫 Build Command 或 Output Directory。
4. 在 Production 環境加入上述環境變數。
5. 綁定正式網域後，將該網域的 `/auth/github` 加入 GitHub App，再重新部署。

Preview deployment 的隨機網址不會自動成為 GitHub OAuth callback。若需測試 Preview 登入，應配置固定 preview domain，並將 callback 明確加入 GitHub App。

Vercel 用來部署原始碼的 Git integration 應安裝到 `validation-web`；負責登入與投稿的自建 GitHub App 則只安裝到 `validation-set`。

## 部署至其他 Node.js 平台

```powershell
npm install
npm run build
npm run preview
```

Nitro Node 入口為 `.output/server/index.mjs`。執行環境需提供相同環境變數，反向代理應保留正確的 `Host` 與 `X-Forwarded-Proto` headers。

## 資料與提交行為

- 首次造訪時必須明確同意目前版本的貢獻同意書；接受紀錄以獨立的加密 HttpOnly Cookie 保存一年，不因 GitHub 登入或登出而消失。
- 樣本本體不保存接受時間、建立時間或 GitHub 身分。選擇 `Co-authored-by` 時，GitHub 身分只出現在 commit metadata。
- 前端依正確答案逐字反查合法讀音；單音字自動完成，破音字要求使用者選擇。
- API 會再次驗證答案字數、padding 數量及候選表對應。
- UUID 只作為事件與 commit 的追蹤識別，不寫入樣本本體。
- API 回傳 HTTP `202 Accepted` 只表示 GitHub 已接受事件。GitHub Action 會重新驗證 canonical UTF-8 SHA-256，並避免重複追加完整相同的 canonical 資料行。
- 一聲在資料內保存為 `tone: 1`，只有餵給模型介面時才轉換成尾端空白。

完整格式見 [docs/dataset-schema.md](docs/dataset-schema.md)。同意書全文與改版規則見 [docs/contribution-agreement.md](docs/contribution-agreement.md)，資料集授權公告及統一姓名標示範本見 [docs/dataset-license.md](docs/dataset-license.md)與 [docs/dataset-attribution.md](docs/dataset-attribution.md)。目前文字是產品草案，不構成法律意見；正式公開前仍應完成適用法域的法律審閱。

## 授權

網站程式碼依 [BSD 2-Clause License](LICENSE) 授權；validation dataset 之各筆投稿由投稿者保留權利並依 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 提供，統一姓名標示為「拉風輸入法組織（llavon-ime）」及資料集網址。
