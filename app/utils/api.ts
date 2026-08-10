import type {
  AgreementResponse,
  SubmissionDraft,
  SubmissionResponse,
} from "#shared/utils/schema";

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as
    | (T & { error?: string; message?: string; statusMessage?: string })
    | null;
  if (!response.ok) {
    throw new Error(
      body?.statusMessage ??
        body?.message ??
        body?.error ??
        `請求失敗（${response.status}）`,
    );
  }
  return body as T;
}

export async function acceptContributionAgreement(
  version: string,
): Promise<AgreementResponse> {
  return readJson<AgreementResponse>(
    await fetch("/api/agreement", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ accepted: true, version }),
    }),
  );
}

export async function getContributionAgreement(): Promise<AgreementResponse> {
  return readJson<AgreementResponse>(
    await fetch("/api/agreement", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    }),
  );
}

export async function submitValidationSample(
  draft: SubmissionDraft,
): Promise<SubmissionResponse> {
  return readJson<SubmissionResponse>(
    await fetch("/api/submissions", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(draft),
    }),
  );
}
