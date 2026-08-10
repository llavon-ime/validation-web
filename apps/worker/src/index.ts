import {
  CONTRIBUTION_AGREEMENT_VERSION,
  DATASET_LICENSE,
  SubmissionDraftSchema,
  normalizeDraft,
  type AgreementAcceptance,
  type SessionResponse,
  type SessionUser,
  type StoredValidationSample,
} from "@llavon/schema";
import { isReadingForCharacter } from "@llavon/zhuyin";
import { parseCookies, serializeCookie } from "./cookies";
import {
  randomBase64Url,
  sha256,
  signPayload,
  verifyPayload,
  base64UrlEncodeBytes,
} from "./crypto";
import {
  commitValidationSample,
  exchangeOAuthCode,
  fetchGitHubUser,
  githubLoginConfigured,
} from "./github";
import type { Env } from "./types";

const SESSION_COOKIE = "llavon_session";
const OAUTH_COOKIE = "llavon_oauth";
const AGREEMENT_COOKIE = "llavon_agreement";
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const OAUTH_SECONDS = 10 * 60;
const AGREEMENT_SECONDS = 60 * 60 * 24 * 365;
const MAX_REQUEST_BYTES = 32 * 1024;

interface SessionPayload {
  version: 1;
  user: SessionUser;
  expiresAt: number;
}

interface OAuthPayload {
  state: string;
  verifier: string;
  returnTo: string;
  expiresAt: number;
}

interface AgreementCookiePayload extends AgreementAcceptance {
  githubId: number;
  expiresAt: number;
}

function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function publicOrigin(request: Request, env: Env): string {
  return (env.PUBLIC_ORIGIN ?? new URL(request.url).origin).replace(/\/$/u, "");
}

function callbackUrl(request: Request, env: Env): string {
  return `${publicOrigin(request, env)}/api/auth/callback`;
}

function safeReturnTo(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function developmentUser(env: Env): SessionUser | null {
  if (env.ENVIRONMENT !== "development" || env.DEV_AUTH_BYPASS !== "true") return null;
  return {
    githubId: 1,
    githubLogin: "local-developer",
    avatarUrl: "https://github.com/identicons/local-developer.png",
    profileUrl: "https://github.com/llavon-ime",
  };
}

async function getSessionUser(request: Request, env: Env): Promise<SessionUser | null> {
  const devUser = developmentUser(env);
  if (devUser) return devUser;
  if (!env.SESSION_SECRET) return null;
  const payload = await verifyPayload<SessionPayload>(
    parseCookies(request).get(SESSION_COOKIE),
    env.SESSION_SECRET,
  );
  if (!payload || payload.version !== 1 || payload.expiresAt <= Date.now()) return null;
  return payload.user;
}

async function getAgreementAcceptance(
  request: Request,
  env: Env,
  user: SessionUser | null,
): Promise<AgreementAcceptance | null> {
  if (!user || !env.SESSION_SECRET) return null;
  const payload = await verifyPayload<AgreementCookiePayload>(
    parseCookies(request).get(AGREEMENT_COOKIE),
    env.SESSION_SECRET,
  );
  if (
    !payload ||
    payload.version !== CONTRIBUTION_AGREEMENT_VERSION ||
    payload.githubId !== user.githubId ||
    payload.expiresAt <= Date.now() ||
    !Number.isFinite(Date.parse(payload.acceptedAt))
  ) {
    return null;
  }
  return { version: payload.version, acceptedAt: payload.acceptedAt };
}

function assertSameOrigin(request: Request, env: Env): Response | null {
  const origin = request.headers.get("Origin");
  if (origin !== publicOrigin(request, env)) {
    return json({ error: "拒絕跨站請求" }, { status: 403 });
  }
  return null;
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  const requestUrl = new URL(request.url);
  const returnTo = safeReturnTo(requestUrl.searchParams.get("returnTo"));
  if (developmentUser(env)) return Response.redirect(`${publicOrigin(request, env)}${returnTo}`, 302);
  if (!githubLoginConfigured(env)) {
    return json({ error: "GitHub App 尚未設定" }, { status: 503 });
  }

  const state = randomBase64Url(24);
  const verifier = randomBase64Url(48);
  const challenge = base64UrlEncodeBytes(await sha256(verifier));
  const oauthPayload: OAuthPayload = {
    state,
    verifier,
    returnTo,
    expiresAt: Date.now() + OAUTH_SECONDS * 1000,
  };
  const signed = await signPayload(oauthPayload, env.SESSION_SECRET!);
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", env.GITHUB_CLIENT_ID!);
  authorize.searchParams.set("redirect_uri", callbackUrl(request, env));
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      "Set-Cookie": serializeCookie(request, OAUTH_COOKIE, signed, {
        maxAge: OAUTH_SECONDS,
        path: "/api/auth",
      }),
      "Cache-Control": "no-store",
    },
  });
}

async function handleCallback(request: Request, env: Env): Promise<Response> {
  if (!githubLoginConfigured(env)) return json({ error: "GitHub App 尚未設定" }, { status: 503 });
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauth = await verifyPayload<OAuthPayload>(
    parseCookies(request).get(OAUTH_COOKIE),
    env.SESSION_SECRET!,
  );
  if (!code || !state || !oauth || oauth.expiresAt <= Date.now() || oauth.state !== state) {
    return json({ error: "GitHub 登入狀態已失效，請重新登入" }, { status: 400 });
  }

  try {
    const token = await exchangeOAuthCode(
      env,
      code,
      oauth.verifier,
      callbackUrl(request, env),
    );
    const user = await fetchGitHubUser(token);
    const session = await signPayload(
      { version: 1, user, expiresAt: Date.now() + SESSION_SECONDS * 1000 } satisfies SessionPayload,
      env.SESSION_SECRET!,
    );
    const headers = new Headers({
      Location: `${publicOrigin(request, env)}${safeReturnTo(oauth.returnTo)}`,
      "Cache-Control": "no-store",
    });
    headers.append(
      "Set-Cookie",
      serializeCookie(request, SESSION_COOKIE, session, {
        maxAge: SESSION_SECONDS,
        path: "/",
      }),
    );
    headers.append(
      "Set-Cookie",
      serializeCookie(request, OAUTH_COOKIE, "", {
        maxAge: 0,
        path: "/api/auth",
      }),
    );
    return new Response(null, { status: 302, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub 登入失敗";
    return json({ error: message }, { status: 502 });
  }
}

async function handleSession(request: Request, env: Env): Promise<Response> {
  const user = await getSessionUser(request, env);
  const acceptance = await getAgreementAcceptance(request, env, user);
  const body: SessionResponse = {
    user,
    githubConfigured: githubLoginConfigured(env) || developmentUser(env) !== null,
    agreement: {
      requiredVersion: CONTRIBUTION_AGREEMENT_VERSION,
      acceptedAt: acceptance?.acceptedAt ?? null,
    },
  };
  return json(body);
}

async function handleAgreement(request: Request, env: Env): Promise<Response> {
  const rejected = assertSameOrigin(request, env);
  if (rejected) return rejected;
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "請先使用 GitHub 登入" }, { status: 401 });
  if (!env.SESSION_SECRET) return json({ error: "Session secret 尚未設定" }, { status: 503 });

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return json({ error: "JSON 格式不正確" }, { status: 400 });
  }
  if (
    typeof input !== "object" ||
    input === null ||
    !("accepted" in input) ||
    input.accepted !== true ||
    !("version" in input) ||
    input.version !== CONTRIBUTION_AGREEMENT_VERSION
  ) {
    return json({ error: "必須明確同意目前版本的貢獻條款" }, { status: 400 });
  }

  const acceptedAt = new Date().toISOString();
  const signed = await signPayload(
    {
      version: CONTRIBUTION_AGREEMENT_VERSION,
      acceptedAt,
      githubId: user.githubId,
      expiresAt: Date.now() + AGREEMENT_SECONDS * 1000,
    } satisfies AgreementCookiePayload,
    env.SESSION_SECRET,
  );
  return json(
    {
      agreement: {
        requiredVersion: CONTRIBUTION_AGREEMENT_VERSION,
        acceptedAt,
      },
    },
    {
      headers: {
        "Set-Cookie": serializeCookie(request, AGREEMENT_COOKIE, signed, {
          maxAge: AGREEMENT_SECONDS,
          path: "/",
        }),
      },
    },
  );
}

async function handleLogout(request: Request, env: Env): Promise<Response> {
  const rejected = assertSameOrigin(request, env);
  if (rejected) return rejected;
  return json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": serializeCookie(request, SESSION_COOKIE, "", {
          maxAge: 0,
          path: "/",
        }),
      },
    },
  );
}

async function handleSubmission(request: Request, env: Env): Promise<Response> {
  const rejected = assertSameOrigin(request, env);
  if (rejected) return rejected;
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "請先使用 GitHub 登入" }, { status: 401 });
  const agreement = await getAgreementAcceptance(request, env, user);
  if (!agreement) {
    return json({ error: "請先閱讀並同意驗證集貢獻條款" }, { status: 428 });
  }

  const declaredSize = Number(request.headers.get("Content-Length") ?? 0);
  if (declaredSize > MAX_REQUEST_BYTES) {
    return json({ error: "提交內容過大" }, { status: 413 });
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_REQUEST_BYTES) {
    return json({ error: "提交內容過大" }, { status: 413 });
  }

  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return json({ error: "JSON 格式不正確" }, { status: 400 });
  }
  const parsed = SubmissionDraftSchema.safeParse(input);
  if (!parsed.success) {
    return json(
      { error: parsed.error.issues[0]?.message ?? "提交欄位不正確" },
      { status: 400 },
    );
  }
  const draft = normalizeDraft(parsed.data);
  const answerCharacters = Array.from(draft.answer);
  const invalidIndex = draft.padding.findIndex(
    (reading, index) => !isReadingForCharacter(answerCharacters[index] ?? "", reading),
  );
  if (invalidIndex >= 0) {
    return json(
      { error: `第 ${invalidIndex + 1} 個字與注音不符合目前候選表` },
      { status: 400 },
    );
  }

  const sample: StoredValidationSample = {
    schemaVersion: 1,
    license: DATASET_LICENSE,
    id: draft.submissionId,
    context: draft.context,
    answer: draft.answer,
    padding: draft.padding,
    difficulty: draft.difficulty as 1 | 2 | 3 | 4 | 5,
  };
  const attribution = draft.creditAsCoauthor
    ? { githubId: user.githubId, githubLogin: user.githubLogin }
    : null;

  try {
    return json(await commitValidationSample(env, sample, attribution), { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "無法寫入資料集";
    console.error("submission commit failed", { id: sample.id, message });
    return json({ error: message }, { status: 502 });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/session" && request.method === "GET") {
      return handleSession(request, env);
    }
    if (url.pathname === "/api/auth/login" && request.method === "GET") {
      return handleLogin(request, env);
    }
    if (url.pathname === "/api/auth/callback" && request.method === "GET") {
      return handleCallback(request, env);
    }
    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      return handleLogout(request, env);
    }
    if (url.pathname === "/api/agreement" && request.method === "POST") {
      return handleAgreement(request, env);
    }
    if (url.pathname === "/api/submissions" && request.method === "POST") {
      return handleSubmission(request, env);
    }
    if (url.pathname.startsWith("/api/")) {
      return json({ error: "找不到 API" }, { status: 404 });
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
