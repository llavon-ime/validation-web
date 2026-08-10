import { createError, getHeader, readRawBody, setResponseStatus } from "h3";
import {
  DATASET_LICENSE,
  SubmissionDraftSchema,
  normalizeDraft,
  type Difficulty,
  type StoredValidationSample,
} from "../../shared/utils/schema";
import { isReadingForCharacter } from "../../shared/utils/zhuyin";
import { getAgreementAcceptance } from "../services/agreement";
import { dispatchValidationSample } from "../services/github";
import { assertSameOrigin } from "../utils/security";

const MAX_REQUEST_BYTES = 16 * 1024;

export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  const { user } = await requireUserSession(event, {
    message: "請先使用 GitHub 登入",
  });
  const agreement = await getAgreementAcceptance(event);
  if (!agreement) {
    throw createError({
      statusCode: 428,
      statusMessage: "請先閱讀並接受貢獻同意書",
    });
  }

  const declaredSize = Number(getHeader(event, "content-length") ?? 0);
  if (declaredSize > MAX_REQUEST_BYTES) {
    throw createError({ statusCode: 413, statusMessage: "投稿內容過大" });
  }
  const raw = (await readRawBody(event, "utf-8")) ?? "";
  if (new TextEncoder().encode(raw).length > MAX_REQUEST_BYTES) {
    throw createError({ statusCode: 413, statusMessage: "投稿內容過大" });
  }

  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    throw createError({ statusCode: 400, statusMessage: "JSON 格式錯誤" });
  }
  const parsed = SubmissionDraftSchema.safeParse(input);
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? "投稿欄位格式錯誤",
    });
  }

  const draft = normalizeDraft(parsed.data);
  const answerCharacters = Array.from(draft.answer);
  const invalidIndex = draft.padding.findIndex(
    (reading, index) =>
      !isReadingForCharacter(answerCharacters[index] ?? "", reading),
  );
  if (invalidIndex >= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: `第 ${invalidIndex + 1} 個注音不屬於對應的中文字`,
    });
  }

  const sample: StoredValidationSample = {
    schemaVersion: 1,
    license: DATASET_LICENSE,
    context: draft.context,
    answer: draft.answer,
    padding: draft.padding,
    difficulty: draft.difficulty as Difficulty,
  };
  const attribution = draft.creditAsCoauthor
    ? { githubId: user.githubId, githubLogin: user.githubLogin }
    : null;
  try {
    const result = await dispatchValidationSample(
      draft.submissionId,
      sample,
      attribution,
    );
    setResponseStatus(event, 202);
    return result;
  } catch (error) {
    console.error("Submission dispatch failed", {
      id: draft.submissionId,
      message: error instanceof Error ? error.message : String(error),
    });
    throw createError({
      statusCode: 502,
      statusMessage: "GitHub 暫時無法接收投稿",
    });
  }
});
