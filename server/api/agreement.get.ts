import { CONTRIBUTION_AGREEMENT_VERSION } from "../../shared/utils/schema";
import { getAgreementAcceptance } from "../services/agreement";

export default defineEventHandler(async (event) => {
  const acceptance = await getAgreementAcceptance(event);
  return {
    agreement: {
      requiredVersion: CONTRIBUTION_AGREEMENT_VERSION,
      acceptedAt: acceptance?.acceptedAt ?? null,
    },
  };
});
