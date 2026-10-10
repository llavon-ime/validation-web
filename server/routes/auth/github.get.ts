import type { SessionUser } from "../../../shared/utils/schema";
import { getCookie, setCookie, deleteCookie, getQuery } from "h3";

function returnPath(event: Parameters<typeof getCookie>[0]) {
  const path = getCookie(event, "llavon-login-return") === "/pronunciations" ? "/pronunciations" : "/";
  deleteCookie(event, "llavon-login-return", { path: "/" });
  return path;
}

const handler = defineOAuthGitHubEventHandler({
  config: {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  },
  async onSuccess(event, { user }) {
    const sessionUser: SessionUser = {
      githubId: user.id,
      githubLogin: user.login,
      avatarUrl: user.avatar_url,
      profileUrl: user.html_url,
    };
    await setUserSession(event, { user: sessionUser });
    return sendRedirect(event, returnPath(event));
  },
  onError(event, error) {
    console.error("GitHub OAuth failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return sendRedirect(event, `${returnPath(event)}?auth=failed`);
  },
});

export default defineEventHandler(event => {
  const query = getQuery(event);
  if (!query.code && !query.error) {
    setCookie(event, "llavon-login-return", query.returnTo === "/pronunciations" ? "/pronunciations" : "/", {
      httpOnly: true, sameSite: "lax", path: "/", maxAge: 600, secure: !import.meta.dev,
    });
  }
  return handler(event);
});
