import {
  MAX_DATASET_BYTES,
  parseValidationJsonl,
} from "#shared/utils/dataset";
import type { StoredValidationSample } from "#shared/utils/schema";

export { parseValidationJsonl } from "#shared/utils/dataset";

export const DATASET_URL =
  "https://raw.githubusercontent.com/llavon-ime/validation-set/main/dataset/validation.jsonl";

const DATASET_CACHE = "llavon-validation-dataset-v1";

export interface DatasetSnapshot {
  samples: StoredValidationSample[];
  loadedAt: Date;
  source: "cache" | "network";
}

async function parseResponse(response: Response): Promise<StoredValidationSample[]> {
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

  return parseValidationJsonl(await response.text());
}

export async function readCachedDataset(): Promise<DatasetSnapshot | null> {
  if (!("caches" in globalThis)) return null;
  const response = await caches.match(DATASET_URL);
  if (!response) return null;

  try {
    return {
      samples: await parseResponse(response),
      loadedAt: new Date(),
      source: "cache",
    };
  } catch {
    const cache = await caches.open(DATASET_CACHE);
    await cache.delete(DATASET_URL);
    return null;
  }
}

export async function fetchDataset(): Promise<DatasetSnapshot> {
  const response = await fetch(DATASET_URL, {
    mode: "cors",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    cache: "no-cache",
  });
  const cacheCopy = response.clone();
  const samples = await parseResponse(response);

  if ("caches" in globalThis) {
    void caches
      .open(DATASET_CACHE)
      .then((cache) => cache.put(DATASET_URL, cacheCopy))
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
