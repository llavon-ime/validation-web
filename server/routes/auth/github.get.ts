import type { SessionUser } from "../../../shared/utils/schema";

export default defineOAuthGitHubEventHandler({
  async onSuccess(event, { user }) {
    const sessionUser: SessionUser = {
      githubId: user.id,
      githubLogin: user.login,
      avatarUrl: user.avatar_url,
      profileUrl: user.html_url,
    };
    await setUserSession(event, { user: sessionUser });
    return sendRedirect(event, "/");
  },
  onError(event, error) {
    console.error("GitHub OAuth failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return sendRedirect(event, "/?auth=failed");
  },
});
