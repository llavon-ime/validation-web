import type { H3Event } from "h3";
import { useSession } from "h3";
import {
  CONTRIBUTION_AGREEMENT_VERSION,
  type AgreementAcceptance,
} from "../../shared/utils/schema";

const AGREEMENT_SESSION_NAME = "llavon-agreement";
const AGREEMENT_MAX_AGE = 60 * 60 * 24 * 365;

interface AgreementSessionData {
  acceptance?: AgreementAcceptance;
}

async function useAgreementSession(event: H3Event) {
  const runtimeConfig = useRuntimeConfig(event);
  return useSession<AgreementSessionData>(event, {
    ...runtimeConfig.session,
    name: AGREEMENT_SESSION_NAME,
    maxAge: AGREEMENT_MAX_AGE,
    cookie: {
      ...runtimeConfig.session.cookie,
      httpOnly: true,
      sameSite: "lax",
    },
  });
}

export async function getAgreementAcceptance(
  event: H3Event,
): Promise<AgreementAcceptance | null> {
  const session = await useAgreementSession(event);
  const acceptance = session.data.acceptance;
  if (
    acceptance?.version !== CONTRIBUTION_AGREEMENT_VERSION ||
    !Number.isFinite(Date.parse(acceptance.acceptedAt))
  ) {
    return null;
  }
  return acceptance;
}

export async function recordAgreementAcceptance(
  event: H3Event,
): Promise<AgreementAcceptance> {
  const acceptance = {
    version: CONTRIBUTION_AGREEMENT_VERSION,
    acceptedAt: new Date().toISOString(),
  };
  const session = await useAgreementSession(event);
  await session.update({ acceptance });
  return acceptance;
}
