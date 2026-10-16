import './index.css';
import { DiagnosticStore } from './core/store';
import { DiagnosticRunner } from './core/runner';
import { Shell } from './ui/Shell';
import { diagnosticsModuleTests } from './modules/diagnostics';
import { benchmarkModuleTests } from './modules/benchmark';
import { wizardModuleTests } from './modules/wizard';

// Initialize core state store and runner
const store = new DiagnosticStore();
const runner = new DiagnosticRunner({
  defaultTimeoutMs: 30000,
  store,
});

// Register diagnostic tests
runner.registerTests(diagnosticsModuleTests);
runner.registerTests(benchmarkModuleTests);
runner.registerTests(wizardModuleTests);

// Mount application shell into DOM
const appContainer = document.getElementById('app');
if (appContainer) {
  const shell = new Shell({ runner, store });
  shell.mount(appContainer);
}

// Register PWA service worker if supported
if ('serviceWorker' in navigator && (import.meta as any).env?.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('ServiceWorker registration error:', err);
    });
  });
}
