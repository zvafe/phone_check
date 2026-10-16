import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DiagnosticStore, STORAGE_KEY, SESSION_TTL_MS, detectDeviceInfo } from '../../src/core/store';
import { TestResult } from '../../src/core/types';

describe('DiagnosticStore & Persistence', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.className = '';
    }
  });

  it('initializes with default state and detects device hardware info', () => {
    const store = new DiagnosticStore();
    const state = store.getState();

    expect(state.sessionId).toBeDefined();
    expect(state.sessionId.startsWith('insp_')).toBe(true);
    expect(state.currentCategory).toBe('ALL');
    expect(state.runnerState).toBe('IDLE');
    expect(state.activeTestId).toBeNull();
    expect(state.sunlightMode).toBe(false);
    expect(state.deviceInfo).toBeDefined();
    expect(state.deviceInfo.screenResolution).toBeDefined();
  });

  it('notifies subscribers on state updates and respects unsubscribe', () => {
    const store = new DiagnosticStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    // Initial call on subscribe
    expect(listener).toHaveBeenCalledTimes(1);

    store.setCategory('HARDWARE');
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.getState().currentCategory).toBe('HARDWARE');

    unsubscribe();
    store.setCategory('BENCHMARK');
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.getState().currentCategory).toBe('BENCHMARK');
  });

  it('stores, retrieves, and clears test results', () => {
    const store = new DiagnosticStore();
    const mockResult: TestResult = {
      id: 'touch_screen',
      name: 'Touch Screen Test',
      category: 'HARDWARE',
      status: 'PASSED',
      score: 98,
      summary: 'Touch matrix fully responsive',
      timestamp: Date.now(),
      criticalRedFlag: false,
    };

    store.setResult(mockResult);
    expect(store.getResult('touch_screen')).toEqual(mockResult);
    expect(store.getAllResults()['touch_screen']).toEqual(mockResult);

    store.clearResults();
    expect(store.getResult('touch_screen')).toBeUndefined();
    expect(Object.keys(store.getAllResults())).toHaveLength(0);
  });

  it('toggles sunlight mode and updates document class', () => {
    const store = new DiagnosticStore();
    expect(store.getState().sunlightMode).toBe(false);

    const toggled = store.toggleSunlightMode();
    expect(toggled).toBe(true);
    expect(store.getState().sunlightMode).toBe(true);
    if (typeof document !== 'undefined' && document.documentElement) {
      expect(document.documentElement.classList.contains('sunlight-mode')).toBe(true);
    }

    store.setSunlightMode(false);
    expect(store.getState().sunlightMode).toBe(false);
    if (typeof document !== 'undefined' && document.documentElement) {
      expect(document.documentElement.classList.contains('sunlight-mode')).toBe(false);
    }
  });

  it('persists session state to localStorage and restores on new instance', () => {
    const store1 = new DiagnosticStore();
    store1.setCategory('SECURITY');
    store1.setResult({
      id: 'imei_luhn',
      name: 'IMEI Check',
      category: 'SECURITY',
      status: 'PASSED',
      summary: 'Valid Luhn Checksum',
      timestamp: Date.now(),
    });

    // Create new store instance; should load persisted state from localStorage
    const store2 = new DiagnosticStore();
    expect(store2.getState().currentCategory).toBe('SECURITY');
    expect(store2.getResult('imei_luhn')?.status).toBe('PASSED');
  });

  it('discards expired sessions older than 24 hours from localStorage', () => {
    const expiredStartedAt = Date.now() - (SESSION_TTL_MS + 60000); // 24h + 1m ago
    const expiredState = {
      sessionId: 'insp_expired_123',
      startedAt: expiredStartedAt,
      currentCategory: 'BENCHMARK',
      activeTestId: null,
      runnerState: 'IDLE',
      results: {
        old_test: {
          id: 'old_test',
          name: 'Old Test',
          category: 'BENCHMARK',
          status: 'PASSED',
          summary: 'Expired',
          timestamp: expiredStartedAt,
        },
      },
      sunlightMode: false,
      deviceInfo: detectDeviceInfo(),
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(expiredState));

    const store = new DiagnosticStore();
    expect(store.getState().sessionId).not.toBe('insp_expired_123');
    expect(store.getResult('old_test')).toBeUndefined();
    const stored = window.localStorage.getItem(STORAGE_KEY);
    expect(stored).not.toBeNull();
    expect(stored).not.toContain('insp_expired_123');
  });

  it('exports session state to hash and restores correctly', () => {
    const store = new DiagnosticStore();
    store.setResult({
      id: 'battery_thermal',
      name: 'Thermal Test',
      category: 'BENCHMARK',
      status: 'WARNING',
      summary: '18% throttling detected',
      timestamp: Date.now(),
    });

    const hash = store.exportSessionHash();
    expect(hash).toBeDefined();
    expect(hash.length).toBeGreaterThan(10);

    const freshStore = new DiagnosticStore();
    freshStore.clearResults();
    expect(freshStore.getResult('battery_thermal')).toBeUndefined();

    const success = freshStore.restoreFromHash(hash);
    expect(success).toBe(true);
    expect(freshStore.getResult('battery_thermal')?.status).toBe('WARNING');
    expect(freshStore.getResult('battery_thermal')?.summary).toBe('18% throttling detected');
  });

  it('handles invalid hash gracefully without crashing', () => {
    const store = new DiagnosticStore();
    const result = store.restoreFromHash('corrupted-invalid-base64');
    expect(result).toBe(false);
  });
});
