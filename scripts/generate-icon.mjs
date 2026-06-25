import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'apps', 'mobile', 'assets');

mkdirSync(ASSETS_DIR, { recursive: true });

const SIZE = 1024;

// Full icon: navy-to-blue gradient background + white "HR"
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1a56db"/>
    </linearGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
  <text
    x="512"
    y="512"
    font-family="'Helvetica Neue', Arial, sans-serif"
    font-size="440"
    font-weight="900"
    fill="#ffffff"
    text-anchor="middle"
    dominant-baseline="central"
    letter-spacing="24"
  >HR</text>
</svg>`;

// Adaptive icon foreground: transparent bg, blue "HR" (fits Android safe zone ~66%)
const adaptiveSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <text
    x="512"
    y="512"
    font-family="'Helvetica Neue', Arial, sans-serif"
    font-size="300"
    font-weight="900"
    fill="#ffffff"
    text-anchor="middle"
    dominant-baseline="central"
    letter-spacing="16"
  >HR</text>
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
