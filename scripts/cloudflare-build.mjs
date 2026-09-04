import { spawnSync } from "node:child_process";

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// The MongoDB schema is generated from the canonical Prisma schema before
// OpenNext invokes the Next.js production build.
run("node", ["scripts/prepare-mongodb-schema.mjs"]);
run("npx", ["prisma", "generate", "--schema=prisma/mongodb-schema"]);
run("npx", ["opennextjs-cloudflare", "build"]);
