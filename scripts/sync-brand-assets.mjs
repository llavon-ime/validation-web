import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const source = "https://avatars.githubusercontent.com/u/299387634?v=4&s=512";
const expectedSha256 = "8a5c511036b8ee56f0f43803da3b0afcdcb6aadc802d909437159bd16d7fc2d7";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destination = resolve(root, "apps/web/public/llavon-logo.png");

const response = await fetch(source, {
  headers: { "User-Agent": "llavon-validation-web-brand-sync" },
});
if (!response.ok) {
  throw new Error(`Unable to download the llavon-ime GitHub avatar: ${response.status}`);
}

const bytes = new Uint8Array(await response.arrayBuffer());
const hash = createHash("sha256").update(bytes).digest("hex");
if (hash !== expectedSha256) {
  throw new Error(
    `The GitHub avatar changed (expected ${expectedSha256}, received ${hash}). ` +
      "Review the new logo before updating the pinned hash.",
  );
}

await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, bytes);
console.log(`Synced ${bytes.length} bytes to ${destination}`);
