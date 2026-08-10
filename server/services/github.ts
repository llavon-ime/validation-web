import { App } from "octokit";
import type {
  GitHubIdentity,
  StoredValidationSample,
  SubmissionResponse,
} from "../../shared/utils/schema";
import {
  canonicalizeValidationSample,
  serializeValidationSample,
} from "../../shared/utils/schema";

export interface GitHubAppConfig {
  appId: string;
  appPrivateKey: string;
  installationId: string;
  datasetOwner: string;
  datasetRepo: string;
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

function requireConfig(value: string, name: string): string {
  if (!value) {
    throw new Error(`缺少伺服器環境變數：${name}`);
  }
  return value;
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
  config: GitHubAppConfig,
  submissionId: string,
  sample: StoredValidationSample,
  attribution: GitHubIdentity | null,
): Promise<SubmissionResponse> {
  const appId = requireConfig(config.appId, "NUXT_GITHUB_APP_ID");
  const privateKey = normalizePrivateKey(
    requireConfig(config.appPrivateKey, "NUXT_GITHUB_APP_PRIVATE_KEY"),
  );
  const installationId = Number(
    requireConfig(config.installationId, "NUXT_GITHUB_INSTALLATION_ID"),
  );
  if (!Number.isSafeInteger(installationId) || installationId <= 0) {
    throw new Error("NUXT_GITHUB_INSTALLATION_ID 必須是正整數");
  }

  const app = new App({ appId, privateKey });
  const octokit = await app.getInstallationOctokit(installationId);
  const dispatch = await createValidationDispatch(submissionId, sample, attribution);
  await octokit.rest.repos.createDispatchEvent({
    owner: requireConfig(config.datasetOwner, "NUXT_GITHUB_DATASET_OWNER"),
    repo: requireConfig(config.datasetRepo, "NUXT_GITHUB_DATASET_REPO"),
    ...dispatch,
  });

  return {
    id: submissionId,
    queued: true,
    attributed: attribution !== null,
  };
}
