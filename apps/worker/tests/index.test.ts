import { describe, expect, it } from "vitest";
import { CONTRIBUTION_AGREEMENT_VERSION } from "@llavon/schema";
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
