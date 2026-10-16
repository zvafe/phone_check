import { DiagnosticReport } from '../../core/types';

/**
 * Triggers browser print dialog formatted for PDF generation or physical receipt
 */
export function triggerPrintReport(_report?: DiagnosticReport): void {
  if (typeof window === 'undefined') return;

  // Add print-ready marker class to body during print
  document.body.classList.add('is-printing-report');

  const afterPrintHandler = () => {
    document.body.classList.remove('is-printing-report');
    window.removeEventListener('afterprint', afterPrintHandler);
  };
  window.addEventListener('afterprint', afterPrintHandler);

  window.print();
}
