import sharp from 'sharp';
import { mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'apps', 'web', 'public');
const iconsDir = join(publicDir, 'icons');

// SVG content for the HoneyDo logo
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="64" fill="#f59e0b"/>
  <path d="M256 96l-140 81v162l140 81 140-81V177L256 96zm0 40l100 58v116l-100 58-100-58V194l100-58z" fill="white"/>
</svg>`;

async function generateIcons() {
  // Ensure icons directory exists
  await mkdir(iconsDir, { recursive: true });

  const sizes = [
    { name: 'icon-192x192.png', size: 192, dir: iconsDir },
    { name: 'icon-512x512.png', size: 512, dir: iconsDir },
    { name: 'apple-touch-icon.png', size: 180, dir: publicDir },
  ];

  console.log('Generating PWA icons...\n');

  for (const { name, size, dir } of sizes) {
    const outputPath = join(dir, name);
    await sharp(Buffer.from(svgContent))
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`Created: ${name} (${size}x${size})`);
  }

  // Generate favicon.ico (using 32x32 PNG as base, saved as ICO-compatible PNG)
  // Note: For true ICO format, we'd need a different library, but modern browsers accept PNG
  const faviconPath = join(publicDir, 'favicon.ico');
  await sharp(Buffer.from(svgContent))
    .resize(32, 32)
    .png()
    .toFile(faviconPath);
  console.log(`Created: favicon.ico (32x32)`);

  // Also create a proper favicon.png for browsers that prefer it
  const faviconPngPath = join(publicDir, 'favicon.png');
  await sharp(Buffer.from(svgContent))
    .resize(32, 32)
    .png()
    .toFile(faviconPngPath);
  console.log(`Created: favicon.png (32x32)`);

  console.log('\nAll PWA icons generated successfully!');
}

generateIcons().catch(console.error);
