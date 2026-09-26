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

## CloudBase event uploader

The MVP uploader is implemented as a separate Node.js wrapper, so the stable
camera and dwell detector code remains unchanged. It starts this executable,
parses only `EVENT:` lines, assigns an idempotency ID, and sends the event to the
configured CloudBase HTTPS API.

```powershell
$env:PRESENCE_SENSOR_TOKEN = '<token issued by the server engineer>'
$env:PRESENCE_DEVICE_ID = 'living-room-link2'
.\start-cloud-uploader.ps1
```

Until the server implements the `presenceReport` action, validate the complete
camera-to-uploader path without network writes:

```powershell
.\start-cloud-uploader.ps1 -DryRun
```

See `CLOUD-UPLOAD-HANDOFF.md` for the event contract, backend work, and iPad Web
integration checklist. The uploader never sends frames, images, head boxes, or
face identity data.

The concrete deliverables to request from the backend and iPad Web engineers
are listed in `FRONTEND-BACKEND-REQUESTS.md`.

### Local MVP endpoint

If a backend engineer is running the presence-enabled service locally on port
8787, use the local wrapper. It reads credentials only from parameters or the
current process environment; it never reads or creates a token file in this
repository.

```powershell
$env:PRESENCE_SENSOR_TOKEN = '<token supplied by the local server operator>'
$env:PRESENCE_DEVICE_ID = 'living-room-link2'
.\start-local-mvp-uploader.ps1
```

To test the complete sender without a camera, pipe one synthetic Demo event to
the same wrapper:

```powershell
$now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
'EVENT:{"type":"presence.dwell","timestamp":' + $now + ',"dwellMs":4200,"headCount":1}' |
  .\start-local-mvp-uploader.ps1 -Stdin -Once
```

The local receiver is deliberately not included here: this repository contains
only the Windows Link 2 sender. `.presence-mvp-token`, `.env*`, and
`presence.local.*` are ignored and must never be committed.

### Sender tests

Node.js 20 or later is required for the uploader. The PowerShell launchers use
Node from `PATH`; when this repository is kept inside the supplied workspace,
they can also discover the bundled runtime under the adjacent frontend package.

```powershell
node --check .\presence_uploader.cjs
node --test .\test\presence_uploader.test.cjs
```

The tests use a loopback-only temporary HTTP receiver and do not contact
CloudBase or open the camera.

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
