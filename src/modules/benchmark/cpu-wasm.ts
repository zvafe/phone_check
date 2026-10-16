import { DiagnosticTest, TestResult } from '../../core/types';

/**
 * CPU Worker Task Script (Blob-based for zero-install, single-bundle distribution)
 */
const CPU_WORKER_CODE = `
  self.onmessage = function(e) {
    const durationMs = e.data.durationMs || 2000;
    const startTime = performance.now();
    let ops = 0;
    
    // CPU intensive mathematical stress loop: prime sieve & floating point transcendentals
    while (performance.now() - startTime < durationMs) {
      // Sieve prime numbers up to 1000
      let count = 0;
      for (let i = 2; i < 500; i++) {
        let isPrime = true;
        for (let j = 2; j * j <= i; j++) {
          if (i % j === 0) { isPrime = false; break; }
        }
        if (isPrime) count++;
      }
      
      // Floating point math stress
      let sum = 0.0;
      for (let k = 0; k < 200; k++) {
        sum += Math.sin(k) * Math.cos(k);
      }
      
      ops += 700;
    }
    
    self.postMessage({ ops, elapsed: performance.now() - startTime });
  };
`;

/**
 * Multi-Worker CPU Benchmark Test
 * Scales computation across hardware concurrency threads.
 */
export class CpuWasmBenchmarkTest implements DiagnosticTest {
  public id = 'bench-cpu-multi';
  public name = 'Multi-Core CPU Benchmark';
  public category = 'BENCHMARK' as const;
  public description = 'Multi-threaded CPU stress benchmark testing sustained compute throughput across all CPU cores';

  private resolveRun: ((res: TestResult) => void) | null = null;
  private workers: Worker[] = [];
  private containerEl: HTMLElement | null = null;
  private isAborted = false;

  public async run(
    signal?: AbortSignal,
    onProgress?: (percent: number, message?: string) => void
  ): Promise<TestResult> {
    return new Promise<TestResult>((resolve) => {
      this.resolveRun = resolve;
      this.isAborted = false;

      if (signal) {
        signal.addEventListener('abort', () => {
          this.isAborted = true;
          this.terminateWorkers();
          this.cleanup();
          resolve({
            id: this.id,
            name: this.name,
            category: this.category,
            status: 'SKIPPED',
            summary: 'CPU benchmark cancelled',
            timestamp: Date.now(),
          });
        });
      }

      const concurrency =
        typeof navigator !== 'undefined' && navigator.hardwareConcurrency
          ? Math.max(1, Math.min(16, navigator.hardwareConcurrency))
          : 4;

      onProgress?.(0, `Spawning benchmark across ${concurrency} CPU core workers...`);

      this.executeBenchmark(concurrency, onProgress);
    });
  }

  public cancel(): void {
    this.isAborted = true;
    this.terminateWorkers();
    if (this.resolveRun) {
      this.resolveRun({
        id: this.id,
        name: this.name,
        category: this.category,
        status: 'SKIPPED',
        summary: 'CPU benchmark cancelled',
        timestamp: Date.now(),
      });
      this.resolveRun = null;
    }
    this.cleanup();
  }

  private terminateWorkers(): void {
    for (const w of this.workers) {
      try {
        w.terminate();
      } catch {}
    }
    this.workers = [];
  }

  private cleanup(): void {
    this.terminateWorkers();
    if (this.containerEl) {
      this.containerEl.innerHTML = '';
      this.containerEl = null;
    }
  }

  public renderUI(container: HTMLElement): void {
    this.containerEl = container;
    const concurrency =
      typeof navigator !== 'undefined' && navigator.hardwareConcurrency
        ? navigator.hardwareConcurrency
        : 4;

    container.innerHTML = `
      <div class="p-4 bg-slate-900 rounded-xl border border-slate-800 text-white select-none space-y-4">
        <div class="flex items-center justify-between pb-2 border-b border-slate-800">
          <span class="text-xs font-bold text-sky-400">CPU MULTI-CORE BENCHMARK</span>
          <span class="text-xs font-mono text-emerald-400">${concurrency} Active Threads</span>
        </div>

        <div class="space-y-3">
          <div class="flex justify-between text-xs">
            <span class="text-slate-400">Sustained Mathematical Throughput:</span>
            <span id="cpu-throughput-val" class="font-mono font-bold text-sky-400">Measuring...</span>
          </div>

          <div class="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800">
            <div id="cpu-progress-bar" class="bg-gradient-to-r from-sky-500 to-indigo-500 h-full w-0 transition-all duration-100"></div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2 text-[11px] text-slate-400 p-2.5 bg-slate-950 rounded-lg border border-slate-800">
          <div>Architecture: <span class="text-white font-mono font-bold">${typeof navigator !== 'undefined' ? navigator.platform || 'ARM64' : 'ARM64'}</span></div>
          <div>Cores Detected: <span class="text-white font-mono font-bold">${concurrency} Cores</span></div>
        </div>
      </div>
    `;
  }

  private async executeBenchmark(
    concurrency: number,
    onProgress?: (percent: number, message?: string) => void
  ): Promise<void> {
    const durationMs = 3000;
    const startTime = Date.now();
    let canUseWorkers = typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined';

    if (canUseWorkers) {
      try {
        const blob = new Blob([CPU_WORKER_CODE], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);

        const workerPromises: Promise<number>[] = [];

        for (let i = 0; i < concurrency; i++) {
          const w = new Worker(workerUrl);
          this.workers.push(w);

          const p = new Promise<number>((res) => {
            const timeout = setTimeout(() => res(0), durationMs + 1000);
            w.onmessage = (e) => {
              clearTimeout(timeout);
              res(e.data.ops || 0);
            };
            w.onerror = () => {
              clearTimeout(timeout);
              res(0);
            };
            w.postMessage({ durationMs });
          });
          workerPromises.push(p);
        }

        const progressInterval = setInterval(() => {
          if (this.isAborted) {
            clearInterval(progressInterval);
            return;
          }
          const elapsed = Date.now() - startTime;
          const pct = Math.min(99, Math.round((elapsed / durationMs) * 100));
          onProgress?.(pct, `Running ${concurrency}-thread CPU stress (${pct}%)...`);

          const progBar = this.containerEl?.querySelector('#cpu-progress-bar') as HTMLElement | null;
          if (progBar) progBar.style.width = `${pct}%`;
        }, 100);

        const results = await Promise.all(workerPromises);
        clearInterval(progressInterval);
        URL.revokeObjectURL(workerUrl);

        if (this.isAborted) return;

        const totalOps = results.reduce((acc, v) => acc + v, 0);
        const megaOpsSec = Number(((totalOps / (durationMs / 1000)) / 1_000_000).toFixed(2));
        this.finish(concurrency, megaOpsSec);
        return;
      } catch {
        // Fallback to synchronous loop
      }
    }

    // Synchronous CPU loop fallback (for happy-dom or restricted worker contexts)
    const syncOps = this.runSyncLoop(durationMs);
    const megaOpsSec = Number(((syncOps / (durationMs / 1000)) / 1_000_000).toFixed(2));
    this.finish(concurrency, megaOpsSec);
  }

  private runSyncLoop(durationMs: number): number {
    const start = Date.now();
    let ops = 0;
    while (Date.now() - start < Math.min(250, durationMs)) {
      for (let i = 2; i < 300; i++) {
        let isPrime = true;
        for (let j = 2; j * j <= i; j++) {
          if (i % j === 0) { isPrime = false; break; }
        }
        if (isPrime) ops += 10;
      }
      ops += 500;
    }
    // Scale estimation
    return ops * 10;
  }

  private finish(cores: number, megaOpsSec: number): void {
    this.terminateWorkers();

    const progBar = this.containerEl?.querySelector('#cpu-progress-bar') as HTMLElement | null;
    const valText = this.containerEl?.querySelector('#cpu-throughput-val');
    if (progBar) progBar.style.width = '100%';
    if (valText) valText.textContent = `${megaOpsSec} M-Ops/sec`;

    // Scoring: baseline modern mobile CPU delivers ~5-15 M-Ops
    const score = Math.min(100, Math.max(30, Math.round(megaOpsSec * 8 + cores * 5)));
    const status = score >= 50 ? 'PASSED' : 'WARNING';

    if (this.resolveRun) {
      this.resolveRun({
        id: this.id,
        name: this.name,
        category: this.category,
        status,
        score,
        summary: `CPU compute performance: ${megaOpsSec} M-Ops/sec across ${cores} threads`,
        timestamp: Date.now(),
        details: {
          concurrency: cores,
          throughputMegaOpsSec: megaOpsSec,
        },
      });
      this.resolveRun = null;
    }
    this.cleanup();
  }
}
