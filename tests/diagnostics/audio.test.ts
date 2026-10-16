import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StereoAudioTest, FrequencySweepTest, MicrophoneLoopbackTest } from '../../src/modules/diagnostics/audio';

describe('Audio Diagnostics Suite', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe('StereoAudioTest', () => {
    it('runs headlessly and passes', async () => {
      const test = new StereoAudioTest();
      const result = await test.run();
      expect(result.id).toBe('hw-audio-stereo');
      expect(result.status).toBe('PASSED');
      expect(result.score).toBe(100);
    });

    it('renders UI and handles user pass button', async () => {
      const test = new StereoAudioTest();
      test.renderUI(container);

      const runPromise = test.run();

      const btnPass = container.querySelector('#btn-stereo-pass') as HTMLButtonElement;
      expect(btnPass).not.toBeNull();
      btnPass.click();

      const result = await runPromise;
      expect(result.status).toBe('PASSED');
    });

    it('handles speaker failure button', async () => {
      const test = new StereoAudioTest();
      test.renderUI(container);

      const runPromise = test.run();

      const btnFail = container.querySelector('#btn-stereo-fail') as HTMLButtonElement;
      expect(btnFail).not.toBeNull();
      btnFail.click();

      const result = await runPromise;
      expect(result.status).toBe('FAILED');
      expect(result.score).toBe(30);
    });
  });

  describe('FrequencySweepTest', () => {
    it('runs headlessly and passes', async () => {
      const test = new FrequencySweepTest();
      const result = await test.run();
      expect(result.id).toBe('hw-audio-sweep');
      expect(result.status).toBe('PASSED');
    });

    it('renders sweep UI and records rattle warning', async () => {
      const test = new FrequencySweepTest();
      test.renderUI(container);

      const runPromise = test.run();

      const btnRattle = container.querySelector('#btn-sweep-rattle') as HTMLButtonElement;
      expect(btnRattle).not.toBeNull();
      btnRattle.click();

      const result = await runPromise;
      expect(result.status).toBe('WARNING');
      expect(result.score).toBe(50);
    });
  });

  describe('MicrophoneLoopbackTest', () => {
    it('runs headlessly and reports interface availability', async () => {
      const test = new MicrophoneLoopbackTest();
      const result = await test.run();
      expect(result.id).toBe('hw-audio-mic');
      expect(result.status).toBe('PASSED');
    });

    it('renders mic UI and records crystal clear pass', async () => {
      const test = new MicrophoneLoopbackTest();
      test.renderUI(container);

      const runPromise = test.run();

      const btnPass = container.querySelector('#btn-mic-pass') as HTMLButtonElement;
      expect(btnPass).not.toBeNull();
      btnPass.click();

      const result = await runPromise;
      expect(result.status).toBe('PASSED');
      expect(result.score).toBe(100);
    });

    it('flags red flag if microphone is defective', async () => {
      const test = new MicrophoneLoopbackTest();
      test.renderUI(container);

      const runPromise = test.run();

      const btnFail = container.querySelector('#btn-mic-fail') as HTMLButtonElement;
      expect(btnFail).not.toBeNull();
      btnFail.click();

      const result = await runPromise;
      expect(result.status).toBe('FAILED');
      expect(result.criticalRedFlag).toBe(true);
    });
  });
});
