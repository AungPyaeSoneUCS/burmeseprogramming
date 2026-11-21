import { execSync } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import yazl from "yazl";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "out");
const target = resolve(root, "android-app", "assets", "site.zip");

function collectFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(abs, out);
    } else {
      out.push(abs);
    }
  }
  return out;
}

function zipDir(srcDir, targetFile) {
  return new Promise((resolvePromise, rejectPromise) => {
    const files = collectFiles(srcDir);
    const zipfile = new yazl.ZipFile();
    const out = createWriteStream(targetFile);
    zipfile.outputStream.pipe(out);
    out.on("close", () => resolvePromise(files));
    zipfile.outputStream.on("error", rejectPromise);
    out.on("error", rejectPromise);

    files.forEach((abs, i) => {
      if (i % 1000 === 0) {
        console.log(`  packed ${i}/${files.length} files`);
      }
      const rel = relative(srcDir, abs).replaceAll("\\", "/");
      zipfile.addFile(abs, rel, { compressionLevel: 9 });
    });
    zipfile.end();
  });
}

console.log("[1/3] Building static export (EXPORT_SITE=1)...");
execSync("npm run build", {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, EXPORT_SITE: "1" },
});

if (!existsSync(resolve(outDir, "index.html"))) {
  throw new Error("Static export did not produce out/index.html");
}

console.log("[2/3] Removing previous bundle...");
rmSync(target, { force: true });

console.log("[3/3] Zipping out/ ->", target);
const count = await zipDir(outDir, target);

const mb = Math.round(statSync(target).size / 1024 / 1024);
console.log(`Done: ${target} (${count} files, ${mb} MB)`);
console.log(
  "If the site content changed, bump CONTENT_VERSION in android-app/App.tsx " +
    "so installed devices re-extract the offline bundle."
);