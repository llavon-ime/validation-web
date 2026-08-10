import { z } from "zod";

export const LIMITS = {
  context: 500,
  answer: 32,
  padding: 32,
} as const;

export const DIFFICULTY_LEVELS = [1, 2, 3, 4, 5] as const;
export type Difficulty = (typeof DIFFICULTY_LEVELS)[number];
export const CONTRIBUTION_AGREEMENT_VERSION = "2.0";
export const DATASET_LICENSE = "CC-BY-4.0" as const;

export const TONE_MARKS = {
  1: " ",
  2: "ˊ",
  3: "ˇ",
  4: "ˋ",
  5: "˙",
} as const satisfies Record<Difficulty, string>;

export const DISPLAY_TONE_MARKS = {
  1: "ˉ",
  2: "ˊ",
  3: "ˇ",
  4: "ˋ",
  5: "˙",
} as const satisfies Record<Difficulty, string>;

const INITIALS = "ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙ";
const MEDIALS = "ㄧㄨㄩ";
const FINALS = "ㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦ";
const syllablePattern = new RegExp(
  `^[${INITIALS}]?[${MEDIALS}]?[${FINALS}]?$`,
  "u",
);

export function isUnicodeScalarString(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      if (index + 1 >= value.length) return false;
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function validText(maxCodePoints: number, requiredMessage: string) {
  return z
    .string()
    .min(1, requiredMessage)
    .refine(isUnicodeScalarString, "文字包含無效的 Unicode")
    .refine((value) => Array.from(value).length <= maxCodePoints, `最多 ${maxCodePoints} 個字元`);
}

export const PaddingUnitSchema = z.object({
  syllable: z
    .string()
    .min(1, "請選擇注音")
    .max(3)
    .refine(isUnicodeScalarString, "注音包含無效的 Unicode")
    .refine((value) => syllablePattern.test(value), "注音格式不正確"),
  tone: z.number().int().min(1).max(5),
});

export const SubmissionDraftSchema = z
  .object({
    submissionId: z.uuid(),
    context: validText(LIMITS.context, "請輸入前文"),
    answer: validText(LIMITS.answer, "請輸入正確答案"),
    padding: z.array(PaddingUnitSchema).min(1).max(LIMITS.padding),
    difficulty: z.number().int().min(1).max(5),
    publicContributionConsent: z.literal(true),
    validationUseConsent: z.literal(true),
    creditAsCoauthor: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (Array.from(value.answer.normalize("NFC")).length !== value.padding.length) {
      ctx.addIssue({
        code: "custom",
        path: ["padding"],
        message: "每個答案字都必須對應一個注音",
      });
    }
  });

export type PaddingUnit = z.infer<typeof PaddingUnitSchema>;
export type SubmissionDraft = z.infer<typeof SubmissionDraftSchema>;

export interface GitHubIdentity {
  githubId: number;
  githubLogin: string;
}

export interface AgreementAcceptance {
  version: string;
  acceptedAt: string;
}

export interface StoredValidationSample {
  schemaVersion: 1;
  license: typeof DATASET_LICENSE;
  context: string;
  answer: string;
  padding: PaddingUnit[];
  difficulty: Difficulty;
}

export interface SessionUser extends GitHubIdentity {
  avatarUrl: string;
  profileUrl: string;
}

export interface AgreementStatus {
  requiredVersion: string;
  acceptedAt: string | null;
}

export interface AgreementResponse {
  agreement: AgreementStatus;
}

export interface SubmissionResponse {
  id: string;
  queued: true;
  attributed: boolean;
}

export function canonicalizeValidationSample(
  sample: StoredValidationSample,
): StoredValidationSample {
  return {
    schemaVersion: sample.schemaVersion,
    license: sample.license,
    context: sample.context,
    answer: sample.answer,
    padding: sample.padding.map(({ syllable, tone }) => ({ syllable, tone })),
    difficulty: sample.difficulty,
  };
}

export function serializeValidationSample(sample: StoredValidationSample): string {
  return JSON.stringify(canonicalizeValidationSample(sample))
    .replace(/\u2028/gu, "\\u2028")
    .replace(/\u2029/gu, "\\u2029");
}

export function normalizeDraft(draft: SubmissionDraft): SubmissionDraft {
  return {
    ...draft,
    context: draft.context.normalize("NFC"),
    answer: draft.answer.normalize("NFC"),
    padding: draft.padding.map((unit) => ({
      syllable: unit.syllable.normalize("NFC"),
      tone: unit.tone,
    })),
  };
}

export function toModelBopomofo(unit: PaddingUnit): string {
  return `${unit.syllable}${TONE_MARKS[unit.tone as Difficulty]}`;
}

export function displayBopomofo(unit: PaddingUnit): string {
  return `${unit.syllable}${DISPLAY_TONE_MARKS[unit.tone as Difficulty]}`;
}
