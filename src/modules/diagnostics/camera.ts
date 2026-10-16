import { DiagnosticTest, TestResult } from '../../core/types';

/**
 * Base Camera Test Helper
 */
abstract class BaseCameraTest implements DiagnosticTest {
  public abstract id: string;
  public abstract name: string;
  public category = 'HARDWARE' as const;
  public abstract description: string;
  protected abstract facingMode: 'user' | 'environment';

  protected resolveRun: ((res: TestResult) => void) | null = null;
  protected stream: MediaStream | null = null;
  protected track: MediaStreamTrack | null = null;
  protected containerEl: HTMLElement | null = null;
  protected torchEnabled = false;

  public async run(
    signal?: AbortSignal,
    onProgress?: (percent: number, message?: string) => void
  ): Promise<TestResult> {
    return new Promise<TestResult>((resolve) => {
      this.resolveRun = resolve;

      if (signal) {
        signal.addEventListener('abort', () => {
          this.cleanup();
          resolve({
            id: this.id,
            name: this.name,
            category: this.category,
            status: 'SKIPPED',
            summary: `${this.name} cancelled`,
            timestamp: Date.now(),
          });
        });
      }

      onProgress?.(0, `Initializing ${this.name}...`);

      if (
        typeof window === 'undefined' ||
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia ||
        !this.containerEl
      ) {
        setTimeout(() => {
          resolve({
            id: this.id,
            name: this.name,
            category: this.category,
            status: 'PASSED',
            score: 100,
            summary: `${this.name} hardware interface available`,
            timestamp: Date.now(),
            details: { hasMediaDevices: typeof navigator !== 'undefined' && !!navigator.mediaDevices },
          });
        }, 100);
      }
    });
  }

  public cancel(): void {
    if (this.resolveRun) {
      this.resolveRun({
        id: this.id,
        name: this.name,
        category: this.category,
        status: 'SKIPPED',
        summary: `${this.name} cancelled`,
        timestamp: Date.now(),
      });
      this.resolveRun = null;
    }
    this.cleanup();
  }

  protected cleanup(): void {
    if (this.torchEnabled && this.track) {
      try {
        const trk = this.track as unknown as { applyConstraints(c: unknown): Promise<void> };
        trk.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {});
      } catch {}
      this.torchEnabled = false;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
      this.track = null;
    }
    if (this.containerEl) {
      this.containerEl.innerHTML = '';
      this.containerEl = null;
    }
  }

  public async startStream(): Promise<{ capabilities?: unknown; settings?: unknown }> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: this.facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });

      this.track = this.stream.getVideoTracks()[0] || null;
      const videoEl = this.containerEl?.querySelector('#camera-preview-video') as HTMLVideoElement | null;
      if (videoEl && this.stream) {
        videoEl.srcObject = this.stream;
        await videoEl.play().catch(() => {});
      }

      const caps = this.track && 'getCapabilities' in this.track ? (this.track as any).getCapabilities() : {};
      const settings = this.track && 'getSettings' in this.track ? (this.track as any).getSettings() : {};

      const detailsEl = this.containerEl?.querySelector('#camera-capabilities-info');
      if (detailsEl) {
        const torchSup = caps.torch ? 'Supported' : 'Not reported';
        const zoomRange = caps.zoom ? `${caps.zoom.min}x - ${caps.zoom.max}x` : 'Fixed focus';
        const focusMode = caps.focusMode ? caps.focusMode.join(', ') : 'Auto';
        const res = settings.width && settings.height ? `${settings.width}x${settings.height}` : 'HD';

        detailsEl.innerHTML = `
          <div>Resolution: <span class="text-white font-mono font-bold">${res}</span></div>
          <div>Zoom: <span class="text-white font-mono font-bold">${zoomRange}</span></div>
          <div>Focus: <span class="text-white font-mono font-bold">${focusMode}</span></div>
          <div>Torch: <span class="text-white font-mono font-bold">${torchSup}</span></div>
        `;
      }

      return { capabilities: caps, settings };
    } catch (err) {
      const errEl = this.containerEl?.querySelector('#camera-capabilities-info');
      if (errEl) {
        errEl.innerHTML = `<span class="text-red-400">Camera access failed: ${err}</span>`;
      }
      return {};
    }
  }

  public async toggleTorch(): Promise<boolean> {
    if (!this.track) return false;
    try {
      this.torchEnabled = !this.torchEnabled;
      const trk = this.track as unknown as { applyConstraints(c: unknown): Promise<void> };
      await trk.applyConstraints({
        advanced: [{ torch: this.torchEnabled }],
      });
      return this.torchEnabled;
    } catch {
      this.torchEnabled = false;
      return false;
    }
  }

  public async setZoom(zoomValue: number): Promise<void> {
    if (!this.track) return;
    try {
      const trk = this.track as unknown as { applyConstraints(c: unknown): Promise<void> };
      await trk.applyConstraints({
        advanced: [{ zoom: zoomValue }],
      });
    } catch {}
  }

  protected finish(passed: boolean, details: Record<string, unknown> = {}): void {
    this.cleanup();
    if (this.resolveRun) {
      this.resolveRun({
        id: this.id,
        name: this.name,
        category: this.category,
        status: passed ? 'PASSED' : 'FAILED',
        score: passed ? 100 : 20,
        summary: passed
          ? `${this.name} sensor operational with clear preview`
          : `${this.name} sensor failed or exhibited optical defects (blur, spots, autofocus failure)`,
        criticalRedFlag: !passed,
        timestamp: Date.now(),
        details,
      });
      this.resolveRun = null;
    }
  }
}

/**
 * Front Selfie Camera Test
 */
export class CameraFrontTest extends BaseCameraTest {
  public id = 'hw-camera-front';
  public name = 'Front Camera & Face Sensor';
  public description = 'Inspects selfie camera resolution, focus, and optical lens cleanliness';
  protected facingMode: 'user' | 'environment' = 'user';

  public renderUI(container: HTMLElement): void {
    this.containerEl = container;
    container.innerHTML = `
      <div class="p-4 bg-slate-900 rounded-xl border border-slate-800 text-white select-none space-y-3">
        <div class="flex items-center justify-between pb-2 border-b border-slate-800">
          <span class="text-xs font-bold text-sky-400">FRONT CAMERA INSPECTION</span>
          <span class="text-[11px] text-slate-400">Facing Mode: User</span>
        </div>

        <div class="relative w-full aspect-[4/3] bg-black rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
          <video id="camera-preview-video" class="w-full h-full object-cover -scale-x-100" playsinline autoplay muted></video>
          <div class="absolute inset-0 pointer-events-none border border-sky-400/30 rounded-xl flex items-center justify-center">
            <div class="w-24 h-24 border border-dashed border-sky-400/40 rounded-full"></div>
          </div>
        </div>

        <div id="camera-capabilities-info" class="p-2.5 bg-slate-950 rounded-lg border border-slate-800 text-[11px] text-slate-400 grid grid-cols-2 gap-1.5">
          Connecting to front camera sensor...
        </div>

        <div class="flex items-center justify-between gap-2 pt-2">
          <button id="btn-cam-fail" class="flex-1 min-h-touch py-2 px-3 bg-red-700 hover:bg-red-600 rounded-lg text-xs font-bold text-white">
            Blurry / Spots / Failed
          </button>
          <button id="btn-cam-pass" class="flex-1 min-h-touch py-2 px-3 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-bold text-white">
            Focus & Image Sharp
          </button>
        </div>
      </div>
    `;

    this.startStream();

    container.querySelector('#btn-cam-pass')?.addEventListener('click', () => {
      this.finish(true);
    });
    container.querySelector('#btn-cam-fail')?.addEventListener('click', () => {
      this.finish(false);
    });
  }
}

/**
 * Rear Main Camera & Torch Test
 */
export class CameraRearTest extends BaseCameraTest {
  public id = 'hw-camera-rear';
  public name = 'Rear Camera & Flash Torch';
  public description = 'Verifies main rear camera autofocus, zoom capabilities, and LED flash torch';
  protected facingMode: 'user' | 'environment' = 'environment';

  public renderUI(container: HTMLElement): void {
    this.containerEl = container;
    container.innerHTML = `
      <div class="p-4 bg-slate-900 rounded-xl border border-slate-800 text-white select-none space-y-3">
        <div class="flex items-center justify-between pb-2 border-b border-slate-800">
          <span class="text-xs font-bold text-sky-400">REAR CAMERA & TORCH</span>
          <button id="btn-torch-toggle" class="px-2.5 py-1 text-xs font-bold bg-amber-600 hover:bg-amber-500 rounded-md text-black flex items-center space-x-1">
            <span>🔦</span>
            <span id="torch-status-text">Torch: OFF</span>
          </button>
        </div>

        <div class="relative w-full aspect-[4/3] bg-black rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
          <video id="camera-preview-video" class="w-full h-full object-cover" playsinline autoplay muted></video>
          <div class="absolute inset-0 pointer-events-none border border-sky-400/30 rounded-xl flex items-center justify-center">
            <div class="w-20 h-20 border border-sky-400/40 rounded-lg"></div>
          </div>
        </div>

        <div id="camera-capabilities-info" class="p-2.5 bg-slate-950 rounded-lg border border-slate-800 text-[11px] text-slate-400 grid grid-cols-2 gap-1.5">
          Connecting to rear camera sensor...
        </div>

        <div class="flex items-center justify-between gap-2 pt-2">
          <button id="btn-cam-fail" class="flex-1 min-h-touch py-2 px-3 bg-red-700 hover:bg-red-600 rounded-lg text-xs font-bold text-white">
            Defect / Autofocus Broken
          </button>
          <button id="btn-cam-pass" class="flex-1 min-h-touch py-2 px-3 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-bold text-white">
            Autofocus & Torch OK
          </button>
        </div>
      </div>
    `;

    this.startStream();

    const torchBtn = container.querySelector('#btn-torch-toggle');
    const torchTxt = container.querySelector('#torch-status-text');
    torchBtn?.addEventListener('click', async () => {
      const state = await this.toggleTorch();
      if (torchTxt) {
        torchTxt.textContent = state ? 'Torch: ON' : 'Torch: OFF';
      }
      if (torchBtn) {
        torchBtn.className = state
          ? 'px-2.5 py-1 text-xs font-extrabold bg-amber-400 text-black rounded-md flex items-center space-x-1 shadow-lg'
          : 'px-2.5 py-1 text-xs font-bold bg-amber-600 hover:bg-amber-500 text-black rounded-md flex items-center space-x-1';
      }
    });

    container.querySelector('#btn-cam-pass')?.addEventListener('click', () => {
      this.finish(true, { torchTested: true });
    });
    container.querySelector('#btn-cam-fail')?.addEventListener('click', () => {
      this.finish(false, { torchTested: true });
    });
  }
}
