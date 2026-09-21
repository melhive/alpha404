# Alpha404

An offline, installable PWA for mapping the people you know and how they relate — an Obsidian-style graph, but for people instead of notes.

## What it does
- Add people manually: name, tags, notes, a photo you attach yourself, and an optional "private notes" field that's blurred until you click to reveal it
- Connect people with a labeled relationship (e.g. "sibling", "colleague") — this builds a force-directed graph you can drag, pan, and zoom
- Click any node to open a detail card with their info and their connections
- Search by name or tag
- Export/import your whole graph as a JSON backup
- Works fully offline after the first load (service worker caches the app shell); all data lives in this browser via IndexedDB — nothing is sent anywhere

## What it deliberately does NOT do
This app has no camera access, no facial recognition, and no photo-matching/search against a database of faces. Adding a person and their photo is always a manual, one-at-a-time action you take — it never identifies someone from an image on its own. That's an intentional scope decision, not a missing feature.

## Running it
Open `index.html` directly, or serve the folder with any static file server (needed for the service worker to register, e.g. `npx serve .`). To install as an app, open it in Chrome/Edge and use "Install app" from the address bar or menu.

To deploy on GitHub Pages: push this folder to a repo and enable Pages on it — same pattern as BT Zone.

## Data & backups
Everything is stored locally in IndexedDB in your browser. Clearing site data/cache will erase it, so use **Export** periodically to save a JSON backup, and **Import** to restore it (on this device or a new one).

## Version
v1.1.0 — boot sequence, animated edge-draw, pulse on selected node, eased pan/zoom/auto-centering, relationship-type color coding + legend, added/updated timestamps, optional PIN lock (with auto-relock on Confidential Information after ~6s), undo-for-delete, keyboard shortcuts (⌘K search, N new person, Esc to close), light/dark theme toggle, in-app What's New panel.

v1.0.0 — initial build: graph, people, connections, Confidential Information reveal, export/import, offline shell.
