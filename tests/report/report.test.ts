import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildDiagnosticReport } from '../../src/modules/report';
import { triggerPrintReport } from '../../src/modules/report/print-pdf';
import { downloadReportAsJson, exportReportHash, shareReport } from '../../src/modules/report/share';
import { ReportView } from '../../src/ui/ReportView';
import { TestResult, DeviceHardwareInfo } from '../../src/core/types';

describe('Report & Export Module Suite', () => {
  let container: HTMLElement;
  const mockDeviceInfo: DeviceHardwareInfo = {
    userAgent: 'TestBrowser/1.0',
    screenResolution: '1080x2400',
    devicePixelRatio: 2.5,
    hardwareConcurrency: 8,
    platform: 'Android',
    maxTouchPoints: 5,
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe('buildDiagnosticReport', () => {
    it('produces grade A+ and PASS verdict when all tests pass', () => {
      const results: Record<string, TestResult> = {
        'hw-touch-grid': {
          id: 'hw-touch-grid',
          name: 'Touch Grid',
          category: 'HARDWARE',
          status: 'PASSED',
          score: 100,
          summary: 'Touch OK',
          timestamp: Date.now(),
        },
        'sec-imei-blacklist': {
          id: 'sec-imei-blacklist',
          name: 'IMEI Check',
          category: 'SECURITY',
          status: 'PASSED',
          score: 100,
          summary: 'Clean IMEI',
          timestamp: Date.now(),
        },
      };

      const report = buildDiagnosticReport('test_session_1', mockDeviceInfo, results);
      expect(report.overallVerdict).toBe('PASS');
      expect(report.conditionGrade).toBe('A+');
      expect(report.overallScore).toBe(100);
      expect(report.negotiationTips[0]).toContain('Device passed all diagnostic inspections');
    });

    it('produces WARNING verdict and tailored negotiation tips on detected non-critical defects', () => {
      const results: Record<string, TestResult> = {
        'phys-hardware-inspection': {
          id: 'phys-hardware-inspection',
          name: 'Physical Inspection',
          category: 'PHYSICAL',
          status: 'WARNING',
          score: 65,
          summary: 'Non-OEM display detected',
          timestamp: Date.now(),
        },
        'bench-thermal-throttle': {
          id: 'bench-thermal-throttle',
          name: 'Thermal Throttling',
          category: 'BENCHMARK',
          status: 'WARNING',
          score: 60,
          summary: 'Thermal throttling >18% drop',
          timestamp: Date.now(),
        },
      };

      const report = buildDiagnosticReport('test_session_2', mockDeviceInfo, results);
      expect(report.overallVerdict).toBe('WARNING');
      expect(['A', 'B', 'C']).toContain(report.conditionGrade);
      expect(report.overallScore).toBeLessThan(100);
      expect(report.negotiationTips.some((t) => t.includes('non-OEM screen'))).toBe(true);
      expect(report.negotiationTips.some((t) => t.includes('Thermal throttling'))).toBe(true);
    });

    it('produces CRITICAL_RED_FLAG and grade F when critical security flags or liquid damage are present', () => {
      const results: Record<string, TestResult> = {
        'sec-financing-knox': {
          id: 'sec-financing-knox',
          name: 'Knox Guard / Financing',
          category: 'SECURITY',
          status: 'FAILED',
          criticalRedFlag: true,
          score: 0,
          summary: 'Tripped Knox 0x1',
          timestamp: Date.now(),
        },
      };

      const report = buildDiagnosticReport('test_session_3', mockDeviceInfo, results);
      expect(report.overallVerdict).toBe('CRITICAL_RED_FLAG');
      expect(report.conditionGrade).toBe('F');
      expect(report.negotiationTips.some((t) => t.includes('DO NOT PURCHASE'))).toBe(true);
    });
  });

  describe('Report Exporting: JSON, Hash & Print', () => {
    it('encodes report payload into URL-safe hash', () => {
      const report = buildDiagnosticReport('session_abc', mockDeviceInfo, {});
      const hash = exportReportHash(report);
      expect(hash.length).toBeGreaterThan(10);
      expect(typeof hash).toBe('string');
    });

    it('triggers document download on JSON export', () => {
      const report = buildDiagnosticReport('session_json', mockDeviceInfo, {});
      const appendSpy = vi.spyOn(document.body, 'appendChild');
      const removeSpy = vi.spyOn(document.body, 'removeChild');

      downloadReportAsJson(report);

      expect(appendSpy).toHaveBeenCalled();
      expect(removeSpy).toHaveBeenCalled();
    });

    it('triggers window.print() on triggerPrintReport', () => {
      const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
      triggerPrintReport();
      expect(printSpy).toHaveBeenCalled();
    });

    it('shares report via Web Share API when supported', async () => {
      const shareMock = vi.fn().mockResolvedValue(undefined);
      (navigator as any).share = shareMock;

      const report = buildDiagnosticReport('session_share', mockDeviceInfo, {});
      const result = await shareReport(report);

      expect(result.success).toBe(true);
      expect(result.method).toBe('web-share');
      expect(shareMock).toHaveBeenCalled();
    });

    it('falls back to clipboard copy when Web Share API is unavailable', async () => {
      delete (navigator as any).share;
      const copyMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: copyMock },
        configurable: true,
      });

      const report = buildDiagnosticReport('session_clip', mockDeviceInfo, {});
      const result = await shareReport(report);

      expect(result.success).toBe(true);
      expect(result.method).toBe('clipboard');
      expect(copyMock).toHaveBeenCalled();
    });
  });

  describe('ReportView UI Component', () => {
    it('renders report modal with verdict, score, grade, and action buttons', () => {
      const report = buildDiagnosticReport('session_ui', mockDeviceInfo, {
        'hw-touch-grid': {
          id: 'hw-touch-grid',
          name: 'Touch Grid',
          category: 'HARDWARE',
          status: 'PASSED',
          score: 100,
          summary: 'Clean',
          timestamp: Date.now(),
        },
      });

      const onClose = vi.fn();
      const reportView = new ReportView({ report, onClose });
      reportView.mount(container);

      expect(container.querySelector('#diagnostic-report-modal')).not.toBeNull();
      expect(container.textContent).toContain('Diagnostic Verification Report');
      expect(container.textContent).toContain('PASSED INSPECTION');
      expect(container.textContent).toContain('100/100');
      expect(container.textContent).toContain('A+');
      expect(container.querySelector('#btn-print-report')).not.toBeNull();
      expect(container.querySelector('#btn-download-json')).not.toBeNull();
      expect(container.querySelector('#btn-share-report')).not.toBeNull();

      const closeBtn = container.querySelector('#btn-close-report') as HTMLButtonElement;
      closeBtn.click();
      expect(onClose).toHaveBeenCalled();

      reportView.unmount();
      expect(container.innerHTML).toBe('');
    });
  });
});
