import { DiagnosticReport } from '../../core/types';

/**
 * Downloads diagnostic report as structured JSON file
 */
export function downloadReportAsJson(report: DiagnosticReport): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const jsonStr = JSON.stringify(report, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `phone-inspector-report-${report.sessionId}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Encodes report payload into URL hash string
 */
export function exportReportHash(report: DiagnosticReport): string {
  try {
    const payload = {
      sessionId: report.sessionId,
      overallVerdict: report.overallVerdict,
      overallScore: report.overallScore,
      conditionGrade: report.conditionGrade,
      timestamp: report.timestamp,
      results: report.testResults,
      deviceInfo: report.deviceInfo,
    };
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
 * Shares report via Web Share API or falls back to copying URL-hash link to clipboard
 */
export async function shareReport(report: DiagnosticReport): Promise<{ success: boolean; method: 'web-share' | 'clipboard' | 'none' }> {
  const hash = exportReportHash(report);
  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}#session=${hash}`
    : `#session=${hash}`;

  const shareData = {
    title: `Phone Inspector Report - Grade ${report.conditionGrade} (${report.overallScore}/100)`,
    text: `Diagnostic inspection verdict: ${report.overallVerdict}. Tested via Phone Inspector.`,
    url: shareUrl,
  };

  // 1. Try native Web Share API
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share(shareData);
      return { success: true, method: 'web-share' };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { success: false, method: 'web-share' };
      }
      // Otherwise fall through to clipboard
    }
  }

  // 2. Fall back to copying URL to clipboard
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(shareUrl);
      return { success: true, method: 'clipboard' };
    } catch {}
  }

  return { success: false, method: 'none' };
}
