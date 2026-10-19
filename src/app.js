// ElecPlan — éditeur (rendu SVG, outils, sélection, panneaux, fichiers, export)
(() => {
'use strict';
const NS = 'http://www.w3.org/2000/svg';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const API = window.api || null;

// ---------- état ----------
let P = newProject();
let LI = 0;                         // niveau courant
let tool = 'select';
let devType = 'prise';
let sel = null;                     // {kind, id}
let draft = null;                   // dessin en cours
let filePath = null, dirty = false;
const hist = new History();
const layers = { bg: true, archi: true, elec: true, gaines: true, dims: true };
const view = { x: -200, y: -200, w: 2400, h: 1500 };
let cursor = [0, 0];
let rotStep = 0;                    // rotation des portes/fenêtres en cours de pose

const svg = $('#cv');
const L = () => P.levels[LI];
const opt = { snap: true, grid: 10, ortho: true, thick: 20 };

// ---------- utilitaires ----------
function toast(msg, ms = 3500) { const s = $('#sMsg'); s.textContent = msg; clearTimeout(toast.t); toast.t = setTimeout(() => s.textContent = '', ms); }
function hint(t) { $('#hint').textContent = t || ''; }
function markDirty() { dirty = true; $('#dirty').hidden = false; try { localStorage.setItem('fpp-autosave', JSON.stringify(P)); } catch {} }
function commit() { hist.push(P); }               // à appeler AVANT une modification
function pxToWorld(px) { const r = svg.getBoundingClientRect(); return px * view.w / Math.max(1, r.width); }
function worldPt(e) { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const q = p.matrixTransform(svg.getScreenCTM().inverse()); return [q.x, q.y]; }
function findById(kind, id) { const arr = L()[kind]; return arr ? arr.find(o => o.id === id) : null; }
function el(tag, attrs = {}, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }

// boîte de dialogue texte (window.prompt n'existe pas dans Electron)
function ask(title, value = '', okLabel = 'OK') {
  return new Promise(res => {
    const d = document.createElement('dialog');
    d.style.cssText = 'border:1px solid #d5dcd8;border-radius:8px;padding:14px;min-width:320px';
    d.innerHTML = `<form method="dialog" style="display:flex;flex-direction:column;gap:8px"><b>${esc(title)}</b><input class="inp" name="v" value="${esc(value)}" autofocus><div class="row" style="justify-content:flex-end"><button class="btn" value="cancel">Annuler</button><button class="btn primary" value="ok">${esc(okLabel)}</button></div></form>`;
    document.body.appendChild(d); d.showModal(); const inp = d.querySelector('input'); inp.select();
    d.addEventListener('close', () => { const v = d.returnValue === 'ok' ? inp.value : null; d.remove(); res(v); });
  });
}
function confirmBox(title, okLabel = 'Confirmer') {
  return new Promise(res => {
    const d = document.createElement('dialog');
    d.style.cssText = 'border:1px solid #d5dcd8;border-radius:8px;padding:14px;min-width:300px';
    d.innerHTML = `<form method="dialog" style="display:flex;flex-direction:column;gap:10px"><b>${esc(title)}</b><div class="row" style="justify-content:flex-end"><button class="btn" value="cancel">Annuler</button><button class="btn danger" value="ok">${esc(okLabel)}</button></div></form>`;
    document.body.appendChild(d); d.showModal(); d.addEventListener('close', () => { const v = d.returnValue === 'ok'; d.remove(); res(v); });
  });
}

// ---------- vue ----------
function applyView() {
  const r = svg.getBoundingClientRect(); if (r.width > 0 && r.height > 0) view.h = view.w * r.height / r.width;
  svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
  const scale = r.width / view.w; $('#sZoom').textContent = Math.round(scale * 100 * 2) + ' %'; // 100 % ≈ 1 px = 2 cm
}
function zoomAt(f, cx, cy) { const nw = Math.max(80, Math.min(40000, view.w / f)); view.x = cx - (cx - view.x) * nw / view.w; view.y = cy - (cy - view.y) * nw / view.w; view.w = nw; applyView(); render(); }
function bounds(lv = L()) {
  let xs = [], ys = [];
  const add = p => { xs.push(p[0]); ys.push(p[1]); };
  lv.walls.forEach(w => w.pts.forEach(add)); lv.rooms.forEach(r => r.pts.forEach(add)); lv.devices.forEach(d => add([d.x, d.y]));
  lv.gaines.forEach(g => (g.pts || []).forEach(add)); lv.openings.forEach(o => add([o.x, o.y])); lv.texts.forEach(t => add([t.x, t.y]));
  lv.dims.forEach(d => { add(d.a); add(d.b); });
  if (lv.background) { const b = lv.background; add([b.x, b.y]); add([b.x + b.w, b.y + b.h]); }
  if (!xs.length) return { x: -200, y: -200, w: 2400, h: 1500 };
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), m = 120;
  return { x: x0 - m, y: y0 - m, w: Math.max(400, x1 - x0 + 2 * m), h: Math.max(300, y1 - y0 + 2 * m) };
}
function fit() { const b = bounds(); const r = svg.getBoundingClientRect(); const ar = r.height / Math.max(1, r.width); let w = b.w, h = w * ar; if (h < b.h) { h = b.h; w = h / ar; } view.x = b.x - (w - b.w) / 2; view.y = b.y - (h - b.h) / 2; view.w = w; applyView(); render(); }

// ---------- accrochage ----------
function snapPt(p, e, from) {
  let q = p.slice();
  const tol = pxToWorld(10);
  // points existants (extrémités et sommets de murs, pièces, appareils)
  let best = null, bd = tol;
  const test = c => { const d = G.dist(c, p); if (d < bd) { bd = d; best = c; } };
  L().walls.forEach(w => w.pts.forEach(test)); L().rooms.forEach(r => r.pts.forEach(test));
  if (draft && draft.pts) draft.pts.forEach(test);
  if (best) return best.slice();
  if (from && opt.ortho && !e.shiftKey) {
    const dx = q[0] - from[0], dy = q[1] - from[1], len = Math.hypot(dx, dy), a = Math.atan2(dy, dx), st = Math.PI / 12;
    const aa = Math.round(a / st) * st; q = [from[0] + Math.cos(aa) * len, from[1] + Math.sin(aa) * len];
    if (opt.snap) { const g = opt.grid; const L2 = Math.round(len / g) * g; q = [from[0] + Math.cos(aa) * L2, from[1] + Math.sin(aa) * L2]; }
    return q.map(v => Math.round(v * 10) / 10);
  }
  if (opt.snap && !e.altKey) { const g = opt.grid; q = q.map(v => Math.round(v / g) * g); }
  return q;
}

// ---------- rendu ----------
let gGrid, gBg, gRooms, gWalls, gOpen, gDims, gTexts, gGaines, gDev, gOver;
function render() {
  svg.innerHTML = '';
  gGrid = el('g', {}, svg); gBg = el('g', {}, svg); gRooms = el('g', {}, svg); gWalls = el('g', {}, svg); gOpen = el('g', {}, svg);
  gDims = el('g', {}, svg); gTexts = el('g', {}, svg); gGaines = el('g', {}, svg); gDev = el('g', {}, svg); gOver = el('g', {}, svg);
  drawGrid();
  const lv = L(), s = P.settings.symbol || 1;
  if (layers.bg && lv.background) { const b = lv.background; el('image', { href: b.src, x: b.x, y: b.y, width: b.w, height: b.h, opacity: b.opacity ?? 0.5, preserveAspectRatio: 'none', 'data-k': 'bg' }, gBg); }
  if (layers.archi) {
    lv.rooms.forEach(r => {
      el('polygon', { points: r.pts.map(p => p.join(',')).join(' '), class: 'g-room', fill: r.color || '', 'data-k': 'rooms', 'data-id': r.id }, gRooms);
      const c = r.label ? r.label : G.centroid(r.pts);
      const t = el('text', { x: c[0], y: c[1], class: 'g-roomlab', 'font-size': 14 * s }, gRooms); t.textContent = r.name || '';
      const a = el('text', { x: c[0], y: c[1] + 16 * s, class: 'g-roomarea', 'font-size': 11 * s }, gRooms); a.textContent = (G.polyArea(r.pts) / 10000).toFixed(2).replace('.', ',') + ' m²';
    });
    lv.walls.forEach(w => {
      el('polyline', { points: w.pts.map(p => p.join(',')).join(' '), fill: 'none', stroke: '#2b3330', 'stroke-width': w.thick, 'stroke-linejoin': 'miter', 'stroke-linecap': 'square', 'data-k': 'walls', 'data-id': w.id }, gWalls);
    });
    lv.openings.forEach(o => drawOpening(o, gOpen));
    lv.texts.forEach(t => { const e = el('text', { x: t.x, y: t.y, 'font-size': t.size || 18, 'font-family': 'Inter, DejaVu Sans, sans-serif', fill: '#17201d', 'data-k': 'texts', 'data-id': t.id }, gTexts); e.textContent = t.text; });
  }
  if (layers.dims) lv.dims.forEach(d => drawDim(d, gDims));
  if (layers.gaines) lv.gaines.forEach(g => drawGaine(g, gGaines));
  if (layers.elec) lv.devices.forEach(d => {
    const g = el('g', { transform: `translate(${d.x},${d.y}) rotate(${d.rot || 0})`, 'data-k': 'devices', 'data-id': d.id, style: 'cursor:pointer' }, gDev);
    g.innerHTML = deviceSymbol(d.type, s * 1.0);
    const t = el('text', { x: 17 * s, y: -10 * s, 'font-size': 10 * s, 'font-family': 'DejaVu Sans Mono, monospace', 'font-weight': 700, fill: '#17201d', transform: `rotate(${-(d.rot || 0)})`, 'paint-order': 'stroke', stroke: '#fff', 'stroke-width': 3 * s }, g);
    t.textContent = d.ref || '';
  });
  drawSelection(); drawDraft(); renderProps(); renderNomen();
}
function drawGrid() {
  const g = opt.grid, step = g * Math.max(1, Math.pow(2, Math.ceil(Math.log2(pxToWorld(14) / g))));
  const x0 = Math.floor(view.x / step) * step, y0 = Math.floor(view.y / step) * step;
  if (view.w / step > 400) return;
  for (let x = x0; x < view.x + view.w; x += step) el('line', { x1: x, y1: view.y, x2: x, y2: view.y + view.h, class: 'gridline' + (Math.round(x / step) % 5 === 0 ? ' major' : '') }, gGrid);
  for (let y = y0; y < view.y + view.h; y += step) el('line', { x1: view.x, y1: y, x2: view.x + view.w, y2: y, class: 'gridline' + (Math.round(y / step) % 5 === 0 ? ' major' : '') }, gGrid);
}
function drawOpening(o, parent, preview) {
  const g = el('g', { transform: `translate(${o.x},${o.y}) rotate(${o.angle || 0})`, 'data-k': 'openings', 'data-id': o.id || '' }, parent);
  const w = o.w, t = (o.thick || 20) + 2, half = w / 2;
  el('rect', { x: -half, y: -t / 2, width: w, height: t, fill: preview ? 'rgba(232,87,42,.15)' : '#fbfcfb' }, g);
  if (o.type === 'door') {
    const fx = o.flip ? -1 : 1, fy = o.side ? -1 : 1;
    el('line', { x1: -half * fx, y1: 0, x2: -half * fx, y2: -w * fy, stroke: '#17201d', 'stroke-width': 2 }, g);
    el('path', { d: `M${-half * fx} ${-w * fy} A${w} ${w} 0 0 ${fx * fy > 0 ? 1 : 0} ${half * fx} 0`, fill: 'none', stroke: '#17201d', 'stroke-width': 1, 'stroke-dasharray': '4 3' }, g);
    el('line', { x1: -half, y1: -t / 2, x2: -half, y2: t / 2, stroke: '#17201d', 'stroke-width': 2 }, g);
    el('line', { x1: half, y1: -t / 2, x2: half, y2: t / 2, stroke: '#17201d', 'stroke-width': 2 }, g);
  } else {
    el('rect', { x: -half, y: -t / 2, width: w, height: t, fill: 'none', stroke: '#17201d', 'stroke-width': 1.5 }, g);
    el('line', { x1: -half, y1: 0, x2: half, y2: 0, stroke: '#17201d', 'stroke-width': 1.2 }, g);
    el('line', { x1: -half, y1: -t / 6, x2: half, y2: -t / 6, stroke: '#17201d', 'stroke-width': .8 }, g);
  }
  return g;
}
function drawDim(d, parent) {
  const [a, b] = [d.a, d.b], L2 = G.dist(a, b) || 1, nx = -(b[1] - a[1]) / L2, ny = (b[0] - a[0]) / L2, o = d.offset ?? 40;
  const A = [a[0] + nx * o, a[1] + ny * o], B = [b[0] + nx * o, b[1] + ny * o];
  const g = el('g', { 'data-k': 'dims', 'data-id': d.id || '' }, parent);
  el('line', { x1: a[0], y1: a[1], x2: A[0] + nx * 8, y2: A[1] + ny * 8, class: 'g-dim' }, g);
  el('line', { x1: b[0], y1: b[1], x2: B[0] + nx * 8, y2: B[1] + ny * 8, class: 'g-dim' }, g);
  el('line', { x1: A[0], y1: A[1], x2: B[0], y2: B[1], class: 'g-dim' }, g);
  const tk = 6; [A, B].forEach(P_ => el('line', { x1: P_[0] - (nx + ny * -1) * tk, y1: P_[1] - (ny - nx * -1) * tk, x2: P_[0] + (nx + ny * -1) * tk, y2: P_[1] + (ny - nx * -1) * tk, class: 'g-dim', 'stroke-width': 1.6 }, g));
  let ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI; if (ang > 90 || ang < -90) ang += 180;
  const mx = (A[0] + B[0]) / 2 + nx * 10, my = (A[1] + B[1]) / 2 + ny * 10;
  const t = el('text', { x: mx, y: my, class: 'g-dimt', transform: `rotate(${ang} ${mx} ${my})`, 'font-size': 13 * (P.settings.symbol || 1) }, g); t.textContent = G.fmtM(L2);
  el('line', { x1: A[0], y1: A[1], x2: B[0], y2: B[1], class: 'g-hit', 'data-k': 'dims', 'data-id': d.id || '' }, g);
}
function gainePts(g) {
  const a = L().devices.find(d => d.id === g.a), b = L().devices.find(d => d.id === g.b);
  return [a ? [a.x, a.y] : null, ...(g.pts || []), b ? [b.x, b.y] : null].filter(Boolean);
}
function drawGaine(g, parent) {
  const pts = gainePts(g); if (pts.length < 2) return;
  const k = GAINE_KINDS[g.kind] || GAINE_KINDS.pwr, d = 'M' + pts.map(p => p.join(' ')).join(' L');
  el('path', { d, class: 'g-gaine', stroke: k.color, 'stroke-dasharray': k.dash, 'stroke-width': 2.4 }, parent);
  el('path', { d, class: 'g-hit', 'data-k': 'gaines', 'data-id': g.id }, parent);
  // étiquette au milieu du plus long tronçon
  let bi = 0, bl = -1; for (let i = 0; i < pts.length - 1; i++) { const l = G.dist(pts[i], pts[i + 1]); if (l > bl) { bl = l; bi = i; } }
  const m = [(pts[bi][0] + pts[bi + 1][0]) / 2, (pts[bi][1] + pts[bi + 1][1]) / 2], s = P.settings.symbol || 1, w = (String(g.num).length * 7 + 8) * s;
  const lg = el('g', { transform: `translate(${m[0]},${m[1]})`, 'data-k': 'gaines', 'data-id': g.id, style: 'cursor:pointer' }, parent);
  el('rect', { x: -w / 2, y: -8 * s, width: w, height: 16 * s, rx: 3 * s, fill: '#fff', stroke: k.color, 'stroke-width': 1.2 * s }, lg);
  const t = el('text', { y: 3.6 * s, 'text-anchor': 'middle', 'font-family': 'DejaVu Sans Mono, monospace', 'font-weight': 700, 'font-size': 10 * s, fill: k.color }, lg); t.textContent = g.num;
}
function selShape() {
  if (!sel) return null;
  const lv = L(), o = (lv[sel.kind] || []).find(x => x.id === sel.id); if (!o) return null;
  if (sel.kind === 'walls' || sel.kind === 'rooms') return { pts: o.pts, closed: sel.kind === 'rooms' };
  if (sel.kind === 'gaines') return { pts: gainePts(o), closed: false, inner: true };
  if (sel.kind === 'dims') return { pts: [o.a, o.b], closed: false };
  return { box: [o.x, o.y] };
}
function drawSelection() {
  const sh = selShape(); if (!sh) return; const hs = pxToWorld(5);
  if (sh.box) { const r = pxToWorld(20); el('rect', { x: sh.box[0] - r, y: sh.box[1] - r, width: 2 * r, height: 2 * r, class: 'sel-outline', rx: 3 }, gOver); return; }
  el(sh.closed ? 'polygon' : 'polyline', { points: sh.pts.map(p => p.join(',')).join(' '), class: 'sel-outline' }, gOver);
  sh.pts.forEach((p, i) => { if (sh.inner && (i === 0 || i === sh.pts.length - 1)) return; el('rect', { x: p[0] - hs, y: p[1] - hs, width: 2 * hs, height: 2 * hs, class: 'handle', 'data-h': i }, gOver); });
}
function drawDraft() {
  if (!draft) return;
  const c = draft.cur || cursor;
  if (draft.pts) {
    const pts = draft.pts.concat([c]);
    if (tool === 'wall') el('polyline', { points: pts.map(p => p.join(',')).join(' '), fill: 'none', stroke: 'rgba(232,87,42,.35)', 'stroke-width': opt.thick, 'stroke-linejoin': 'miter' }, gOver);
    el(tool === 'room' ? 'polygon' : 'polyline', { points: pts.map(p => p.join(',')).join(' '), class: 'preview' }, gOver);
    if (pts.length >= 2) { const a = pts[pts.length - 2]; const t = el('text', { x: c[0] + pxToWorld(10), y: c[1] - pxToWorld(10), 'font-size': pxToWorld(12), 'font-family': 'DejaVu Sans Mono, monospace', fill: '#e8572a' }, gOver); t.textContent = G.fmtM(G.dist(a, c)) + ' m'; }
  }
  if (draft.ghost) drawOpening(draft.ghost, gOver, true);
}

// ---------- tests de sélection ----------
function hitTest(p) {
  const lv = L(), tol = pxToWorld(8), s = P.settings.symbol || 1;
  if (layers.elec) for (let i = lv.devices.length - 1; i >= 0; i--) { const d = lv.devices[i]; if (G.dist(p, [d.x, d.y]) < 18 * s + tol) return { kind: 'devices', id: d.id }; }
  if (layers.gaines) for (const g of lv.gaines) { if (G.polyDist(p, gainePts(g), false).d < tol) return { kind: 'gaines', id: g.id }; }
  if (layers.archi) {
    for (const o of lv.openings) { if (G.dist(p, [o.x, o.y]) < o.w / 2 + tol) return { kind: 'openings', id: o.id }; }
    for (const t of lv.texts) { if (Math.abs(p[0] - t.x - (t.text.length * (t.size || 18) * .28)) < t.text.length * (t.size || 18) * .3 + tol && Math.abs(p[1] - t.y + (t.size || 18) * .35) < (t.size || 18) * .6) return { kind: 'texts', id: t.id }; }
  }
  if (layers.dims) for (const d of lv.dims) { const o = d.offset ?? 40, L2 = G.dist(d.a, d.b) || 1, nx = -(d.b[1] - d.a[1]) / L2 * o, ny = (d.b[0] - d.a[0]) / L2 * o; if (G.segDist(p, [d.a[0] + nx, d.a[1] + ny], [d.b[0] + nx, d.b[1] + ny]).d < tol) return { kind: 'dims', id: d.id }; }
  if (layers.archi) {
    for (const w of lv.walls) { if (G.polyDist(p, w.pts, false).d < w.thick / 2 + tol) return { kind: 'walls', id: w.id }; }
    for (let i = lv.rooms.length - 1; i >= 0; i--) { if (G.inPoly(p, lv.rooms[i].pts)) return { kind: 'rooms', id: lv.rooms[i].id }; }
  }
  return null;
}
function deviceAt(p) { const s = P.settings.symbol || 1; let best = null, bd = 22 * s + pxToWorld(8); for (const d of L().devices) { const r = G.dist(p, [d.x, d.y]); if (r < bd) { bd = r; best = d; } } return best; }
function nearestWall(p) { let best = null; for (const w of L().walls) { const r = G.polyDist(p, w.pts, false); if (!best || r.d < best.r.d) best = { w, r }; } return best && best.r.d < Math.max(40, pxToWorld(25)) ? best : null; }

// ---------- outils ----------
function setTool(t) {
  if (draft && draft.pts && draft.pts.length >= (tool === 'room' ? 3 : 2) && (tool === 'wall' || tool === 'room')) finishPoly();
  tool = t; draft = null; rotStep = 0;
  $$('#tools button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
  const H = { select: 'Clic : sélectionner · glisser : déplacer · Suppr : effacer · Ctrl+D : dupliquer', pan: 'Glisser pour déplacer la vue · molette : zoom',
    wall: 'Clics successifs · double-clic ou Entrée : terminer · Échap : annuler · Maj : angle libre', room: 'Clics sur les angles · double-clic ou Entrée : fermer la pièce',
    door: 'Clic sur un mur pour poser la porte · R : tourner le battant · Maj+R : inverser', window: 'Clic sur un mur pour poser la fenêtre',
    dim: 'Clic sur le premier point, puis le second', text: 'Clic pour placer un texte', device: 'Type : « ' + (DT[devType] || {}).label + ' » (onglet Appareils) · clic pour placer',
    gaine: 'Clic sur l\'appareil de départ, clics pour les coudes, clic sur l\'appareil d\'arrivée', calib: 'Clic sur 2 points du fond de plan dont tu connais la distance' };
  hint(H[t]); svg.style.cursor = t === 'pan' ? 'grab' : t === 'select' ? 'default' : 'crosshair';
  render();
}
function finishPoly() {
  const pts = draft.pts;
  if (tool === 'wall' && pts.length >= 2) { commit(); L().walls.push({ id: uid('w'), pts, thick: opt.thick }); markDirty(); }
  if (tool === 'room' && pts.length >= 3) { commit(); const r = { id: uid('r'), name: 'Pièce ' + (L().rooms.length + 1), pts }; L().rooms.push(r); sel = { kind: 'rooms', id: r.id }; markDirty(); }
  draft = null; render();
}

// ---------- événements souris ----------
let drag = null, panning = null, spaceDown = false;
svg.addEventListener('pointerdown', async e => {
  svg.setPointerCapture(e.pointerId);
  const p = worldPt(e);
  if (e.button === 1 || tool === 'pan' || spaceDown) { panning = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; svg.style.cursor = 'grabbing'; return; }
  if (e.button !== 0) return;
  // poignées de sommet
  const h = e.target.closest && e.target.closest('.handle');
  if (h && sel) { commit(); drag = { kind: 'vertex', i: +h.dataset.h, moved: false }; return; }
  if (tool === 'select') {
    const hit = hitTest(p); sel = hit;
    if (hit) { commit(); drag = { kind: 'move', start: p, last: p, moved: false }; }
    render(); return;
  }
  if (tool === 'wall' || tool === 'room') {
    const from = draft && draft.pts.length ? draft.pts[draft.pts.length - 1] : null;
    const q = snapPt(p, e, from);
    if (!draft) draft = { pts: [q] };
    else {
      const first = draft.pts[0];
      if (draft.pts.length >= (tool === 'room' ? 3 : 2) && G.dist(q, first) < pxToWorld(10)) { if (tool === 'wall') draft.pts.push(first.slice()); finishPoly(); return; }
      if (!from || G.dist(q, from) > 0.5) draft.pts.push(q);
    }
    render(); return;
  }
  if (tool === 'door' || tool === 'window') {
    const g = ghostOpening(p, e); commit();
    L().openings.push(Object.assign(g, { id: uid('o') })); markDirty(); render(); return;
  }
  if (tool === 'dim') {
    const q = snapPt(p, e, draft && draft.pts ? draft.pts[0] : null);
    if (!draft) { draft = { pts: [q] }; render(); return; }
    commit(); L().dims.push({ id: uid('d'), a: draft.pts[0], b: q, offset: 40 }); draft = null; markDirty(); render(); return;
  }
  if (tool === 'text') {
    const q = snapPt(p, e); const t = await ask('Texte', ''); if (!t) return;
    commit(); L().texts.push({ id: uid('t'), x: q[0], y: q[1], text: t, size: 18 }); markDirty(); render(); return;
  }
  if (tool === 'device') {
    const q = snapPt(p, e); const T = DT[devType]; commit();
    const d = { id: uid('e'), type: devType, ref: nextRef(P, T.prefix), x: q[0], y: q[1], rot: 0, label: T.label, circuit: '', mode: T.mode || '', height: '', note: '' };
    L().devices.push(d); sel = { kind: 'devices', id: d.id }; markDirty(); render(); return;
  }
  if (tool === 'gaine') {
    const d = deviceAt(p);
    if (!draft) { if (!d) { toast('Commence la gaine sur un appareil.'); return; } draft = { a: d.id, pts: [], gaine: true }; render(); return; }
    if (d && d.id !== draft.a) { commit(); const g = { id: uid('g'), num: nextGaineNum(P), a: draft.a, b: d.id, pts: draft.pts, kind: 'pwr', tube: 'ICTA Ø25', content: '' }; L().gaines.push(g); sel = { kind: 'gaines', id: g.id }; draft = null; markDirty(); render(); return; }
    draft.pts.push(snapPt(p, e)); render(); return;
  }
  if (tool === 'calib') {
    if (!L().background) { toast('Importe d\'abord un fond de plan.'); return; }
    if (!draft) { draft = { pts: [p] }; render(); return; }
    const a = draft.pts[0], measured = G.dist(a, p); draft = null; render();
    const v = await ask('Distance réelle entre les 2 points (en mètres)', '5,00'); if (!v) return;
    const real = parseFloat(v.replace(',', '.')) * 100; if (!(real > 0) || !(measured > 0)) return;
    commit(); const b = L().background, f = real / measured; b.x = a[0] + (b.x - a[0]) * f; b.y = a[1] + (b.y - a[1]) * f; b.w *= f; b.h *= f; markDirty(); fit(); toast('Fond mis à l\'échelle.'); return;
  }
});
svg.addEventListener('pointermove', e => {
  const p = worldPt(e); cursor = p;
  $('#sCoord').textContent = `x ${G.fmtM(p[0])} · y ${G.fmtM(p[1])} m`;
  if (panning) { const r = svg.getBoundingClientRect(), k = view.w / r.width; view.x = panning.vx - (e.clientX - panning.x) * k; view.y = panning.vy - (e.clientY - panning.y) * k; applyView(); render(); return; }
  if (drag && sel) {
    const lv = L(), o = (lv[sel.kind] || []).find(x => x.id === sel.id); if (!o) return;
    if (drag.kind === 'vertex') {
      const q = snapPt(p, e); drag.moved = true;
      if (sel.kind === 'walls' || sel.kind === 'rooms') o.pts[drag.i] = q;
      else if (sel.kind === 'dims') { if (drag.i === 0) o.a = q; else o.b = q; }
      else if (sel.kind === 'gaines') o.pts[drag.i - 1] = q;
      render(); return;
    }
    if (drag.kind === 'move') {
      let d = [p[0] - drag.last[0], p[1] - drag.last[1]];
      if (opt.snap && !e.altKey) { const g = opt.grid; const tot = [p[0] - drag.start[0], p[1] - drag.start[1]].map(v => Math.round(v / g) * g); const done = [drag.last[0] - drag.start[0], drag.last[1] - drag.start[1]]; d = [tot[0] - done[0], tot[1] - done[1]]; drag.last = [drag.start[0] + tot[0], drag.start[1] + tot[1]]; }
      else drag.last = p;
      if (!d[0] && !d[1]) return; drag.moved = true;
      const mv = q => { q[0] += d[0]; q[1] += d[1]; };
      if (o.pts && sel.kind !== 'gaines') o.pts.forEach(mv);
      else if (sel.kind === 'gaines') (o.pts || []).forEach(mv);
      else if (sel.kind === 'dims') { mv(o.a); mv(o.b); }
      else { o.x += d[0]; o.y += d[1]; }
      if (o.label && sel.kind === 'rooms') mv(o.label);
      render(); return;
    }
  }
  if (tool === 'wall' || tool === 'room' || tool === 'dim') { if (draft) { const from = draft.pts[draft.pts.length - 1]; draft.cur = snapPt(p, e, from); render(); } return; }
  if (tool === 'gaine' && draft) { draft.cur = snapPt(p, e); renderGaineDraft(); return; }
  if (tool === 'calib' && draft) { draft.cur = p; render(); return; }
  if (tool === 'door' || tool === 'window') { draft = { ghost: ghostOpening(p, e) }; gOver.innerHTML = ''; drawSelection(); drawOpening(draft.ghost, gOver, true); }
});
function renderGaineDraft() {
  gOver.innerHTML = ''; drawSelection();
  const a = L().devices.find(d => d.id === draft.a); if (!a) return;
  const pts = [[a.x, a.y], ...draft.pts, draft.cur || cursor];
  el('polyline', { points: pts.map(p => p.join(',')).join(' '), class: 'preview' }, gOver);
}
svg.addEventListener('pointerup', e => {
  if (panning) { panning = null; svg.style.cursor = tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : 'crosshair'; return; }
  if (drag) { if (drag.moved) markDirty(); else hist.u.pop(); drag = null; render(); }
});
svg.addEventListener('dblclick', e => {
  if ((tool === 'wall' || tool === 'room') && draft) { finishPoly(); return; }
  if (tool !== 'select') return;
  const h = e.target.closest && e.target.closest('.handle');
  if (h && sel) { // double-clic sur un sommet / coude : le retirer
    const o = (L()[sel.kind] || []).find(x => x.id === sel.id), i = +h.dataset.h; if (!o) return;
    if (sel.kind === 'gaines') { commit(); o.pts.splice(i - 1, 1); markDirty(); render(); }
    else if ((sel.kind === 'walls' && o.pts.length > 2) || (sel.kind === 'rooms' && o.pts.length > 3)) { commit(); o.pts.splice(i, 1); markDirty(); render(); }
    return; }
  const hit = hitTest(worldPt(e));
  if (hit && hit.kind === 'texts') editText(hit.id);
  if (hit && (hit.kind === 'gaines' || hit.kind === 'walls')) { // double-clic sur un tronçon : ajouter un coude / sommet
    const o = findById(hit.kind, hit.id), p = snapPt(worldPt(e), e);
    if (hit.kind === 'gaines') { const pts = gainePts(o), r = G.polyDist(p, pts, false); commit(); o.pts.splice(r.i, 0, p); }
    else { const r = G.polyDist(p, o.pts, false); commit(); o.pts.splice(r.i + 1, 0, p); }
    sel = hit; markDirty(); render(); }
});
svg.addEventListener('wheel', e => { e.preventDefault(); const p = worldPt(e); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, p[0], p[1]); }, { passive: false });
svg.addEventListener('contextmenu', e => { e.preventDefault(); if (draft) { if ((tool === 'wall' || tool === 'room') && draft.pts && draft.pts.length >= 2) finishPoly(); else { draft = null; render(); } } });

function ghostOpening(p, e) {
  const type = tool === 'door' ? 'door' : 'window';
  const nw = nearestWall(p); let x = p[0], y = p[1], angle = 0, thick = opt.thick;
  if (nw) { const w = nw.w, i = nw.r.i, a = w.pts[i], b = w.pts[i + 1]; x = nw.r.x; y = nw.r.y; angle = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI; thick = w.thick;
    if (opt.snap) { const L2 = G.dist(a, b), along = Math.round(nw.r.t * L2 / 5) * 5; x = a[0] + (b[0] - a[0]) * along / L2; y = a[1] + (b[1] - a[1]) * along / L2; } }
  angle += rotStep * 180;
  return { type, x, y, angle, w: type === 'door' ? 83 : 120, thick, flip: !!(rotStep & 2), side: false };
}
async function editText(id) { const t = findById('texts', id); if (!t) return; const v = await ask('Texte', t.text); if (v == null) return; commit(); t.text = v; markDirty(); render(); }

// ---------- clavier ----------
document.addEventListener('keydown', e => {
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || document.querySelector('dialog[open]')) return;
  const k = e.key.toLowerCase();
  if (e.code === 'Space') { spaceDown = true; svg.style.cursor = 'grab'; e.preventDefault(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); save(e.shiftKey); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'o') { e.preventDefault(); openFile(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'p') { e.preventDefault(); exportPDF(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); duplicateSel(); return; }
  if (e.key === 'Escape') { if (draft) { draft = null; render(); } else if (sel) { sel = null; render(); } else setTool('select'); return; }
  if (e.key === 'Enter') { if ((tool === 'wall' || tool === 'room') && draft) finishPoly(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { deleteSel(); return; }
  if (k === 'r' && (tool === 'door' || tool === 'window')) { rotStep = e.shiftKey ? (rotStep ^ 2) : ((rotStep & 2) | ((rotStep & 1) ^ 1)); draft = { ghost: ghostOpening(cursor, e) }; render(); return; }
  if (k === 'r' && sel && sel.kind === 'devices') { commit(); const d = findById('devices', sel.id); d.rot = ((d.rot || 0) + 90) % 360; markDirty(); render(); return; }
  if (e.key.startsWith('Arrow') && sel) { e.preventDefault(); const st = e.shiftKey ? 50 : opt.grid; const d = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[e.key]; nudge(d); return; }
  const map = { v: 'select', h: 'pan', w: 'wall', r: 'room', d: 'door', f: 'window', c: 'dim', t: 'text', e: 'device', g: 'gaine' };
  if (!e.ctrlKey && !e.metaKey && !e.altKey && map[k]) setTool(map[k]);
});
document.addEventListener('keyup', e => { if (e.code === 'Space') { spaceDown = false; setTool(tool); } });
function nudge(d) { const o = (L()[sel.kind] || []).find(x => x.id === sel.id); if (!o) return; commit(); const mv = q => { q[0] += d[0]; q[1] += d[1]; };
  if (sel.kind === 'dims') { mv(o.a); mv(o.b); } else if (o.pts) o.pts.forEach(mv); else { o.x += d[0]; o.y += d[1]; } markDirty(); render(); }
function deleteSel() {
  if (!sel) return; const lv = L(); commit();
  lv[sel.kind] = lv[sel.kind].filter(o => o.id !== sel.id);
  if (sel.kind === 'devices') { const n = lv.gaines.length; lv.gaines = lv.gaines.filter(g => g.a !== sel.id && g.b !== sel.id); if (n !== lv.gaines.length) toast((n - lv.gaines.length) + ' gaine(s) reliée(s) supprimée(s).'); }
  sel = null; markDirty(); render();
}
function duplicateSel() {
  if (!sel) return; const lv = L(), o = (lv[sel.kind] || []).find(x => x.id === sel.id); if (!o || sel.kind === 'gaines') return;
  commit(); const c = JSON.parse(JSON.stringify(o)); c.id = uid(sel.kind[0]); const off = 50, mv = q => { q[0] += off; q[1] += off; };
  if (c.pts) c.pts.forEach(mv); else if (c.a) { mv(c.a); mv(c.b); } else { c.x += off; c.y += off; }
  if (sel.kind === 'devices') c.ref = nextRef(P, DT[c.type].prefix);
  lv[sel.kind].push(c); sel = { kind: sel.kind, id: c.id }; markDirty(); render();
}
function undo() { const s = hist.undo(P); if (!s) return; P = s; if (LI >= P.levels.length) LI = 0; sel = null; draft = null; markDirty(); renderLevels(); render(); }
function redo() { const s = hist.redo(P); if (!s) return; P = s; sel = null; markDirty(); renderLevels(); render(); }

// ---------- niveaux ----------
function renderLevels() {
  const box = $('#levels'); box.innerHTML = '';
  P.levels.forEach((lv, i) => { const b = document.createElement('button'); b.textContent = lv.name; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(i === LI)); b.title = 'Double-clic : renommer';
    b.onclick = () => { LI = i; sel = null; draft = null; renderLevels(); render(); };
    b.ondblclick = async () => { const v = await ask('Nom du niveau', lv.name); if (v) { commit(); lv.name = v; markDirty(); renderLevels(); } };
    box.appendChild(b); });
  const add = document.createElement('button'); add.className = 'add'; add.textContent = '+ Niveau'; add.onclick = async () => { const v = await ask('Nom du nouveau niveau', 'Étage ' + P.levels.length); if (!v) return; commit(); P.levels.push(newLevel(v, P.levels.length * 300)); LI = P.levels.length - 1; markDirty(); renderLevels(); render(); };
  box.appendChild(add);
}

// ---------- panneau Propriétés ----------
function field(label, html) { return `<label class="field"><span class="muted">${esc(label)}</span>${html}</label>`; }
function renderProps() {
  const box = $('#tab-props'); const lv = L();
  if (!sel) {
    const st = { walls: lv.walls.length, rooms: lv.rooms.length, openings: lv.openings.length, devices: lv.devices.length, gaines: lv.gaines.length };
    box.innerHTML = `<span class="lbl">Niveau</span><h3>${esc(lv.name)}</h3>
      ${field('Nom', `<input data-lv="name" value="${esc(lv.name)}">`)}
      ${field('Altitude (cm)', `<input data-lv="elevation" type="number" value="${lv.elevation || 0}">`)}
      <p class="muted">${st.walls} murs · ${st.rooms} pièces · ${st.openings} ouvertures · ${st.devices} appareils · ${st.gaines} gaines</p>
      ${lv.background ? `<div class="card"><span class="lbl">Fond de plan</span>${field('Opacité', `<input data-bg="opacity" type="range" min="0.05" max="1" step="0.05" value="${lv.background.opacity ?? .5}">`)}<div class="row"><button class="btn" data-act="calib">Mettre à l'échelle</button><button class="btn danger" data-act="bgdel">Retirer</button></div></div>` : `<button class="btn" data-act="bg">Importer un fond de plan (image ou PDF)</button>`}
      <div class="card"><span class="lbl">Symboles</span>${field('Taille', `<input data-set="symbol" type="range" min="0.5" max="4" step="0.1" value="${P.settings.symbol || 2}">`)}</div>
      <div class="card"><span class="lbl">Circuits du projet</span>${circuitsTable()}<button class="btn" data-act="addcirc">+ Circuit</button></div>
      <p class="muted">Raccourcis : V sélection · W mur · R pièce · D porte · F fenêtre · C cote · T texte · E appareil · G gaine · Espace + glisser : vue · Ctrl+Z / Ctrl+Maj+Z</p>`;
  } else {
    const o = (lv[sel.kind] || []).find(x => x.id === sel.id); if (!o) { sel = null; return renderProps(); }
    let h = '';
    if (sel.kind === 'walls') { const len = o.pts.slice(1).reduce((s, p, i) => s + G.dist(o.pts[i], p), 0); h = `<span class="lbl">Mur</span><h3>${G.fmtM(len)} m</h3>${field('Épaisseur (cm)', `<input data-p="thick" type="number" value="${o.thick}">`)}<p class="muted">${o.pts.length} points. Glisse les poignées pour modifier.</p>`; }
    if (sel.kind === 'rooms') h = `<span class="lbl">Pièce</span><h3>${esc(o.name)}</h3>${field('Nom', `<input data-p="name" value="${esc(o.name)}">`)}${field('Couleur', `<input data-p="color" type="color" value="${o.color || '#f3efe4'}">`)}<p class="muted">Surface ${(G.polyArea(o.pts) / 10000).toFixed(2).replace('.', ',')} m² · périmètre ${G.fmtM(o.pts.reduce((s, p, i) => s + G.dist(p, o.pts[(i + 1) % o.pts.length]), 0))} m</p>`;
    if (sel.kind === 'openings') h = `<span class="lbl">${o.type === 'door' ? 'Porte' : 'Fenêtre'}</span>${field('Largeur (cm)', `<input data-p="w" type="number" value="${o.w}">`)}${field('Angle (°)', `<input data-p="angle" type="number" value="${Math.round(o.angle || 0)}">`)}${o.type === 'door' ? field('Battant', `<select data-p="flip"><option value="">Gauche</option><option value="1" ${o.flip ? 'selected' : ''}>Droite</option></select>`) + field('Ouverture', `<select data-p="side"><option value="">Côté 1</option><option value="1" ${o.side ? 'selected' : ''}>Côté 2</option></select>`) : ''}`;
    if (sel.kind === 'dims') h = `<span class="lbl">Cote</span><h3>${G.fmtM(G.dist(o.a, o.b))} m</h3>${field('Décalage (cm)', `<input data-p="offset" type="number" value="${o.offset ?? 40}">`)}`;
    if (sel.kind === 'texts') h = `<span class="lbl">Texte</span>${field('Texte', `<input data-p="text" value="${esc(o.text)}">`)}${field('Taille', `<input data-p="size" type="number" value="${o.size || 18}">`)}`;
    if (sel.kind === 'devices') {
      const T = DT[o.type] || {};
      h = `<span class="lbl">${esc(T.label || o.type)}</span><h3>${esc(o.ref)}</h3>
        ${field('Repère', `<input data-p="ref" value="${esc(o.ref)}">`)}
        ${field('Type', `<select data-p="type">${DEVICE_TYPES.map(d => `<option value="${d.type}" ${d.type === o.type ? 'selected' : ''}>${esc(d.label)}</option>`).join('')}</select>`)}
        ${field('Désignation', `<input data-p="label" value="${esc(o.label || '')}">`)}
        ${field('Circuit', `<select data-p="circuit"><option value="">—</option>${P.circuits.map(c => `<option value="${c.id}" ${c.id === o.circuit ? 'selected' : ''}>${esc(c.name)} (${esc(c.cal)})</option>`).join('')}</select>`)}
        ${field('Mode', `<select data-p="mode">${['', 'S', 'VV', 'VV maître', 'VV esclave', 'ON', 'DM', 'DM/ON', 'BP'].map(m => `<option ${m === (o.mode || '') ? 'selected' : ''}>${m}</option>`).join('')}</select>`)}
        ${field('Hauteur (cm)', `<input data-p="height" value="${esc(o.height || '')}">`)}
        ${field('Note', `<textarea data-p="note">${esc(o.note || '')}</textarea>`)}
        <p class="muted">R : tourner de 90°. Liaisons : ${lv.gaines.filter(g => g.a === o.id || g.b === o.id).map(g => esc(g.num)).join(', ') || 'aucune'}</p>`;
    }
    if (sel.kind === 'gaines') {
      const a = lv.devices.find(d => d.id === o.a), b = lv.devices.find(d => d.id === o.b), pts = gainePts(o), len = pts.slice(1).reduce((s, p, i) => s + G.dist(pts[i], p), 0);
      h = `<span class="lbl">Gaine</span><h3>${esc(o.num)} · ${esc(a ? a.ref : '?')} → ${esc(b ? b.ref : '?')}</h3>
        ${field('Numéro', `<input data-p="num" value="${esc(o.num)}">`)}
        ${field('Nature', `<select data-p="kind">${Object.entries(GAINE_KINDS).map(([k, v]) => `<option value="${k}" ${k === o.kind ? 'selected' : ''}>${v.label}</option>`).join('')}</select>`)}
        ${field('Conduit', `<input data-p="tube" value="${esc(o.tube || '')}">`)}
        ${field('Contenu', `<textarea data-p="content" placeholder="ex. R25.1, B25.1, T25.1">${esc(o.content || '')}</textarea>`)}
        <p class="muted">Longueur sur plan ≈ ${G.fmtM(len)} m. Glisse les coudes ; double-clic sur un coude dans l'outil Sélection pour le retirer.</p>`;
    }
    box.innerHTML = h + `<div class="row"><button class="btn" data-act="dup">Dupliquer</button><button class="btn danger" data-act="del">Supprimer</button></div>`;
  }
}
function circuitsTable() {
  if (!P.circuits.length) return '<p class="muted">Aucun circuit.</p>';
  return `<table class="t"><thead><tr><th>Nom</th><th>Cal.</th><th>Sect.</th><th>Tab.</th><th></th></tr></thead><tbody>${P.circuits.map(c => `<tr><td><input class="inp" data-c="${c.id}" data-cf="name" value="${esc(c.name)}"></td><td><input class="inp" data-c="${c.id}" data-cf="cal" value="${esc(c.cal)}" style="width:52px"></td><td><input class="inp" data-c="${c.id}" data-cf="section" value="${esc(c.section)}" style="width:44px"></td><td><input class="inp" data-c="${c.id}" data-cf="tableau" value="${esc(c.tableau)}" style="width:44px"></td><td><button class="btn" data-delc="${c.id}" title="Supprimer">×</button></td></tr>`).join('')}</tbody></table>`;
}
$('#tab-props').addEventListener('change', e => {
  const t = e.target, lv = L();
  if (t.dataset.lv) { commit(); lv[t.dataset.lv] = t.type === 'number' ? +t.value : t.value; markDirty(); renderLevels(); render(); return; }
  if (t.dataset.bg) { commit(); lv.background[t.dataset.bg] = +t.value; markDirty(); render(); return; }
  if (t.dataset.set) { commit(); P.settings[t.dataset.set] = +t.value; markDirty(); render(); return; }
  if (t.dataset.c) { commit(); const c = P.circuits.find(x => x.id === t.dataset.c); c[t.dataset.cf] = t.value; markDirty(); return; }
  if (t.dataset.p && sel) {
    const o = (lv[sel.kind] || []).find(x => x.id === sel.id); if (!o) return; commit();
    let v = t.value; if (t.type === 'number') v = +v; if (t.dataset.p === 'flip' || t.dataset.p === 'side') v = !!t.value;
    if (t.dataset.p === 'color') o.color = v; else o[t.dataset.p] = v;
    markDirty(); render();
  }
});
$('#tab-props').addEventListener('input', e => { const t = e.target; if (t.dataset.bg === 'opacity') { L().background.opacity = +t.value; const im = gBg.querySelector('image'); if (im) im.setAttribute('opacity', t.value); } });
$('#tab-props').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.act === 'del') deleteSel();
  if (b.dataset.act === 'dup') duplicateSel();
  if (b.dataset.act === 'bg') importBackground();
  if (b.dataset.act === 'calib') setTool('calib');
  if (b.dataset.act === 'bgdel') { commit(); L().background = null; markDirty(); render(); }
  if (b.dataset.act === 'addcirc') { commit(); P.circuits.push({ id: uid('c'), name: 'Circuit ' + (P.circuits.length + 1), cal: '16A', section: '2,5', tableau: 'TD' }); markDirty(); render(); }
  if (b.dataset.delc) { commit(); P.circuits = P.circuits.filter(c => c.id !== b.dataset.delc); markDirty(); render(); }
});

// ---------- bibliothèque d'appareils ----------
function renderLib() {
  const groups = [...new Set(DEVICE_TYPES.map(d => d.group))];
  $('#tab-lib').innerHTML = groups.map(g => `<span class="lbl">${esc(g)}</span><div class="libgrid">${DEVICE_TYPES.filter(d => d.group === g).map(d => `<button data-dev="${d.type}" aria-pressed="${d.type === devType}"><svg viewBox="-28 -20 56 40">${deviceSymbol(d.type, 1)}</svg>${esc(d.label)}</button>`).join('')}</div>`).join('') +
    `<p class="muted">Choisis un type puis clique sur le plan. Le repère (P1, I2…) est attribué automatiquement et reste unique dans tout le projet.</p>`;
}
$('#tab-lib').addEventListener('click', e => { const b = e.target.closest('[data-dev]'); if (!b) return; devType = b.dataset.dev; renderLib(); setTool('device'); });

// ---------- nomenclature ----------
function renderNomen() {
  const box = $('#tab-nomen'); if (box.hidden) return;
  const rows = {}; P.levels.forEach(lv => lv.devices.forEach(d => { const k = d.type; rows[k] = rows[k] || { n: 0, per: {} }; rows[k].n++; rows[k].per[lv.name] = (rows[k].per[lv.name] || 0) + 1; }));
  const lv = L();
  box.innerHTML = `<span class="lbl">Appareils · tout le projet</span>
    <table class="t"><thead><tr><th>Type</th><th>Par niveau</th><th class="n">Total</th></tr></thead><tbody>${Object.entries(rows).map(([k, r]) => `<tr><td>${esc((DT[k] || {}).label || k)}</td><td class="muted">${Object.entries(r.per).map(([l, n]) => esc(l) + ' ' + n).join(' · ')}</td><td class="n">${r.n}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Aucun appareil.</td></tr>'}</tbody></table>
    <span class="lbl">Gaines · ${esc(lv.name)}</span>
    <table class="t"><thead><tr><th>N°</th><th>De → vers</th><th>Contenu</th><th class="n">m</th></tr></thead><tbody>${lv.gaines.map(g => { const a = lv.devices.find(d => d.id === g.a), b = lv.devices.find(d => d.id === g.b), pts = gainePts(g), len = pts.slice(1).reduce((s, p, i) => s + G.dist(pts[i], p), 0); return `<tr><td><b>${esc(g.num)}</b></td><td>${esc(a ? a.ref : '?')} → ${esc(b ? b.ref : '?')}</td><td class="muted">${esc(g.content || '')}</td><td class="n">${G.fmtM(len)}</td></tr>`; }).join('') || '<tr><td colspan="4" class="muted">Aucune gaine.</td></tr>'}</tbody></table>
    <span class="lbl">Pièces · ${esc(lv.name)}</span>
    <table class="t"><tbody>${lv.rooms.map(r => `<tr><td>${esc(r.name)}</td><td class="n">${(G.polyArea(r.pts) / 10000).toFixed(2).replace('.', ',')} m²</td></tr>`).join('') || '<tr><td class="muted">Aucune pièce.</td></tr>'}</tbody></table>
    <div class="row"><button class="btn" id="csvBtn">Exporter la nomenclature (CSV)</button></div>`;
  $('#csvBtn').onclick = exportCSV;
}
function exportCSV() {
  const lines = [['Niveau', 'Repère', 'Type', 'Désignation', 'Circuit', 'Mode', 'X (m)', 'Y (m)'].join(';')];
  P.levels.forEach(lv => lv.devices.forEach(d => lines.push([lv.name, d.ref, (DT[d.type] || {}).label || d.type, d.label || '', (P.circuits.find(c => c.id === d.circuit) || {}).name || '', d.mode || '', G.fmtM(d.x), G.fmtM(d.y)].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(';'))));
  lines.push(''); lines.push(['Niveau', 'Gaine', 'De', 'Vers', 'Nature', 'Conduit', 'Contenu'].join(';'));
  P.levels.forEach(lv => lv.gaines.forEach(g => { const a = lv.devices.find(d => d.id === g.a), b = lv.devices.find(d => d.id === g.b); lines.push([lv.name, g.num, a ? a.ref : '', b ? b.ref : '', (GAINE_KINDS[g.kind] || {}).label || '', g.tube || '', g.content || ''].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(';')); }));
  saveTextFile('﻿' + lines.join('\n'), (P.name || 'projet') + ' - nomenclature.csv', 'csv');
}

// ---------- onglets ----------
$$('.tabs button').forEach(b => b.onclick = () => { $$('.tabs button').forEach(x => x.setAttribute('aria-selected', String(x === b))); $$('.tabbody').forEach(x => x.hidden = x.id !== 'tab-' + b.dataset.tab); if (b.dataset.tab === 'nomen') renderNomen(); if (b.dataset.tab === 'ai' && window.FPP_AI) window.FPP_AI.show(); });

// ---------- fichiers ----------
async function saveTextFile(data, name, ext) {
  if (API) { const p = await API.saveText({ data, suggested: name, ext }); if (p) toast('Enregistré : ' + p); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data])); a.download = name; a.click();
}
async function save(as) {
  P.name = $('#projName').value || P.name;
  const data = JSON.stringify(P, null, 1);
  if (API) { const p = await API.saveProject({ path: as ? null : filePath, data, suggested: (P.name || 'projet') + '.elecplan.json' }); if (!p) return; filePath = p; }
  else { await saveTextFile(data, (P.name || 'projet') + '.elecplan.json', 'json'); }
  dirty = false; $('#dirty').hidden = true; toast('Projet enregistré.');
}
async function openFile() {
  if (dirty && !(await confirmBox('Le projet en cours n\'est pas enregistré. L\'abandonner ?', 'Abandonner'))) return;
  let txt = null;
  if (API) { const r = await API.openProject(); if (!r) return; txt = r.data; filePath = r.path; }
  else { txt = await new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json'; i.onchange = () => { const f = i.files[0]; if (!f) return res(null); f.text().then(res); }; i.click(); }); if (!txt) return; filePath = null; }
  try { P = migrate(JSON.parse(txt)); } catch { toast('Fichier illisible.'); return; }
  LI = 0; sel = null; draft = null; hist.u = []; hist.r = []; dirty = false; $('#dirty').hidden = true; $('#projName').value = P.name || ''; renderLevels(); fit();
}
async function newFile() {
  if (dirty && !(await confirmBox('Le projet en cours n\'est pas enregistré. L\'abandonner ?', 'Abandonner'))) return;
  P = newProject(); LI = 0; sel = null; draft = null; filePath = null; hist.u = []; hist.r = []; dirty = false; $('#dirty').hidden = true; $('#projName').value = P.name; renderLevels(); fit();
}
async function importBackground() {
  let f = null;
  if (API) f = await API.pickImage();
  else f = await new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*,application/pdf'; i.onchange = () => { const x = i.files[0]; if (!x) return res(null); const r = new FileReader(); r.onload = () => res({ name: x.name, mime: x.type, base64: String(r.result).split(',')[1] }); r.readAsDataURL(x); }; i.click(); });
  if (!f) return;
  let src;
  if (f.mime === 'application/pdf') { if (!window.renderPdfFirstPage) { toast('Lecteur PDF indisponible.'); return; } toast('Lecture du PDF…'); src = await window.renderPdfFirstPage(f.base64); }
  else src = `data:${f.mime};base64,${f.base64}`;
  const img = new Image(); img.onload = () => {
    commit(); const w = 2000, h = w * img.naturalHeight / img.naturalWidth;   // largeur provisoire 20 m, à calibrer
    L().background = { src, name: f.name, x: 0, y: 0, w, h, opacity: 0.5 }; markDirty(); fit();
    toast('Fond importé. Utilise l\'outil « Échelle » pour le mettre à la bonne dimension.', 6000);
  }; img.src = src;
}

// ---------- export SVG / PDF ----------
function levelSVG(lv, forPrint) {
  const keepLI = LI, keepSel = sel, keepDraft = draft, keepView = { ...view };
  LI = P.levels.indexOf(lv); sel = null; draft = null;
  const b = bounds(lv); Object.assign(view, b);
  render(); svg.setAttribute('viewBox', `${b.x} ${b.y} ${b.w} ${b.h}`);
  const clone = svg.cloneNode(true); clone.querySelectorAll('.gridline').forEach(n => n.remove());
  clone.querySelectorAll('.g-hit').forEach(n => n.remove());
  // styles résolus (le fichier CSS n'est pas embarqué)
  clone.querySelectorAll('.g-room').forEach(n => { if (!n.getAttribute('fill')) n.setAttribute('fill', '#f3efe4'); });
  clone.querySelectorAll('.g-roomlab').forEach(n => { n.setAttribute('text-anchor', 'middle'); n.setAttribute('font-family', 'DejaVu Sans, sans-serif'); n.setAttribute('font-weight', '600'); n.setAttribute('fill', '#17201d'); });
  clone.querySelectorAll('.g-roomarea,.g-dimt').forEach(n => { n.setAttribute('text-anchor', 'middle'); n.setAttribute('font-family', 'DejaVu Sans Mono, monospace'); n.setAttribute('fill', '#3b4643'); });
  clone.querySelectorAll('.g-dim').forEach(n => { n.setAttribute('stroke', '#5d6b66'); n.setAttribute('fill', 'none'); if (!n.getAttribute('stroke-width')) n.setAttribute('stroke-width', '1'); });
  clone.querySelectorAll('.g-gaine').forEach(n => n.setAttribute('fill', 'none'));
  clone.setAttribute('xmlns', NS); clone.removeAttribute('id'); clone.removeAttribute('style');
  LI = keepLI; sel = keepSel; draft = keepDraft; Object.assign(view, keepView); applyView(); render();
  return { svg: clone.outerHTML, b };
}
async function exportSVG() { const { svg: s } = levelSVG(L()); await saveTextFile('<?xml version="1.0" encoding="UTF-8"?>\n' + s, `${P.name} - ${L().name}.svg`, 'svg'); }
function pickScale(b, wmm, hmm) { for (const s of [20, 25, 50, 75, 100, 125, 150, 200, 250, 500, 1000]) { if (b.w * 10 / s <= wmm && b.h * 10 / s <= hmm) return s; } return 1000; }
async function exportPDF() {
  const date = new Date().toLocaleDateString('fr-FR');
  const pages = P.levels.map(lv => {
    const { svg: s, b } = levelSVG(lv); const W = 400, H = 245, sc = pickScale(b, W, H), wmm = b.w * 10 / sc, hmm = b.h * 10 / sc;
    const sized = s.replace('<svg', `<svg width="${wmm}mm" height="${hmm}mm"`);
    const legend = [...new Set(lv.devices.map(d => d.type))].map(t => `<div class="lg"><svg viewBox="-28 -20 56 40" width="9mm" height="6.5mm">${deviceSymbol(t, 1)}</svg>${esc(DT[t].label)}</div>`).join('');
    return `<section class="pg"><div class="draw">${sized}</div><div class="cart"><div class="c1"><b>${esc(P.name)}</b><span>${esc(lv.name)}</span></div><div class="c2">${legend}</div><div class="c3"><span>Échelle 1:${sc}</span><span>${date}</span><span>ElecPlan</span></div></div></section>`;
  }).join('');
  const html = `<!doctype html><meta charset="utf-8"><style>@page{size:A3 landscape;margin:0}body{margin:0;font-family:DejaVu Sans,sans-serif;color:#17201d}
  .pg{width:420mm;height:297mm;box-sizing:border-box;padding:10mm;display:flex;flex-direction:column;page-break-after:always;position:relative}
  .draw{flex:1;display:flex;align-items:center;justify-content:center;border:.4mm solid #17201d}
  .cart{height:24mm;margin-top:3mm;display:grid;grid-template-columns:90mm 1fr 60mm;border:.4mm solid #17201d}
  .cart>div{padding:2.5mm 4mm;border-right:.3mm solid #17201d;display:flex;flex-direction:column;justify-content:center;gap:1mm;font-size:3.2mm}
  .cart>div:last-child{border-right:0}.c1 b{font-size:5mm}.c2{flex-direction:row!important;flex-wrap:wrap;align-content:center;gap:1mm 5mm!important}
  .lg{display:flex;align-items:center;gap:1.5mm;font-size:2.8mm}.c3{font-family:DejaVu Sans Mono,monospace;font-size:3mm}</style>${pages}`;
  if (API) { const p = await API.exportPDF({ html, suggested: (P.name || 'plan') + '.pdf' }); if (p) toast('PDF créé : ' + p); }
  else { const w = window.open('', '_blank'); w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400); }
}

// ---------- liaison interface ----------
$$('#tools button').forEach(b => b.onclick = () => setTool(b.dataset.tool));
$('#bNew').onclick = newFile; $('#bOpen').onclick = openFile; $('#bSave').onclick = () => save(false); $('#bBg').onclick = importBackground; $('#bPdf').onclick = exportPDF;
$('#zIn').onclick = () => zoomAt(1.3, view.x + view.w / 2, view.y + view.h / 2); $('#zOut').onclick = () => zoomAt(1 / 1.3, view.x + view.w / 2, view.y + view.h / 2); $('#zFit').onclick = fit;
$('#projName').onchange = e => { commit(); P.name = e.target.value; markDirty(); };
$('#optSnap').onchange = e => opt.snap = e.target.checked;
$('#optOrtho').onchange = e => opt.ortho = e.target.checked;
$('#optGrid').onchange = e => { opt.grid = +e.target.value; render(); };
$('#optThick').onchange = e => { opt.thick = +e.target.value; };
$$('.layersel input').forEach(i => i.onchange = () => { layers[i.dataset.layer] = i.checked; render(); });
window.addEventListener('resize', () => { applyView(); render(); });
window.addEventListener('beforeunload', e => { if (dirty && API) { /* l'enregistrement auto en local permet la récupération */ } });
if (API) API.onMenu(m => ({ new: newFile, open: openFile, save: () => save(false), saveas: () => save(true), background: importBackground, pdf: exportPDF, svg: exportSVG, undo, redo }[m] || (() => {}))());

// API pour l'assistant IA
window.FPP = {
  get project() { return P; }, get level() { return L(); }, get levelIndex() { return LI; },
  toast, render, ask, confirmBox,
  select(kind, id) { sel = { kind, id }; render(); },
  findByRef(ref) { for (let i = 0; i < P.levels.length; i++) { const d = P.levels[i].devices.find(x => x.ref === ref); if (d) return { li: i, d }; } return null; },
  gotoLevel(i) { LI = i; renderLevels(); render(); },
  apply(fn) { commit(); fn(P, L()); P = migrate(P); markDirty(); renderLevels(); render(); }
};

// démarrage : récupération éventuelle
try { const a = localStorage.getItem('fpp-autosave'); if (a) { const p = JSON.parse(a); if (p && p.levels && (p.levels.some(l => l.walls.length || l.devices.length))) { P = migrate(p); toast('Dernier travail non enregistré récupéré.'); } } } catch {}
$('#projName').value = P.name; renderLevels(); renderLib(); setTool('select'); applyView(); fit();
})();
