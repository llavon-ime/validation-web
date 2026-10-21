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
    const view = await fetch(viewUrl, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!view.ok) return null;
    return parseViewHeadword(await view.text()) === word ? viewUrl : null;
  }

  if (!response.ok) return null;
  const ids = parseSearchResults(await response.text(), word);
  if (ids.length === 0) return null;
  return ids.length === 1 ? `${base}/dictView.jsp?ID=${ids[0]}` : searchUrl;
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
