# Validation sample schema

資料集保存在 `llavon-ime/validation-set` repository 的 `dataset/validation.jsonl`。每一行是一筆獨立的 canonical JSON；檔案使用 UTF-8（無 BOM）與 LF 換行。

```jsonl
{"schemaVersion":1,"license":"CC-BY-4.0","context":"下班後我想去超市買","answer":"牛奶","padding":[{"syllable":"ㄋㄧㄡ","tone":2},{"syllable":"ㄋㄞ","tone":3}],"difficulty":2}
```

## 欄位

| 欄位 | 說明 |
| --- | --- |
| `schemaVersion` | 格式版本，目前固定為 `1` |
| `license` | 單筆資料的授權識別，固定為 `CC-BY-4.0` |
| `context` | 正確答案之前的文字，可為空字串，最多 500 個 Unicode code points |
| `answer` | 貢獻者唯一預期的輸出，最多 32 個 Unicode code points |
| `padding` | 與答案逐字對齊的注音或英文字母標註；英文字母沿用原字母並固定使用 `tone: 1` |
| `difficulty` | 樣本本身的整體判讀難度，整數 `1`–`5`；綜合語境歧義、詞彙罕見性、專業性與所需背景知識，不參考目前模型表現 |

樣本本體不包含 UUID、投稿者、建立時間或 `Co-authored-by`。UUID 僅在網站後端到 GitHub Actions 的事件與 commit message 中作為追蹤識別；重送去重以完整 canonical 資料行判定。

## 聲調

`tone` 使用整數，避免用不可見的尾端空白保存一聲：

| 值 | 顯示 | 現有模型 token key 後綴 |
| --- | --- | --- |
| `1` | `ˉ` | ASCII space |
| `2` | `ˊ` | `ˊ` |
| `3` | `ˇ` | `ˇ` |
| `4` | `ˋ` | `ˋ` |
| `5` | `˙` | `˙` |

## 傳遞與不變條件

1. Nuxt server 將欄位固定排序為 `schemaVersion`、`license`、`context`、`answer`、`padding`、`difficulty`，並以 JSON 原生 Unicode 字串傳送，不以 Base64 包裝投稿內容。
2. Nuxt server 在傳送前對 canonical JSON 的 UTF-8 bytes 計算 SHA-256；GitHub Action 以收到的資料重新序列化並驗證 digest，任何內容或編碼變動都會拒絕寫入。
3. 所有文字必須是有效 Unicode scalar values；`context`、`answer` 與 `syllable` 寫入前正規化為 NFC。
4. `Array.from(answer).length === padding.length`。
5. 每個中文 `answer[i]` 必須存在於 `padding[i]` 對應注音的候選集合；英文字母則必須以大小寫完全相同的原字母標註，且使用 `tone: 1`。
6. padding 只包含未選字注音，不包含 `chosen_char`。
7. GitHub Action 以 repository concurrency group 串行追加資料，並確保 UTF-8 無 BOM、LF 換行及完整 JSONL 行。
8. 每筆樣本固定帶有 `license: "CC-BY-4.0"`；必要姓名標示統一依 `ATTRIBUTION.md` 辦理，GitHub `Co-authored-by` 是投稿者自行選擇之個別貢獻紀錄。
