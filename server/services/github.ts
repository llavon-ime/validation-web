import { App } from "octokit";
import { z } from "zod";
import { canonicalizePronunciationSample, serializePronunciationSample, type PronunciationSample } from "../../shared/utils/pronunciation";
import type {
  GitHubIdentity,
  StoredValidationSample,
  SubmissionResponse,
} from "../../shared/utils/schema";
import {
  canonicalizeValidationSample,
  serializeValidationSample,
} from "../../shared/utils/schema";

const DATASET_OWNER = "llavon-ime";
const DATASET_REPO = "validation-set";

const GitHubAppEnvSchema = z.object({
  GITHUB_APP_ID: z.string().trim().min(1),
  GITHUB_APP_PRIVATE_KEY: z.string().trim().min(1),
  GITHUB_INSTALLATION_ID: z.coerce.number().int().positive(),
});

export interface ValidationDispatch {
  event_type: "append-validation-sample";
  client_payload: {
    submissionId: string;
    sample: StoredValidationSample;
    payloadSha256: string;
    attribution: GitHubIdentity | null;
  };
}

function readGitHubAppEnv() {
  const parsed = GitHubAppEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const names = parsed.error.issues
      .map((issue) => issue.path.join("."))
      .filter(Boolean)
      .join("、");
    throw new Error(`GitHub App 環境變數缺漏或格式錯誤：${names}`);
  }
  return parsed.data;
}

function normalizePrivateKey(value: string): string {
  return value.replaceAll("\\n", "\n");
}

async function sha256HexUtf8(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const decoded = new TextDecoder("utf-8", {
    fatal: true,
    ignoreBOM: true,
  }).decode(bytes);
  if (decoded !== value) {
    throw new Error("UTF-8 往返驗證失敗");
  }
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
  submissionId: string,
  sample: StoredValidationSample,
  attribution: GitHubIdentity | null,
): Promise<SubmissionResponse> {
  return dispatchToDataset(await createValidationDispatch(submissionId, sample, attribution));
}

export async function createPronunciationDispatch(submissionId: string, sample: PronunciationSample, attribution: GitHubIdentity | null) {
  const canonicalSample = canonicalizePronunciationSample(sample);
  return {
    event_type: "append-pronunciation-sample" as const,
    client_payload: { submissionId, sample: canonicalSample,
      payloadSha256: await sha256HexUtf8(serializePronunciationSample(canonicalSample)), attribution },
  };
}

export async function dispatchPronunciationSample(submissionId: string, sample: PronunciationSample, attribution: GitHubIdentity | null): Promise<SubmissionResponse> {
  return dispatchToDataset(await createPronunciationDispatch(submissionId, sample, attribution));
}

async function dispatchToDataset(dispatch: ValidationDispatch | Awaited<ReturnType<typeof createPronunciationDispatch>>): Promise<SubmissionResponse> {
  const env = readGitHubAppEnv();
  const privateKey = normalizePrivateKey(env.GITHUB_APP_PRIVATE_KEY);

  const app = new App({ appId: env.GITHUB_APP_ID, privateKey });
  const octokit = await app.getInstallationOctokit(env.GITHUB_INSTALLATION_ID);
  await octokit.rest.repos.createDispatchEvent({
    owner: DATASET_OWNER,
    repo: DATASET_REPO,
    ...dispatch,
  });

  return {
    id: dispatch.client_payload.submissionId,
    queued: true,
    attributed: dispatch.client_payload.attribution !== null,
  };
}
