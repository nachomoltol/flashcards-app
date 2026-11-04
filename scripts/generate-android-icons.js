/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const MASTER_ICON = path.resolve('public/icons/android-chrome-512x512.png');
const RES_DIR = path.resolve('android/app/src/main/res');

const CONFIGS = [
  { folder: 'mipmap-mdpi', standardSize: 48, foregroundSize: 108 },
  { folder: 'mipmap-hdpi', standardSize: 72, foregroundSize: 162 },
  { folder: 'mipmap-xhdpi', standardSize: 96, foregroundSize: 216 },
  { folder: 'mipmap-xxhdpi', standardSize: 144, foregroundSize: 324 },
  { folder: 'mipmap-xxxhdpi', standardSize: 192, foregroundSize: 432 },
];

async function generateIcons() {
  if (!fs.existsSync(MASTER_ICON)) {
    throw new Error(`Master icon not found at: ${MASTER_ICON}`);
  }

  console.log(`Processing master icon: ${MASTER_ICON}`);

  for (const config of CONFIGS) {
    const targetDir = path.join(RES_DIR, config.folder);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // 1. ic_launcher.png (standard icon)
    const icLauncherPath = path.join(targetDir, 'ic_launcher.png');
    await sharp(MASTER_ICON)
      .resize(config.standardSize, config.standardSize, {
        kernel: sharp.kernel.lanczos3,
        fit: 'cover',
      })
      .png({ compressionLevel: 9, quality: 100 })
      .toFile(icLauncherPath);
    console.log(`Generated: ${config.folder}/ic_launcher.png (${config.standardSize}x${config.standardSize})`);

    // 2. ic_launcher_round.png (round icon with circular mask)
    const icLauncherRoundPath = path.join(targetDir, 'ic_launcher_round.png');
    const circleMaskSvg = Buffer.from(
      `<svg width="${config.standardSize}" height="${config.standardSize}">
        <circle cx="${config.standardSize / 2}" cy="${config.standardSize / 2}" r="${config.standardSize / 2}" fill="#ffffff" />
      </svg>`
    );
    await sharp(MASTER_ICON)
      .resize(config.standardSize, config.standardSize, {
        kernel: sharp.kernel.lanczos3,
        fit: 'cover',
      })
      .composite([{ input: circleMaskSvg, blend: 'dest-in' }])
      .png({ compressionLevel: 9, quality: 100 })
      .toFile(icLauncherRoundPath);
    console.log(`Generated: ${config.folder}/ic_launcher_round.png (${config.standardSize}x${config.standardSize})`);

    // 3. ic_launcher_foreground.png (adaptive foreground)
    const icLauncherForegroundPath = path.join(targetDir, 'ic_launcher_foreground.png');
    await sharp(MASTER_ICON)
      .resize(config.foregroundSize, config.foregroundSize, {
        kernel: sharp.kernel.lanczos3,
        fit: 'cover',
      })
      .png({ compressionLevel: 9, quality: 100 })
      .toFile(icLauncherForegroundPath);
    console.log(`Generated: ${config.folder}/ic_launcher_foreground.png (${config.foregroundSize}x${config.foregroundSize})`);
  }

  console.log('\nAll mipmap icons generated successfully!');
}

generateIcons().catch((err) => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
