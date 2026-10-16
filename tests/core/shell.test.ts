import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Shell } from '../../src/ui/Shell';
import { DiagnosticRunner } from '../../src/core/runner';
import { DiagnosticStore } from '../../src/core/store';
import { DiagnosticTest } from '../../src/core/types';

describe('Shell UI Component', () => {
  let container: HTMLElement;
  let store: DiagnosticStore;
  let runner: DiagnosticRunner;
  let shell: Shell;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    store = new DiagnosticStore();
    runner = new DiagnosticRunner({ store });

    const dummyHardwareTest: DiagnosticTest = {
      id: 'hw_test_1',
      name: 'Hardware Digitizer Test',
      category: 'HARDWARE',
      description: 'Tests screen touch digitizer',
      run: async () => ({
        id: 'hw_test_1',
        name: 'Hardware Digitizer Test',
        category: 'HARDWARE',
        status: 'PASSED',
        summary: 'Digitizer OK',
        timestamp: Date.now(),
      }),
    };

    const dummySecurityTest: DiagnosticTest = {
      id: 'sec_test_1',
      name: 'IMEI Blacklist Test',
      category: 'SECURITY',
      description: 'Checks IMEI against blacklist',
      run: async () => ({
        id: 'sec_test_1',
        name: 'IMEI Blacklist Test',
        category: 'SECURITY',
        status: 'PASSED',
        summary: 'Clean IMEI',
        timestamp: Date.now(),
      }),
    };

    runner.registerTest(dummyHardwareTest);
    runner.registerTest(dummySecurityTest);

    shell = new Shell({ runner, store });
    shell.mount(container);
  });

  afterEach(() => {
    shell.unmount();
    container.remove();
  });

  it('renders application header, tabs, and footer status bar', () => {
    expect(container.querySelector('h1')?.textContent).toContain('Phone Inspector');

    const tabs = container.querySelectorAll('[data-cat]');
    expect(tabs.length).toBe(5); // ALL, HARDWARE, BENCHMARK, SECURITY, PHYSICAL

    const cards = container.querySelectorAll('[data-testid^="test-card-"]');
    expect(cards.length).toBe(2);

    const footer = container.querySelector('footer');
    expect(footer?.textContent).toContain('Pass');
  });

  it('toggles sunlight mode when toggle button is clicked', () => {
    const sunlightBtn = container.querySelector('#sunlight-toggle-btn') as HTMLButtonElement;
    expect(sunlightBtn).toBeDefined();
    expect(store.getState().sunlightMode).toBe(false);

    sunlightBtn.click();
    expect(store.getState().sunlightMode).toBe(true);

    const updatedBtn = container.querySelector('#sunlight-toggle-btn') as HTMLButtonElement;
    expect(updatedBtn.getAttribute('aria-pressed')).toBe('true');
    expect(updatedBtn.textContent).toContain('SUNLIGHT ON');
  });

  it('filters tests when category tabs are clicked', () => {
    const hwTab = container.querySelector('[data-cat="HARDWARE"]') as HTMLButtonElement;
    hwTab.click();

    expect(store.getState().currentCategory).toBe('HARDWARE');
    const cards = container.querySelectorAll('[data-testid^="test-card-"]');
    expect(cards.length).toBe(1);
    expect(container.querySelector('[data-testid="test-card-hw_test_1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="test-card-sec_test_1"]')).toBeNull();
  });

  it('triggers test execution when Run button on test card is clicked', async () => {
    const runSpy = vi.spyOn(runner, 'runSingle');
    const runBtn = container.querySelector('[data-run-test="hw_test_1"]') as HTMLButtonElement;
    expect(runBtn).not.toBeNull();

    runBtn.click();
    expect(runSpy).toHaveBeenCalledWith('hw_test_1');

    await vi.waitFor(() => {
      const footer = container.querySelector('footer');
      expect(footer?.textContent).toContain('1 Pass');
    });
  });

  it('triggers full suite run when Run All button is clicked', async () => {
    const runAllSpy = vi.spyOn(runner, 'runAll');
    const runAllBtn = container.querySelector('#btn-run-all') as HTMLButtonElement;
    expect(runAllBtn).not.toBeNull();

    runAllBtn.click();
    expect(runAllSpy).toHaveBeenCalled();
  });

  it('renders active test indicator when a test is running', () => {
    store.setState({ activeTestId: 'hw_test_1', runnerState: 'RUNNING' });
    expect(container.textContent).toContain('Executing Test');
    expect(container.textContent).toContain('hw_test_1');
  });

  it('handles cancel button when suite is running', () => {
    const cancelSpy = vi.spyOn(runner, 'cancel');
    store.setState({ runnerState: 'RUNNING' });

    const cancelBtn = container.querySelector('#btn-cancel-suite') as HTMLButtonElement;
    expect(cancelBtn).not.toBeNull();
    cancelBtn.click();
    expect(cancelSpy).toHaveBeenCalled();
  });

  it('resets session when reset button is confirmed', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const resetSpy = vi.spyOn(store, 'resetSession');

    const resetBtn = container.querySelector('#btn-reset-session') as HTMLButtonElement;
    expect(resetBtn).not.toBeNull();
    resetBtn.click();

    expect(resetSpy).toHaveBeenCalled();
  });

  it('cleans up DOM on unmount', () => {
    shell.unmount();
    expect(container.innerHTML).toBe('');
  });

  it('keeps interactive test modal overlay mounted when test execution triggers store updates', async () => {
    let testResolve: ((res: any) => void) | null = null;
    const interactiveTest: DiagnosticTest = {
      id: 'interactive_hw',
      name: 'Interactive HW Test',
      category: 'HARDWARE',
      description: 'Modal test',
      renderUI: (el: HTMLElement) => {
        el.innerHTML = '<div id="interactive-content">Content Loaded</div>';
      },
      run: () => new Promise((resolve) => {
        testResolve = resolve;
      }),
      cancel: vi.fn(),
    };

    runner.registerTest(interactiveTest);
    store.setCategory('ALL');

    const runBtn = container.querySelector('[data-run-test="interactive_hw"]') as HTMLButtonElement;
    expect(runBtn).not.toBeNull();
    runBtn.click();

    // Verify modal overlay and content are present
    const overlay = container.querySelector('#interactive-test-overlay');
    expect(overlay).not.toBeNull();
    expect(container.querySelector('#interactive-content')).not.toBeNull();

    // Simulate store updates that trigger shell.render()
    store.setState({ sunlightMode: true });
    store.setState({ currentCategory: 'HARDWARE' });

    // The overlay should STILL be present and NOT wiped out
    expect(container.querySelector('#interactive-test-overlay')).not.toBeNull();
    expect(container.querySelector('#interactive-content')).not.toBeNull();

    // Now resolve test
    testResolve!({
      id: 'interactive_hw',
      name: 'Interactive HW Test',
      category: 'HARDWARE',
      status: 'PASSED',
      summary: 'Success',
      timestamp: Date.now(),
    });

    await vi.waitFor(() => {
      expect(container.querySelector('#interactive-test-overlay')).toBeNull();
    });
  });

  it('cancels runner and closes modal when interactive test modal close button is clicked', async () => {
    const cancelSpy = vi.fn();
    const runnerCancelSpy = vi.spyOn(runner, 'cancel');

    const interactiveTest: DiagnosticTest = {
      id: 'interactive_cancel_test',
      name: 'Interactive Cancel Test',
      category: 'HARDWARE',
      description: 'Cancel modal test',
      renderUI: (el: HTMLElement) => {
        el.innerHTML = '<div>Testing Modal Close</div>';
      },
      run: () => new Promise(() => {}),
      cancel: cancelSpy,
    };

    runner.registerTest(interactiveTest);
    store.setCategory('ALL');

    const runBtn = container.querySelector('[data-run-test="interactive_cancel_test"]') as HTMLButtonElement;
    runBtn.click();

    expect(container.querySelector('#interactive-test-overlay')).not.toBeNull();

    const closeBtn = container.querySelector('#btn-close-test-modal') as HTMLButtonElement;
    expect(closeBtn).not.toBeNull();
    closeBtn.click();

    expect(runnerCancelSpy).toHaveBeenCalled();
    expect(container.querySelector('#interactive-test-overlay')).toBeNull();
  });
});
