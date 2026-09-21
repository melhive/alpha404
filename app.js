/* Alpha404 — offline relationship graph
   No camera access. No image matching. No facial recognition of any kind. */

const APP_VERSION = '1.1.0';
const CHANGELOG = [
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
const DB_VERSION = 1;
let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('people')) d.createObjectStore('people', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('links')) d.createObjectStore('links', { keyPath: 'id' });
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
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---------- State ----------
let people = [];
let links = [];
let selectedId = null;
let linkMode = false;
let linkModeFirst = null;

const canvas = document.getElementById('graph');
const ctx = canvas.getContext('2d');
let view = { x: 0, y: 0, scale: 1 };
let viewAnim = null; // {fromX,fromY,fromScale,toX,toY,toScale,start,duration}
let dragging = null;
let hoverId = null;

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

// ---------- Load / persist ----------
async function loadAll() {
  people = await getAll('people');
  links = await getAll('links');
  people.forEach(p => {
    if (p.x === undefined) {
      const rect = canvas.parentElement.getBoundingClientRect();
      p.x = rect.width / 2 + (Math.random() - 0.5) * 200;
      p.y = rect.height / 2 + (Math.random() - 0.5) * 200;
      p.vx = 0; p.vy = 0;
    }
  });
  refreshSidebar();
  renderLegend();
  updateCounts();
  updateEmptyState();
}

function updateCounts() {
  document.getElementById('node-count').textContent = people.length;
  document.getElementById('link-count').textContent = links.length;
}
function updateEmptyState() {
  document.getElementById('empty-state').classList.toggle('show', people.length === 0);
}
function renderLegend() {
  const el = document.getElementById('legend');
  const used = new Set(links.map(l => l.type || 'other'));
  if (used.size === 0) { el.innerHTML = ''; return; }
  el.innerHTML = [...used].map(t => {
    const info = LINK_TYPES[t] || LINK_TYPES.other;
    return `<span><span class="dot" style="background:${info.color}"></span>${info.label}</span>`;
  }).join('');
}

// ---------- Physics ----------
function tick() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const cx = rect.width / 2, cy = rect.height / 2;
  for (const p of people) {
    p.vx += (cx - p.x) * 0.0006;
    p.vy += (cy - p.y) * 0.0006;
    for (const q of people) {
      if (p === q) continue;
      let dx = p.x - q.x, dy = p.y - q.y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      if (dist < 160) {
        const force = (160 - dist) * 0.02;
        p.vx += (dx / dist) * force;
        p.vy += (dy / dist) * force;
      }
    }
  }
  for (const l of links) {
    const a = people.find(p => p.id === l.a);
    const b = people.find(p => p.id === l.b);
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
    const force = (dist - 150) * 0.01;
    const fx = (dx / dist) * force, fy = (dy / dist) * force;
    a.vx += fx; a.vy += fy;
    b.vx -= fx; b.vy -= fy;
  }
  for (const p of people) {
    if (dragging && dragging.type === 'node' && dragging.id === p.id) { p.vx = 0; p.vy = 0; continue; }
    p.vx *= 0.85; p.vy *= 0.85;
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

  for (const l of links) {
    const a = people.find(p => p.id === l.a);
    const b = people.find(p => p.id === l.b);
    if (!a || !b) continue;
    const info = LINK_TYPES[l.type] || LINK_TYPES.other;
    let sa = worldToScreen(a.x, a.y), sb = worldToScreen(b.x, b.y);
    const progress = l.createdAt ? Math.min(1, (now - l.createdAt) / 500) : 1;
    if (progress < 1) sb = { x: sa.x + (sb.x - sa.x) * progress, y: sa.y + (sb.y - sa.y) * progress };
    const isHover = hoverId && (l.a === hoverId || l.b === hoverId || l.a === selectedId || l.b === selectedId);
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
    ctx.strokeStyle = isHover ? info.color : hexToRgba(info.color, 0.55);
    ctx.lineWidth = isHover ? 1.8 : 1.1;
    ctx.stroke();

    if (l.label && view.scale > 0.6 && progress >= 1) {
      const mx = (sa.x + sb.x) / 2, my = (sa.y + sb.y) / 2;
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = hexToRgba(mutedColor, 0.9);
      ctx.textAlign = 'center';
      ctx.fillText(l.label, mx, my - 4);
    }
  }

  for (const p of people) {
    const s = worldToScreen(p.x, p.y);
    const baseR = (p.id === selectedId ? 15 : 12) * Math.min(view.scale, 1.4);
    const isHover = hoverId === p.id;

    if (p.id === selectedId) {
      const pulse = 4 + Math.sin(now / 260) * 2.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, baseR + 6 + pulse, 0, Math.PI * 2);
      ctx.strokeStyle = hexToRgba(cyan, 0.35 + 0.15 * Math.sin(now / 260));
      ctx.lineWidth = 1.4;
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
  draw(now || performance.now());
  requestAnimationFrame(loop);
}

function nodeAt(sx, sy) {
  for (let i = people.length - 1; i >= 0; i--) {
    const p = people[i];
    const s = worldToScreen(p.x, p.y);
    const r = (p.id === selectedId ? 15 : 12) * Math.min(view.scale, 1.4);
    if ((s.x - sx) ** 2 + (s.y - sy) ** 2 <= r * r) return p;
  }
  return null;
}

// ---------- Canvas interaction ----------
canvas.addEventListener('mousedown', e => {
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
  const before = screenToWorld(sx, sy);
  view.scale = Math.min(2.2, Math.max(0.35, view.scale * (1 - e.deltaY * 0.001)));
  const after = worldToScreen(before.x, before.y);
  view.x += sx - after.x;
  view.y += sy - after.y;
}, { passive: false });

canvas.addEventListener('touchstart', e => {
  if (e.touches.length !== 1) return;
  const t = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  const sx = t.clientX - rect.left, sy = t.clientY - rect.top;
  const node = nodeAt(sx, sy);
  if (node) dragging = { type: 'node', id: node.id, moved: false };
  else dragging = { type: 'pan', startX: t.clientX, startY: t.clientY, ox: view.x, oy: view.y };
}, { passive: true });
canvas.addEventListener('touchmove', e => {
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
canvas.addEventListener('touchend', () => {
  if (dragging && dragging.type === 'node' && !dragging.moved) handleNodeClick(dragging.id);
  dragging = null;
});

function handleNodeClick(id) {
  if (linkMode) {
    if (!linkModeFirst) { linkModeFirst = id; showToast('Now tap the person to connect them to.'); }
    else if (linkModeFirst !== id) { openLinkModal(linkModeFirst, id); exitLinkMode(); }
    return;
  }
  openDetail(id);
}

document.getElementById('reset-view-btn').addEventListener('click', () => animateViewTo(0, 0, 1));

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
  const sorted = [...people].sort((a, b) => a.name.localeCompare(b.name));
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
  const detail = document.getElementById('detail');
  const conns = links.filter(l => l.a === id || l.b === id).map(l => {
    const otherId = l.a === id ? l.b : l.a;
    const other = people.find(p => p.id === otherId);
    return { other, label: l.label, type: l.type };
  }).filter(c => c.other);

  detail.innerHTML = `
    <div class="detail-head">
      <button class="close-btn" id="detail-close">✕</button>
      ${p.photo ? `<img class="detail-photo" src="${p.photo}">` : `<div class="detail-photo">${initials(p.name)}</div>`}
      <div class="detail-name">${escapeHtml(p.name)}</div>
      <div class="detail-record-id mono">REC· ${recordId(p.id)}</div>
      <div>${(p.tags || []).map(t => `<span class="tag-chip">${escapeHtml(t)}</span>`).join('')}</div>
      <div class="detail-meta mono">Added ${fmtDate(p.createdAt)} · Updated ${fmtDate(p.updatedAt)}</div>
    </div>
    ${p.notes ? `<div class="detail-section"><h4>Notes</h4><div class="notes-text">${escapeHtml(p.notes)}</div></div>` : ''}
    ${p.private ? `
      <div class="detail-section">
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
        </div>`).join('') : `<div style="color:var(--muted);font-size:12.5px">No connections yet. Use Connect on the graph.</div>`}
    </div>
    <div class="detail-actions">
      <button class="btn ghost" id="detail-edit">Edit</button>
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
  document.getElementById('detail-edit').addEventListener('click', () => openPersonModal(p.id));
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

// ---------- Person modal ----------
let editingId = null;
let pendingPhoto = null;

function openPersonModal(id) {
  editingId = id || null;
  pendingPhoto = null;
  const modal = document.getElementById('person-modal');
  document.getElementById('person-modal-title').textContent = id ? 'Edit person' : 'New person';
  document.getElementById('delete-person-btn').style.display = id ? 'inline-block' : 'none';
  const preview = document.getElementById('photo-preview');
  const meta = document.getElementById('field-meta');

  if (id) {
    const p = people.find(p => p.id === id);
    document.getElementById('field-name').value = p.name || '';
    document.getElementById('field-tags').value = (p.tags || []).join(', ');
    document.getElementById('field-notes').value = p.notes || '';
    document.getElementById('field-private').value = p.private || '';
    pendingPhoto = p.photo || null;
    preview.src = p.photo || blankAvatar();
    meta.textContent = `Added ${fmtDate(p.createdAt)} · Updated ${fmtDate(p.updatedAt)}`;
  } else {
    document.getElementById('field-name').value = '';
    document.getElementById('field-tags').value = '';
    document.getElementById('field-notes').value = '';
    document.getElementById('field-private').value = '';
    preview.src = blankAvatar();
    meta.textContent = '';
  }
  document.getElementById('photo-input').value = '';
  modal.classList.add('show');
  setTimeout(() => document.getElementById('field-name').focus(), 50);
}
function blankAvatar() {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><rect width="56" height="56" fill="#0A0E12"/></svg>`);
}

document.getElementById('add-person-btn').addEventListener('click', () => openPersonModal(null));
document.getElementById('photo-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { pendingPhoto = reader.result; document.getElementById('photo-preview').src = pendingPhoto; };
  reader.readAsDataURL(file);
});

document.getElementById('save-person-btn').addEventListener('click', async () => {
  const name = document.getElementById('field-name').value.trim();
  if (!name) { showToast('Name is required.'); return; }
  const tags = document.getElementById('field-tags').value.split(',').map(t => t.trim()).filter(Boolean);
  const notes = document.getElementById('field-notes').value.trim();
  const priv = document.getElementById('field-private').value.trim();

  let p;
  const now = Date.now();
  if (editingId) {
    p = people.find(p => p.id === editingId);
  } else {
    const rect = canvas.parentElement.getBoundingClientRect();
    const w = screenToWorld(rect.width / 2 + (Math.random() - 0.5) * 80, rect.height / 2 + (Math.random() - 0.5) * 80);
    p = { id: uid('p'), x: w.x, y: w.y, vx: 0, vy: 0, createdAt: now };
    people.push(p);
  }
  p.name = name; p.tags = tags; p.notes = notes; p.private = priv; p.photo = pendingPhoto;
  p.updatedAt = now;
  if (!p.createdAt) p.createdAt = now;
  if (p.photo) loadPhotoImg(p); else p.photoImg = null;

  await put('people', stripRuntime(p));
  closeModal('person-modal');
  refreshSidebar();
  updateCounts();
  updateEmptyState();
  showToast(editingId ? 'Saved.' : 'Person added.');
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

  clearTimeout(pendingDelete && pendingDelete.timer);
  if (pendingDelete) finalizeDelete(pendingDelete);
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
  const options = people.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
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
  const existing = links.find(l => (l.a === a && l.b === b) || (l.a === b && l.b === a));
  if (existing) {
    existing.label = label; existing.type = type;
    await put('links', existing);
    showToast('Connection updated.');
  } else {
    const l = { id: uid('l'), a, b, label, type, createdAt: Date.now() };
    links.push(l);
    await put('links', l);
    showToast('Connected.');
  }
  closeModal('link-modal');
  renderLegend();
  updateCounts();
  if (selectedId === a || selectedId === b) openDetail(selectedId);
});

// ---------- Modal helpers ----------
document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => closeModal(btn.dataset.close)));
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

// ---------- Export / Import ----------
document.getElementById('export-btn').addEventListener('click', () => {
  const data = { version: 1, exportedAt: new Date().toISOString(), people: people.map(stripRuntime), links };
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
    await clearStore('people'); await clearStore('links');
    for (const p of data.people) await put('people', p);
    for (const l of data.links) await put('links', l);
    await loadAll();
    people.forEach(p => { if (p.photo) loadPhotoImg(p); });
    showToast('Import complete.');
  } catch (err) { showToast('Could not read that file.'); }
  e.target.value = '';
});

// ---------- Mobile sidebar ----------
document.getElementById('menu-btn').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));

// ---------- Toast (supports an action button, e.g. Undo) ----------
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

// ---------- Settings / PIN lock ----------
function isPinSet() { return !!localStorage.getItem('a404_pin_hash'); }
function updatePinButton() {
  document.getElementById('pin-toggle-btn').textContent = isPinSet() ? 'On' : 'Off';
  document.getElementById('pin-set-wrap').style.display = 'none';
}
document.getElementById('settings-btn').addEventListener('click', () => {
  updatePinButton();
  document.getElementById('settings-modal').classList.add('show');
});
document.getElementById('pin-toggle-btn').addEventListener('click', () => {
  if (isPinSet()) {
    if (confirm('Turn off PIN lock?')) {
      localStorage.removeItem('a404_pin_hash');
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
  }
});

// ---------- Boot sequence ----------
function runBootSequence() {
  return new Promise(resolve => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lines = ['INITIALIZING ALPHA404', 'LOADING LOCAL DATABASE', 'RENDERING GRAPH'];
    const container = document.getElementById('boot-lines');
    if (reduced) {
      document.getElementById('boot-screen').classList.add('fade-out');
      setTimeout(() => { document.getElementById('boot-screen').style.display = 'none'; resolve(); }, 200);
      return;
    }
    container.innerHTML = '';
    lines.forEach((text, i) => {
      const div = document.createElement('div');
      div.className = 'line';
      div.style.animationDelay = (i * 260) + 'ms';
      div.textContent = text + ' …';
      container.appendChild(div);
      setTimeout(() => { div.classList.add('done'); div.innerHTML = text + '<span class="ok">OK</span>'; }, i * 260 + 300);
    });
    setTimeout(() => {
      const screen = document.getElementById('boot-screen');
      screen.classList.add('fade-out');
      setTimeout(() => { screen.style.display = 'none'; resolve(); }, 500);
    }, lines.length * 260 + 350);
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
