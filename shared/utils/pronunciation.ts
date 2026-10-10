import { z } from "zod";
import { DATASET_LICENSE, LIMITS, PaddingUnitSchema, isUnicodeScalarString } from "./schema";

export const PRONUNCIATION_LIMITS = { answer: LIMITS.answer, description: 1000, alternatives: 8 } as const;
const text = (max: number, min = 0) => z.string()
  .refine(isUnicodeScalarString, "文字包含無效的 Unicode")
  .refine(v => v.normalize("NFC") === v, "文字必須使用 NFC")
  .refine(v => Array.from(v).length >= min && Array.from(v).length <= max, `字數必須介於 ${min}–${max}`);

const reading = PaddingUnitSchema.refine(v => /^[ㄅ-ㄩ]+$/u.test(v.syllable), "請填寫注音");
export const PronunciationSampleSchema = z.object({
  schemaVersion: z.literal(1),
  license: z.literal(DATASET_LICENSE),
  kind: z.literal("pronunciation"),
  answer: text(LIMITS.answer, 1).refine(v => /^\p{Script=Han}+$/u.test(v), "標註文字請使用漢字；其他內容可放在說明"),
  readings: z.array(z.array(reading).min(1, "每個字至少選一個讀音").max(PRONUNCIATION_LIMITS.alternatives)).min(1).max(LIMITS.answer),
  description: text(PRONUNCIATION_LIMITS.description),
}).strict().superRefine((v, ctx) => {
  if (Array.from(v.answer).length !== v.readings.length) ctx.addIssue({ code: "custom", path: ["readings"], message: "讀音需與文字逐字對齊" });
  if (!v.readings.some(rs => rs.length > 1)) ctx.addIssue({ code: "custom", path: ["readings"], message: "至少一個字須標註兩種可接受讀音" });
  v.readings.forEach((rs, i) => {
    if (new Set(rs.map(r => `${r.syllable}:${r.tone}`)).size !== rs.length) ctx.addIssue({ code: "custom", path: ["readings", i], message: "同一字的讀音不可重複" });
  });
});
export const PronunciationDraftSchema = z.object({
  submissionId: z.uuid(),
  sample: PronunciationSampleSchema,
  publicContributionConsent: z.literal(true),
  trainingUseConsent: z.literal(true),
  creditAsCoauthor: z.boolean(),
}).strict();
export type PronunciationSample = z.infer<typeof PronunciationSampleSchema>;
export type PronunciationDraft = z.infer<typeof PronunciationDraftSchema>;

export function canonicalizePronunciationSample(value: PronunciationSample): PronunciationSample {
  const v = PronunciationSampleSchema.parse(value);
  return { schemaVersion: 1, license: DATASET_LICENSE, kind: "pronunciation",
    answer: v.answer,
    readings: v.readings.map(rs => rs.map(r => ({ syllable: r.syllable, tone: r.tone }))
      .sort((a, b) => a.syllable < b.syllable ? -1 : a.syllable > b.syllable ? 1 : a.tone - b.tone)),
    description: v.description };
}
export function serializePronunciationSample(value: PronunciationSample): string {
  return JSON.stringify(canonicalizePronunciationSample(value)).replace(/\u2028/gu, "\\u2028").replace(/\u2029/gu, "\\u2029");
}
