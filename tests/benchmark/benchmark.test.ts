import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FPSMeter } from '../../src/modules/benchmark/fps-meter';
import { WebGLGpuBenchmarkTest } from '../../src/modules/benchmark/webgl-gpu';
import { CpuWasmBenchmarkTest } from '../../src/modules/benchmark/cpu-wasm';
import { ThermalThrottlingTest } from '../../src/modules/benchmark/thermal';

describe('Benchmark Module Suite', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe('FPSMeter', () => {
    it('calculates average FPS and 1% low from simulated frame deltas', () => {
      const meter = new FPSMeter(60);
      meter.setTargetFps(60);

      let t = 1000;
      meter.recordFrame(t);

      // Simulate 50 frames at ~16.6ms (60 FPS) and 10 stutter frames at ~33.3ms (30 FPS)
      for (let i = 0; i < 50; i++) {
        t += 16.67;
        meter.recordFrame(t);
      }
      for (let i = 0; i < 10; i++) {
        t += 33.33;
        meter.recordFrame(t);
      }

      const stats = meter.getStats();
      expect(stats.totalFrames).toBe(60);
      expect(stats.averageFps).toBeGreaterThanOrEqual(45);
      expect(stats.averageFps).toBeLessThanOrEqual(65);
      expect(stats.onePercentLow).toBeLessThan(stats.averageFps);
      expect(stats.stutterCount).toBe(10);
    });

    it('renders to 2D canvas without error', () => {
      const meter = new FPSMeter(60);
      meter.recordFrame(100);
      meter.recordFrame(116.6);
      meter.recordFrame(133.2);

      const canvas = document.createElement('canvas');
      canvas.width = 300;
      canvas.height = 50;

      expect(() => meter.renderToCanvas(canvas)).not.toThrow();
    });

    it('resets ring buffer cleanly', () => {
      const meter = new FPSMeter(60);
      meter.recordFrame(100);
      meter.recordFrame(116.6);
      meter.reset();

      const stats = meter.getStats();
      expect(stats.totalFrames).toBe(0);
      expect(stats.averageFps).toBe(0);
    });
  });

  describe('WebGLGpuBenchmarkTest', () => {
    it('runs headlessly and passes with baseline score', async () => {
      const test = new WebGLGpuBenchmarkTest();
      const result = await test.run();

      expect(result.id).toBe('bench-gpu-webgl');
      expect(result.category).toBe('BENCHMARK');
      expect(result.status).toBe('PASSED');
      expect(result.score).toBeGreaterThanOrEqual(70);
    });

    it('renders WebGL canvas and UI container', () => {
      const test = new WebGLGpuBenchmarkTest();
      test.renderUI(container);

      const canvas = container.querySelector('#webgl-canvas');
      expect(canvas).not.toBeNull();
      const graph = container.querySelector('#gpu-fps-graph');
      expect(graph).not.toBeNull();
    });

    it('handles cancellation signal cleanly', async () => {
      const test = new WebGLGpuBenchmarkTest();
      const controller = new AbortController();

      const runPromise = test.run(controller.signal);
      controller.abort();

      const result = await runPromise;
      expect(result.status).toBe('SKIPPED');
    });
  });

  describe('CpuWasmBenchmarkTest', () => {
    it('runs compute benchmark and scores throughput', async () => {
      const test = new CpuWasmBenchmarkTest();
      const result = await test.run();

      expect(result.id).toBe('bench-cpu-multi');
      expect(result.category).toBe('BENCHMARK');
      expect(['PASSED', 'WARNING']).toContain(result.status);
      expect(result.score).toBeGreaterThan(0);
      expect(result.details?.throughputMegaOpsSec).toBeDefined();
    });

    it('renders UI with active core count', () => {
      const test = new CpuWasmBenchmarkTest();
      test.renderUI(container);

      const progressBar = container.querySelector('#cpu-progress-bar');
      expect(progressBar).not.toBeNull();
      expect(container.textContent).toContain('Active Threads');
    });
  });

  describe('ThermalThrottlingTest', () => {
    it('runs burst vs sustained benchmark and checks throttling', async () => {
      const test = new ThermalThrottlingTest();
      const result = await test.run();

      expect(result.id).toBe('bench-thermal-throttle');
      expect(result.category).toBe('BENCHMARK');
      expect(['PASSED', 'WARNING', 'FAILED']).toContain(result.status);
      expect(result.details?.throttlePct !== undefined || result.details?.throttlePercent !== undefined).toBe(true);
    });

    it('renders thermal UI and phase indicator', () => {
      const test = new ThermalThrottlingTest();
      test.renderUI(container);

      expect(container.querySelector('#thermal-phase-badge')).not.toBeNull();
      expect(container.querySelector('#thermal-progress-bar')).not.toBeNull();
    });

    it('inspects Battery Status API if supported', async () => {
      (navigator as any).getBattery = vi.fn().mockResolvedValue({
        charging: false,
        level: 0.82,
        chargingTime: Infinity,
        dischargingTime: 7200,
      });

      const test = new ThermalThrottlingTest();
      const result = await test.run();

      expect(result.details?.battery || result.details?.batteryStart).toBeDefined();
    });
  });
});
