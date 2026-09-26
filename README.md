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

## Folders
Alpha404 now organizes people into folders, CherryTree-style: each folder is a completely separate graph. People, connections, and the legend all scope to whichever folder is active — nothing in "Work" shows up while you're in "Family," and vice versa. Use the 📁 button at the top of the sidebar to switch folders, create new ones, rename them, or delete one (which also deletes everyone and every connection inside it). If the same real person belongs in two folders, add them separately in each — they're independent entries by design, matching how CherryTree containers work.

## Version
v1.9.0 — military-HUD/cyberpunk visual pass: a target lock-on animation when selecting someone (converging brackets + scan sweep, magenta-to-cyan flash), the detail view redesigned as a "personnel file" (scanning reveal, typewriter name, classification stamp, hexagonal photo frame with a scan-line overlay), hexagonal tactical node badges on the graph, a second hard accent color (magenta) for stamps/alerts, a live "SECURE" status indicator in the toolbar, and a chromatic-aberration glitch on the boot logo.

v1.8.1 — fixed the app getting stuck on an old cached version after an update: switched the service worker from cache-first to network-first (so the latest deployed files load immediately whenever you're online), and added an automatic one-time reload when a new version takes over. If you're currently stuck on an old version (check the corner tag), redeploy this build, then fully close the app and reopen it once, or clear the site's storage/cache from your browser settings — that forces the new service worker to take over immediately instead of waiting.

v1.8.0 — global search: the sidebar search now also surfaces matches from your other folders (tagged with which folder), so you can find someone without checking each folder manually; fixed a bug where switching folders while a detail view was open left the old person's panel showing.

v1.7.0 — every photo is cropped/zoomed and compressed before storage; a dedicated Photos area on each person (add more photos from their detail view, not just while editing); storage-used indicator in Settings; type-to-confirm on Wipe-all-data and Delete-folder; folder colors; pin a person's position; duplicate-name warning; focus mode (dims everyone except the selected person's direct connections).

v1.6.0 — the Android/browser back button now closes the sidebar, an open dialog, or the detail panel instead of leaving the app; fixed pinch-to-zoom triggering the browser's own page zoom (which panned the toolbar off-screen); added a tap-to-close scrim and an explicit close button on the mobile sidebar; polished buttons and the menu icon (animated hamburger-to-X); fixed hover/glow effects sticking on buttons after a tap on touchscreens.

v1.5.0 — folders: each one is its own self-contained graph (people/connections/legend all scope to the active folder); folder switcher to create/rename/switch/delete; export/import now includes folders.

v1.4.0 — smoother node physics (stronger damping, speed cap, rest threshold instead of jitter); smooth, Obsidian-style scroll-to-zoom that eases toward the cursor; two-finger pinch-to-zoom on touch.

v1.3.1 — fixed connection lines not reaching the other person (the new-connection draw animation was comparing two mismatched clocks).

v1.3.0 — fixed a mobile bug where the ☰ menu button was unreachable behind the toolbar; slower, more cinematic boot sequence (progress bar + system-log lines); ambient scanline, button glow, and HUD corner-bracket framing on dialogs; rotating targeting reticle on the selected node.

v1.2.0 — relationship-type filters, custom fields (phone/email/birthday), multiple photos per person, auto-generated activity log, "how are they connected" path finder, recently-viewed sidebar section, wipe-all-data + auto-lock-on-idle settings, clearer toasts, print a person's card.

v1.1.0 — boot sequence, animated edge-draw, pulse on selected node, eased pan/zoom/auto-centering, relationship-type color coding + legend, added/updated timestamps, optional PIN lock (with auto-relock on Confidential Information after ~6s), undo-for-delete, keyboard shortcuts (⌘K search, N new person, Esc to close), light/dark theme toggle, in-app What's New panel.

v1.0.0 — initial build: graph, people, connections, Confidential Information reveal, export/import, offline shell.
