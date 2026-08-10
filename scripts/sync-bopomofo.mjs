import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const source =
  "https://raw.githubusercontent.com/llavon-ime/ime-windows-frontend/main/table/bopomofo_char.json";
const expectedBlobSha = "64cb9689f26e7e2a3e19378c0f42b71dd0d67f7c";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destination = resolve(root, "packages/zhuyin/src/bopomofo-char.json");

const response = await fetch(source, {
  headers: { "User-Agent": "llavon-validation-web-data-sync" },
});
if (!response.ok) {
  throw new Error(`Unable to download the Bopomofo table: ${response.status}`);
}

const bytes = new Uint8Array(await response.arrayBuffer());
const header = new TextEncoder().encode(`blob ${bytes.length}\0`);
const hash = createHash("sha1").update(header).update(bytes).digest("hex");
if (hash !== expectedBlobSha) {
  throw new Error(
    `The upstream table changed (expected ${expectedBlobSha}, received ${hash}). ` +
      "Review it and update the pinned SHA before importing.",
  );
}

JSON.parse(new TextDecoder().decode(bytes));
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, bytes);
console.log(`Synced ${bytes.length} bytes to ${destination}`);
