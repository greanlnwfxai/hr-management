import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'apps', 'mobile', 'assets');

mkdirSync(ASSETS_DIR, { recursive: true });

const SIZE = 1024;

// Full icon: navy-to-blue gradient + stylised "H" + dynamic swoosh + "HR Mobile" text
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <!-- Background: dark navy → brand blue (top → bottom) -->
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1a56db"/>
    </linearGradient>
    <!-- H bars: light-blue edges → white centre (cylindrical 3-D effect) -->
    <linearGradient id="hGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="#7aaef6"/>
      <stop offset="28%"  stop-color="#ffffff"/>
      <stop offset="72%"  stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#7aaef6"/>
    </linearGradient>
    <!-- Swoosh: deep navy-blue → bright sky-blue (left → right) -->
    <linearGradient id="swooshGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="#1e3a8a"/>
      <stop offset="55%"  stop-color="#2563eb"/>
      <stop offset="100%" stop-color="#60a5fa"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>

  <!-- H letter: crossbar rendered first so vertical bars paint over it cleanly -->
  <rect x="218" y="455" width="588" height="114" fill="url(#hGrad)"/>
  <rect x="218" y="155" width="140" height="625" rx="12" fill="url(#hGrad)"/>
  <rect x="666" y="155" width="140" height="625" rx="12" fill="url(#hGrad)"/>

  <!-- Swoosh: diagonal curved band sweeping lower-left → upper-right through the H -->
  <path d="M 0,688 Q 512,535 1024,370 L 1024,268 Q 512,435 0,588 Z"
        fill="url(#swooshGrad)" opacity="0.86"/>

  <!-- "HR Mobile" label -->
  <text x="512" y="892"
        font-family="'Helvetica Neue', Helvetica, Arial, sans-serif"
        font-size="74" font-weight="600" fill="#ffffff"
        text-anchor="middle" dominant-baseline="middle"
        letter-spacing="4">HR Mobile</text>
</svg>`;

// Adaptive icon foreground: transparent bg, H + swoosh centred in safe zone, NO text
// Android masks to circle/squircle — keep all visuals inside central ~66% (≈676 px)
const adaptiveSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="hGradA" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="#7aaef6"/>
      <stop offset="28%"  stop-color="#ffffff"/>
      <stop offset="72%"  stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#7aaef6"/>
    </linearGradient>
    <linearGradient id="swooshGradA" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="#1e3a8a"/>
      <stop offset="55%"  stop-color="#2563eb"/>
      <stop offset="100%" stop-color="#60a5fa"/>
    </linearGradient>
  </defs>

  <!-- H centred: x 262–762 (500 px wide), y 207–777 (570 px tall) — all inside safe zone -->
  <rect x="262" y="455" width="500" height="100" fill="url(#hGradA)"/>
  <rect x="262" y="207" width="120" height="570" rx="10" fill="url(#hGradA)"/>
  <rect x="642" y="207" width="120" height="570" rx="10" fill="url(#hGradA)"/>

  <!-- Swoosh (extends to canvas edges — visible but not load-bearing outside safe zone) -->
  <path d="M 0,652 Q 512,512 1024,358 L 1024,260 Q 512,415 0,555 Z"
        fill="url(#swooshGradA)" opacity="0.86"/>
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
