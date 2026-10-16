import { DiagnosticReport, TestResult, DeviceHardwareInfo } from '../../core/types';

export * from './print-pdf';
export * from './share';

export function buildDiagnosticReport(
  sessionId: string,
  deviceInfo: DeviceHardwareInfo,
  testResults: Record<string, TestResult>
): DiagnosticReport {
  let score = 100;
  let hasCritical = false;
  let hasWarning = false;
  const negotiationTips: string[] = [];

  const resultsList = Object.values(testResults);

  for (const result of resultsList) {
    if (result.criticalRedFlag || result.status === 'FAILED') {
      hasCritical = true;
      score = Math.max(0, score - 30);
    } else if (result.status === 'WARNING') {
      hasWarning = true;
      score = Math.max(0, score - 10);
    }
  }

  // Specific domain negotiation rules based on detected defects
  if (testResults['sec-imei-blacklist']?.criticalRedFlag || testResults['sec-imei-blacklist']?.status === 'FAILED') {
    negotiationTips.push('🚨 CRITICAL: IMEI is blacklisted, invalid, or does not match physical SIM tray. DO NOT PURCHASE.');
  }

  if (testResults['sec-financing-knox']?.criticalRedFlag || testResults['sec-financing-knox']?.status === 'FAILED') {
    negotiationTips.push('🚨 CRITICAL: Active financing / Knox Guard lock or tripped Knox 0x1. Phone risks remote bricking. DO NOT PURCHASE.');
  }

  if (testResults['sec-account-removal']?.criticalRedFlag || testResults['sec-account-removal']?.status === 'FAILED') {
    negotiationTips.push('🚨 CRITICAL: Cloud account (iCloud / Google FRP / Mi Cloud) still bound to seller. DO NOT PURCHASE without in-person factory reset.');
  }

  if (testResults['sec-carrier-lock']?.status === 'FAILED') {
    negotiationTips.push('⚠️ Carrier lock or Digi VoLTE incompatibility detected. Deduct €40 - €80 for network unlock or skip.');
  }

  if (testResults['phys-hardware-inspection']?.criticalRedFlag) {
    negotiationTips.push('🚨 CRITICAL: Liquid damage indicator (LDI) is red or chassis bent. Motherboard corrosion risk is severe.');
  } else if (testResults['phys-hardware-inspection']?.status === 'WARNING') {
    negotiationTips.push('💡 Aftermarket non-OEM screen or chassis cosmetic wear found. Negotiate €50 - €100 price discount.');
  }

  if (testResults['hw-display-colors']?.status === 'WARNING') {
    negotiationTips.push('💡 Dead pixels or OLED burn-in detected. Display replacement costs €80 - €160. Negotiate discount.');
  }

  if (testResults['hw-touch-grid']?.status === 'FAILED') {
    negotiationTips.push('💡 Digitizer dead zone detected. Screen assembly replacement required.');
  }

  if (testResults['bench-thermal-throttle']?.status === 'WARNING') {
    negotiationTips.push('💡 Thermal throttling detected under sustained load (>18% drop). Battery replacement recommended (-€40).');
  }

  if (testResults['hw-audio-sweep']?.status === 'WARNING' || testResults['hw-audio-stereo']?.status === 'FAILED') {
    negotiationTips.push('💡 Speaker rattling or distorted membrane detected. Earpiece/speaker replacement costs ~€35.');
  }

  if (testResults['hw-camera-rear']?.status === 'FAILED' || testResults['hw-camera-front']?.status === 'FAILED') {
    negotiationTips.push('💡 Camera optical defect or autofocus failure. Camera module replacement costs ~€70 - €120.');
  }

  if (negotiationTips.length === 0) {
    negotiationTips.push('✓ Device passed all diagnostic inspections. Hardware, screen, acoustics, and security verified clean.');
  }

  const overallVerdict = hasCritical ? 'CRITICAL_RED_FLAG' : hasWarning ? 'WARNING' : 'PASS';
  const conditionGrade =
    overallVerdict === 'CRITICAL_RED_FLAG'
      ? 'F'
      : score >= 92
      ? 'A+'
      : score >= 82
      ? 'A'
      : score >= 68
      ? 'B'
      : score >= 50
      ? 'C'
      : 'F';

  return {
    sessionId,
    deviceInfo: {
      userAgent: deviceInfo.userAgent,
      screenResolution: deviceInfo.screenResolution,
      devicePixelRatio: deviceInfo.devicePixelRatio,
      hardwareConcurrency: deviceInfo.hardwareConcurrency,
      platform: deviceInfo.platform,
    },
    overallVerdict,
    overallScore: Math.max(0, Math.min(100, score)),
    conditionGrade,
    testResults,
    timestamp: new Date().toISOString(),
    negotiationTips,
  };
}
