import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { execSync } from 'child_process';
import { AddressInfo } from 'net';
import { Shell } from '../../src/ui/Shell';
import { DiagnosticRunner } from '../../src/core/runner';
import { DiagnosticStore } from '../../src/core/store';

/**
 * WCAG 2.1 Relative Luminance and Contrast Ratio calculation functions.
 */
function sRgbToLinear(c: number): number {
  const norm = c / 255;
  return norm <= 0.04045 ? norm / 12.92 : Math.pow((norm + 0.055) / 1.055, 2.4);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    const rChar = clean.charAt(0);
    const gChar = clean.charAt(1);
    const bChar = clean.charAt(2);
    return {
      r: parseInt(rChar + rChar, 16),
      g: parseInt(gChar + gChar, 16),
      b: parseInt(bChar + bChar, 16),
    };
  }
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}

function getRelativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * sRgbToLinear(r) + 0.7152 * sRgbToLinear(g) + 0.0722 * sRgbToLinear(b);
}

function getContrastRatio(hex1: string, hex2: string): number {
  const l1 = getRelativeLuminance(hex1);
  const l2 = getRelativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('Challenger 2 Adversarial Stress Suite', () => {
  const distDir = path.resolve(process.cwd(), 'dist');

  beforeAll(() => {
    if (!fs.existsSync(distDir) || !fs.existsSync(path.join(distDir, 'index.html'))) {
      execSync('npm run build', { stdio: 'pipe' });
    }
  });

  // =========================================================================
  // 1. SUBPATH DEPLOYMENT & STATIC BUILD INTEGRITY
  // =========================================================================
  describe('1. Subpath Deployment & Static Build Integrity', () => {
    it('verifies dist/ contains required production assets', () => {
      expect(fs.existsSync(distDir)).toBe(true);
      expect(fs.existsSync(path.join(distDir, 'index.html'))).toBe(true);
      expect(fs.existsSync(path.join(distDir, 'registerSW.js'))).toBe(true);
      expect(fs.existsSync(path.join(distDir, 'sw.js'))).toBe(true);
      expect(fs.existsSync(path.join(distDir, 'manifest.webmanifest'))).toBe(true);
    });

    it('ensures zero absolute root path references in dist/index.html', () => {
      const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf-8');

      // Check for absolute root references like src="/..." or href="/..." (excluding http/https protocols)
      const absoluteRootRegex = /(src|href)=["']\/(?!\/)[^"']*["']/gi;
      const absoluteMatches = html.match(absoluteRootRegex) || [];

      expect(absoluteMatches).toEqual([]);
    });

    it('verifies all relative asset links in dist/index.html resolve to existing files', () => {
      const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf-8');

      // Extract all relative paths from src and href attributes
      const relativePathRegex = /(src|href)=["'](\.\/[^"']+)["']/gi;
      let match: RegExpExecArray | null;
      const referencedFiles: string[] = [];

      while ((match = relativePathRegex.exec(html)) !== null) {
        const file = match[2];
        if (file) {
          referencedFiles.push(file);
        }
      }

      expect(referencedFiles.length).toBeGreaterThan(0);

      for (const relPath of referencedFiles) {
        const cleanPath = relPath.replace(/^\.\//, '');
        const targetPath = path.join(distDir, cleanPath);
        const exists = fs.existsSync(targetPath);
        expect(exists, `Referenced asset does not exist: ${relPath} -> ${targetPath}`).toBe(true);
      }
    });

    it('verifies PWA manifest uses relative scope and start_url', () => {
      const manifestPath = path.join(distDir, 'manifest.webmanifest');
      const manifestContent = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

      expect(manifestContent.start_url).toBe('./');
      expect(manifestContent.scope).toBe('./');

      for (const icon of manifestContent.icons || []) {
        expect(icon.src.startsWith('/')).toBe(false);
        const iconPath = path.join(distDir, icon.src);
        expect(fs.existsSync(iconPath), `Icon not found: ${icon.src}`).toBe(true);
      }
    });

    it('verifies Service Worker registration and precache entries use strictly relative paths', () => {
      const regSw = fs.readFileSync(path.join(distDir, 'registerSW.js'), 'utf-8');
      expect(regSw).toContain("register('./sw.js'");
      expect(regSw).toContain("scope: './'");

      const sw = fs.readFileSync(path.join(distDir, 'sw.js'), 'utf-8');
      // sw should NOT precache with root-leading slashes like {url:"/assets/..."}
      expect(sw).not.toMatch(/\{url:"\/[a-zA-Z0-9]/);
      expect(sw).toContain('workbox-');
      expect(sw).toContain('./index.html');
    });

    it('simulates live subpath hosting (/phone-inspector/) and fetches all assets over HTTP', async () => {
      const subpath = '/phone-inspector/';
      const server = http.createServer((req, res) => {
        const url = req.url || '/';

        const headers: Record<string, string> = {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
        };

        if (req.method === 'OPTIONS') {
          res.writeHead(204, headers);
          res.end();
          return;
        }

        if (!url.startsWith(subpath)) {
          res.writeHead(404, { ...headers, 'Content-Type': 'text/plain' });
          res.end('Not Found (Out of Subpath Scope)');
          return;
        }

        const rawRel = url.substring(subpath.length).split('?')[0] || '';
        const relPath = rawRel === '' || rawRel === '/' ? 'index.html' : rawRel;

        const filePath = path.join(distDir, relPath);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath);
          const mimeTypes: Record<string, string> = {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.webmanifest': 'application/manifest+json',
            '.ico': 'image/x-icon',
            '.png': 'image/png',
          };
          const mime = mimeTypes[ext] || 'application/octet-stream';
          res.writeHead(200, { ...headers, 'Content-Type': mime });
          res.end(fs.readFileSync(filePath));
        } else {
          res.writeHead(404, { ...headers, 'Content-Type': 'text/plain' });
          res.end(`File Not Found: ${relPath}`);
        }
      });

      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const port = (server.address() as AddressInfo).port;
      const baseUrl = `http://127.0.0.1:${port}${subpath}`;

      try {
        // Fetch index.html
        const indexRes = await fetch(baseUrl);
        expect(indexRes.status).toBe(200);
        const indexHtml = await indexRes.text();
        expect(indexHtml).toContain('Phone Inspector');

        // Extract relative assets and fetch them through subpath
        const assetRegex = /(src|href)=["']\.\/([^"']+)["']/g;
        let match: RegExpExecArray | null;
        const assets: string[] = [];
        while ((match = assetRegex.exec(indexHtml)) !== null) {
          const a = match[2];
          if (a) {
            assets.push(a);
          }
        }

        expect(assets.length).toBeGreaterThan(0);

        for (const asset of assets) {
          const assetUrl = `${baseUrl}${asset}`;
          const res = await fetch(assetUrl);
          expect(res.status, `Failed to fetch subpath asset: ${assetUrl}`).toBe(200);
        }

        // Verify out-of-scope request returns 404 (confirming it is not served from root)
        const rootLeakRes = await fetch(`http://127.0.0.1:${port}/assets/`);
        expect(rootLeakRes.status).toBe(404);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });

  // =========================================================================
  // 2. VIEWPORT & LAYOUT BOUNDARY STRESS
  // =========================================================================
  describe('2. Viewport & Layout Boundary Stress', () => {
    let container: HTMLElement;
    let store: DiagnosticStore;
    let runner: DiagnosticRunner;
    let shell: Shell;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);

      store = new DiagnosticStore();
      runner = new DiagnosticRunner({ store });

      // Register tests with varied name lengths to stress-test layout wrapping
      runner.registerTest({
        id: 'short_id',
        name: 'NFC',
        category: 'HARDWARE',
        description: 'Short name test',
        run: async () => ({
          id: 'short_id',
          name: 'NFC',
          category: 'HARDWARE',
          status: 'PASSED',
          summary: 'OK',
          timestamp: Date.now(),
        }),
      });

      runner.registerTest({
        id: 'long_id',
        name: 'Front and Rear Camera Preview Stream Check with Optical Autofocus',
        category: 'HARDWARE',
        description: 'Long name test with complex description',
        run: async () => ({
          id: 'long_id',
          name: 'Front and Rear Camera Preview Stream Check with Optical Autofocus',
          category: 'HARDWARE',
          status: 'FAILED',
          summary: 'Camera hardware malfunction detected',
          criticalRedFlag: true,
          timestamp: Date.now(),
        }),
      });

      shell = new Shell({ runner, store });
    });

    afterEach(() => {
      shell.unmount();
      container.remove();
    });

    const viewports = [
      { name: 'iPhone SE (compact)', width: 320, height: 568 },
      { name: 'iPhone 14 (standard)', width: 390, height: 844 },
      { name: 'iPhone 15 Pro Max (large)', width: 430, height: 932 },
      { name: 'iPhone 14 (landscape)', width: 844, height: 390 },
    ];

    for (const vp of viewports) {
      it(`renders correctly under viewport ${vp.name} (${vp.width}x${vp.height})`, () => {
        container.style.width = `${vp.width}px`;
        container.style.height = `${vp.height}px`;

        shell.mount(container);

        expect(container.querySelector('header')).not.toBeNull();
        expect(container.querySelector('nav')).not.toBeNull();
        expect(container.querySelector('main')).not.toBeNull();
        expect(container.querySelector('footer')).not.toBeNull();
      });
    }

    it('empirically evaluates touch target dimensions on all interactive controls', () => {
      shell.mount(container);

      // Check Sunlight Toggle Button
      const sunlightBtn = container.querySelector('#sunlight-toggle-btn') as HTMLElement;
      expect(sunlightBtn).not.toBeNull();
      expect(sunlightBtn.className).toContain('min-h-touch');
      expect(sunlightBtn.className).toContain('min-w-touch');

      // Check Category Tabs
      const catTabs = container.querySelectorAll('[data-cat]');
      expect(catTabs.length).toBe(5);
      catTabs.forEach((tab) => {
        expect((tab as HTMLElement).className).toContain('min-h-touch');
      });

      // Check Suite Action Buttons
      const runAllBtn = container.querySelector('#btn-run-all') as HTMLElement;
      expect(runAllBtn).not.toBeNull();
      expect(runAllBtn.className).toContain('min-h-touch');

      // Check Reset Session Button - CRITICAL AUDIT: Does it have min-w-touch?
      const resetBtn = container.querySelector('#btn-reset-session') as HTMLElement;
      expect(resetBtn).not.toBeNull();
      expect(resetBtn.className).toContain('min-h-touch');

      // Check Test Card Action Buttons
      const testRunButtons = container.querySelectorAll('[data-run-test]');
      testRunButtons.forEach((btn) => {
        expect((btn as HTMLElement).className).toContain('min-h-touch');
        expect((btn as HTMLElement).className).toContain('min-w-touch');
      });
    });

    it('identifies touch target width on #btn-reset-session (single character ↺ without min-w-touch)', () => {
      shell.mount(container);
      const resetBtn = container.querySelector('#btn-reset-session') as HTMLElement;

      // Note: btn-reset-session now includes min-w-touch
      const hasMinWTouch = resetBtn.classList.contains('min-w-touch');
      expect(hasMinWTouch).toBe(true);
    });

    it('evaluates safe-area inset classes across orientations', () => {
      shell.mount(container);

      const header = container.querySelector('header') as HTMLElement;
      expect(header.className).toContain('pt-safe');

      const wrapper = container.firstElementChild as HTMLElement;
      expect(wrapper.className).toContain('pb-safe');

      // Check for horizontal safe area padding (pl-safe, pr-safe) in landscape
      const hasLeftSafe = header.className.includes('pl-safe') || wrapper.className.includes('pl-safe');
      const hasRightSafe = header.className.includes('pr-safe') || wrapper.className.includes('pr-safe');

      // Horizontal safe areas are present on outer shell header
      expect(hasLeftSafe).toBe(true);
      expect(hasRightSafe).toBe(true);
    });

    it('stresses test card layout on 320px viewport with long title and badges', () => {
      container.style.width = '320px';
      shell.mount(container);

      // Trigger FAILED result with criticalRedFlag on the long title test
      store.setResult({
        id: 'long_id',
        name: 'Front and Rear Camera Preview Stream Check with Optical Autofocus',
        category: 'HARDWARE',
        status: 'FAILED',
        summary: 'Camera hardware malfunction detected',
        criticalRedFlag: true,
        timestamp: Date.now(),
      });

      const longCard = container.querySelector('[data-testid="test-card-long_id"]') as HTMLElement;
      expect(longCard).not.toBeNull();

      // Inspect title and badge row
      const badgeRow = longCard.querySelector('.space-y-1 > div') as HTMLElement;
      expect(badgeRow).not.toBeNull();

      // Verify that the badge row has flex-wrap to prevent horizontal overflow on 320px
      const hasFlexWrap = badgeRow.classList.contains('flex-wrap');
      expect(hasFlexWrap).toBe(true);
    });
  });

  // =========================================================================
  // 3. SUNLIGHT HIGH-CONTRAST PALETTE VERIFICATION
  // =========================================================================
  describe('3. Sunlight High-Contrast Palette Verification', () => {
    const BLACK = '#000000';
    const WHITE = '#ffffff';
    const AMBER = '#ffb800';
    const GREEN = '#00ff66';
    const RED = '#ff0033';

    it('calculates relative luminance values with WCAG 2.1 precision', () => {
      const lumBlack = getRelativeLuminance(BLACK);
      const lumWhite = getRelativeLuminance(WHITE);
      const lumAmber = getRelativeLuminance(AMBER);

      expect(lumBlack).toBeCloseTo(0.0, 4);
      expect(lumWhite).toBeCloseTo(1.0, 4);
      // Amber (#ffb800) luminance is approximately 0.5552
      expect(lumAmber).toBeGreaterThan(0.55);
      expect(lumAmber).toBeLessThan(0.56);
    });

    it('empirically verifies Pure White (#ffffff) on Pure Black (#000000) achieves >12:1 contrast', () => {
      const cr = getContrastRatio(WHITE, BLACK);
      // Pure White on Pure Black gives exactly 21:1
      expect(cr).toBeCloseTo(21.0, 1);
      expect(cr).toBeGreaterThan(12.0);
    });

    it('empirically verifies Amber (#ffb800) on Pure Black (#000000) achieves >12:1 contrast', () => {
      const cr = getContrastRatio(AMBER, BLACK);
      // (0.5554 + 0.05) / (0 + 0.05) = 12.1082:1
      expect(cr).toBeGreaterThan(12.0);
      expect(cr).toBeCloseTo(12.11, 2);
    });

    it('audits supplementary sunlight colors: Green (#00ff66) vs Red (#ff0033)', () => {
      const crGreen = getContrastRatio(GREEN, BLACK);
      const crRed = getContrastRatio(RED, BLACK);

      // Green (#00ff66) has high luminance -> 15.5:1 (>12:1)
      expect(crGreen).toBeGreaterThan(12.0);

      // Red (#ff0033) is physically constrained by sRGB red luminance (max 0.2126)
      // Contrast ratio against black is ~5.3:1
      expect(crRed).toBeLessThan(12.0);
      expect(crRed).toBeCloseTo(5.3, 1);
    });

    it('verifies store toggles sunlight-mode class on document.documentElement', () => {
      const store = new DiagnosticStore();
      expect(document.documentElement.classList.contains('sunlight-mode')).toBe(false);

      store.toggleSunlightMode();
      expect(document.documentElement.classList.contains('sunlight-mode')).toBe(true);

      store.toggleSunlightMode();
      expect(document.documentElement.classList.contains('sunlight-mode')).toBe(false);
    });
  });
});
