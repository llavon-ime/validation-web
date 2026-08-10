# Validation sample schema

每個 GitHub commit 新增一個 `samples/<id>.json`：

```json
{
  "schemaVersion": 1,
  "license": "CC-BY-4.0",
  "id": "0262684d-61eb-4c2b-906f-62d168bcd021",
  "context": "下班後我想去超市買",
  "answer": "牛奶",
  "padding": [
    { "syllable": "ㄋㄧㄡ", "tone": 2 },
    { "syllable": "ㄋㄞ", "tone": 3 }
  ],
  "difficulty": 2
}
```

## 欄位

| 欄位 | 說明 |
| --- | --- |
| `schemaVersion` | 格式版本，目前固定為 `1` |
| `license` | 單筆資料的授權識別，固定為 `CC-BY-4.0` |
| `id` | UUID，同時作為重送去重鍵 |
| `context` | 正確答案之前的文字，1–500 字元 |
| `answer` | 貢獻者唯一預期的輸出，最多 32 字 |
| `padding` | 與答案逐字對齊的純注音序列 |
| `difficulty` | 樣本本身的整體判讀難度，整數 `1`–`5`；綜合語境歧義、詞彙罕見性、專業性與所需背景知識，不參考目前模型表現 |

## 聲調

`tone` 使用整數，避免用不可見的尾端空白保存一聲：

| 值 | 顯示 | 現有模型 token key 後綴 |
| --- | --- | --- |
| `1` | `ˉ` | ASCII space |
| `2` | `ˊ` | `ˊ` |
| `3` | `ˇ` | `ˇ` |
| `4` | `ˋ` | `ˋ` |
| `5` | `˙` | `˙` |

## 不變條件

1. `Array.from(answer).length === padding.length`。
2. 每個 `answer[i]` 必須存在於 `padding[i]` 對應注音的候選集合。
3. padding 只包含未選字注音，不包含 `chosen_char`。
4. `context`、`answer` 與 `syllable` 在寫入前正規化為 Unicode NFC。
5. JSON 不保存投稿者的 GitHub 身分或建立時間；署名與時間由 Git commit metadata 記錄。
6. 每筆樣本固定帶有 `license: "CC-BY-4.0"`；必要姓名標示統一依 `ATTRIBUTION.md` 辦理，GitHub `Co-authored-by` 是投稿者自行選擇之個別貢獻紀錄。
