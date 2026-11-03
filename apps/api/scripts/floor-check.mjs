// Proves the packed package works on the oldest Node it says it supports (`engines.node` in package.json). Plain JavaScript on
// purpose: the build and the other scripts need a newer Node to strip types, but the installed package must not.
//
//   node scripts/floor-check.mjs <path to the .tgz>
//
// CI runs it under Node 22.13.0 (FLOOR_CHECK_EXACT=1, which makes a different Node a failure). It installs the tarball into an empty
// folder, imports the entries the way an app does, answers requests in process, and runs the `generate` command.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const tarball = process.argv[2] ? resolve(process.argv[2]) : undefined;
if (!tarball) throw new Error("Usage: node scripts/floor-check.mjs <path to the .tgz>");
const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"));
const floor = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(pkg.engines.node);
if (!floor) throw new Error(`engines.node is ${pkg.engines.node}`);
const [major, minor] = [Number(floor[1]), Number(floor[2])];
const [haveMajor, haveMinor] = process.versions.node.split(".").map(Number);
const log = (message) => console.log(`[floor-check] ${message}`);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(haveMajor > major || (haveMajor === major && haveMinor >= minor), `Node ${process.versions.node} is below the floor ${major}.${minor}.`);
if (process.env.FLOOR_CHECK_EXACT === "1") {
  assert(haveMajor === major && haveMinor === minor, `This check is meant to run on Node ${major}.${minor}.x, not ${process.versions.node}.`);
}
log(`Node ${process.versions.node}, floor ${major}.${minor}`);

const work = mkdtempSync(join(tmpdir(), "rip-floor-"));
try {
  writeFileSync(join(work, "package.json"), JSON.stringify({ name: "floor", private: true, type: "module" }));
  execFileSync("npm", ["install", tarball, "--no-audit", "--no-fund", "--prefer-offline"], { cwd: work, stdio: ["ignore", "ignore", "inherit"] });
  log("installed the tarball");

  const check = join(work, "check.mjs");
  writeFileSync(
    check,
    `import { createApp } from '@johnmorrisdotca/rest-in-pieces';
import { createApp as core } from '@johnmorrisdotca/rest-in-pieces/core';
import { avatarSvg } from '@johnmorrisdotca/rest-in-pieces/images';
import { toNdjson } from '@johnmorrisdotca/rest-in-pieces/serialize';
import { restInPiecesHandlers } from '@johnmorrisdotca/rest-in-pieces/msw';
import { restInPieces } from '@johnmorrisdotca/rest-in-pieces/vite';
import { createMockApp } from '@johnmorrisdotca/rest-in-pieces/mock';
import spec from '@johnmorrisdotca/rest-in-pieces/openapi.json' with { type: 'json' };
const fail = (message) => { throw new Error(message); };
const app = createApp();
const users = await (await app.request('/users?limit=2')).json();
if (users.results.length !== 2) fail('/users did not answer');
if ((await core().request('/countries/JP')).status !== 200) fail('/countries/JP did not answer');
const stream = await app.request('/streams/messages?count=2&every=100');
if (stream.status !== 200) fail('a stream did not open');
await stream.body.cancel();
if (!avatarSvg('ada', 'Ada Lovelace').includes('<svg')) fail('images did not draw');
if (toNdjson([{ a: 1 }]) !== '{"a":1}\\n') fail('serialize did not write');
const [handler] = restInPiecesHandlers({ base: 'https://floor.test/api', http: { all: (path, resolver) => ({ path, resolver }) } });
if (!handler) fail('msw gave no handler');
if (typeof restInPieces({ base: '/mock' }).configureServer !== 'function') fail('vite gave no plugin');
if (typeof createMockApp !== 'function' || !('/users' in spec.paths)) fail('mock or openapi.json missing');
const page = await (await app.request('/docs')).text();
if (!page.includes('integrity=')) fail('/docs lost its integrity check');
console.log('ok');
`,
  );
  const printed = execFileSync(process.execPath, [check], { cwd: work, encoding: "utf8" }).trim();
  assert(printed === "ok", `The in-process check printed ${printed}.`);
  log("imported every entry and answered requests in process");

  const bin = join(work, "node_modules", ".bin", "rest-in-pieces");
  const lines = execFileSync(bin, ["generate", "--fields", "name:person.fullName,age:number.int(18,65)", "--count", "3", "--seed", "4"], { cwd: work, encoding: "utf8" })
    .trimEnd()
    .split("\n");
  assert(lines.length === 3 && JSON.parse(lines[0]).name, `generate wrote ${lines.join("|")}`);
  log("the generate command wrote 3 records");
  log("passed");
} finally {
  rmSync(work, { recursive: true, force: true });
}
