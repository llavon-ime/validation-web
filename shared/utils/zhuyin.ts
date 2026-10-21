import { isEnglishLetter, type PaddingUnit } from "./schema";

export const BOPOMOFO_TABLE_URL =
  "https://raw.githubusercontent.com/llavon-ime/ime-core/main/table/bopomofo_char.json";
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

const toneByMark: Record<string, PaddingUnit["tone"]> = {
  " ": 1,
  "ˊ": 2,
  "ˇ": 3,
  "ˋ": 4,
  "˙": 5,
};

let inverseTable: Map<string, PaddingUnit[]> | undefined;
let loadedAt = 0;
let pending: Promise<void> | undefined;

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

function buildInverseTable(candidateTable: unknown): Map<string, PaddingUnit[]> {
  if (!candidateTable || typeof candidateTable !== "object" || Array.isArray(candidateTable)) {
    throw new Error("注音字表格式錯誤");
  }

  const table = new Map<string, PaddingUnit[]>();
  for (const [rawReading, candidates] of Object.entries(candidateTable)) {
    const reading = parseReading(rawReading);
    if (!reading || !Array.isArray(candidates)) continue;

    for (const candidate of candidates) {
      if (typeof candidate !== "string") continue;
      const existing = table.get(candidate) ?? [];
      if (!existing.some((item) => readingKey(item) === readingKey(reading))) {
        existing.push(reading);
        table.set(candidate, existing);
      }
    }
  }
  if (table.size === 0) throw new Error("注音字表是空的");

  for (const readings of table.values()) {
    readings.sort((left, right) =>
      left.syllable.localeCompare(right.syllable, "zh-Hant") || left.tone - right.tone,
    );
  }

  return table;
}

export function setCandidateTable(candidateTable: unknown): void {
  inverseTable = buildInverseTable(candidateTable);
  loadedAt = Date.now();
}

async function fetchCandidateTable(): Promise<void> {
  const response = await fetch(BOPOMOFO_TABLE_URL, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`無法載入注音字表（HTTP ${response.status}）`);
  }
  setCandidateTable(await response.json());
}

export function loadCandidateTable(): Promise<void> {
  if (inverseTable && Date.now() - loadedAt < REFRESH_INTERVAL_MS) {
    return Promise.resolve();
  }
  pending ??= fetchCandidateTable().finally(() => {
    pending = undefined;
  });
  if (!inverseTable) return pending;

  pending.catch((error) => {
    console.warn("Bopomofo table refresh failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  });
  return Promise.resolve();
}

export function isCandidateTableLoaded(): boolean {
  return inverseTable !== undefined;
}

export function getReadingsForCharacter(character: string): PaddingUnit[] {
  if (isEnglishLetter(character)) {
    return [{ syllable: character, tone: 1 }];
  }
  return (inverseTable?.get(character) ?? []).map((reading) => ({ ...reading }));
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
