import {
  DiagnosticTest,
  TestResult,
  TestCategory,
  RunnerListeners,
} from './types';
import { DiagnosticStore } from './store';

export interface RunnerOptions {
  defaultTimeoutMs?: number;
  store?: DiagnosticStore;
}

export class DiagnosticRunner {
  private tests: Map<string, DiagnosticTest> = new Map();
  private testOrder: string[] = [];
  private abortController: AbortController | null = null;
  private activeSingleAbortController: AbortController | null = null;
  private isRunning: boolean = false;
  private defaultTimeoutMs: number;
  private store?: DiagnosticStore;
  private listeners: RunnerListeners = {};

  constructor(options: RunnerOptions = {}) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 30000;
    this.store = options.store;
  }

  public setListeners(listeners: RunnerListeners): void {
    this.listeners = { ...this.listeners, ...listeners };
  }

  public registerTest(test: DiagnosticTest): void {
    if (this.tests.has(test.id)) {
      throw new Error(`Test with id "${test.id}" is already registered.`);
    }
    this.tests.set(test.id, test);
    this.testOrder.push(test.id);
  }

  public registerTests(tests: DiagnosticTest[]): void {
    for (const test of tests) {
      this.registerTest(test);
    }
  }

  public getTest(id: string): DiagnosticTest | undefined {
    return this.tests.get(id);
  }

  public getAllTests(): DiagnosticTest[] {
    return this.testOrder.map((id) => this.tests.get(id)!);
  }

  public getTestsByCategory(category: TestCategory): DiagnosticTest[] {
    return this.getAllTests().filter((t) => t.category === category);
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }

  public cancel(): void {
    if (this.activeSingleAbortController && !this.activeSingleAbortController.signal.aborted) {
      this.activeSingleAbortController.abort();
    }
    if (this.abortController && !this.abortController.signal.aborted) {
      this.abortController.abort();
    }
    this.isRunning = false;
    if (this.store) {
      this.store.setState({ runnerState: 'ABORTED', activeTestId: null });
    }
  }

  public async runSingle(testId: string, timeoutMs?: number): Promise<TestResult> {
    const test = this.tests.get(testId);
    if (!test) {
      throw new Error(`Test with id "${testId}" not found.`);
    }

    const isStandalone = !this.abortController;
    if (isStandalone) {
      if (this.isRunning) {
        throw new Error('A test execution is already in progress.');
      }
      this.isRunning = true;
    }

    const testTimeout = timeoutMs ?? this.defaultTimeoutMs;
    const testAbortController = new AbortController();
    this.activeSingleAbortController = testAbortController;
    const startTime = Date.now();

    // Ensure test.cancel is invoked whenever testAbortController aborts (parent cancel, runner cancel, or timeout)
    const onTestAbort = () => {
      test.cancel?.();
    };
    testAbortController.signal.addEventListener('abort', onTestAbort, { once: true });

    // If runner-level abort is active, listen to it
    const onParentAbort = () => {
      testAbortController.abort();
    };
    if (this.abortController) {
      if (this.abortController.signal.aborted) {
        testAbortController.abort();
      } else {
        this.abortController.signal.addEventListener('abort', onParentAbort, { once: true });
      }
    }

    if (this.store) {
      this.store.setState({
        activeTestId: test.id,
        runnerState: 'RUNNING',
      });
    }
    this.listeners.onTestStart?.(test);

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<TestResult>((resolve) => {
      timeoutHandle = setTimeout(() => {
        testAbortController.abort();
        resolve({
          id: test.id,
          name: test.name,
          category: test.category,
          status: 'FAILED',
          summary: `Test timed out after ${testTimeout}ms`,
          details: { timedOut: true, timeoutMs: testTimeout },
          timestamp: Date.now(),
          durationMs: Date.now() - startTime,
        });
      }, testTimeout);
    });

    const executionPromise = (async (): Promise<TestResult> => {
      try {
        const result = await test.run(
          testAbortController.signal,
          (percent: number, message?: string) => {
            this.listeners.onTestProgress?.(test.id, percent, message);
          }
        );
        return {
          ...result,
          durationMs: Date.now() - startTime,
        };
      } catch (err: unknown) {
        test.cancel?.();
        const errorMessage = err instanceof Error ? err.message : String(err);
        const errorStack = err instanceof Error ? err.stack : undefined;
        this.listeners.onError?.(test.id, err);
        return {
          id: test.id,
          name: test.name,
          category: test.category,
          status: testAbortController.signal.aborted ? 'SKIPPED' : 'FAILED',
          summary: testAbortController.signal.aborted
            ? 'Test cancelled by user'
            : `Execution error: ${errorMessage}`,
          details: { error: errorMessage, stack: errorStack },
          timestamp: Date.now(),
          durationMs: Date.now() - startTime,
        };
      }
    })();

    const finalResult = await Promise.race([executionPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);
    if (this.abortController) {
      this.abortController.signal.removeEventListener('abort', onParentAbort);
    }
    if (this.activeSingleAbortController === testAbortController) {
      this.activeSingleAbortController = null;
    }

    if (this.store) {
      this.store.setResult(finalResult);
      if (isStandalone) {
        const finalRunnerState = testAbortController.signal.aborted ? 'ABORTED' : 'COMPLETED';
        this.store.setState({ runnerState: finalRunnerState, activeTestId: null });
      } else {
        this.store.setState({ activeTestId: null });
      }
    }
    if (isStandalone) {
      this.isRunning = false;
    }
    this.listeners.onTestComplete?.(finalResult);
    return finalResult;
  }

  public async runAll(category?: TestCategory): Promise<Record<string, TestResult>> {
    if (this.isRunning) {
      throw new Error('A test suite run is already in progress.');
    }

    const targetTests = category
      ? this.getTestsByCategory(category)
      : this.getAllTests();

    if (targetTests.length === 0) {
      return {};
    }

    this.isRunning = true;
    this.abortController = new AbortController();

    if (this.store) {
      this.store.setState({ runnerState: 'RUNNING' });
    }
    this.listeners.onSuiteStart?.();

    const results: Record<string, TestResult> = {};

    try {
      for (const test of targetTests) {
        if (this.abortController.signal.aborted) {
          // Record remaining tests as SKIPPED
          const skippedResult: TestResult = {
            id: test.id,
            name: test.name,
            category: test.category,
            status: 'SKIPPED',
            summary: 'Suite aborted before test execution',
            timestamp: Date.now(),
          };
          results[test.id] = skippedResult;
          if (this.store) {
            this.store.setResult(skippedResult);
          }
          continue;
        }

        const result = await this.runSingle(test.id);
        results[test.id] = result;
      }
    } finally {
      this.isRunning = false;
      const finalState = this.abortController?.signal.aborted ? 'ABORTED' : 'COMPLETED';
      if (this.store) {
        this.store.setState({
          runnerState: finalState,
          activeTestId: null,
        });
      }
      this.listeners.onSuiteComplete?.(results);
    }

    return results;
  }
}
