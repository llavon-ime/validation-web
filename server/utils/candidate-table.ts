import { createError } from "h3";
import { loadCandidateTable } from "../../shared/utils/zhuyin";

export async function requireCandidateTable(): Promise<void> {
  try {
    await loadCandidateTable();
  } catch (error) {
    console.error("Bopomofo table load failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    throw createError({
      statusCode: 503,
      statusMessage: "暫時無法載入注音字表，請稍後再試",
    });
  }
}
