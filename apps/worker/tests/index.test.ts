import { describe, expect, it } from "vitest";
import { CONTRIBUTION_AGREEMENT_VERSION, DATASET_LICENSE } from "@llavon/schema";
import { createValidationDispatch } from "../src/github.ts";
import worker from "../src/index.ts";
import type { Env } from "../src/types.ts";

const env = {
  ENVIRONMENT: "development",
  DEV_AUTH_BYPASS: "true",
  SESSION_SECRET: "test-session-secret-with-more-than-32-bytes",
  ASSETS: {
    fetch: () => Promise.resolve(new Response("asset")),
  },
} as unknown as Env;

describe("Worker API", () => {
  it("builds the validation-set repository_dispatch contract from canonical UTF-8", async () => {
    const dispatch = await createValidationDispatch(
      "0262684d-61eb-4c2b-906f-62d168bcd021",
      {
        schemaVersion: 1,
        license: DATASET_LICENSE,
        context: "𠮷野家下班後想喝",
        answer: "牛奶",
        padding: [
          { syllable: "ㄋㄧㄡ", tone: 2 },
          { syllable: "ㄋㄞ", tone: 3 },
        ],
        difficulty: 2,
      },
      { githubId: 42, githubLogin: "unicode-user" },
    );

    expect(dispatch).toEqual({
      event_type: "append-validation-sample",
      client_payload: {
        submissionId: "0262684d-61eb-4c2b-906f-62d168bcd021",
        sample: {
          schemaVersion: 1,
          license: "CC-BY-4.0",
          context: "𠮷野家下班後想喝",
          answer: "牛奶",
          padding: [
            { syllable: "ㄋㄧㄡ", tone: 2 },
            { syllable: "ㄋㄞ", tone: 3 },
          ],
          difficulty: 2,
        },
        payloadSha256: "6c2f76fab43c34494a28546817af89ebfa496c4757cae6df50c1a669e97a2b98",
        attribution: { githubId: 42, githubLogin: "unicode-user" },
      },
    });
  });

  it("exposes a local development identity only when explicitly enabled", async () => {
    const response = await worker.fetch(
      new Request("http://localhost:8787/api/session"),
      env,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      githubConfigured: true,
      user: { githubLogin: "local-developer" },
      agreement: {
        requiredVersion: CONTRIBUTION_AGREEMENT_VERSION,
        acceptedAt: null,
      },
    });
  });

  it("records explicit agreement and recognizes its signed cookie", async () => {
    const response = await worker.fetch(
      new Request("http://localhost:8787/api/agreement", {
        method: "POST",
        headers: {
          Origin: "http://localhost:8787",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accepted: true,
          version: CONTRIBUTION_AGREEMENT_VERSION,
        }),
      }),
      env,
    );
    expect(response.status).toBe(200);
    const setCookie = response.headers.get("Set-Cookie");
    expect(setCookie).toContain("llavon_agreement=");
    expect(setCookie).toContain("HttpOnly");

    const session = await worker.fetch(
      new Request("http://localhost:8787/api/session", {
        headers: { Cookie: setCookie?.split(";")[0] ?? "" },
      }),
      env,
    );
    await expect(session.json()).resolves.toMatchObject({
      agreement: {
        requiredVersion: CONTRIBUTION_AGREEMENT_VERSION,
        acceptedAt: expect.any(String),
      },
    });
  });

  it("rejects an agreement without an explicit current-version acceptance", async () => {
    const response = await worker.fetch(
      new Request("http://localhost:8787/api/agreement", {
        method: "POST",
        headers: {
          Origin: "http://localhost:8787",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ accepted: false, version: "old" }),
      }),
      env,
    );
    expect(response.status).toBe(400);
  });

  it("rejects cross-origin mutation requests", async () => {
    const response = await worker.fetch(
      new Request("http://localhost:8787/api/auth/logout", {
        method: "POST",
        headers: { Origin: "https://attacker.example" },
      }),
      env,
    );
    expect(response.status).toBe(403);
  });
});
