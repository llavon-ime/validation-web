import { describe, expect, it } from "vitest";
import {
  CONTRIBUTION_AGREEMENT_VERSION,
  DATASET_LICENSE,
  SubmissionDraftSchema,
  displayBopomofo,
  serializeValidationSample,
  toModelBopomofo,
  type StoredValidationSample,
} from "../shared/utils/schema.ts";

const validDraft = {
  submissionId: "0262684d-61eb-4c2b-906f-62d168bcd021",
  context: "我想喝",
  answer: "水",
  padding: [{ syllable: "ㄕㄨㄟ", tone: 3 }],
  difficulty: 2,
  publicContributionConsent: true,
  validationUseConsent: true,
  creditAsCoauthor: true,
} as const;

describe("validation sample schema", () => {
  it("uses explicit versioned contribution and dataset terms", () => {
    expect(CONTRIBUTION_AGREEMENT_VERSION).toBe("2.0");
    expect(DATASET_LICENSE).toBe("CC-BY-4.0");
  });

  it("accepts a fully aligned sample", () => {
    expect(SubmissionDraftSchema.safeParse(validDraft).success).toBe(true);
  });

  it("rejects an answer and padding length mismatch", () => {
    const result = SubmissionDraftSchema.safeParse({
      ...validDraft,
      answer: "開水",
    });
    expect(result.success).toBe(false);
  });

  it("allows public contribution without GitHub co-author attribution", () => {
    expect(
      SubmissionDraftSchema.safeParse({
        ...validDraft,
        creditAsCoauthor: false,
      }).success,
    ).toBe(true);
  });

  it("requires consent to validation-set use and model-output limitations", () => {
    expect(
      SubmissionDraftSchema.safeParse({
        ...validDraft,
        validationUseConsent: false,
      }).success,
    ).toBe(false);
  });

  it("uses an invisible trailing space only for the model's first tone", () => {
    expect(toModelBopomofo({ syllable: "ㄊㄚ", tone: 1 })).toBe("ㄊㄚ ");
    expect(displayBopomofo({ syllable: "ㄊㄚ", tone: 1 })).toBe("ㄊㄚˉ");
  });

  it("serializes the exact canonical JSONL field order without an id", () => {
    const sample: StoredValidationSample = {
      schemaVersion: 1,
      license: DATASET_LICENSE,
      context: "他說\u2028今天喝",
      answer: "牛奶",
      padding: [
        { syllable: "ㄋㄧㄡ", tone: 2 },
        { syllable: "ㄋㄞ", tone: 3 },
      ],
      difficulty: 2,
    };
    expect(serializeValidationSample(sample)).toBe(
      '{"schemaVersion":1,"license":"CC-BY-4.0","context":"他說\\u2028今天喝","answer":"牛奶","padding":[{"syllable":"ㄋㄧㄡ","tone":2},{"syllable":"ㄋㄞ","tone":3}],"difficulty":2}',
    );
  });

  it("rejects lone UTF-16 surrogates before UTF-8 transport", () => {
    expect(
      SubmissionDraftSchema.safeParse({
        ...validDraft,
        context: `前文${String.fromCharCode(0xd800)}`,
      }).success,
    ).toBe(false);
  });
});
