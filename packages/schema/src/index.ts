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

export const PaddingUnitSchema = z.object({
  syllable: z
    .string()
    .min(1, "請選擇注音")
    .max(3)
    .refine((value) => syllablePattern.test(value), "注音格式不正確"),
  tone: z.number().int().min(1).max(5),
});

export const SubmissionDraftSchema = z
  .object({
    submissionId: z.uuid(),
    context: z.string().min(1, "請輸入前文").max(LIMITS.context),
    answer: z.string().min(1, "請輸入正確答案").max(LIMITS.answer),
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
  id: string;
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

export interface SessionResponse {
  user: SessionUser | null;
  githubConfigured: boolean;
  agreement: AgreementStatus;
}

export interface AgreementResponse {
  agreement: AgreementStatus;
}

export interface SubmissionResponse {
  id: string;
  commitUrl: string;
  alreadyExists: boolean;
  attributed: boolean;
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
