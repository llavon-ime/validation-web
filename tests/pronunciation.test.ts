import { describe, it, expect } from "vitest";
import { PronunciationDraftSchema, PronunciationSampleSchema, serializePronunciationSample } from "../shared/utils/pronunciation";
import { createPronunciationDispatch } from "../server/services/github";
import { createHash } from "node:crypto";
import { isReadingForCharacter } from "../shared/utils/zhuyin";

const sample = { schemaVersion: 1 as const, license: "CC-BY-4.0" as const, kind: "pronunciation" as const,
  answer: "部署", readings: [[{ syllable: "ㄅㄨ", tone: 4 }], [{ syllable: "ㄕㄨ", tone: 3 }, { syllable: "ㄕㄨ", tone: 4 }]], description: "" };
describe("manual pronunciation annotations", () => {
  it("accepts a blank explanation and rejects readings outside the candidate table", () => {
    const value = { ...sample, answer: "鉈", readings: [[{ syllable: "ㄊㄨㄛ", tone: 2 }, { syllable: "ㄕㄜ", tone: 2 }]] };
    expect(PronunciationSampleSchema.parse(value).description).toBe("");
    const unlisted = { ...value, readings: [[{ syllable: "ㄊㄚ", tone: 1 }, { syllable: "ㄊㄨㄛ", tone: 2 }]] };
    expect(isReadingForCharacter("鉈", unlisted.readings[0]![0]!)).toBe(false);
    expect(PronunciationSampleSchema.safeParse(unlisted).success).toBe(false);
  });
  it("rejects duplicate readings, incorrect alignment, and unmarked single-reading samples", () => {
    expect(PronunciationSampleSchema.safeParse({ ...sample, readings: [sample.readings[0]] }).success).toBe(false);
    expect(PronunciationSampleSchema.safeParse({ ...sample, readings: [sample.readings[0], [sample.readings[1]![0], sample.readings[1]![0]]] }).success).toBe(false);
    expect(PronunciationSampleSchema.safeParse({ ...sample, readings: [sample.readings[0], [sample.readings[1]![0]]] }).success).toBe(false);
  });
  it("counts astral Han as a single character and rejects invalid Unicode", () => {
    const messages = PronunciationSampleSchema.safeParse({ ...sample, answer: "𠮷署" }).error?.issues.map(i => i.message);
    expect(messages).not.toContain("讀音需與文字逐字對齊");
    expect(messages).toContain("第 1 個讀音不屬於對應的中文字");
    expect(PronunciationSampleSchema.safeParse({ ...sample, description: "\ud800" }).success).toBe(false);
    expect(PronunciationSampleSchema.safeParse({ ...sample, description: "e\u0301" }).success).toBe(false);
  });
  it("requires explicit training consent separately from public contribution consent", () => {
    const draft = { submissionId: "0262684d-61eb-4c2b-906f-62d168bcd021", sample, publicContributionConsent: true, trainingUseConsent: false, creditAsCoauthor: false };
    expect(PronunciationDraftSchema.safeParse(draft).success).toBe(false);
    expect(PronunciationDraftSchema.safeParse({ ...draft, trainingUseConsent: true }).success).toBe(true);
  });
  it("canonicalizes reading order, preserves explanation and builds the separate dispatch event", async () => {
    const value = { ...sample, description: "口語\n署可四聲\u2028𠮷", readings: [sample.readings[0]!, [...sample.readings[1]!].reverse()] };
    const serialized = serializePronunciationSample(value);
    expect(serialized).toBe(serializePronunciationSample({ ...value, readings: sample.readings }));
    expect(serialized).toContain("\\u2028");
    const dispatch = await createPronunciationDispatch("0262684d-61eb-4c2b-906f-62d168bcd021", value, null);
    expect(dispatch.event_type).toBe("append-pronunciation-sample");
    expect(dispatch.client_payload.payloadSha256).toBe(createHash("sha256").update(serialized).digest("hex"));
    expect(dispatch.client_payload.sample.description).toBe(value.description);
    expect(dispatch.client_payload.attribution).toBeNull();
  });
});
