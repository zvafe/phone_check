import {
  InspectionSuiteState,
  TestResult,
  TestCategory,
  StateSubscriber,
  DeviceHardwareInfo,
} from './types';

export const STORAGE_KEY = 'used_phone_inspector_session_v1';
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function detectDeviceInfo(): DeviceHardwareInfo {
  if (typeof window === 'undefined') {
    return {
      userAgent: 'Mock-Environment',
      screenResolution: '1080x1920',
      devicePixelRatio: 2,
      hardwareConcurrency: 4,
      platform: 'Generic',
      maxTouchPoints: 5,
    };
  }

  const nav = window.navigator as unknown as {
    userAgent?: string;
    platform?: string;
    hardwareConcurrency?: number;
    maxTouchPoints?: number;
    deviceMemory?: number;
  };

  const width = window.screen?.width ?? window.innerWidth ?? 390;
  const height = window.screen?.height ?? window.innerHeight ?? 844;
  const dpr = window.devicePixelRatio ?? 1;

  return {
    userAgent: nav.userAgent || 'Unknown UA',
    screenResolution: `${width}x${height}`,
    devicePixelRatio: dpr,
    hardwareConcurrency: nav.hardwareConcurrency || 4,
    platform: nav.platform || 'Unknown Platform',
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    deviceMemory: nav.deviceMemory,
  };
}

export function generateSessionId(): string {
  return 'insp_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
}

export class DiagnosticStore {
  private state: InspectionSuiteState;
  private subscribers: Set<StateSubscriber> = new Set();

  constructor() {
    this.state = this.loadFromStorage() || this.createInitialState();
    this.checkUrlHash();
    this.applySunlightClass(this.state.sunlightMode);
    this.saveToStorage();
  }

  private createInitialState(): InspectionSuiteState {
    return {
      sessionId: generateSessionId(),
      startedAt: Date.now(),
      currentCategory: 'ALL',
      activeTestId: null,
      runnerState: 'IDLE',
      results: {},
      sunlightMode: false,
      deviceInfo: detectDeviceInfo(),
    };
  }

  private loadFromStorage(): InspectionSuiteState | null {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as InspectionSuiteState;
      
      // Check 24-hour expiration
      if (parsed.startedAt && Date.now() - parsed.startedAt > SESSION_TTL_MS) {
        window.localStorage.removeItem(STORAGE_KEY);
        return null;
      }

      // Re-hydrate state: reset volatile running state and refresh device info
      return {
        ...parsed,
        activeTestId: null,
        runnerState: parsed.runnerState === 'RUNNING' ? 'IDLE' : parsed.runnerState,
        deviceInfo: detectDeviceInfo(),
      };
    } catch {
      return null;
    }
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Ignore storage errors (quota exceeded or disabled)
    }
  }

  private notify(): void {
    for (const sub of this.subscribers) {
      try {
        sub(this.state);
      } catch (err) {
        console.error('DiagnosticStore subscriber error:', err);
      }
    }
  }

  private applySunlightClass(enabled: boolean): void {
    if (typeof document !== 'undefined' && document.documentElement) {
      if (enabled) {
        document.documentElement.classList.add('sunlight-mode');
      } else {
        document.documentElement.classList.remove('sunlight-mode');
      }
    }
  }

  private checkUrlHash(): void {
    if (typeof window === 'undefined' || !window.location || !window.location.hash) return;
    const hash = window.location.hash.slice(1);
    if (hash.startsWith('session=')) {
      const payload = hash.slice('session='.length);
      this.restoreFromHash(payload);
    }
  }

  public getState(): Readonly<InspectionSuiteState> {
    return this.state;
  }

  public subscribe(subscriber: StateSubscriber): () => void {
    this.subscribers.add(subscriber);
    subscriber(this.state);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  public setState(partial: Partial<InspectionSuiteState>): void {
    this.state = {
      ...this.state,
      ...partial,
    };
    if (partial.sunlightMode !== undefined) {
      this.applySunlightClass(partial.sunlightMode);
    }
    this.saveToStorage();
    this.notify();
  }

  public setResult(result: TestResult): void {
    this.state = {
      ...this.state,
      results: {
        ...this.state.results,
        [result.id]: result,
      },
    };
    this.saveToStorage();
    this.notify();
  }

  public getResult(testId: string): TestResult | undefined {
    return this.state.results[testId];
  }

  public getAllResults(): Record<string, TestResult> {
    return { ...this.state.results };
  }

  public clearResults(): void {
    this.state = {
      ...this.state,
      results: {},
      activeTestId: null,
      runnerState: 'IDLE',
    };
    this.saveToStorage();
    this.notify();
  }

  public setCategory(category: TestCategory | 'ALL'): void {
    this.setState({ currentCategory: category });
  }

  public setSunlightMode(enabled: boolean): void {
    this.setState({ sunlightMode: enabled });
  }

  public toggleSunlightMode(): boolean {
    const next = !this.state.sunlightMode;
    this.setSunlightMode(next);
    return next;
  }

  public resetSession(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    this.state = this.createInitialState();
    this.applySunlightClass(false);
    this.saveToStorage();
    this.notify();
  }

  /**
   * Encodes current session results and metadata into a base64 URL-safe hash string.
   */
  public exportSessionHash(): string {
    const payload = {
      sessionId: this.state.sessionId,
      startedAt: this.state.startedAt,
      results: this.state.results,
      deviceInfo: this.state.deviceInfo,
    };
    try {
      const jsonStr = JSON.stringify(payload);
      if (typeof btoa === 'function') {
        return encodeURIComponent(btoa(unescape(encodeURIComponent(jsonStr))));
      } else {
        return Buffer.from(jsonStr).toString('base64url');
      }
    } catch {
      return '';
    }
  }

  /**
   * Restores session state and results from a base64 URL hash payload.
   */
  public restoreFromHash(hashPayload: string): boolean {
    try {
      let jsonStr = '';
      const decodedPayload = decodeURIComponent(hashPayload);
      if (typeof atob === 'function') {
        jsonStr = decodeURIComponent(escape(atob(decodedPayload)));
      } else {
        jsonStr = Buffer.from(decodedPayload, 'base64').toString('utf8');
      }
      const data = JSON.parse(jsonStr);
      if (data && typeof data === 'object' && data.results) {
        this.setState({
          sessionId: data.sessionId || generateSessionId(),
          startedAt: data.startedAt || Date.now(),
          results: data.results || {},
        });
        return true;
      }
      return false;
    } catch (err) {
      console.warn('Failed to restore session from URL hash:', err);
      return false;
    }
  }
}
