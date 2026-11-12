# Bharat Joy website

The studio site for Bharat Joy games, served from Cloudflare Pages at **https://tejona.com** (later a `bharatjoy` domain).

Plain HTML, CSS and a few lines of vanilla JS. **No build step runs on Cloudflare.** Everything Cloudflare serves is already committed in `public/`.

```
data/site.data.json   the ONE file with every game name, Hindi name, package, icon, status, feature,
                      store link, privacy text, plus the site domain, support email and AdMob publisher id
tools/build.mjs       regenerates the pages in public/ from the data file (Node 18+, no dependencies)
tools/serve.mjs       local preview that behaves like Cloudflare Pages
tools/images.py       optional (needs Pillow): turns a PNG into the icon / screenshot files the site uses
tools/fonts.py        optional (needs fonttools + brotli): rebuilds the Devanagari font from the Hindi text in use
tests/site.test.mjs   node:test checks (output up to date, links, copy rules in English and Hindi, privacy vs SDKs, domain,
                      a11y basics, 48px tap targets, Devanagari font coverage)
tests/woff2-cmap.mjs  reads a WOFF2 font's character map (used by the font coverage test)
public/               the website, deployed as-is
  index.html, bharat-ludo/, block-puzzle/, sweet-mela/ (each with index.html and privacy.html),
  delete.html, terms.html, contact.html, 404.html, robots.txt, sitemap.xml, app-ads.txt, _headers,
  assets/ (css, js, fonts + licences, img)
```

## Cloudflare Pages setup (one time)

1. Cloudflare dashboard, **Workers & Pages**, **Create**, **Pages**, **Connect to Git**, pick `raju-dsrk/bharat-joy-site`.
2. Build settings:
   - Production branch: `main`
   - Framework preset: **None**
   - Build command: **leave empty** (none)
   - Build output directory: **`public`**
3. Save and deploy. You get a `*.pages.dev` address to check first.
4. `404.html` in `public/` is picked up by Pages automatically for unknown paths. `_headers` sets security and cache headers.

Pages serves `terms.html` at `/terms` and `bharat-ludo/privacy.html` at `/bharat-ludo/privacy` (the `.html` address redirects there), so both forms work in Play Console.

### Custom domain (tejona.com)

1. In the Pages project: **Custom domains**, **Set up a custom domain**, enter `tejona.com` (and optionally `www.tejona.com`).
2. If the `tejona.com` zone is on Cloudflare, Pages adds the DNS record for you. If DNS is elsewhere, add the `CNAME` record Cloudflare shows (for the apex, move the nameservers to Cloudflare, since many DNS hosts cannot CNAME an apex).
3. Remove any old Folix records for `tejona.com` that point somewhere else.
4. Wait for the certificate to show **Active**, then open https://tejona.com.

### Play Console links

- Website: `https://tejona.com`
- Privacy policy: `https://tejona.com/bharat-ludo/privacy` (and `/block-puzzle/privacy`, `/sweet-mela/privacy`)
- Data deletion URL: `https://tejona.com/delete`

## Editing content

All content that changes lives in `data/site.data.json`:

- **Rename a game:** change `nameEn` / `nameHi`. Privacy text uses `{name}`, so it follows.
- **New icon:** `python3 tools/images.py icon path/to/icon-512.png ludo-icon` writes `public/assets/img/icons/ludo-icon-96.webp`, `-192.webp` and `-512.jpg`. Point the game's `icon` at the base path (`/assets/img/icons/ludo-icon`). Screenshots: `tools/images.py shot ...`, band art: `tools/images.py band ...`.
- **Status:** `closed-testing`, `coming-soon` or `live`. Labels for each are in the `status` block. A Google Play button only appears when `status` is `live` **and** `playUrl` is set. Closed testing shows the label "Coming to Google Play" with no link.
- **Features, taglines, summaries:** `featuresEn` / `featuresHi` and friends. Hindi uses स्तर for level.
- **Privacy policy text:** each featured game's `privacy.sections`. Write it from that game's real SDKs, never by copying another game. A game only gets a privacy page when `privacy.published` is `true` (Carrom stays `false` until its release build is checked).
- **Site-wide text** (nav, footer, contact page, Hindi strings): the `strings` block.

Then:

```
node tools/build.mjs            # regenerate public/
node --test tests/*.test.mjs    # checks (also fails if you forgot to rebuild)
node tools/serve.mjs            # preview at http://localhost:5280/
```

Commit the data change **and** the regenerated `public/` files together.

Page layouts (HTML structure) live in `tools/build.mjs`; styles in `public/assets/css/site.css`; the EN | हिं toggle in `public/assets/js/lang.js`. CSS and JS are linked with a content hash, so browsers pick up changes immediately after a rebuild.

## Language

English is in the HTML, so the site reads fully without JavaScript (the toggle is hidden then). With JS, the EN | हिं toggle swaps in the Hindi strings that the build puts in each page and remembers the choice in `localStorage`. Legal pages (privacy, deletion, terms) are English only for now and show a short Hindi note; full Hindi legal text is a later follow-up.

## AdMob publisher ID (app-ads.txt)

`public/app-ads.txt` is comments only. Test ads do not need a line. When the real AdMob publisher id exists:

1. Put it in `site.admobPublisherId` in `data/site.data.json`, for example `"pub-1234567890123456"`.
2. Run `node tools/build.mjs`. The file then contains `google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0`.
3. Commit, deploy, and make sure every app's Play listing has `https://tejona.com` (the current domain) as its developer website, so AdMob can find `https://tejona.com/app-ads.txt`.

Never put a placeholder id on a real (non-comment) line.

## Moving to the bharatjoy domain later

1. Change `site.domain` in `data/site.data.json` (for example `"https://bharatjoy.in"`), run `node tools/build.mjs`, run the tests, commit. Canonical links, Open Graph tags, the sitemap and robots.txt all follow.
2. Add the new custom domain in the Pages project.
3. Update the website and privacy URLs in Play Console and AdMob.
4. Optional: keep `tejona.com` attached and add a redirect rule to the new domain so old links keep working.

## Studio rules for copy

No rupee sign, no gambling words, no pay-to-win wording, no dark patterns, no fake online players, no em-dashes, Android / Google Play only. Coins are earned for play and have no money value. Screenshots on the site show no entry cost next to a coin reward (no stake and payout look). Tap targets are at least 48x48 px at every width; a link inside a sentence is the only exception. The tests check most of this.

## Never commit

Keystores, `keystore.properties`, `google-services.json`, `.env*` files or tokens. `.gitignore` blocks the usual names and a test fails if one is tracked.

## Fonts

Self-hosted from `public/assets/fonts/` (no Google Fonts requests). All are under the SIL Open Font License 1.1; licence texts are in `public/assets/fonts/licenses/`. Yeseva One is converted to WOFF2 without changes (it has a Reserved Font Name); EB Garamond and Literata are subset to Latin. Noto Serif Devanagari keeps only the Hindi letters the site uses, with all their shaping rules. The tests read the font file's own character map (`tests/woff2-cmap.mjs`, no dependencies). If new Hindi text adds a letter, the tests fail and say to run `python3 tools/fonts.py path/to/NotoSerifDevanagari.ttf` (the variable font from Google Fonts), then rebuild.
