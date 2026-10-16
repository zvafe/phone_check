import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TouchGridTest, MultiTouchTest, GhostTouchTest } from '../../src/modules/diagnostics/touch';

describe('Touch Diagnostics Suite', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe('TouchGridTest', () => {
    it('resolves with automated pass when run headlessly', async () => {
      const test = new TouchGridTest();
      const result = await test.run();
      expect(result.id).toBe('hw-touch-grid');
      expect(result.status).toBe('PASSED');
      expect(result.score).toBe(100);
      expect(result.category).toBe('HARDWARE');
    });

    it('renders grid board and handles manual pass button', async () => {
      const test = new TouchGridTest();
      test.renderUI(container);

      const board = container.querySelector('#touch-grid-board');
      expect(board).not.toBeNull();
      const cells = board?.querySelectorAll('[data-cell-idx]');
      expect(cells?.length).toBe(60);

      const runPromise = test.run();

      const btnPass = container.querySelector('#touch-btn-pass') as HTMLButtonElement;
      expect(btnPass).not.toBeNull();
      btnPass.click();

      const result = await runPromise;
      expect(result.status).toBe('PASSED');
      expect(result.score).toBeGreaterThanOrEqual(90);
    });

    it('handles manual dead zone failure button', async () => {
      const test = new TouchGridTest();
      test.renderUI(container);

      const runPromise = test.run();

      const btnFail = container.querySelector('#touch-btn-fail') as HTMLButtonElement;
      expect(btnFail).not.toBeNull();
      btnFail.click();

      const result = await runPromise;
      expect(result.status).toBe('FAILED');
      expect(result.criticalRedFlag).toBe(true);
    });

    it('handles test abort signal cleanly', async () => {
      const test = new TouchGridTest();
      const controller = new AbortController();

      const runPromise = test.run(controller.signal);
      controller.abort();

      const result = await runPromise;
      expect(result.status).toBe('SKIPPED');
    });
  });

  describe('MultiTouchTest', () => {
    it('runs headlessly and checks maxTouchPoints', async () => {
      const test = new MultiTouchTest();
      const result = await test.run();
      expect(result.id).toBe('hw-multi-touch');
      expect(['PASSED', 'WARNING', 'FAILED']).toContain(result.status);
    });

    it('renders multi-touch pad and handles complete button', async () => {
      const test = new MultiTouchTest();
      test.renderUI(container);

      const pad = container.querySelector('#multitouch-pad');
      expect(pad).not.toBeNull();

      const runPromise = test.run();

      const btnDone = container.querySelector('#multitouch-btn-done') as HTMLButtonElement;
      expect(btnDone).not.toBeNull();
      btnDone.click();

      const result = await runPromise;
      expect(result.id).toBe('hw-multi-touch');
    });
  });

  describe('GhostTouchTest', () => {
    it('runs headlessly and passes by default', async () => {
      const test = new GhostTouchTest();
      const result = await test.run();
      expect(result.id).toBe('hw-ghost-jitter');
      expect(result.status).toBe('PASSED');
    });

    it('renders canvas and allows confirming clean touch', async () => {
      const test = new GhostTouchTest();
      test.renderUI(container);

      const canvas = container.querySelector('#ghost-canvas');
      expect(canvas).not.toBeNull();

      const runPromise = test.run();

      const btnClean = container.querySelector('#ghost-btn-clean') as HTMLButtonElement;
      expect(btnClean).not.toBeNull();
      btnClean.click();

      const result = await runPromise;
      expect(result.status).toBe('PASSED');
      expect(result.criticalRedFlag).toBe(false);
    });

    it('flags ghost touch when user reports defect', async () => {
      const test = new GhostTouchTest();
      test.renderUI(container);

      const runPromise = test.run();

      const btnFlag = container.querySelector('#ghost-btn-flag') as HTMLButtonElement;
      expect(btnFlag).not.toBeNull();
      btnFlag.click();

      const result = await runPromise;
      expect(result.status).toBe('FAILED');
      expect(result.criticalRedFlag).toBe(true);
    });
  });
});
