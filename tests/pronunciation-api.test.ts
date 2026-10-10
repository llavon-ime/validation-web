import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { createApp, createError, defineEventHandler, toWebHandler } from "h3";

const mocks = vi.hoisted(() => ({ session: vi.fn(), agreement: vi.fn(), dispatch: vi.fn() }));
vi.mock("../server/services/agreement", () => ({ getAgreementAcceptance: mocks.agreement }));
vi.mock("../server/services/github", () => ({ dispatchPronunciationSample: mocks.dispatch }));
const sample = { schemaVersion: 1, license: "CC-BY-4.0", kind: "pronunciation", answer: "鉈",
  readings: [[{ syllable: "ㄊㄚ", tone: 1 }, { syllable: "ㄊㄨㄛ", tone: 2 }]], description: "" };
const draft = { submissionId: "0262684d-61eb-4c2b-906f-62d168bcd021", sample,
  publicContributionConsent: true, trainingUseConsent: true, creditAsCoauthor: true };
let handler: ReturnType<typeof toWebHandler>;
beforeAll(async () => {
  vi.stubGlobal("defineEventHandler", defineEventHandler);
  vi.stubGlobal("requireUserSession", mocks.session);
  const endpoint = (await import("../server/api/pronunciations.post")).default;
  handler = toWebHandler(createApp().use(endpoint));
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { githubId: 123, githubLogin: "annotator" } });
  mocks.agreement.mockResolvedValue({ version: "2.1", acceptedAt: "2026-10-10T00:00:00Z" });
  mocks.dispatch.mockResolvedValue({ id: draft.submissionId, queued: true, attributed: true });
});
afterAll(() => vi.unstubAllGlobals());
function request(value: unknown = draft, origin = "http://localhost") {
  return handler(new Request("http://localhost/api/pronunciations", {
    method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(value),
  }));
}
describe("pronunciation submission boundary", () => {
  it("accepts unlisted readings and a blank explanation, using session attribution", async () => {
    expect((await request()).status).toBe(202);
    expect(mocks.dispatch).toHaveBeenCalledWith(draft.submissionId, sample, { githubId: 123, githubLogin: "annotator" });
    expect((await request({ ...draft, creditAsCoauthor: false })).status).toBe(202);
    expect(mocks.dispatch).toHaveBeenLastCalledWith(draft.submissionId, sample, null);
  });
  it("blocks cross-origin, signed-out, and unaccepted-agreement requests before dispatch", async () => {
    expect((await request(draft, "https://elsewhere.example")).status).toBe(403);
    mocks.session.mockRejectedValueOnce(createError({ statusCode: 401 }));
    expect((await request()).status).toBe(401);
    mocks.agreement.mockResolvedValueOnce(null);
    expect((await request()).status).toBe(428);
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
  it("rejects absent training consent, forged attribution, and oversized requests", async () => {
    expect((await request({ ...draft, trainingUseConsent: false })).status).toBe(400);
    expect((await request({ ...draft, attribution: { githubId: 456, githubLogin: "forged" } })).status).toBe(400);
    expect((await request({ ...draft, sample: { ...sample, description: "a".repeat(33 * 1024) } })).status).toBe(413);
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
  it("reports dispatch failure instead of claiming the sample was saved", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.dispatch.mockRejectedValueOnce(new Error("unavailable"));
      expect((await request()).status).toBe(502);
    } finally { log.mockRestore(); }
  });
});
