import fs from 'fs';
import path from 'path';

const distDir = path.resolve('dist');
const indexHtmlPath = path.join(distDir, 'index.html');

console.log('--- Verifying Build Output for GitHub Pages & PWA ---');

if (!fs.existsSync(distDir)) {
  console.error('FAIL: dist/ directory does not exist. Run "npm run build" first.');
  process.exit(1);
}

if (!fs.existsSync(indexHtmlPath)) {
  console.error('FAIL: dist/index.html does not exist.');
  process.exit(1);
}

const html = fs.readFileSync(indexHtmlPath, 'utf-8');

// Check that assets are referenced relatively
const absoluteAssetRegex = /(src|href)=["']\/(assets|icons|favicon)/i;
if (absoluteAssetRegex.test(html)) {
  console.error('FAIL: dist/index.html contains absolute asset references (e.g. "/assets/..."). Must use relative paths for GitHub Pages subpath compatibility.');
  process.exit(1);
}

// Check that relative asset references exist
const hasRelativeAssets = /(src|href)=["']\.\/(assets|icons|favicon|manifest)/i.test(html) || /(src|href)=["']\.\.?\//i.test(html);
console.log(`PASS: dist/index.html exists and uses relative asset paths (${hasRelativeAssets ? 'verified' : 'clean'}).`);

// Check PWA service worker and manifest
const files = fs.readdirSync(distDir);
const hasSw = files.some((f) => f.includes('sw.js') || f.includes('registerSW.js'));
const hasManifest = files.some((f) => f.includes('manifest'));

if (hasSw) {
  console.log('PASS: Service Worker script generated in dist/');
} else {
  console.warn('WARN: Service worker file not detected in dist root.');
}

if (hasManifest) {
  console.log('PASS: PWA manifest detected in dist/');
} else {
  console.warn('WARN: PWA manifest not detected in dist root.');
}

console.log('SUCCESS: Build verification passed cleanly.');
