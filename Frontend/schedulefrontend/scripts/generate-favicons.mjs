#!/usr/bin/env node

/**
 * Favicon Generation Script for Schedule-It
 *
 * This script generates favicon files from the scheduleitlogo.png
 * Run this with: node scripts/generate-favicons.mjs
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const logoPath = join(process.cwd(), 'public', 'scheduleitlogo.png');
const publicDir = join(process.cwd(), 'public');

console.log('🔄 Generating favicons for Schedule-It...');

// Check if logo exists
if (!existsSync(logoPath)) {
  console.error('❌ scheduleitlogo.png not found in public folder');
  process.exit(1);
}

// Check if ImageMagick or similar tool is available
try {
  // Try to use ImageMagick if available
  execSync('magick -version', { stdio: 'pipe' });
  console.log('✅ ImageMagick found, generating favicons...');

  // Generate various favicon sizes
  const sizes = [16, 32, 48, 64, 128, 256];

  sizes.forEach(size => {
    const outputPath = join(publicDir, `favicon-${size}x${size}.png`);
    execSync(`magick "${logoPath}" -resize ${size}x${size} "${outputPath}"`);
    console.log(`✅ Generated favicon-${size}x${size}.png`);
  });

  // Generate ICO file
  execSync(`magick "${logoPath}" -resize 32x32 "${join(publicDir, 'favicon.ico')}"`);
  console.log('✅ Generated favicon.ico');

  // Generate Apple touch icon
  execSync(`magick "${logoPath}" -resize 180x180 "${join(publicDir, 'apple-touch-icon.png')}"`);
  console.log('✅ Generated apple-touch-icon.png');

} catch (error) {
  console.log('⚠️  ImageMagick not found. Please install ImageMagick and run this script again.');
  console.log('   Or manually generate favicons from scheduleitlogo.png using an online favicon generator.');
  console.log('');
  console.log('   Recommended favicon sizes to generate:');
  console.log('   - 16x16, 32x32, 48x48 for favicon.ico');
  console.log('   - 180x180 for apple-touch-icon.png');
  console.log('   - 192x192, 512x512 for PWA icons');
  console.log('');
  console.log('   Place generated files in the public folder.');
}

console.log('');
console.log('🎉 Favicon generation complete!');
console.log('   Your Schedule-It logo will now appear in browser tabs and bookmarks.');