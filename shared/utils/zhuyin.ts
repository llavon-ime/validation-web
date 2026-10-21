import { isEnglishLetter, type PaddingUnit } from "./schema";
// 字表唯一來源：ime-core submodule，更新請 bump submodule
import candidateTable from "../../vendor/ime-core/table/bopomofo_char.json";

const toneByMark: Record<string, PaddingUnit["tone"]> = {
  " ": 1,
  "ˊ": 2,
  "ˇ": 3,
  "ˋ": 4,
  "˙": 5,
};

let inverseTable: Map<string, PaddingUnit[]> | undefined;

function parseReading(value: string): PaddingUnit | null {
  const toneMark = value.at(-1);
  if (!toneMark || !(toneMark in toneByMark)) return null;
  return {
    syllable: value.slice(0, -1),
    tone: toneByMark[toneMark]!,
  };
}

function readingKey(reading: PaddingUnit): string {
  return `${reading.syllable}:${reading.tone}`;
}

function getInverseTable(): Map<string, PaddingUnit[]> {
  if (inverseTable) return inverseTable;

  inverseTable = new Map();
  for (const [rawReading, candidates] of Object.entries(
    candidateTable as Record<string, string[]>,
  )) {
    const reading = parseReading(rawReading);
    if (!reading) continue;

    for (const candidate of candidates) {
      const existing = inverseTable.get(candidate) ?? [];
      if (!existing.some((item) => readingKey(item) === readingKey(reading))) {
        existing.push(reading);
        inverseTable.set(candidate, existing);
      }
    }
  }

  for (const readings of inverseTable.values()) {
    readings.sort((left, right) =>
      left.syllable.localeCompare(right.syllable, "zh-Hant") || left.tone - right.tone,
    );
  }

  return inverseTable;
}

export function getReadingsForCharacter(character: string): PaddingUnit[] {
  if (isEnglishLetter(character)) {
    return [{ syllable: character, tone: 1 }];
  }
  return (getInverseTable().get(character) ?? []).map((reading) => ({ ...reading }));
}

export function isReadingForCharacter(
  character: string,
  reading: PaddingUnit,
): boolean {
  const expected = readingKey(reading);
  return getReadingsForCharacter(character).some(
    (candidate) => readingKey(candidate) === expected,
  );
}
