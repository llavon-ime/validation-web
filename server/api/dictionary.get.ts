import { createError, getQuery, setResponseHeader } from "h3";
import { LIMITS } from "../../shared/utils/schema";
import { findDictionaryLinks } from "../services/moe-dictionary";

export default defineEventHandler(async (event) => {
  const word = String(getQuery(event).word ?? "").normalize("NFC");
  if (!/^\p{Script=Han}+$/u.test(word) || Array.from(word).length > LIMITS.answer) {
    throw createError({ statusCode: 400, statusMessage: "請輸入漢字" });
  }

  const { links, complete } = await findDictionaryLinks(word);
  // serverless 沒有常駐記憶體，交給 CDN 快取；查詢失敗不快取，避免暫時性錯誤讓按鈕消失
  setResponseHeader(
    event,
    "Cache-Control",
    complete ? "public, max-age=3600, s-maxage=604800, stale-while-revalidate=86400" : "no-store",
  );
  return links;
});
