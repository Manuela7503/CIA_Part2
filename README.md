# CIA Part 2 Study Desk

A static study app for Internal Audit Engagement. It runs from any static web host, including GitHub Pages, with no build step.

## On your phone

1. Open the hosted app and tap **Bank**.
2. Choose your Part 2 study ZIP. It contains the question JSON at its root and diagrams in `images/`. You can instead select the individual JSON and image files.
3. Open **Study** for practice, a 125-question simulation, or a review of missed questions.

The question bank is stored using IndexedDB on the device. Progress, saved sessions, and podcast position are saved in the same browser. Your quiz timer uses elapsed wall-clock time, including when the app is in the background or a session is saved and exited. Progress is a study metric. It does not calculate the official CIA scaled exam score.

The full simulation uses 63 Engagement Planning, 50 Information Gathering, Analysis, and Evaluation, and 12 Engagement Supervision and Communication questions. The Foundations unit is available in practice.

## Adding podcasts

`podcasts.json` lists an introduction and a recording slot for every unit and subunit. Add MP3s at the listed paths and change each track's `ready` value to `true` when its recording is available. Keep paths relative to this repository so they also work beneath the GitHub Pages project path. Users can play an episode or queue all available episodes in a unit.

## Local use

Serve this directory over HTTP, for example with `python -m http.server 8000` and open `http://localhost:8000`. The application shell works offline after an initial successful load on HTTPS or localhost. Individual podcasts depend on their audio files being reachable.
