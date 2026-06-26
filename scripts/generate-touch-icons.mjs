import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'apps', 'mobile', 'assets', 'icon.png');
const OUT = join(__dirname, '..', 'apps', 'mobile', 'public');

// 1024×1024 fallback (used by apps/mobile/public/apple-touch-icon.png)
await sharp(SRC).resize(1024, 1024).png().toFile(join(OUT, 'apple-touch-icon.png'));
console.log('✓ apple-touch-icon.png (1024×1024)');

// Sized variants for iOS home-screen bookmarks
const SIZES = [180, 167, 152, 120];

for (const size of SIZES) {
  const dest = join(OUT, `apple-touch-icon-${size}x${size}.png`);
  await sharp(SRC).resize(size, size).png().toFile(dest);
  console.log(`✓ apple-touch-icon-${size}x${size}.png`);
}

console.log('Done.');
