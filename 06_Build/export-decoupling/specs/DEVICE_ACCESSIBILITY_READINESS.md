# Device and Accessibility Readiness — Parle

**Status:** engineering desk review complete; real-device and assistive-technology sign-off is still open. This document is a test protocol and evidence record, not a WCAG conformance claim.

**Review date:** 2026-10-17
**Owner:** Device QA / accessibility reviewer
**Engineering contact:** to be named before launch

## Phase 6 engineering evidence

- Source review found a global `:focus-visible` rule and focus-ring styles in shared controls, plus a `prefers-reduced-motion: reduce` rule in `07_Engineering/parle-app/src/index.css`.
- Voice/listening paths have 47 passing focused tests across 9 files: recording/client/copy/playback/settings/text, listening audio, placement listening and placement speaking.
- App and API TypeScript checks passed with zero diagnostics.
- The local Vite server started at `http://127.0.0.1:8082/` after using the installed SWC native binding. The available computer-use surface reported no browser, so no browser interaction, screenshot review or keyboard traversal could be performed here. A separate Vite attempt without the trusted SWC cache failed to load the native binding.
- No iPhone/Android device, VoiceOver/TalkBack, external keyboard, or independent accessibility scanner was available. No axe/Lighthouse score or WCAG conformance result is claimed.

## Required device matrix

Run with a clean account on the current release candidate, recording OS/browser versions and the exact SHA. Do not use real learner voice data for QA; use the approved test account and delete test recordings through the normal test cleanup flow.

| Platform | Required path | Evidence |
|---|---|---|
| iPhone, current iOS, Safari | Start speaking task, allow microphone, record, stop, upload, score, retry; play AI reply; background and resume; deny permission; revoke permission; interrupt network; retry. | OS/browser, screen recording with test identity hidden, console/network errors, expected and actual result. |
| Android, supported current version, Chrome | Repeat recording/playback paths; test permission denial/re-grant, app switch/resume, upload interruption and recovery. | Device/browser version, redacted recording/log, expected and actual result. |
| Desktop Chrome and Safari | Keyboard-only login/onboarding/public assessment flow; visible focus; dialogs/menu open/close; form errors; assessment audio controls; reduced-motion preference. | Tab sequence, screenshots of focus and error states, defects with route and steps. |
| Assistive technology | VoiceOver + Safari and TalkBack + Chrome for primary learner path: page title/landmarks, heading order, control names, form labels/errors, status announcements, dialog focus and audio controls. | AT/browser/device versions, scripted steps and pass/fail per criterion. |

## Acceptance checklist

- [ ] All primary workflows are usable without touch; focus is visible, logical, not trapped and not obscured by sticky UI.
- [ ] Inputs have persistent accessible labels; errors identify the field, explain recovery and are announced; asynchronous success/failure is announced without moving focus unexpectedly.
- [ ] Icon-only controls have names; decorative icons/images are hidden from assistive technology; meaningful images have useful alternatives.
- [ ] Text contrast meets WCAG 2.2 AA 4.5:1 (3:1 for large text); non-text controls/focus indicators meet applicable 3:1 contrast. Verify computed colors in rendered states, not from source color tokens alone.
- [ ] Zoom/reflow at 200% and narrow viewport do not hide content or actions; touch targets meet WCAG 2.2 AA minimum-size/spacing requirements or documented exceptions.
- [ ] Reduced motion removes nonessential animation; no content depends only on color, sound or motion.
- [ ] Microphone denial and unavailable device preserve a useful text-based path; permission prompts occur only after a clear user action; retry never duplicates or silently loses an answer.
- [ ] Voice playback remains controllable and does not autoplay unexpected audio; assessment listening audio failures provide the tested retry/skip recovery without exposing transcripts.
- [ ] Critical English/French-Canadian copy, assessment estimates and consent language are understandable and approved by product/counsel.
- [ ] All failures have an owner and disposition. Any blocker on a core learner path must be fixed or the affected feature explicitly gated before public access.

## Result and release gate

**Result:** pending. Repository evidence supports careful implementation of some baseline accessibility behaviors, but it cannot establish browser behavior, accessible names in rendered states, contrast, focus order, real microphone behavior, screen-reader announcements, device-specific recording/playback or legal suitability. The founder must assign a device QA/accessibility reviewer, complete the matrix and attach evidence to the exact release SHA. Until then, public launch remains blocked on AUD-P1-03 and AUD-P2-06. Deployment required to add this protocol: no; deploying the existing product is not evidence of a device or accessibility pass.
