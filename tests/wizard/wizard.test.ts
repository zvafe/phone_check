import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateImeiLuhn, ImeiSecurityTest } from '../../src/modules/wizard/imei';
import { CarrierLockTest, ROMANIAN_CARRIERS } from '../../src/modules/wizard/carrier';
import { FinancingLockTest } from '../../src/modules/wizard/financing';
import { AccountRemovalTest } from '../../src/modules/wizard/accounts';
import { PhysicalInspectionTest } from '../../src/modules/wizard/physical';

describe('Wizard & Security Module Suite', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe('validateImeiLuhn Algorithm', () => {
    it('validates genuine 15-digit IMEI correctly', () => {
      // 352094081234566 passes Luhn checksum
      const res = validateImeiLuhn('352094081234566');
      expect(res.isValid).toBe(true);
      expect(res.isDummyTac).toBe(false);
      expect(res.reason).toBeUndefined();
    });

    it('rejects IMEI with incorrect Luhn check digit', () => {
      const res = validateImeiLuhn('352094081234560'); // wrong check digit
      expect(res.isValid).toBe(false);
      expect(res.reason).toContain('Luhn checksum failed');
    });

    it('detects dummy or test TACs', () => {
      const res1 = validateImeiLuhn('000000001234567');
      expect(res1.isValid).toBe(false);
      expect(res1.isDummyTac).toBe(true);

      const res2 = validateImeiLuhn('111111111234567');
      expect(res2.isValid).toBe(false);
      expect(res2.isDummyTac).toBe(true);
    });

    it('handles 16-digit IMEISV format', () => {
      const res = validateImeiLuhn('3520940812345678');
      expect(res.isImeisv).toBe(true);
      expect(res.isValid).toBe(true);
    });

    it('rejects non-numeric characters and bad lengths', () => {
      expect(validateImeiLuhn('352094081234AB5').isValid).toBe(false);
      expect(validateImeiLuhn('12345').isValid).toBe(false);
    });
  });

  describe('ImeiSecurityTest', () => {
    it('runs headlessly and passes', async () => {
      const test = new ImeiSecurityTest();
      const result = await test.run();
      expect(result.id).toBe('sec-imei-blacklist');
      expect(result.status).toBe('PASSED');
      expect(result.category).toBe('SECURITY');
    });

    it('renders IMEI UI with external registry links', () => {
      const test = new ImeiSecurityTest();
      test.renderUI(container);

      expect(container.querySelector('#imei-input')).not.toBeNull();
      expect(container.querySelector('#btn-validate-imei')).not.toBeNull();
      expect(container.querySelectorAll('a[href^="http"]').length).toBe(4);
    });

    it('flags critical red flag when blacklisted or tray mismatch reported', async () => {
      const test = new ImeiSecurityTest();
      test.renderUI(container);

      const runPromise = test.run();

      const btnFlag = container.querySelector('#btn-imei-flag') as HTMLButtonElement;
      expect(btnFlag).not.toBeNull();
      btnFlag.click();

      const result = await runPromise;
      expect(result.status).toBe('FAILED');
      expect(result.criticalRedFlag).toBe(true);
    });
  });

  describe('CarrierLockTest', () => {
    it('contains Romanian carrier profiles for Orange, Digi, Vodafone, Telekom', () => {
      expect(ROMANIAN_CARRIERS.orange?.mccMnc).toBe('226-10');
      expect(ROMANIAN_CARRIERS.vodafone?.mccMnc).toBe('226-01');
      expect(ROMANIAN_CARRIERS.digi?.mccMnc).toBe('226-05');
      expect(ROMANIAN_CARRIERS.digi?.notes).toContain('VoLTE');
      expect(ROMANIAN_CARRIERS.telekom?.mccMnc).toBe('226-03');
    });

    it('renders carrier checklist and handles unlocked pass', async () => {
      const test = new CarrierLockTest();
      test.renderUI(container);

      const runPromise = test.run();

      const btnPass = container.querySelector('#btn-carrier-unlocked') as HTMLButtonElement;
      expect(btnPass).not.toBeNull();
      btnPass.click();

      const result = await runPromise;
      expect(result.status).toBe('PASSED');
      expect(result.score).toBe(100);
    });

    it('flags carrier locked device as critical red flag', async () => {
      const test = new CarrierLockTest();
      test.renderUI(container);

      const runPromise = test.run();

      const btnLocked = container.querySelector('#btn-carrier-locked') as HTMLButtonElement;
      btnLocked.click();

      const result = await runPromise;
      expect(result.status).toBe('FAILED');
      expect(result.criticalRedFlag).toBe(true);
    });
  });

  describe('FinancingLockTest', () => {
    it('runs headlessly and reports clean pass', async () => {
      const test = new FinancingLockTest();
      const result = await test.run();
      expect(result.id).toBe('sec-financing-knox');
      expect(result.status).toBe('PASSED');
    });

    it('flags financing debt or Knox 0x1 as critical red flag', async () => {
      const test = new FinancingLockTest();
      test.renderUI(container);

      const runPromise = test.run();

      const btnFlag = container.querySelector('#btn-knox-flag') as HTMLButtonElement;
      btnFlag.click();

      const result = await runPromise;
      expect(result.status).toBe('FAILED');
      expect(result.criticalRedFlag).toBe(true);
    });
  });

  describe('AccountRemovalTest', () => {
    it('flags critical red flag if accounts remain linked to device', async () => {
      const test = new AccountRemovalTest();
      test.renderUI(container);

      const runPromise = test.run();

      const btnFlag = container.querySelector('#btn-accounts-flag') as HTMLButtonElement;
      btnFlag.click();

      const result = await runPromise;
      expect(result.status).toBe('FAILED');
      expect(result.criticalRedFlag).toBe(true);
    });

    it('passes when all cloud accounts are confirmed removed', async () => {
      const test = new AccountRemovalTest();
      test.renderUI(container);

      const runPromise = test.run();

      const btnPass = container.querySelector('#btn-accounts-pass') as HTMLButtonElement;
      btnPass.click();

      const result = await runPromise;
      expect(result.status).toBe('PASSED');
      expect(result.score).toBe(100);
    });
  });

  describe('PhysicalInspectionTest', () => {
    it('flags critical red flag on liquid damage (red LDI) or bent frame', async () => {
      const test = new PhysicalInspectionTest();
      test.renderUI(container);

      const runPromise = test.run();

      const btnWater = container.querySelector('#btn-phys-water') as HTMLButtonElement;
      btnWater.click();

      const result = await runPromise;
      expect(result.status).toBe('FAILED');
      expect(result.criticalRedFlag).toBe(true);
      expect(result.score).toBe(0);
    });

    it('flags WARNING on non-OEM replacement screen or cosmetic wear', async () => {
      const test = new PhysicalInspectionTest();
      test.renderUI(container);

      const runPromise = test.run();

      const btnNonOem = container.querySelector('#btn-phys-nonoem') as HTMLButtonElement;
      btnNonOem.click();

      const result = await runPromise;
      expect(result.status).toBe('WARNING');
      expect(result.criticalRedFlag).toBe(false);
      expect(result.score).toBe(65);
    });

    it('passes when physical condition is pristine', async () => {
      const test = new PhysicalInspectionTest();
      test.renderUI(container);

      const runPromise = test.run();

      const btnPass = container.querySelector('#btn-phys-pass') as HTMLButtonElement;
      btnPass.click();

      const result = await runPromise;
      expect(result.status).toBe('PASSED');
      expect(result.score).toBe(100);
    });
  });
});
