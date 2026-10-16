import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MotionSensorsTest, GeolocationTest, BarometerSealTest, NfcTest } from '../../src/modules/diagnostics/sensors';

describe('Sensors Diagnostics Suite', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe('MotionSensorsTest', () => {
    it('runs headlessly and passes', async () => {
      const test = new MotionSensorsTest();
      const result = await test.run();
      expect(result.id).toBe('hw-sensors-motion');
      expect(result.status).toBe('PASSED');
    });

    it('renders bubble level UI and handles pass', async () => {
      const test = new MotionSensorsTest();
      test.renderUI(container);

      const bubble = container.querySelector('#spirit-bubble');
      expect(bubble).not.toBeNull();

      const runPromise = test.run();

      const btnPass = container.querySelector('#btn-motion-pass') as HTMLButtonElement;
      expect(btnPass).not.toBeNull();
      btnPass.click();

      const result = await runPromise;
      expect(result.status).toBe('PASSED');
      expect(result.score).toBe(100);
    });
  });

  describe('GeolocationTest', () => {
    it('handles successful GPS lock with high accuracy', async () => {
      Object.defineProperty(navigator, 'geolocation', {
        value: {
          getCurrentPosition: vi.fn((success) => {
            success({
              coords: {
                accuracy: 12,
                altitude: 50,
                heading: null,
                speed: null,
              },
            });
          }),
        },
        configurable: true,
      });

      const test = new GeolocationTest();
      const result = await test.run();

      expect(result.id).toBe('hw-sensors-gps');
      expect(result.status).toBe('PASSED');
      expect(result.score).toBe(100);
      expect(result.summary).toContain('±12m');
    });

    it('handles GPS permission denied error gracefully', async () => {
      Object.defineProperty(navigator, 'geolocation', {
        value: {
          getCurrentPosition: vi.fn((_, error) => {
            error({
              code: 1, // PERMISSION_DENIED
              message: 'User denied geolocation',
              PERMISSION_DENIED: 1,
            });
          }),
        },
        configurable: true,
      });

      const test = new GeolocationTest();
      const result = await test.run();

      expect(result.id).toBe('hw-sensors-gps');
      expect(result.status).toBe('WARNING');
      expect(result.summary).toContain('permission denied');
    });
  });

  describe('BarometerSealTest', () => {
    it('runs headlessly and passes', async () => {
      const test = new BarometerSealTest();
      const result = await test.run();
      expect(result.id).toBe('hw-sensors-barometer');
      expect(result.status).toBe('PASSED');
    });

    it('renders UI and flags broken seal when reported', async () => {
      const test = new BarometerSealTest();
      test.renderUI(container);

      const runPromise = test.run();

      const btnOpened = container.querySelector('#btn-seal-opened') as HTMLButtonElement;
      expect(btnOpened).not.toBeNull();
      btnOpened.click();

      const result = await runPromise;
      expect(result.status).toBe('WARNING');
      expect(result.score).toBe(60);
    });
  });

  describe('NfcTest', () => {
    it('runs headlessly and reports detection capability', async () => {
      const test = new NfcTest();
      const result = await test.run();
      expect(result.id).toBe('hw-sensors-nfc');
      expect(result.status).toBe('PASSED');
    });

    it('renders UI and handles user verification button', async () => {
      const test = new NfcTest();
      test.renderUI(container);

      const runPromise = test.run();

      const btnPass = container.querySelector('#btn-nfc-pass') as HTMLButtonElement;
      expect(btnPass).not.toBeNull();
      btnPass.click();

      const result = await runPromise;
      expect(result.status).toBe('PASSED');
      expect(result.score).toBe(100);
    });
  });
});
