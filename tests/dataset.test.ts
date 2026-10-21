import { describe, expect, it } from "vitest";
import { parsePronunciationJsonl, parseValidationJsonl } from "../shared/utils/dataset.ts";

const row = {
  schemaVersion: 1,
  license: "CC-BY-4.0",
  context: "下班後我想去超市買",
  answer: "牛奶",
  padding: [
    { syllable: "ㄋㄧㄡ", tone: 2 },
    { syllable: "ㄋㄞ", tone: 3 },
  ],
  difficulty: 2,
};

describe("public dataset reader", () => {
  it("parses canonical JSONL and ignores the final empty line", () => {
    expect(parseValidationJsonl(`${JSON.stringify(row)}\n`)).toEqual([row]);
  });

  it("rejects invalid JSON instead of rendering an error response as data", () => {
    expect(() => parseValidationJsonl("<html>rate limited</html>")).toThrow(
      "第 1 行不是有效的 JSON",
    );
  });

  it("rejects rows that do not match the public dataset schema", () => {
    expect(() =>
      parseValidationJsonl(JSON.stringify({ ...row, difficulty: 9 })),
    ).toThrow("第 1 行格式錯誤");
  });

  it("reads stored pronunciation rows even when a reading is no longer in the candidate table", () => {
    const pronunciation = {
      schemaVersion: 1,
      license: "CC-BY-4.0",
      kind: "pronunciation",
      answer: "鉈",
      readings: [[{ syllable: "ㄊㄚ", tone: 3 }, { syllable: "ㄊㄨㄛ", tone: 2 }]],
      description: "",
    };
    expect(parsePronunciationJsonl(`${JSON.stringify(pronunciation)}
`)).toEqual([pronunciation]);
    expect(() =>
      parsePronunciationJsonl(JSON.stringify({ ...pronunciation, readings: [[{ syllable: "ㄊㄚ", tone: 1 }]] })),
    ).toThrow("第 1 行格式錯誤");
  });
});
