import { DiagnosticRunner } from '../core/runner';
import { DiagnosticStore } from '../core/store';
import { TestCategory, TestResult, InspectionSuiteState, DiagnosticTest } from '../core/types';
import { buildDiagnosticReport } from '../modules/report';
import { ReportView } from './ReportView';

export interface ShellOptions {
  runner: DiagnosticRunner;
  store: DiagnosticStore;
}

export class Shell {
  private runner: DiagnosticRunner;
  private store: DiagnosticStore;
  private container: HTMLElement | null = null;
  private unsubscribeStore: (() => void) | null = null;
  private activeInteractiveTest: DiagnosticTest | null = null;
  private isShowingReport = false;
  private reportView: ReportView | null = null;

  constructor(options: ShellOptions) {
    this.runner = options.runner;
    this.store = options.store;
  }

  public mount(container: HTMLElement): void {
    this.container = container;
    this.unsubscribeStore = this.store.subscribe((state) => {
      this.render(state);
    });
  }

  public unmount(): void {
    if (this.activeInteractiveTest) {
      this.closeInteractiveTestModal();
      this.runner.cancel();
    }
    if (this.reportView) {
      this.reportView.unmount();
      this.reportView = null;
    }
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = null;
    }
    if (this.container) {
      this.container.innerHTML = '';
      this.container = null;
    }
  }

  private ensureSkeleton(): void {
    if (!this.container) return;
    if (this.container.querySelector('#shell-root')) return;

    this.container.innerHTML = `
      <div id="shell-root" class="flex flex-col min-h-screen bg-[#090d16] text-slate-100 font-sans pb-safe transition-colors">
        <header id="shell-header" class="pt-safe pl-safe pr-safe px-4 py-3 bg-[#111827] border-b border-[#1f2937] flex items-center justify-between sticky top-0 z-30 shadow-md"></header>
        <nav id="shell-nav" class="bg-[#0e1424] border-b border-[#1f2937] px-2 py-1 flex overflow-x-auto no-scrollbar space-x-1.5 z-20" aria-label="Diagnostic Categories"></nav>
        <main id="shell-main" class="flex-1 px-4 py-4 max-w-2xl w-full mx-auto space-y-4"></main>
        <footer id="shell-footer" class="mt-auto px-4 py-2.5 bg-[#111827] border-t border-[#1f2937] flex items-center justify-between text-xs sticky bottom-0 z-30"></footer>
        <div id="interactive-modal-host"></div>
        <div id="report-modal-host"></div>
      </div>
    `;
  }

  private render(state: InspectionSuiteState): void {
    if (!this.container) return;
    this.ensureSkeleton();

    const allTests = this.runner.getAllTests();
    const filteredTests = state.currentCategory === 'ALL'
      ? allTests
      : allTests.filter((t) => t.category === state.currentCategory);

    const results = state.results;
    const passedCount = Object.values(results).filter((r) => r.status === 'PASSED').length;
    const warnCount = Object.values(results).filter((r) => r.status === 'WARNING').length;
    const failCount = Object.values(results).filter((r) => r.status === 'FAILED').length;
    const criticalCount = Object.values(results).filter((r) => r.criticalRedFlag).length;

    const isRunning = state.runnerState === 'RUNNING';

    // 1. Update Header
    const headerEl = this.container.querySelector('#shell-header');
    if (headerEl) {
      headerEl.innerHTML = `
        <div class="flex items-center space-x-2">
          <div class="w-8 h-8 rounded-lg bg-sky-500 flex items-center justify-center font-black text-black text-base shadow">
            PI
          </div>
          <div>
            <h1 class="text-sm font-bold tracking-tight text-white leading-none">Phone Inspector</h1>
            <p class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Street Diagnostic Suite</p>
          </div>
        </div>

        <div class="flex items-center space-x-2">
          <!-- Sunlight Mode Toggle Button -->
          <button
            id="sunlight-toggle-btn"
            type="button"
            class="min-h-touch min-w-touch px-3 py-1.5 text-xs font-bold rounded-lg border transition-all flex items-center justify-center ${
              state.sunlightMode
                ? 'bg-amber-400 text-black border-white shadow-lg'
                : 'bg-slate-800 text-amber-300 border-slate-700 hover:bg-slate-700'
            }"
            aria-label="Toggle Sunlight High Contrast Mode"
            aria-pressed="${state.sunlightMode}"
          >
            ☀️ ${state.sunlightMode ? 'SUNLIGHT ON' : 'SUNLIGHT'}
          </button>

          <!-- Report View Button -->
          <button
            id="btn-open-report"
            type="button"
            class="min-h-touch min-w-touch px-3 py-1.5 text-xs font-bold rounded-lg border bg-slate-800 text-sky-400 border-slate-700 hover:bg-slate-700 transition-all flex items-center justify-center space-x-1"
            aria-label="View Diagnostic Report"
          >
            <span>📋</span>
            <span>REPORT</span>
          </button>
        </div>
      `;
    }

    // 2. Update Nav Tabs
    const navEl = this.container.querySelector('#shell-nav');
    if (navEl) {
      navEl.innerHTML = `
        ${this.renderCategoryTab('ALL', 'All Tests', state.currentCategory)}
        ${this.renderCategoryTab('HARDWARE', 'Hardware', state.currentCategory)}
        ${this.renderCategoryTab('BENCHMARK', 'Benchmark', state.currentCategory)}
        ${this.renderCategoryTab('SECURITY', 'Security & Locks', state.currentCategory)}
        ${this.renderCategoryTab('PHYSICAL', 'Physical', state.currentCategory)}
      `;
    }

    // 3. Update Main
    const mainEl = this.container.querySelector('#shell-main');
    if (mainEl) {
      mainEl.innerHTML = `
        <!-- Active Execution Banner or Global Controls -->
        <div class="p-3 rounded-xl bg-[#111827] border border-[#1f2937] sunlight-card flex items-center justify-between shadow-sm">
          <div>
            <div class="text-xs font-semibold text-slate-400">Suite Controller</div>
            <div class="text-sm font-bold ${isRunning ? 'text-amber-400 animate-pulse' : 'text-slate-200'}">
              ${isRunning ? '⏳ Running Diagnostics...' : 'Ready for Inspection'}
            </div>
          </div>
          <div class="flex space-x-2">
            ${
              isRunning
                ? `<button id="btn-cancel-suite" class="min-h-touch px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg shadow">Cancel</button>`
                : `<button id="btn-run-all" class="min-h-touch px-4 py-2 bg-sky-500 hover:bg-sky-400 text-black font-extrabold text-xs rounded-lg shadow">Run ${state.currentCategory === 'ALL' ? 'All' : state.currentCategory}</button>`
            }
            <button id="btn-reset-session" class="min-h-touch min-w-touch px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-lg border border-slate-700 flex items-center justify-center" title="Reset Session">
              ↺
            </button>
          </div>
        </div>

        <!-- Active Test Highlight (If Any) -->
        ${
          state.activeTestId
            ? `
          <div class="p-4 rounded-xl bg-amber-950/40 border-2 border-amber-500 text-amber-200 flex items-center justify-between">
            <div>
              <div class="text-xs uppercase tracking-wider font-extrabold text-amber-400">Executing Test</div>
              <div class="text-base font-bold">${state.activeTestId}</div>
            </div>
            <div class="animate-spin text-xl">⚙️</div>
          </div>
        `
            : ''
        }

        <!-- Diagnostic Tests List -->
        <section class="space-y-3" aria-label="Tests List">
          ${
            filteredTests.length === 0
              ? `<div class="p-6 text-center text-sm text-slate-400 bg-[#111827] rounded-xl border border-[#1f2937]">No diagnostic tests registered in this category yet.</div>`
              : filteredTests.map((t) => this.renderTestCard(t.id, t.name, t.category, t.description, results[t.id], isRunning)).join('')
          }
        </section>
      `;
    }

    // 4. Update Footer
    const footerEl = this.container.querySelector('#shell-footer');
    if (footerEl) {
      footerEl.innerHTML = `
        <div class="flex items-center space-x-3 cursor-pointer" id="footer-status-badge">
          <span class="inline-flex items-center font-semibold text-emerald-400">
            <span class="w-2 h-2 rounded-full bg-emerald-400 mr-1.5"></span>
            ${passedCount} Pass
          </span>
          ${warnCount > 0 ? `<span class="inline-flex items-center font-semibold text-amber-400"><span class="w-2 h-2 rounded-full bg-amber-400 mr-1.5"></span>${warnCount} Warn</span>` : ''}
          ${failCount > 0 ? `<span class="inline-flex items-center font-semibold text-red-400"><span class="w-2 h-2 rounded-full bg-red-400 mr-1.5"></span>${failCount} Fail</span>` : ''}
          ${criticalCount > 0 ? `<span class="inline-flex items-center font-bold px-1.5 py-0.5 rounded bg-red-900 text-red-200">🚩 ${criticalCount} Red Flag</span>` : ''}
        </div>

        <div class="text-[11px] text-slate-400 font-mono">
          ${state.deviceInfo.platform} (${state.deviceInfo.screenResolution})
        </div>
      `;
    }

    this.attachEventListeners(state);

    // If report was open and reportView not yet mounted, open it
    if (this.isShowingReport && !this.reportView) {
      this.openReportModal(state);
    }
  }

  private renderCategoryTab(cat: TestCategory | 'ALL', label: string, activeCat: TestCategory | 'ALL'): string {
    const isActive = cat === activeCat;
    return `
      <button
        data-cat="${cat}"
        type="button"
        class="min-h-touch px-3.5 py-2 text-xs font-bold rounded-lg whitespace-nowrap transition-all border ${
          isActive
            ? 'bg-sky-500 text-black border-sky-400 shadow'
            : 'bg-transparent text-slate-300 border-transparent hover:bg-slate-800'
        }"
      >
        ${label}
      </button>
    `;
  }

  private renderTestCard(
    id: string,
    name: string,
    category: TestCategory,
    description: string,
    result: TestResult | undefined,
    isSuiteRunning: boolean
  ): string {
    const status = result?.status ?? 'IDLE';
    let badgeClass = 'bg-slate-800 text-slate-300 border-slate-700';
    let statusText = 'IDLE';

    switch (status) {
      case 'PASSED':
        badgeClass = 'bg-emerald-950 text-emerald-300 border-emerald-500';
        statusText = 'PASSED';
        break;
      case 'WARNING':
        badgeClass = 'bg-amber-950 text-amber-300 border-amber-500';
        statusText = 'WARNING';
        break;
      case 'FAILED':
        badgeClass = 'bg-red-950 text-red-300 border-red-500';
        statusText = 'FAILED';
        break;
      case 'SKIPPED':
        badgeClass = 'bg-slate-800 text-slate-400 border-slate-600';
        statusText = 'SKIPPED';
        break;
      case 'RUNNING':
        badgeClass = 'bg-sky-950 text-sky-300 border-sky-400 animate-pulse';
        statusText = 'RUNNING';
        break;
    }

    return `
      <div class="p-4 rounded-xl bg-[#111827] border border-[#1f2937] sunlight-card transition-all" data-testid="test-card-${id}">
        <div class="flex items-start justify-between">
          <div class="space-y-1">
            <div class="flex items-center space-x-2 flex-wrap">
              <span class="text-sm font-bold text-white">${name}</span>
              <span class="px-1.5 py-0.5 text-[9px] font-semibold uppercase rounded bg-slate-800 text-slate-400 border border-slate-700">${category}</span>
              <span class="px-2 py-0.5 text-[10px] font-extrabold uppercase rounded-full border ${badgeClass}">
                ${statusText}
              </span>
              ${result?.criticalRedFlag ? `<span class="px-2 py-0.5 text-[10px] font-black bg-red-600 text-white rounded-full">RED FLAG</span>` : ''}
            </div>
            <p class="text-xs text-slate-400">${description}</p>
          </div>

          <button
            data-run-test="${id}"
            type="button"
            ${isSuiteRunning ? 'disabled' : ''}
            class="min-h-touch min-w-touch px-3 py-1.5 ml-2 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center shrink-0"
          >
            ▶ Run
          </button>
        </div>

        ${
          result
            ? `
          <div class="mt-3 pt-2 border-t border-slate-800/80 text-xs flex items-center justify-between text-slate-300">
            <span class="truncate max-w-[80%]">${result.summary}</span>
            ${result.score !== undefined ? `<span class="font-mono font-bold text-sky-400">${result.score} pts</span>` : ''}
          </div>
        `
            : ''
        }
      </div>
    `;
  }

  private attachEventListeners(state: InspectionSuiteState): void {
    if (!this.container) return;

    // Sunlight Mode Toggle
    const sunlightBtn = this.container.querySelector('#sunlight-toggle-btn');
    if (sunlightBtn) {
      sunlightBtn.addEventListener('click', () => {
        this.store.toggleSunlightMode();
      });
    }

    // Open Report Modal
    const reportBtn = this.container.querySelector('#btn-open-report');
    if (reportBtn) {
      reportBtn.addEventListener('click', () => {
        this.openReportModal(this.store.getState());
      });
    }

    const footerBadge = this.container.querySelector('#footer-status-badge');
    if (footerBadge) {
      footerBadge.addEventListener('click', () => {
        this.openReportModal(this.store.getState());
      });
    }

    // Category Tabs
    const catButtons = this.container.querySelectorAll('[data-cat]');
    catButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const cat = (e.currentTarget as HTMLElement).dataset.cat as TestCategory | 'ALL';
        if (cat) {
          this.store.setCategory(cat);
        }
      });
    });

    // Run All / Category Suite
    const runAllBtn = this.container.querySelector('#btn-run-all');
    if (runAllBtn) {
      runAllBtn.addEventListener('click', () => {
        const cat = state.currentCategory === 'ALL' ? undefined : state.currentCategory;
        this.runner.runAll(cat).catch((err) => {
          console.error('Error executing test suite:', err);
        });
      });
    }

    // Cancel Execution
    const cancelBtn = this.container.querySelector('#btn-cancel-suite');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        this.closeInteractiveTestModal();
        this.runner.cancel();
      });
    }

    // Reset Session
    const resetBtn = this.container.querySelector('#btn-reset-session');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (confirm('Reset diagnostic session and clear all test results?')) {
          this.store.resetSession();
        }
      });
    }

    // Individual Test Run
    const runTestButtons = this.container.querySelectorAll('[data-run-test]');
    runTestButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const testId = (e.currentTarget as HTMLElement).dataset.runTest;
        if (testId) {
          const test = this.runner.getTest(testId);
          if (test && test.renderUI) {
            this.openInteractiveTestModal(test);
          } else {
            this.runner.runSingle(testId).catch((err) => {
              console.error(`Error running test ${testId}:`, err);
            });
          }
        }
      });
    });
  }

  private openInteractiveTestModal(test: DiagnosticTest): void {
    if (!this.container) return;
    const host = this.container.querySelector('#interactive-modal-host') as HTMLElement | null;
    if (!host) return;

    this.activeInteractiveTest = test;

    host.innerHTML = `
      <div id="interactive-test-overlay" class="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col p-2 sm:p-4 select-none">
        <div class="max-w-xl w-full mx-auto bg-[#0e1424] border border-[#1f2937] rounded-2xl shadow-2xl overflow-hidden flex flex-col flex-1 sunlight-card">
          <!-- Modal Header -->
          <div class="p-3 bg-[#111827] border-b border-[#1f2937] flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <span class="text-sm font-bold text-white">${test.name}</span>
              <span class="px-1.5 py-0.5 text-[9px] font-semibold uppercase rounded bg-slate-800 text-sky-400 border border-slate-700">${test.category}</span>
            </div>
            <button id="btn-close-test-modal" class="min-h-touch min-w-touch px-3 py-1 text-slate-400 hover:text-white text-base font-bold">
              ✕ Close
            </button>
          </div>

          <!-- Test Content Container -->
          <div id="interactive-test-body" class="flex-1 overflow-y-auto p-2"></div>
        </div>
      </div>
    `;

    const bodyEl = host.querySelector('#interactive-test-body') as HTMLElement | null;
    const closeBtn = host.querySelector('#btn-close-test-modal');

    closeBtn?.addEventListener('click', () => {
      this.closeInteractiveTestModal();
      this.runner.cancel();
    });

    if (bodyEl && test.renderUI) {
      test.renderUI(bodyEl);
    }

    // Run test through runner so progress & store result are updated
    this.runner.runSingle(test.id).finally(() => {
      this.closeInteractiveTestModal();
    });
  }

  private closeInteractiveTestModal(): void {
    if (!this.container) return;
    const host = this.container.querySelector('#interactive-modal-host') as HTMLElement | null;
    if (host) host.innerHTML = '';
    this.activeInteractiveTest = null;
  }

  private openReportModal(state: InspectionSuiteState): void {
    if (!this.container) return;
    const host = this.container.querySelector('#report-modal-host') as HTMLElement | null;
    if (!host) return;

    this.isShowingReport = true;
    const report = buildDiagnosticReport(state.sessionId, state.deviceInfo, state.results);

    this.reportView = new ReportView({
      report,
      onClose: () => {
        this.isShowingReport = false;
        if (this.reportView) {
          this.reportView.unmount();
          this.reportView = null;
        }
        if (host) host.innerHTML = '';
      },
    });

    this.reportView.mount(host);
  }
}
