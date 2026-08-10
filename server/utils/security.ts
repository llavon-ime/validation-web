import type { H3Event } from "h3";
import { createError, getHeader, getRequestURL } from "h3";

export function isSameOrigin(requestUrl: string, origin: string | undefined): boolean {
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(requestUrl).origin;
  } catch {
    return false;
  }
}

export function assertSameOrigin(event: H3Event): void {
  if (!isSameOrigin(getRequestURL(event).toString(), getHeader(event, "origin"))) {
    throw createError({ statusCode: 403, statusMessage: "拒絕跨站請求" });
  }
}
