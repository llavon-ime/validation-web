import type { H3Event } from "h3";
import type { SessionUser, SubmissionResponse } from "../../shared/utils/schema";

/** NUXT_REQUIRE_GITHUB_LOGIN=false：本地測試用，登入改為本地測試帳號，投稿不會實際提交 */
export function isLoginRequired(event: H3Event): boolean {
  return useRuntimeConfig(event).requireGithubLogin !== false;
}

export const LOCAL_TEST_USER: SessionUser = {
  githubId: 0,
  githubLogin: "local-tester",
  avatarUrl: "/llavon-logo.png",
  profileUrl: "https://github.com/llavon-ime",
};

export function dryRunResponse(
  submissionId: string,
  sample: unknown,
  attribution: unknown,
): SubmissionResponse {
  console.info("GitHub login disabled; submission not dispatched", {
    id: submissionId,
    sample,
    attribution,
  });
  return { id: submissionId, queued: true, attributed: attribution !== null };
}
