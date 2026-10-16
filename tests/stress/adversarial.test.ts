import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DiagnosticRunner } from '../../src/core/runner';
import { DiagnosticStore, STORAGE_KEY } from '../../src/core/store';
import { DiagnosticTest } from '../../src/core/types';

describe('Adversarial Stress Suite: DiagnosticRunner & DiagnosticStore', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  // =========================================================================
  // 1. RAPID START / CANCEL LOOPS & CONCURRENCY RACES
  // =========================================================================
  describe('1. Rapid Start / Cancel Loops & Concurrency Races', () => {
    it('executes 100 rapid start/cancel cycles sequentially without unhandled rejections or deadlocks', async () => {
      const store = new DiagnosticStore();
      const runner = new DiagnosticRunner({ store });

      const test1: DiagnosticTest = {
        id: 'fast_test',
        name: 'Fast Test',
        category: 'HARDWARE',
        description: 'Fast',
        run: async () => ({
          id: 'fast_test',
          name: 'Fast Test',
          category: 'HARDWARE',
          status: 'PASSED',
          summary: 'Fast OK',
          timestamp: Date.now(),
        }),
      };

      const test2: DiagnosticTest = {
        id: 'async_test',
        name: 'Async Test',
        category: 'HARDWARE',
        description: 'Async',
        run: async (signal) => {
          return new Promise((resolve) => {
            const timer = setTimeout(() => {
              resolve({
                id: 'async_test',
                name: 'Async Test',
                category: 'HARDWARE',
                status: 'PASSED',
                summary: 'Async OK',
                timestamp: Date.now(),
              });
            }, 20);
            signal?.addEventListener('abort', () => {
              clearTimeout(timer);
              resolve({
                id: 'async_test',
                name: 'Async Test',
                category: 'HARDWARE',
                status: 'SKIPPED',
                summary: 'Aborted',
                timestamp: Date.now(),
              });
            });
          });
        },
      };

      const test3: DiagnosticTest = {
        id: 'queued_test',
        name: 'Queued Test',
        category: 'HARDWARE',
        description: 'Queued',
        run: async () => ({
          id: 'queued_test',
          name: 'Queued Test',
          category: 'HARDWARE',
          status: 'PASSED',
          summary: 'Queued OK',
          timestamp: Date.now(),
        }),
      };

      runner.registerTests([test1, test2, test3]);

      let completedAborts = 0;
      for (let i = 0; i < 100; i++) {
        const runPromise = runner.runAll();
        // Immediately trigger cancellation
        runner.cancel();
        const results = await runPromise;
        expect(runner.getIsRunning()).toBe(false);
        expect(store.getState().runnerState).toBe('ABORTED');
        expect(results).toBeDefined();
        completedAborts++;
      }

      expect(completedAborts).toBe(100);
      expect(runner.getIsRunning()).toBe(false);
      expect(store.getState().activeTestId).toBeNull();
    });

    it('handles immediate cancel before test execution begins', async () => {
      const runner = new DiagnosticRunner();
      const runSpy = vi.fn().mockResolvedValue({
        id: 't1',
        name: 'T1',
        category: 'HARDWARE',
        status: 'PASSED',
        summary: 'OK',
        timestamp: Date.now(),
      });

      runner.registerTest({
        id: 't1',
        name: 'T1',
        category: 'HARDWARE',
        description: 'Desc',
        run: runSpy,
      });

      const p = runner.runAll();
      runner.cancel();
      const results = await p;

      expect(results['t1']).toBeDefined();
      expect(runner.getIsRunning()).toBe(false);
    });

    /**
     * EMPIRICAL RACE CONDITION BUG:
     * When runner.cancel() is invoked while a suite is awaiting an active test,
     * runner.cancel() synchronously sets `this.isRunning = false`.
     * If runner.runAll() is called immediately, it bypasses the `isRunning` check,
     * instantiates a brand new unaborted AbortController (`this.abortController = new AbortController()`),
     * and runs a second concurrent suite.
     * The first suite, on resuming, reads the NEW unaborted AbortController,
     * fails to abort remaining tests, executes remaining tests concurrently,
     * and premature completion in Run 1 sets `isRunning = false` and `runnerState = COMPLETED`
     * while Run 2 is still running!
     */
    it('demonstrates race condition: cancel() prematurely resets isRunning allowing concurrent suite collisions', async () => {
      const runner = new DiagnosticRunner();
      const executionEvents: string[] = [];

      runner.registerTest({
        id: 'step_1',
        name: 'Step 1',
        category: 'HARDWARE',
        description: 'Step 1',
        run: async (signal) => {
          executionEvents.push('step_1_started');
          return new Promise((resolve) => {
            const timer = setTimeout(() => {
              executionEvents.push('step_1_finished');
              resolve({
                id: 'step_1',
                name: 'Step 1',
                category: 'HARDWARE',
                status: 'PASSED',
                summary: 'OK',
                timestamp: Date.now(),
              });
            }, 30);
            signal?.addEventListener('abort', () => {
              clearTimeout(timer);
              executionEvents.push('step_1_aborted');
              resolve({
                id: 'step_1',
                name: 'Step 1',
                category: 'HARDWARE',
                status: 'SKIPPED',
                summary: 'Aborted',
                timestamp: Date.now(),
              });
            });
          });
        },
      });

      runner.registerTest({
        id: 'step_2',
        name: 'Step 2',
        category: 'HARDWARE',
        description: 'Step 2',
        run: async () => {
          executionEvents.push('step_2_started');
          return {
            id: 'step_2',
            name: 'Step 2',
            category: 'HARDWARE',
            status: 'PASSED',
            summary: 'OK',
            timestamp: Date.now(),
          };
        },
      });

      // 1. Run 1 starts
      const run1 = runner.runAll();
      // 2. Cancel Run 1 while step_1 is in flight
      runner.cancel();
      // 3. Immediately trigger Run 2 without awaiting run1:
      // EXPECTED CONTRACT: runner should reject or queue run2 until run1 finishes abort cleanup.
      // ACTUAL BEHAVIOR: cancel() set this.isRunning = false synchronously, so runAll() starts immediately!
      const run2 = runner.runAll();

      const [res1, res2] = await Promise.all([run1, run2]);

      // Empirically verify that Run 1 failed to skip step_2 because Run 2 overwrote this.abortController!
      expect(res1['step_2']?.status).toBe('PASSED'); // BUG: should have been SKIPPED in Run 1!
      expect(res2['step_2']?.status).toBe('PASSED');
      // Step 2 was executed TWICE instead of being skipped in the cancelled run:
      const step2Starts = executionEvents.filter((e) => e === 'step_2_started');
      expect(step2Starts.length).toBe(2);
    });
  });

  // =========================================================================
  // 2. HANGING / LEAKING TESTS
  // =========================================================================
  describe('2. Hanging and Leaking Tests', () => {
    it('aborts and marks test as timed-out when test ignores signal and never resolves', async () => {
      const runner = new DiagnosticRunner({ defaultTimeoutMs: 100 });
      const cancelSpy = vi.fn();

      const completelyHangingTest: DiagnosticTest = {
        id: 'rogue_hanging',
        name: 'Rogue Hanging Test',
        category: 'BENCHMARK',
        description: 'Ignores signal and never resolves',
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        run: () => new Promise(() => {}),
        cancel: cancelSpy,
      };

      runner.registerTest(completelyHangingTest);

      const startTime = Date.now();
      const result = await runner.runSingle('rogue_hanging', 60);
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeGreaterThanOrEqual(50);
      expect(elapsed).toBeLessThan(500);
      expect(result.status).toBe('FAILED');
      expect(result.summary).toContain('timed out after 60ms');
      expect(result.details).toEqual(expect.objectContaining({ timedOut: true, timeoutMs: 60 }));
      expect(cancelSpy).toHaveBeenCalledTimes(1);
    });

    it('ensures a suite completes in bounded time when multiple tests hang', async () => {
      const runner = new DiagnosticRunner({ defaultTimeoutMs: 50 });

      const testPass1: DiagnosticTest = {
        id: 'pass1',
        name: 'Pass 1',
        category: 'HARDWARE',
        description: 'Passes',
        run: async () => ({
          id: 'pass1',
          name: 'Pass 1',
          category: 'HARDWARE',
          status: 'PASSED',
          summary: 'OK',
          timestamp: Date.now(),
        }),
      };

      const testHang1: DiagnosticTest = {
        id: 'hang1',
        name: 'Hang 1',
        category: 'HARDWARE',
        description: 'Hangs',
        run: () => new Promise(() => {}),
      };

      const testPass2: DiagnosticTest = {
        id: 'pass2',
        name: 'Pass 2',
        category: 'HARDWARE',
        description: 'Passes',
        run: async () => ({
          id: 'pass2',
          name: 'Pass 2',
          category: 'HARDWARE',
          status: 'PASSED',
          summary: 'OK',
          timestamp: Date.now(),
        }),
      };

      const testHang2: DiagnosticTest = {
        id: 'hang2',
        name: 'Hang 2',
        category: 'HARDWARE',
        description: 'Hangs',
        run: () => new Promise(() => {}),
      };

      runner.registerTests([testPass1, testHang1, testPass2, testHang2]);

      const start = Date.now();
      const results = await runner.runAll();
      const totalTime = Date.now() - start;

      // 2 hanging tests * ~50ms = ~100ms
      expect(totalTime).toBeGreaterThanOrEqual(90);
      expect(totalTime).toBeLessThan(1000);

      expect(results['pass1']?.status).toBe('PASSED');
      expect(results['hang1']?.status).toBe('FAILED');
      expect(results['hang1']?.summary).toContain('timed out');
      expect(results['pass2']?.status).toBe('PASSED');
      expect(results['hang2']?.status).toBe('FAILED');
      expect(results['hang2']?.summary).toContain('timed out');
    });

    it('survives tests that reject with non-Error primitives (strings, null, undefined, objects)', async () => {
      const runner = new DiagnosticRunner();

      const rejectString: DiagnosticTest = {
        id: 'rej_string',
        name: 'Reject String',
        category: 'HARDWARE',
        description: 'Rejects with string',
        run: async () => {
          throw 'plain string error';
        },
      };

      const rejectNull: DiagnosticTest = {
        id: 'rej_null',
        name: 'Reject Null',
        category: 'HARDWARE',
        description: 'Rejects with null',
        run: async () => {
          throw null;
        },
      };

      const rejectUndefined: DiagnosticTest = {
        id: 'rej_undef',
        name: 'Reject Undefined',
        category: 'HARDWARE',
        description: 'Rejects with undefined',
        run: async () => {
          throw undefined;
        },
      };

      const rejectObj: DiagnosticTest = {
        id: 'rej_obj',
        name: 'Reject Obj',
        category: 'HARDWARE',
        description: 'Rejects with custom object',
        run: async () => {
          throw { code: 500, reason: 'internal failure' };
        },
      };

      runner.registerTests([rejectString, rejectNull, rejectUndefined, rejectObj]);

      const results = await runner.runAll();

      expect(results['rej_string']?.status).toBe('FAILED');
      expect(results['rej_string']?.summary).toContain('plain string error');

      expect(results['rej_null']?.status).toBe('FAILED');
      expect(results['rej_null']?.summary).toContain('null');

      expect(results['rej_undef']?.status).toBe('FAILED');
      expect(results['rej_undef']?.summary).toContain('undefined');

      expect(results['rej_obj']?.status).toBe('FAILED');
      expect(results['rej_obj']?.summary).toContain('[object Object]');
    });

    /**
     * UNISOLATED LATE EVENT LEAKAGE BUG:
     * When a test times out, the runner returns a FAILED result and moves on.
     * However, the original executionPromise remains active in memory.
     * If the timed-out test subsequently throws or reports progress,
     * runner listeners (`onError`, `onTestProgress`) receive events for an already completed test.
     */
    it('observes late event leakage when a hanging test throws or calls onProgress post-timeout', async () => {
      const runner = new DiagnosticRunner();
      const progressSpy = vi.fn();
      const errorSpy = vi.fn();
      runner.setListeners({
        onTestProgress: progressSpy,
        onError: errorSpy,
      });

      let triggerDelayedProgress: ((p: number) => void) | null = null;
      let triggerDelayedError: ((err: Error) => void) | null = null;

      const delayedTest: DiagnosticTest = {
        id: 'delayed_leak_test',
        name: 'Delayed Leak Test',
        category: 'BENCHMARK',
        description: 'Fires progress and error after timeout',
        run: (_signal, onProgress) => {
          triggerDelayedProgress = (p) => onProgress?.(p, 'Late progress');
          return new Promise((_, reject) => {
            triggerDelayedError = (err) => reject(err);
          });
        },
      };

      runner.registerTest(delayedTest);
      const result = await runner.runSingle('delayed_leak_test', 30);
      expect(result.status).toBe('FAILED');
      expect(result.summary).toContain('timed out after 30ms');

      // 1. Rogue late progress call
      if (triggerDelayedProgress) {
        (triggerDelayedProgress as (p: number) => void)(99);
      }
      expect(progressSpy).toHaveBeenCalledWith('delayed_leak_test', 99, 'Late progress');

      // 2. Rogue late error throw
      if (triggerDelayedError) {
        (triggerDelayedError as (err: Error) => void)(new Error('Late catastrophic crash'));
      }
      // Wait a microtask tick for executionPromise's catch block to execute
      await new Promise((r) => setTimeout(r, 10));

      // Demonstrates that onError fired post-timeout
      expect(errorSpy).toHaveBeenCalledWith('delayed_leak_test', expect.any(Error));
    });
  });

  // =========================================================================
  // 3. STORE CORRUPTION & RESILIENCE
  // =========================================================================
  describe('3. Store Corruption & Resilience', () => {
    it('handles corrupted and malformed base64 strings in restoreFromHash gracefully', () => {
      const store = new DiagnosticStore();

      expect(store.restoreFromHash('!@#$%^&*()_+')).toBe(false);
      expect(store.restoreFromHash('abcde')).toBe(false);

      const invalidJsonB64 = btoa('this is plain text not json');
      expect(store.restoreFromHash(invalidJsonB64)).toBe(false);

      const emptyJsonB64 = btoa('""');
      expect(store.restoreFromHash(emptyJsonB64)).toBe(false);

      const nullJsonB64 = btoa('null');
      expect(store.restoreFromHash(nullJsonB64)).toBe(false);

      const numJsonB64 = btoa('12345');
      expect(store.restoreFromHash(numJsonB64)).toBe(false);

      const noResultsB64 = btoa(JSON.stringify({ sessionId: 'abc', timestamp: 123 }));
      expect(store.restoreFromHash(noResultsB64)).toBe(false);
    });

    it('handles malformed URI components in restoreFromHash gracefully', () => {
      const store = new DiagnosticStore();
      expect(store.restoreFromHash('%E0%A4%A')).toBe(false);
      expect(store.restoreFromHash('%')).toBe(false);
      expect(store.restoreFromHash('%ZZ')).toBe(false);
      expect(store.restoreFromHash('%%%')).toBe(false);
    });

    it('handles oversized payloads (1MB - 5MB) without crashing or hanging', () => {
      const store = new DiagnosticStore();
      const bigString = 'x'.repeat(1024 * 1024);
      const bigB64 = btoa(bigString);

      const startTime = Date.now();
      const restored = store.restoreFromHash(bigB64);
      const elapsed = Date.now() - startTime;

      expect(restored).toBe(false);
      expect(elapsed).toBeLessThan(1000);
    });

    /**
     * EMPIRICAL BUG: STORE CRASH ON CORRUPTED LOCALSTORAGE PRIMITIVES
     * In DiagnosticStore.loadFromStorage():
     * If localStorage contains JSON primitives (e.g. "12345", "\"string\"", "true", "[]"),
     * `JSON.parse` succeeds, but `parsed` is not a valid InspectionSuiteState object.
     * `parsed.startedAt` evaluates to undefined without throwing,
     * and `{ ...parsed, activeTestId: null, ... }` returns a broken object without `sessionId` or `results`.
     * Because the returned object is truthy, `this.createInitialState()` is bypassed.
     * Subsequently, calling `store.getResult(...)` throws:
     * `TypeError: Cannot read properties of undefined (reading 'xyz')`.
     */
    it('demonstrates crash vulnerability when localStorage contains JSON primitives or invalid schemas', () => {
      const corruptedPrimitives = [
        '12345',
        '"string_token"',
        'true',
        '[]',
      ];

      for (const rawPayload of corruptedPrimitives) {
        window.localStorage.setItem(STORAGE_KEY, rawPayload);

        const store = new DiagnosticStore();
        const state = store.getState();

        // Check if sessionId was preserved/generated or corrupted:
        const isSessionIdMissing = state.sessionId === undefined;
        // Check if results is undefined:
        const isResultsMissing = state.results === undefined;

        // Verify the vulnerability:
        expect(isSessionIdMissing).toBe(true);
        expect(isResultsMissing).toBe(true);

        // Verify that querying a result throws TypeError:
        expect(() => {
          store.getResult('touch_test');
        }).toThrow(TypeError);
      }
    });

    it('survives localStorage quota exceeded or access denied without crashing', () => {
      const store = new DiagnosticStore();
      const originalSetItem = window.localStorage.setItem;

      window.localStorage.setItem = vi.fn().mockImplementation(() => {
        const err = new Error('QuotaExceededError');
        err.name = 'QuotaExceededError';
        throw err;
      });

      expect(() => {
        store.setCategory('BENCHMARK');
        store.setResult({
          id: 'quota_test',
          name: 'Quota Test',
          category: 'BENCHMARK',
          status: 'PASSED',
          summary: 'Quota Test Passed',
          timestamp: Date.now(),
        });
        store.clearResults();
      }).not.toThrow();

      window.localStorage.setItem = originalSetItem;
    });
  });

  // =========================================================================
  // 4. HIGH CONCURRENCY SUBSCRIBER THRASHING & ERROR ISOLATION
  // =========================================================================
  describe('4. High Concurrency Subscriber Thrashing & Error Isolation', () => {
    it('manages 500 concurrent subscribers registering, unsubscribing, and receiving updates during active test execution', async () => {
      const store = new DiagnosticStore();
      const runner = new DiagnosticRunner({ store });

      const TOTAL_SUBSCRIBERS = 500;
      const notificationCounts = new Array(TOTAL_SUBSCRIBERS).fill(0);
      const unsubscribers: (() => void)[] = [];

      for (let i = 0; i < TOTAL_SUBSCRIBERS; i++) {
        const subIndex = i;
        const unsub = store.subscribe(() => {
          notificationCounts[subIndex]++;
        });
        unsubscribers.push(unsub);
      }

      expect(notificationCounts.every((count) => count === 1)).toBe(true);

      runner.registerTests([
        {
          id: 'thrash_1',
          name: 'Thrash 1',
          category: 'HARDWARE',
          description: 'Thrash test 1',
          run: async () => ({
            id: 'thrash_1',
            name: 'Thrash 1',
            category: 'HARDWARE',
            status: 'PASSED',
            summary: 'OK',
            timestamp: Date.now(),
          }),
        },
        {
          id: 'thrash_2',
          name: 'Thrash 2',
          category: 'HARDWARE',
          description: 'Thrash test 2',
          run: async () => ({
            id: 'thrash_2',
            name: 'Thrash 2',
            category: 'HARDWARE',
            status: 'PASSED',
            summary: 'OK',
            timestamp: Date.now(),
          }),
        },
      ]);

      const runPromise = runner.runAll();

      // Concurrently unsubscribe even-indexed listeners mid-flight
      for (let i = 0; i < TOTAL_SUBSCRIBERS; i += 2) {
        unsubscribers[i]!();
      }

      // Concurrently add 100 dynamic listeners
      const dynamicCounts: number[] = [];
      const dynamicUnsubs: (() => void)[] = [];
      for (let j = 0; j < 100; j++) {
        const dIdx = j;
        dynamicCounts[dIdx] = 0;
        dynamicUnsubs.push(
          store.subscribe(() => {
            dynamicCounts[dIdx] = (dynamicCounts[dIdx] ?? 0) + 1;
          })
        );
      }

      await runPromise;

      dynamicUnsubs.forEach((unsub) => unsub());

      const oddCounts = notificationCounts.filter((_, idx) => idx % 2 === 1);
      expect(oddCounts.every((c) => c > 1)).toBe(true);

      const evenCounts = notificationCounts.filter((_, idx) => idx % 2 === 0);
      const oddAverage = oddCounts.reduce((a, b) => a + b, 0) / oddCounts.length;
      const evenAverage = evenCounts.reduce((a, b) => a + b, 0) / evenCounts.length;
      expect(evenAverage).toBeLessThan(oddAverage);
    });

    it('supports subscriber unsubscribing itself during notification callback', () => {
      const store = new DiagnosticStore();
      let callCount = 0;

      let unsubscribeMe: (() => void) | null = null;
      unsubscribeMe = store.subscribe(() => {
        callCount++;
        if (callCount === 2 && unsubscribeMe) {
          unsubscribeMe();
        }
      });

      expect(callCount).toBe(1);

      store.setCategory('HARDWARE');
      expect(callCount).toBe(2);

      store.setCategory('SECURITY');
      expect(callCount).toBe(2);
    });

    /**
     * EMPIRICAL BUG: UNCAUGHT EXCEPTION AND LISTENER LEAK IN STORE.SUBSCRIBE
     * In DiagnosticStore.subscribe():
     * `this.subscribers.add(subscriber);` is called BEFORE `subscriber(this.state);`.
     * However, `subscriber(this.state)` is NOT wrapped in a try/catch.
     * If the subscriber throws on initial invocation:
     * 1. The exception propagates out of `subscribe()`, crashing the caller.
     * 2. The unsubscribe callback is never returned.
     * 3. The faulty subscriber remains permanently registered in `this.subscribers`.
     */
    it('demonstrates unhandled subscriber error during subscribe() registration', () => {
      const store = new DiagnosticStore();
      const explodingSubscriber = vi.fn().mockImplementation(() => {
        throw new Error('Exploding initial subscriber callback');
      });

      // Assert that calling subscribe throws synchronously:
      expect(() => {
        store.subscribe(explodingSubscriber);
      }).toThrow('Exploding initial subscriber callback');

      // And demonstrate that notify() still invokes the subscriber (though wrapped in notify's try/catch)
      expect(() => {
        store.setCategory('PHYSICAL');
      }).not.toThrow();
      expect(explodingSubscriber).toHaveBeenCalledTimes(2);
    });

    /**
     * EMPIRICAL VULNERABILITY: INFINITE RECURSION / CALL STACK OVERFLOW
     * When a subscriber modifies state (e.g. store.setCategory) unconditionally,
     * notify() triggers the subscriber, which triggers notify(), causing instant stack overflow.
     */
    it('demonstrates call stack exhaustion if a subscriber mutates store state without guard', () => {
      const store = new DiagnosticStore();
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      let counter = 0;
      store.subscribe(() => {
        counter++;
        if (counter < 20000) {
          // Unconditional state change triggers synchronous recursion
          store.setSunlightMode(counter % 2 === 0);
        }
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'DiagnosticStore subscriber error:',
        expect.any(RangeError)
      );
      consoleErrorSpy.mockRestore();
    });
  });
});
