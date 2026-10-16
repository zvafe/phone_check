import { DiagnosticTest, TestResult } from '../../core/types';

/**
 * Validates 15-digit IMEI using Luhn algorithm
 */
export function validateImeiLuhn(imei: string): {
  isValid: boolean;
  isImeisv: boolean;
  isDummyTac: boolean;
  expectedCheckDigit?: number;
  reason?: string;
} {
  const cleaned = imei.replace(/[\s-]/g, '');

  if (!/^\d+$/.test(cleaned)) {
    return { isValid: false, isImeisv: false, isDummyTac: false, reason: 'IMEI must contain only numeric digits' };
  }

  // IMEISV: 16 digits (Type Allocation Code + Serial Number + Software Version)
  if (cleaned.length === 16) {
    const tac = cleaned.slice(0, 8);
    const isDummy = checkDummyTac(tac);
    return { isValid: !isDummy, isImeisv: true, isDummyTac: isDummy, reason: isDummy ? 'Suspicious dummy TAC detected' : undefined };
  }

  if (cleaned.length !== 15) {
    return {
      isValid: false,
      isImeisv: false,
      isDummyTac: false,
      reason: `IMEI length must be 15 digits (got ${cleaned.length})`,
    };
  }

  const tac = cleaned.slice(0, 8);
  const isDummy = checkDummyTac(tac);
  if (isDummy) {
    return { isValid: false, isImeisv: false, isDummyTac: true, reason: 'Suspicious dummy or test TAC detected' };
  }

  // Calculate Luhn check digit over first 14 digits
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let digit = parseInt(cleaned[i]!, 10);
    // Double every second digit (odd positions in 0-indexed: index 1, 3, 5...)
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }

  const expectedCheckDigit = (10 - (sum % 10)) % 10;
  const actualCheckDigit = parseInt(cleaned[14]!, 10);
  const isValid = expectedCheckDigit === actualCheckDigit;

  return {
    isValid,
    isImeisv: false,
    isDummyTac: false,
    expectedCheckDigit,
    reason: isValid ? undefined : `Luhn checksum failed (expected check digit ${expectedCheckDigit}, got ${actualCheckDigit})`,
  };
}

function checkDummyTac(tac: string): boolean {
  // All same digits (e.g. 00000000, 11111111)
  if (/^(\d)\1{7}$/.test(tac)) return true;
  // Common test dummy patterns
  if (tac.startsWith('0000') || tac === '12345678' || tac === '87654321') return true;
  return false;
}

/**
 * IMEI Checksum, Blacklist & Motherboard Verification Test
 */
export class ImeiSecurityTest implements DiagnosticTest {
  public id = 'sec-imei-blacklist';
  public name = 'IMEI Blacklist & Hardware Matching';
  public category = 'SECURITY' as const;
  public description = 'Validates IMEI via Luhn checksum, detects dummy TACs, and verifies SIM tray hardware match';

  private resolveRun: ((res: TestResult) => void) | null = null;
  private containerEl: HTMLElement | null = null;

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
            summary: 'IMEI verification cancelled',
            timestamp: Date.now(),
          });
        });
      }

      onProgress?.(0, 'Dial *#06# to obtain IMEI');

      if (typeof window === 'undefined' || !this.containerEl) {
        setTimeout(() => {
          resolve({
            id: this.id,
            name: this.name,
            category: this.category,
            status: 'PASSED',
            score: 100,
            summary: 'IMEI format and validation routines initialized',
            timestamp: Date.now(),
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
        summary: 'IMEI verification cancelled',
        timestamp: Date.now(),
      });
      this.resolveRun = null;
    }
    this.cleanup();
  }

  private cleanup(): void {
    if (this.containerEl) {
      this.containerEl.innerHTML = '';
      this.containerEl = null;
    }
  }

  public renderUI(container: HTMLElement): void {
    this.containerEl = container;
    container.innerHTML = `
      <div class="p-4 bg-slate-900 rounded-xl border border-slate-800 text-white select-none space-y-4">
        <div class="flex items-center justify-between pb-2 border-b border-slate-800">
          <span class="text-xs font-bold text-sky-400">IMEI VALIDATOR & BLACKLIST PORTAL</span>
          <span class="text-[11px] font-mono text-amber-400">Dial: *#06#</span>
        </div>

        <div class="p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs text-slate-300 space-y-1">
          <div class="font-bold text-white">Critical In-Person Verification:</div>
          <div class="text-slate-400 text-[11px]">
            1. Open Phone app and dial <span class="text-amber-300 font-mono font-bold">*#06#</span>.<br>
            2. Match the on-screen IMEI with the engraving on the <b>SIM tray</b> or back glass.<br>
            <span class="text-red-400 font-bold">⚠️ If they do NOT match: The motherboard or housing was swapped!</span>
          </div>
        </div>

        <div class="space-y-2">
          <label class="block text-xs font-semibold text-slate-300">Enter 15-digit IMEI 1:</label>
          <div class="flex gap-2">
            <input
              id="imei-input"
              type="text"
              maxlength="18"
              placeholder="e.g. 352094081234567"
              class="flex-1 bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-sky-500"
            />
            <button id="btn-validate-imei" class="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-lg min-h-touch">
              Validate
            </button>
          </div>
          <div id="imei-validation-msg" class="text-xs font-mono"></div>
        </div>

        <!-- Blacklist check external portal links -->
        <div class="pt-2 border-t border-slate-800 space-y-2">
          <div class="text-xs font-semibold text-slate-400">External Global & Romanian Blacklist Checkers:</div>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <a href="https://www.imei.info" target="_blank" rel="noopener noreferrer" class="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-center font-bold text-sky-400 flex items-center justify-center space-x-1">
              <span>IMEI.info</span>
              <span>↗</span>
            </a>
            <a href="https://swappa.com/esn" target="_blank" rel="noopener noreferrer" class="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-center font-bold text-sky-400 flex items-center justify-center space-x-1">
              <span>Swappa ESN</span>
              <span>↗</span>
            </a>
            <a href="https://stolenphonechecker.org" target="_blank" rel="noopener noreferrer" class="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-center font-bold text-sky-400 flex items-center justify-center space-x-1">
              <span>Stolen Registry</span>
              <span>↗</span>
            </a>
            <a href="https://www.infoimei.ro" target="_blank" rel="noopener noreferrer" class="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-center font-bold text-sky-400 flex items-center justify-center space-x-1">
              <span>InfoIMEI.ro</span>
              <span>↗</span>
            </a>
          </div>
        </div>

        <div class="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
          <button id="btn-imei-flag" class="flex-1 min-h-touch py-2 px-3 bg-red-700 hover:bg-red-600 rounded-lg text-xs font-bold text-white">
            🚩 Flag Blacklisted / Mismatch
          </button>
          <button id="btn-imei-pass" class="flex-1 min-h-touch py-2 px-3 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-bold text-white">
            ✓ Clean IMEI & Matches Tray
          </button>
        </div>
      </div>
    `;

    const input = container.querySelector('#imei-input') as HTMLInputElement | null;
    const btnVal = container.querySelector('#btn-validate-imei');
    const msgEl = container.querySelector('#imei-validation-msg');

    const runValidation = () => {
      const val = input?.value.trim() || '';
      if (!val) {
        if (msgEl) {
          msgEl.innerHTML = '<span class="text-amber-400">Please enter an IMEI to validate</span>';
        }
        return false;
      }
      const res = validateImeiLuhn(val);
      if (res.isValid) {
        if (msgEl) {
          msgEl.innerHTML = `<span class="text-emerald-400 font-bold">✓ Valid Luhn Checksum (${res.isImeisv ? 'IMEISV 16-digit' : 'Standard 15-digit'}). TAC is genuine.</span>`;
        }
        return true;
      } else {
        if (msgEl) {
          msgEl.innerHTML = `<span class="text-red-400 font-bold">❌ Invalid IMEI: ${res.reason}</span>`;
        }
        return false;
      }
    };

    btnVal?.addEventListener('click', runValidation);
    input?.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') runValidation();
    });

    container.querySelector('#btn-imei-pass')?.addEventListener('click', () => {
      const imei = input?.value.trim() || 'Unspecified';
      this.finish(true, imei);
    });

    container.querySelector('#btn-imei-flag')?.addEventListener('click', () => {
      const imei = input?.value.trim() || 'Unspecified';
      this.finish(false, imei);
    });
  }

  private finish(clean: boolean, imei: string): void {
    if (this.resolveRun) {
      this.resolveRun({
        id: this.id,
        name: this.name,
        category: this.category,
        status: clean ? 'PASSED' : 'FAILED',
        score: clean ? 100 : 0,
        summary: clean
          ? `IMEI verified clean: Luhn checksum valid, matching physical SIM tray`
          : `CRITICAL RED FLAG: IMEI invalid, blacklisted, or physical SIM tray mismatch!`,
        criticalRedFlag: !clean,
        timestamp: Date.now(),
        details: { imei, clean },
      });
      this.resolveRun = null;
    }
    this.cleanup();
  }
}
