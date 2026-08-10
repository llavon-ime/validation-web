import type {
  GitHubIdentity,
  SessionUser,
  StoredValidationSample,
  SubmissionResponse,
} from "@llavon/schema";
import {
  base64UrlEncodeBytes,
  base64UrlEncodeText,
  utf8ToBase64,
} from "./crypto";
import type { Env } from "./types";

const GITHUB_API = "https://api.github.com";
const GITHUB_API_VERSION = "2026-03-10";

interface GitHubUserResponse {
  id: number;
  login: string;
  avatar_url: string;
  html_url: string;
}

interface InstallationTokenResponse {
  token: string;
  expires_at: string;
}

interface ContentsResponse {
  html_url?: string;
  content?: string;
  commit?: { html_url?: string };
}

let cachedInstallationToken:
  | { token: string; expiresAt: number; installationId: string }
  | undefined;

function githubHeaders(token?: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    "User-Agent": "llavon-validation-web",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
  };
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing Worker environment variable: ${name}`);
  return value;
}

function pathEncode(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function derLength(length: number): Uint8Array {
  if (length < 0x80) return Uint8Array.of(length);
  const bytes: number[] = [];
  for (let remaining = length; remaining > 0; remaining >>= 8) {
    bytes.unshift(remaining & 0xff);
  }
  return Uint8Array.of(0x80 | bytes.length, ...bytes);
}

function derElement(tag: number, content: Uint8Array): Uint8Array {
  const length = derLength(content.length);
  const result = new Uint8Array(1 + length.length + content.length);
  result[0] = tag;
  result.set(length, 1);
  result.set(content, 1 + length.length);
  return result;
}

function concatenate(...values: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(values.reduce((total, value) => total + value.length, 0));
  let offset = 0;
  for (const value of values) {
    result.set(value, offset);
    offset += value.length;
  }
  return result;
}

function wrapPkcs1AsPkcs8(pkcs1: Uint8Array): Uint8Array {
  const version = Uint8Array.of(0x02, 0x01, 0x00);
  const rsaAlgorithmIdentifier = Uint8Array.of(
    0x30,
    0x0d,
    0x06,
    0x09,
    0x2a,
    0x86,
    0x48,
    0x86,
    0xf7,
    0x0d,
    0x01,
    0x01,
    0x01,
    0x05,
    0x00,
  );
  return derElement(
    0x30,
    concatenate(version, rsaAlgorithmIdentifier, derElement(0x04, pkcs1)),
  );
}

function decodePem(value: string): Uint8Array {
  const normalized = value.replaceAll("\\n", "\n");
  if (normalized.includes("-----BEGIN RSA PRIVATE KEY-----")) {
    const base64 = normalized
      .replace(/-----BEGIN RSA PRIVATE KEY-----/u, "")
      .replace(/-----END RSA PRIVATE KEY-----/u, "")
      .replace(/\s+/gu, "");
    return wrapPkcs1AsPkcs8(decodeBase64(base64));
  }
  const base64 = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/u, "")
    .replace(/-----END PRIVATE KEY-----/u, "")
    .replace(/\s+/gu, "");
  return decodeBase64(base64);
}

async function createAppJwt(env: Env): Promise<string> {
  const appId = required(env.GITHUB_APP_ID, "GITHUB_APP_ID");
  const privateKey = required(env.GITHUB_APP_PRIVATE_KEY, "GITHUB_APP_PRIVATE_KEY");
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncodeText(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64UrlEncodeText(
    JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }),
  );
  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    decodePem(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)),
  );
  return `${unsigned}.${base64UrlEncodeBytes(signature)}`;
}

async function getInstallationToken(env: Env): Promise<string> {
  const installationId = required(env.GITHUB_INSTALLATION_ID, "GITHUB_INSTALLATION_ID");
  if (
    cachedInstallationToken?.installationId === installationId &&
    cachedInstallationToken.expiresAt > Date.now() + 60_000
  ) {
    return cachedInstallationToken.token;
  }

  const response = await fetch(
    `${GITHUB_API}/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
    {
      method: "POST",
      headers: githubHeaders(await createAppJwt(env)),
    },
  );
  if (!response.ok) {
    throw new Error(`GitHub installation token request failed (${response.status})`);
  }
  const body = (await response.json()) as InstallationTokenResponse;
  cachedInstallationToken = {
    token: body.token,
    expiresAt: Date.parse(body.expires_at),
    installationId,
  };
  return body.token;
}

export function githubLoginConfigured(env: Env): boolean {
  return Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET && env.SESSION_SECRET);
}

export async function exchangeOAuthCode(
  env: Env,
  code: string,
  verifier: string,
  redirectUri: string,
): Promise<string> {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "llavon-validation-web",
    },
    body: JSON.stringify({
      client_id: required(env.GITHUB_CLIENT_ID, "GITHUB_CLIENT_ID"),
      client_secret: required(env.GITHUB_CLIENT_SECRET, "GITHUB_CLIENT_SECRET"),
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });
  const body = (await response.json()) as { access_token?: string; error_description?: string };
  if (!response.ok || !body.access_token) {
    throw new Error(body.error_description ?? "GitHub OAuth token exchange failed");
  }
  return body.access_token;
}

export async function fetchGitHubUser(token: string): Promise<SessionUser> {
  const response = await fetch(`${GITHUB_API}/user`, {
    headers: githubHeaders(token),
  });
  if (!response.ok) throw new Error("Unable to read the authenticated GitHub user");
  const body = (await response.json()) as GitHubUserResponse;
  if (!Number.isSafeInteger(body.id) || !/^[A-Za-z0-9-]+$/u.test(body.login)) {
    throw new Error("GitHub returned an invalid user identity");
  }
  return {
    githubId: body.id,
    githubLogin: body.login,
    avatarUrl: body.avatar_url,
    profileUrl: body.html_url,
  };
}

async function findExisting(
  env: Env,
  token: string,
  path: string,
  sample: StoredValidationSample,
  attributed: boolean,
): Promise<SubmissionResponse | null> {
  const owner = required(env.GITHUB_DATASET_OWNER, "GITHUB_DATASET_OWNER");
  const repo = required(env.GITHUB_DATASET_REPO, "GITHUB_DATASET_REPO");
  const branch = env.GITHUB_DATASET_BRANCH ?? "main";
  const response = await fetch(
    `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${pathEncode(path)}?ref=${encodeURIComponent(branch)}`,
    { headers: githubHeaders(token) },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Unable to check an existing dataset entry (${response.status})`);
  const body = (await response.json()) as ContentsResponse;
  if (!body.content) return null;
  try {
    const decoded = new TextDecoder().decode(
      Uint8Array.from(atob(body.content.replace(/\s+/gu, "")), (character) =>
        character.charCodeAt(0),
      ),
    );
    const existing = JSON.parse(decoded) as StoredValidationSample;
    if (JSON.stringify(existing) === JSON.stringify(sample)) {
      return {
        id: sample.id,
        commitUrl: body.html_url ?? `https://github.com/${owner}/${repo}`,
        alreadyExists: true,
        attributed,
      };
    }
  } catch {
    // An occupied path with unrelated or malformed content is a conflict.
  }
  throw new Error("The submission ID is already used by a different dataset entry");
}

export async function commitValidationSample(
  env: Env,
  sample: StoredValidationSample,
  attribution: GitHubIdentity | null,
): Promise<SubmissionResponse> {
  const owner = required(env.GITHUB_DATASET_OWNER, "GITHUB_DATASET_OWNER");
  const repo = required(env.GITHUB_DATASET_REPO, "GITHUB_DATASET_REPO");
  const branch = env.GITHUB_DATASET_BRANCH ?? "main";
  const token = await getInstallationToken(env);
  const path = `samples/${sample.id}.json`;
  const message =
    attribution
      ? `dataset: add validation sample ${sample.id}\n\n` +
        `Co-authored-by: ${attribution.githubLogin} ` +
        `<${attribution.githubId}+${attribution.githubLogin}@users.noreply.github.com>`
      : `dataset: add anonymous validation sample ${sample.id}`;

  const existing = await findExisting(env, token, path, sample, attribution !== null);
  if (existing) return existing;

  const response = await fetch(
    `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${pathEncode(path)}`,
    {
      method: "PUT",
      headers: { ...githubHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        content: utf8ToBase64(`${JSON.stringify(sample, null, 2)}\n`),
        branch,
      }),
    },
  );

  if (response.status === 409 || response.status === 422) {
    const raceWinner = await findExisting(env, token, path, sample, attribution !== null);
    if (raceWinner) return raceWinner;
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `GitHub dataset commit failed (${response.status})`);
  }

  const body = (await response.json()) as ContentsResponse;
  return {
    id: sample.id,
    commitUrl: body.commit?.html_url ?? `https://github.com/${owner}/${repo}`,
    alreadyExists: false,
    attributed: attribution !== null,
  };
}
