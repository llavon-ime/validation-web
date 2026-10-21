import { createError, getHeader, readRawBody, setResponseStatus } from "h3";
import { PronunciationDraftSchema } from "../../shared/utils/pronunciation";
import { getAgreementAcceptance } from "../services/agreement";
import { dispatchPronunciationSample } from "../services/github";
import { dryRunResponse, isLoginRequired } from "../utils/login";
import { assertSameOrigin } from "../utils/security";

const MAX_REQUEST_BYTES = 32 * 1024;

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
  const parsed = PronunciationDraftSchema.safeParse(input);
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? "投稿欄位格式錯誤",
    });
  }

  const draft = parsed.data;
  const sample = draft.sample;
  const attribution = draft.creditAsCoauthor
    ? { githubId: user.githubId, githubLogin: user.githubLogin }
    : null;
  if (!isLoginRequired(event)) {
    setResponseStatus(event, 202);
    return dryRunResponse(draft.submissionId, sample, attribution);
  }
  try {
    const result = await dispatchPronunciationSample(
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
