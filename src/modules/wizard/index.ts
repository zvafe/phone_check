import { DiagnosticTest } from '../../core/types';
import { ImeiSecurityTest } from './imei';
import { CarrierLockTest } from './carrier';
import { FinancingLockTest } from './financing';
import { AccountRemovalTest } from './accounts';
import { PhysicalInspectionTest } from './physical';

export * from './imei';
export * from './carrier';
export * from './financing';
export * from './accounts';
export * from './physical';

export const wizardModuleTests: DiagnosticTest[] = [
  new ImeiSecurityTest(),
  new CarrierLockTest(),
  new FinancingLockTest(),
  new AccountRemovalTest(),
  new PhysicalInspectionTest(),
];
