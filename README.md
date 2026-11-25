# CIA Part 2 Study Desk

A static study app for Internal Audit Engagement. It runs from any static web host, including GitHub Pages, with no build step.

## On your phone

1. Open the hosted app and tap **Bank**.
2. The published question bank and diagrams load automatically. To use your own bank, choose your Part 2 study ZIP or JSON from **Bank**.
3. Open **Study** and enter the number of questions you want. For the full exam simulation, enter 125. For a larger practice session, enter any number up to the available question count.
4. After a session, view the full questions, exhibits, and four answer choices. Use **Redo wrong questions** to retry only the questions you got wrong in that session. **Review last session** reopens the review.

Use **Bank → Add or replace images** to import individual images or an images ZIP without reimporting the question bank. Use the original image filenames.

The question bank is stored using IndexedDB on the device. Progress, saved sessions, and podcast position are saved in the same browser. Your quiz timer uses elapsed wall-clock time, including when the app is in the background or a session is saved and exited. Progress is a study metric. It does not calculate the official CIA scaled exam score.

The full simulation uses 63 Engagement Planning, 50 Information Gathering, Analysis, and Evaluation, and 12 Engagement Supervision and Communication questions. The Foundations unit is available in practice.

## Adding podcasts

To add a personal recording, open **Podcasts → Add a podcast** and choose an audio file. Enter an optional title and select any combination of whole units and individual subunits. The app saves the audio once on your device, and the recording appears under each selected unit with the selected subunits listed. Audio added this way stays in your current browser.

For hosted audio, commit each M4A file once and add it to the top-level `recordings` array in `podcasts.json`. Use a repository-relative `file` path, a `title`, `ready: true`, and a `topics` array of strings. For example, `["2.1", "2.2", "3"]` shows one recording under subunits 2.1 and 2.2 and all of Unit 3. The original per-subunit slots can also point to an M4A file.

## Local use

Serve this directory over HTTP, for example with `python -m http.server 8000` and open `http://localhost:8000`. The application shell works offline after an initial successful load on HTTPS or localhost. Individual podcasts depend on their audio files being reachable.
