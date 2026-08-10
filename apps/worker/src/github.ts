import type {
  GitHubIdentity,
  SessionUser,
  StoredValidationSample,
  SubmissionResponse,
} from "@llavon/schema";
import {
  canonicalizeValidationSample,
  serializeValidationSample,
} from "@llavon/schema";
import { base64UrlEncodeBytes, base64UrlEncodeText } from "./crypto";
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

let cachedInstallationToken:
  | { token: string; expiresAt: number; installationId: string; repository: string }
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
  const repository = required(env.GITHUB_DATASET_REPO, "GITHUB_DATASET_REPO");
  if (
    cachedInstallationToken?.installationId === installationId &&
    cachedInstallationToken.repository === repository &&
    cachedInstallationToken.expiresAt > Date.now() + 60_000
  ) {
    return cachedInstallationToken.token;
  }

  const response = await fetch(
    `${GITHUB_API}/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
    {
      method: "POST",
      headers: {
        ...githubHeaders(await createAppJwt(env)),
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        repositories: [repository],
        permissions: { contents: "write" },
      }),
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
    repository,
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

export interface ValidationDispatch {
  event_type: "append-validation-sample";
  client_payload: {
    submissionId: string;
    sample: StoredValidationSample;
    payloadSha256: string;
    attribution: GitHubIdentity | null;
  };
}

async function sha256HexUtf8(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const decoded = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  if (decoded !== value) throw new Error("UTF-8 round-trip validation failed");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createValidationDispatch(
  submissionId: string,
  sample: StoredValidationSample,
  attribution: GitHubIdentity | null,
): Promise<ValidationDispatch> {
  const canonicalSample = canonicalizeValidationSample(sample);
  const serialized = serializeValidationSample(canonicalSample);
  return {
    event_type: "append-validation-sample",
    client_payload: {
      submissionId,
      sample: canonicalSample,
      payloadSha256: await sha256HexUtf8(serialized),
      attribution,
    },
  };
}

export async function dispatchValidationSample(
  env: Env,
  submissionId: string,
  sample: StoredValidationSample,
  attribution: GitHubIdentity | null,
): Promise<SubmissionResponse> {
  const owner = required(env.GITHUB_DATASET_OWNER, "GITHUB_DATASET_OWNER");
  const repo = required(env.GITHUB_DATASET_REPO, "GITHUB_DATASET_REPO");
  const token = await getInstallationToken(env);
  const dispatch = await createValidationDispatch(submissionId, sample, attribution);

  const response = await fetch(
    `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/dispatches`,
    {
      method: "POST",
      headers: {
        ...githubHeaders(token),
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(dispatch),
    },
  );
  if (response.status !== 204) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `GitHub repository dispatch failed (${response.status})`);
  }
  return {
    id: submissionId,
    queued: true,
    attributed: attribution !== null,
  };
}
