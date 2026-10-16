/**
 * Core Domain Types & Contracts for Web Diagnostic & Verification Suite.
 * Strictly implements the interface contracts defined in PROJECT.md.
 */

export type TestStatus = 'IDLE' | 'RUNNING' | 'PASSED' | 'WARNING' | 'FAILED' | 'SKIPPED';

export type TestCategory = 'HARDWARE' | 'BENCHMARK' | 'SECURITY' | 'PHYSICAL';

export interface TestResult {
  id: string;
  name: string;
  category: TestCategory;
  status: TestStatus;
  score?: number; // 0-100 where applicable
  summary: string;
  details?: Record<string, unknown>;
  timestamp: number;
  criticalRedFlag?: boolean;
  durationMs?: number;
}

export interface DiagnosticTest {
  id: string;
  name: string;
  category: TestCategory;
  description: string;
  run(
    signal?: AbortSignal,
    onProgress?: (percent: number, message?: string) => void
  ): Promise<TestResult>;
  cancel?(): void;
  renderUI?(container: HTMLElement): void;
}

export interface DeviceHardwareInfo {
  userAgent: string;
  screenResolution: string;
  devicePixelRatio: number;
  hardwareConcurrency: number;
  platform: string;
  maxTouchPoints?: number;
  deviceMemory?: number;
}

export interface InspectionSuiteState {
  sessionId: string;
  startedAt: number;
  currentCategory: TestCategory | 'ALL';
  activeTestId: string | null;
  runnerState: 'IDLE' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'ABORTED';
  results: Record<string, TestResult>;
  sunlightMode: boolean;
  deviceInfo: DeviceHardwareInfo;
}

export interface DiagnosticReport {
  sessionId: string;
  deviceInfo: {
    userAgent: string;
    screenResolution: string;
    devicePixelRatio: number;
    hardwareConcurrency: number;
    platform: string;
  };
  overallVerdict: 'PASS' | 'WARNING' | 'CRITICAL_RED_FLAG';
  overallScore: number; // 0-100
  conditionGrade: 'A+' | 'A' | 'B' | 'C' | 'F';
  testResults: Record<string, TestResult>;
  timestamp: string;
  negotiationTips: string[];
}

export type StateSubscriber = (state: InspectionSuiteState) => void;

export interface RunnerListeners {
  onSuiteStart?: () => void;
  onTestStart?: (test: DiagnosticTest) => void;
  onTestProgress?: (testId: string, percent: number, message?: string) => void;
  onTestComplete?: (result: TestResult) => void;
  onSuiteComplete?: (results: Record<string, TestResult>) => void;
  onError?: (testId: string, error: unknown) => void;
}
