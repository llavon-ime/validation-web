import {
  StoredValidationSampleSchema,
  type StoredValidationSample,
} from "./schema";

export const MAX_DATASET_BYTES = 20 * 1024 * 1024;

export function parseValidationJsonl(input: string): StoredValidationSample[] {
  if (new TextEncoder().encode(input).length > MAX_DATASET_BYTES) {
    throw new Error("資料集超過目前頁面可安全載入的大小");
  }

  const samples: StoredValidationSample[] = [];
  const lines = input.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    if (!line) continue;

    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error(`資料集第 ${index + 1} 行不是有效的 JSON`);
    }

    const parsed = StoredValidationSampleSchema.safeParse(value);
    if (!parsed.success) {
      throw new Error(
        `資料集第 ${index + 1} 行格式錯誤：${parsed.error.issues[0]?.message ?? "未知錯誤"}`,
      );
    }
    samples.push(parsed.data);
  }
  return samples;
}
