import type { z } from "zod";
import { PronunciationRecordSchema, type PronunciationSample } from "./pronunciation";
import {
  StoredValidationSampleSchema,
  type StoredValidationSample,
} from "./schema";

export const MAX_DATASET_BYTES = 20 * 1024 * 1024;

function parseJsonl<T>(input: string, schema: z.ZodType<T>): T[] {
  if (new TextEncoder().encode(input).length > MAX_DATASET_BYTES) {
    throw new Error("資料集超過目前頁面可安全載入的大小");
  }

  const samples: T[] = [];
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

    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw new Error(
        `資料集第 ${index + 1} 行格式錯誤：${parsed.error.issues[0]?.message ?? "未知錯誤"}`,
      );
    }
    samples.push(parsed.data);
  }
  return samples;
}

export function parseValidationJsonl(input: string): StoredValidationSample[] {
  return parseJsonl(input, StoredValidationSampleSchema);
}

export function parsePronunciationJsonl(input: string): PronunciationSample[] {
  return parseJsonl(input, PronunciationRecordSchema);
}
