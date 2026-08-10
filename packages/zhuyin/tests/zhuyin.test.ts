import { describe, expect, it } from "vitest";
import { getReadingsForCharacter, isReadingForCharacter } from "../src/index.ts";

describe("bopomofo candidate map", () => {
  it("finds the expected reading for a common character", () => {
    expect(isReadingForCharacter("你", { syllable: "ㄋㄧ", tone: 3 })).toBe(true);
  });

  it("returns independent values to callers", () => {
    const first = getReadingsForCharacter("你");
    first.length = 0;
    expect(getReadingsForCharacter("你").length).toBeGreaterThan(0);
  });
});
