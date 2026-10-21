export const MOE_DICTIONARIES = {
  revised: "https://dict.revised.moe.edu.tw",
  concised: "https://dict.concised.moe.edu.tw",
} as const;

export type MoeDictionary = keyof typeof MOE_DICTIONARIES;

/** 各辭典中與輸入完全相同之條目的連結；沒有對應條目時為 null */
export type DictionaryLinks = Record<MoeDictionary, string | null>;
