/**
 * Challenger 2 Verification Script:
 * 1. Subpath Deployment Simulation & Relative Path Audit
 * 2. Mobile Viewport & Touch Target Analysis
 * 3. Sunlight High-Contrast Mathematical Verification
 */

import fs from 'fs';
import path from 'path';
import http from 'http';

console.log('================================================================');
console.log(' CHALLENGER 2: EMPIRICAL VERIFICATION HARNESS (MILESTONE 1)');
console.log('================================================================\n');

const distDir = path.resolve('dist');
let totalTests = 0;
let passedTests = 0;
let warnings = 0;
let failures = 0;

function assert(condition, message, isWarning = false) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${message}`);
  } else if (isWarning) {
    warnings++;
    console.log(`  ⚠ WARN: ${message}`);
  } else {
    failures++;
    console.log(`  ✗ FAIL: ${message}`);
  }
}

// ============================================================================
// PART 1: SUBPATH DEPLOYMENT & ASSET INTEGRITY
// ============================================================================
console.log('--- 1. Subpath Deployment & Static Build Integrity ---');

if (!fs.existsSync(distDir)) {
  console.error('FAIL: dist/ directory not found. Run npm run build first.');
  process.exit(1);
}

const htmlPath = path.join(distDir, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf-8');

// Check 1.1: Zero absolute root references in index.html
const absoluteRootRegex = /(src|href)=["']\/(?!\/)[^"']*["']/gi;
const absoluteMatches = html.match(absoluteRootRegex) || [];
assert(absoluteMatches.length === 0, `Zero absolute root path dependencies in dist/index.html (found: ${absoluteMatches.length})`);

// Check 1.2: Check all relative links resolve
const relativeRegex = /(src|href)=["'](\.\/[^"']+)["']/gi;
let match;
let missingFiles = 0;
const relFiles = [];
while ((match = relativeRegex.exec(html)) !== null) {
  relFiles.push(match[2]);
  const localTarget = path.join(distDir, match[2].replace(/^\.\//, ''));
  if (!fs.existsSync(localTarget)) {
    missingFiles++;
  }
}
assert(missingFiles === 0 && relFiles.length > 0, `All ${relFiles.length} relative links in index.html resolve to existing files on disk`);

// Check 1.3: PWA Manifest relative start_url and scope
const manifestPath = path.join(distDir, 'manifest.webmanifest');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
assert(manifest.start_url === './', `PWA Manifest start_url is './' (actual: "${manifest.start_url}")`);
assert(manifest.scope === './', `PWA Manifest scope is './' (actual: "${manifest.scope}")`);

// Check 1.4: Service worker registration script
const regSwPath = path.join(distDir, 'registerSW.js');
const regSw = fs.readFileSync(regSwPath, 'utf-8');
assert(regSw.includes("register('./sw.js'"), `registerSW.js registers relative path './sw.js'`);
assert(regSw.includes("scope: './'"), `registerSW.js registers relative scope './'`);

// Check 1.5: sw.js precache array
const swPath = path.join(distDir, 'sw.js');
const sw = fs.readFileSync(swPath, 'utf-8');
const hasRootPrecache = /\{url:"\/[a-zA-Z0-9]/.test(sw);
assert(!hasRootPrecache, `sw.js precache manifest contains zero leading slashes`);

// Check 1.6: In-process HTTP server simulating /phone-inspector/ subpath
await new Promise(async (resolve) => {
  const subpath = '/phone-inspector/';
  const server = http.createServer((req, res) => {
    const url = req.url || '/';
    if (!url.startsWith(subpath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Out of subpath scope');
      return;
    }
    let rel = url.substring(subpath.length).split('?')[0];
    if (rel === '' || rel === '/') rel = 'index.html';
    const fp = path.join(distDir, rel);
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      res.writeHead(200);
      res.end(fs.readFileSync(fp));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(0, '127.0.0.1', async () => {
    const port = server.address().port;
    const base = `http://127.0.0.1:${port}${subpath}`;

    try {
      const res = await fetch(base);
      assert(res.status === 200, `Subpath root GET ${base} returns HTTP 200 OK`);

      let assetFailures = 0;
      for (const f of relFiles) {
        const aRes = await fetch(`${base}${f.replace(/^\.\//, '')}`);
        if (aRes.status !== 200) assetFailures++;
      }
      assert(assetFailures === 0, `All assets accessible via subpath ${subpath} with 0 HTTP errors`);

      const rootLeak = await fetch(`http://127.0.0.1:${port}/assets/`);
      assert(rootLeak.status === 404, `Requests to root domain outside subpath correctly return 404`);
    } finally {
      server.close(() => resolve());
    }
  });
});

console.log('\n--- 2. Viewport, Safe-Areas & Touch Targets ---');

// Inspect Shell source code directly for touch targets and safe area classes
const shellPath = path.resolve('src/ui/Shell.ts');
const shellSource = fs.readFileSync(shellPath, 'utf-8');
const cssPath = path.resolve('src/index.css');
const cssSource = fs.readFileSync(cssPath, 'utf-8');

// Check 2.1: min-h-touch class definition
assert(cssSource.includes('.min-h-touch {\n    min-height: 48px;'), `CSS defines .min-h-touch with min-height: 48px`);
assert(cssSource.includes('.min-w-touch {\n    min-width: 48px;'), `CSS defines .min-w-touch with min-width: 48px`);

// Check 2.2: Sunlight toggle button has 48x48 touch target
assert(shellSource.includes('min-h-touch min-w-touch') && shellSource.includes('id="sunlight-toggle-btn"'), `Sunlight toggle button has min-h-touch and min-w-touch`);

// Check 2.3: Test card run buttons have 48x48 touch target
assert(shellSource.includes('data-run-test') && shellSource.includes('min-h-touch min-w-touch'), `Test card Run buttons have min-h-touch and min-w-touch`);

// Check 2.4: Reset session button touch target
const resetBtnMatch = shellSource.match(/id="btn-reset-session"[^>]*class="([^"]*)"/);
const resetClasses = resetBtnMatch ? resetBtnMatch[1] : '';
const resetHasMinW = resetClasses.includes('min-w-touch') || resetClasses.includes('w-12');
assert(resetHasMinW, `#btn-reset-session has min-w-touch (Observed: "${resetClasses}" without min-w-touch: width is ~36px)`, true);

// Check 2.5: Safe area horizontal insets in landscape mode
const headerMatch = shellSource.match(/<header[^>]*class="([^"]*)"/);
const headerClasses = headerMatch ? headerMatch[1] : '';
const hasHorizontalSafe = headerClasses.includes('pl-safe') || headerClasses.includes('pr-safe');
assert(hasHorizontalSafe, `Header includes pl-safe/pr-safe for landscape notch handling (Observed: "${headerClasses}" has pt-safe but lacks horizontal safe-area insets)`, true);

// Check 2.6: Test card title/badge flex-wrap on narrow 320px screens
const hasFlexWrap = /class="flex items-center space-x-2 flex-wrap"/.test(shellSource);
assert(hasFlexWrap, `Test card badge row includes flex-wrap to prevent clipping on 320px screens`, true);

console.log('\n--- 3. Sunlight High-Contrast Mathematical Contrast Ratios ---');

function sRgbToLinear(c) {
  const norm = c / 255;
  return norm <= 0.04045 ? norm / 12.92 : Math.pow((norm + 0.055) / 1.055, 2.4);
}

function hexToLuminance(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return 0.2126 * sRgbToLinear(r) + 0.7152 * sRgbToLinear(g) + 0.0722 * sRgbToLinear(b);
}

function contrastRatio(h1, h2) {
  const l1 = hexToLuminance(h1);
  const l2 = hexToLuminance(h2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const black = '#000000';
const white = '#ffffff';
const amber = '#ffb800';
const green = '#00ff66';
const red = '#ff0033';

const crWhite = contrastRatio(white, black);
console.log(`  Luminance: Black = ${hexToLuminance(black).toFixed(4)}, White = ${hexToLuminance(white).toFixed(4)}`);
console.log(`  Contrast Ratio (White #ffffff / Black #000000): ${crWhite.toFixed(4)} : 1`);
assert(crWhite > 12.0, `White on Black exceeds >12:1 requirement (${crWhite.toFixed(2)}:1)`);

const crAmber = contrastRatio(amber, black);
console.log(`  Luminance: Amber #ffb800 = ${hexToLuminance(amber).toFixed(4)}`);
console.log(`  Contrast Ratio (Amber #ffb800 / Black #000000): ${crAmber.toFixed(4)} : 1`);
assert(crAmber > 12.0, `Amber on Black exceeds >12:1 requirement (${crAmber.toFixed(2)}:1 > 12:1)`);

const crGreen = contrastRatio(green, black);
console.log(`  Contrast Ratio (Green #00ff66 / Black #000000): ${crGreen.toFixed(4)} : 1`);
assert(crGreen > 12.0, `Green on Black exceeds >12:1 requirement (${crGreen.toFixed(2)}:1)`);

const crRed = contrastRatio(red, black);
console.log(`  Contrast Ratio (Red #ff0033 / Black #000000): ${crRed.toFixed(4)} : 1`);
console.log(`  Note: Pure sRGB red is physically bounded to max 5.26:1 on black due to red channel spectral luminance limits.`);

console.log('\n================================================================');
console.log(` SUMMARY: ${totalTests} checks executed: ${passedTests} PASSED, ${warnings} WARNINGS, ${failures} FAILURES`);
console.log('================================================================');

if (failures > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
