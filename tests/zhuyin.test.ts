import { describe, expect, it } from "vitest";
import { getReadingsForCharacter, isReadingForCharacter } from "../shared/utils/zhuyin.ts";

describe("bopomofo candidate map", () => {
  it("finds the expected reading for a common character", () => {
    expect(isReadingForCharacter("你", { syllable: "ㄋㄧ", tone: 3 })).toBe(true);
  });

  it("returns independent values to callers", () => {
    const first = getReadingsForCharacter("你");
    first.length = 0;
    expect(getReadingsForCharacter("你").length).toBeGreaterThan(0);
  });

  it("uses each English letter as its own annotation", () => {
    expect(getReadingsForCharacter("A")).toEqual([{ syllable: "A", tone: 1 }]);
    expect(isReadingForCharacter("A", { syllable: "A", tone: 1 })).toBe(true);
    expect(isReadingForCharacter("A", { syllable: "a", tone: 1 })).toBe(false);
    expect(isReadingForCharacter("A", { syllable: "A", tone: 2 })).toBe(false);
  });
});
