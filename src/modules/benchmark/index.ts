import { DiagnosticTest } from '../../core/types';
import { WebGLGpuBenchmarkTest } from './webgl-gpu';
import { CpuWasmBenchmarkTest } from './cpu-wasm';
import { ThermalThrottlingTest } from './thermal';

export * from './fps-meter';
export * from './webgl-gpu';
export * from './cpu-wasm';
export * from './thermal';

export const benchmarkModuleTests: DiagnosticTest[] = [
  new WebGLGpuBenchmarkTest(),
  new CpuWasmBenchmarkTest(),
  new ThermalThrottlingTest(),
];
