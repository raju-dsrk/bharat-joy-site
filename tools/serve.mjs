#!/usr/bin/env node
// Tiny local preview server that behaves like Cloudflare Pages for this site:
// /terms -> terms.html, /x/ -> x/index.html, unknown paths -> 404.html with status 404.
//   node tools/serve.mjs [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PORT = Number(process.argv[2] || 5280);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };

async function isFile(p) { try { return (await stat(p)).isFile(); } catch { return false; } }

export async function resolvePath(pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const base = join(ROOT, clean);
  if (!base.startsWith(ROOT)) return null;
  for (const c of [base, base + '.html', join(base, 'index.html')]) if (await isFile(c)) return c;
  return null;
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  const file = await resolvePath(pathname);
  if (!file) {
    res.writeHead(404, { 'content-type': TYPES['.html'] });
    res.end(await readFile(join(ROOT, '404.html')));
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(await readFile(file));
}).listen(PORT, () => console.log(`Preview: http://localhost:${PORT}/`));
