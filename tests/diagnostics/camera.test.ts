import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CameraFrontTest, CameraRearTest } from '../../src/modules/diagnostics/camera';

describe('Camera Diagnostics Suite', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe('CameraFrontTest', () => {
    it('runs headlessly and passes', async () => {
      const test = new CameraFrontTest();
      const result = await test.run();
      expect(result.id).toBe('hw-camera-front');
      expect(result.status).toBe('PASSED');
    });

    it('renders UI and records user pass confirmation', async () => {
      const test = new CameraFrontTest();
      test.renderUI(container);

      const runPromise = test.run();

      const btnPass = container.querySelector('#btn-cam-pass') as HTMLButtonElement;
      expect(btnPass).not.toBeNull();
      btnPass.click();

      const result = await runPromise;
      expect(result.status).toBe('PASSED');
      expect(result.criticalRedFlag).toBe(false);
    });

    it('records FAILED and criticalRedFlag when user flags front camera defect', async () => {
      const test = new CameraFrontTest();
      test.renderUI(container);

      const runPromise = test.run();

      const btnFail = container.querySelector('#btn-cam-fail') as HTMLButtonElement;
      expect(btnFail).not.toBeNull();
      btnFail.click();

      const result = await runPromise;
      expect(result.status).toBe('FAILED');
      expect(result.criticalRedFlag).toBe(true);
    });
  });

  describe('CameraRearTest', () => {
    it('runs headlessly and passes', async () => {
      const test = new CameraRearTest();
      const result = await test.run();
      expect(result.id).toBe('hw-camera-rear');
      expect(result.status).toBe('PASSED');
    });

    it('renders rear camera UI with torch toggle button', () => {
      const test = new CameraRearTest();
      test.renderUI(container);

      const torchBtn = container.querySelector('#btn-torch-toggle');
      expect(torchBtn).not.toBeNull();
      expect(container.querySelector('#torch-status-text')?.textContent).toContain('Torch: OFF');
    });

    it('records rear camera pass and includes torchTested in details', async () => {
      const test = new CameraRearTest();
      test.renderUI(container);

      const runPromise = test.run();

      const btnPass = container.querySelector('#btn-cam-pass') as HTMLButtonElement;
      expect(btnPass).not.toBeNull();
      btnPass.click();

      const result = await runPromise;
      expect(result.status).toBe('PASSED');
      expect(result.details?.torchTested).toBe(true);
    });
  });
});
