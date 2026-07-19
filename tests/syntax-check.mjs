import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const files = readdirSync("js")
  .filter((name) => name.endsWith(".js"))
  .sort();

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", join("js", file)], {
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`Syntax checked ${files.length} JavaScript modules.`);
