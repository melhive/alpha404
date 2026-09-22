/* Alpha404 — offline relationship graph
   No camera access. No image matching. No facial recognition of any kind. */

const APP_VERSION = '1.5.0';
const CHANGELOG = [
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
    const f = { id: uid('f'), name: 'General', createdAt: Date.now() };
    folders.push(f);
    await put('folders', f);
  }
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
  highlightPath = null;
  linkMode && exitLinkMode();
  closeDetail();
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
}

function renderFolderList() {
  const el = document.getElementById('folder-list');
  el.innerHTML = folders.map(f => {
    const count = peopleInFolder(f.id).length;
    const isActive = f.id === activeFolderId;
    return `
      <div class="folder-row${isActive ? ' active' : ''}" data-switch="${f.id}">
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
    deleteFolder(btn.dataset.delfolder);
  }));
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
  const count = peopleInFolder(fid).length;
  if (!confirm(`Delete "${f.name}" and everyone in it (${count} ${count === 1 ? 'person' : 'people'})? This cannot be undone.`)) return;
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
  renderFolderList();
  document.getElementById('new-folder-name').value = '';
  document.getElementById('folder-modal').classList.add('show');
});
document.getElementById('add-folder-btn').addEventListener('click', async () => {
  const input = document.getElementById('new-folder-name');
  const name = input.value.trim();
  if (!name) { showToast('Give the folder a name.'); return; }
  const f = { id: uid('f'), name, createdAt: Date.now() };
  folders.push(f);
  await put('folders', f);
  input.value = '';
  renderFolderList();
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

  for (const l of linksInFolder()) {
    if (hiddenTypes.has(l.type || 'other')) continue;
    const a = people.find(p => p.id === l.a);
    const b = people.find(p => p.id === l.b);
    if (!a || !b) continue;
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

  for (const p of peopleInFolder()) {
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
  }
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
  renderRecent();
}
document.getElementById('search').addEventListener('input', refreshSidebar);

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Detail panel ----------
function openDetail(id, andCenter) {
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
      ${p.photos && p.photos.length > 1 ? `<div class="gallery-strip" style="margin-top:8px">${p.photos.map(ph => `<div class="gallery-thumb"><img src="${ph}"></div>`).join('')}</div>` : ''}
      <div class="detail-name">${escapeHtml(p.name)}</div>
      <div class="detail-record-id mono">REC· ${recordId(p.id)}</div>
      ${contactBits ? `<div class="detail-meta">${contactBits}</div>` : ''}
      <div>${(p.tags || []).map(t => `<span class="tag-chip">${escapeHtml(t)}</span>`).join('')}</div>
      <div class="detail-meta mono">Added ${fmtDate(p.createdAt)} · Updated ${fmtDate(p.updatedAt)}</div>
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
      <button class="btn ghost" id="detail-print">Print</button>
      <button class="btn danger ghost" id="detail-delete">Delete</button>
    </div>
  `;
  detail.classList.add('open');
  document.getElementById('detail-scrim').classList.add('show');

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
  document.getElementById('detail-print').addEventListener('click', () => window.print());
  document.getElementById('detail-delete').addEventListener('click', () => softDeletePerson(p.id));

  refreshSidebar();
}
function closeDetail() {
  selectedId = null;
  document.getElementById('detail').classList.remove('open');
  document.getElementById('detail-scrim').classList.remove('show');
  refreshSidebar();
}
document.getElementById('detail-scrim').addEventListener('click', closeDetail);

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
  setTimeout(() => document.getElementById('field-name').focus(), 50);
}
function blankAvatar() {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><rect width="56" height="56" fill="#0A0E12"/></svg>`);
}
function renderGalleryStrip() {
  document.getElementById('photo-preview').src = pendingPhotos[0] || blankAvatar();
  const strip = document.getElementById('gallery-strip');
  strip.innerHTML = pendingPhotos.map((ph, i) => `
    <div class="gallery-thumb" data-idx="${i}">
      <img src="${ph}">
      <button class="remove-thumb" data-remove="${i}" title="Remove">✕</button>
    </div>`).join('');
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
}

document.getElementById('add-person-btn').addEventListener('click', () => openPersonModal(null));
document.getElementById('photo-input').addEventListener('change', e => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  Promise.all(files.map(file => new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  }))).then(results => {
    pendingPhotos.push(...results);
    renderGalleryStrip();
  });
});

document.getElementById('save-person-btn').addEventListener('click', async () => {
  const name = document.getElementById('field-name').value.trim();
  if (!name) { showToast('Name is required.'); return; }
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
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

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
document.getElementById('wipe-btn').addEventListener('click', async () => {
  if (!confirm('This permanently erases every folder, person, and connection on this device. This cannot be undone. Continue?')) return;
  await clearStore('people'); await clearStore('links'); await clearStore('folders');
  localStorage.removeItem('a404_recent');
  localStorage.removeItem('a404_active_folder');
  people = []; links = []; folders = []; selectedId = null; highlightPath = null;
  closeDetail();
  await ensureFolders();
  renderFolderSwitch();
  refreshSidebar(); renderLegend(); renderRecent(); updateCounts(); updateEmptyState();
  closeModal('settings-modal');
  showToast('All data wiped.');
});

// ---------- Mobile sidebar ----------
document.getElementById('menu-btn').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));

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
  document.getElementById('settings-modal').classList.add('show');
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
});
function maybeShowWhatsNewOnBoot() {
  const seen = localStorage.getItem('a404_seen_version');
  if (seen !== APP_VERSION) {
    renderWhatsNew();
    document.getElementById('whatsnew-modal').classList.add('show');
    localStorage.setItem('a404_seen_version', APP_VERSION);
  }
}

// ---------- Keyboard shortcuts ----------
window.addEventListener('keydown', e => {
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (window.innerWidth <= 760) document.getElementById('sidebar').classList.add('open');
    document.getElementById('search').focus();
    return;
  }
  if (!typing && e.key.toLowerCase() === 'n') {
    e.preventDefault();
    openPersonModal(null);
    return;
  }
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-scrim.show').forEach(m => m.classList.remove('show'));
    if (selectedId) closeDetail();
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
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
