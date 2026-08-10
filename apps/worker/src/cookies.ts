export function parseCookies(request: Request): Map<string, string> {
  const cookies = new Map<string, string>();
  const header = request.headers.get("Cookie");
  if (!header) return cookies;
  for (const item of header.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0) continue;
    const name = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    cookies.set(name, value);
  }
  return cookies;
}

interface CookieOptions {
  maxAge: number;
  path?: string;
}

export function serializeCookie(
  request: Request,
  name: string,
  value: string,
  options: CookieOptions,
): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=${value}; Path=${options.path ?? "/"}; Max-Age=${options.maxAge}; HttpOnly; SameSite=Lax${secure}`;
}

