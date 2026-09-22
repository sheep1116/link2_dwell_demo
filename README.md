# Insta360 Link 2 dwell detection demo

This Windows demo uses the supplied Insta360 Link SDK and polls
`UVCCameraExtendController::GetNewTrackObjLists()`. It shows the live Link 2
video with SDK head boxes and a runtime tuning panel, and emits a console event
after a single usable head remains in front of the frame long enough.

## Implemented rules

- Polling: 5 times/second.
- Rolling window: 4 seconds / 20 samples.
- Required valid samples: 16/20 (80%).
- Minimum dwell time: 4 seconds.
- Short target-loss tolerance: 0.8 seconds.
- Cooldown: 30 seconds in the current debug default (set it to 60 seconds in
  the panel for the original deployment rule).
- One trigger per visit by default: cooldown must expire and the person must
  have left before the detector rearms.
- Multiple usable heads do not trigger the demo.

All thresholds are fields in `DetectorConfig`. The right-hand panel changes
them at runtime; recompilation is not required. Window sample count and required
sample count are derived immediately from polling frequency, window duration,
and valid ratio.

## Debug UI

The left side displays:

- the live frame captured by the same DirectShow graph that activates Link 2;
- all SDK head boxes (green = usable, red = filtered out);
- the effective ROI in yellow;
- SDK/stream status, dwell time, valid count, ratio, and cooldown state.

The right side exposes live controls for polling rate, minimum head size,
complete-head margin, ROI, target jump/area continuity, rolling-window length,
valid ratio, minimum dwell, missing tolerance, cooldown, and leave-before-rearm.

No second camera process is used. A DirectShow Sample Grabber replaces the old
null-only graph, supplying RGB frames to the UI while the same graph keeps the
camera stream active for `GetNewTrackObjLists()`.

## Requirements

- Windows x64.
- Visual Studio 2022 C++ Build Tools.
- CMake 3.20 or later. OpenCV is not required.
- Insta360 Link 2 connected directly to Windows.
- The repository's original `UVCCamera_win.zip` in:
  `SDK/Link SDK/Link SDK/UVCCamera_win.zip`.

The build automatically extracts the vendor x64 headers, import library, and
DLL into the build directory. It does not modify the SDK archive.

## Important before running

Close applications that may own the camera, especially:

- Insta360 Link Controller;
- OBS;
- Windows Camera;
- meeting/video-call applications;
- browsers currently using the camera.

During local verification, Link 2 enumeration succeeded while Link Controller
was running, but extension-control calls failed with `E_ACCESSDENIED`. The demo
therefore needs exclusive or compatible access to the device.

## Build

From PowerShell:

```powershell
cd G:\unseen_project\demos\link2_dwell_demo
.\build.ps1
```

Or manually:

```powershell
cmake -S . -B build -A x64
cmake --build build --config Release
```

## Run

```powershell
.\build-ninja\link2_dwell_demo.exe
```

When the rule is satisfied, the console prints:

```text
检测到用户在相框前驻足
EVENT:{"type":"presence.dwell",...}
```

The `EVENT:` line is deliberately machine-readable. A later Windows WebSocket
gateway can either be called directly from `PrintTrigger()` or launch this demo
as a subprocess and forward only lines beginning with `EVENT:` to the elderly
Web page.

## Calibration notes

`UVCRect` contains only a position and size. It does not expose face
confidence, landmarks, gaze direction, or a persistent person ID. The demo
therefore detects a stable, nearby head in the center of the frame; it does not
claim to measure eye gaze.

The code treats `UVCRect.point` as the normalized top-left corner, consistent
with the rectangle use in the supplied SDK sample. Before a presentation,
observe the SDK output once and confirm the actual firmware uses the same
coordinate convention.

The demo opens the UVC stream itself because the tested Link 2 firmware only
updates tracking targets while video is active. If the USB device disconnects,
SDK polling backs off to 1 Hz to avoid log flooding; reconnect the camera and
restart the demo to rebuild the DirectShow graph.
