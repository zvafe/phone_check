import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DisplayColorTest, DisplayRefreshRateTest } from '../../src/modules/diagnostics/display';

describe('Display Diagnostics Suite', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe('DisplayColorTest', () => {
    it('runs headlessly and reports clean pass', async () => {
      const test = new DisplayColorTest();
      const result = await test.run();
      expect(result.id).toBe('hw-display-colors');
      expect(result.status).toBe('PASSED');
      expect(result.score).toBe(100);
    });

    it('renders color surface and advances on next button', () => {
      const test = new DisplayColorTest();
      test.renderUI(container);

      const surface = container.querySelector('#display-color-surface') as HTMLElement;
      expect(surface).not.toBeNull();
      expect(['#FF0000', 'rgb(255, 0, 0)', '#ff0000']).toContain(surface.style.backgroundColor);

      const btnNext = container.querySelector('#btn-color-next') as HTMLButtonElement;
      expect(btnNext).not.toBeNull();
      btnNext.click();

      const updatedSurface = container.querySelector('#display-color-surface') as HTMLElement;
      expect(['#00FF00', 'rgb(0, 255, 0)', '#00ff00']).toContain(updatedSurface.style.backgroundColor);
    });

    it('records WARNING when dead pixel is reported', async () => {
      const test = new DisplayColorTest();
      test.renderUI(container);

      const runPromise = test.run();

      const btnDead = container.querySelector('#btn-color-dead-pixel') as HTMLButtonElement;
      btnDead.click();

      const result = await runPromise;
      expect(result.status).toBe('WARNING');
      expect(result.score).toBe(60);
    });

    it('handles WakeLock request and release safely without throwing', async () => {
      const mockRelease = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'wakeLock', {
        value: {
          request: vi.fn().mockResolvedValue({ release: mockRelease }),
        },
        configurable: true,
      });

      const test = new DisplayColorTest();
      test.renderUI(container);

      const runPromise = test.run();
      await new Promise((r) => setTimeout(r, 10)); // allow async acquireWakeLock to resolve
      const btnPass = container.querySelector('#btn-color-finish-pass') as HTMLButtonElement;
      btnPass.click();

      const result = await runPromise;
      expect(result.status).toBe('PASSED');
      expect(mockRelease).toHaveBeenCalled();
    });
  });

  describe('DisplayRefreshRateTest', () => {
    it('runs in headless environment and defaults to standard 60Hz', async () => {
      const test = new DisplayRefreshRateTest();
      const result = await test.run();
      expect(result.id).toBe('hw-refresh-rate');
      expect(result.status).toBe('PASSED');
      expect(result.details?.detectedHz || result.details?.classifiedHz).toBeDefined();
    });

    it('handles abort signal during refresh rate measurement', async () => {
      const test = new DisplayRefreshRateTest();
      const controller = new AbortController();

      const runPromise = test.run(controller.signal);
      controller.abort();

      const result = await runPromise;
      expect(result.status).toBe('SKIPPED');
    });
  });
});
