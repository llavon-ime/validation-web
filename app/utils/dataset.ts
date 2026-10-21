import {
  MAX_DATASET_BYTES,
  parsePronunciationJsonl,
  parseValidationJsonl,
} from "#shared/utils/dataset";

export { parseValidationJsonl } from "#shared/utils/dataset";

export interface DatasetSource<T> {
  url: string;
  cache: string;
  parse: (input: string) => T[];
}

export const VALIDATION_DATASET = {
  url: "https://raw.githubusercontent.com/llavon-ime/validation-set/main/dataset/validation.jsonl",
  cache: "llavon-validation-dataset-v1",
  parse: parseValidationJsonl,
};

export const PRONUNCIATION_DATASET = {
  url: "https://raw.githubusercontent.com/llavon-ime/validation-set/main/dataset/pronunciations.jsonl",
  cache: "llavon-pronunciation-dataset-v1",
  parse: parsePronunciationJsonl,
};

export interface DatasetSnapshot<T> {
  samples: T[];
  loadedAt: Date;
  source: "cache" | "network";
}

async function parseResponse<T>(source: DatasetSource<T>, response: Response): Promise<T[]> {
  // 檔案尚未建立（還沒有任何收錄）時視為空資料集
  if (response.status === 404) return [];
  if (!response.ok) {
    throw new Error(`GitHub raw 回傳 HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("text/plain")) {
    throw new Error("GitHub raw 回傳了非預期的內容格式");
  }

  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_DATASET_BYTES) {
    throw new Error("資料集超過目前頁面可安全載入的大小");
  }

  return source.parse(await response.text());
}

export async function readCachedDataset<T>(
  source: DatasetSource<T>,
): Promise<DatasetSnapshot<T> | null> {
  if (!("caches" in globalThis)) return null;
  const response = await caches.match(source.url);
  if (!response) return null;

  try {
    return {
      samples: await parseResponse(source, response),
      loadedAt: new Date(),
      source: "cache",
    };
  } catch {
    const cache = await caches.open(source.cache);
    await cache.delete(source.url);
    return null;
  }
}

export async function fetchDataset<T>(source: DatasetSource<T>): Promise<DatasetSnapshot<T>> {
  const response = await fetch(source.url, {
    mode: "cors",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    cache: "no-cache",
  });
  const cacheCopy = response.clone();
  const samples = await parseResponse(source, response);

  if (response.ok && "caches" in globalThis) {
    void caches
      .open(source.cache)
      .then((cache) => cache.put(source.url, cacheCopy))
      .catch(() => {
        // A cache write failure must not delay or hide fresh network data.
      });
  }

  return {
    samples,
    loadedAt: new Date(),
    source: "network",
  };
}
