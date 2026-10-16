import { DiagnosticTest } from '../../core/types';
import { TouchGridTest, MultiTouchTest, GhostTouchTest } from './touch';
import { DisplayColorTest, DisplayRefreshRateTest } from './display';
import { StereoAudioTest, FrequencySweepTest, MicrophoneLoopbackTest } from './audio';
import { CameraFrontTest, CameraRearTest } from './camera';
import { MotionSensorsTest, GeolocationTest, BarometerSealTest, NfcTest } from './sensors';

export * from './touch';
export * from './display';
export * from './audio';
export * from './camera';
export * from './sensors';

export const diagnosticsModuleTests: DiagnosticTest[] = [
  new TouchGridTest(),
  new MultiTouchTest(),
  new GhostTouchTest(),
  new DisplayColorTest(),
  new DisplayRefreshRateTest(),
  new StereoAudioTest(),
  new FrequencySweepTest(),
  new MicrophoneLoopbackTest(),
  new CameraFrontTest(),
  new CameraRearTest(),
  new MotionSensorsTest(),
  new GeolocationTest(),
  new BarometerSealTest(),
  new NfcTest(),
];
