import { DiagnosticReport, TestResult } from '../core/types';
import { triggerPrintReport } from '../modules/report/print-pdf';
import { downloadReportAsJson, shareReport } from '../modules/report/share';

export interface ReportViewOptions {
  report: DiagnosticReport;
  onClose: () => void;
}

export class ReportView {
  private report: DiagnosticReport;
  private onClose: () => void;
  private container: HTMLElement | null = null;

  constructor(options: ReportViewOptions) {
    this.report = options.report;
    this.onClose = options.onClose;
  }

  public mount(container: HTMLElement): void {
    this.container = container;
    this.render();
  }

  public unmount(): void {
    if (this.container) {
      this.container.innerHTML = '';
      this.container = null;
    }
  }

  private render(): void {
    if (!this.container) return;

    const r = this.report;
    const isCritical = r.overallVerdict === 'CRITICAL_RED_FLAG';
    const isWarning = r.overallVerdict === 'WARNING';

    const verdictBg = isCritical
      ? 'bg-red-950 border-red-500 text-red-200'
      : isWarning
      ? 'bg-amber-950 border-amber-500 text-amber-200'
      : 'bg-emerald-950 border-emerald-500 text-emerald-200';

    const gradeColor =
      r.conditionGrade === 'F'
        ? 'text-red-500 border-red-500 bg-red-950/60'
        : r.conditionGrade === 'A+' || r.conditionGrade === 'A'
        ? 'text-emerald-400 border-emerald-400 bg-emerald-950/60'
        : 'text-amber-400 border-amber-400 bg-amber-950/60';

    // Group test results by category
    const categories: Record<string, TestResult[]> = {
      HARDWARE: [],
      BENCHMARK: [],
      SECURITY: [],
      PHYSICAL: [],
    };

    for (const test of Object.values(r.testResults)) {
      const list = categories[test.category];
      if (list) {
        list.push(test);
      }
    }

    this.container.innerHTML = `
      <div id="diagnostic-report-modal" class="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-md flex flex-col p-3 sm:p-6 select-none">
        <div class="max-w-2xl w-full mx-auto bg-[#0e1424] border border-[#1f2937] rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto text-slate-100 sunlight-card">
          <!-- Report Header -->
          <div class="p-4 bg-[#111827] border-b border-[#1f2937] flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <span class="text-xl">📋</span>
              <div>
                <h2 class="text-base font-extrabold text-white">Diagnostic Verification Report</h2>
                <div class="text-[11px] text-slate-400 font-mono">Session ID: ${r.sessionId}</div>
              </div>
            </div>
            <button id="btn-close-report" class="min-h-touch min-w-touch p-2 text-slate-400 hover:text-white text-lg font-bold">
              ✕
            </button>
          </div>

          <!-- Printable & Shareable Body -->
          <div class="p-4 sm:p-6 space-y-5 overflow-y-auto max-h-[75vh]">
            <!-- Score & Verdict Banner -->
            <div class="p-4 rounded-xl border-2 ${verdictBg} flex items-center justify-between shadow-lg">
              <div class="space-y-1">
                <span class="text-[11px] uppercase tracking-wider font-black">Overall Inspection Verdict</span>
                <div class="text-xl sm:text-2xl font-black tracking-tight">
                  ${isCritical ? '🚩 CRITICAL RED FLAG' : isWarning ? '⚠️ WARNINGS DETECTED' : '✓ PASSED INSPECTION'}
                </div>
                <div class="text-xs opacity-90">${r.timestamp ? new Date(r.timestamp).toLocaleString() : ''}</div>
              </div>

              <div class="flex items-center space-x-3">
                <div class="text-right">
                  <div class="text-[10px] uppercase font-bold text-slate-400">Score</div>
                  <div class="text-2xl font-black font-mono text-white">${r.overallScore}<span class="text-xs text-slate-400">/100</span></div>
                </div>
                <div class="w-14 h-14 rounded-xl border-2 ${gradeColor} flex flex-col items-center justify-center font-black text-2xl shadow">
                  ${r.conditionGrade}
                </div>
              </div>
            </div>

            <!-- Negotiation Tips -->
            <div class="p-4 rounded-xl bg-[#111827] border border-[#1f2937] space-y-2">
              <div class="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center space-x-1.5">
                <span>💬</span>
                <span>In-Person Negotiation & Buying Tips:</span>
              </div>
              <ul class="space-y-1.5 text-xs text-slate-200">
                ${r.negotiationTips.map((tip) => `<li class="flex items-start space-x-2"><span class="shrink-0">•</span><span>${tip}</span></li>`).join('')}
              </ul>
            </div>

            <!-- Device Metadata -->
            <div class="p-3.5 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-400 grid grid-cols-2 gap-2 font-mono">
              <div>Platform: <span class="text-slate-200 font-bold">${r.deviceInfo.platform}</span></div>
              <div>Display: <span class="text-slate-200 font-bold">${r.deviceInfo.screenResolution}</span></div>
              <div>Concurrency: <span class="text-slate-200 font-bold">${r.deviceInfo.hardwareConcurrency} Cores</span></div>
              <div>Pixel Ratio: <span class="text-slate-200 font-bold">${r.deviceInfo.devicePixelRatio}x</span></div>
            </div>

            <!-- Test Breakdown by Category -->
            <div class="space-y-4">
              <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider">Detailed Findings Breakdown</h3>

              ${this.renderCategorySection('Hardware Diagnostics', categories.HARDWARE ?? [])}
              ${this.renderCategorySection('Benchmark & Performance', categories.BENCHMARK ?? [])}
              ${this.renderCategorySection('Security & Carrier Locks', categories.SECURITY ?? [])}
              ${this.renderCategorySection('Physical & Liquid Inspection', categories.PHYSICAL ?? [])}
            </div>
          </div>

          <!-- Report Action Footer -->
          <div class="p-4 bg-[#111827] border-t border-[#1f2937] flex flex-wrap gap-2 items-center justify-between">
            <div class="flex gap-2">
              <button id="btn-print-report" class="min-h-touch px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow">
                <span>🖨️</span>
                <span>Print / PDF</span>
              </button>
              <button id="btn-download-json" class="min-h-touch px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-bold flex items-center space-x-1.5">
                <span>💾</span>
                <span>JSON</span>
              </button>
              <button id="btn-share-report" class="min-h-touch px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-bold flex items-center space-x-1.5">
                <span>🔗</span>
                <span id="share-btn-text">Share Link</span>
              </button>
            </div>

            <button id="btn-close-report-bottom" class="min-h-touch px-5 py-2 bg-sky-500 hover:bg-sky-400 text-black font-extrabold text-xs rounded-lg shadow">
              Done
            </button>
          </div>
        </div>
      </div>
    `;

    this.attachEvents();
  }

  private renderCategorySection(catTitle: string, tests: TestResult[]): string {
    if (!tests || tests.length === 0) return '';

    return `
      <div class="p-3 rounded-xl bg-[#111827] border border-[#1f2937] space-y-2">
        <div class="text-xs font-bold text-sky-400 uppercase tracking-wider">${catTitle}</div>
        <div class="space-y-1.5">
          ${tests.map((t) => {
            const isWarn = t.status === 'WARNING';
            const isFail = t.status === 'FAILED';
            const isRedFlag = t.criticalRedFlag;

            const badgeColor = isRedFlag
              ? 'bg-red-900 text-red-200 border-red-500'
              : isFail
              ? 'bg-red-950 text-red-300 border-red-600'
              : isWarn
              ? 'bg-amber-950 text-amber-300 border-amber-600'
              : 'bg-emerald-950 text-emerald-300 border-emerald-600';

            return `
              <div class="p-2 bg-slate-950/70 rounded-lg border border-slate-800/80 flex items-center justify-between text-xs">
                <div class="space-y-0.5 max-w-[70%]">
                  <div class="font-bold text-white flex items-center space-x-1.5">
                    <span>${t.name}</span>
                    ${isRedFlag ? '<span class="text-[9px] px-1 py-0.2 bg-red-600 text-white rounded font-black">RED FLAG</span>' : ''}
                  </div>
                  <div class="text-[11px] text-slate-400 truncate">${t.summary}</div>
                </div>
                <div class="flex items-center space-x-2">
                  ${t.score !== undefined ? `<span class="font-mono text-sky-400 font-bold">${t.score} pts</span>` : ''}
                  <span class="px-2 py-0.5 text-[10px] font-extrabold uppercase rounded border ${badgeColor}">
                    ${t.status}
                  </span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  private attachEvents(): void {
    if (!this.container) return;

    this.container.querySelector('#btn-close-report')?.addEventListener('click', () => {
      this.onClose();
    });
    this.container.querySelector('#btn-close-report-bottom')?.addEventListener('click', () => {
      this.onClose();
    });

    this.container.querySelector('#btn-print-report')?.addEventListener('click', () => {
      triggerPrintReport(this.report);
    });

    this.container.querySelector('#btn-download-json')?.addEventListener('click', () => {
      downloadReportAsJson(this.report);
    });

    const shareBtn = this.container.querySelector('#btn-share-report');
    const shareText = this.container.querySelector('#share-btn-text');
    shareBtn?.addEventListener('click', async () => {
      const res = await shareReport(this.report);
      if (res.method === 'clipboard' && shareText) {
        shareText.textContent = 'Copied!';
        setTimeout(() => {
          if (shareText) shareText.textContent = 'Share Link';
        }, 2000);
      }
    });
  }
}
