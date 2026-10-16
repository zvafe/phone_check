import { describe, it, expect, vi } from 'vitest';
import { DiagnosticRunner } from '../../src/core/runner';
import { DiagnosticStore } from '../../src/core/store';
import { DiagnosticTest } from '../../src/core/types';

describe('DiagnosticRunner Engine', () => {
  it('registers and retrieves diagnostic tests', () => {
    const runner = new DiagnosticRunner();
    const mockTest: DiagnosticTest = {
      id: 'touch_grid',
      name: 'Touch Grid Test',
      category: 'HARDWARE',
      description: 'Grid touch verification',
      run: async () => ({
        id: 'touch_grid',
        name: 'Touch Grid Test',
        category: 'HARDWARE',
        status: 'PASSED',
        summary: '100% covered',
        timestamp: Date.now(),
      }),
    };

    runner.registerTest(mockTest);
    expect(runner.getTest('touch_grid')).toBe(mockTest);
    expect(runner.getAllTests()).toHaveLength(1);
    expect(runner.getTestsByCategory('HARDWARE')).toHaveLength(1);
    expect(runner.getTestsByCategory('BENCHMARK')).toHaveLength(0);

    expect(() => runner.registerTest(mockTest)).toThrow(/already registered/);
  });

  it('executes a single test and reports progress', async () => {
    const store = new DiagnosticStore();
    const runner = new DiagnosticRunner({ store });
    const progressSpy = vi.fn();
    runner.setListeners({ onTestProgress: progressSpy });

    const mockTest: DiagnosticTest = {
      id: 'disp_refresh',
      name: 'Display Refresh Test',
      category: 'HARDWARE',
      description: '120Hz test',
      run: async (_signal, onProgress) => {
        onProgress?.(50, 'Measuring refresh rate');
        onProgress?.(100, 'Complete');
        return {
          id: 'disp_refresh',
          name: 'Display Refresh Test',
          category: 'HARDWARE',
          status: 'PASSED',
          score: 100,
          summary: '120 Hz Detected',
          timestamp: Date.now(),
        };
      },
    };

    runner.registerTest(mockTest);
    const result = await runner.runSingle('disp_refresh');

    expect(result.status).toBe('PASSED');
    expect(result.score).toBe(100);
    expect(progressSpy).toHaveBeenCalledWith('disp_refresh', 50, 'Measuring refresh rate');
    expect(progressSpy).toHaveBeenCalledWith('disp_refresh', 100, 'Complete');
    expect(store.getResult('disp_refresh')?.status).toBe('PASSED');
  });

  it('enforces timeout guards and invokes test cancellation', async () => {
    const runner = new DiagnosticRunner({ defaultTimeoutMs: 100 });
    const cancelSpy = vi.fn();

    const hangingTest: DiagnosticTest = {
      id: 'hanging_test',
      name: 'Hanging Test',
      category: 'BENCHMARK',
      description: 'Never finishes',
      run: (_signal) => new Promise(() => {}), // hangs forever
      cancel: cancelSpy,
    };

    runner.registerTest(hangingTest);
    const result = await runner.runSingle('hanging_test', 50);

    expect(result.status).toBe('FAILED');
    expect(result.summary).toContain('timed out after 50ms');
    expect(cancelSpy).toHaveBeenCalled();
  });

  it('isolates unhandled test exceptions without throwing or halting runner', async () => {
    const runner = new DiagnosticRunner();
    const errorSpy = vi.fn();
    runner.setListeners({ onError: errorSpy });

    const faultyTest: DiagnosticTest = {
      id: 'faulty_sensor',
      name: 'Faulty Sensor',
      category: 'HARDWARE',
      description: 'Throws error',
      run: async () => {
        throw new Error('Device sensor disconnected');
      },
    };

    runner.registerTest(faultyTest);
    const result = await runner.runSingle('faulty_sensor');

    expect(result.status).toBe('FAILED');
    expect(result.summary).toContain('Device sensor disconnected');
    expect(errorSpy).toHaveBeenCalledWith('faulty_sensor', expect.any(Error));
  });

  it('executes a suite of tests sequentially in registered order', async () => {
    const runner = new DiagnosticRunner();
    const executionOrder: string[] = [];

    const test1: DiagnosticTest = {
      id: 'test_1',
      name: 'Test 1',
      category: 'SECURITY',
      description: 'First',
      run: async () => {
        executionOrder.push('test_1');
        return {
          id: 'test_1',
          name: 'Test 1',
          category: 'SECURITY',
          status: 'PASSED',
          summary: 'OK',
          timestamp: Date.now(),
        };
      },
    };

    const test2: DiagnosticTest = {
      id: 'test_2',
      name: 'Test 2',
      category: 'SECURITY',
      description: 'Second',
      run: async () => {
        executionOrder.push('test_2');
        return {
          id: 'test_2',
          name: 'Test 2',
          category: 'SECURITY',
          status: 'PASSED',
          summary: 'OK',
          timestamp: Date.now(),
        };
      },
    };

    runner.registerTests([test1, test2]);
    const results = await runner.runAll();

    expect(executionOrder).toEqual(['test_1', 'test_2']);
    expect(results['test_1']?.status).toBe('PASSED');
    expect(results['test_2']?.status).toBe('PASSED');
  });

  it('aborts active suite and marks remaining queued tests as SKIPPED', async () => {
    const store = new DiagnosticStore();
    const runner = new DiagnosticRunner({ store });

    const slowTest: DiagnosticTest = {
      id: 'slow_test',
      name: 'Slow Test',
      category: 'HARDWARE',
      description: 'Takes time',
      run: async (signal) => {
        return new Promise((resolve) => {
          const timer = setTimeout(() => {
            resolve({
              id: 'slow_test',
              name: 'Slow Test',
              category: 'HARDWARE',
              status: 'PASSED',
              summary: 'Done',
              timestamp: Date.now(),
            });
          }, 300);
          signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            resolve({
              id: 'slow_test',
              name: 'Slow Test',
              category: 'HARDWARE',
              status: 'SKIPPED',
              summary: 'Cancelled',
              timestamp: Date.now(),
            });
          });
        });
      },
    };

    const queuedTest: DiagnosticTest = {
      id: 'queued_test',
      name: 'Queued Test',
      category: 'HARDWARE',
      description: 'Should be skipped',
      run: async () => ({
        id: 'queued_test',
        name: 'Queued Test',
        category: 'HARDWARE',
        status: 'PASSED',
        summary: 'Done',
        timestamp: Date.now(),
      }),
    };

    runner.registerTests([slowTest, queuedTest]);

    const runPromise = runner.runAll();
    setTimeout(() => {
      runner.cancel();
    }, 40);

    const results = await runPromise;
    expect(runner.getIsRunning()).toBe(false);
    expect(results['queued_test']?.status).toBe('SKIPPED');
    expect(store.getState().runnerState).toBe('ABORTED');
  });

  it('prevents multiple concurrent runAll invocations', async () => {
    const runner = new DiagnosticRunner();
    const test: DiagnosticTest = {
      id: 't',
      name: 'T',
      category: 'HARDWARE',
      description: 'D',
      run: async () => new Promise((resolve) => setTimeout(resolve, 50)).then(() => ({
        id: 't',
        name: 'T',
        category: 'HARDWARE',
        status: 'PASSED',
        summary: 'OK',
        timestamp: Date.now(),
      })),
    };
    runner.registerTest(test);

    const firstRun = runner.runAll();
    await expect(runner.runAll()).rejects.toThrow(/already in progress/);
    await firstRun;
  });

  it('throws an error when runSingle is invoked with unknown test ID', async () => {
    const runner = new DiagnosticRunner();
    await expect(runner.runSingle('non_existent_id')).rejects.toThrow(/not found/);
  });

  it('returns empty results map when runAll has no matching tests', async () => {
    const runner = new DiagnosticRunner();
    const results = await runner.runAll('HARDWARE');
    expect(results).toEqual({});
  });
});
