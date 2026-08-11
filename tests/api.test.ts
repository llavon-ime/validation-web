import { describe, expect, it } from "vitest";
import { DATASET_LICENSE } from "../shared/utils/schema.ts";
import { createValidationDispatch } from "../server/services/github.ts";
import { isSameOrigin } from "../server/utils/security.ts";

describe("Nuxt server API", () => {
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

  it("serializes an empty context as an empty JSON string", async () => {
    const dispatch = await createValidationDispatch(
      "0262684d-61eb-4c2b-906f-62d168bcd021",
      {
        schemaVersion: 1,
        license: DATASET_LICENSE,
        context: "",
        answer: "水",
        padding: [{ syllable: "ㄕㄨㄟ", tone: 3 }],
        difficulty: 2,
      },
      null,
    );

    expect(dispatch.client_payload.sample.context).toBe("");
    expect(JSON.stringify(dispatch.client_payload)).toContain('"context":""');
  });

  it("compares mutation origins against the actual request origin", () => {
    expect(
      isSameOrigin("http://127.0.0.1:3000/api/submissions", "http://127.0.0.1:3000"),
    ).toBe(true);
    expect(
      isSameOrigin("https://validation.llavon.org/api/submissions", "https://attacker.example"),
    ).toBe(false);
    expect(isSameOrigin("https://validation.llavon.org/api/submissions", undefined)).toBe(
      false,
    );
  });
});
