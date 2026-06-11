import { access, copyFile, cp, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist");
const clientDir = path.join(distDir, "client");
const indexPath = path.join(distDir, "index.html");

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyClientFilesToDistRoot() {
  if (!(await exists(clientDir))) return;

  await mkdir(distDir, { recursive: true });
  const entries = await readdir(clientDir);

  for (const entry of entries) {
    await cp(path.join(clientDir, entry), path.join(distDir, entry), {
      recursive: true,
      force: true,
    });
  }
}

async function readManifest() {
  const candidates = [
    path.join(clientDir, ".vite", "manifest.json"),
    path.join(clientDir, "manifest.json"),
  ];
  for (const candidate of candidates) {
    if (await exists(candidate)) {
      const { readFile } = await import("node:fs/promises");
      return JSON.parse(await readFile(candidate, "utf8"));
    }
  }
  return null;
}

function pickEntry(manifest) {
  for (const [, chunk] of Object.entries(manifest)) {
    if (chunk && chunk.isEntry) return chunk;
  }
  return null;
}

async function generateIndexFromManifest() {
  const manifest = await readManifest();
  if (!manifest) return false;
  const entry = pickEntry(manifest);
  if (!entry || !entry.file) return false;

  const cssLinks = (entry.css ?? [])
    .map((href) => `    <link rel="stylesheet" href="/${href}">`)
    .join("\n");
  const preloadLinks = (entry.imports ?? [])
    .map((key) => manifest[key]?.file)
    .filter(Boolean)
    .map((file) => `    <link rel="modulepreload" href="/${file}">`)
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>App</title>
${cssLinks}
${preloadLinks}
    <script type="module" crossorigin src="/${entry.file}"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;

  const { writeFile } = await import("node:fs/promises");
  await writeFile(indexPath, html, "utf8");
  return true;
}

async function ensureRootIndexHtml() {
  if (await exists(indexPath)) return;

  const candidates = [
    path.join(clientDir, "index.html"),
    path.join(clientDir, "_shell.html"),
  ];

  for (const candidate of candidates) {
    if (await exists(candidate)) {
      await copyFile(candidate, indexPath);
      return;
    }
  }

  if (await generateIndexFromManifest()) return;

  throw new Error("Could not create dist/index.html because no client HTML file was found.");
}

async function writeHtaccess() {
  const htaccessPath = path.join(distDir, ".htaccess");
  if (await exists(htaccessPath)) {
    const info = await stat(htaccessPath);
    if (info.isFile()) return;
  }

  await writeFile(
    htaccessPath,
    [
      "<IfModule mod_rewrite.c>",
      "  RewriteEngine On",
      "  RewriteBase /",
      "  RewriteRule ^index\\.html$ - [L]",
      "  RewriteCond %{REQUEST_FILENAME} !-f",
      "  RewriteCond %{REQUEST_FILENAME} !-d",
      "  RewriteRule . /index.html [L]",
      "</IfModule>",
      "",
    ].join("\n"),
  );
}

await copyClientFilesToDistRoot();
await ensureRootIndexHtml();
await writeHtaccess();

console.log("cPanel-ready output prepared at dist/index.html");