/* Alpha404 — offline relationship graph
   No camera access. No image matching. No facial recognition of any kind. */

const APP_VERSION = '1.8.1';
const CHANGELOG = [
  {
    version: '1.8.1',
    items: [
      'Fixed the app getting stuck on an old cached version after an update (switched to network-first caching, plus an automatic one-time reload when a new version is ready) — this is why the back-button/sidebar fixes from 1.6.0 may not have shown up yet on some devices'
    ]
  },
  {
    version: '1.8.0',
    items: [
      'Global search — typing in the sidebar search now also shows matches from your other folders, tagged with which folder they\'re in; tap one to jump straight there',
      'Fixed a bug where switching folders while someone\'s detail view was open left the old person\'s panel showing instead of closing it'
    ]
  },
  {
    version: '1.7.0',
    items: [
      'Every photo is now cropped/zoomed and compressed before it\'s stored — drag to reposition, use the slider to zoom, applies to both new uploads and existing people',
      'A dedicated Photos area on every person — add more photos straight from their detail view, not just while editing',
      'Storage-used indicator in Settings',
      'Wipe-all-data and Delete-folder now require typing to confirm instead of a plain OK/Cancel prompt',
      'Folder colors — pick one when creating a folder, or tap the dot next to an existing folder to cycle its color',
      'Pin a person\'s position (📌 in their detail view) so the graph physics stops nudging them',
      'A warning when adding someone whose name already exists in the current folder',
      'Focus mode — selecting someone now dims everyone except their direct connections'
    ]
  },
  {
    version: '1.6.0',
    items: [
      'Android/browser back button now closes the sidebar, any open dialog, or the detail panel — instead of doing nothing or leaving the app',
      'Fixed pinch-to-zoom triggering the browser\u2019s own page zoom, which panned the toolbar and buttons off-screen — gestures are now fully handled by the app',
      'Added a tap-to-close scrim and a close button on the mobile sidebar',
      'Polished buttons and the menu icon (animated hamburger-to-X) for a cleaner, more professional feel',
      'Fixed hover/glow effects sticking on buttons after a tap on touchscreens (hover styles now only apply on devices that actually have a mouse)'
    ]
  },
  {
    version: '1.5.0',
    items: [
      'Folders — like CherryTree, each folder is now its own self-contained graph: people and connections in one folder never appear in another',
      'A folder switcher in the sidebar (📁 button) to create, rename, switch, and delete folders',
      'Deleting a folder removes everyone and every connection inside it (with a confirmation)',
      'Export/import now includes folders; older backups without folders import into a single "Imported" folder'
    ]
  },
  {
    version: '1.4.0',
    items: [
      'Smoother node movement — stronger damping, a speed cap, and a rest threshold so nodes settle instead of jittering',
      'Obsidian-style smooth scroll-to-zoom that eases toward the cursor instead of snapping',
      'Added two-finger pinch-to-zoom for touch/mobile'
    ]
  },
  {
    version: '1.3.1',
    items: [
      'Fixed connection lines not reaching the other person — the new-connection draw animation was comparing two different clocks against each other'
    ]
  },
  {
    version: '1.3.0',
    items: [
      'Fixed a bug where the mobile menu button was unreachable behind the toolbar, blocking access to the sidebar and "+ Person" on phones',
      'Slower, more cinematic boot sequence with a real progress bar and system-log style lines',
      'Subtle ambient scanline sweep, glow on hover/focus for buttons, and HUD corner-bracket framing on dialogs'
    ]
  },
  {
    version: '1.2.0',
    items: [
      'Relationship-type filters — click a legend chip to hide/show that type on the graph',
      'Custom fields: phone, email, birthday; multiple photos per person',
      'Auto-generated activity log per person (added, edited, connected, disconnected)',
      '"How are they connected" path finder between any two people',
      'Recently viewed section in the sidebar',
      'Wipe-all-data option and auto-lock-on-idle in Settings (when PIN lock is on)',
      'Clearer toasts (e.g. "Connected to Alex — Work"), and a Print button on each person card'
    ]
  },
  {
    version: '1.1.0',
    items: [
      'Boot sequence and smoother, eased pan/zoom/centering on the graph',
      'Animated edge-draw when a new connection is made, glow on the selected node',
      'Relationship types (family / work / friend / other) with graph color-coding + legend',
      'Optional PIN lock, with the Confidential Information field auto-hiding again after a few seconds',
      'Undo for delete, keyboard shortcuts (⌘K search, N new person), light/dark theme toggle'
    ]
  },
  {
    version: '1.0.0',
    items: ['Initial build: manual people entries, photos, tags, notes, connection graph, export/import, offline shell']
  }
];

const FOLDER_COLORS = ['#4FD1C5', '#E8A33D', '#9B8CFF', '#E85D5D', '#6FCF97', '#5CA0E8'];

const LINK_TYPES = {
  family: { label: 'Family', color: '#E8A33D' },
  work:   { label: 'Work',   color: '#4FD1C5' },
  friend: { label: 'Friend', color: '#9B8CFF' },
  other:  { label: 'Other',  color: '#7C8A97' }
};

const DB_NAME = 'alpha404';
const DB_VERSION = 2;
let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('people')) d.createObjectStore('people', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('links')) d.createObjectStore('links', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('folders')) d.createObjectStore('folders', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function tx(storeName, mode) { return db.transaction(storeName, mode).objectStore(storeName); }
function getAll(storeName) {
  return new Promise((resolve, reject) => {
    const req = tx(storeName, 'readonly').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function put(storeName, value) {
  return new Promise((resolve, reject) => {
    const req = tx(storeName, 'readwrite').put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
function del(storeName, id) {
  return new Promise((resolve, reject) => {
    const req = tx(storeName, 'readwrite').delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
function clearStore(storeName) {
  return new Promise((resolve, reject) => {
    const req = tx(storeName, 'readwrite').clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function uid(prefix) { return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function recordId(id) { return id.replace(/^[a-z]+-/, '').toUpperCase(); }
function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function fmtDateTime(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' · ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---------- State ----------
let people = [];
let links = [];
let folders = [];
let activeFolderId = null;
let selectedId = null;
let linkMode = false;
let linkModeFirst = null;
let hiddenTypes = new Set(JSON.parse(localStorage.getItem('a404_hidden_types') || '[]'));

// ---------- Back-button-aware overlay stack ----------
// Every time an overlay (sidebar / modal / detail panel) opens, it pushes a
// history entry. The hardware/browser back button then closes the most
// recently opened overlay instead of leaving the app. Explicit close actions
// (X buttons, scrim taps, Escape, save-success) also route through this so
// the two stay in sync either way.
let uiStack = [];
let pendingStates = 0;

function openLayer(name) {
  uiStack.push(name);
  pendingStates++;
  history.pushState({ a404: pendingStates }, '');
}
function hideLayerVisual(name) {
  if (name === 'sidebar') {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-scrim').classList.remove('show');
    document.getElementById('menu-btn').classList.remove('is-open');
  } else if (name === 'detail') {
    selectedId = null;
    document.getElementById('detail').classList.remove('open');
    document.getElementById('detail-scrim').classList.remove('show');
    refreshSidebar();
  } else if (name && name.startsWith('modal:')) {
    const el = document.getElementById(name.slice(6));
    if (el) el.classList.remove('show');
  }
}
// Call this from any user-facing close action (button, scrim, Escape, or a
// successful save that dismisses a modal). Safe to call even if nothing is
// open — it's a no-op in that case.
function requestBack() {
  if (pendingStates > 0) history.back();
}
window.addEventListener('popstate', () => {
  if (document.getElementById('lock-screen').style.display === 'flex') {
    // Never let back-navigation bypass the PIN lock.
    history.pushState({ a404: ++pendingStates }, '');
    return;
  }
  if (uiStack.length === 0) return;
  pendingStates = Math.max(0, pendingStates - 1);
  const name = uiStack.pop();
  hideLayerVisual(name);
});

const canvas = document.getElementById('graph');
const ctx = canvas.getContext('2d');
let view = { x: 0, y: 0, scale: 1 };
let viewAnim = null;
let targetScale = 1;
let zoomAnchor = null; // {sx, sy, wx, wy} — screen point to keep fixed while easing scale
let dragging = null;
let hoverId = null;
let highlightPath = null; // {nodeIds:Set, linkIds:Set} temporary highlight from path finder

function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * devicePixelRatio;
  canvas.height = rect.height * devicePixelRatio;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
}
window.addEventListener('resize', resizeCanvas);

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function animateViewTo(x, y, scale, duration = 550) {
  viewAnim = { fromX: view.x, fromY: view.y, fromScale: view.scale, toX: x, toY: y, toScale: scale, start: performance.now(), duration };
  targetScale = scale;
  zoomAnchor = null;
}
function stepViewAnim(now) {
  if (!viewAnim) return;
  const t = Math.min(1, (now - viewAnim.start) / viewAnim.duration);
  const e = easeOutCubic(t);
  view.x = viewAnim.fromX + (viewAnim.toX - viewAnim.fromX) * e;
  view.y = viewAnim.fromY + (viewAnim.toY - viewAnim.fromY) * e;
  view.scale = viewAnim.fromScale + (viewAnim.toScale - viewAnim.fromScale) * e;
  if (t >= 1) viewAnim = null;
}
function centerOnNode(p) {
  const rect = canvas.parentElement.getBoundingClientRect();
  const scale = Math.max(view.scale, 0.9);
  animateViewTo(rect.width / 2 - p.x * scale, rect.height / 2 - p.y * scale, scale);
}
function stepZoom() {
  if (!zoomAnchor) { view.scale = targetScale; return; }
  const diff = targetScale - view.scale;
  if (Math.abs(diff) < 0.0008) {
    view.scale = targetScale;
    view.x = zoomAnchor.sx - zoomAnchor.wx * view.scale;
    view.y = zoomAnchor.sy - zoomAnchor.wy * view.scale;
    zoomAnchor = null;
    return;
  }
  view.scale += diff * 0.22;
  view.x = zoomAnchor.sx - zoomAnchor.wx * view.scale;
  view.y = zoomAnchor.sy - zoomAnchor.wy * view.scale;
}
function setZoomTarget(sx, sy, newScale) {
  const before = screenToWorld(sx, sy);
  targetScale = Math.min(2.4, Math.max(0.3, newScale));
  zoomAnchor = { sx, sy, wx: before.x, wy: before.y };
}

// ---------- Activity log ----------
function addActivity(p, text) {
  if (!p.activity) p.activity = [];
  p.activity.unshift({ ts: Date.now(), text });
  if (p.activity.length > 40) p.activity.length = 40;
}

// ---------- Folders (CherryTree-style: each folder is its own self-contained graph) ----------
async function ensureFolders() {
  folders = await getAll('folders');
  if (folders.length === 0) {
    const f = { id: uid('f'), name: 'General', color: FOLDER_COLORS[0], createdAt: Date.now() };
    folders.push(f);
    await put('folders', f);
  }
  folders.forEach(f => { if (!f.color) f.color = FOLDER_COLORS[0]; });
  activeFolderId = localStorage.getItem('a404_active_folder');
  if (!activeFolderId || !folders.find(f => f.id === activeFolderId)) {
    activeFolderId = folders[0].id;
    localStorage.setItem('a404_active_folder', activeFolderId);
  }
}
function peopleInFolder(fid = activeFolderId) { return people.filter(p => p.folderId === fid); }
function linksInFolder(fid = activeFolderId) {
  const ids = new Set(peopleInFolder(fid).map(p => p.id));
  return links.filter(l => ids.has(l.a) && ids.has(l.b));
}
function activeFolder() { return folders.find(f => f.id === activeFolderId); }

async function switchFolder(fid) {
  if (fid === activeFolderId) return;
  activeFolderId = fid;
  localStorage.setItem('a404_active_folder', fid);
  selectedId = null;
  document.getElementById('detail').classList.remove('open');
  document.getElementById('detail-scrim').classList.remove('show');
  highlightPath = null;
  linkMode && exitLinkMode();
  document.getElementById('search').value = '';
  animateViewTo(0, 0, 1, 400);
  renderFolderSwitch();
  refreshSidebar();
  renderLegend();
  renderRecent();
  updateCounts();
  updateEmptyState();
}

function renderFolderSwitch() {
  const f = activeFolder();
  document.getElementById('active-folder-name').textContent = f ? f.name : '—';
  document.getElementById('folder-switch-dot').style.background = f ? f.color : 'var(--muted)';
}

let deleteConfirmFolderId = null;
function renderFolderList() {
  const el = document.getElementById('folder-list');
  el.innerHTML = folders.map(f => {
    const count = peopleInFolder(f.id).length;
    const isActive = f.id === activeFolderId;
    if (deleteConfirmFolderId === f.id) {
      return `
      <div class="folder-row folder-row-confirm">
        <div style="flex:1">
          <div class="settings-hint">Type "<strong>${escapeHtml(f.name)}</strong>" to permanently delete it and everyone inside (${count})</div>
          <input type="text" class="folder-delete-confirm-input" data-confirmdel="${f.id}" autocomplete="off" style="margin-top:6px">
        </div>
        <button class="icon-btn-sm" data-canceldel title="Cancel">✕</button>
      </div>`;
    }
    return `
      <div class="folder-row${isActive ? ' active' : ''}" data-switch="${f.id}">
        <button class="folder-dot" data-cyclecolor="${f.id}" title="Change color" style="background:${f.color}"></button>
        <span class="folder-name">${escapeHtml(f.name)}</span>
        <span class="folder-count mono">${count}</span>
        <button class="icon-btn-sm" data-rename="${f.id}" title="Rename">✎</button>
        <button class="icon-btn-sm danger" data-delfolder="${f.id}" title="Delete folder">✕</button>
      </div>`;
  }).join('');
  el.querySelectorAll('[data-switch]').forEach(row => row.addEventListener('click', e => {
    if (e.target.closest('button')) return;
    switchFolder(row.dataset.switch);
    closeModal('folder-modal');
  }));
  el.querySelectorAll('[data-rename]').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    renameFolder(btn.dataset.rename);
  }));
  el.querySelectorAll('[data-delfolder]').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    if (folders.length <= 1) { showToast("Can't delete the only folder."); return; }
    deleteConfirmFolderId = btn.dataset.delfolder;
    renderFolderList();
  }));
  el.querySelectorAll('[data-cyclecolor]').forEach(btn => btn.addEventListener('click', async e => {
    e.stopPropagation();
    const f = folders.find(f => f.id === btn.dataset.cyclecolor);
    if (!f) return;
    const idx = FOLDER_COLORS.indexOf(f.color);
    f.color = FOLDER_COLORS[(idx + 1) % FOLDER_COLORS.length];
    await put('folders', f);
    renderFolderList();
    renderFolderSwitch();
  }));
  el.querySelectorAll('[data-canceldel]').forEach(btn => btn.addEventListener('click', () => {
    deleteConfirmFolderId = null;
    renderFolderList();
  }));
  el.querySelectorAll('[data-confirmdel]').forEach(input => {
    input.addEventListener('keydown', e => { if (e.key === 'Enter') tryConfirmDeleteFolder(input.dataset.confirmdel, input.value); });
    setTimeout(() => input.focus(), 30);
  });
}
function tryConfirmDeleteFolder(fid, typed) {
  const f = folders.find(f => f.id === fid);
  if (!f) return;
  if (typed.trim() !== f.name) { showToast('Name doesn\'t match — folder not deleted.'); return; }
  deleteConfirmFolderId = null;
  deleteFolder(fid);
}
async function renameFolder(fid) {
  const f = folders.find(f => f.id === fid);
  if (!f) return;
  const name = prompt('Rename folder', f.name);
  if (!name || !name.trim()) return;
  f.name = name.trim();
  await put('folders', f);
  renderFolderList();
  renderFolderSwitch();
}
async function deleteFolder(fid) {
  if (folders.length <= 1) { showToast("Can't delete the only folder."); return; }
  const f = folders.find(f => f.id === fid);
  const toRemovePeople = peopleInFolder(fid);
  const removeIds = new Set(toRemovePeople.map(p => p.id));
  const toRemoveLinks = links.filter(l => removeIds.has(l.a) || removeIds.has(l.b));
  for (const p of toRemovePeople) await del('people', p.id);
  for (const l of toRemoveLinks) await del('links', l.id);
  await del('folders', fid);
  people = people.filter(p => !removeIds.has(p.id));
  links = links.filter(l => !toRemoveLinks.includes(l));
  folders = folders.filter(f => f.id !== fid);
  if (activeFolderId === fid) {
    activeFolderId = folders[0].id;
    localStorage.setItem('a404_active_folder', activeFolderId);
  }
  renderFolderList();
  renderFolderSwitch();
  refreshSidebar(); renderLegend(); renderRecent(); updateCounts(); updateEmptyState();
  showToast('Folder deleted.');
}
document.getElementById('folder-switch-btn').addEventListener('click', () => {
  deleteConfirmFolderId = null;
  renderFolderList();
  document.getElementById('new-folder-name').value = '';
  renderNewFolderColors();
  document.getElementById('folder-modal').classList.add('show');
  openLayer('modal:folder-modal');
});
let newFolderColor = FOLDER_COLORS[0];
function renderNewFolderColors() {
  newFolderColor = FOLDER_COLORS[0];
  const el = document.getElementById('new-folder-colors');
  el.innerHTML = FOLDER_COLORS.map(c => `<button class="folder-swatch${c === newFolderColor ? ' selected' : ''}" data-color="${c}" style="background:${c}"></button>`).join('');
  el.querySelectorAll('.folder-swatch').forEach(btn => btn.addEventListener('click', () => {
    newFolderColor = btn.dataset.color;
    el.querySelectorAll('.folder-swatch').forEach(b => b.classList.toggle('selected', b.dataset.color === newFolderColor));
  }));
}
document.getElementById('add-folder-btn').addEventListener('click', async () => {
  const input = document.getElementById('new-folder-name');
  const name = input.value.trim();
  if (!name) { showToast('Give the folder a name.'); return; }
  const f = { id: uid('f'), name, color: newFolderColor, createdAt: Date.now() };
  folders.push(f);
  await put('folders', f);
  input.value = '';
  renderFolderList();
  renderNewFolderColors();
  showToast(`Folder "${name}" created.`);
});

// ---------- Load / persist ----------
async function loadAll() {
  people = await getAll('people');
  links = await getAll('links');
  await ensureFolders();
  people.forEach(p => {
    if (!p.folderId) p.folderId = folders[0].id;
    if (p.x === undefined) {
      const rect = canvas.parentElement.getBoundingClientRect();
      p.x = rect.width / 2 + (Math.random() - 0.5) * 200;
      p.y = rect.height / 2 + (Math.random() - 0.5) * 200;
      p.vx = 0; p.vy = 0;
    }
    if (!p.photos) p.photos = p.photo ? [p.photo] : [];
    if (!p.activity) p.activity = [];
  });
  renderFolderSwitch();
  refreshSidebar();
  renderLegend();
  renderRecent();
  updateCounts();
  updateEmptyState();
}

function updateCounts() {
  document.getElementById('node-count').textContent = peopleInFolder().length;
  document.getElementById('link-count').textContent = linksInFolder().length;
}
function updateEmptyState() {
  document.getElementById('empty-state').classList.toggle('show', peopleInFolder().length === 0);
}
function renderLegend() {
  const el = document.getElementById('legend');
  const used = new Set(linksInFolder().map(l => l.type || 'other'));
  if (used.size === 0) { el.innerHTML = ''; return; }
  el.innerHTML = [...used].map(t => {
    const info = LINK_TYPES[t] || LINK_TYPES.other;
    const off = hiddenTypes.has(t);
    return `<span class="chip${off ? ' off' : ''}" data-type="${t}"><span class="dot" style="background:${info.color}"></span>${info.label}</span>`;
  }).join('');
  el.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const t = chip.dataset.type;
      if (hiddenTypes.has(t)) hiddenTypes.delete(t); else hiddenTypes.add(t);
      localStorage.setItem('a404_hidden_types', JSON.stringify([...hiddenTypes]));
      renderLegend();
    });
  });
}

// ---------- Recently viewed ----------
function pushRecent(id) {
  let recent = JSON.parse(localStorage.getItem('a404_recent') || '[]');
  recent = recent.filter(r => r !== id);
  recent.unshift(id);
  recent = recent.slice(0, 8);
  localStorage.setItem('a404_recent', JSON.stringify(recent));
  renderRecent();
}
function renderRecent() {
  const wrap = document.getElementById('recent-wrap');
  const list = document.getElementById('recent-list');
  const query = document.getElementById('search').value.trim();
  const recent = JSON.parse(localStorage.getItem('a404_recent') || '[]').map(id => people.find(p => p.id === id)).filter(p => p && p.folderId === activeFolderId);
  if (query || recent.length === 0) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  list.innerHTML = recent.map(p => `
    ${p.photo ? `<img class="avatar" title="${escapeHtml(p.name)}" data-goto="${p.id}" src="${p.photo}">`
               : `<div class="avatar" title="${escapeHtml(p.name)}" data-goto="${p.id}">${initials(p.name)}</div>`}
  `).join('');
  list.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', () => openDetail(el.dataset.goto, true)));
}

// ---------- Physics ----------
function tick() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const cx = rect.width / 2, cy = rect.height / 2;
  const scopedPeople = peopleInFolder();
  const scopedLinks = linksInFolder();
  for (const p of scopedPeople) {
    p.vx += (cx - p.x) * 0.0006;
    p.vy += (cy - p.y) * 0.0006;
    for (const q of scopedPeople) {
      if (p === q) continue;
      let dx = p.x - q.x, dy = p.y - q.y;
      let distSq = dx * dx + dy * dy;
      if (distSq < 0.0001) {
        // exact overlap: break the tie deterministically instead of a per-frame random jump
        dx = p.id < q.id ? -0.5 : 0.5;
        dy = 0.001;
        distSq = dx * dx + dy * dy;
      }
      const dist = Math.sqrt(distSq);
      if (dist < 160) {
        const force = (160 - dist) * 0.016;
        p.vx += (dx / dist) * force;
        p.vy += (dy / dist) * force;
      }
    }
  }
  for (const l of scopedLinks) {
    const a = people.find(p => p.id === l.a);
    const b = people.find(p => p.id === l.b);
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
    const force = (dist - 150) * 0.008;
    const fx = (dx / dist) * force, fy = (dy / dist) * force;
    a.vx += fx; a.vy += fy;
    b.vx -= fx; b.vy -= fy;
  }
  const maxSpeed = 6;
  for (const p of scopedPeople) {
    if (dragging && dragging.type === 'node' && dragging.id === p.id) { p.vx = 0; p.vy = 0; continue; }
    if (p.pinned) { p.vx = 0; p.vy = 0; continue; }
    p.vx *= 0.8; p.vy *= 0.8;
    const speed = Math.hypot(p.vx, p.vy);
    if (speed > maxSpeed) { p.vx = (p.vx / speed) * maxSpeed; p.vy = (p.vy / speed) * maxSpeed; }
    else if (speed < 0.015) { p.vx = 0; p.vy = 0; }
    p.x += p.vx; p.y += p.vy;
  }
}

function worldToScreen(x, y) { return { x: x * view.scale + view.x, y: y * view.scale + view.y }; }
function screenToWorld(x, y) { return { x: (x - view.x) / view.scale, y: (y - view.y) / view.scale }; }

function draw(now) {
  const rect = canvas.parentElement.getBoundingClientRect();
  ctx.save();
  ctx.scale(devicePixelRatio, devicePixelRatio);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const cs = getComputedStyle(document.documentElement);
  const lineColor = cs.getPropertyValue('--line').trim() || '#232C36';
  const textColor = cs.getPropertyValue('--text').trim() || '#E6EDF2';
  const mutedColor = cs.getPropertyValue('--muted').trim() || '#7C8A97';
  const panelColor = cs.getPropertyValue('--panel-2').trim() || '#161D25';
  const cyan = cs.getPropertyValue('--cyan').trim() || '#4FD1C5';

  ctx.strokeStyle = hexToRgba(lineColor, 0.5);
  ctx.lineWidth = 1;
  const gridSize = 40 * view.scale;
  const offX = view.x % gridSize, offY = view.y % gridSize;
  for (let x = offX; x < rect.width; x += gridSize) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, rect.height); ctx.stroke(); }
  for (let y = offY; y < rect.height; y += gridSize) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(rect.width, y); ctx.stroke(); }

  const focusSet = (selectedId && !highlightPath && !linkMode) ? (() => {
    const set = new Set([selectedId]);
    linksInFolder().forEach(l => {
      if (hiddenTypes.has(l.type || 'other')) return;
      if (l.a === selectedId) set.add(l.b);
      if (l.b === selectedId) set.add(l.a);
    });
    return set;
  })() : null;

  for (const l of linksInFolder()) {
    if (hiddenTypes.has(l.type || 'other')) continue;
    const a = people.find(p => p.id === l.a);
    const b = people.find(p => p.id === l.b);
    if (!a || !b) continue;
    ctx.globalAlpha = focusSet && !(l.a === selectedId || l.b === selectedId) ? 0.22 : 1;
    const info = LINK_TYPES[l.type] || LINK_TYPES.other;
    let sa = worldToScreen(a.x, a.y), sb = worldToScreen(b.x, b.y);
    const progress = l.createdAt ? Math.min(1, Math.max(0, (Date.now() - l.createdAt) / 500)) : 1;
    if (progress < 1) sb = { x: sa.x + (sb.x - sa.x) * progress, y: sa.y + (sb.y - sa.y) * progress };
    const isPathHi = highlightPath && highlightPath.linkIds.has(l.id);
    const isHover = hoverId && (l.a === hoverId || l.b === hoverId || l.a === selectedId || l.b === selectedId);
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
    ctx.strokeStyle = isPathHi ? '#FFFFFF' : (isHover ? info.color : hexToRgba(info.color, 0.55));
    ctx.lineWidth = isPathHi ? 2.4 : (isHover ? 1.8 : 1.1);
    ctx.stroke();

    if (l.label && view.scale > 0.6 && progress >= 1) {
      const mx = (sa.x + sb.x) / 2, my = (sa.y + sb.y) / 2;
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = hexToRgba(mutedColor, 0.9);
      ctx.textAlign = 'center';
      ctx.fillText(l.label, mx, my - 4);
    }
  }
  ctx.globalAlpha = 1;

  for (const p of peopleInFolder()) {
    ctx.globalAlpha = focusSet && !focusSet.has(p.id) ? 0.25 : 1;
    const s = worldToScreen(p.x, p.y);
    const baseR = (p.id === selectedId ? 15 : 12) * Math.min(view.scale, 1.4);
    const isHover = hoverId === p.id;
    const isPathHi = highlightPath && highlightPath.nodeIds.has(p.id);

    if (p.id === selectedId) {
      const pulse = 3 + Math.sin(now / 260) * 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, baseR + 6 + pulse, 0, Math.PI * 2);
      ctx.strokeStyle = hexToRgba(cyan, 0.3 + 0.12 * Math.sin(now / 260));
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate((now / 4000) % (Math.PI * 2));
      ctx.beginPath();
      ctx.setLineDash([5, 6]);
      ctx.arc(0, 0, baseR + 11, 0, Math.PI * 2);
      ctx.strokeStyle = hexToRgba(cyan, 0.55);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
      for (let k = 0; k < 4; k++) {
        const ang = (Math.PI / 2) * k;
        const r1 = baseR + 14, r2 = baseR + 18;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * r1, Math.sin(ang) * r1);
        ctx.lineTo(Math.cos(ang) * r2, Math.sin(ang) * r2);
        ctx.strokeStyle = hexToRgba(cyan, 0.7);
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
      ctx.restore();
    } else if (isPathHi) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, baseR + 6, 0, Math.PI * 2);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    } else if (isHover) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, baseR + 5, 0, Math.PI * 2);
      ctx.strokeStyle = hexToRgba(cyan, 0.5);
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(s.x, s.y, baseR, 0, Math.PI * 2);
    if (p.photoImg) {
      ctx.save();
      ctx.clip();
      ctx.drawImage(p.photoImg, s.x - baseR, s.y - baseR, baseR * 2, baseR * 2);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(s.x, s.y, baseR, 0, Math.PI * 2);
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      ctx.fillStyle = panelColor;
      ctx.fill();
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = mutedColor;
      ctx.font = `${Math.round(baseR * 0.9)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(initials(p.name), s.x, s.y + 1);
    }

    if (view.scale > 0.5) {
      ctx.font = '11.5px Inter, sans-serif';
      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(p.name, s.x, s.y + baseR + 5);
    }
    if (p.pinned) {
      ctx.font = `${Math.round(baseR * 0.85)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('📌', s.x + baseR * 0.72, s.y - baseR * 0.72);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
function hexToRgba(hex, alpha) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const num = parseInt(hex, 16);
  const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}
function initials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function loop(now) {
  tick();
  stepViewAnim(now || performance.now());
  if (!viewAnim) stepZoom();
  draw(now || performance.now());
  requestAnimationFrame(loop);
}

function nodeAt(sx, sy) {
  const scoped = peopleInFolder();
  for (let i = scoped.length - 1; i >= 0; i--) {
    const p = scoped[i];
    const s = worldToScreen(p.x, p.y);
    const r = (p.id === selectedId ? 15 : 12) * Math.min(view.scale, 1.4);
    if ((s.x - sx) ** 2 + (s.y - sy) ** 2 <= r * r) return p;
  }
  return null;
}

// ---------- Canvas interaction ----------
canvas.addEventListener('mousedown', e => {
  markActivity();
  zoomAnchor = null;
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
  const node = nodeAt(sx, sy);
  if (node) dragging = { type: 'node', id: node.id, moved: false };
  else dragging = { type: 'pan', startX: e.clientX, startY: e.clientY, ox: view.x, oy: view.y };
  canvas.classList.add('dragging');
});
window.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
  if (!dragging) {
    const node = nodeAt(sx, sy);
    hoverId = node ? node.id : null;
    canvas.style.cursor = node ? 'pointer' : 'grab';
    return;
  }
  viewAnim = null;
  if (dragging.type === 'node') {
    dragging.moved = true;
    const w = screenToWorld(sx, sy);
    const p = people.find(p => p.id === dragging.id);
    if (p) { p.x = w.x; p.y = w.y; }
  } else if (dragging.type === 'pan') {
    view.x = dragging.ox + (e.clientX - dragging.startX);
    view.y = dragging.oy + (e.clientY - dragging.startY);
  }
});
window.addEventListener('mouseup', () => {
  if (dragging && dragging.type === 'node' && !dragging.moved) handleNodeClick(dragging.id);
  dragging = null;
  canvas.classList.remove('dragging');
});
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  viewAnim = null;
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
  const factor = Math.exp(-e.deltaY * 0.0018);
  setZoomTarget(sx, sy, targetScale * factor);
}, { passive: false });

let pinch = null; // {startDist, startScale, midX, midY}
function touchDist(t0, t1) { return Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY); }

canvas.addEventListener('touchstart', e => {
  markActivity();
  if (e.touches.length === 2) {
    dragging = null;
    viewAnim = null;
    const rect = canvas.getBoundingClientRect();
    const [t0, t1] = e.touches;
    pinch = {
      startDist: touchDist(t0, t1),
      startScale: targetScale,
      sx: (t0.clientX + t1.clientX) / 2 - rect.left,
      sy: (t0.clientY + t1.clientY) / 2 - rect.top
    };
    return;
  }
  if (e.touches.length !== 1) return;
  zoomAnchor = null;
  const t = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  const sx = t.clientX - rect.left, sy = t.clientY - rect.top;
  const node = nodeAt(sx, sy);
  if (node) dragging = { type: 'node', id: node.id, moved: false };
  else dragging = { type: 'pan', startX: t.clientX, startY: t.clientY, ox: view.x, oy: view.y };
}, { passive: true });
canvas.addEventListener('touchmove', e => {
  if (e.touches.length === 2 && pinch) {
    const [t0, t1] = e.touches;
    const dist = touchDist(t0, t1);
    const scale = pinch.startScale * (dist / pinch.startDist);
    setZoomTarget(pinch.sx, pinch.sy, scale);
    return;
  }
  if (!dragging || e.touches.length !== 1) return;
  viewAnim = null;
  const t = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  if (dragging.type === 'node') {
    dragging.moved = true;
    const w = screenToWorld(t.clientX - rect.left, t.clientY - rect.top);
    const p = people.find(p => p.id === dragging.id);
    if (p) { p.x = w.x; p.y = w.y; }
  } else {
    view.x = dragging.ox + (t.clientX - dragging.startX);
    view.y = dragging.oy + (t.clientY - dragging.startY);
  }
}, { passive: true });
canvas.addEventListener('touchend', e => {
  if (e.touches.length < 2) pinch = null;
  if (dragging && dragging.type === 'node' && !dragging.moved) handleNodeClick(dragging.id);
  dragging = null;
});

function handleNodeClick(id) {
  highlightPath = null;
  if (linkMode) {
    if (!linkModeFirst) { linkModeFirst = id; showToast('Now tap the person to connect them to.'); }
    else if (linkModeFirst !== id) { openLinkModal(linkModeFirst, id); exitLinkMode(); }
    return;
  }
  openDetail(id, true);
}

document.getElementById('reset-view-btn').addEventListener('click', () => { animateViewTo(0, 0, 1); highlightPath = null; });

const linkModeBtn = document.getElementById('link-mode-btn');
linkModeBtn.addEventListener('click', () => {
  if (linkMode) exitLinkMode();
  else {
    linkMode = true; linkModeFirst = null;
    linkModeBtn.classList.add('primary');
    linkModeBtn.textContent = 'Cancel connect';
    showToast('Tap the first person.');
  }
});
function exitLinkMode() {
  linkMode = false; linkModeFirst = null;
  linkModeBtn.classList.remove('primary');
  linkModeBtn.textContent = 'Connect';
}

// ---------- Sidebar ----------
function refreshSidebar() {
  const list = document.getElementById('person-list');
  const query = document.getElementById('search').value.trim().toLowerCase();
  list.innerHTML = '';
  const sorted = [...peopleInFolder()].sort((a, b) => a.name.localeCompare(b.name));
  for (const p of sorted) {
    const hay = (p.name + ' ' + (p.tags || []).join(' ')).toLowerCase();
    if (query && !hay.includes(query)) continue;
    const row = document.createElement('div');
    row.className = 'person-row' + (p.id === selectedId ? ' active' : '');
    row.innerHTML = `
      ${p.photo ? `<img class="avatar" src="${p.photo}">` : `<div class="avatar">${initials(p.name)}</div>`}
      <div>
        <div class="name">${escapeHtml(p.name)}</div>
        ${p.tags && p.tags.length ? `<div class="tag">${escapeHtml(p.tags.join(' · '))}</div>` : ''}
      </div>`;
    row.addEventListener('click', () => openDetail(p.id, true));
    list.appendChild(row);
  }

  if (query) {
    const otherMatches = people.filter(p => p.folderId !== activeFolderId && (p.name + ' ' + (p.tags || []).join(' ')).toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (otherMatches.length) {
      const header = document.createElement('div');
      header.className = 'search-section-label';
      header.textContent = `In other folders (${otherMatches.length})`;
      list.appendChild(header);
      for (const p of otherMatches) {
        const f = folders.find(f => f.id === p.folderId);
        const row = document.createElement('div');
        row.className = 'person-row person-row-other';
        row.innerHTML = `
          ${p.photo ? `<img class="avatar" src="${p.photo}">` : `<div class="avatar">${initials(p.name)}</div>`}
          <div>
            <div class="name">${escapeHtml(p.name)}</div>
            <div class="tag"><span class="folder-dot-static" style="background:${f ? f.color : 'var(--muted)'}"></span> ${escapeHtml(f ? f.name : 'Unknown folder')}</div>
          </div>`;
        row.addEventListener('click', () => jumpToPerson(p.id));
        list.appendChild(row);
      }
    }
  }
  renderRecent();
}
document.getElementById('search').addEventListener('input', refreshSidebar);
async function jumpToPerson(id) {
  const p = people.find(p => p.id === id);
  if (!p) return;
  if (p.folderId !== activeFolderId) await switchFolder(p.folderId);
  openDetail(id, true);
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Detail panel ----------
function openDetail(id, andCenter) {
  const wasOpen = document.getElementById('detail').classList.contains('open');
  selectedId = id;
  const p = people.find(p => p.id === id);
  if (!p) return;
  if (andCenter) centerOnNode(p);
  pushRecent(id);
  const detail = document.getElementById('detail');
  const conns = links.filter(l => l.a === id || l.b === id).map(l => {
    const otherId = l.a === id ? l.b : l.a;
    const other = people.find(p => p.id === otherId);
    return { other, label: l.label, type: l.type, linkId: l.id };
  }).filter(c => c.other);

  const contactBits = [
    p.phone ? `<span>${escapeHtml(p.phone)}</span>` : '',
    p.email ? `<span>${escapeHtml(p.email)}</span>` : '',
    p.birthday ? `<span>🎂 ${escapeHtml(p.birthday)}</span>` : ''
  ].filter(Boolean).join('<span class="dot-sep"> · </span>');

  detail.innerHTML = `
    <div class="detail-head">
      <button class="close-btn" id="detail-close">✕</button>
      ${p.photo ? `<img class="detail-photo" src="${p.photo}">` : `<div class="detail-photo">${initials(p.name)}</div>`}
      <div class="detail-name">${escapeHtml(p.name)}</div>
      <div class="detail-record-id mono">REC· ${recordId(p.id)}</div>
      ${contactBits ? `<div class="detail-meta">${contactBits}</div>` : ''}
      <div>${(p.tags || []).map(t => `<span class="tag-chip">${escapeHtml(t)}</span>`).join('')}</div>
      <div class="detail-meta mono">Added ${fmtDate(p.createdAt)} · Updated ${fmtDate(p.updatedAt)}</div>
    </div>
    <div class="detail-section">
      <h4>Photos</h4>
      <div class="gallery-strip">
        ${(p.photos || []).map((ph, i) => `
          <div class="gallery-thumb${i === 0 ? ' is-primary' : ''}">
            <img src="${ph}">
            ${i === 0 ? '<div class="primary-badge">MAIN</div>' : ''}
          </div>`).join('')}
        <button class="gallery-add-tile" id="detail-add-photo-tile" title="Add photo">+</button>
      </div>
    </div>
    ${p.notes ? `<div class="detail-section"><h4>Notes</h4><div class="notes-text">${escapeHtml(p.notes)}</div></div>` : ''}
    ${p.private ? `
      <div class="detail-section" id="detail-section-private">
        <div class="private-toggle" id="private-toggle"><h4 style="margin:0">Confidential Information</h4><span class="reveal-hint">click to reveal</span></div>
        <div class="notes-text private-body" id="private-body">${escapeHtml(p.private)}</div>
      </div>` : ''}
    <div class="detail-section">
      <h4>Connections (${conns.length})</h4>
      ${conns.length ? conns.map(c => `
        <div class="conn-row" data-goto="${c.other.id}">
          ${c.other.photo ? `<img class="avatar" src="${c.other.photo}">` : `<div class="avatar">${initials(c.other.name)}</div>`}
          <span class="conn-type-dot" style="background:${(LINK_TYPES[c.type] || LINK_TYPES.other).color}"></span>
          <span class="conn-name">${escapeHtml(c.other.name)}</span>
          <span class="conn-label mono">${escapeHtml(c.label || '')}</span>
          <button class="close-btn" style="position:static;font-size:13px" data-unlink="${c.linkId}" title="Remove connection">✕</button>
        </div>`).join('') : `<div style="color:var(--muted);font-size:12.5px">No connections yet. Use Connect on the graph.</div>`}
    </div>
    <div class="detail-section">
      <h4>Activity</h4>
      ${p.activity && p.activity.length ? p.activity.slice(0, 8).map(a => `
        <div class="activity-row"><time>${fmtDateTime(a.ts)}</time><span>${escapeHtml(a.text)}</span></div>`).join('')
        : `<div style="color:var(--muted);font-size:12.5px">No activity recorded yet.</div>`}
    </div>
    <div class="detail-actions">
      <button class="btn ghost" id="detail-edit">Edit</button>
      <button class="btn ghost" id="detail-pin">${p.pinned ? '📌 Unpin' : '📌 Pin'}</button>
      <button class="btn ghost" id="detail-print">Print</button>
      <button class="btn danger ghost" id="detail-delete">Delete</button>
    </div>
  `;
  detail.classList.add('open');
  document.getElementById('detail-scrim').classList.add('show');
  if (!wasOpen) openLayer('detail');

  document.getElementById('detail-close').addEventListener('click', closeDetail);
  const pt = document.getElementById('private-toggle');
  if (pt) {
    pt.addEventListener('click', () => {
      const body = document.getElementById('private-body');
      body.classList.add('revealed');
      clearTimeout(body._relockTimer);
      body._relockTimer = setTimeout(() => body.classList.remove('revealed'), 6000);
    });
  }
  detail.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', () => openDetail(el.dataset.goto, true)));
  detail.querySelectorAll('[data-unlink]').forEach(el => el.addEventListener('click', e => {
    e.stopPropagation();
    removeLink(el.dataset.unlink);
  }));
  document.getElementById('detail-edit').addEventListener('click', () => openPersonModal(p.id));
  document.getElementById('detail-pin').addEventListener('click', () => togglePin(p.id));
  document.getElementById('detail-print').addEventListener('click', () => window.print());
  document.getElementById('detail-delete').addEventListener('click', () => softDeletePerson(p.id));
  document.getElementById('detail-add-photo-tile').addEventListener('click', () => document.getElementById('detail-photo-input').click());

  refreshSidebar();
}
async function togglePin(id) {
  const p = people.find(p => p.id === id);
  if (!p) return;
  p.pinned = !p.pinned;
  if (p.pinned) { p.vx = 0; p.vy = 0; }
  addActivity(p, p.pinned ? 'Pinned in place' : 'Unpinned');
  await put('people', stripRuntime(p));
  showToast(p.pinned ? 'Position pinned.' : 'Unpinned.');
  if (selectedId === id) openDetail(id);
}
function closeDetail() {
  if (selectedId === null) return;
  requestBack();
}
document.getElementById('detail-scrim').addEventListener('click', closeDetail);
document.getElementById('detail-photo-input').addEventListener('change', e => {
  const targetId = selectedId;
  queuePhotoFiles(e.target.files, async dataUrl => {
    const p = people.find(p => p.id === targetId);
    if (!p) return;
    if (!p.photos) p.photos = p.photo ? [p.photo] : [];
    p.photos.push(dataUrl);
    if (!p.photo) p.photo = dataUrl;
    p.updatedAt = Date.now();
    if (p.photo) loadPhotoImg(p);
    addActivity(p, 'Added a photo');
    await put('people', stripRuntime(p));
    refreshSidebar();
    if (selectedId === targetId) openDetail(targetId);
  });
  e.target.value = '';
});

async function removeLink(linkId) {
  const l = links.find(l => l.id === linkId);
  if (!l) return;
  const a = people.find(p => p.id === l.a), b = people.find(p => p.id === l.b);
  links = links.filter(x => x.id !== linkId);
  await del('links', linkId);
  if (a) { addActivity(a, `Connection to ${b ? b.name : 'someone removed'} removed`); await put('people', stripRuntime(a)); }
  if (b) { addActivity(b, `Connection to ${a ? a.name : 'someone removed'} removed`); await put('people', stripRuntime(b)); }
  renderLegend();
  updateCounts();
  if (selectedId) openDetail(selectedId);
  showToast('Connection removed.');
}

// ---------- Photo pipeline: every photo is cropped AND compressed before storage ----------
const CROP_STAGE_SIZE = 280;
const CROP_OUTPUT_SIZE = 480;
const PHOTO_QUALITY = 0.82;

let cropQueue = [];
let cropOnEach = null;
let cropImg = null;
let cropState = { scale: 1, offsetX: 0, offsetY: 0, baseScale: 1 };
let cropDragStart = null;

function queuePhotoFiles(fileList, onEachCropped) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  cropQueue = files;
  cropOnEach = onEachCropped;
  processNextCropFile();
}
function processNextCropFile() {
  if (!cropQueue.length) return;
  const file = cropQueue.shift();
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => openCropper(img);
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}
function openCropper(img) {
  cropImg = img;
  cropState.baseScale = Math.max(CROP_STAGE_SIZE / img.width, CROP_STAGE_SIZE / img.height);
  cropState.scale = 1;
  cropState.offsetX = 0;
  cropState.offsetY = 0;
  document.getElementById('crop-zoom').value = 100;
  drawCrop();
  document.getElementById('crop-modal').classList.add('show');
  openLayer('modal:crop-modal');
}
function clampCropOffset() {
  const effScale = cropState.baseScale * cropState.scale;
  const dw = cropImg.width * effScale, dh = cropImg.height * effScale;
  const maxX = Math.max(0, (dw - CROP_STAGE_SIZE) / 2);
  const maxY = Math.max(0, (dh - CROP_STAGE_SIZE) / 2);
  cropState.offsetX = Math.min(maxX, Math.max(-maxX, cropState.offsetX));
  cropState.offsetY = Math.min(maxY, Math.max(-maxY, cropState.offsetY));
}
function drawCrop() {
  const canvas = document.getElementById('crop-canvas');
  const cctx = canvas.getContext('2d');
  cctx.clearRect(0, 0, CROP_STAGE_SIZE, CROP_STAGE_SIZE);
  const effScale = cropState.baseScale * cropState.scale;
  const dw = cropImg.width * effScale, dh = cropImg.height * effScale;
  const cx = CROP_STAGE_SIZE / 2 + cropState.offsetX, cy = CROP_STAGE_SIZE / 2 + cropState.offsetY;
  cctx.drawImage(cropImg, cx - dw / 2, cy - dh / 2, dw, dh);
}
function renderCropOutput() {
  const out = document.createElement('canvas');
  out.width = CROP_OUTPUT_SIZE; out.height = CROP_OUTPUT_SIZE;
  const octx = out.getContext('2d');
  const factor = CROP_OUTPUT_SIZE / CROP_STAGE_SIZE;
  const effScale = cropState.baseScale * cropState.scale * factor;
  const dw = cropImg.width * effScale, dh = cropImg.height * effScale;
  const cx = CROP_OUTPUT_SIZE / 2 + cropState.offsetX * factor, cy = CROP_OUTPUT_SIZE / 2 + cropState.offsetY * factor;
  octx.drawImage(cropImg, cx - dw / 2, cy - dh / 2, dw, dh);
  return out.toDataURL('image/jpeg', PHOTO_QUALITY);
}
document.getElementById('crop-zoom').addEventListener('input', e => {
  cropState.scale = Number(e.target.value) / 100;
  clampCropOffset();
  drawCrop();
});
const cropStageEl = document.getElementById('crop-stage');
cropStageEl.addEventListener('pointerdown', e => {
  cropDragStart = { x: e.clientX, y: e.clientY, ox: cropState.offsetX, oy: cropState.offsetY };
  cropStageEl.setPointerCapture(e.pointerId);
});
cropStageEl.addEventListener('pointermove', e => {
  if (!cropDragStart) return;
  const ratio = CROP_STAGE_SIZE / cropStageEl.getBoundingClientRect().width;
  cropState.offsetX = cropDragStart.ox + (e.clientX - cropDragStart.x) * ratio;
  cropState.offsetY = cropDragStart.oy + (e.clientY - cropDragStart.y) * ratio;
  clampCropOffset();
  drawCrop();
});
['pointerup', 'pointercancel', 'pointerleave'].forEach(evt => cropStageEl.addEventListener(evt, () => { cropDragStart = null; }));
function cancelCropBatch() {
  cropQueue = [];
  cropOnEach = null;
  closeModal('crop-modal');
}
document.getElementById('crop-close-btn').addEventListener('click', cancelCropBatch);
document.getElementById('crop-cancel-btn').addEventListener('click', cancelCropBatch);
document.getElementById('crop-confirm-btn').addEventListener('click', () => {
  const dataUrl = renderCropOutput();
  closeModal('crop-modal');
  if (cropOnEach) cropOnEach(dataUrl);
  processNextCropFile();
});

// ---------- Person modal ----------
let editingId = null;
let pendingPhotos = [];

function openPersonModal(id) {
  editingId = id || null;
  pendingPhotos = [];
  const modal = document.getElementById('person-modal');
  document.getElementById('person-modal-title').textContent = id ? 'Edit person' : 'New person';
  document.getElementById('delete-person-btn').style.display = id ? 'inline-block' : 'none';
  const meta = document.getElementById('field-meta');

  if (id) {
    const p = people.find(p => p.id === id);
    document.getElementById('field-name').value = p.name || '';
    document.getElementById('field-phone').value = p.phone || '';
    document.getElementById('field-email').value = p.email || '';
    document.getElementById('field-birthday').value = p.birthday || '';
    document.getElementById('field-tags').value = (p.tags || []).join(', ');
    document.getElementById('field-notes').value = p.notes || '';
    document.getElementById('field-private').value = p.private || '';
    pendingPhotos = (p.photos && p.photos.length) ? [...p.photos] : (p.photo ? [p.photo] : []);
    meta.textContent = `Added ${fmtDate(p.createdAt)} · Updated ${fmtDate(p.updatedAt)}`;
  } else {
    ['field-name', 'field-phone', 'field-email', 'field-birthday', 'field-tags', 'field-notes', 'field-private'].forEach(f => document.getElementById(f).value = '');
    meta.textContent = '';
  }
  renderGalleryStrip();
  document.getElementById('photo-input').value = '';
  modal.classList.add('show');
  openLayer('modal:person-modal');
  setTimeout(() => document.getElementById('field-name').focus(), 50);
}
function blankAvatar() {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><rect width="56" height="56" fill="#0A0E12"/></svg>`);
}
function renderGalleryStrip() {
  const strip = document.getElementById('gallery-strip');
  strip.innerHTML = pendingPhotos.map((ph, i) => `
    <div class="gallery-thumb${i === 0 ? ' is-primary' : ''}" data-idx="${i}">
      <img src="${ph}">
      ${i === 0 ? '<div class="primary-badge">MAIN</div>' : ''}
      <button class="remove-thumb" data-remove="${i}" title="Remove">✕</button>
    </div>`).join('') + `<button class="gallery-add-tile" id="gallery-add-tile" title="Add photo">+</button>`;
  strip.querySelectorAll('[data-remove]').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    pendingPhotos.splice(Number(btn.dataset.remove), 1);
    renderGalleryStrip();
  }));
  strip.querySelectorAll('.gallery-thumb').forEach(thumb => thumb.addEventListener('click', () => {
    const i = Number(thumb.dataset.idx);
    if (i === 0) return;
    const [chosen] = pendingPhotos.splice(i, 1);
    pendingPhotos.unshift(chosen);
    renderGalleryStrip();
  }));
  document.getElementById('gallery-add-tile').addEventListener('click', () => document.getElementById('photo-input').click());
}

document.getElementById('add-person-btn').addEventListener('click', () => openPersonModal(null));
document.getElementById('photo-input').addEventListener('change', e => {
  queuePhotoFiles(e.target.files, dataUrl => { pendingPhotos.push(dataUrl); renderGalleryStrip(); });
  e.target.value = '';
});

document.getElementById('save-person-btn').addEventListener('click', async () => {
  const name = document.getElementById('field-name').value.trim();
  if (!name) { showToast('Name is required.'); return; }
  if (!editingId) {
    const dupe = peopleInFolder().some(p => p.name.toLowerCase() === name.toLowerCase());
    if (dupe && !confirm(`A person named "${name}" already exists in this folder. Add anyway?`)) return;
  }
  const tags = document.getElementById('field-tags').value.split(',').map(t => t.trim()).filter(Boolean);
  const notes = document.getElementById('field-notes').value.trim();
  const priv = document.getElementById('field-private').value.trim();
  const phone = document.getElementById('field-phone').value.trim();
  const email = document.getElementById('field-email').value.trim();
  const birthday = document.getElementById('field-birthday').value.trim();

  let p;
  const now = Date.now();
  const isNew = !editingId;
  if (editingId) {
    p = people.find(p => p.id === editingId);
  } else {
    const rect = canvas.parentElement.getBoundingClientRect();
    const w = screenToWorld(rect.width / 2 + (Math.random() - 0.5) * 80, rect.height / 2 + (Math.random() - 0.5) * 80);
    p = { id: uid('p'), x: w.x, y: w.y, vx: 0, vy: 0, createdAt: now, activity: [], folderId: activeFolderId };
    people.push(p);
  }
  p.name = name; p.tags = tags; p.notes = notes; p.private = priv;
  p.phone = phone; p.email = email; p.birthday = birthday;
  p.photos = [...pendingPhotos];
  p.photo = pendingPhotos[0] || null;
  p.updatedAt = now;
  if (!p.createdAt) p.createdAt = now;
  if (p.photo) loadPhotoImg(p); else p.photoImg = null;
  addActivity(p, isNew ? 'Added to Alpha404' : 'Details updated');

  await put('people', stripRuntime(p));
  closeModal('person-modal');
  refreshSidebar();
  updateCounts();
  updateEmptyState();
  showToast(isNew ? 'Person added.' : 'Saved.');
  if (editingId) openDetail(editingId);
});

function stripRuntime(p) { const { photoImg, ...rest } = p; return rest; }
function loadPhotoImg(p) { const img = new Image(); img.onload = () => { p.photoImg = img; }; img.src = p.photo; }

document.getElementById('delete-person-btn').addEventListener('click', () => {
  const id = editingId;
  closeModal('person-modal');
  softDeletePerson(id);
});

// ---------- Undo-able delete ----------
let pendingDelete = null;
function softDeletePerson(id) {
  const p = people.find(p => p.id === id);
  if (!p) return;
  const removedLinks = links.filter(l => l.a === id || l.b === id);
  people = people.filter(p => p.id !== id);
  links = links.filter(l => l.a !== id && l.b !== id);
  if (selectedId === id) closeDetail();
  refreshSidebar(); renderLegend(); updateCounts(); updateEmptyState();

  if (pendingDelete) { clearTimeout(pendingDelete.timer); finalizeDelete(pendingDelete); }
  pendingDelete = { person: p, links: removedLinks };
  pendingDelete.timer = setTimeout(() => finalizeDelete(pendingDelete), 5200);
  showToast(`Deleted ${p.name}.`, { label: 'Undo', onClick: () => undoDelete() });
}
async function finalizeDelete(pd) {
  if (!pd) return;
  await del('people', pd.person.id);
  for (const l of pd.links) await del('links', l.id);
  if (pendingDelete === pd) pendingDelete = null;
}
function undoDelete() {
  if (!pendingDelete) return;
  clearTimeout(pendingDelete.timer);
  people.push(pendingDelete.person);
  links.push(...pendingDelete.links);
  pendingDelete = null;
  refreshSidebar(); renderLegend(); updateCounts(); updateEmptyState();
  showToast('Restored.');
}

// ---------- Link modal ----------
function openLinkModal(aId, bId) {
  const modal = document.getElementById('link-modal');
  const selA = document.getElementById('link-a');
  const selB = document.getElementById('link-b');
  const options = peopleInFolder().map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  selA.innerHTML = options; selB.innerHTML = options;
  if (aId) selA.value = aId;
  if (bId) selB.value = bId;
  document.getElementById('link-type').value = 'other';
  document.getElementById('link-label').value = '';
  modal.classList.add('show');
  openLayer('modal:link-modal');
}
document.getElementById('save-link-btn').addEventListener('click', async () => {
  const a = document.getElementById('link-a').value;
  const b = document.getElementById('link-b').value;
  const type = document.getElementById('link-type').value;
  const label = document.getElementById('link-label').value.trim();
  if (!a || !b || a === b) { showToast('Choose two different people.'); return; }
  const pa = people.find(p => p.id === a), pb = people.find(p => p.id === b);
  const typeLabel = LINK_TYPES[type].label;
  const existing = links.find(l => (l.a === a && l.b === b) || (l.a === b && l.b === a));
  if (existing) {
    existing.label = label; existing.type = type;
    await put('links', existing);
    showToast(`Connection updated — ${typeLabel}.`);
  } else {
    const l = { id: uid('l'), a, b, label, type, createdAt: Date.now() };
    links.push(l);
    await put('links', l);
    if (pa) { addActivity(pa, `Connected to ${pb ? pb.name : 'someone'} — ${typeLabel}`); await put('people', stripRuntime(pa)); }
    if (pb) { addActivity(pb, `Connected to ${pa ? pa.name : 'someone'} — ${typeLabel}`); await put('people', stripRuntime(pb)); }
    showToast(`Connected to ${pb ? pb.name : 'them'} — ${typeLabel}.`);
  }
  closeModal('link-modal');
  renderLegend();
  updateCounts();
  if (selectedId === a || selectedId === b) openDetail(selectedId);
});

// ---------- Path finder ----------
document.getElementById('path-btn').addEventListener('click', () => {
  const options = peopleInFolder().map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  document.getElementById('path-a').innerHTML = options;
  document.getElementById('path-b').innerHTML = options;
  document.getElementById('path-result').innerHTML = '';
  document.getElementById('path-modal').classList.add('show');
  openLayer('modal:path-modal');
});
document.getElementById('path-find-btn').addEventListener('click', () => {
  const a = document.getElementById('path-a').value;
  const b = document.getElementById('path-b').value;
  const result = document.getElementById('path-result');
  if (!a || !b || a === b) { result.innerHTML = '<div class="path-empty">Choose two different people.</div>'; return; }

  const adjacency = new Map();
  for (const l of linksInFolder()) {
    if (!adjacency.has(l.a)) adjacency.set(l.a, []);
    if (!adjacency.has(l.b)) adjacency.set(l.b, []);
    adjacency.get(l.a).push({ to: l.b, link: l });
    adjacency.get(l.b).push({ to: l.a, link: l });
  }
  const visited = new Set([a]);
  const queue = [[a, []]];
  let foundPath = null;
  while (queue.length) {
    const [current, path] = queue.shift();
    if (current === b) { foundPath = path; break; }
    for (const edge of adjacency.get(current) || []) {
      if (visited.has(edge.to)) continue;
      visited.add(edge.to);
      queue.push([edge.to, [...path, { from: current, to: edge.to, link: edge.link }]]);
    }
  }
  if (!foundPath) {
    result.innerHTML = '<div class="path-empty">No connection path found between them.</div>';
    highlightPath = null;
    return;
  }
  const nodeIds = new Set([a, ...foundPath.map(s => s.to)]);
  const linkIds = new Set(foundPath.map(s => s.link.id));
  highlightPath = { nodeIds, linkIds };
  closeModal('path-modal');

  const pa = people.find(p => p.id === a);
  let stepsHtml = `<div class="path-step"><strong>${escapeHtml(pa.name)}</strong></div>`;
  for (const step of foundPath) {
    const person = people.find(p => p.id === step.to);
    const typeLabel = (LINK_TYPES[step.link.type] || LINK_TYPES.other).label;
    stepsHtml += `<div class="path-step"><span class="arrow">↓ ${escapeHtml(step.link.label || typeLabel)}</span></div><div class="path-step"><strong>${escapeHtml(person.name)}</strong></div>`;
  }
  showToast(foundPath.length === 1 ? 'Directly connected — highlighted on the graph.' : `Connected through ${foundPath.length - 1} ${foundPath.length - 1 === 1 ? 'person' : 'people'} — highlighted on the graph.`);
  const rect = canvas.parentElement.getBoundingClientRect();
  const xs = [...nodeIds].map(id => people.find(p => p.id === id)).filter(Boolean);
  const midX = xs.reduce((s, p) => s + p.x, 0) / xs.length;
  const midY = xs.reduce((s, p) => s + p.y, 0) / xs.length;
  animateViewTo(rect.width / 2 - midX * view.scale, rect.height / 2 - midY * view.scale, view.scale, 650);
});

// ---------- Modal helpers ----------
document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => closeModal(btn.dataset.close)));
function closeModal(id) {
  const el = document.getElementById(id);
  if (!el || !el.classList.contains('show')) return;
  requestBack();
}

// ---------- Export / Import ----------
document.getElementById('export-btn').addEventListener('click', () => {
  const data = { version: 2, exportedAt: new Date().toISOString(), folders, people: people.map(stripRuntime), links };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `alpha404-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click(); URL.revokeObjectURL(url);
  showToast('Backup downloaded.');
});
document.getElementById('import-btn').addEventListener('click', () => document.getElementById('import-file-input').click());
document.getElementById('import-file-input').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!Array.isArray(data.people) || !Array.isArray(data.links)) throw new Error('bad format');
    if (!confirm(`Import ${data.people.length} people and ${data.links.length} connections? This replaces your current data.`)) return;
    await clearStore('people'); await clearStore('links'); await clearStore('folders');
    let importFolders = Array.isArray(data.folders) ? data.folders : [];
    if (importFolders.length === 0) importFolders = [{ id: uid('f'), name: 'Imported', createdAt: Date.now() }];
    for (const f of importFolders) await put('folders', f);
    for (const p of data.people) {
      if (!p.folderId) p.folderId = importFolders[0].id;
      await put('people', p);
    }
    for (const l of data.links) await put('links', l);
    await loadAll();
    people.forEach(p => { if (p.photo) loadPhotoImg(p); });
    showToast('Import complete.');
  } catch (err) { showToast('Could not read that file.'); }
  e.target.value = '';
});

// ---------- Wipe all data ----------
document.getElementById('wipe-btn').addEventListener('click', () => {
  document.getElementById('wipe-confirm-input').value = '';
  document.getElementById('wipe-confirm-wrap').style.display = 'block';
});
document.getElementById('wipe-confirm-btn').addEventListener('click', async () => {
  const typed = document.getElementById('wipe-confirm-input').value.trim();
  if (typed !== 'WIPE') { showToast('Type WIPE exactly to confirm.'); return; }
  await clearStore('people'); await clearStore('links'); await clearStore('folders');
  localStorage.removeItem('a404_recent');
  localStorage.removeItem('a404_active_folder');
  people = []; links = []; folders = []; selectedId = null; highlightPath = null;
  closeDetail();
  await ensureFolders();
  renderFolderSwitch();
  refreshSidebar(); renderLegend(); renderRecent(); updateCounts(); updateEmptyState();
  document.getElementById('wipe-confirm-wrap').style.display = 'none';
  closeModal('settings-modal');
  showToast('All data wiped.');
});
async function reportStorageUsage() {
  const el = document.getElementById('storage-usage');
  if (!navigator.storage || !navigator.storage.estimate) { el.textContent = 'Unavailable'; return; }
  try {
    const est = await navigator.storage.estimate();
    const usedMB = (est.usage / 1048576).toFixed(1);
    el.textContent = est.quota ? `${usedMB} MB of ${(est.quota / 1048576 / 1024).toFixed(1)} GB` : `${usedMB} MB`;
  } catch { el.textContent = 'Unavailable'; }
}

// ---------- Mobile sidebar ----------
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-scrim').classList.add('show');
  document.getElementById('menu-btn').classList.add('is-open');
  openLayer('sidebar');
}
function closeSidebar() {
  if (!document.getElementById('sidebar').classList.contains('open')) return;
  requestBack();
}
document.getElementById('menu-btn').addEventListener('click', () => {
  if (document.getElementById('sidebar').classList.contains('open')) closeSidebar();
  else openSidebar();
});
document.getElementById('sidebar-scrim').addEventListener('click', closeSidebar);
document.getElementById('sidebar-close-btn').addEventListener('click', closeSidebar);

// ---------- Toast ----------
let toastTimer;
function showToast(msg, action) {
  const el = document.getElementById('toast');
  el.innerHTML = `<span>${escapeHtml(msg)}</span>`;
  if (action) {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => { action.onClick(); el.classList.remove('show'); });
    el.appendChild(btn);
  }
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 5200 : 2400);
}

// ---------- Theme ----------
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('a404_theme', theme);
  document.getElementById('theme-toggle-btn').textContent = theme === 'light' ? 'Light' : 'Dark';
}
document.getElementById('theme-toggle-btn').addEventListener('click', () => {
  const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  applyTheme(current === 'light' ? 'dark' : 'light');
});

// ---------- Settings / PIN lock / auto-lock ----------
function isPinSet() { return !!localStorage.getItem('a404_pin_hash'); }
function updatePinButton() {
  document.getElementById('pin-toggle-btn').textContent = isPinSet() ? 'On' : 'Off';
  document.getElementById('pin-set-wrap').style.display = 'none';
  document.getElementById('autolock-row').style.display = isPinSet() ? 'flex' : 'none';
  document.getElementById('autolock-select').value = localStorage.getItem('a404_autolock_ms') || '0';
}
document.getElementById('settings-btn').addEventListener('click', () => {
  updatePinButton();
  document.getElementById('wipe-confirm-wrap').style.display = 'none';
  reportStorageUsage();
  document.getElementById('settings-modal').classList.add('show');
  openLayer('modal:settings-modal');
});
document.getElementById('pin-toggle-btn').addEventListener('click', () => {
  if (isPinSet()) {
    if (confirm('Turn off PIN lock?')) {
      localStorage.removeItem('a404_pin_hash');
      localStorage.setItem('a404_autolock_ms', '0');
      updatePinButton();
      showToast('PIN lock off.');
    }
  } else {
    document.getElementById('pin-set-wrap').style.display = 'block';
    document.getElementById('pin-set-input').focus();
  }
});
document.getElementById('pin-set-save').addEventListener('click', async () => {
  const val = document.getElementById('pin-set-input').value.trim();
  if (val.length < 4) { showToast('PIN needs at least 4 digits.'); return; }
  localStorage.setItem('a404_pin_hash', await sha256Hex(val));
  document.getElementById('pin-set-input').value = '';
  updatePinButton();
  showToast('PIN set.');
});
document.getElementById('autolock-select').addEventListener('change', e => {
  localStorage.setItem('a404_autolock_ms', e.target.value);
});

let lastActivityAt = Date.now();
function markActivity() { lastActivityAt = Date.now(); }
['mousemove', 'keydown', 'click', 'touchstart'].forEach(evt => window.addEventListener(evt, markActivity, { passive: true }));
setInterval(() => {
  const ms = Number(localStorage.getItem('a404_autolock_ms') || '0');
  if (!ms || !isPinSet()) return;
  if (document.getElementById('lock-screen').style.display === 'flex') return;
  if (Date.now() - lastActivityAt > ms) {
    document.querySelectorAll('.modal-scrim.show').forEach(m => m.classList.remove('show'));
    showLockScreen();
  }
}, 5000);

function showLockScreen() {
  return new Promise(resolve => {
    const screen = document.getElementById('lock-screen');
    const input = document.getElementById('lock-input');
    const err = document.getElementById('lock-error');
    screen.style.display = 'flex';
    input.value = ''; err.textContent = '';
    setTimeout(() => input.focus(), 100);
    async function attempt() {
      const hash = await sha256Hex(input.value.trim());
      if (hash === localStorage.getItem('a404_pin_hash')) {
        screen.style.display = 'none';
        markActivity();
        resolve();
      } else {
        err.textContent = 'Incorrect PIN.';
        input.value = '';
        input.focus();
      }
    }
    document.getElementById('lock-submit').onclick = attempt;
    input.onkeydown = e => { if (e.key === 'Enter') attempt(); };
  });
}

// ---------- What's New ----------
function renderWhatsNew() {
  const body = document.getElementById('whatsnew-body');
  body.innerHTML = CHANGELOG.map(c => `<h4>v${c.version}</h4><ul>${c.items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`).join('');
}
document.getElementById('version-tag').addEventListener('click', () => {
  renderWhatsNew();
  document.getElementById('whatsnew-modal').classList.add('show');
  openLayer('modal:whatsnew-modal');
});
function maybeShowWhatsNewOnBoot() {
  const seen = localStorage.getItem('a404_seen_version');
  if (seen !== APP_VERSION) {
    renderWhatsNew();
    document.getElementById('whatsnew-modal').classList.add('show');
    openLayer('modal:whatsnew-modal');
    localStorage.setItem('a404_seen_version', APP_VERSION);
  }
}

// ---------- Keyboard shortcuts ----------
window.addEventListener('keydown', e => {
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (window.innerWidth <= 760 && !document.getElementById('sidebar').classList.contains('open')) openSidebar();
    document.getElementById('search').focus();
    return;
  }
  if (!typing && e.key.toLowerCase() === 'n') {
    e.preventDefault();
    openPersonModal(null);
    return;
  }
  if (e.key === 'Escape') {
    requestBack();
    if (linkMode) exitLinkMode();
    if (highlightPath) highlightPath = null;
  }
});

// ---------- Boot sequence ----------
function runBootSequence() {
  return new Promise(resolve => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const screen = document.getElementById('boot-screen');
    const container = document.getElementById('boot-lines');
    const fill = document.getElementById('boot-progress-fill');
    const pct = document.getElementById('boot-pct');

    if (reduced) {
      screen.classList.add('fade-out');
      setTimeout(() => { screen.style.display = 'none'; resolve(); }, 150);
      return;
    }

    const lines = [
      'ESTABLISHING LOCAL SESSION',
      'MOUNTING ON-DEVICE STORE',
      'INDEXING RELATIONSHIP GRAPH',
      'CALIBRATING RENDER ENGINE',
      'VERIFYING OFFLINE INTEGRITY',
      'READY'
    ];
    const stepDelay = 430;
    container.innerHTML = '';

    lines.forEach((text, i) => {
      const div = document.createElement('div');
      div.className = 'line';
      div.style.animationDelay = (i * stepDelay) + 'ms';
      div.textContent = '> ' + text + ' …';
      container.appendChild(div);
      setTimeout(() => {
        div.classList.add('done');
        div.innerHTML = '> ' + text + '<span class="ok">' + (i === lines.length - 1 ? '' : 'OK') + '</span>';
        const progress = Math.round(((i + 1) / lines.length) * 100);
        fill.style.width = progress + '%';
        pct.textContent = progress + '%';
      }, i * stepDelay + 260);
    });

    const totalTime = lines.length * stepDelay + 700;
    setTimeout(() => {
      screen.classList.add('fade-out');
      setTimeout(() => { screen.style.display = 'none'; resolve(); }, 600);
    }, totalTime);
  });
}

// ---------- Boot ----------
(async function init() {
  applyTheme(localStorage.getItem('a404_theme') || 'dark');
  resizeCanvas();
  db = await openDB();
  await loadAll();
  people.forEach(p => { if (p.photo) loadPhotoImg(p); });
  requestAnimationFrame(loop);

  await runBootSequence();
  if (isPinSet()) await showLockScreen();
  maybeShowWhatsNewOnBoot();
})();

if ('serviceWorker' in navigator) {
  let swRefreshed = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (swRefreshed) return;
    swRefreshed = true;
    window.location.reload();
  });
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
