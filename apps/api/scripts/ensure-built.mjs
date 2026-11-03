// `pnpm test` on a fresh checkout: the documentation tests read the generated types in dist/, which only `pnpm build` writes.
// Builds once when dist/types.d.ts is missing and does nothing after that, so a repeated `pnpm test` stays fast. A stale dist is
// refreshed by `pnpm build`, as before.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const packageDir = fileURLToPath(new URL("../", import.meta.url));
if (existsSync(new URL("../dist/types.d.ts", import.meta.url))) process.exit(0);
console.log("dist/types.d.ts is missing: running the build once so that the tests can read it.");
execFileSync(process.execPath, ["scripts/build.ts"], { cwd: packageDir, stdio: "inherit" });
