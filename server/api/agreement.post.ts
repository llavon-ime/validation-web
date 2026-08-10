import { createError, readBody } from "h3";
import {
  CONTRIBUTION_AGREEMENT_VERSION,
  type AgreementResponse,
} from "../../shared/utils/schema";
import { recordAgreementAcceptance } from "../services/agreement";
import { assertSameOrigin } from "../utils/security";

export default defineEventHandler(async (event): Promise<AgreementResponse> => {
  assertSameOrigin(event);
  const input = await readBody<unknown>(event).catch(() => null);
  if (
    typeof input !== "object" ||
    input === null ||
    !("accepted" in input) ||
    input.accepted !== true ||
    !("version" in input) ||
    input.version !== CONTRIBUTION_AGREEMENT_VERSION
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: "必須明確接受目前版本的貢獻同意書",
    });
  }

  const acceptance = await recordAgreementAcceptance(event);
  return {
    agreement: {
      requiredVersion: CONTRIBUTION_AGREEMENT_VERSION,
      acceptedAt: acceptance.acceptedAt,
    },
  };
});
