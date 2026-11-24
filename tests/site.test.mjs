// Basic checks for the generated static site. Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { cmapCodepoints } from './woff2-cmap.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'public');
const DATA = JSON.parse(readFileSync(join(ROOT, 'data/site.data.json'), 'utf8'));
const S = DATA.site;
const FEATURED = DATA.games.filter((g) => g.featured);
const POLICY = DATA.games.filter((g) => g.privacy?.published);

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
  // These read-only subprocesses need no stdin; avoid opening a pipe for it in restricted environments.
  execFileSync(process.execPath, [join(ROOT, 'tools/build.mjs'), '--check'], { stdio: ['ignore', 'pipe', 'pipe'] });
});

test('every required page and root file exists', () => {
  const need = ['index.html', '404.html', 'delete.html', 'terms.html', 'contact.html', 'robots.txt', 'sitemap.xml', 'app-ads.txt', '_headers', '_redirects', 'favicon.ico'];
  for (const g of FEATURED) need.push(`${g.slug}/index.html`);
  for (const g of POLICY) need.push(`${g.slug}/privacy.html`);
  for (const f of need) assert.ok(existsSync(join(PUB, f)), `missing ${f}`);
});

// Cloudflare Pages _redirects: one "source dest [code]" per line, # comments, first match wins.
// Static rules (no * or :placeholder) must appear before dynamic ones. Max 2,000 static + 100 dynamic, 1,000 chars/line.
function parseRedirects(text) {
  return text.split('\n').flatMap((line, i) => {
    const raw = line.trim();
    if (!raw || raw.startsWith('#')) return [];
    const parts = raw.split(/\s+/);
    if (parts.length < 2 || parts.length > 3) throw new Error(`bad _redirects line ${i + 1}: ${line}`);
    const [source, destination, code = '302'] = parts;
    return [{ source, destination, code, dynamic: /(?:^|\/)(:|[A-Za-z0-9._-]*\*)/.test(source), line: i + 1, length: line.length }];
  });
}
function applyRedirects(rules, path) {
  for (const r of rules) {
    if (r.source === path) return r;
    if (r.source.endsWith('/*')) {
      const prefix = r.source.slice(0, -1); // "/foo/*" -> "/foo/"
      if (path.startsWith(prefix)) {
        return { ...r, destination: r.destination.replaceAll(':splat', path.slice(prefix.length)) };
      }
    }
  }
  return null;
}

test('Block Puzzle typos and the coming-soon privacy.html addresses redirect with 301, leaving canonical routes alone', () => {
  const rules = parseRedirects(read(join(PUB, '_redirects')));
  assert.ok(rules.length > 0, '_redirects has no rules');
  assert.ok(rules.length <= 2100, `_redirects has ${rules.length} rules; Pages allows 2,100`);
  assert.ok(rules.filter((r) => !r.dynamic).length <= 2000);
  assert.ok(rules.filter((r) => r.dynamic).length <= 100);
  for (const r of rules) {
    assert.ok(r.length <= 1000, `line ${r.line} is ${r.length} chars; Pages allows 1,000`);
    assert.match(r.code, /^(301|302|303|307|308)$/, `line ${r.line} status ${r.code}`);
  }
  const firstDynamic = rules.findIndex((r) => r.dynamic);
  if (firstDynamic >= 0) {
    assert.ok(rules.slice(firstDynamic).every((r) => r.dynamic), 'static _redirects rules must appear before dynamic ones');
  }

  const expect = (path, dest) => {
    const hit = applyRedirects(rules, path);
    assert.ok(hit, `${path} should redirect`);
    assert.equal(hit.destination, dest, path);
    assert.equal(hit.code, '301', path);
  };
  expect('/bharat-block-puzzle', '/block-puzzle/');
  expect('/bharat-block-puzzle/', '/block-puzzle/');
  expect('/bharat-block-puzzle/privacy.html', '/block-puzzle/privacy');
  expect('/bharat-block-puzzle/privacy', '/block-puzzle/privacy');
  expect('/bharat-block-puzzle/anything/else', '/block-puzzle/anything/else');
  expect('/carrom/privacy.html', '/carrom/privacy');
  expect('/sudoku/privacy.html', '/sudoku/privacy');
  expect('/call-break/privacy.html', '/call-break/privacy');
  expect('/bubble-shooter/privacy.html', '/bubble-shooter/privacy');

  // The privacy.html typo must be a single hop, not /block-puzzle/privacy.html then a pretty-URL 308.
  assert.equal(applyRedirects(rules, '/bharat-block-puzzle/privacy.html').destination, '/block-puzzle/privacy');

  for (const path of [
    '/', '/block-puzzle', '/block-puzzle/', '/block-puzzle/privacy', '/block-puzzle/privacy.html',
    '/bharat-ludo', '/bharat-ludo/', '/bharat-ludo/privacy', '/bharat-ludo/privacy.html',
    '/sweet-mela', '/sweet-mela/privacy', '/delete', '/delete.html', '/terms', '/contact',
    '/carrom/privacy', '/sudoku/privacy', '/call-break/privacy', '/bubble-shooter/privacy',
    '/app-ads.txt', '/robots.txt', '/sitemap.xml', '/404',
  ]) {
    assert.equal(applyRedirects(rules, path), null, `${path} must not be caught by _redirects`);
  }
});

test('unpublished policies stay off the site; workshop games have no game page', () => {
  for (const g of DATA.games.filter((x) => !x.privacy?.published)) {
    assert.ok(!existsSync(join(PUB, g.slug, 'privacy.html')), `${g.slug} privacy should not be published`);
  }
  for (const g of DATA.games.filter((x) => !x.featured)) {
    assert.ok(!existsSync(join(PUB, g.slug, 'index.html')), `${g.slug} should stay in the workshop`);
  }
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
  /\bcash\b/i, /\bprizes?\b/i, /\bwin cash\b/i, /\bcash prizes?\b/i,
  // stake and payout framing ("Costs 100 coins, win 200", "Join 200, win 800")
  /\bwin (up to )?\d/i, /\bwin \w+ coins\b/i, /\bentry fee\b/i, /\b(costs?|join|entry|enter)\b[^.]{0,30}\bwin\b/i, /\bpay ?outs?\b(?! money or anything)/i,
  /\bcrashlytics\b/i, /\biphone\b/i, /\bios\b/i, /\bapp store\b/i, /\blimited time\b/i, /\bhurry\b/i,
];
test('no rupee sign, gambling, pay-to-win, retired names or dark-pattern words in visible copy', () => {
  for (const f of [...HTML, join(ROOT, 'data/site.data.json')]) {
    const text = f.endsWith('.json') ? read(f) : visible(read(f));
    for (const re of FORBIDDEN) assert.ok(!re.test(text), `${re} found in ${relative(ROOT, f)}`);
  }
});

// Hindi: whole words only (a Devanagari letter on either side means a different word, e.g. लकी inside लकीर).
// इनाम (reward) and पैसा (money) are used legitimately ("इनाम वाले विज्ञापन" = rewarded ads, "कोई पैसा मूल्य नहीं"
// = no money value), so only their gambling phrases are banned.
// The boundary class leaves out the danda । and double danda ॥ (U+0964-0965), so 'जीतो।' is still a whole word.
const hi = (w) => new RegExp(`(?<![\\u0900-\\u0963\\u0966-\\u097F])(${w})(?![\\u0900-\\u0963\\u0966-\\u097F])`);
const FORBIDDEN_HI = [
  'नकद', 'कैश', 'जुआ', 'जुए', 'सट्टा', 'सट्टे', 'दांव', 'दाँव', 'जैकपॉट', 'कैसीनो', 'लकी', 'किस्मत', 'क़िस्मत',
  'रुपया', 'रुपये', 'रुपए', 'रुपयों', 'जीतो', 'जीतिए', 'जीतें',
  'इनाम जीत\\S*', 'नकद इनाम', 'इनामी राशि', 'पैसे जीत\\S*', 'पैसा जीत\\S*', 'असली पैसे', 'असली पैसा',
].map(hi);
test('no gambling or stake/payout words in the Hindi copy', () => {
  for (const f of [...HTML, join(ROOT, 'data/site.data.json'), join(ROOT, 'tools/build.mjs')]) {
    const text = read(f);
    for (const re of FORBIDDEN_HI) { const m = text.match(re); assert.ok(!m, `${m && m[0]} found in ${relative(ROOT, f)}`); }
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

test('app-ads.txt is exactly the seller line when a publisher id is set, comments only otherwise', () => {
  const txt = read(join(PUB, 'app-ads.txt'));
  if (S.admobPublisherId) {
    assert.match(S.admobPublisherId, /^pub-\d{16}$/);
    assert.equal(txt, `google.com, ${S.admobPublisherId}, DIRECT, f08c47fec0942fa0\n`);
  } else {
    for (const l of txt.split('\n').filter((l) => l.trim())) assert.ok(l.startsWith('#'), `non-comment line: ${l}`);
  }
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

test('privacy pages match each game\'s SDKs and current behaviour', () => {
  const p = (slug) => visible(read(join(PUB, slug, 'privacy.html')));
  const all = {};
  for (const g of POLICY) all[g.id] = p(g.slug);
  const { ludo, block, mela, carrom, sudoku, callbreak, bubble } = all;
  assert.equal(POLICY.length, 7, 'all 7 finished games have a published policy');
  // Every policy: AdMob rewarded + banner only, personalised ads via the advertising ID, UMP, the
  // Google HEAD Date time check, no account, the delete page, 18+.
  for (const g of POLICY) {
    const s = all[g.id];
    assert.match(s, /Google AdMob ads in two formats only: rewarded video ads and banner ads/, g.id);
    assert.match(s, /never plays by itself/, g.id);
    assert.match(s, /no interstitial ads/, g.id);
    assert.match(s, /personalised using the advertising ID/, g.id);
    assert.match(s, /User Messaging Platform \(UMP\)/, g.id);
    assert.match(s, /European Economic Area \(EEA\), the UK or Switzerland/, g.id);
    assert.match(s, /HTTPS HEAD request, with no body, to https:\/\/www\.google\.com\/generate_204 and reads only the Date header/, g.id);
    assert.match(s, /no advertising or device ID/, g.id);
    assert.ok(!/worldtimeapi|timeapi\.io/.test(s), `${g.id}: only the Google HEAD time check`);
    assert.ok(s.includes(`${g.nameEn} is intended for adults aged 18 and over.`), `${g.id}: 18+`);
    assert.ok(!/children under 13/.test(s), g.id);
    assert.match(s, /no .*account/i, g.id);
    assert.ok(read(join(PUB, g.slug, 'privacy.html')).includes('href="/delete"'), `${g.id} links the delete page`);
    assert.ok(s.includes(g.package), `${g.slug} names its package`);
    assert.ok(s.includes(S.supportEmail));
    assert.ok(read(join(PUB, g.slug, 'privacy.html')).includes('<time datetime="2026-11-24">24 November 2026</time>'), `${g.id} date`);
  }
  // The real Privacy choices path in each app (never a generic "Account" for games without one).
  const paths = {
    ludo: 'Account, then Settings, then Privacy choices',
    sudoku: 'Profile, then Settings, then Privacy choices',
    block: 'Settings (the gear on the home screen), then Privacy choices',
    mela: 'Settings, then Privacy choices',
    carrom: 'Settings, then Privacy choices',
    callbreak: 'Settings, then Privacy choices',
    bubble: 'Profile (tap your avatar on the home screen), then Privacy options',
  };
  for (const [id, path] of Object.entries(paths)) assert.ok(all[id].includes(`at any time in ${path}.`), `${id} Privacy choices path`);
  // Analytics: Ludo's Firebase is only built in when a config file exists, so its policy makes no claim
  // either way; the other six state AdMob is the only third party.
  assert.match(ludo, /Analytics \(Google Firebase Analytics\)/);
  assert.match(ludo, /screen being opened.*game starting.*game ending.*reward being claimed/);
  assert.match(ludo, /app-instance ID, the advertising ID/);
  assert.match(ludo, /name, photo, gender, friends' names and coin balance are not sent/);
  assert.match(ludo, /retention period set in our Firebase project/);
  assert.ok(read(join(PUB, 'bharat-ludo/privacy.html')).includes('href="https://policies.google.com/privacy"'), 'Ludo links Google privacy policy');
  for (const id of ['mela', 'carrom', 'sudoku', 'callbreak', 'bubble']) {
    assert.match(all[id], /does not include Firebase or any other analytics service/, id);
  }
  // Block Puzzle: Firebase Analytics is added to the release build; the code logs no custom events.
  assert.match(block, /Analytics \(Google Firebase Analytics\)/);
  assert.match(block, /does not send any events of its own/);
  assert.match(block, /automatically collects app usage data/);
  assert.match(block, /app-instance ID, the advertising ID/);
  assert.match(block, /retention period set in our Firebase project/);
  assert.ok(!/does not include Firebase/.test(block));
  assert.ok(!/game_start|reward being claimed|game starting/.test(block), 'no Ludo custom events in Block Puzzle');
  assert.ok(read(join(PUB, 'block-puzzle/privacy.html')).includes('href="https://policies.google.com/privacy"'));
  const del = visible(read(join(PUB, 'delete.html')));
  assert.match(del, /Usage events in Bharat Ludo and Bharat Block Puzzle\b/);
  assert.match(del, /Bharat Ludo and Bharat Block Puzzle send usage data/);
  assert.match(del, /Android backup in Bharat Call Break/);
  assert.match(bubble, /bottom of the level map and of the game screen/);
  // Banners: no banner in Ludo Pass and Play; Carrom and Call Break show it in Pass and Play.
  assert.match(ludo, /There is no banner in Pass and Play/);
  assert.match(carrom, /including Pass and Play matches/);
  assert.match(callbreak, /including Pass and Play matches/);
  assert.match(mela, /on the level map and on the results screen, not while you play a level/);
  // Reminders only where the app schedules them.
  assert.match(ludo, /Reminders are off until you turn them on/);
  assert.match(block, /at most one local reminder a day, around 7 pm phone time/);
  assert.match(block, /No data is sent for it and no push server is used/);
  assert.match(mela, /at most one local notification a day, around 6 pm/);
  assert.match(bubble, /around 7:30 pm India time/);
  for (const id of ['sudoku', 'carrom', 'callbreak']) assert.match(all[id], /does not schedule or show notifications/, id);
  // Sweet Mela and Carrom do not collect a name, picture or gender.
  for (const id of ['mela', 'carrom']) {
    assert.match(all[id], /does not ask for your name, a picture or your gender/, id);
    const stays = DATA.games.find((g) => g.id === id).privacy.stays.join(' ');
    assert.ok(!/name|avatar|gender|photo/i.test(stays), `${id} stays list has no name, avatar or gender`);
  }
  // Per-game extras.
  assert.match(callbreak, /allows Android's own backup/);
  assert.match(carrom, /on-device text-to-speech/);
  assert.match(carrom, /does not use the microphone/);
  assert.match(carrom, /does not collect personal data or run servers/);
  assert.match(mela, /content rated PG/);
  assert.ok(!/\bhint\b|achievements/.test(block), 'Block Puzzle privacy: no hint or achievements (not in the game)');
  for (const slug of ['carrom', 'sudoku', 'call-break', 'bubble-shooter']) {
    const id = DATA.games.find((g) => g.slug === slug).id;
    assert.ok(read(join(PUB, slug, 'privacy.html')).includes(`href="/#g-${id}"`), `${slug} links back to its card on the home grid`);
  }
});

test('home shows all 8 games as equal cards in one Our games grid, in EN and HI', () => {
  const home = read(join(PUB, 'index.html'));
  assert.ok(!home.includes('<section class="workshop"'), 'no separate Coming soon section');
  assert.ok(!/#workshop/.test(home), 'no #workshop anchor left');
  const grid = home.slice(home.indexOf('<ul class="game-grid">'), home.indexOf('</ul>', home.indexOf('<ul class="game-grid">')));
  assert.match(home, /<h2 id="games-title"><span data-i18n="t\d+">Our games<\/span><\/h2>/);
  assert.match(home, /Eight games from one studio/);
  const cards = grid.split('<li class="card"').slice(1);
  assert.equal(cards.length, 8, 'eight cards');
  assert.deepEqual(cards.map((c) => c.match(/^ id="g-([a-z]+)"/)[1]),
    ['ludo', 'block', 'mela', 'carrom', 'sudoku', 'callbreak', 'bubble', 'snakes'], 'card order');
  assert.ok(home.includes('<span id="workshop" aria-hidden="true"></span>'), 'old /#workshop links land on the grid');
  assert.ok(home.indexOf('id="workshop"') > home.indexOf('<section class="catalog" id="games"'), '#workshop is inside the grid section');
  const T = JSON.parse(home.match(/<script type="application\/json" id="i18n-hi">([\s\S]*?)<\/script>/)[1]);
  const hiOf = (card, en) => { const k = card.match(new RegExp(`data-i18n="(t\\d+)">${en.replace(/[.()]/g, '\\$&')}<`))?.[1]; return k && T[k]; };
  const want = { ludo: 'closed-testing', block: 'closed-testing', mela: 'closed-testing', carrom: 'coming-soon', sudoku: 'coming-soon', callbreak: 'coming-soon', bubble: 'coming-soon', snakes: 'coming-soon' };
  for (const [id, status] of Object.entries(want)) {
    const g = DATA.games.find((x) => x.id === id);
    assert.equal(g.status, status, id);
    const card = cards.find((c) => c.startsWith(` id="g-${id}"`));
    assert.ok(card, `${id} card`);
    assert.match(card, new RegExp(`class="card-icon" src="${g.icon}-192\\.webp" width="96" height="96"`), `${id} icon`);
    assert.ok(existsSync(join(PUB, `${g.icon}-192.webp`)), `${id} 192 icon file`);
    assert.ok(card.includes(g.nameEn) && card.includes(g.nameHi), `${id} EN + HI name`);
    const pill = status === 'closed-testing' ? ['Closed testing on Google Play', 'Google Play पर क्लोज़्ड टेस्टिंग'] : ['Coming soon', 'जल्द आ रहा है'];
    assert.equal(hiOf(card, pill[0]), pill[1], `${id} badge EN + HI`);
    assert.ok(g.cardEn && g.cardHi && hiOf(card, g.cardEn) === g.cardHi, `${id} EN + HI line`);
    assert.equal(card.includes(`href="/${g.slug}/privacy"`), !!g.privacy?.published, `${id} privacy link only where a policy exists`);
    assert.equal(card.includes(`href="/${g.slug}/"`), !!g.featured, `${id} game page link only for featured games`);
  }
  assert.ok(!existsSync(join(PUB, 'saanp-seedhi/privacy.html')), 'no Snakes policy');
  assert.ok(!/play\.google\.com/.test(grid));
  for (const g of POLICY.filter((x) => !x.featured)) {
    assert.ok(read(join(PUB, 'sitemap.xml')).includes(`<loc>${S.domain}/${g.slug}/privacy</loc>`), `${g.slug} in sitemap`);
    assert.match(read(join(PUB, 'delete.html')), new RegExp(g.package.replace(/\./g, '\\.')));
  }
  // Footer policy list on every page with a footer names all 7 policies.
  for (const f of HTML.filter((x) => read(x).includes('class="foot-links"'))) {
    for (const g of POLICY) assert.ok(read(f).includes(`href="/${g.slug}/privacy"`), `${relative(PUB, f)} footer lists ${g.slug}`);
    assert.ok(!/#workshop/.test(read(f)), `${relative(PUB, f)} has no #workshop link`);
  }
});

test('closed testing Ludo has a label, not a store or tester link', () => {
  const ludo = DATA.games.find((g) => g.id === 'ludo');
  if (ludo.status !== 'closed-testing') return;
  const html = read(join(PUB, 'bharat-ludo/index.html'));
  assert.match(html, /<span class="cta cta-label"><span data-i18n="t\d+">Coming to Google Play<\/span><\/span>/);
  assert.ok(!/play\.google\.com/.test(html));
});

test('Block Puzzle and Sweet Mela are in closed testing with a label, no store or tester link', () => {
  for (const [id, slug] of [['block', 'block-puzzle'], ['mela', 'sweet-mela']]) {
    const g = DATA.games.find((x) => x.id === id);
    assert.equal(g.status, 'closed-testing', `${id} status`);
    assert.equal(g.playUrl, '', `${id} has no Play link yet`);
    const html = read(join(PUB, `${slug}/index.html`));
    assert.match(html, /<span class="cta cta-label"><span data-i18n="t\d+">Coming to Google Play<\/span><\/span>/);
    assert.match(html, /Closed testing on Google Play/);
    assert.match(html, /Google Play पर क्लोज़्ड टेस्टिंग/);
    assert.match(html, /<meta name="description" content="[^"]*Closed testing on Google Play\.">/);
    assert.match(html, /<meta property="og:description" content="[^"]*Closed testing on Google Play\.">/);
    assert.match(html, /<meta name="twitter:description" content="[^"]*Closed testing on Google Play\.">/);
    assert.ok(!/play\.google\.com|groups\.google\.com|\/apps\/testing\//.test(html), `${slug} has no store or tester link`);
  }
  const home = read(join(PUB, 'index.html'));
  assert.ok(!/play\.google\.com|groups\.google\.com|\/apps\/testing\//.test(home));
});

test('no secrets or signing files are tracked', () => {
  let files = [];
  try { files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).split('\n'); } catch { return; }
  for (const f of files) {
    assert.ok(!/(\.keystore|\.jks|keystore\.properties|google-services\.json|(^|\/)\.env(\.|$))/.test(f), `secret-like file tracked: ${f}`);
  }
});

test('every file the pages reference is tracked in git (so Pages gets it)', () => {
  let tracked;
  try { tracked = new Set(execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).split('\n')); } catch { return; }
  for (const f of HTML) {
    for (const m of read(f).matchAll(/\s(?:href|src)="(\/[^"#?]*)/g)) {
      const target = resolves(m[1]);
      if (!target) continue;
      assert.ok(tracked.has(relative(ROOT, target)), `${relative(ROOT, target)} is used by ${relative(PUB, f)} but not tracked`);
    }
  }
});

test('the Devanagari web font (its real cmap) covers every Hindi character the site uses', () => {
  const have = cmapCodepoints(join(PUB, 'assets/fonts/NotoSerifDevanagari-deva.woff2'));
  const used = new Set();
  for (const f of [join(ROOT, 'data/site.data.json'), join(ROOT, 'tools/build.mjs'), ...HTML]) {
    for (const c of read(f)) if (c >= '\u0900' && c <= '\u097F') used.add(c);
  }
  assert.ok(used.size > 30, 'expected Hindi text');
  const missing = [...used].filter((c) => !have.has(c.codePointAt(0)));
  assert.deepEqual(missing, [], `characters missing from NotoSerifDevanagari-deva.woff2: ${missing.join(' ')}. Run python3 tools/fonts.py <NotoSerifDevanagari.ttf>`);
});

// ---- Touch targets: at least 48x48 CSS px at every width ----
// Every link and button in the output is either inline in running text (WCAG 2.5.8 inline exception)
// or one of these kinds, and each kind's CSS sets min-height (and min-width where text can be short) >= 48px,
// with no rule at any breakpoint setting a size below 48px.
const TAP = {
  '.nav a': 'hw', '.lang-btn': 'hw', '.foot-links li a': 'hw', '.icon-rail a': 'hw', '.win a': 'hw',
  '.foot-mail': 'h', '.game-name a': 'h', '.mail': 'h', '.more': 'h', '.links a': 'h', '.cta': 'h',
  '.legal-foot a': 'h', '.small': 'h', '.brand': 'h', '.contact-game': 'h', '.skip': 'h',
};
function cssRules(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = []; const media = [];
  let buf = '';
  for (const ch of css) {
    if (ch === '{') {
      const sel = buf.trim(); buf = '';
      media.push(sel.startsWith('@') ? sel : null);
      if (!sel.startsWith('@')) rules.push({ sel, media: media.filter(Boolean).join(' '), body: '' });
    } else if (ch === '}') {
      const top = media.pop();
      if (top === null) { rules[rules.length - 1].body = buf; }
      buf = '';
    } else buf += ch;
  }
  return rules.map((r) => ({ ...r, sels: r.sel.split(',').map((x) => x.trim().replace(/\s+/g, ' ')),
    decl: Object.fromEntries(r.body.split(';').map((d) => d.split(':').map((x) => x.trim())).filter((d) => d[0] && d[1]).map(([k, ...v]) => [k, v.join(':')])) }));
}
const CSS_RULES = cssRules(read(join(PUB, 'assets/css/site.css')));
const px = (v) => { const m = /^(\d+(?:\.\d+)?)px$/.exec(v || ''); return m ? Number(m[1]) : null; };

test('tap targets: every kind sets min-height (and min-width) of 48px, and no breakpoint shrinks it', () => {
  for (const [sel, dims] of Object.entries(TAP)) {
    const mine = CSS_RULES.filter((r) => r.sels.includes(sel));
    const base = mine.filter((r) => !r.media);
    assert.ok(base.length, `no base CSS rule for ${sel}`);
    const get = (k) => base.map((r) => r.decl[k]).filter(Boolean).pop();
    assert.ok(px(get('min-height')) >= 48, `${sel} min-height is ${get('min-height')}, needs >= 48px`);
    if (dims.includes('w')) assert.ok(px(get('min-width')) >= 48, `${sel} min-width is ${get('min-width')}, needs >= 48px`);
    if (sel !== '.lang-btn') assert.ok(/^(inline-)?(flex|block|grid)$/.test(get('display') || ''), `${sel} needs a box display for min-height to apply (has ${get('display')})`);
    for (const r of mine) {
      for (const k of ['min-height', 'min-width', 'height', 'width', 'max-height', 'max-width']) {
        const v = px(r.decl[k]);
        assert.ok(v === null || v >= 48, `${sel} ${k}:${r.decl[k]} ${r.media ? 'in ' + r.media : ''}`);
      }
    }
  }
  for (const r of CSS_RULES) {
    const v = px(r.decl['min-height']);
    assert.ok(v === null || v >= 48, `min-height:${r.decl['min-height']} on ${r.sel}`);
  }
});

test('tap targets: every link and button in the pages is a measured kind or an inline text link', () => {
  const VOID = new Set(['img', 'br', 'meta', 'link', 'input', 'hr', 'source', 'wbr']);
  const OWN = { 'lang-btn': 1, 'foot-mail': 1, mail: 1, more: 1, small: 1, brand: 1, 'contact-game': 1, skip: 1, cta: 1 };
  const ANCESTOR = ['nav', 'legal-foot', 'foot-links', 'icon-rail', 'win', 'game-name', 'links'];
  for (const f of HTML) {
    const html = read(f).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<!--[\s\S]*?-->/g, '');
    const stack = [];
    for (const m of html.matchAll(/<(\/?)([a-zA-Z0-9]+)([^>]*)>/g)) {
      const [, close, tagU, attrs] = m; const tag = tagU.toLowerCase();
      if (close) { const i = stack.map((x) => x.tag).lastIndexOf(tag); if (i >= 0) stack.length = i; continue; }
      const cls = ((attrs.match(/class="([^"]*)"/) || [])[1] || '').split(/\s+/).filter(Boolean);
      if (tag === 'a' || tag === 'button') {
        const anc = stack.flatMap((x) => x.cls);
        const parent = stack[stack.length - 1];
        // Inline means a link inside a sentence: the paragraph, without its links, must still contain words
        // (Latin or Devanagari letters), not just separators like "·" or "|".
        const rest = () => html.slice(parent.at, html.indexOf('</p>', parent.at)).replace(/<a\b[\s\S]*?<\/a>/g, ' ').replace(/<[^>]+>/g, ' ');
        const inline = tag === 'a' && parent.tag === 'p' && parent.cls.length === 0 && stack.some((x) => x.tag === 'main')
          && /[A-Za-z\u0900-\u0963\u0966-\u097F]/.test(rest());
        const ok = cls.some((c) => OWN[c]) || ANCESTOR.some((c) => anc.includes(c)) || inline;
        assert.ok(ok, `${relative(PUB, f)}: <${tag} class="${cls.join(' ')}"> in ${stack.slice(-3).map((x) => x.tag + (x.cls[0] ? '.' + x.cls[0] : '')).join(' > ')} is not a known 48px tap target`);
      }
      if (!VOID.has(tag) && !attrs.endsWith('/')) stack.push({ tag, cls, at: m.index + m[0].length });
    }
  }
});

test('Block Puzzle card lists only real features (no calendar, chest, bomb, hint or achievements)', () => {
  const site = JSON.parse(readFileSync(new URL('../data/site.data.json', import.meta.url), 'utf8'));
  const g = site.games.find((x) => x.slug === 'block-puzzle');
  const en = [g.summaryEn, g.ledeEn, ...g.featuresEn].join(' ');
  const hi = [g.summaryHi, g.ledeHi, ...g.featuresHi].join(' ');
  assert.ok(!/calendar|chest|bomb|\bhint|achievement/i.test(en), en);
  assert.ok(!/कैलेंडर|संदूक|बम|संकेत|उपलब्धि/.test(hi), hi);
  assert.match(en, /rotate, swap tray and undo/);
  assert.match(en, /7-day daily reward/);
  assert.match(hi, /घुमाओ, ट्रे बदलो और वापस लो/);
  for (const page of ['public/index.html', 'public/block-puzzle/index.html']) {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
    assert.ok(!/streak calendar|chest|bomb|स्ट्रीक कैलेंडर|संदूक/i.test(html), page);
  }
});
