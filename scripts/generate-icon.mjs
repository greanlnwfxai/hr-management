import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'apps', 'mobile', 'assets');

mkdirSync(ASSETS_DIR, { recursive: true });

const SIZE = 1024;

// Layout (baseline-anchored, no dominant-baseline — librsvg honours it inconsistently):
//   STEP  font-size 230, weight 800 — cap-height ≈ 165 px above baseline
//     cap top  ≈ 338   baseline y = 503
//   Divider at y = 528  (25 px gap below STEP baseline)
//   Connect font-size 158, weight 400 — cap-height ≈ 113 px above baseline
//     cap top  ≈ 574   baseline y = 687  (46 px gap below divider)
//   Total content span 338–687 = 349 px → centre = 512 ✓
//   All elements within iOS safe-zone margin (≥ 87 px from edge).

const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <!-- Background: dark royal blue #1E3A8A -->
  <rect width="${SIZE}" height="${SIZE}" fill="#1E3A8A"/>

  <!-- STEP: extra-bold white text, baseline at y=503 -->
  <text x="512" y="503"
        font-family="'Helvetica Neue', Helvetica, Arial, sans-serif"
        font-size="230" font-weight="800" fill="#FFFFFF"
        text-anchor="middle" letter-spacing="6">STEP</text>

  <!-- Divider: thin white rule, 500 px wide, centred -->
  <line x1="262" y1="528" x2="762" y2="528"
        stroke="#FFFFFF" stroke-width="5" opacity="0.80"/>

  <!-- Connect: regular weight white text, baseline at y=687 -->
  <text x="512" y="687"
        font-family="'Helvetica Neue', Helvetica, Arial, sans-serif"
        font-size="158" font-weight="400" fill="#FFFFFF"
        text-anchor="middle">Connect</text>
</svg>`;

// Adaptive icon foreground: no background fill (app.json provides backgroundColor #1E3A8A).
// Same text layout so the combined result is identical on Android.
const adaptiveSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <!-- No background — uses android.adaptiveIcon.backgroundColor = #1E3A8A from app.json -->

  <text x="512" y="503"
        font-family="'Helvetica Neue', Helvetica, Arial, sans-serif"
        font-size="230" font-weight="800" fill="#FFFFFF"
        text-anchor="middle" letter-spacing="6">STEP</text>

  <line x1="262" y1="528" x2="762" y2="528"
        stroke="#FFFFFF" stroke-width="5" opacity="0.80"/>

  <text x="512" y="687"
        font-family="'Helvetica Neue', Helvetica, Arial, sans-serif"
        font-size="158" font-weight="400" fill="#FFFFFF"
        text-anchor="middle">Connect</text>
</svg>`;

await sharp(Buffer.from(iconSvg))
  .resize(SIZE, SIZE)
  .png()
  .toFile(join(ASSETS_DIR, 'icon.png'));

console.log('✓ apps/mobile/assets/icon.png');

await sharp(Buffer.from(adaptiveSvg))
  .resize(SIZE, SIZE)
  .png()
  .toFile(join(ASSETS_DIR, 'adaptive-icon.png'));

console.log('✓ apps/mobile/assets/adaptive-icon.png');
console.log('Done.');
