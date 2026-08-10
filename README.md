# 拉風輸入法驗證集共筆

讓使用者透過 GitHub 登入貢獻拉風輸入法 validation set 的全端網站。使用者提供前文、唯一預期答案、逐字注音與 1–5 整體判讀難度；難度同時考量語境歧義及詞彙的罕見性、專業性與所需背景知識。後端會把每筆 CC BY 4.0 樣本寫成獨立 JSON。各投稿者保留其權利，並共同選擇「拉風輸入法組織（llavon-ime）」作為指定姓名標示名稱；另可選擇以 GitHub noreply email 加入 `Co-authored-by`。

## 專案結構

```text
apps/
  web/       Vue 3 + Vite 投稿介面
  worker/    Cloudflare Worker API 與靜態資產部署設定
packages/
  schema/    前後端共用 schema、限制與聲調轉換
  zhuyin/    注音候選表及字音反查
scripts/
  sync-bopomofo.mjs
```

正式部署由同一個 Cloudflare Worker 提供 Vue 靜態資產與 `/api/*`。開發時 Vite 將 `/api` proxy 至本機 Wrangler。

## 本機開發

需求：Node.js 22 或更新版本。

```powershell
npm install
Copy-Item apps/worker/.dev.vars.example apps/worker/.dev.vars
npm run dev
```

前端位於 `http://localhost:5173`，Worker 位於 `http://localhost:8787`。範例設定的 `DEV_AUTH_BYPASS=true` 只略過本機登入；真正寫入 GitHub 仍需要 GitHub App 的 installation credentials。

常用指令：

```powershell
npm run typecheck
npm test
npm run build
npm run sync:brand
npm run sync:bopomofo
```

`sync:bopomofo` 從 `llavon-ime/ime-windows-frontend` 同步候選表，並在寫入前驗證 Git blob SHA。上游資料有變更時，應先檢查差異，再更新同步腳本及 `BOPOMOFO_MAPPING_VERSION`。

`sync:brand` 從 `llavon-ime` GitHub 組織頭像同步目前使用的 Logo，並以 SHA-256 鎖定已審核版本。

## GitHub App 設定

建立一個由 `llavon-ime` 擁有的 GitHub App：

1. Homepage URL 設為正式網站網址。
2. Callback URL 設為 `https://你的網域/api/auth/callback`。
3. Repository permissions 僅開啟 `Contents: Read and write`。
4. 將 App 安裝到存放驗證集的單一 repository。
5. 不需要 Email、Profile write 或其他 repository 權限。

GitHub App 同時負責使用者登入與機器人寫入：

- user access token 只用來呼叫一次 `GET /user`，取得 `id`、`login` 與 avatar，之後不保存。
- installation token 用來建立 `samples/<UUID>.json`，有效期短且僅能存取安裝時選定的 repository。
- commit 由 GitHub App bot 建立；使用者預設以 `Co-authored-by` trailer 署名，也可在每次提交時取消。

### Worker 變數

非敏感變數可放在 `apps/worker/wrangler.jsonc`：

```text
ENVIRONMENT=production
PUBLIC_ORIGIN=https://你的網域
GITHUB_DATASET_OWNER=llavon-ime
GITHUB_DATASET_REPO=validation-dataset
GITHUB_DATASET_BRANCH=main
```

敏感值使用 Wrangler secrets：

```powershell
cd apps/worker
npx wrangler secret put SESSION_SECRET
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put GITHUB_APP_ID
npx wrangler secret put GITHUB_APP_PRIVATE_KEY
npx wrangler secret put GITHUB_INSTALLATION_ID
```

`SESSION_SECRET` 應至少使用 32 bytes 的隨機值。`GITHUB_APP_PRIVATE_KEY` 接受 GitHub 下載的 PKCS#1 `RSA PRIVATE KEY`、轉換後的 PKCS#8 `PRIVATE KEY`，以及真正的多行 PEM 或以 `\n` 表示換行的單行字串。

## 部署

確認資料集 repository 已存在且 GitHub App 對目標 branch 具有寫入權限，然後執行：

```powershell
npm run deploy
```

若目標 branch 使用 branch protection，必須允許這個 GitHub App 寫入，否則 Contents API 會拒絕提交。

## 資料與提交行為

- GitHub 登入後必須明確同意目前版本的貢獻同意書；接受紀錄以綁定 GitHub user ID 的簽章 HttpOnly Cookie 保存一年，清除 Cookie、換瀏覽器或條款改版時會再次顯示。
- 每筆樣本只以 `license: "CC-BY-4.0"` 表明資料授權，不保存同意書版本、接受時間、建立時間或 GitHub 身分。必要姓名標示統一依資料集的 `ATTRIBUTION.md` 辦理；選擇 `Co-authored-by` 時，GitHub 身分僅出現在 commit metadata。
- 網頁先依正確答案逐字反查合法讀音；單音字自動完成，破音字要求使用者選擇。
- API 再次驗證答案字數、padding 數量及候選表對應，不能只信任瀏覽器。
- 每筆提交使用瀏覽器產生的 UUID 作為 idempotency key 與 GitHub 路徑。
- 重送相同 ID 且貢獻者相同時，API 回傳既有檔案，不建立第二筆資料。
- 一聲在資料內存為 `tone: 1`，只有餵給現有模型介面時才轉換成尾端空白。

完整格式見 [docs/dataset-schema.md](docs/dataset-schema.md)。

同意書全文與改版規則見 [docs/contribution-agreement.md](docs/contribution-agreement.md)，資料集授權公告及統一姓名標示範本見 [docs/dataset-license.md](docs/dataset-license.md)與 [docs/dataset-attribution.md](docs/dataset-attribution.md)。目前文字是產品草案，不構成法律意見；正式公開前仍應完成適用法域的法律審閱。

## 授權

網站程式碼依 [BSD 2-Clause License](LICENSE) 授權；validation dataset 之各筆投稿由投稿者保留權利並依 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 提供，統一姓名標示為「拉風輸入法組織（llavon-ime）」及資料集網址。
