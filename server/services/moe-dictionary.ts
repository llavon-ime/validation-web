import {
  MOE_DICTIONARIES,
  type DictionaryLinks,
  type MoeDictionary,
} from "../../shared/utils/dictionary";

const REQUEST_TIMEOUT_MS = 5000;

function stripTags(value: string): string {
  return value
    .replace(/<[^>]*>/gu, "")
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .trim();
}

/** 搜尋結果中詞目與 word 完全相同的條目 ID（網站搜尋為模糊比對） */
export function parseSearchResults(html: string, word: string): string[] {
  const ids: string[] = [];
  for (const row of html.matchAll(/<tr data-link='dictView\.jsp\?ID=(\d+)[^']*'[^>]*>(.*?)<\/tr>/gsu)) {
    const cells = [...row[2]!.matchAll(/<td[^>]*>(.*?)<\/td>/gsu)].map((cell) => stripTags(cell[1]!));
    if (cells[1] === word) ids.push(row[1]!);
  }
  return ids;
}

/** 條目頁標題形如「<部署> 辭典檢視」或「< 部署 :  ㄅㄨˋ ㄕㄨˋ >辭典檢視」 */
export function parseViewHeadword(html: string): string | null {
  const title = /<title>&lt;\s*([^:&]+?)\s*(?::[^&]*)?&gt;/u.exec(html);
  return title ? title[1]! : null;
}

/**
 * 簡編本的條目頁沒有 session 時是空白頁，使用者直接開啟會看到空白；
 * 改連搜尋頁，由網站設定 session 後自行轉址（單筆）或列出結果（多筆）
 */
function entryLink(dictionary: MoeDictionary, viewUrl: string, searchUrl: string): string {
  return dictionary === "concised" ? searchUrl : viewUrl;
}

async function lookup(dictionary: MoeDictionary, word: string): Promise<string | null> {
  const base = MOE_DICTIONARIES[dictionary];
  const searchUrl = `${base}/search.jsp?md=1&word=${encodeURIComponent(word)}`;
  const response = await fetch(searchUrl, {
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  // 只有一筆結果時網站直接轉址到條目頁，需確認該條目確實是這個詞
  const location = response.headers.get("location");
  if (response.status >= 300 && response.status < 400 && location) {
    const viewUrl = new URL(location, `${base}/`).toString();
    if (!new URL(viewUrl).pathname.endsWith("/dictView.jsp")) return null;
    // 簡編本條目頁需要搜尋時取得的 session cookie，否則回傳空白頁
    const cookie = response.headers.get("set-cookie")?.split(";")[0];
    const view = await fetch(viewUrl, {
      headers: cookie ? { cookie } : {},
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const html = view.ok ? await view.text() : "";
    if (!html) throw new Error(`Empty entry page (HTTP ${view.status})`);
    return parseViewHeadword(html) === word ? entryLink(dictionary, viewUrl, searchUrl) : null;
  }

  if (!response.ok) return null;
  const ids = parseSearchResults(await response.text(), word);
  if (ids.length === 0) return null;
  return ids.length === 1
    ? entryLink(dictionary, `${base}/dictView.jsp?ID=${ids[0]}`, searchUrl)
    : searchUrl;
}

/** complete 為 false 表示有辭典查詢失敗，結果不應被快取 */
export async function findDictionaryLinks(
  word: string,
): Promise<{ links: DictionaryLinks; complete: boolean }> {
  const [revised, concised] = await Promise.all(
    (Object.keys(MOE_DICTIONARIES) as MoeDictionary[]).map((dictionary) =>
      lookup(dictionary, word).catch((error) => {
        console.warn("MOE dictionary lookup failed", {
          dictionary,
          message: error instanceof Error ? error.message : String(error),
        });
        return undefined;
      }),
    ),
  );
  return {
    links: { revised: revised ?? null, concised: concised ?? null },
    complete: revised !== undefined && concised !== undefined,
  };
}
