# Phone Inspector — Used Smartphone Street Diagnostic Suite

A mobile-first, zero-install diagnostic and verification web app designed to be opened on the spot when meeting a seller from the used phone market (OLX, Facebook Marketplace, etc.).

No app installation or permissions bypass required — runs directly in Chrome (Android) or Safari (iOS).

---

## Features

### 1. Browser-Native Hardware Diagnostics
- **Touch Screen & Digitizer**:
  - Full-screen dynamic grid covering edges and notch/cutout areas. Every block turns green upon touch (100% required to pass).
  - Multi-touch test tracking 5+ simultaneous touch points with animated feedback ripples.
  - Ghost-touch monitor detecting phantom touches and coordinate jitter.
- **Display & Panel Integrity**:
  - Full-screen test patterns: Pure White, Black, Red, Green, Blue, and 50% Neutral Gray to spot dead pixels, OLED burn-in, and backlight bleed.
  - Active display refresh rate detector (60Hz, 90Hz, 120Hz+) using a high-precision `requestAnimationFrame` median filter.
  - Screen Wake Lock to keep the display active during inspection.
- **Audio & Microphone**:
  - Isolated stereo channel audio test (distinct L and R tones) via Web Audio API.
  - 20Hz – 20,000Hz logarithmic frequency sweep to detect rattling or blown speakers.
  - Microphone loopback test with a real-time RMS VU meter and playback confirmation.
- **Cameras & Flashlight**:
  - Front and rear camera preview streams with zoom/focus capability probing.
  - Flashlight / torch toggle (where supported by browser hardware constraints).
- **Sensors & Connectivity**:
  - 2D/3D tilt bubble level using accelerometer and gyroscope telemetry.
  - GPS / Geolocation accuracy verification with high-precision threshold (<25m).
  - Barometer pressure seal test (checks for atmospheric pressure increase when squeezing the chassis, indicating intact IP67/IP68 water resistance seals).
  - Web NFC tag reading on supported devices (Android Chrome) with graceful guidance on unsupported browsers.

### 2. CPU, GPU Benchmark & Thermal Throttling
- **WebGL 3D GPU Stress Test**: Continuous real-time 3D Torus Knot geometry rendering with procedural fractional Brownian motion (fBm) shader load.
- **Live FPS & Frame Drop Telemetry**: Real-time FPS line graph tracking average FPS, frame stutters, and 1% lows.
- **Multi-Core CPU Benchmark**: Intensive compute workload distributed across `navigator.hardwareConcurrency` Web Workers.
- **Thermal Throttling & Battery Monitor**: Compares initial 10-second performance vs. sustained performance. Flags thermal throttling (>15-20% drop) and monitors battery discharge rate.

### 3. IMEI, Blacklist & Carrier Lock Wizard
- **IMEI Extraction & Luhn Validation**:
  - Instructions to dial `*#06#` or inspect the SIM tray.
  - Instant 15-digit Luhn algorithm checksum validation (detects fake/typo IMEIs).
  - 1-click links to blacklist & stolen registries (IMEI.info, StolenPhoneChecker, Apple Coverage).
- **Romanian Carrier Lock Protocols**:
  - Practical checklist for testing SIM locks across **Orange Romania**, **Digi (RCS & RDS)** (including VoLTE call test), **Telekom Romania**, and **Vodafone Romania**.
  - Dual-SIM and eSIM verification steps.
- **Installment Financing & Knox Guard Warning System**:
  - Checks for unpaid installments via eMAG, Altex, Orange/Digi contracts, and PayPo.
  - Guidance on checking the original purchase receipt (*factură și bon fiscal*) to avoid post-purchase remote IMEI blacklisting or Knox Guard lockouts.
  - Instructions for checking Samsung Knox warranty bit (`0x0` clean vs `0x1` tripped) via Download Mode.
- **Anti-Theft Account Removal**:
  - Verification checklist for Google FRP (Factory Reset Protection), Samsung Account, Xiaomi Mi Account, and Apple iCloud Activation Lock / Find My.
- **Physical Inspection**:
  - SIM tray Liquid Damage Indicator (LDI) check.
  - Frame bend test, replacement screen indicators (aftermarket LCD vs. OEM OLED, chin thickness, True Tone), and speaker grill cleanliness.

### 4. Diagnostic Report & Export
- **Automated Scoring**: Composite 100-point rating and condition grades (`A+`, `A`, `B`, `C`, `F`).
- **Red Flag Veto**: Any critical issue (blacklisted IMEI, active iCloud/Knox lock, water damage) triggers an immediate `CRITICAL RED FLAG` verdict.
- **Export Options**:
  - Print / Save as PDF with dedicated `@media print` clean formatting.
  - Download structured JSON inspection report.
  - One-click share via URL hash payload or Web Share API.
- **Outdoor Sunlight Mode**: Instant high-contrast theme toggle (>12:1 contrast ratio) for inspecting phones outdoors in direct daylight.

---

## Deployment to GitHub Pages

1. **Fork or push this repository to GitHub**.
2. Go to **Settings** > **Pages** in your repository.
3. Under **Build and deployment**, select **Source** as **GitHub Actions**.
4. The included [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) will automatically build and publish the site whenever changes are pushed to `main`.
5. Access your custom deployment at `https://<username>.github.io/<repo-name>/` or point your custom domain in the Pages settings.

---

## Local Development

```bash
# Install dependencies
npm install

# Start local development server
npm run dev

# Run unit and stress tests
npm test

# Check TypeScript types
npm run typecheck

# Build production static bundle
npm run build
```

---

## Street Checklist Quick Reference

| Step | Action | What to Look For |
|------|--------|------------------|
| **1. IMEI** | Dial `*#06#` on the phone | Match screen IMEI with the SIM tray and original box |
| **2. Financing** | Ask for the invoice (*factură + bon*) | Ensure no remaining monthly installments at Orange/Digi/eMAG |
| **3. Carrier** | Insert two different carrier SIMs (e.g. Digi + Orange) | Place a test call on both to confirm network unlock |
| **4. Knox** | Boot Samsung to Download Mode (`Vol Down + Power` while plugging USB) | `KNOX WARRANTY VOID: 0x0` (if `0x1`, phone was rooted/modified) |
| **5. Water** | Remove SIM tray, shine flashlight inside | LDI sticker must be WHITE (red/pink = liquid damaged) |
| **6. Account** | Perform a full factory reset in front of the seller | Ensure phone reaches home screen without asking for seller's password |
