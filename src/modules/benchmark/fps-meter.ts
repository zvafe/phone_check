/**
 * Real-time FPS Meter with Ring Buffer, Percentile Tracking, and Canvas Graphing
 */
export interface FPSStats {
  currentFps: number;
  averageFps: number;
  onePercentLow: number;
  minFps: number;
  maxFps: number;
  stutterCount: number;
  totalFrames: number;
}

export class FPSMeter {
  private bufferSize: number;
  private frameDeltas: number[];
  private bufferIndex = 0;
  private totalFrameCount = 0;
  private lastTimestamp = 0;
  private stutterCount = 0;
  private targetFrameTimeMs = 16.67; // default 60Hz

  constructor(bufferSize = 120) {
    this.bufferSize = bufferSize;
    this.frameDeltas = [];
  }

  public reset(): void {
    this.frameDeltas = [];
    this.bufferIndex = 0;
    this.totalFrameCount = 0;
    this.lastTimestamp = 0;
    this.stutterCount = 0;
  }

  public setTargetFps(targetFps: number): void {
    if (targetFps > 0) {
      this.targetFrameTimeMs = 1000 / targetFps;
    }
  }

  public recordFrame(now = performance.now()): number {
    if (this.lastTimestamp === 0) {
      this.lastTimestamp = now;
      return 60;
    }

    const deltaMs = now - this.lastTimestamp;
    this.lastTimestamp = now;

    // Filter out huge background tabs / resume jumps > 500ms
    if (deltaMs > 0.5 && deltaMs < 500) {
      if (deltaMs > this.targetFrameTimeMs * 1.5) {
        this.stutterCount++;
      }

      if (this.frameDeltas.length < this.bufferSize) {
        this.frameDeltas.push(deltaMs);
      } else {
        this.frameDeltas[this.bufferIndex] = deltaMs;
        this.bufferIndex = (this.bufferIndex + 1) % this.bufferSize;
      }
      this.totalFrameCount++;
    }

    return deltaMs > 0 ? 1000 / deltaMs : 60;
  }

  public getStats(): FPSStats {
    if (this.frameDeltas.length === 0) {
      return {
        currentFps: 0,
        averageFps: 0,
        onePercentLow: 0,
        minFps: 0,
        maxFps: 0,
        stutterCount: 0,
        totalFrames: 0,
      };
    }

    const deltas = [...this.frameDeltas];
    const totalMs = deltas.reduce((acc, d) => acc + d, 0);
    const avgDelta = totalMs / deltas.length;
    const avgFps = avgDelta > 0 ? Math.round(1000 / avgDelta) : 0;

    // Last frame FPS
    const latestIdx = (this.bufferIndex - 1 + deltas.length) % deltas.length;
    const curDelta = deltas[latestIdx] || avgDelta;
    const currentFps = curDelta > 0 ? Math.round(1000 / curDelta) : 0;

    // Sorted for percentiles: slowest frames have the largest deltaMs
    deltas.sort((a, b) => a - b);
    const minDelta = deltas[0] ?? 16.67;
    const maxDelta = deltas[deltas.length - 1] ?? 16.67;
    const maxFps = minDelta > 0 ? Math.round(1000 / minDelta) : 0;
    const minFps = maxDelta > 0 ? Math.round(1000 / maxDelta) : 0;

    // 1% Low is the 99th percentile slowest frame time
    const onePercentIndex = Math.min(
      deltas.length - 1,
      Math.floor(deltas.length * 0.99)
    );
    const onePercentDelta = deltas[onePercentIndex] ?? 16.67;
    const onePercentLow = onePercentDelta > 0 ? Math.round(1000 / onePercentDelta) : 0;

    return {
      currentFps,
      averageFps: avgFps,
      onePercentLow,
      minFps,
      maxFps,
      stutterCount: this.stutterCount,
      totalFrames: this.totalFrameCount,
    };
  }

  public renderToCanvas(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Clear background
    ctx.fillStyle = '#050811';
    ctx.fillRect(0, 0, w, h);

    if (this.frameDeltas.length < 2) return;

    // Draw reference lines: 60 FPS (16.6ms) and 30 FPS (33.3ms)
    const maxDisplayMs = 50; // top of chart is 50ms (20fps)
    const y60 = h - (16.67 / maxDisplayMs) * h;
    const y30 = h - (33.33 / maxDisplayMs) * h;

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);

    ctx.beginPath();
    ctx.moveTo(0, y30);
    ctx.lineTo(w, y30);
    ctx.stroke();

    ctx.strokeStyle = '#059669'; // Green 60fps line
    ctx.beginPath();
    ctx.moveTo(0, y60);
    ctx.lineTo(w, y60);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw frame time bars / line
    const deltas = this.frameDeltas;
    const step = w / this.bufferSize;

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    for (let i = 0; i < deltas.length; i++) {
      const idx = (this.bufferIndex + i) % deltas.length;
      const rawDelta = deltas[idx] ?? 16.67;
      const ms = Math.min(maxDisplayMs, rawDelta);
      const x = i * step;
      const y = h - (ms / maxDisplayMs) * h;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Stats overlay text
    const stats = this.getStats();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(`FPS: ${stats.currentFps} (Avg: ${stats.averageFps} | 1% Low: ${stats.onePercentLow})`, 8, 14);
  }
}
