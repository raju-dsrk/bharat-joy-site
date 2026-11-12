// Basic checks for the generated static site. Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'public');
const DATA = JSON.parse(readFileSync(join(ROOT, 'data/site.data.json'), 'utf8'));
const S = DATA.site;
const FEATURED = DATA.games.filter((g) => g.featured);
const POLICY = FEATURED.filter((g) => g.privacy?.published);

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const ALL = walk(PUB);
const HTML = ALL.filter((f) => f.endsWith('.html'));
const TEXTY = ALL.filter((f) => ['.html', '.txt', '.xml', '.css', '.js'].includes(extname(f)) && !f.includes('/licenses/'));
const read = (f) => readFileSync(f, 'utf8');
const visible = (html) => html
  .replace(/<script[\s\S]*?<\/script>/g, (m) => (m.includes('i18n-hi') ? m.replace(/<[^>]+>/g, ' ') : ' '))
  .replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, ' ');

// Cloudflare Pages lookup: exact file, path.html, path/index.html
function resolves(urlPath) {
  const p = join(PUB, decodeURIComponent(urlPath));
  return [p, p + '.html', join(p, 'index.html')].find((c) => existsSync(c) && statSync(c).isFile());
}

test('generated output is up to date with the data file', () => {
  execFileSync(process.execPath, [join(ROOT, 'tools/build.mjs'), '--check'], { stdio: 'pipe' });
});

test('every required page and root file exists', () => {
  const need = ['index.html', '404.html', 'delete.html', 'terms.html', 'contact.html', 'robots.txt', 'sitemap.xml', 'app-ads.txt', '_headers', 'favicon.ico'];
  for (const g of FEATURED) need.push(`${g.slug}/index.html`);
  for (const g of POLICY) need.push(`${g.slug}/privacy.html`);
  for (const f of need) assert.ok(existsSync(join(PUB, f)), `missing ${f}`);
});

test('no privacy page for unpublished games (Carrom stays off the site)', () => {
  for (const g of DATA.games.filter((x) => !x.privacy?.published)) {
    assert.ok(!existsSync(join(PUB, g.slug)), `${g.slug} should not be published`);
  }
  assert.ok(!existsSync(join(PUB, 'carrom')));
});

// Em-dash and en-dash in any form: literal, HTML entity, CSS escape (content:"\2014") or JS/JSON escape.
const DASHES = /[\u2013\u2014]|&(m|n)dash;|&#(8212|8211|x2014|x2013);|\\0*201[34]\b|\\u201[34]/i;
test('no em-dashes (or en-dashes) in copy, data, CSS or JS', () => {
  for (const f of [...TEXTY, join(ROOT, 'data/site.data.json'), join(ROOT, 'tools/build.mjs')]) {
    const m = read(f).match(DASHES);
    assert.ok(!m, `dash ${m && JSON.stringify(m[0])} in ${relative(ROOT, f)}`);
  }
});

const FORBIDDEN = [
  /\u20B9/, /\brupees?\b/i, /\brs\.?\s?\d/i, /\bbet(s|ting)?\b/i, /\bjackpot/i, /\bcasino/i, /\bwager/i, /\bgambl/i,
  /\bcash\s?win/i, /\breal[\s-]money/i, /\blucky\b/i, /\bwin (real )?money\b/i, /\bearn money\b/i, /\bprize money\b/i,
  /\bpoker\b/i, /\brummy\b/i, /\bteen patti\b/i, /\bsatta\b/i, /\bpay[\s-]to[\s-]win\b/i, /\bsweet pop\b/i, /\bmithai match\b/i,
  /\bcash\b/i, /\bprizes?\b/i, /\bwin cash\b/i, /\bcash prizes?\b/i, /\bcrashlytics\b/i, /\biphone\b/i, /\bios\b/i, /\bapp store\b/i, /\blimited time\b/i, /\bhurry\b/i,
];
test('no rupee sign, gambling, pay-to-win, retired names or dark-pattern words in visible copy', () => {
  for (const f of [...HTML, join(ROOT, 'data/site.data.json')]) {
    const text = f.endsWith('.json') ? read(f) : visible(read(f));
    for (const re of FORBIDDEN) assert.ok(!re.test(text), `${re} found in ${relative(ROOT, f)}`);
  }
});

test('Hindi uses स्तर for level, never लेवल', () => {
  for (const f of [...HTML, join(ROOT, 'data/site.data.json')]) assert.ok(!read(f).includes('लेवल'), relative(ROOT, f));
});

test('only the configured support email appears; no support@ mailbox', () => {
  for (const f of TEXTY) {
    const s = read(f);
    assert.ok(!/support@/i.test(s), `support@ in ${relative(ROOT, f)}`);
    for (const m of s.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)) assert.equal(m[0], S.supportEmail, `${m[0]} in ${relative(ROOT, f)}`);
  }
});

test('domain comes from the data file only', () => {
  const host = S.domain.replace(/^https?:\/\//, '');
  for (const f of walk(join(ROOT, 'tools')).concat(walk(join(ROOT, 'tests')), [join(PUB, 'assets/css/site.css'), join(PUB, 'assets/js/lang.js')])) {
    if (f.endsWith('site.test.mjs')) continue;
    assert.ok(!read(f).includes(host), `hard-coded domain in ${relative(ROOT, f)}`);
  }
  for (const f of HTML.filter((x) => !x.endsWith('404.html'))) {
    const canon = read(f).match(/<link rel="canonical" href="([^"]+)"/);
    assert.ok(canon && canon[1].startsWith(S.domain + '/'), `canonical in ${relative(ROOT, f)}`);
  }
  assert.match(read(join(PUB, 'robots.txt')), new RegExp(`^Sitemap: ${S.domain}/sitemap.xml$`, 'm'));
  assert.match(read(join(PUB, 'robots.txt')), /^User-agent: \*\nAllow: \/$/m);
  const locs = [...read(join(PUB, 'sitemap.xml')).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.ok(locs.length >= 4 + FEATURED.length + POLICY.length);
  for (const l of locs) {
    assert.ok(l.startsWith(S.domain + '/'), l);
    assert.ok(resolves(l.slice(S.domain.length)), `sitemap entry does not resolve: ${l}`);
  }
});

test('app-ads.txt is comments only until a publisher id is set', () => {
  const lines = read(join(PUB, 'app-ads.txt')).split('\n').filter((l) => l.trim());
  if (!S.admobPublisherId) for (const l of lines) assert.ok(l.startsWith('#'), `non-comment line: ${l}`);
  else assert.ok(lines.some((l) => l === `google.com, ${S.admobPublisherId}, DIRECT, f08c47fec0942fa0`));
});

test('every internal link and asset resolves, and #anchors exist', () => {
  for (const f of HTML) {
    const html = read(f);
    for (const m of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
      const u = m[1];
      if (/^(https?:|mailto:)/.test(u)) continue;
      const [pathPart, hash] = u.split('#');
      const clean = pathPart.split('?')[0];
      let target = f;
      if (clean) {
        assert.ok(clean.startsWith('/'), `relative link ${u} in ${relative(PUB, f)}`);
        target = resolves(clean);
        assert.ok(target, `broken link ${u} in ${relative(PUB, f)}`);
      }
      if (hash) assert.ok(read(target).includes(`id="${hash}"`), `missing #${hash} for ${u} in ${relative(PUB, f)}`);
    }
  }
});

test('pages load nothing from other servers (fonts, scripts, styles, images are self-hosted)', () => {
  for (const f of HTML) {
    const html = read(f);
    assert.ok(!/<(script|img|link)[^>]+(src|href)="https?:\/\/(?!policies\.google\.com)/.test(html.replace(/<link rel="canonical"[^>]+>/, '')), relative(PUB, f));
    assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(html), relative(PUB, f));
  }
  assert.ok(!/url\(["']?https?:/.test(read(join(PUB, 'assets/css/site.css'))));
});

test('font licences ship with the fonts', () => {
  const lic = readdirSync(join(PUB, 'assets/fonts/licenses'));
  for (const n of ['OFL-yesevaone.txt', 'OFL-ebgaramond.txt', 'OFL-literata.txt', 'OFL-notoserifdevanagari.txt']) assert.ok(lic.includes(n), n);
});

test('pages are accessible basics: lang, title, description, one h1, main, alt and size on images', () => {
  for (const f of HTML) {
    const html = read(f);
    const name = relative(PUB, f);
    assert.match(html, /<html lang="en"/, name);
    assert.match(html, /<title>[^<]+<\/title>/, name);
    assert.match(html, /<meta name="description" content="[^"]+">/, name);
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, `${name} h1 count`);
    assert.match(html, /<main id="main"/, name);
    assert.match(html, /<meta property="og:image" content="https:\/\/[^"]+">/, name);
    for (const img of html.match(/<img\b[^>]*>/g) || []) {
      assert.match(img, /\salt="/, `${name}: ${img}`);
      assert.match(img, /\swidth="\d+" height="\d+"/, `${name}: ${img}`);
    }
    const dict = JSON.parse(html.match(/<script type="application\/json" id="i18n-hi">([\s\S]*?)<\/script>/)[1]);
    for (const k of Object.keys(dict)) assert.ok(html.includes(`data-i18n="${k}"`), `${name} unused key ${k}`);
  }
});

test('privacy pages match each game\'s SDKs', () => {
  const p = (slug) => visible(read(join(PUB, slug, 'privacy.html')));
  const ludo = p('bharat-ludo');
  assert.match(ludo, /Firebase Analytics/);
  assert.match(ludo, /worldtimeapi\.org/);
  assert.match(ludo, /timeapi\.io/);
  assert.match(ludo, /Reminders are off until you turn them on/);
  const block = p('block-puzzle');
  assert.match(block, /does not include Firebase/);
  assert.ok(!/Firebase Analytics/.test(block));
  assert.match(block, /does not schedule or send any reminders/);
  assert.ok(!/worldtimeapi|timeapi\.io|generate_204/.test(block));
  const mela = p('sweet-mela');
  assert.match(mela, /does not include Firebase/);
  assert.ok(!/Firebase Analytics/.test(mela));
  assert.match(mela, /generate_204/);
  assert.match(mela, /at most one local notification a day/);
  for (const g of POLICY) {
    const s = p(g.slug);
    assert.match(s, /Google AdMob/);
    assert.ok(s.includes(g.package), `${g.slug} names its package`);
    assert.ok(s.includes(S.supportEmail));
  }
});

test('closed testing Ludo has a label, not a store or tester link', () => {
  const ludo = DATA.games.find((g) => g.id === 'ludo');
  if (ludo.status !== 'closed-testing') return;
  const html = read(join(PUB, 'bharat-ludo/index.html'));
  assert.match(html, /<span class="cta cta-label"><span data-i18n="t\d+">Coming to Google Play<\/span><\/span>/);
  assert.ok(!/play\.google\.com/.test(html));
});

test('no secrets or signing files are tracked', () => {
  let files = [];
  try { files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n'); } catch { return; }
  for (const f of files) {
    assert.ok(!/(\.keystore|\.jks|keystore\.properties|google-services\.json|(^|\/)\.env(\.|$))/.test(f), `secret-like file tracked: ${f}`);
  }
});

test('every file the pages reference is tracked in git (so Pages gets it)', () => {
  let tracked;
  try { tracked = new Set(execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n')); } catch { return; }
  for (const f of HTML) {
    for (const m of read(f).matchAll(/\s(?:href|src)="(\/[^"#?]*)/g)) {
      const target = resolves(m[1]);
      if (!target) continue;
      assert.ok(tracked.has(relative(ROOT, target)), `${relative(ROOT, target)} is used by ${relative(PUB, f)} but not tracked`);
    }
  }
});

test('the Devanagari web font covers every Hindi letter the site uses', () => {
  const have = new Set([...readFileSync(join(ROOT, 'tools/devanagari-chars.txt'), 'utf8').trim()]);
  const used = new Set();
  for (const f of [join(ROOT, 'data/site.data.json'), join(ROOT, 'tools/build.mjs'), ...HTML]) {
    for (const c of read(f)) if (c >= '\u0900' && c <= '\u097F') used.add(c);
  }
  const missing = [...used].filter((c) => !have.has(c));
  assert.deepEqual(missing, [], `letters missing from the font subset: ${missing.join(' ')}. Run python3 tools/fonts.py <NotoSerifDevanagari.ttf>`);
});
