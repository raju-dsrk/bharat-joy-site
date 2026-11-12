#!/usr/bin/env node
// Generates every page in public/ from data/site.data.json. No dependencies.
//   node tools/build.mjs           write public/
//   node tools/build.mjs --check   exit 1 if public/ is out of date with the data file
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public');
const DATA = JSON.parse(readFileSync(join(ROOT, 'data/site.data.json'), 'utf8'));
const S = DATA.site;
const DOMAIN = S.domain.replace(/\/+$/, '');
const HOST = DOMAIN.replace(/^https?:\/\//, '');
const STR = DATA.strings;
const FEATURED = DATA.games.filter((g) => g.featured);
const WORKSHOP = DATA.games.filter((g) => !g.featured);
const WITH_POLICY = FEATURED.filter((g) => g.privacy && g.privacy.published);

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fill = (s, g = {}) => String(s ?? '')
  .replace(/\{name\}/g, g.nameEn ?? '')
  .replace(/\{nameHi\}/g, g.nameHi ?? '')
  .replace(/\{package\}/g, g.package ?? '')
  .replace(/\{studio\}/g, S.studio)
  .replace(/\{email\}/g, S.supportEmail)
  .replace(/\{domain\}/g, DOMAIN)
  .replace(/\{host\}/g, HOST);
const hashOf = (rel) => createHash('sha1').update(readFileSync(join(OUT, rel))).digest('hex').slice(0, 10);
const ASSET_V = { css: hashOf('assets/css/site.css'), js: hashOf('assets/js/lang.js') };

// URLs. Cloudflare Pages serves /terms.html at /terms and /x/index.html at /x/, so links and canonicals use those forms.
const url = {
  home: '/',
  game: (g) => `/${g.slug}/`,
  privacy: (g) => `/${g.slug}/privacy`,
  delete: '/delete',
  terms: '/terms',
  contact: '/contact',
};
const abs = (p) => DOMAIN + p;

// ---------- i18n: English is in the HTML; Hindi goes in a per-page JSON block that lang.js swaps in ----------
function makeT() {
  const dict = {};
  let n = 0;
  const t = (en, hi, { tag = 'span', attrs = '', html = false } = {}) => {
    const key = `t${++n}`;
    const enOut = html ? en : esc(en);
    if (hi) dict[key] = html ? hi : esc(hi);
    return `<${tag} data-i18n="${key}"${attrs ? ' ' + attrs : ''}>${enOut}</${tag}>`;
  };
  const s = (k, g, opts) => t(fill(STR[k].en, g), fill(STR[k].hi, g), opts);
  return { t, s, dict };
}

const statusOf = (g) => DATA.status[g.status] || DATA.status['coming-soon'];
const icon = (g, size, cls = '', alt = '', extra = '') =>
  `<img class="${cls}" src="${g.icon}-${size <= 96 ? 96 : 192}.webp" width="${size}" height="${size}" alt="${esc(alt)}"${extra}>`;

function phone(shot, { eager = false, cls = '' } = {}) {
  return `<div class="phone ${cls}"><div class="bezel"><div class="screen"><img src="${shot.src}" width="${shot.w}" height="${shot.h}" alt="${esc(shot.altEn)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></div></div></div>`;
}

function cta(g, T) {
  const st = statusOf(g);
  if (g.status === 'live' && g.playUrl) {
    return `<a class="cta" href="${esc(g.playUrl)}" rel="noopener">${T.t(st.ctaEn, st.ctaHi)}</a>`;
  }
  return st.ctaEn ? `<span class="cta cta-label">${T.t(st.ctaEn, st.ctaHi)}</span>` : '';
}

const toran = () => {
  let beads = '';
  for (let i = 0; i < 10; i++) beads += '<span class="leaf"></span><span class="bead"></span>';
  return `<div class="toran" aria-hidden="true">${beads}<span class="leaf"></span></div>`;
};

function langToggle(T) {
  return `<div class="lang" role="group" aria-label="${esc(STR.langLabel.en)} / ${esc(STR.langLabel.hi)}">
      <button type="button" class="lang-btn" data-lang="hi" lang="hi" aria-pressed="false" aria-label="हिंदी">हिं</button>
      <button type="button" class="lang-btn" data-lang="en" lang="en" aria-pressed="true" aria-label="English">EN</button>
    </div>`;
}

function header(T, kind, current) {
  const navLinks = (kind === 'home'
    ? [['#games', 'navGames'], ['#workshop', 'navWorkshop'], ['#policies', 'navPrivacy'], [url.contact, 'navContact']]
    : [['/#games', 'navGames'], ['/#workshop', 'navWorkshop'], ['/#policies', 'navPrivacy'], [url.contact, 'navContact']])
    .map(([href, k]) => `<a href="${href}"${current === href ? ' aria-current="page"' : ''}>${T.s(k)}</a>`).join('\n      ');
  const nav = `<nav class="nav" aria-label="Main">
      ${navLinks}
    </nav>`;
  if (kind === 'home') {
    return `<header class="site-header home-header">
    ${langToggle(T)}
    ${nav}
  </header>`;
  }
  return `<header class="site-header">
    <a class="brand" href="/">${esc(S.studio)}<span lang="hi">${esc(S.studioHi)}</span></a>
    ${nav}
    ${langToggle(T)}
  </header>`;
}

function policyLinks(T) {
  return WITH_POLICY.map((g) => `<li><a href="${url.privacy(g)}">${T.s('privacyFor', g)}</a></li>`).join('\n          ')
    + `\n          <li><a href="${url.delete}">${T.s('delete')}</a></li>
          <li><a href="${url.terms}">${T.s('terms')}</a></li>
          <li><a href="${url.contact}">${T.s('contact')}</a></li>`;
}

function footer(T) {
  return `<footer class="site-footer" id="policies">
    <div>
      <p class="colophon-title">${esc(S.studio)} <span lang="hi">${esc(S.studioHi)}</span></p>
      <p>${T.s('footAbout')}</p>
    </div>
    <div>
      <p class="foot-h">${T.s('footSupport')}</p>
      <p><a href="mailto:${S.supportEmail}">${S.supportEmail}</a><br>${esc(HOST)}</p>
    </div>
    <div>
      <p class="foot-h">${T.s('footPolicies')}</p>
      <ul class="foot-links">
          ${policyLinks(T)}
      </ul>
    </div>
  </footer>`;
}

function head({ title, description, path, ogImage, ogImageAlt, twitterCard = 'summary', noindex = false, jsonld = '' }) {
  const img = abs(ogImage || S.ogImage);
  return `<!DOCTYPE html>
<html lang="en" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${abs(path)}">`}
<meta name="theme-color" content="${S.themeColor}">
<meta name="color-scheme" content="light">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preload" href="/assets/fonts/YesevaOne.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/Literata-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/site.css?v=${ASSET_V.css}">
<meta property="og:site_name" content="${esc(S.studio)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="en_IN">
<meta property="og:locale:alternate" content="hi_IN">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
${noindex ? '' : `<meta property="og:url" content="${abs(path)}">\n`}<meta property="og:image" content="${img}">
<meta property="og:image:alt" content="${esc(ogImageAlt || S.studio)}">
<meta name="twitter:card" content="${twitterCard}">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${img}">
${jsonld}</head>`;
}

function page({ T, headOpts, kind = 'inner', current = '', body, fullFooter = true, legal = false }) {
  const skip = T.s('skip');
  const top = header(T, kind, current);
  const bottom = fullFooter ? footer(T) : '';
  const dict = JSON.stringify(T.dict).replace(/</g, '\\u003c');
  return `${head(headOpts)}
<body${legal ? ' class="legal-page"' : ''}>
<a class="skip" href="#main">${skip}</a>
<div class="page${kind === 'home' ? ' page-home' : ''}">
  ${top}
${body}
  ${bottom}
</div>
<script type="application/json" id="i18n-hi">${dict}</script>
<script src="/assets/js/lang.js?v=${ASSET_V.js}"></script>
</body>
</html>
`;
}

// ---------- Home ----------
function homePage() {
  const T = makeT();
  const windows = FEATURED.map((g) => `<li class="win"><a href="${url.game(g)}" aria-label="${esc(g.nameEn)}"><img src="${g.band}" alt="${esc(g.bandAltEn)}" width="400" height="300" fetchpriority="high" decoding="async"></a></li>`).join('\n        ');
  const rail = DATA.games.map((g) => `<li>${g.featured
    ? `<a href="${url.game(g)}" aria-label="${esc(g.nameEn)}">${icon(g, 48, '', '')}</a>`
    : `<span class="rail-quiet" title="${esc(g.nameEn)}">${icon(g, 48, '', g.nameEn)}</span>`}</li>`).join('\n        ');
  const entries = FEATURED.map((g, i) => {
    const st = statusOf(g);
    return `    <article class="entry${i % 2 ? ' alt' : ''}" aria-labelledby="g-${g.id}">
      <div class="frame">${phone(g.shots[0], { cls: 'lift' })}</div>
      <div class="copy">
        <h3 class="game-name" id="g-${g.id}"><a href="${url.game(g)}">${esc(g.nameEn)}</a></h3>
        <p class="hn" lang="hi">${esc(g.nameHi)}</p>
        <p class="pill">${T.t(st.pillEn, st.pillHi)}</p>
        <p class="body">${T.t(g.summaryEn, g.summaryHi)}</p>
        <a class="more" href="${url.game(g)}">${T.s('readAbout', g)}</a>
      </div>
    </article>`;
  }).join('\n');
  const workshop = WORKSHOP.map((g) => `<li>${icon(g, 52, '', '', ' loading="lazy" decoding="async"')}<div><strong>${esc(g.nameEn)}</strong><span lang="hi">${esc(g.nameHi)}</span><em>${T.t(g.lineEn, g.lineHi)}</em></div></li>`).join('\n      ');
  const body = `
  ${toran()}
  <main id="main">
  <section class="hero" aria-labelledby="studio-title">
    <p class="kicker">${T.s('homeKicker')}</p>
    <h1 id="studio-title" class="sheen">${esc(S.studio)}</h1>
    <p class="hi" lang="hi">${esc(S.studioHi)}</p>
    <p class="tag">${T.s('homeTag')}</p>
    <p class="manifesto">${T.s('homeManifesto')}</p>
  </section>

  <section class="studio-band" aria-label="${esc(STR.bandLabel.en)}">
    <ul class="windows">
        ${windows}
    </ul>
    <ul class="icon-rail">
        ${rail}
    </ul>
  </section>
  <p class="band-caption">${T.s('bandCaption')}</p>

  <section class="catalog" id="games" aria-labelledby="games-title">
    <div class="catalog-intro">
      <h2 id="games-title">${T.s('gamesTitle')}</h2>
      <p>${T.s('gamesIntro')}</p>
    </div>
${entries}
  </section>

  <section class="workshop" id="workshop" aria-labelledby="workshop-title">
    <h2 id="workshop-title">${T.s('workshopTitle')}</h2>
    <p class="lead">${T.s('workshopLead')}</p>
    <ul class="contents">
      ${workshop}
    </ul>
  </section>
  </main>`;
  const jsonld = `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Organization', name: S.studio, alternateName: S.studioHi,
    url: DOMAIN + '/', logo: abs('/assets/img/bj-mark-192.png'), email: S.supportEmail,
  })}</script>\n`;
  return page({
    T, kind: 'home', body,
    headOpts: {
      title: `${S.studio}: games from India for Google Play`,
      description: `${S.studio} makes casual Android games in English and Hindi: ${FEATURED.map((g) => g.nameEn).join(', ')}. Fair play, and coins you earn that have no money value.`,
      path: '/', ogImage: S.ogImage, ogImageAlt: `${S.studio} with ${FEATURED.map((g) => g.nameEn).join(', ')}`, twitterCard: 'summary_large_image', jsonld,
    },
  });
}

// ---------- Game page ----------
function gamePage(g) {
  const T = makeT();
  const st = statusOf(g);
  const feats = g.featuresEn.map((f, i) => `<li>${T.t(f, g.featuresHi[i])}</li>`).join('\n        ');
  const body = `
  <main id="main">
  <section class="game-hero" aria-labelledby="game-title">
    <div class="frame">${phone(g.shots[0], { eager: true, cls: 'float' })}</div>
    <div class="game-copy">
      ${icon(g, 84, 'game-icon', `${g.nameEn} icon`, ' fetchpriority="high"')}
      <p class="kicker">${T.s('gameKicker')}</p>
      <h1 id="game-title">${esc(g.nameEn)}</h1>
      <p class="hi" lang="hi">${esc(g.nameHi)}</p>
      <p class="pill">${T.t(st.pillEn, st.pillHi)}</p>
      <p class="tag">${T.t(g.taglineEn, g.taglineHi)}</p>
      <p class="lede">${T.t(g.ledeEn, g.ledeHi)}</p>
    </div>
  </section>

  <section class="feature-block" aria-labelledby="feat-title">
    <div class="feat-copy">
      <h2 id="feat-title">${T.t(g.featuresTitleEn, g.featuresTitleHi)}</h2>
      <ul class="feats">
        ${feats}
      </ul>
    </div>
    <figure class="feat-shot">
      ${phone(g.shots[1])}
      <figcaption class="sr-only">${T.s('screens')}</figcaption>
    </figure>
  </section>

  <p class="note">${T.s('coinsNote', g)}</p>
  <p class="links">
    ${cta(g, T)}
    ${g.privacy.published ? `<a href="${url.privacy(g)}">${T.s('privacyPolicy')}</a>` : ''}
  </p>
  </main>`;
  return page({
    T, body, current: '',
    headOpts: {
      title: `${g.nameEn} (${g.nameHi}) | ${S.studio}`,
      description: `${g.ledeEn} ${st.pillEn}.`,
      path: url.game(g), ogImage: `${g.icon}-512.jpg`, ogImageAlt: `${g.nameEn} icon`,
    },
  });
}

// ---------- Privacy page ----------
function privacyPage(g) {
  const T = makeT();
  const p = g.privacy;
  const sections = p.sections.map((sec) => `
    <h2>${esc(fill(sec.h, g))}</h2>
    ${sec.p.map((para) => `<p>${fill(para, g)}</p>`).join('\n    ')}`).join('\n');
  const body = `
  <main id="main" class="legal">
  <p class="legal-note" lang="hi" data-i18n-show="hi" hidden>${esc(STR.legalEnOnly.hi)}</p>
  <article class="wrap" lang="en">
    <p class="kicker">${esc(S.studio)}</p>
    <h1>Privacy policy<br>for ${esc(g.nameEn)}</h1>
    <p class="hi" lang="hi">${esc(g.nameHi)} · गोपनीयता नीति</p>
    <p class="meta">Developer: ${esc(S.studio)}. This page is for the Android edition of ${esc(g.nameEn)} on Google Play (package ${esc(g.package)}). Effective date: <time datetime="${S.legalEffectiveISO}">${esc(S.legalEffectiveDate)}</time>. A Hindi version of this policy will follow.</p>

    <h2>What stays on your phone</h2>
    <p>The app saves the following in private storage on the device. It is not uploaded.</p>
    <ul>
      ${p.stays.map((x) => `<li>${esc(fill(x, g))}</li>`).join('\n      ')}
    </ul>
    <p>Uninstalling the app deletes this data. There is no ${esc(S.studio)} account and no game server, so there is nothing of yours to delete on our side. See the <a href="${url.delete}">data deletion page</a>.</p>
${sections}

    <h2>What we do not do</h2>
    <ul>
      <li>We do not upload your name, picture, gender or coin balance.</li>
      <li>We do not sell personal information.</li>
      <li>We do not show fake online players.</li>
      <li>Coins are virtual play coins with no money value. They cannot be bought, sold or cashed out.</li>
    </ul>

    <h2>Security</h2>
    <p>Everything the app sends over the internet, as described above, travels encrypted over HTTPS.</p>

    <h2>Children</h2>
    <p>${esc(g.nameEn)} is not directed at children under 13. It does not knowingly collect personal information from children.</p>

    <h2>Changes</h2>
    <p>If a later version changes the ad network or analytics, or adds an account server, this policy and the Google Play Data safety form will be updated before that version ships.</p>

    <hr class="rule">
    <h2>Contact</h2>
    <p>${esc(S.studio)}. Questions about this policy or your data: <a href="mailto:${S.supportEmail}">${S.supportEmail}</a></p>
  </article>
  </main>
  <nav class="legal-foot" aria-label="Related">
    <a href="${url.game(g)}">${T.s('backTo', g)}</a>
    <a href="${url.delete}">${T.s('delete')}</a>
    <a href="/">${esc(S.studio)}</a>
  </nav>`;
  return page({
    T, body, legal: true,
    headOpts: {
      title: `Privacy policy: ${g.nameEn} | ${S.studio}`,
      description: `How ${g.nameEn} (${g.package}) handles data: what stays on your phone, ads, and how to delete your data.`,
      path: url.privacy(g), ogImage: `${g.icon}-512.jpg`, ogImageAlt: `${g.nameEn} icon`,
    },
  });
}

function legalShell(T, { h1, hi, metaHtml, inner, title, description, path, current }) {
  const body = `
  <main id="main" class="legal">
  <p class="legal-note" lang="hi" data-i18n-show="hi" hidden>${esc(STR.legalEnOnly.hi)}</p>
  <article class="wrap" lang="en">
    <p class="kicker">${esc(S.studio)}</p>
    <h1>${h1}</h1>
    <p class="hi" lang="hi">${esc(hi)}</p>
    <p class="meta">${metaHtml}</p>
${inner}
  </article>
  </main>`;
  return page({ T, body, legal: true, current, headOpts: { title, description, path } });
}

function deletePage() {
  const T = makeT();
  const games = WITH_POLICY.map((g) => `<li>${esc(g.nameEn)} <span lang="hi">(${esc(g.nameHi)})</span>, package ${esc(g.package)}</li>`).join('\n      ');
  const fb = WITH_POLICY.filter((g) => /Firebase Analytics/.test(JSON.stringify(g.privacy.sections)));
  const inner = `
    <h2>There is no account to delete</h2>
    <p>Our games do not have sign-in, cloud saves or a game server. Your name, picture, optional gender, coins and progress are kept only on your phone. This page covers:</p>
    <ul>
      ${games}
    </ul>

    <h2>Delete everything the game saved</h2>
    <p>Do either of these on your phone:</p>
    <ol>
      <li>Uninstall the game. This removes all of its saved data.</li>
      <li>Or open Settings, then Apps, choose the game, then Storage, and tap Clear storage (on some phones, Clear data). The game starts fresh next time.</li>
    </ol>
    <p>We cannot restore this data after it is removed, because we never had a copy.</p>

    <h2>Advertising ID</h2>
    <p>Ads come from Google AdMob, which uses your phone's advertising ID. To delete or reset it, open Settings, then Google, then Ads, and choose Delete advertising ID (or Reset advertising ID on older Android versions). Google handles ad data under its own <a href="https://policies.google.com/privacy">privacy policy</a>.</p>
${fb.length ? `
    <h2>Usage events in ${fb.map((g) => esc(g.nameEn)).join(', ')}</h2>
    <p>${fb.map((g) => esc(g.nameEn)).join(', ')} sends anonymous usage events to Google Firebase Analytics, linked to a random app-instance ID and not to your name. Uninstalling or clearing storage removes that ID from your phone, so older events are no longer linked to it. Google keeps those events only for the retention period set for the project, and then deletes them. If you would like us to ask for them to be deleted sooner, write to us.</p>
` : ''}
    <h2>Questions</h2>
    <p>Write to <a href="mailto:${S.supportEmail}">${S.supportEmail}</a> with the name of the game. We will never ask for a password.</p>`;
  return legalShell(T, {
    h1: 'Delete your data', hi: 'अपना डेटा हटाएँ',
    metaHtml: `How to remove data from ${esc(S.studio)} games on Android. Effective date: <time datetime="${S.legalEffectiveISO}">${esc(S.legalEffectiveDate)}</time>.`,
    inner, current: url.delete,
    title: `Delete your data | ${S.studio}`,
    description: `How to delete your data from ${S.studio} games: no account, uninstall or clear storage, and reset the advertising ID.`,
    path: url.delete,
  });
}

function termsPage() {
  const T = makeT();
  const inner = `
    <h2>Who we are</h2>
    <p>${esc(S.studio)} is a small studio that makes casual games for Android phones, published on Google Play. These terms cover our games and this website (${esc(HOST)}).</p>

    <h2>Using the games</h2>
    <p>You may install and play our games for your own personal, non-commercial use. Google Play's terms also apply to downloads from Google Play.</p>

    <h2>Ads</h2>
    <p>Our games are free and show ads from Google AdMob. Rewarded ads are always your choice. We do not show full-screen ads between games.</p>

    <h2>Coins and rewards</h2>
    <ul>
      <li>Coins, spins, items and other rewards are virtual and exist only inside the game for play.</li>
      <li>They have no money value. They cannot be bought, sold, traded, transferred or cashed out, and nothing in our games pays out money or anything else of value.</li>
      <li>Coins are earned by playing, by daily rewards, or by watching an optional ad. They never buy an advantage over another person.</li>
      <li>Because progress is saved only on your phone, it is lost if you uninstall the game or clear its storage.</li>
      <li>We may change how rewards work in a later version.</li>
    </ul>

    <h2>Fair play</h2>
    <p>Dice, tiles and boards are random and are never adjusted against you. Computer opponents are always labelled. Please do not modify the games, tamper with their saved data, or use tools to cheat.</p>

    <h2>Our content</h2>
    <p>The game names, art, music and code belong to ${esc(S.studio)}, apart from third-party parts used under their own licences (for example the open fonts on this website, each under the SIL Open Font License: <a href="/assets/fonts/licenses/OFL-yesevaone.txt">Yeseva One</a>, <a href="/assets/fonts/licenses/OFL-ebgaramond.txt">EB Garamond</a>, <a href="/assets/fonts/licenses/OFL-literata.txt">Literata</a> and <a href="/assets/fonts/licenses/OFL-notoserifdevanagari.txt">Noto Serif Devanagari</a>).</p>

    <h2>No warranty</h2>
    <p>The games are provided as they are. We work to keep them running well, but we cannot promise they will always be free of bugs or available. To the extent the law allows, ${esc(S.studio)} is not liable for indirect losses from using the games.</p>

    <h2>Changes</h2>
    <p>We may update these terms. The date at the top will change when we do.</p>

    <h2>Law</h2>
    <p>These terms are governed by the laws of India.</p>

    <h2>Contact</h2>
    <p>Write to <a href="mailto:${S.supportEmail}">${S.supportEmail}</a>.</p>`;
  return legalShell(T, {
    h1: 'Terms of use', hi: 'उपयोग की शर्तें',
    metaHtml: `For ${esc(S.studio)} games on Android and this website. Effective date: <time datetime="${S.legalEffectiveISO}">${esc(S.legalEffectiveDate)}</time>.`,
    inner, current: url.terms,
    title: `Terms of use | ${S.studio}`,
    description: `Short terms of use for ${S.studio} games: ads, virtual coins with no money value, and fair play.`,
    path: url.terms,
  });
}

function contactPage() {
  const T = makeT();
  const games = FEATURED.map((g) => `<li><a class="contact-game" href="${url.game(g)}">${icon(g, 48, '', '', ' loading="lazy" decoding="async"')}<span><strong>${esc(g.nameEn)}</strong><span lang="hi">${esc(g.nameHi)}</span></span></a>${g.privacy.published ? ` <a class="small" href="${url.privacy(g)}">${T.s('privacyPolicy')}</a>` : ''}</li>`).join('\n        ');
  const body = `
  <main id="main" class="contact">
  <section class="wrap">
    <p class="kicker">${esc(S.studio)}</p>
    <h1>${T.s('contactTitle')}</h1>
    <p class="lede">${T.s('contactLead')}</p>
    <div class="mail-card">
      <p class="foot-h">${T.s('contactEmail')}</p>
      <a class="mail" href="mailto:${S.supportEmail}">${S.supportEmail}</a>
    </div>
    <p>${T.s('contactTips')}</p>
    <p>${T.s('contactNoAccount')}</p>
    <h2>${T.s('contactPolicies')}</h2>
    <ul class="contact-games">
        ${games}
    </ul>
    <p><a href="${url.delete}">${T.s('delete')}</a> · <a href="${url.terms}">${T.s('terms')}</a></p>
  </section>
  </main>`;
  return page({
    T, body, current: url.contact,
    headOpts: {
      title: `Contact | ${S.studio}`,
      description: `Contact ${S.studio} for help with a game or a question about your data: ${S.supportEmail}.`,
      path: url.contact,
    },
  });
}

function notFoundPage() {
  const T = makeT();
  const board = `<svg class="still-board" viewBox="0 0 150 150" role="img" aria-label="A Ludo board with one pawn waiting">
      <rect x="1" y="1" width="148" height="148" rx="8" fill="#fff8e7" stroke="#6b1d24" stroke-width="2"/>
      <rect x="6" y="6" width="54" height="54" rx="6" fill="#d94b4b"/><rect x="90" y="6" width="54" height="54" rx="6" fill="#3c9a5f"/>
      <rect x="6" y="90" width="54" height="54" rx="6" fill="#4f7fd9"/><rect x="90" y="90" width="54" height="54" rx="6" fill="#e9b730"/>
      <rect x="16" y="16" width="34" height="34" rx="17" fill="#fff8e7"/><rect x="100" y="16" width="34" height="34" rx="17" fill="#fff8e7"/>
      <rect x="16" y="100" width="34" height="34" rx="17" fill="#fff8e7"/><rect x="100" y="100" width="34" height="34" rx="17" fill="#fff8e7"/>
      <path d="M60 60 L90 60 L75 75Z" fill="#3c9a5f"/><path d="M90 60 L90 90 L75 75Z" fill="#e9b730"/><path d="M90 90 L60 90 L75 75Z" fill="#4f7fd9"/><path d="M60 90 L60 60 L75 75Z" fill="#d94b4b"/>
      <g stroke="#c9b48a" stroke-width="1" fill="none"><path d="M60 6v54M70 6v54M80 6v54M90 6v54M60 90v54M70 90v54M80 90v54M90 90v54M6 60h54M6 70h54M6 80h54M6 90h54M90 60h54M90 70h54M90 80h54M90 90h54"/></g>
      <g transform="translate(117 117)"><circle r="7" fill="#c4891a" stroke="#6b1d24" stroke-width="2"/><circle r="2.5" fill="#6b1d24"/></g>
    </svg>`;
  const body = `
  <main id="main" class="nf">
  <section class="wrap center">
    ${board}
    <p class="kicker">404</p>
    <h1>${T.s('notFoundTitle')}</h1>
    <p class="lede">${T.s('notFoundBody')}</p>
    <p><a class="more" href="/">${T.s('notFoundBack')}</a></p>
  </section>
  </main>`;
  return page({ T, body, headOpts: { title: `Page not found | ${S.studio}`, description: 'This page is not here.', path: '/404', noindex: true } });
}

// ---------- Text files ----------
const sitemapPaths = ['/', ...FEATURED.map(url.game), ...WITH_POLICY.map(url.privacy), url.delete, url.terms, url.contact];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapPaths.map((p) => `  <url><loc>${abs(p)}</loc><lastmod>${S.legalEffectiveISO}</lastmod></url>`).join('\n')}
</urlset>
`;
const robots = `User-agent: *
Allow: /

Sitemap: ${abs('/sitemap.xml')}
`;
const pub = (S.admobPublisherId || '').trim();
const appAds = `# ${S.studio} / ${HOST}
# app-ads.txt for ${S.studio} games on Google Play.
${pub
    ? `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`
    : `# TODO: add the real AdMob publisher ID before production ads go live.
# Test ads do not require a line here.
# To add it: put the id (pub-...) in site.admobPublisherId in data/site.data.json
# and run node tools/build.mjs. The build writes this line:
# google.com, pub-<your id>, DIRECT, f08c47fec0942fa0
`}`;

// ---------- Write or check ----------
const files = {
  'index.html': homePage(),
  'delete.html': deletePage(),
  'terms.html': termsPage(),
  'contact.html': contactPage(),
  '404.html': notFoundPage(),
  'sitemap.xml': sitemap,
  'robots.txt': robots,
  'app-ads.txt': appAds,
};
for (const g of FEATURED) {
  files[`${g.slug}/index.html`] = gamePage(g);
  if (g.privacy.published) files[`${g.slug}/privacy.html`] = privacyPage(g);
}

const check = process.argv.includes('--check');
let stale = [];
for (const [rel, content] of Object.entries(files)) {
  const dest = join(OUT, rel);
  const current = existsSync(dest) ? readFileSync(dest, 'utf8') : null;
  if (current === content) continue;
  if (check) { stale.push(rel); continue; }
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, content);
  console.log('wrote', rel);
}
if (check) {
  if (stale.length) {
    console.error(`public/ is out of date with data/site.data.json. Run: node tools/build.mjs\n  ${stale.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`public/ is up to date (${Object.keys(files).length} generated files).`);
} else {
  console.log(`done: ${Object.keys(files).length} generated files for ${DOMAIN}`);
}
