// Generates the favicon set and the link preview image in public/ from the Cobalt tokens.
// Not part of the build: run it after changing the design, then commit the output.
//   NODE_PATH=$(npm root -g) node scripts/generate-brand-assets.mjs
// It uses the Playwright Chromium that is already installed, and the bundled Fontsource fonts.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const pub = (name) => `${root}public/${name}`;

/** oklch (lightness 0..1, chroma, hue in degrees) to a #rrggbb string. */
function hex(L, C, h) {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return '#' + lin.map((v) => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055))).toString(16).padStart(2, '0')).join('');
}

// Cobalt tokens (src/styles/tokens.scss)
const C = {
  paper: hex(0.986, 0.005, 250),
  paper2: hex(0.962, 0.008, 252),
  ink: hex(0.21, 0.028, 262),
  ink2: hex(0.36, 0.022, 260),
  muted: hex(0.5, 0.018, 258),
  rule: hex(0.9, 0.009, 252),
  rule2: hex(0.83, 0.012, 252),
  accent: hex(0.52, 0.19, 258),
  accentEdge: hex(0.39, 0.16, 260),
  warning: hex(0.44, 0.1, 65),
  success: hex(0.44, 0.1, 155),
};

// The journey icon the app uses (24 x 24, stroked).
const JOURNEY = 'M5 3v6M5 15v6M19 9v6M5 9a2 2 0 100 6 2 2 0 000-6zM19 3a2 2 0 100 6 2 2 0 000-6zM19 15a2 2 0 100 6 2 2 0 000-6zM7 12h4a4 4 0 004-4V6M15 18h-4';

/** The mark: the journey icon in paper on a cobalt square. `inset` is the padding as a share of the side. */
function markSvg({ rounded, inset }) {
  const size = 32;
  const inner = size * (1 - 2 * inset);
  const scale = inner / 24;
  const off = size * inset;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><rect width="${size}" height="${size}"${rounded ? ' rx="7"' : ''} fill="${C.accent}"/><g transform="translate(${off} ${off}) scale(${scale})" fill="none" stroke="${C.paper}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="${JOURNEY}"/></g></svg>`;
}

const font = (file, family, weight) => `@font-face{font-family:'${family}';font-weight:${weight};src:url(data:font/woff2;base64,${readFileSync(`${root}node_modules/@fontsource/${file}`).toString('base64')}) format('woff2')}`;

function previewHtml() {
  const card = (n, title, sub, chip, chipColor) => `
    <div class="card"><span class="n">${n}</span><div class="t"><b>${title}</b><span>${sub}</span><i style="color:${chipColor};border-color:${chipColor}">${chip}</i></div></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${font('familjen-grotesk/files/familjen-grotesk-latin-600-normal.woff2', 'Familjen Grotesk', 600)}
${font('ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2', 'IBM Plex Sans', 400)}
${font('ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2', 'IBM Plex Sans', 500)}
${font('jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2', 'JetBrains Mono', 400)}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:${C.paper};color:${C.ink};font-family:'IBM Plex Sans',sans-serif;position:relative;overflow:hidden}
.left{position:absolute;left:72px;top:64px;width:600px;height:502px;display:flex;flex-direction:column}
.brand{display:flex;align-items:center;gap:20px}
.brand svg{width:72px;height:72px;display:block}
.brand span{font:600 34px 'Familjen Grotesk';letter-spacing:-0.02em}
h1{font:600 80px/1.02 'Familjen Grotesk';letter-spacing:-0.028em;margin-top:56px}
p{font-size:29px;line-height:1.35;color:${C.ink2};margin-top:28px;max-width:560px}
.url{margin-top:auto;font:400 20px 'JetBrains Mono';color:${C.muted};white-space:nowrap}
.right{position:absolute;left:700px;top:64px;width:428px;height:502px;background:${C.paper2};border:1px solid ${C.rule};border-radius:16px;padding:32px;display:flex;flex-direction:column;justify-content:center}
.card{display:flex;align-items:center;gap:16px;background:${C.paper};border:1px solid ${C.rule2};border-radius:16px 4px 16px 4px;padding:18px 20px}
.n{flex:none;width:36px;height:36px;align-self:flex-start;border-radius:4px;background:${C.ink};color:${C.paper};font:600 20px 'IBM Plex Sans';display:flex;align-items:center;justify-content:center}
.t{display:flex;flex-direction:column;align-items:flex-start;gap:4px;flex:1;min-width:0}
.t b{font:600 22px 'Familjen Grotesk'}
.t span{font-size:17px;color:${C.muted}}
i{margin-top:6px;font:500 16px 'IBM Plex Sans';font-style:normal;border:1px solid;border-radius:4px;padding:3px 10px;white-space:nowrap}
.line{width:1px;height:20px;background:${C.rule2};margin:0 0 0 38px}
</style></head><body>
<div class="left">
  <div class="brand">${markSvg({ rounded: true, inset: 0.16 })}<span>B2C policy editor</span></div>
  <h1>See when each step runs</h1>
  <p>Understand Azure AD B2C custom policies: preconditions in plain words and the claims in the user session at every step.</p>
  <div class="url">adb2cpolicyeditor.anchitmathur.in</div>
</div>
<div class="right">
  ${card(1, 'Sign-in page', 'Self-asserted', 'Always runs', C.success)}
  <div class="line"></div>
  ${card(2, 'Directory read', 'Skipped if objectId exists', 'Runs in some cases', C.warning)}
  <div class="line"></div>
  ${card(3, 'Issue token', 'Relying party claims', 'Always runs', C.success)}
</div>
</body></html>`;
}

/** An .ico that holds PNG images. */
function ico(images) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const dir = images.map(({ size, png }) => {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    return e;
  });
  return Buffer.concat([head, ...dir, ...images.map((i) => i.png)]);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const renderSvg = async (svg, px, transparent) => {
    await page.setViewportSize({ width: px, height: px });
    await page.setContent(`<body style="margin:0;background:transparent">${svg.replace('width="32" height="32"', `width="${px}" height="${px}"`)}</body>`);
    return page.screenshot({ type: 'png', omitBackground: transparent, clip: { x: 0, y: 0, width: px, height: px } });
  };

  const rounded = markSvg({ rounded: true, inset: 0.16 });
  const bleed = markSvg({ rounded: false, inset: 0.22 });
  writeFileSync(pub('favicon.svg'), rounded + '\n');
  writeFileSync(pub('favicon.ico'), ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, png: await renderSvg(rounded, size, true) })))));
  writeFileSync(pub('apple-touch-icon.png'), await renderSvg(bleed, 180, false));
  writeFileSync(pub('icon-192.png'), await renderSvg(bleed, 192, false));
  writeFileSync(pub('icon-512.png'), await renderSvg(bleed, 512, false));
  writeFileSync(
    pub('site.webmanifest'),
    JSON.stringify(
      {
        name: 'B2C policy editor',
        short_name: 'B2C editor',
        description: 'Visual editor for Azure AD B2C custom policies.',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: C.paper,
        theme_color: C.accent,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      null,
      2,
    ) + '\n',
  );

  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(previewHtml());
  await page.evaluate(() => document.fonts.ready);
  writeFileSync(pub('og-image.png'), await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1200, height: 630 } }));
  console.log('wrote favicon.svg, favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png, site.webmanifest, og-image.png');
  console.log('accent', C.accent, 'paper', C.paper);
} finally {
  await browser.close();
}
