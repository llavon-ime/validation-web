const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBinary(bytes: Uint8Array): string {
  let result = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    result += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return result;
}

export function base64UrlEncodeBytes(bytes: Uint8Array): string {
  return btoa(bytesToBinary(bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

export function base64UrlEncodeText(value: string): string {
  return base64UrlEncodeBytes(encoder.encode(value));
}

export function base64UrlDecodeBytes(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function base64UrlDecodeText(value: string): string {
  return decoder.decode(base64UrlDecodeBytes(value));
}

export function randomBase64Url(byteLength = 32): string {
  return base64UrlEncodeBytes(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function hmac(value: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

export async function signPayload(value: unknown, secret: string): Promise<string> {
  const payload = base64UrlEncodeText(JSON.stringify(value));
  const signature = base64UrlEncodeBytes(await hmac(payload, secret));
  return `${payload}.${signature}`;
}

export async function verifyPayload<T>(
  value: string | undefined,
  secret: string,
): Promise<T | null> {
  if (!value) return null;
  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;
  const payload = value.slice(0, separator);
  const provided = value.slice(separator + 1);
  const expected = base64UrlEncodeBytes(await hmac(payload, secret));
  if (provided.length !== expected.length) return null;

  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= expected.charCodeAt(index) ^ provided.charCodeAt(index);
  }
  if (mismatch !== 0) return null;

  try {
    return JSON.parse(base64UrlDecodeText(payload)) as T;
  } catch {
    return null;
  }
}

export function utf8ToBase64(value: string): string {
  return btoa(bytesToBinary(encoder.encode(value)));
}

