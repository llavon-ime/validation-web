import type { PaddingUnit } from "@llavon/schema";
import candidateTable from "./bopomofo-char.json";

export const BOPOMOFO_MAPPING_VERSION =
  "ime-windows-frontend:64cb9689f26e7e2a3e19378c0f42b71dd0d67f7c";

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

