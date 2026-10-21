// ElecPlan — éditeur (rendu SVG, outils, sélection, panneaux, fichiers, export)
(() => {
'use strict';
const NS = 'http://www.w3.org/2000/svg';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const API = window.api || null;
const tr = I18N.t;

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

// ---------- paramètres de l'application (Settings ; réglages de l'utilisateur, communs à tous les projets) ----------
// seules les valeurs modifiées sont enregistrées (réglages de l'app, clé « prefs ») ; le reste suit les valeurs d'usine
// couleurs : la valeur d'usine est celle du thème choisi (src/themes.js), en clair ou en sombre ; une couleur modifiée reste prioritaire
const PREF_DEFS = [
  ['Apparence', [['theme', 'sel', 'atelier', 'Thème', Object.entries(THEMES).map(([k, t]) => [k, t.name])], ['mode', 'sel', 'system', 'Mode clair / sombre', [['system', 'Comme le système'], ['light', 'Clair'], ['dark', 'Sombre']]]]],
  ['Couleurs de l\'interface', [['accent', 'color', null, 'Couleur principale'], ['sel', 'color', null, 'Sélection et tracé en cours']]],
  ['Couleurs du plan', [['canvas', 'color', null, 'Fond du plan'], ['wall', 'color', null, 'Murs'], ['room', 'color', null, 'Espaces (remplissage par défaut)'], ['device', 'color', null, 'Symboles et textes'],
    ['grid', 'color', null, 'Grille'], ['gridMajor', 'color', null, 'Grille : lignes des mètres'], ['axisX', 'color', null, 'Axe X'], ['axisY', 'color', null, 'Axe Y']]],
  ['Couleurs des gaines', Object.keys(GAINE_KINDS).map(k => ['g_' + k, 'color', null, GAINE_KINDS[k].label])],
  ['Affichage|prefs', [['rulers', 'bool', true, 'Règles'], ['axes', 'bool', true, 'Axes de la scène'], ['gridShow', 'bool', true, 'Lignes de la grille'], ['zoomSpeed', 'num', 100, 'Vitesse du zoom (%)', { min: 25, max: 400, step: 25 }]]],
  ['Au démarrage et pour les nouveaux éléments', [['thick', 'num', 20, 'Épaisseur des murs (cm)', { min: 1, max: 200 }], ['gridStep', 'sel', 10, 'Pas de la grille', [5, 10, 25, 50].map(v => [v, v + ' cm'])],
    ['snap', 'bool', true, 'Accrocher à la grille'], ['ortho', 'bool', true, 'Angles par pas de 15°'], ['doorW', 'num', 83, 'Largeur des portes (cm)', { min: 30, max: 400 }], ['windowW', 'num', 120, 'Largeur des fenêtres (cm)', { min: 20, max: 600 }],
    ['wallPos', 'sel', 'out', 'Murs d\'un espace', [['out', 'Extérieur'], ['mid', 'Dans l\'axe'], ['in', 'Intérieur']]], ['showArea', 'bool', true, 'Surface sur les étiquettes']]],
];
const PREF = Object.fromEntries(PREF_DEFS.flatMap(([, items]) => items.map(([k, type, def, label, extra]) => [k, { type, def, label, extra }])));
let prefs = {};
let forceLight = false;   // pendant un export : version claire du thème (le papier est blanc)
const darkMQ = window.matchMedia('(prefers-color-scheme: dark)');
const isDark = () => !forceLight && (pref('mode') === 'dark' || (pref('mode') === 'system' && darkMQ.matches));
const theme = () => (THEMES[pref('theme')] || THEMES.atelier)[isDark() ? 'dark' : 'light'];
const defOf = k => PREF[k].type === 'color' ? theme()[k] : PREF[k].def;
const pref = k => k in prefs ? prefs[k] : defOf(k);
const syncGaineColors = () => Object.keys(GAINE_KINDS).forEach(k => GAINE_KINDS[k].color = pref('g_' + k));
const mixHex = (a, b, t) => { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), x = p(a), y = p(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
// applique les préférences ; startup (ou une valeur par défaut modifiée) : règle aussi les options de la barre d'état
function applyPrefs(key) {
  const rs = document.documentElement.style, T = theme(), dark = isDark();
  ['bg', 'surface', 'sunk', 'fg', 'muted', 'line', 'line2', 'warn', 'danger'].forEach(k => rs.setProperty('--' + k, T[k])); rs.setProperty('--warn-soft', T.warnSoft);
  rs.setProperty('--accent', pref('accent')); rs.setProperty('--accent-soft', 'accent' in prefs ? mixHex(pref('accent'), T.surface, dark ? .78 : .88) : T.accentSoft); rs.setProperty('--sel', pref('sel'));
  rs.colorScheme = dark ? 'dark' : 'light'; document.documentElement.dataset.mode = dark ? 'dark' : 'light';   // contrôles natifs (champs, barres de défilement) assortis
  if (API && API.setThemeMode) API.setThemeMode(pref('mode'));   // menus de la fenêtre assortis
  [['--canvas', 'canvas'], ['--wall', 'wall'], ['--room', 'room'], ['--grid', 'grid'], ['--grid-major', 'gridMajor'], ['--axis-x', 'axisX'], ['--axis-y', 'axisY']].forEach(([v, k]) => rs.setProperty(v, pref(k)));
  syncGaineColors();
  document.body.classList.toggle('no-rulers', !pref('rulers'));
  renderLib();
  const all = !key;
  if (all || key === 'thick') { opt.thick = pref('thick'); const s = $('#optThick'); if (![...s.options].some(o => +o.value === opt.thick)) s.add(new Option(opt.thick + ' cm', opt.thick)); s.value = opt.thick; }
  if (all || key === 'gridStep') { opt.grid = +pref('gridStep'); $('#optGrid').value = opt.grid; }
  if (all || key === 'snap') $('#optSnap').checked = opt.snap = pref('snap');
  if (all || key === 'ortho') $('#optOrtho').checked = opt.ortho = pref('ortho');
  applyView(); render();
}
darkMQ.addEventListener('change', () => { if (pref('mode') !== 'system') return; applyPrefs('mode'); const d = document.querySelector('dialog.prefs'); if (d) d.dispatchEvent(new Event('refresh')); });
function savePrefs() { if (API) API.setSettings({ prefs }); else try { localStorage.setItem('elecplan-prefs', JSON.stringify(prefs)); } catch {} }
async function loadPrefs() {
  try { prefs = API ? ((await API.getSettings()).prefs || {}) : JSON.parse(localStorage.getItem('elecplan-prefs') || '{}'); } catch { prefs = {}; }
  for (const k of Object.keys(prefs)) if (!PREF[k]) delete prefs[k];   // clés inconnues (anciennes versions)
  applyPrefs();
}
function openPrefs() {
  if (document.querySelector('dialog.prefs')) return;
  const d = document.createElement('dialog'); d.className = 'prefs';
  const control = (k, v) => { const P0 = PREF[k];
    if (P0.type === 'color') return `<input type="color" data-pref="${k}" value="${v}">`;
    if (P0.type === 'bool') return `<input type="checkbox" data-pref="${k}" ${v ? 'checked' : ''}>`;
    if (P0.type === 'num') return `<input type="number" data-pref="${k}" value="${v}" min="${P0.extra.min}" max="${P0.extra.max}" step="${P0.extra.step || 1}">`;
    return `<select data-pref="${k}">${P0.extra.map(([ov, ol]) => `<option value="${ov}" ${String(ov) === String(v) ? 'selected' : ''}>${esc(tr(ol))}</option>`).join('')}</select>`; };
  const fill = () => {
    d.innerHTML = `<form method="dialog"><div class="prefs-head"><h2>${tr('Paramètres')}</h2><span class="muted">${tr('Enregistrées pour tous les projets ; ↺ remet la valeur d\'usine.')}</span></div>
      <div class="pgrid">${PREF_DEFS.map(([g, items]) => `<fieldset><legend>${esc(tr(g))}</legend>${items.map(([k]) => `<label class="prow"><span>${esc(tr(PREF[k].label))}</span>${control(k, pref(k))}<button type="button" class="preset" data-reset="${k}" title="${esc(tr('Valeur d\'usine'))}" ${k in prefs ? '' : 'hidden'}>↺</button></label>`).join('')}</fieldset>`).join('')}</div>
      <div class="row"><button type="button" class="btn danger" data-resetall>${tr('Tout remettre aux valeurs d\'usine')}</button><span class="sp"></span><button class="btn primary" value="ok">${tr('Fermer')}</button></div></form>`;
  };
  fill(); document.body.appendChild(d); d.showModal();
  const set = (k, v) => { if (v === defOf(k)) delete prefs[k]; else prefs[k] = v; const b = d.querySelector(`[data-reset="${k}"]`); if (b) b.hidden = !(k in prefs); savePrefs(); applyPrefs(k);
    if (k === 'theme' || k === 'mode') fill(); };   // les couleurs affichées suivent le nouveau thème
  d.addEventListener('refresh', fill);
  d.addEventListener('change', e => { const t = e.target, k = t.dataset.pref; if (!k) return; const P0 = PREF[k];
    let v = P0.type === 'bool' ? t.checked : P0.type === 'num' ? +t.value : P0.type === 'sel' ? (typeof P0.def === 'number' ? +t.value : t.value) : t.value.toLowerCase();
    if (P0.type === 'num' && !(v >= P0.extra.min && v <= P0.extra.max)) { t.value = pref(k); return; }
    set(k, v); });
  d.addEventListener('click', async e => {
    const r = e.target.closest('[data-reset]');
    if (r) { const k = r.dataset.reset; delete prefs[k]; const t = d.querySelector(`[data-pref="${k}"]`), v = defOf(k); if (PREF[k].type === 'bool') t.checked = v; else t.value = v; set(k, v); return; }
    if (e.target.closest('[data-resetall]') && await confirmBox(tr('Remettre tous les paramètres aux valeurs d\'usine ?'), tr('Tout remettre'))) { prefs = {}; savePrefs(); applyPrefs(); fill(); }
  });
  d.addEventListener('close', () => d.remove());
}

// ---------- utilitaires ----------
function toast(msg, ms = 3500) { const s = $('#sMsg'); s.textContent = msg; s.title = msg; clearTimeout(toast.t); toast.t = setTimeout(() => { s.textContent = ''; s.title = ''; }, ms); }
function hint(t) { $('#hint').textContent = t || ''; }
// état « non enregistré » : affiché dans l'en-tête et transmis au processus principal (garde à la fermeture)
function syncDirty() { $('#dirty').hidden = !dirty; if (API && API.setDirty) API.setDirty({ dirty, name: P.name || '' }); }
function clearAutosave() { try { localStorage.removeItem('fpp-autosave'); } catch {} }
function markDirty() { dirty = true; syncDirty(); try { localStorage.setItem('fpp-autosave', JSON.stringify(P)); } catch {} }
function commit() { hist.push(P); }               // à appeler AVANT une modification
function pxToWorld(px) { const r = svg.getBoundingClientRect(); return px * view.w / Math.max(1, r.width); }
function worldPt(e) { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const q = p.matrixTransform(svg.getScreenCTM().inverse()); return [q.x, q.y]; }
function findById(kind, id) { const arr = L()[kind]; return arr ? arr.find(o => o.id === id) : null; }
function el(tag, attrs = {}, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }

// boîte de dialogue texte (window.prompt n'existe pas dans Electron)
function ask(title, value = '', okLabel = 'OK') {
  return new Promise(res => {
    const d = document.createElement('dialog');
    d.style.cssText = 'border:1px solid var(--line);border-radius:8px;padding:14px;min-width:320px';
    d.innerHTML = `<form method="dialog" style="display:flex;flex-direction:column;gap:8px"><b>${esc(title)}</b><input class="inp" name="v" value="${esc(value)}" autofocus><div class="row" style="justify-content:flex-end"><button class="btn" value="cancel">${esc(tr('Annuler'))}</button><button class="btn primary" value="ok">${esc(okLabel)}</button></div></form>`;
    document.body.appendChild(d); d.showModal(); const inp = d.querySelector('input'); inp.select();
    d.addEventListener('close', () => { const v = d.returnValue === 'ok' ? inp.value : null; d.remove(); res(v); });
  });
}
function confirmBox(title, okLabel = tr('Confirmer')) {
  return new Promise(res => {
    const d = document.createElement('dialog');
    d.style.cssText = 'border:1px solid var(--line);border-radius:8px;padding:14px;min-width:300px';
    d.innerHTML = `<form method="dialog" style="display:flex;flex-direction:column;gap:10px"><b>${esc(title)}</b><div class="row" style="justify-content:flex-end"><button class="btn" value="cancel">${esc(tr('Annuler'))}</button><button class="btn danger" value="ok">${esc(okLabel)}</button></div></form>`;
    document.body.appendChild(d); d.showModal(); d.addEventListener('close', () => { const v = d.returnValue === 'ok'; d.remove(); res(v); });
  });
}

// ---------- vue ----------
function applyView() {
  const r = svg.getBoundingClientRect(); if (r.width > 0 && r.height > 0) view.h = view.w * r.height / r.width;
  svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
  const scale = r.width / view.w; $('#sZoom').textContent = Math.round(scale * 100 * 2) + ' %'; // 100 % ≈ 1 px = 2 cm
}
const fmtLen = cm => cm >= 100 ? I18N.num(String(cm / 100)) + ' m' : cm + ' cm';
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
function fitBox(b) { const r = svg.getBoundingClientRect(); const ar = r.height / Math.max(1, r.width); let w = b.w, h = w * ar; if (h < b.h) { h = b.h; w = h / ar; } view.x = b.x - (w - b.w) / 2; view.y = b.y - (h - b.h) / 2; view.w = w; applyView(); render(); }
// pavé numérique « . » : cadrer la sélection (comme Blender)
function frameSelected() {
  const lv = L(), bs = selItems().map(it => { const o = (lv[it.kind] || []).find(x => x.id === it.id); return o && itemBBox(it.kind, o); }).filter(Boolean); if (!bs.length) return fit();
  const x0 = Math.min(...bs.map(b => b[0])), y0 = Math.min(...bs.map(b => b[1])), x1 = Math.max(...bs.map(b => b[2])), y1 = Math.max(...bs.map(b => b[3])), m = 80;
  fitBox({ x: x0 - m, y: y0 - m, w: Math.max(300, x1 - x0 + 2 * m), h: Math.max(200, y1 - y0 + 2 * m) });
}
function fit() { const b = bounds(); const r = svg.getBoundingClientRect(); const ar = r.height / Math.max(1, r.width); let w = b.w, h = w * ar; if (h < b.h) { h = b.h; w = h / ar; } view.x = b.x - (w - b.w) / 2; view.y = b.y - (h - b.h) / 2; view.w = w; applyView(); render(); }

// ---------- accrochage ----------
// Ctrl dans un outil de dessin : accroche précise, visible avant le clic — points des éléments (sommets, centres d'espaces,
// appareils, ouvertures, coudes, extrémités de cotes, points du tracé en cours), sinon la grille même si elle est décochée
const SNAP_TOOLS = { wall: 1, room: 1, dim: 1, text: 1, device: 1, gaine: 1 };
let snapMark = null;   // { p, pt } : position accrochée affichée, pt = sur un point d'élément (sinon sur la grille)
function ctrlPoint(p) {
  const lv = L(), tol = pxToWorld(14); let best = null, bd = tol;
  const test = c => { const d = G.dist(c, p); if (d < bd) { bd = d; best = c; } };
  ['walls', 'rooms', 'gaines', 'dims', 'devices', 'openings'].forEach(k => lv[k].forEach(o => snapPointsOf(k, o).forEach(q => test(q.p))));
  if (draft && draft.pts) draft.pts.forEach(test);
  return best && best.map(r1);
}
function snapPt(p, e, from) {
  let q = p.slice();
  const ctrl = e && (e.ctrlKey || e.metaKey), grid = (opt.snap || ctrl) && !e.altKey;
  if (ctrl) { const c = ctrlPoint(p); if (c) return c; }
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
    if (grid) { const g = opt.grid; const L2 = Math.round(len / g) * g; q = [from[0] + Math.cos(aa) * L2, from[1] + Math.sin(aa) * L2]; }
    return q.map(v => Math.round(v * 10) / 10);
  }
  if (grid) { const g = opt.grid; q = q.map(v => Math.round(v / g) * g); }
  return q;
}
// marqueur de l'accroche Ctrl : cercle sur un point d'élément, croix sur la grille ; les coordonnées affichées suivent
function updateSnapMark(e) {
  const on = e && (e.ctrlKey || e.metaKey) && SNAP_TOOLS[tool] && !modal && !panning;
  if (on) { const from = draft && draft.pts && draft.pts.length && tool !== 'room' ? draft.pts[draft.pts.length - 1] : null, q = snapPt(cursor, e, from); snapMark = { p: q, pt: !!ctrlPoint(cursor) }; }
  else snapMark = null;
  const c = snapMark ? snapMark.p : cursor; $('#sCoord').textContent = `x ${G.fmtM(c[0])} · y ${G.fmtM(c[1])} m`;
  drawSnapMark();
}
function drawSnapMark() {
  if (!gOver) return; gOver.querySelectorAll('.snap-cur').forEach(n => n.remove());
  if (!snapMark) return; const [x, y] = snapMark.p, r = pxToWorld(snapMark.pt ? 7 : 6);
  if (snapMark.pt) { el('circle', { cx: x, cy: y, r, class: 'snap-mark snap-cur' }, gOver); el('circle', { cx: x, cy: y, r: pxToWorld(1.6), class: 'snap-dot snap-cur' }, gOver); }
  else el('path', { d: `M${x - r} ${y}H${x + r}M${x} ${y - r}V${y + r}`, class: 'snap-mark snap-cur' }, gOver);
}

// ---------- rendu ----------
let gGrid, gBg, gRooms, gWalls, gOpen, gDims, gTexts, gGaines, gDev, gOver;
function render() {
  P.levels.forEach(syncLabels);
  svg.innerHTML = '';
  gGrid = el('g', {}, svg); gBg = el('g', {}, svg); gRooms = el('g', {}, svg); gWalls = el('g', {}, svg); gOpen = el('g', {}, svg);
  gDims = el('g', {}, svg); gTexts = el('g', {}, svg); gGaines = el('g', {}, svg); gDev = el('g', {}, svg); gOver = el('g', {}, svg);
  drawGrid();
  const lv = L(), s = P.settings.symbol || 1;
  if (layers.bg && lv.background) { const b = lv.background; el('image', { href: b.src, x: b.x, y: b.y, width: b.w, height: b.h, opacity: b.opacity ?? 0.5, preserveAspectRatio: 'none', 'data-k': 'bg' }, gBg); }
  if (layers.archi) {
    lv.rooms.forEach(r => {
      el('polygon', { points: r.pts.map(p => p.join(',')).join(' '), class: 'g-room', fill: r.color || '', 'data-k': 'rooms', 'data-id': r.id }, gRooms);
    });
    lv.labels.forEach(lb => { const r = lv.rooms.find(x => x.id === lb.space); if (!r) return; const k = s * (lb.size || 1);
      const g = el('g', { transform: `translate(${lb.x},${lb.y}) rotate(${lb.rot || 0})`, 'data-k': 'labels', 'data-id': lb.id }, gTexts);
      el('text', { x: 0, y: 0, class: 'g-roomlab', 'font-size': 14 * k, fill: pref('device') }, g).textContent = r.name || '';
      if (lb.area !== false) el('text', { x: 0, y: 16 * k, class: 'g-roomarea', 'font-size': 11 * k }, g).textContent = G.fmtArea(r.pts) + ' m²';
    });
    lv.walls.forEach(w => {
      // extrémités franches (comme l'aperçu) ; un mur fermé (dernier point = premier) est tracé en polygone pour que l'angle de fermeture soit mitré
      const n = w.pts.length, closed = n > 2 && G.dist(w.pts[0], w.pts[n - 1]) < 0.5, pts = closed ? w.pts.slice(0, -1) : w.pts;
      el(closed ? 'polygon' : 'polyline', { points: pts.map(p => p.join(',')).join(' '), fill: 'none', stroke: pref('wall'), 'stroke-width': w.thick, 'stroke-linejoin': 'miter', 'stroke-linecap': 'butt', 'data-k': 'walls', 'data-id': w.id }, gWalls);
    });
    lv.openings.forEach(o => drawOpening(o, gOpen));
    lv.texts.forEach(t => { const e = el('text', { x: t.x, y: t.y, class: 'g-text', 'font-size': t.size || 18, fill: pref('device'), 'data-k': 'texts', 'data-id': t.id }, gTexts); e.textContent = t.text; });
  }
  if (layers.dims) lv.dims.forEach(d => drawDim(d, gDims));
  if (layers.gaines) lv.gaines.forEach(g => drawGaine(g, gGaines));
  if (layers.elec) lv.devices.forEach(d => {
    const g = el('g', { transform: `translate(${d.x},${d.y}) rotate(${d.rot || 0})`, 'data-k': 'devices', 'data-id': d.id, style: 'cursor:pointer' }, gDev);
    g.innerHTML = deviceSymbol(d.type, s * 1.0, pref('device'), pref('canvas'));
    const t = el('text', { x: 17 * s, y: -10 * s, 'font-size': 10 * s, 'font-family': 'DejaVu Sans Mono, monospace', 'font-weight': 700, fill: pref('device'), transform: `rotate(${-(d.rot || 0)})`, 'paint-order': 'stroke', stroke: pref('canvas'), 'stroke-width': 3 * s }, g);
    t.textContent = d.ref || '';
  });
  $('#canvaswrap').classList.toggle('editing', !!edit);
  drawSelection(); drawDraft(); drawSnapMark(); renderProps(); renderNomen(); drawRulers();
}
// pas affiché : le pas d'accrochage, ou un multiple rond (10, 20, 50 cm, 1, 2, 5 m…) quand on dézoome ; lignes marquées sur des mètres ronds (1, 5, 10, 50 m)
const NICE = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
function gridSteps() {
  const g = opt.grid, min = pxToWorld(14);
  const step = g >= min ? g : NICE.find(n => n >= min && n % g === 0) || NICE[NICE.length - 1];
  return { step, major: [100, 500, 1000, 5000, 10000, 50000].find(n => n >= step * 4 && n % step === 0) || step * 10 };
}
function drawGrid() {
  const { step, major } = gridSteps(), on = v => Math.abs(v / major - Math.round(v / major)) < 1e-6;
  $('#sGrid').textContent = tr('carreau {0}', fmtLen(step));
  const x0 = Math.floor(view.x / step) * step, y0 = Math.floor(view.y / step) * step;
  if (view.w / step > 400 || !pref('gridShow')) { drawAxes(); return; }
  for (let x = x0; x < view.x + view.w; x += step) el('line', { x1: x, y1: view.y, x2: x, y2: view.y + view.h, class: 'gridline' + (on(x) ? ' major' : '') }, gGrid);
  for (let y = y0; y < view.y + view.h; y += step) el('line', { x1: view.x, y1: y, x2: view.x + view.w, y2: y, class: 'gridline' + (on(y) ? ' major' : '') }, gGrid);
  drawAxes();
}
// axes de la scène passant par l'origine (classe gridline : retirés à l'export comme la grille)
function drawAxes() {
  if (!pref('axes')) return;
  if (view.y <= 0 && view.y + view.h >= 0) el('line', { x1: view.x, y1: 0, x2: view.x + view.w, y2: 0, class: 'gridline axis ax-x' }, gGrid);
  if (view.x <= 0 && view.x + view.w >= 0) el('line', { x1: 0, y1: view.y, x2: 0, y2: view.y + view.h, class: 'gridline axis ax-y' }, gGrid);
}
// règles : graduations en mètres alignées sur la vue, étendue de la sélection, position du curseur
const RULER = 20;
function drawRulers() {
  const rt = $('#rulerTop'), rl = $('#rulerLeft'), r = svg.getBoundingClientRect(); if (!rt || !r.width) return;
  const k = r.width / view.w, label = NICE.find(n => n * k >= 60) || NICE[NICE.length - 1], minor = label / (String(label)[0] === '2' ? 4 : 5);
  const dec = label % 100 === 0 ? 0 : label % 10 === 0 ? 1 : 2, txt = v => I18N.num((v / 100).toFixed(dec).replace(/^-0(\.0+)?$/, '0'));
  rt.innerHTML = ''; rl.innerHTML = '';
  const bs = selItems().map(it => { const o = (L()[it.kind] || []).find(x => x.id === it.id); return o && itemBBox(it.kind, o); }).filter(Boolean);
  if (bs.length) {
    const x0 = (Math.min(...bs.map(b => b[0])) - view.x) * k, x1 = (Math.max(...bs.map(b => b[2])) - view.x) * k, y0 = (Math.min(...bs.map(b => b[1])) - view.y) * k, y1 = (Math.max(...bs.map(b => b[3])) - view.y) * k;
    el('rect', { x: x0, y: 0, width: Math.max(1, x1 - x0), height: RULER, class: 'rsel' }, rt); el('rect', { x: 0, y: y0, width: RULER, height: Math.max(1, y1 - y0), class: 'rsel' }, rl);
  }
  const ticks = (start, len, put) => { for (let i = Math.ceil(start / minor), n = 0; i * minor <= start + len && n < 3000; i++, n++) { const v = i * minor, big = Math.abs(v / label - Math.round(v / label)) < 1e-6; put((v - start) * k, big, v); } };
  ticks(view.x, view.w, (x, big, v) => { x = Math.round(x) + .5; el('line', { x1: x, y1: big ? 4 : 14, x2: x, y2: RULER }, rt); if (big) el('text', { x: x + 3, y: 10 }, rt).textContent = txt(v); });
  ticks(view.y, view.h, (y, big, v) => { y = Math.round(y) + .5; el('line', { x1: big ? 4 : 14, y1: y, x2: RULER, y2: y }, rl); if (big) el('text', { x: 10, y: y - 3, transform: `rotate(-90 10 ${y - 3})` }, rl).textContent = txt(v); });
  el('line', { class: 'rcur', id: 'rcX', x1: -9, y1: 0, x2: -9, y2: RULER }, rt); el('line', { class: 'rcur', id: 'rcY', x1: 0, y1: -9, x2: RULER, y2: -9 }, rl);
  rulerCursor();
}
function rulerCursor() {
  const a = $('#rcX'), b = $('#rcY'); if (!a || !b) return; const k = svg.getBoundingClientRect().width / view.w;
  const x = (cursor[0] - view.x) * k, y = (cursor[1] - view.y) * k;
  a.setAttribute('x1', x); a.setAttribute('x2', x); b.setAttribute('y1', y); b.setAttribute('y2', y);
}
function drawOpening(o, parent, preview) {
  const ink = pref('device');
  const g = el('g', { transform: `translate(${o.x},${o.y}) rotate(${o.angle || 0})`, 'data-k': 'openings', 'data-id': o.id || '' }, parent);
  const w = o.w, t = (o.thick || 20) + 2, half = w / 2;
  el('rect', { x: -half, y: -t / 2, width: w, height: t, fill: preview ? 'rgba(232,87,42,.15)' : pref('canvas') }, g);
  if (o.type === 'door') {
    const fx = o.flip ? -1 : 1, fy = o.side ? -1 : 1;
    el('line', { x1: -half * fx, y1: 0, x2: -half * fx, y2: -w * fy, stroke: ink, 'stroke-width': 2 }, g);
    el('path', { d: `M${-half * fx} ${-w * fy} A${w} ${w} 0 0 ${fx * fy > 0 ? 1 : 0} ${half * fx} 0`, fill: 'none', stroke: ink, 'stroke-width': 1, 'stroke-dasharray': '4 3' }, g);
    el('line', { x1: -half, y1: -t / 2, x2: -half, y2: t / 2, stroke: ink, 'stroke-width': 2 }, g);
    el('line', { x1: half, y1: -t / 2, x2: half, y2: t / 2, stroke: ink, 'stroke-width': 2 }, g);
  } else {
    el('rect', { x: -half, y: -t / 2, width: w, height: t, fill: 'none', stroke: ink, 'stroke-width': 1.5 }, g);
    el('line', { x1: -half, y1: 0, x2: half, y2: 0, stroke: ink, 'stroke-width': 1.2 }, g);
    el('line', { x1: -half, y1: -t / 6, x2: half, y2: -t / 6, stroke: ink, 'stroke-width': .8 }, g);
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
// gaine courbe (Bézier) : g.curve = true ; g.h[i] = poignée sortante du nœud i (appareils et coudes), l'entrante est son opposée (nœud lisse)
function autoHandles(pts) {
  const n = pts.length;
  return pts.map((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], f = i === 0 || i === n - 1 ? 3 : 6; return [(b[0] - a[0]) / f, (b[1] - a[1]) / f].map(v => Math.round(v * 10) / 10); });
}
function gaineHandles(g, pts) { if (!Array.isArray(g.h) || g.h.length !== pts.length) g.h = autoHandles(pts); return g.h; }
// tronçons [départ, contrôle 1, contrôle 2, arrivée] ; contrôles null pour un tronçon droit
function gaineSegs(g) {
  const pts = gainePts(g);
  if (!g.curve) return pts.slice(1).map((p, i) => [pts[i], null, null, p]);
  const h = gaineHandles(g, pts);
  return pts.slice(1).map((p, i) => [pts[i], [pts[i][0] + h[i][0], pts[i][1] + h[i][1]], [p[0] - h[i + 1][0], p[1] - h[i + 1][1]], p]);
}
function bezAt(s, t) {
  if (!s[1]) return [0, 1].map(k => s[0][k] + (s[3][k] - s[0][k]) * t);
  const u = 1 - t; return [0, 1].map(k => u * u * u * s[0][k] + 3 * u * u * t * s[1][k] + 3 * u * t * t * s[2][k] + t * t * t * s[3][k]);
}
function gainePath(g) {
  const S = gaineSegs(g); if (!S.length) return '';
  return 'M' + S[0][0].join(' ') + S.map(s => s[1] ? ` C${s[1].join(' ')} ${s[2].join(' ')} ${s[3].join(' ')}` : ` L${s[3].join(' ')}`).join('');
}
// polyligne approchée (sélection, longueur) ; seg[j] = tronçon d'origine du segment j
function gaineSample(g) {
  const S = gaineSegs(g), pts = [], seg = [];
  S.forEach((s, i) => { const n = s[1] ? 24 : 1; for (let k = i ? 1 : 0; k <= n; k++) { pts.push(bezAt(s, k / n)); if (k) seg.push(i); } });
  return { pts, seg };
}
function gaineLen(g) { const { pts } = gaineSample(g); return pts.slice(1).reduce((s, p, i) => s + G.dist(pts[i], p), 0); }
function drawGaine(g, parent) {
  const pts = gainePts(g); if (pts.length < 2) return;
  const k = GAINE_KINDS[g.kind] || GAINE_KINDS.pwr, d = gainePath(g), S = gaineSegs(g);
  el('path', { d, class: 'g-gaine', stroke: k.color, 'stroke-dasharray': k.dash, 'stroke-width': 2.4 }, parent);
  el('path', { d, class: 'g-hit', 'data-k': 'gaines', 'data-id': g.id }, parent);
  // étiquette au milieu du plus long tronçon
  let bi = 0, bl = -1; for (let i = 0; i < pts.length - 1; i++) { const l = G.dist(pts[i], pts[i + 1]); if (l > bl) { bl = l; bi = i; } }
  const m = bezAt(S[bi], 0.5), s = P.settings.symbol || 1, w = (String(g.num).length * 7 + 8) * s;
  const lg = el('g', { transform: `translate(${m[0]},${m[1]})`, 'data-k': 'gaines', 'data-id': g.id, style: 'cursor:pointer' }, parent);
  el('rect', { x: -w / 2, y: -8 * s, width: w, height: 16 * s, rx: 3 * s, fill: pref('canvas'), stroke: k.color, 'stroke-width': 1.2 * s }, lg);
  const t = el('text', { y: 3.6 * s, 'text-anchor': 'middle', 'font-family': 'DejaVu Sans Mono, monospace', 'font-weight': 700, 'font-size': 10 * s, fill: k.color }, lg); t.textContent = g.num;
}
function selShape() {
  if (!sel) return null;
  const lv = L(), o = (lv[sel.kind] || []).find(x => x.id === sel.id); if (!o) return null;
  return shapeOf(sel.kind, o);
}
// ---------- étiquettes d'espace : nom (et surface) de l'espace, objet à part qu'on déplace, pivote et met à l'échelle ----------
// une étiquette par espace (créée au centre s'il n'en a pas) ; celle d'un espace supprimé disparaît
function syncLabels(lv) {
  const ids = new Set(lv.rooms.map(r => r.id)); lv.labels = (lv.labels || []).filter(l => ids.has(l.space));
  const have = new Set(lv.labels.map(l => l.space));
  lv.rooms.forEach(r => { if (have.has(r.id)) return; const c = G.centroid(r.pts); lv.labels.push({ id: uid('l'), space: r.id, x: r1(c[0]), y: r1(c[1]), rot: 0, size: 1, area: pref('showArea') }); });
}
const labelOf = r => L().labels.find(l => l.space === r.id);
function labelPts(lb) {   // contour approché du texte, tourné avec l'étiquette
  const r = L().rooms.find(x => x.id === lb.space), k = (P.settings.symbol || 1) * (lb.size || 1), fs = 14 * k;
  const w = Math.max(String(r ? r.name : '').length * fs * 0.6, lb.area !== false ? 11 * k * 6.5 : 0, fs) / 2 + 4 * k, top = -fs - 2 * k, bot = (lb.area !== false ? 16 * k : 0) + 5 * k;
  const a = (lb.rot || 0) * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
  return [[-w, top], [w, top], [w, bot], [-w, bot]].map(([x, y]) => [lb.x + x * cs - y * sn, lb.y + x * sn + y * cs]);
}
// un espace entraîne son étiquette (déplacer, pivoter, échelle, dupliquer)
function withLabels(items) {
  const rooms = new Set(items.filter(i => i.kind === 'rooms').map(i => i.id)), have = new Set(items.filter(i => i.kind === 'labels').map(i => i.id));
  return items.concat(L().labels.filter(l => rooms.has(l.space) && !have.has(l.id)).map(l => ({ kind: 'labels', id: l.id })));
}
async function renameSpace(r) { const v = await ask(tr('Nom'), r.name); if (v == null) return; commit(); r.name = v; markDirty(); render(); }
// ---------- mode édition (Tab), comme Blender : on édite les points des éléments choisis ----------
// edit = { items: [{ kind, id }], v: [{ kind, id, i }] } ; hors édition, on manipule des éléments entiers
let edit = null;
const EDITABLE = { walls: 1, rooms: 1, gaines: 1, dims: 1 };
const EDIT_HINT = 'Mode édition · clic ou zone : points · Maj+clic : ajouter · A : tous · G / R / S : déplacer, pivoter, échelle · E : prolonger · X : supprimer · double-clic : ajouter un point · Tab : quitter';
const editObj = it => (L()[it.kind] || []).find(x => x.id === it.id);
const isEditing = it => !!edit && edit.items.some(x => x.kind === it.kind && x.id === it.id);
const vKey = v => v.kind + ':' + v.id + ':' + v.i;
const vSel = v => !!edit && edit.v.some(x => vKey(x) === vKey(v));
// points éditables : un mur fermé n'a pas de point en double ; les extrémités d'une gaine suivent les appareils
function editPoints(kind, o) {
  if (kind === 'gaines') return (o.pts || []).map((p, k) => ({ i: k + 1, p }));
  if (kind === 'dims') return [{ i: 0, p: o.a }, { i: 1, p: o.b }];
  const n = kind === 'walls' && wallClosed(o) ? o.pts.length - 1 : o.pts.length;
  return o.pts.slice(0, n).map((p, i) => ({ i, p }));
}
const allPoints = () => edit.items.flatMap(it => { const o = editObj(it); return o ? editPoints(it.kind, o).map(({ i }) => ({ kind: it.kind, id: it.id, i })) : []; });
function enterEdit() {
  const items = selItems().filter(it => EDITABLE[it.kind]);
  if (!items.length) { toast(tr('Rien à éditer : sélectionne un mur, un espace, une gaine ou une cote.')); return; }
  edit = { items, v: [] }; setSel(items); setTool('select');
}
function exitEdit() { if (!edit) return; const items = edit.items.filter(editObj); edit = null; setSel(items); setTool(tool); }
function boxSelectPoints(a, b, add) {
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
  const hit = allPoints().filter(v => { const q = vtxGet(v.kind, editObj(v), v.i); return q[0] >= x0 && q[0] <= x1 && q[1] >= y0 && q[1] <= y1; });
  edit.v = add ? edit.v.concat(hit.filter(h => !vSel(h))) : hit;
}
function drawEdit() {
  const hs = pxToWorld(5);
  edit.items.forEach(it => { const o = editObj(it); if (!o) return; const sh = shapeOf(it.kind, o);
    if (sh.path) el('path', { d: sh.path, class: 'sel-outline' }, gOver); else el(sh.closed ? 'polygon' : 'polyline', { points: sh.pts.map(p => p.join(',')).join(' '), class: 'sel-outline' }, gOver);
    if (sh.ctl) sh.pts.forEach((p, i) => {   // poignées de Bézier : entrante (−1) et sortante (+1) de chaque nœud
      const h = sh.ctl[i], sides = [i > 0 ? -1 : 0, i < sh.pts.length - 1 ? 1 : 0].filter(Boolean);
      sides.forEach(sd => { const q = [p[0] + sd * h[0], p[1] + sd * h[1]]; el('line', { x1: p[0], y1: p[1], x2: q[0], y2: q[1], class: 'ctl-line' }, gOver); el('circle', { cx: q[0], cy: q[1], r: hs, class: 'ctl', 'data-id': it.id, 'data-c': i, 'data-s': sd }, gOver); });
    });
    editPoints(it.kind, o).forEach(({ i, p }) => el('rect', { x: p[0] - hs, y: p[1] - hs, width: 2 * hs, height: 2 * hs, class: 'handle' + (vSel({ kind: it.kind, id: it.id, i }) ? ' on' : ''), 'data-k': it.kind, 'data-id': it.id, 'data-h': i }, gOver));
  });
}
// segment d'un élément en édition sous la souris (double-clic : ajouter un point)
function editSegmentAt(p) {
  const tol = pxToWorld(8);
  for (const it of edit.items) { const o = editObj(it); if (!o) continue;
    if (it.kind === 'gaines') { const sm = gaineSample(o), r = G.polyDist(p, sm.pts, false); if (r.d < tol) return { it, o, r, seg: sm.seg[r.i] }; }
    else if (it.kind === 'walls') { const r = G.polyDist(p, o.pts, false); if (r.d < o.thick / 2 + tol) return { it, o, r, seg: r.i }; }
    else if (it.kind === 'rooms') { const r = G.polyDist(p, o.pts, true); if (r.d < tol * 1.5) return { it, o, r, seg: r.i }; }
  }
  return null;
}
// ---------- sélection multiple ----------
// sel = { kind, id } pour un élément, { kind: 'multi', items: [{ kind, id }, …] } pour plusieurs
const selItems = () => !sel ? [] : sel.kind === 'multi' ? sel.items : [sel];
function setSel(items) { sel = !items.length ? null : items.length === 1 ? items[0] : { kind: 'multi', items }; }
const isSel = it => selItems().some(x => x.kind === it.kind && x.id === it.id);
function moveItem(kind, o, d) {
  const mv = q => { q[0] += d[0]; q[1] += d[1]; };
  if (o.pts) o.pts.forEach(mv); else if (kind === 'dims') { mv(o.a); mv(o.b); } else { o.x += d[0]; o.y += d[1]; }
}
// éléments sélectionnables, selon les couches visibles
function selectable() {
  const lv = L(), out = [], add = k => lv[k].forEach(o => out.push({ kind: k, o }));
  if (layers.archi) ['walls', 'rooms', 'labels', 'openings', 'texts'].forEach(add);
  if (layers.elec) add('devices');
  if (layers.gaines) add('gaines');
  if (layers.dims) add('dims');
  return out;
}
function itemBBox(kind, o) {
  const bb = (pts, m = 0) => { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return [Math.min(...xs) - m, Math.min(...ys) - m, Math.max(...xs) + m, Math.max(...ys) + m]; };
  const s = P.settings.symbol || 1;
  if (kind === 'walls') return bb(o.pts, o.thick / 2);
  if (kind === 'rooms') return bb(o.pts);
  if (kind === 'labels') return bb(labelPts(o));
  if (kind === 'dims') return bb([o.a, o.b]);
  if (kind === 'gaines') return bb(gaineSample(o).pts);
  if (kind === 'devices') return bb([[o.x, o.y]], 14 * s);
  if (kind === 'openings') return bb([[o.x, o.y]], o.w / 2);
  const sz = o.size || 18; return [o.x, o.y - sz, o.x + String(o.text).length * sz * 0.6, o.y];   // texte
}
// sélection par zone : vers la droite = entièrement dedans, vers la gauche = touché (convention DAO)
function boxSelect(a, b, add) {
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]), cross = b[0] < a[0];
  const hit = selectable().filter(({ kind, o }) => { const [bx0, by0, bx1, by1] = itemBBox(kind, o);
    return cross ? bx0 <= x1 && bx1 >= x0 && by0 <= y1 && by1 >= y0 : bx0 >= x0 && bx1 <= x1 && by0 >= y0 && by1 <= y1; })
    .map(({ kind, o }) => ({ kind, id: o.id }));
  setSel(add ? selItems().concat(hit.filter(h => !isSel(h))) : hit);
}
function shapeOf(kind, o) {
  if (kind === 'walls' || kind === 'rooms') return { pts: o.pts, closed: kind === 'rooms', closedWall: kind === 'walls' && wallClosed(o) };
  if (kind === 'gaines') { const pts = gainePts(o); return { pts, closed: false, inner: true, path: gainePath(o), ctl: o.curve ? gaineHandles(o, pts) : null }; }
  if (kind === 'dims') return { pts: [o.a, o.b], closed: false };
  if (kind === 'labels') return { pts: labelPts(o), closed: true };
  return { box: [o.x, o.y] };
}
function drawSelection() {
  if (drag && drag.kind === 'box' && drag.cur) {
    const a = drag.start, b = drag.cur;
    el('rect', { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), width: Math.abs(b[0] - a[0]), height: Math.abs(b[1] - a[1]), class: 'selbox' + (b[0] < a[0] ? ' cross' : '') }, gOver);
  }
  if (edit) { drawEdit(); return; }
  if (sel && sel.kind === 'multi') {   // plusieurs éléments : contours seulement, sans poignées
    const lv = L();
    sel.items.forEach(it => { const o = (lv[it.kind] || []).find(x => x.id === it.id); if (!o) return; const sh = shapeOf(it.kind, o);
      if (sh.box) { const r = pxToWorld(20); el('rect', { x: sh.box[0] - r, y: sh.box[1] - r, width: 2 * r, height: 2 * r, class: 'sel-outline', rx: 3 }, gOver); }
      else if (sh.path) el('path', { d: sh.path, class: 'sel-outline' }, gOver);
      else el(sh.closed ? 'polygon' : 'polyline', { points: sh.pts.map(p => p.join(',')).join(' '), class: 'sel-outline' }, gOver); });
    return;
  }
  const sh = selShape(); if (!sh) return; const hs = pxToWorld(5);
  if (sh.box) { const r = pxToWorld(20); el('rect', { x: sh.box[0] - r, y: sh.box[1] - r, width: 2 * r, height: 2 * r, class: 'sel-outline', rx: 3 }, gOver); return; }
  if (sh.path) el('path', { d: sh.path, class: 'sel-outline' }, gOver);   // mode objet : contour seulement ; les points s'éditent avec Tab
  else el(sh.closed ? 'polygon' : 'polyline', { points: sh.pts.map(p => p.join(',')).join(' '), class: 'sel-outline' }, gOver);
}
// longueur saisie au clavier pendant le tracé (comme Blender / la DAO) : « 3.4 » en m, « 3.4<90 » avec un angle (0° = droite, 90° = haut)
function typedPt() {
  if (!draft || !draft.pts || !draft.pts.length || !draft.typed) return null;
  const from = draft.pts[draft.pts.length - 1], c = draft.cur || cursor;
  const [ls, as] = draft.typed.replace(/,/g, '.').split('<'), len = parseFloat(ls) * 100, a = parseFloat(as);
  if (!isFinite(len) || !len) return null;
  const ang = isFinite(a) ? -a * Math.PI / 180 : G.dist(c, from) < 0.5 ? 0 : Math.atan2(c[1] - from[1], c[0] - from[0]);
  return [from[0] + Math.cos(ang) * len, from[1] + Math.sin(ang) * len].map(v => Math.round(v * 10) / 10);
}
// ajoute un point au mur / à la pièce en cours ; fermer sur le premier point termine le tracé
function addDraftPt(q, tol = 0.5) {
  const from = draft.pts[draft.pts.length - 1], first = draft.pts[0]; draft.typed = '';
  if (!draft.extend && draft.pts.length >= 2 && G.dist(q, first) < tol) { draft.pts.push(first.slice()); finishPoly(); return; }
  if (G.dist(q, from) > 0.5) draft.pts.push(q);
  render();
}
function drawDraft() {
  if (!draft) return;
  if (draft.rect) {   // espace en cours : rectangle entre le premier angle et la souris, avec ses côtés
    const a = draft.rect, b = draft.cur || cursor, x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]), w = Math.abs(b[0] - a[0]), h = Math.abs(b[1] - a[1]), fs = pxToWorld(12);
    el('rect', { x: x0, y: y0, width: w, height: h, class: 'preview' }, gOver);
    const lab = (x, y, txt, anchor) => { const t = el('text', { x, y, 'text-anchor': anchor, 'font-size': fs, 'font-family': 'DejaVu Sans Mono, monospace', 'font-weight': 700, fill: '#e8572a', 'paint-order': 'stroke', stroke: pref('canvas'), 'stroke-width': pxToWorld(3) }, gOver); t.textContent = txt; };
    lab(x0 + w / 2, y0 - pxToWorld(8), G.fmtM(w) + ' m', 'middle'); lab(x0 + w + pxToWorld(8), y0 + h / 2 + fs / 3, G.fmtM(h) + ' m', 'start');
    return;
  }
  const c = typedPt() || draft.cur || cursor;
  if (draft.pts) {
    const pts = draft.pts.concat([c]);
    if (tool === 'wall') el('polyline', { points: pts.map(p => p.join(',')).join(' '), fill: 'none', stroke: 'rgba(232,87,42,.35)', 'stroke-width': draft.thick || opt.thick, 'stroke-linejoin': 'miter' }, gOver);
    el('polyline', { points: pts.map(p => p.join(',')).join(' '), class: 'preview' }, gOver);
    if (pts.length >= 2) { const a = pts[pts.length - 2]; const t = el('text', { x: c[0] + pxToWorld(10), y: c[1] - pxToWorld(10), 'font-size': pxToWorld(12), 'font-family': 'DejaVu Sans Mono, monospace', fill: '#e8572a' }, gOver); t.textContent = draft.typed ? I18N.num(draft.typed.replace(/,/g, '.')) + '▏ m' : G.fmtM(G.dist(a, c)) + ' m'; if (draft.typed) t.setAttribute('font-weight', 700); }
  }
  if (draft.ghost) { drawOpening(draft.ghost, gOver, true); drawOpeningGuides(draft.ghost); }
}

// ---------- tests de sélection ----------
function hitTest(p) {
  const lv = L(), tol = pxToWorld(8), s = P.settings.symbol || 1;
  if (layers.elec) for (let i = lv.devices.length - 1; i >= 0; i--) { const d = lv.devices[i]; if (G.dist(p, [d.x, d.y]) < 18 * s + tol) return { kind: 'devices', id: d.id }; }
  if (layers.gaines) for (const g of lv.gaines) { if (G.polyDist(p, gaineSample(g).pts, false).d < tol) return { kind: 'gaines', id: g.id }; }
  if (layers.archi) {
    for (const lb of lv.labels) { if (G.inPoly(p, labelPts(lb))) return { kind: 'labels', id: lb.id }; }
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
  if (draft && draft.pts && draft.pts.length >= 2 && tool === 'wall') finishPoly();
  if (edit && t !== 'select') { setSel(edit.items.filter(editObj)); edit = null; }
  tool = t; draft = null; rotStep = 0;
  $$('#tools button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
  const H = { select: 'Clic : sélectionner · glisser dans le vide ou B : zone · A : tout · Tab : éditer les points · G déplacer · R pivoter · S échelle · E prolonger un mur · Maj+D dupliquer · X effacer · Maj+A : outils', pan: 'Glisser pour déplacer la vue · molette : zoom · partout : clic molette pour déplacer, Ctrl + clic molette pour zoomer',
    wall: 'Clics successifs · longueur au clavier (3.4 ou 3.4<90) + Entrée · double-clic ou Entrée : terminer · Échap : annuler · Maj : angle libre', room: 'Glisser d\'un angle à l\'autre, ou clic puis clic · Alt : sans grille · Échap : annuler · largeur et hauteur dans Propriétés',
    door: 'Clic sur un mur pour poser la porte · s\'aimante au milieu du mur · R : tourner le battant · Maj+R : inverser', window: 'Clic sur un mur pour poser la fenêtre · s\'aimante au milieu du mur',
    dim: 'Clic sur le premier point, puis le second', text: 'Clic pour placer un texte', device: 'Type : « {0} » (onglet Appareils) · clic pour placer',
    gaine: 'Clic sur l\'appareil de départ, clics pour les coudes, clic sur l\'appareil d\'arrivée', calib: 'Clic sur 2 points du fond de plan dont tu connais la distance' };
  hint(edit ? tr(EDIT_HINT) : H[t] && tr(H[t], tr((DT[devType] || {}).label || ''))); svg.style.cursor = t === 'pan' ? 'grab' : t === 'select' ? 'default' : 'crosshair';
  render();
}
// ---------- G / R / E à la Blender, sur la sélection ----------
// modal = { op: 'grab' | 'rotate', items, orig, start, pivot, axis, typed } ; la géométrie est recalculée depuis l'original à chaque mouvement
let modal = null;
const r1 = v => Math.round(v * 10) / 10;
function resetGeom(o, g) { for (const k of ['pts', 'x', 'y', 'a', 'b', 'size', 'rot', 'angle', 'h']) if (k in g) o[k] = JSON.parse(JSON.stringify(g[k])); }
function rotateItem(kind, o, c, a) {   // a en radians, sens de l'écran (positif = horaire, Y vers le bas)
  const cs = Math.cos(a), sn = Math.sin(a), rot = q => { const dx = q[0] - c[0], dy = q[1] - c[1]; q[0] = r1(c[0] + dx * cs - dy * sn); q[1] = r1(c[1] + dx * sn + dy * cs); }, deg = a * 180 / Math.PI;
  if (o.pts) o.pts.forEach(rot);
  if (kind === 'dims') { rot(o.a); rot(o.b); }
  if (!o.pts && 'x' in o) { const q = [o.x, o.y]; rot(q); o.x = q[0]; o.y = q[1]; }
  if (kind === 'devices') o.rot = Math.round((((o.rot || 0) + deg) % 360 + 360) % 360 * 10) / 10;
  if (kind === 'openings') o.angle = Math.round(((o.angle || 0) + deg) * 10) / 10;
  if (kind === 'labels') o.rot = Math.round((((o.rot || 0) + deg) % 360 + 360) % 360 * 10) / 10;
  if (kind === 'gaines' && Array.isArray(o.h)) o.h = o.h.map(v => [r1(v[0] * cs - v[1] * sn), r1(v[0] * sn + v[1] * cs)]);
}
function scaleItem(kind, o, c, fx, fy, resize) {   // resize : étiquettes seules dans la sélection → leur taille change   // positions et tracés ; l'épaisseur des murs et la taille des symboles ne changent pas
  const sc = q => { q[0] = r1(c[0] + (q[0] - c[0]) * fx); q[1] = r1(c[1] + (q[1] - c[1]) * fy); };
  if (o.pts) o.pts.forEach(sc);
  if (kind === 'dims') { sc(o.a); sc(o.b); }
  if (!o.pts && 'x' in o) { const q = [o.x, o.y]; sc(q); o.x = q[0]; o.y = q[1]; }
  if (kind === 'labels' && resize) o.size = Math.min(10, Math.max(0.2, Math.round((o.size || 1) * (Math.abs(fx - 1) > Math.abs(fy - 1) ? fx : fy) * 100) / 100));
  if (kind === 'gaines' && Array.isArray(o.h)) o.h = o.h.map(v => [r1(v[0] * fx), r1(v[1] * fy)]);
}
function startModal(op) {
  if (edit && !edit.v.length) { toast(tr('Aucun point sélectionné.')); return; }
  const lv = L(), base = edit ? [...new Map(edit.v.map(v => [v.kind + ':' + v.id, { kind: v.kind, id: v.id }])).values()] : withLabels(selItems());
  const items = base.map(it => ({ kind: it.kind, id: it.id, o: (lv[it.kind] || []).find(x => x.id === it.id) })).filter(x => x.o);
  if (!items.length) return;
  commit();
  let pivot = null;
  if (op === 'rotate' || op === 'scale') {   // centre de la sélection ; un appareil, une ouverture ou un texte seul tourne sur lui-même
    if (items.length === 1 && !items[0].o.pts && 'x' in items[0].o) pivot = [items[0].o.x, items[0].o.y];
    else { const b = items.map(x => itemBBox(x.kind, x.o)); pivot = [(Math.min(...b.map(v => v[0])) + Math.max(...b.map(v => v[2]))) / 2, (Math.min(...b.map(v => v[1])) + Math.max(...b.map(v => v[3]))) / 2]; }
  }
  const verts = edit ? edit.v.slice() : null, objs = Object.fromEntries(items.map(x => [x.kind + ':' + x.id, x.o]));
  if (verts && op !== 'grab') { const q = verts.map(v => vtxGet(v.kind, objs[v.kind + ':' + v.id], v.i)); pivot = [q.reduce((s, v) => s + v[0], 0) / q.length, q.reduce((s, v) => s + v[1], 0) / q.length]; }   // centre des points choisis
  modal = { op, items, verts, objs, orig: items.map(x => JSON.parse(JSON.stringify(x.o))), start: cursor.slice(), pivot, axis: null, typed: '', alt: false, shift: false };
  updateModal(cursor);
}
function updateModal(p) {
  const m = modal; m.items.forEach((x, i) => resetGeom(x.o, m.orig[i]));
  const num = parseFloat(m.typed.replace(/,/g, '.')), typed = m.typed && isFinite(num), shown = m.typed ? I18N.num(m.typed.replace(/,/g, '.')) + '▏' : null;
  if (m.op === 'grab') {
    let d;
    if (typed) {   // distance tapée : le long de l'axe bloqué (Y positif = vers le haut), sinon vers la souris
      const len = num * 100, v = [p[0] - m.start[0], p[1] - m.start[1]], l = Math.hypot(v[0], v[1]);
      d = m.axis === 'x' ? [len, 0] : m.axis === 'y' ? [0, -len] : l < 0.5 ? [len, 0] : [v[0] / l * len, v[1] / l * len];
    } else {
      d = [p[0] - m.start[0], p[1] - m.start[1]];
      if (m.axis === 'x') d[1] = 0; if (m.axis === 'y') d[0] = 0;
      if (m.ctrl) { d = snapGrab(m, d); if (m.axis === 'x') d[1] = 0; if (m.axis === 'y') d[0] = 0; }   // libre par défaut ; Ctrl : points proches, sinon grille (comme Blender)
    }
    d = d.map(r1);
    if (m.verts) m.verts.forEach(v => { const o = m.objs[v.kind + ':' + v.id], q = vtxGet(v.kind, o, v.i); vtxSet(v.kind, o, v.i, [r1(q[0] + d[0]), r1(q[1] + d[1])]); });
    else m.items.forEach(x => moveItem(x.kind, x.o, d));
    if (!m.ctrl || typed) m.snapAt = null;
    hint(tr('Déplacer : {0} m{1} · X / Y : bloquer un axe · Ctrl : points proches et grille · tape une distance · clic ou Entrée : valider · Échap ou clic droit : annuler', shown || G.fmtM(Math.hypot(d[0], d[1])), m.axis ? ' (' + tr(m.axis === 'x' ? 'axe X' : 'axe Y') + ')' : ''));
  } else if (m.op === 'scale') {
    const c = m.pivot, d0 = G.dist(m.start, c); let f;
    if (typed) f = num;
    else { f = d0 < 1 ? 1 : G.dist(p, c) / d0; if (m.ctrl) f = Math.round(f * 10) / 10; }   // libre par défaut ; Ctrl : pas de 0,1 (comme Blender)
    const fx = m.axis === 'y' ? 1 : f, fy = m.axis === 'x' ? 1 : f;
    if (m.verts) m.verts.forEach(v => { const o = m.objs[v.kind + ':' + v.id], q = vtxGet(v.kind, o, v.i); vtxSet(v.kind, o, v.i, [r1(c[0] + (q[0] - c[0]) * fx), r1(c[1] + (q[1] - c[1]) * fy)]); });
    else { const lab = m.items.every(x => x.kind === 'labels'); m.items.forEach(x => scaleItem(x.kind, x.o, c, fx, fy, lab)); }
    hint(tr('Mise à l\'échelle : ×{0}{1} · X / Y : un seul axe · Ctrl : pas de 0,1 · tape un facteur · clic ou Entrée : valider · Échap ou clic droit : annuler', shown || I18N.num(Math.round(f * 100) / 100), m.axis ? ' (' + tr(m.axis === 'x' ? 'axe X' : 'axe Y') + ')' : ''));
  } else {
    const c = m.pivot; let a;
    if (typed) a = -num * Math.PI / 180;   // angle tapé : positif = sens antihoraire à l'écran
    else { a = Math.atan2(p[1] - c[1], p[0] - c[0]) - Math.atan2(m.start[1] - c[1], m.start[0] - c[0]); if (m.ctrl) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12); }   // libre par défaut ; Ctrl : pas de 15°
    if (m.verts) { const cs = Math.cos(a), sn = Math.sin(a); m.verts.forEach(v => { const o = m.objs[v.kind + ':' + v.id], q = vtxGet(v.kind, o, v.i), dx = q[0] - c[0], dy = q[1] - c[1]; vtxSet(v.kind, o, v.i, [r1(c[0] + dx * cs - dy * sn), r1(c[1] + dx * sn + dy * cs)]); }); }
    else m.items.forEach(x => rotateItem(x.kind, x.o, c, a));
    const deg = Math.round(((((-a * 180 / Math.PI) + 180) % 360 + 360) % 360 - 180) * 10) / 10;   // arrondi après le modulo : pas de 36.8999…
    hint(tr('Pivoter : {0}° · Ctrl : pas de 15° · tape un angle · clic ou Entrée : valider · Échap ou clic droit : annuler', shown || I18N.num(deg)));
  }
  render();
  if (m.op === 'grab' && m.snapAt) { const r = pxToWorld(7); el('circle', { cx: m.snapAt[0], cy: m.snapAt[1], r, class: 'snap-mark' }, gOver); }
}
// G + Ctrl : un point de la sélection (sommet, centre d'un espace, position d'un appareil) vient se poser sur un point proche
// d'un autre élément ; sinon, celui qui en est le plus près se pose sur la grille
function snapPointsOf(kind, o) {
  if (kind === 'walls' || kind === 'rooms' || kind === 'gaines' || kind === 'dims') {
    const pts = editPoints(kind, o).map(({ i, p }) => ({ i, p }));
    if (kind === 'rooms') { const b = itemBBox(kind, o); pts.push({ i: 'c', p: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] }); }   // centre de l'espace
    return pts;
  }
  return 'x' in o ? [{ i: 0, p: [o.x, o.y] }] : [];
}
function snapGrab(m, d) {
  if (!m.refs) {   // calculés une fois, sur la géométrie d'origine
    const moving = new Set(m.items.map(x => x.kind + ':' + x.id)), vk = new Set((m.verts || []).map(v => v.kind + ':' + v.id + ':' + v.i));
    m.refs = m.verts ? m.verts.map(v => vtxGet(v.kind, m.objs[v.kind + ':' + v.id], v.i).slice()) : m.items.flatMap(x => snapPointsOf(x.kind, x.o).map(q => q.p.slice()));
    m.targets = []; const lv = L();
    ['walls', 'rooms', 'gaines', 'dims', 'devices', 'openings'].forEach(k => lv[k].forEach(o => { const key = k + ':' + o.id;
      if (moving.has(key) && !m.verts) return;
      snapPointsOf(k, o).forEach(({ i, p }) => { if (moving.has(key) && (i === 'c' || vk.has(key + ':' + i))) return; m.targets.push(p.slice()); }); }));
  }
  const tol = pxToWorld(12); let best = null, bd = tol;
  for (const r of m.refs) { const q = [r[0] + d[0], r[1] + d[1]]; for (const t of m.targets) { const e = Math.abs(q[0] - t[0]) + Math.abs(q[1] - t[1]); if (e < bd) { bd = e; best = { r, t }; } } }
  if (best) { m.snapAt = best.t; return [best.t[0] - best.r[0], best.t[1] - best.r[1]]; }
  m.snapAt = null; if (!m.refs.length) return d;
  const g = opt.grid; let bg = null;
  for (const r of m.refs) { const c = [Math.round((r[0] + d[0]) / g) * g - r[0], Math.round((r[1] + d[1]) / g) * g - r[1]], e = Math.hypot(c[0] - d[0], c[1] - d[1]); if (!bg || e < bg.e) bg = { c, e }; }
  return bg.c;
}
function endModal(ok) {
  const m = modal; modal = null;
  if (ok) markDirty(); else { m.items.forEach((x, i) => resetGeom(x.o, m.orig[i])); hist.u.pop(); }
  hint(''); setTool(tool);
}
// espace rectangulaire (quatre angles droits, même tourné) : largeur = premier côté, hauteur = second ; une autre forme n'en a pas
function rectOf(pts) {
  if (!pts || pts.length !== 4) return null;
  const e = i => [pts[(i + 1) % 4][0] - pts[i][0], pts[(i + 1) % 4][1] - pts[i][1]];
  for (let i = 0; i < 4; i++) { const a = e(i), b = e((i + 1) % 4), la = Math.hypot(a[0], a[1]), lb = Math.hypot(b[0], b[1]); if (la < 1 || lb < 1 || Math.abs(a[0] * b[0] + a[1] * b[1]) / (la * lb) > 0.002) return null; }
  const a = e(0), b = e(1), w = Math.hypot(a[0], a[1]), h = Math.hypot(b[0], b[1]);
  return { w, h, u: [a[0] / w, a[1] / w], v: [b[0] / h, b[1] / h] };
}
// nouvelle taille depuis le premier angle ; les murs construits pour l'espace suivent
function setRectSize(r, w, h) {
  const R = rectOf(r.pts); if (!R) return; const o = r.pts[0], at = (a, b) => [r1(o[0] + R.u[0] * a + R.v[0] * b), r1(o[1] + R.u[1] * a + R.v[1] * b)];
  r.pts = [o.slice(), at(w, 0), at(w, h), at(0, h)];
  spaceWalls(r).forEach(wl => { wl.pts = spaceWallPts(r, wl.thick, wl.spacePos); });
}
// murs construits autour d'un espace : des murs ordinaires, reliés à l'espace seulement pour pouvoir les retirer
const spaceWalls = r => L().walls.filter(w => w.space === r.id);
// position du mur par rapport au contour de l'espace : extérieur (la surface reste celle tracée), dans l'axe, ou intérieur
const WALL_POS = { out: 1, mid: 0, in: -1 };
function spaceWallPts(r, thick, pos) { const q = G.offsetOut(r.pts, (WALL_POS[pos] ?? 1) * thick / 2); return q.concat([q[0].slice()]); }
function addSpaceWalls(r, thick = opt.thick, pos = pref('wallPos')) {
  commit(); L().walls.push({ id: uid('w'), pts: spaceWallPts(r, thick, pos), thick, space: r.id, spacePos: pos }); markDirty(); render();
}
// nouvelle épaisseur ou position : les murs de l'espace sont recalculés depuis son contour
function setSpaceWalls(r, thick, pos) {
  commit(); spaceWalls(r).forEach(w => { w.thick = thick; w.spacePos = pos; w.pts = spaceWallPts(r, thick, pos); }); markDirty(); render();
}
function removeSpaceWalls(r) { const ids = new Set(spaceWalls(r).map(w => w.id)); if (!ids.size) return; commit(); L().walls = L().walls.filter(w => !ids.has(w.id)); markDirty(); render(); }
// ---------- points de contrôle (sommets de murs et d'espaces, coudes de gaines) ----------
const wallClosed = o => o.pts.length > 2 && G.dist(o.pts[0], o.pts[o.pts.length - 1]) < 0.5;
function vtxGet(kind, o, i) { return kind === 'gaines' ? o.pts[i - 1] : kind === 'dims' ? (i ? o.b : o.a) : o.pts[i]; }
function vtxSet(kind, o, i, q) {   // le premier point d'un mur fermé entraîne le dernier (même point)
  if (kind === 'gaines') o.pts[i - 1] = q;
  else if (kind === 'dims') { if (i) o.b = q; else o.a = q; }
  else { const closed = kind === 'walls' && wallClosed(o); o.pts[i] = q; if (closed && i === 0) o.pts[o.pts.length - 1] = q.slice(); }
}
function deleteVertices() {
  if (!edit || !edit.v.length) return;
  const groups = {}; edit.v.forEach(v => (groups[v.kind + ':' + v.id] ||= { kind: v.kind, id: v.id, idx: [] }).idx.push(v.i));
  const list = Object.values(groups);
  for (const g of list) {   // vérifier tous les minimums avant de toucher à quoi que ce soit
    const o = editObj(g); if (!o) continue;
    if (g.kind === 'dims') { toast(tr('Une cote garde ses deux points.')); return; }
    if (g.kind === 'walls' || g.kind === 'rooms') { const closed = g.kind === 'walls' && wallClosed(o), n = closed ? o.pts.length - 1 : o.pts.length, min = g.kind === 'rooms' || closed ? 3 : 2;
      if (n - new Set(g.idx).size < min) { toast(tr('Il faut garder au moins {0} points.', min)); return; } }
  }
  commit();
  for (const g of list) {
    const o = editObj(g); if (!o) continue; const idx = [...new Set(g.idx)].sort((a, b) => b - a);
    if (g.kind === 'gaines') idx.forEach(i => { o.pts.splice(i - 1, 1); if (Array.isArray(o.h)) o.h.splice(i, 1); });
    else { const closed = g.kind === 'walls' && wallClosed(o), pts = closed ? o.pts.slice(0, -1) : o.pts.slice(); idx.forEach(i => pts.splice(i, 1)); o.pts = closed ? pts.concat([pts[0].slice()]) : pts; }
  }
  edit.v = []; markDirty(); render();
}
// E sur un point : prolonger le mur depuis son extrémité, ou partir d'un nouveau mur depuis ce point
function extrudeVertex() {
  const v = edit.v[0], o = editObj(v); if (!o) return;
  const i = v.i, pt = vtxGet(v.kind, o, i).slice(), id = o.id, isWall = v.kind === 'walls';
  if (isWall && !wallClosed(o) && (i === 0 || i === o.pts.length - 1)) {
    setTool('wall'); sel = { kind: 'walls', id }; draft = { pts: [pt], extend: { id, atStart: i === 0 }, thick: o.thick };
  } else { setTool('wall'); draft = { pts: [pt], thick: isWall ? o.thick : opt.thick, back: true }; }   // back : revenir à la sélection une fois le mur fini
  hint(tr('Prolonger le mur : clics ou longueur au clavier · double-clic ou Entrée : terminer · Échap : annuler')); render();
}
// E : prolonger le mur sélectionné depuis son extrémité la plus proche de la souris (les points s'ajoutent au même mur)
function extrudeWall() {
  const w = findById('walls', sel.id); if (!w) return false;
  const a = w.pts[0], b = w.pts[w.pts.length - 1];
  if (G.dist(a, b) < 0.5) { toast(tr('Ce mur est fermé : rien à prolonger.')); return true; }
  const atStart = G.dist(cursor, a) < G.dist(cursor, b), id = w.id;
  setTool('wall'); sel = { kind: 'walls', id };
  draft = { pts: [(atStart ? a : b).slice()], extend: { id, atStart }, thick: w.thick };
  hint(tr('Prolonger le mur : clics ou longueur au clavier · double-clic ou Entrée : terminer · Échap : annuler')); render();
  return true;
}
function finishPoly() {
  if (draft.extend) {
    const w = findById('walls', draft.extend.id), add = draft.pts.slice(1), id = draft.extend.id;
    if (w && add.length) { commit(); w.pts = draft.extend.atStart ? add.reverse().concat(w.pts) : w.pts.concat(add); markDirty(); }
    draft = null; setTool('select'); sel = { kind: 'walls', id }; render(); return;
  }
  const pts = draft.pts;
  if (tool === 'wall' && pts.length >= 2) { commit(); const w = { id: uid('w'), pts, thick: draft.thick || opt.thick }; L().walls.push(w); markDirty();
    if (draft.back) { draft = null; setTool('select'); sel = { kind: 'walls', id: w.id }; render(); return; } }
  draft = null; render();
}
// espace : un rectangle entre deux angles opposés ; il reste sélectionné pour régler largeur et hauteur dans Propriétés
function finishRect(b) {
  const a = draft.rect, x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]); draft = null;
  if (x1 - x0 < 1 || y1 - y0 < 1) { render(); return; }
  commit(); const r = { id: uid('r'), name: tr('Espace {0}', L().rooms.length + 1), pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] };
  L().rooms.push(r); sel = { kind: 'rooms', id: r.id }; markDirty(); render();
}

// ---------- événements souris ----------
let drag = null, panning = null, zooming = null, spaceDown = false, lastDown = null, boxArmed = false, lastClient = [0, 0];
svg.addEventListener('pointerdown', async e => {
  svg.setPointerCapture(e.pointerId);
  if (modal) { endModal(e.button === 0); return; }   // clic gauche : valider ; clic droit ou molette : annuler
  // double-clic détecté ici : chaque clic redessine le plan, le navigateur ne relie donc plus les deux clics et n'envoie pas « dblclick »
  const now = performance.now(), dbl = e.button === 0 && lastDown && now - lastDown.t < 400 && Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) < 6;
  lastDown = dbl || e.button !== 0 ? null : { t: now, x: e.clientX, y: e.clientY };
  if (dbl && !spaceDown && tool !== 'pan') { onDouble(e); return; }
  const p = worldPt(e);
  // bouton du milieu : déplacer la vue (pas d'orbite en 2D, donc sans Maj comme dans Blender) ; Ctrl + milieu : zoom
  if (e.button === 1 && (e.ctrlKey || e.metaKey)) { zooming = { y: e.clientY, w: view.w, c: p }; svg.style.cursor = 'zoom-in'; return; }
  if (e.button === 1 || tool === 'pan' || spaceDown) { panning = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; svg.style.cursor = 'grabbing'; return; }
  if (e.button !== 0) return;
  // poignées de sommet
  const c = e.target.closest && e.target.closest('.ctl');
  if (c && edit) { commit(); drag = { kind: 'ctl', id: c.dataset.id, i: +c.dataset.c, s: +c.dataset.s, moved: false }; return; }
  const h = e.target.closest && e.target.closest('.handle');
  if (h && edit) {   // clic sur un point : le sélectionner (Maj : ajouter / retirer) ; glisser : déplacer
    const v = { kind: h.dataset.k, id: h.dataset.id, i: +h.dataset.h };
    if (e.shiftKey) { edit.v = vSel(v) ? edit.v.filter(x => vKey(x) !== vKey(v)) : edit.v.concat([v]); render(); return; }
    if (!vSel(v)) edit.v = [v];
    commit(); drag = { kind: 'vertex', v, moved: false, start: p, last: p }; render(); return;
  }
  if (tool === 'select' && edit) {   // en édition : glisser trace une zone de points ; un clic dans le vide les désélectionne
    boxArmed = false; if (!e.shiftKey) edit.v = [];
    drag = { kind: 'box', vbox: true, start: p, cur: null, add: e.shiftKey, x: e.clientX, y: e.clientY }; render(); return;
  }
  if (tool === 'select') {
    const hit = hitTest(p);
    if (hit && e.shiftKey) { setSel(isSel(hit) ? selItems().filter(x => !(x.kind === hit.kind && x.id === hit.id)) : selItems().concat([hit])); render(); return; }   // Maj+clic : ajouter / retirer
    // l'intérieur d'une pièce non sélectionnée se comporte comme du vide : glisser y trace une zone, un simple clic sélectionne la pièce
    const roomFloor = hit && hit.kind === 'rooms' && !isSel(hit);
    if (boxArmed) { boxArmed = false; if (!e.shiftKey) sel = null; drag = { kind: 'box', start: p, cur: null, add: e.shiftKey, x: e.clientX, y: e.clientY, click: null }; render(); return; }
    if (hit && !roomFloor) { if (!isSel(hit)) sel = hit; commit(); drag = { kind: 'move', start: p, last: p, moved: false }; }   // un élément déjà sélectionné déplace tout le groupe
    else { if (!e.shiftKey) sel = null; drag = { kind: 'box', start: p, cur: null, add: e.shiftKey, x: e.clientX, y: e.clientY, click: roomFloor ? hit : null }; }
    render(); return;
  }
  if (tool === 'room') {   // comme une sélection par zone : glisser puis relâcher, ou clic, déplacer, clic
    const q = snapPt(p, e);
    if (!draft) { draft = { rect: q, cur: q, x: e.clientX, y: e.clientY, down: true }; render(); return; }
    finishRect(q); return;
  }
  if (tool === 'wall') {
    const from = draft && draft.pts.length ? draft.pts[draft.pts.length - 1] : null;
    const q = typedPt() || snapPt(p, e, from);
    if (!draft) { draft = { pts: [q] }; render(); return; }
    addDraftPt(q, pxToWorld(10)); return;
  }
  if (tool === 'door' || tool === 'window') {
    const { _seg, ...g } = ghostOpening(p, e); commit();
    L().openings.push(Object.assign(g, { id: uid('o') })); markDirty(); render(); return;
  }
  if (tool === 'dim') {
    const q = snapPt(p, e, draft && draft.pts ? draft.pts[0] : null);
    if (!draft) { draft = { pts: [q] }; render(); return; }
    commit(); L().dims.push({ id: uid('d'), a: draft.pts[0], b: q, offset: 40 }); draft = null; markDirty(); render(); return;
  }
  if (tool === 'text') {
    const q = snapPt(p, e); const t = await ask(tr('Texte'), ''); if (!t) return;
    commit(); L().texts.push({ id: uid('t'), x: q[0], y: q[1], text: t, size: 18 }); markDirty(); render(); return;
  }
  if (tool === 'device') {
    const q = snapPt(p, e); const T = DT[devType]; commit();
    const d = { id: uid('e'), type: devType, ref: nextRef(P, T.prefix), x: q[0], y: q[1], rot: 0, label: tr(T.label), circuit: '', mode: T.mode || '', height: '', note: '' };
    L().devices.push(d); sel = { kind: 'devices', id: d.id }; markDirty(); render(); return;
  }
  if (tool === 'gaine') {
    const d = deviceAt(p);
    if (!draft) { if (!d) { toast(tr('Commence la gaine sur un appareil.')); return; } draft = { a: d.id, pts: [], gaine: true }; render(); return; }
    if (d && d.id !== draft.a) { commit(); const g = { id: uid('g'), num: nextGaineNum(P), a: draft.a, b: d.id, pts: draft.pts, kind: 'pwr', tube: 'ICTA Ø25', content: '' }; L().gaines.push(g); sel = { kind: 'gaines', id: g.id }; draft = null; markDirty(); render(); return; }
    draft.pts.push(snapPt(p, e)); render(); return;
  }
  if (tool === 'calib') {
    if (!L().background) { toast(tr('Importe d\'abord un fond de plan.')); return; }
    if (!draft) { draft = { pts: [p] }; render(); return; }
    const a = draft.pts[0], measured = G.dist(a, p); draft = null; render();
    const v = await ask(tr('Distance réelle entre les 2 points (en mètres)'), I18N.num('5.00')); if (!v) return;
    const real = parseFloat(v.replace(',', '.')) * 100; if (!(real > 0) || !(measured > 0)) return;
    commit(); const b = L().background, f = real / measured; b.x = a[0] + (b.x - a[0]) * f; b.y = a[1] + (b.y - a[1]) * f; b.w *= f; b.h *= f; markDirty(); fit(); toast(tr('Fond mis à l\'échelle.')); return;
  }
});
svg.addEventListener('pointermove', e => {
  const p = worldPt(e); cursor = p; lastClient = [e.clientX, e.clientY]; rulerCursor();
  $('#sCoord').textContent = `x ${G.fmtM(p[0])} · y ${G.fmtM(p[1])} m`;
  if (snapMark || e.ctrlKey || e.metaKey) updateSnapMark(e);
  if (modal) { modal.alt = e.altKey; modal.shift = e.shiftKey; modal.ctrl = e.ctrlKey || e.metaKey; updateModal(p); return; }
  if (zooming) { const nw = Math.max(80, Math.min(40000, zooming.w * Math.exp((e.clientY - zooming.y) * 0.006))); zoomAt(view.w / nw, zooming.c[0], zooming.c[1]); return; }   // glisser vers le haut : zoom avant
  if (panning) { const r = svg.getBoundingClientRect(), k = view.w / r.width; view.x = panning.vx - (e.clientX - panning.x) * k; view.y = panning.vy - (e.clientY - panning.y) * k; applyView(); render(); return; }
  if (drag && drag.kind === 'box') { if (drag.cur || Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) { drag.cur = p; render(); } return; }
  if (drag && drag.kind === 'move' && sel && sel.kind === 'multi') {
    let d = [p[0] - drag.last[0], p[1] - drag.last[1]];
    if (opt.snap && !e.altKey) { const g = opt.grid; const tot = [p[0] - drag.start[0], p[1] - drag.start[1]].map(v => Math.round(v / g) * g); const done = [drag.last[0] - drag.start[0], drag.last[1] - drag.start[1]]; d = [tot[0] - done[0], tot[1] - done[1]]; drag.last = [drag.start[0] + tot[0], drag.start[1] + tot[1]]; }
    else drag.last = p;
    if (!d[0] && !d[1]) return; drag.moved = true;
    const lv = L(); withLabels(sel.items).forEach(it => { const o = (lv[it.kind] || []).find(x => x.id === it.id); if (o) moveItem(it.kind, o, d); });
    render(); return;
  }
  if (drag && drag.kind === 'ctl') {   // poignée de Bézier : la poignée opposée suit (nœud lisse)
    const o = findById('gaines', drag.id); if (!o) return;
    const pts = gainePts(o), n = pts[drag.i], h = gaineHandles(o, pts); drag.moved = true;
    h[drag.i] = [(p[0] - n[0]) * drag.s, (p[1] - n[1]) * drag.s].map(v => Math.round(v * 10) / 10);
    render(); return;
  }
  if (drag && drag.kind === 'vertex') {
    drag.moved = true;
    if (edit.v.length > 1) {   // plusieurs points : même décalage pour tous
      let d = [p[0] - drag.last[0], p[1] - drag.last[1]];
      if (opt.snap && !e.altKey) { const g = opt.grid, tot = [p[0] - drag.start[0], p[1] - drag.start[1]].map(v => Math.round(v / g) * g), done = [drag.last[0] - drag.start[0], drag.last[1] - drag.start[1]]; d = [tot[0] - done[0], tot[1] - done[1]]; drag.last = [drag.start[0] + tot[0], drag.start[1] + tot[1]]; }
      else drag.last = p;
      edit.v.forEach(v => { const o = editObj(v); if (!o) return; const q = vtxGet(v.kind, o, v.i); vtxSet(v.kind, o, v.i, [r1(q[0] + d[0]), r1(q[1] + d[1])]); });
    } else { const v = drag.v, o = editObj(v); if (o) vtxSet(v.kind, o, v.i, snapPt(p, e)); }
    render(); return;
  }
  if (drag && sel) {
    const lv = L(), o = (lv[sel.kind] || []).find(x => x.id === sel.id); if (!o) return;
    if (drag.kind === 'move') {
      let d = [p[0] - drag.last[0], p[1] - drag.last[1]];
      if (opt.snap && !e.altKey) { const g = opt.grid; const tot = [p[0] - drag.start[0], p[1] - drag.start[1]].map(v => Math.round(v / g) * g); const done = [drag.last[0] - drag.start[0], drag.last[1] - drag.start[1]]; d = [tot[0] - done[0], tot[1] - done[1]]; drag.last = [drag.start[0] + tot[0], drag.start[1] + tot[1]]; }
      else drag.last = p;
      if (!d[0] && !d[1]) return; drag.moved = true;
      withLabels([sel]).forEach(it => { const x = (lv[it.kind] || []).find(q => q.id === it.id); if (x) moveItem(it.kind, x, d); });
      render(); return;
    }
  }
  if (tool === 'room' && draft && draft.rect) { draft.cur = snapPt(p, e); render(); return; }
  if (tool === 'wall' || tool === 'dim') { if (draft) { const from = draft.pts[draft.pts.length - 1]; draft.cur = snapPt(p, e, from); render(); } return; }
  if (tool === 'gaine' && draft) { draft.cur = snapPt(p, e); renderGaineDraft(); return; }
  if (tool === 'calib' && draft) { draft.cur = p; render(); return; }
  if (tool === 'door' || tool === 'window') { draft = { ghost: ghostOpening(p, e) }; gOver.innerHTML = ''; drawSelection(); drawOpening(draft.ghost, gOver, true); drawOpeningGuides(draft.ghost); }
});
function renderGaineDraft() {
  gOver.innerHTML = ''; drawSelection();
  const a = L().devices.find(d => d.id === draft.a); if (!a) return;
  const pts = [[a.x, a.y], ...draft.pts, draft.cur || cursor];
  el('polyline', { points: pts.map(p => p.join(',')).join(' '), class: 'preview' }, gOver);
}
svg.addEventListener('pointerup', e => {
  if (panning || zooming) { panning = null; zooming = null; svg.style.cursor = tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : 'crosshair'; return; }
  if (tool === 'room' && draft && draft.rect && draft.down) { draft.down = false; if (Math.hypot(e.clientX - draft.x, e.clientY - draft.y) > 4) finishRect(draft.cur); return; }   // relâché après un glisser : l'espace est posé
  if (drag && drag.kind === 'box') { const b = drag; drag = null; if (b.vbox) { if (b.cur) boxSelectPoints(b.start, b.cur, b.add); } else if (b.cur) boxSelect(b.start, b.cur, b.add); else if (b.click) sel = b.click; render(); return; }   // simple clic : la pièce cliquée, ou rien dans le vide
  if (drag) { if (drag.moved) markDirty(); else hist.u.pop(); drag = null; render(); }
});
function onDouble(e) {
  if (tool === 'wall' && draft) { finishPoly(); return; }
  if (tool !== 'select') return;
  if (e.target.closest && e.target.closest('.ctl')) return;
  const h = e.target.closest && e.target.closest('.handle');
  if (edit && h) { edit.v = [{ kind: h.dataset.k, id: h.dataset.id, i: +h.dataset.h }]; deleteVertices(); return; }   // double-clic sur un point : le retirer
  const wp = worldPt(e);
  if (edit) {   // double-clic sur un tronçon d'un élément en édition : ajouter un point (aussitôt sélectionné)
    const s = editSegmentAt(wp); if (!s) return;
    const { it, o, r, seg } = s, p = snapPt(wp, e); commit();
    if (it.kind === 'gaines') {
      if (o.curve) { const q = [r.x, r.y].map(r1), hh = gaineHandles(o, gainePts(o)); o.pts.splice(seg, 0, q); hh.splice(seg + 1, 0, autoHandles(gainePts(o))[seg + 1]); }   // posé sur la courbe
      else o.pts.splice(seg, 0, p);
      edit.v = [{ kind: it.kind, id: it.id, i: seg + 1 }];
    } else { o.pts.splice(seg + 1, 0, p); edit.v = [{ kind: it.kind, id: it.id, i: seg + 1 }]; }
    markDirty(); render(); return;
  }
  const hit = hitTest(wp);
  if (hit && hit.kind === 'texts') { editText(hit.id); return; }
  if (hit && hit.kind === 'labels') { const r = findById('rooms', findById('labels', hit.id).space); if (r) renameSpace(r); return; }   // double-clic sur l'étiquette : renommer l'espace
  if (hit && EDITABLE[hit.kind]) { sel = hit; enterEdit(); }   // double-clic sur un mur, un espace, une gaine ou une cote : l'éditer
}
// zoom proportionnel au défilement : un pavé tactile envoie beaucoup de petits événements, une molette quelques gros
svg.addEventListener('wheel', e => {
  e.preventDefault(); const p = worldPt(e);
  const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
  zoomAt(Math.exp(-Math.max(-100, Math.min(100, dy)) * 0.0011 * pref('zoomSpeed') / 100), p[0], p[1]);
}, { passive: false });
svg.addEventListener('contextmenu', e => { e.preventDefault(); if (modal) return; if (draft) { if (tool === 'wall' && draft.pts && draft.pts.length >= 2) finishPoly(); else { draft = null; render(); } } });

// portée libre d'un tronçon de mur autour d'une position : entre les faces des murs qui s'y raccordent (angles, murs en T)
function wallSpan(w, i, along) {
  const a = w.pts[i], b = w.pts[i + 1], L2 = G.dist(a, b) || 1, ux = (b[0] - a[0]) / L2, uy = (b[1] - a[1]) / L2, n = w.pts.length;
  const closed = n > 2 && G.dist(w.pts[0], w.pts[n - 1]) < 0.5, cuts = [];
  const onOther = q => { let h = 0; for (const o of L().walls) if (o !== w && G.polyDist(q, o.pts, false).d < 1) h = Math.max(h, o.thick / 2); return h; };
  cuts.push({ t: 0, h: Math.max(i > 0 || closed ? w.thick / 2 : 0, onOther(a)) });
  cuts.push({ t: L2, h: Math.max(i < n - 2 || closed ? w.thick / 2 : 0, onOther(b)) });
  for (const o of L().walls) { if (o === w) continue;   // murs dont une extrémité ou un sommet touche ce tronçon
    for (const q of o.pts) { const t = (q[0] - a[0]) * ux + (q[1] - a[1]) * uy, d = Math.abs((q[0] - a[0]) * uy - (q[1] - a[1]) * ux);
      if (t > 1 && t < L2 - 1 && d < w.thick / 2 + 1) cuts.push({ t, h: o.thick / 2 }); } }
  cuts.sort((p, q) => p.t - q.t);
  let k = 0; while (k < cuts.length - 2 && cuts[k + 1].t <= along) k++;
  const s0 = cuts[k].t + cuts[k].h, s1 = cuts[k + 1].t - cuts[k + 1].h;
  return { s0, s1, mid: (s0 + s1) / 2, a, b, L: L2 };
}
function ghostOpening(p, e) {
  const type = tool === 'door' ? 'door' : 'window', w0 = type === 'door' ? pref('doorW') : pref('windowW');
  const nw = nearestWall(p); let x = p[0], y = p[1], angle = 0, thick = opt.thick, seg = null;
  if (nw) { const w = nw.w, i = nw.r.i, a = w.pts[i], b = w.pts[i + 1], L2 = G.dist(a, b) || 1; angle = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI; thick = w.thick;
    let along = nw.r.t * L2, mid = false; const sp = wallSpan(w, i, along);
    if (Math.abs(along - sp.mid) < pxToWorld(14)) { along = sp.mid; mid = true; }   // aimant : milieu exact de la portée libre
    else if (opt.snap) along = Math.round(along / 5) * 5;
    x = a[0] + (b[0] - a[0]) * along / L2; y = a[1] + (b[1] - a[1]) * along / L2; seg = { a, b, along, L: L2, mid, s0: sp.s0, s1: sp.s1 }; }
  angle += rotStep * 180;
  return { type, x, y, angle, w: w0, thick, flip: !!(rotStep & 2), side: false, _seg: seg };   // _seg : aperçu seulement, retiré à la pose
}
// repères pendant la pose : milieu du tronçon et distances des bords de l'ouverture aux extrémités
function drawOpeningGuides(g) {
  const sg = g._seg; if (!sg) return;
  const ux = (sg.b[0] - sg.a[0]) / sg.L, uy = (sg.b[1] - sg.a[1]) / sg.L, nx = -uy, ny = ux, mt = (sg.s0 + sg.s1) / 2, m = [sg.a[0] + ux * mt, sg.a[1] + uy * mt], h = g.thick / 2 + pxToWorld(6);
  el('line', { x1: m[0] - nx * h, y1: m[1] - ny * h, x2: m[0] + nx * h, y2: m[1] + ny * h, class: 'mid-tick' + (sg.mid ? ' on' : '') }, gOver);
  const d1 = sg.along - g.w / 2 - sg.s0, d2 = sg.s1 - sg.along - g.w / 2, off = g.thick / 2 + pxToWorld(16);
  const t = el('text', { x: g.x + nx * off, y: g.y + ny * off, 'text-anchor': 'middle', 'font-size': pxToWorld(12), 'font-family': 'DejaVu Sans Mono, monospace', 'font-weight': 700, fill: sg.mid ? '#0f6b5a' : '#e8572a', 'paint-order': 'stroke', stroke: pref('canvas'), 'stroke-width': pxToWorld(3) }, gOver);
  t.textContent = (sg.mid ? '◆ ' + tr('milieu') + ' · ' : '') + G.fmtM(d1) + ' | ' + G.fmtM(d2) + ' m';
}
async function editText(id) { const t = findById('texts', id); if (!t) return; const v = await ask(tr('Texte'), t.text); if (v == null) return; commit(); t.text = v; markDirty(); render(); }

// ---------- clavier ----------
document.addEventListener('keydown', e => {
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || document.querySelector('dialog[open]')) return;
  if ((e.key === 'Control' || e.key === 'Meta') && !modal) { updateSnapMark(e); return; }   // Ctrl seul : montrer l'accroche sans bouger la souris
  if (modal) {   // pendant G / R : seules ces touches comptent
    e.preventDefault();
    if (e.key === 'Enter') endModal(true);
    else if (e.key === 'Escape') endModal(false);
    else if ((modal.op === 'grab' || modal.op === 'scale') && /^[xy]$/i.test(e.key)) { const ax = e.key.toLowerCase(); modal.axis = modal.axis === ax ? null : ax; updateModal(cursor); }
    else if (/^[0-9.,-]$/.test(e.key)) { modal.typed += e.key; updateModal(cursor); }
    else if (e.key === 'Backspace') { modal.typed = modal.typed.slice(0, -1); updateModal(cursor); }
    else if (e.key === 'Shift') { modal.shift = true; updateModal(cursor); }
    else if (e.key === 'Control' || e.key === 'Meta') { modal.ctrl = true; updateModal(cursor); }
    return;
  }
  if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); if (!draft) { if (edit) exitEdit(); else enterEdit(); } return; }   // Tab : mode objet ↔ mode édition
  if (toolMenu) { e.preventDefault(); if (e.key === 'Escape') closeToolMenu(); else { const t = TOOL_KEYS[e.key.toLowerCase()]; if (t) { closeToolMenu(); setTool(t); } } return; }
  const k = e.key.toLowerCase();
  if ((e.code === 'Space' && e.shiftKey) || (k === 'a' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey)) { e.preventDefault(); openToolMenu(); return; }   // Maj+Espace / Maj+A : menu des outils
  if (e.code === 'Space') { spaceDown = true; svg.style.cursor = 'grab'; e.preventDefault(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); save(e.shiftKey); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'o') { e.preventDefault(); openFile(); return; }
  if (((e.ctrlKey || e.metaKey) && k === 'p') || e.key === 'F12') { e.preventDefault(); exportPDF(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'i' && edit) { e.preventDefault(); edit.v = allPoints().filter(v => !vSel(v)); render(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'a' && edit) { e.preventDefault(); edit.v = allPoints(); render(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'd' && edit) { e.preventDefault(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'i') { e.preventDefault(); const all = selectable().map(({ kind, o }) => ({ kind, id: o.id })); setSel(all.filter(it => !isSel(it))); render(); return; }   // inverser
  if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); duplicateSel(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'a') { e.preventDefault(); setTool('select'); setSel(selectable().map(({ kind, o }) => ({ kind, id: o.id }))); render(); return; }
  if (tool === 'wall' && draft && draft.pts && draft.pts.length && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (/^[0-9.,<-]$/.test(e.key)) { e.preventDefault(); draft.typed = (draft.typed || '') + e.key; render(); return; }
    if (e.key === 'Backspace') { e.preventDefault(); if (draft.typed) draft.typed = draft.typed.slice(0, -1); else if (draft.pts.length > 1) draft.pts.pop(); else draft = null; render(); return; }
    if (draft.typed && e.key === 'Escape') { draft.typed = ''; render(); return; }
    if (draft.typed && e.key === 'Enter') { const q = typedPt(); if (q) addDraftPt(q); else { draft.typed = ''; render(); } return; }
  }
  if (e.key === 'Escape' && edit && !draft) { if (edit.v.length) { edit.v = []; render(); } else exitEdit(); return; }   // Échap : désélectionner les points, puis quitter l'édition
  if (e.key === 'Escape') { if (draft) { draft = null; render(); } else if (sel) { sel = null; render(); } else setTool('select'); return; }
  if (e.key === 'Enter') { if (tool === 'wall' && draft) finishPoly(); return; }
  const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
  if (draft && draft.rect) return;
  if (e.key === 'Delete' || e.key === 'Backspace' || (k === 'x' && plain && !e.shiftKey && sel && !draft)) { if (edit) deleteVertices(); else deleteSel(); return; }
  if (k === 'r' && (tool === 'door' || tool === 'window')) { rotStep = e.shiftKey ? (rotStep ^ 2) : ((rotStep & 2) | ((rotStep & 1) ^ 1)); draft = { ghost: ghostOpening(cursor, e) }; render(); return; }
  // avec une sélection : G déplacer, R pivoter, E prolonger un mur (sinon ces touches choisissent un outil)
  if (edit && !draft && plain && !e.shiftKey) {   // mode édition : les touches agissent sur les points
    if (k === 'g') { startModal('grab'); return; }
    if (k === 'r') { startModal('rotate'); return; }
    if (k === 's') { startModal('scale'); return; }
    if (k === 'e') { if (edit.v.length === 1 && (edit.v[0].kind === 'walls' || edit.v[0].kind === 'rooms')) extrudeVertex(); else toast(tr('Sélectionne un seul point de mur ou d\'espace pour prolonger.')); return; }
    if (k === 'a') { edit.v = allPoints(); render(); return; }
  }
  if (edit && k === 'a' && e.altKey && !e.ctrlKey) { e.preventDefault(); edit.v = []; render(); return; }
  if (edit && e.shiftKey && k === 'd') return;
  if (sel && !draft && plain && !e.shiftKey) {
    if (k === 'g') { startModal('grab'); return; }
    if (k === 'r') { startModal('rotate'); return; }
    if (k === 's') { startModal('scale'); return; }
    if (k === 'e' && sel.kind === 'walls' && extrudeWall()) return;
    if (k === 'e' && sel.kind === 'rooms') { const r = findById('rooms', sel.id); if (r && !spaceWalls(r).length) { addSpaceWalls(r); return; } }   // E sur un espace : construire ses murs
  }
  if (sel && !draft && plain && e.shiftKey && k === 'd') { duplicateSel([0, 0]); startModal('grab'); return; }   // Maj+D : dupliquer puis déplacer
  // sélection et vue, comme dans Blender
  if (k === 'a' && e.altKey && !e.ctrlKey) { e.preventDefault(); sel = null; render(); return; }
  if (!draft && plain && !e.shiftKey) {
    if (k === 'a') { setTool('select'); setSel(selectable().map(({ kind, o }) => ({ kind, id: o.id }))); render(); return; }
    if (k === 'b') { setTool('select'); boxArmed = true; hint(tr('Sélection par zone : glisse un rectangle (vers la droite : entièrement dedans ; vers la gauche : touché)')); return; }
    if (k === 'n') { togglePane('no-panel'); return; }
    if (k === 't') { togglePane('no-tools'); return; }
  }
  if (e.key === 'Home') { fit(); return; }
  if (e.code === 'NumpadDecimal') { frameSelected(); return; }
  if (e.code === 'NumpadAdd' || e.code === 'NumpadSubtract') { zoomAt(e.code === 'NumpadAdd' ? 1.25 : 0.8, view.x + view.w / 2, view.y + view.h / 2); return; }
  if (e.key.startsWith('Arrow') && sel) { e.preventDefault(); const st = e.shiftKey ? 50 : opt.grid; const d = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[e.key]; nudge(d); return; }
  if (plain && !e.shiftKey && TOOL_KEYS[k] && k !== 't') setTool(TOOL_KEYS[k]);   // T masque la barre d'outils ; le texte est dans Maj+Espace
});
// seulement si l'appui sur Espace a lancé le déplacement de vue : sinon (frappe dans un champ) redessiner effacerait la saisie en cours
document.addEventListener('keyup', e => { if (modal && (e.key === 'Control' || e.key === 'Meta' || e.key === 'Shift')) { modal.ctrl = e.ctrlKey || e.metaKey; modal.shift = e.shiftKey; updateModal(cursor); } });
document.addEventListener('keyup', e => { if ((e.key === 'Control' || e.key === 'Meta') && snapMark) updateSnapMark(e); });
document.addEventListener('keyup', e => { if (e.code === 'Space' && spaceDown) { spaceDown = false; setTool(tool); } });
// ---------- menu des outils (Maj+A / Maj+Espace) et panneaux N / T ----------
const TOOL_KEYS = { v: 'select', w: 'wall', r: 'room', d: 'door', f: 'window', c: 'dim', t: 'text', e: 'device', g: 'gaine' };
const TOOL_MENU = [['select', 'Sélection', 'V'], ['wall', 'Mur', 'W'], ['room', 'Espace', 'R'], ['door', 'Porte', 'D'], ['window', 'Fenêtre', 'F'], ['dim', 'Cote', 'C'], ['text', 'Texte', 'T'], ['device', 'Appareil', 'E'], ['gaine', 'Gaine', 'G'], ['calib', 'Échelle', ''], ['pan', 'Vue', '']];
let toolMenu = null;
function openToolMenu() {
  closeToolMenu();
  const m = document.createElement('div'); m.className = 'toolmenu'; m.setAttribute('role', 'menu');
  m.innerHTML = `<b>${tr('Ajouter')}</b>` + TOOL_MENU.map(([t, l, key]) => `<button role="menuitem" data-mt="${t}"><span>${esc(tr(l))}</span><kbd>${key}</kbd></button>`).join('') +
    `<b>${tr('Appareils')}</b><div class="tm-dev">` + DEVICE_TYPES.map(d => `<button role="menuitem" data-md="${d.type}" title="${esc(tr(d.label))}"><svg viewBox="-28 -20 56 40">${deviceSymbol(d.type, 1, theme().fg, theme().surface)}</svg><span>${esc(tr(d.label))}</span></button>`).join('') + '</div>';
  document.body.appendChild(m);
  const r = m.getBoundingClientRect(), x = Math.min(lastClient[0], innerWidth - r.width - 8), y = Math.min(lastClient[1], innerHeight - r.height - 8);
  m.style.left = Math.max(8, x) + 'px'; m.style.top = Math.max(8, y) + 'px';
  m.addEventListener('click', ev => { const b = ev.target.closest('button'); if (!b) return; closeToolMenu();
    if (b.dataset.mt) setTool(b.dataset.mt); else { devType = b.dataset.md; renderLib(); setTool('device'); } });
  toolMenu = m; setTimeout(() => document.addEventListener('pointerdown', outsideMenu, true));
}
function outsideMenu(ev) { if (toolMenu && !toolMenu.contains(ev.target)) closeToolMenu(); }
function closeToolMenu() { if (toolMenu) { toolMenu.remove(); toolMenu = null; document.removeEventListener('pointerdown', outsideMenu, true); } }
function togglePane(cls) { document.body.classList.toggle(cls); requestAnimationFrame(() => { applyView(); render(); }); }
svg.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });   // pas de défilement automatique ni de collage au clic molette
function nudge(d) {
  if (edit) { if (!edit.v.length) return; commit(); edit.v.forEach(v => { const o = editObj(v); if (!o) return; const q = vtxGet(v.kind, o, v.i); vtxSet(v.kind, o, v.i, [r1(q[0] + d[0]), r1(q[1] + d[1])]); }); markDirty(); render(); return; }
  const lv = L(), list = withLabels(selItems()).map(it => [it.kind, (lv[it.kind] || []).find(x => x.id === it.id)]).filter(x => x[1]); if (!list.length) return;
  commit(); list.forEach(([k, o]) => moveItem(k, o, d)); markDirty(); render();
}
function deleteSel() {
  const items = selItems().filter(it => it.kind !== 'labels');   // une étiquette suit son espace : on ne la supprime pas seule
  if (!items.length) { if (sel) toast(tr('L\'étiquette suit son espace.')); return; }
  const lv = L(); commit();
  items.forEach(it => { lv[it.kind] = lv[it.kind].filter(o => o.id !== it.id); });
  const gone = new Set(items.filter(it => it.kind === 'devices').map(it => it.id));
  if (gone.size) { const n = lv.gaines.length; lv.gaines = lv.gaines.filter(g => !gone.has(g.a) && !gone.has(g.b)); const extra = n - lv.gaines.length; if (extra) toast(tr('{0} gaine(s) reliée(s) supprimée(s).', extra)); }
  sel = null; markDirty(); render();
}
// copies décalées de 50 cm ; une gaine est recopiée si ses deux appareils le sont aussi
function duplicateSel(off = [50, 50]) {
  const lv = L(), items = withLabels(selItems()).map(it => [it.kind, (lv[it.kind] || []).find(x => x.id === it.id)]).filter(x => x[1]);
  if (!items.some(([k]) => k !== 'gaines' && k !== 'labels')) return;
  commit(); const devMap = {}, spaceMap = {}, out = [], newWalls = [];
  items.sort((a, b) => (a[0] === 'labels') - (b[0] === 'labels'));   // les espaces avant leurs étiquettes
  items.filter(([k, o]) => k !== 'gaines' && (k !== 'labels' || spaceMap[o.space])).forEach(([k, o]) => {
    const c = JSON.parse(JSON.stringify(o)); c.id = uid(k[0]); moveItem(k, c, off);
    if (k === 'devices') { c.ref = nextRef(P, DT[c.type].prefix); devMap[o.id] = c.id; }
    if (k === 'rooms') spaceMap[o.id] = c.id;
    if (k === 'labels') c.space = spaceMap[o.space];
    if (k === 'walls') newWalls.push(c);
    lv[k].push(c); out.push({ kind: k, id: c.id });
  });
  newWalls.forEach(w => { if (w.space) { if (spaceMap[w.space]) w.space = spaceMap[w.space]; else delete w.space; } });   // la copie d'un mur suit la copie de son espace, sinon devient libre
  items.filter(([k, g]) => k === 'gaines' && devMap[g.a] && devMap[g.b]).forEach(([k, g]) => {
    const c = JSON.parse(JSON.stringify(g)); c.id = uid('g'); c.num = nextGaineNum(P); c.a = devMap[g.a]; c.b = devMap[g.b]; moveItem(k, c, off);
    lv.gaines.push(c); out.push({ kind: k, id: c.id });
  });
  setSel(out); markDirty(); render();
}
// en édition, annuler garde le mode (comme Blender) ; la sélection de points est vidée car les indices ont pu changer
function afterHistory() { if (edit) { edit.items = edit.items.filter(editObj); edit.v = []; if (edit.items.length) setSel(edit.items); else { edit = null; sel = null; } } else sel = null; }
function undo() { const s = hist.undo(P); if (!s) return; P = s; if (LI >= P.levels.length) LI = 0; afterHistory(); draft = null; markDirty(); renderLevels(); render(); }
function redo() { const s = hist.redo(P); if (!s) return; P = s; afterHistory(); markDirty(); renderLevels(); render(); }

// ---------- niveaux ----------
function renderLevels() {
  const box = $('#levels'); box.innerHTML = '';
  P.levels.forEach((lv, i) => { const b = document.createElement('button'); b.textContent = lv.name; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(i === LI)); b.title = tr('Double-clic : renommer');
    b.onclick = () => { if (i === LI) return; LI = i; sel = null; edit = null; draft = null; renderLevels(); render(); };   // onglet déjà actif : ne pas redessiner, sinon le double-clic (renommer) est perdu
    b.ondblclick = async () => { const v = await ask(tr('Nom du niveau'), lv.name); if (v) { commit(); lv.name = v; markDirty(); renderLevels(); } };
    box.appendChild(b); });
  const add = document.createElement('button'); add.className = 'add'; add.textContent = tr('+ Niveau'); add.onclick = async () => { const v = await ask(tr('Nom du nouveau niveau'), tr('Niveau {0}', P.levels.length)); if (!v) return; commit(); P.levels.push(newLevel(v, P.levels.length * 300)); LI = P.levels.length - 1; markDirty(); renderLevels(); render(); };
  box.appendChild(add);
}

// ---------- panneau Propriétés ----------
function field(label, html) { return `<label class="field"><span class="muted">${esc(tr(label))}</span>${html}</label>`; }
function renderProps() {
  const box = $('#tab-props'); const lv = L();
  if (edit) {
    const n = {}; edit.items.forEach(it => n[it.kind] = (n[it.kind] || 0) + 1);
    const W = { walls: ['mur', 'murs'], rooms: ['espace', 'espaces'], gaines: ['gaine', 'gaines'], dims: ['cote', 'cotes'] };
    box.innerHTML = `<span class="lbl">${tr('Mode édition')}</span><h3>${tr('{0} point(s) sélectionné(s)', edit.v.length)}</h3>
      <p class="muted">${Object.entries(n).map(([k, c]) => c + ' ' + tr(W[k][c > 1 ? 1 : 0])).join(' · ')}</p>
      <p class="muted">${tr('Clic ou zone : choisir des points · Maj+clic : ajouter · A : tous · G / R / S : déplacer, pivoter, mettre à l\'échelle · E : prolonger depuis un point · X : supprimer · double-clic sur un tronçon : ajouter un point · Échap : désélectionner')}</p>
      <div class="row"><button class="btn primary" data-act="editexit">${tr('Quitter l\'édition (Tab)')}</button></div>`;
    return;
  }
  if (sel && sel.kind === 'multi') {
    const n = {}; sel.items.forEach(it => n[it.kind] = (n[it.kind] || 0) + 1);
    const W = { walls: ['mur', 'murs'], rooms: ['espace', 'espaces'], labels: ['étiquette', 'étiquettes'], openings: ['ouverture', 'ouvertures'], texts: ['texte', 'textes'], devices: ['appareil', 'appareils'], gaines: ['gaine', 'gaines'], dims: ['cote', 'cotes'] };
    box.innerHTML = `<span class="lbl">${tr('Sélection|groupe')}</span><h3>${tr('{0} éléments', sel.items.length)}</h3>
      <p class="muted">${Object.entries(n).map(([k, c]) => c + ' ' + tr(W[k][c > 1 ? 1 : 0])).join(' · ')}</p>
      <p class="muted">${tr('Glisse ou G pour déplacer l\'ensemble · R pivoter · S échelle · flèches : décaler · X effacer · Maj+D dupliquer · Maj+clic : ajouter ou retirer · Alt+A : tout désélectionner')}</p>
      <div class="row">${sel.items.some(it => EDITABLE[it.kind]) ? `<button class="btn" data-act="editenter">${tr('Éditer (Tab)')}</button>` : ''}<button class="btn" data-act="dup">${tr('Dupliquer')}</button><button class="btn danger" data-act="del">${tr('Supprimer')}</button></div>`;
    return;
  }
  if (!sel) {
    const st = { walls: lv.walls.length, rooms: lv.rooms.length, openings: lv.openings.length, devices: lv.devices.length, gaines: lv.gaines.length };
    box.innerHTML = `<span class="lbl">${tr('Niveau')}</span><h3>${esc(lv.name)}</h3>
      ${field('Nom', `<input data-lv="name" value="${esc(lv.name)}">`)}
      ${field('Altitude (cm)', `<input data-lv="elevation" type="number" value="${lv.elevation || 0}">`)}
      <p class="muted">${tr('{0} murs · {1} espaces · {2} ouvertures · {3} appareils · {4} gaines', st.walls, st.rooms, st.openings, st.devices, st.gaines)}</p>
      ${lv.background ? `<div class="card"><span class="lbl">${tr('Fond de plan')}</span>${field('Opacité', `<input data-bg="opacity" type="range" min="0.05" max="1" step="0.05" value="${lv.background.opacity ?? .5}">`)}<div class="row"><button class="btn" data-act="calib">${tr('Mettre à l\'échelle')}</button><button class="btn danger" data-act="bgdel">${tr('Retirer')}</button></div></div>` : `<button class="btn" data-act="bg">${tr('Importer un fond de plan (image ou PDF)')}</button>`}
      <div class="card"><span class="lbl">${tr('Symboles')}</span>${field('Taille', `<input data-set="symbol" type="range" min="0.5" max="4" step="0.1" value="${P.settings.symbol || 2}">`)}</div>
      <div class="card"><span class="lbl">${tr('Circuits du projet')}</span>${circuitsTable()}<button class="btn" data-act="addcirc">${tr('+ Circuit')}</button></div>
      <p class="muted">${tr('Raccourcis (comme Blender) : clic molette : vue · Ctrl + clic molette : zoom · Origine : tout voir · Maj+A : outils · A : tout sélectionner · G / R / S : déplacer / pivoter / échelle · Maj+D : dupliquer · X : effacer · N / T : panneaux · W mur · R espace · D porte · F fenêtre · C cote · E appareil · G gaine · Ctrl+Z / Ctrl+Maj+Z')}</p>`;
  } else {
    const o = (lv[sel.kind] || []).find(x => x.id === sel.id); if (!o) { sel = null; return renderProps(); }
    let h = '';
    if (sel.kind === 'walls') { const len = o.pts.slice(1).reduce((s, p, i) => s + G.dist(o.pts[i], p), 0); h = `<span class="lbl">${tr('Mur')}</span><h3>${G.fmtM(len)} m</h3>${field('Épaisseur (cm)', `<input data-p="thick" type="number" value="${o.thick}">`)}<p class="muted">${tr('{0} points. Glisse les poignées pour modifier.', o.pts.length)}</p>`; }
    if (sel.kind === 'rooms') { const w0 = spaceWalls(o)[0];
      const walls = field('Ajouter les murs', `<input type="checkbox" data-sw="on" style="width:auto;justify-self:start" ${w0 ? 'checked' : ''}>`) + (w0 ? field('Épaisseur (cm)', `<input data-sw="thick" type="number" min="1" value="${w0.thick}">`)
        + field('Position', `<select data-sw="pos">${[['out', 'Extérieur'], ['mid', 'Dans l\'axe'], ['in', 'Intérieur']].map(([v, l]) => `<option value="${v}" ${(w0.spacePos || 'out') === v ? 'selected' : ''}>${tr(l)}</option>`).join('')}</select>`) : '');
      h = `<span class="lbl">${tr('Espace')}</span><h3>${esc(o.name)}</h3>${field('Nom', `<input data-p="name" value="${esc(o.name)}">`)}${(R => R ? field('Largeur (m)', `<input data-rect="w" type="number" step="0.01" min="0.01" value="${(R.w / 100).toFixed(2)}">`) + field('Hauteur (m)', `<input data-rect="h" type="number" step="0.01" min="0.01" value="${(R.h / 100).toFixed(2)}">`) : '')(rectOf(o.pts))}${field('Couleur', `<input data-p="color" type="color" value="${o.color || pref('room')}">`)}<p class="muted">${tr('Surface {0} m² · périmètre {1} m', G.fmtArea(o.pts), G.fmtM(o.pts.reduce((s, p, i) => s + G.dist(p, o.pts[(i + 1) % o.pts.length]), 0)))}</p>${field('Afficher la surface', `<input type="checkbox" data-larea style="width:auto;justify-self:start" ${(labelOf(o) || {}).area !== false ? 'checked' : ''}>`)}<span class="lbl">${tr('Murs')}</span>${walls}`; }
    if (sel.kind === 'labels') { const r = findById('rooms', o.space) || { name: '' };
      h = `<span class="lbl">${tr('Étiquette d\'espace')}</span><h3>${esc(r.name)}</h3>${field('Nom', `<input data-lname value="${esc(r.name)}">`)}${field('Taille (%)', `<input data-lsize type="number" min="20" max="1000" step="10" value="${Math.round((o.size || 1) * 100)}">`)}${field('Angle (°)', `<input data-p="rot" type="number" value="${Math.round(o.rot || 0)}">`)}${field('Afficher la surface', `<input type="checkbox" data-larea style="width:auto;justify-self:start" ${o.area !== false ? 'checked' : ''}>`)}<div class="row"><button class="btn" data-act="labelspace">${tr('Sélectionner l\'espace')}</button></div><p class="muted">${tr('Glisse ou G pour la déplacer · R pivoter · S taille · double-clic : renommer')}</p>`; }
    if (sel.kind === 'openings') h = `<span class="lbl">${tr(o.type === 'door' ? 'Porte' : 'Fenêtre')}</span>${field('Largeur (cm)', `<input data-p="w" type="number" value="${o.w}">`)}${field('Angle (°)', `<input data-p="angle" type="number" value="${Math.round(o.angle || 0)}">`)}${o.type === 'door' ? field('Battant', `<select data-p="flip"><option value="">${tr('Gauche')}</option><option value="1" ${o.flip ? 'selected' : ''}>${tr('Droite')}</option></select>`) + field('Ouverture', `<select data-p="side"><option value="">${tr('Côté 1')}</option><option value="1" ${o.side ? 'selected' : ''}>${tr('Côté 2')}</option></select>`) : ''}<div class="row"><button class="btn" data-act="center">${tr('Centrer sur le mur')}</button></div>`;
    if (sel.kind === 'dims') h = `<span class="lbl">${tr('Cote')}</span><h3>${G.fmtM(G.dist(o.a, o.b))} m</h3>${field('Décalage (cm)', `<input data-p="offset" type="number" value="${o.offset ?? 40}">`)}`;
    if (sel.kind === 'texts') h = `<span class="lbl">${tr('Texte')}</span>${field('Texte', `<input data-p="text" value="${esc(o.text)}">`)}${field('Taille', `<input data-p="size" type="number" value="${o.size || 18}">`)}`;
    if (sel.kind === 'devices') {
      const T = DT[o.type] || {};
      h = `<span class="lbl">${esc(T.label ? tr(T.label) : o.type)}</span><h3>${esc(o.ref)}</h3>
        ${field('Repère', `<input data-p="ref" value="${esc(o.ref)}">`)}
        ${field('Type', `<select data-p="type">${DEVICE_TYPES.map(d => `<option value="${d.type}" ${d.type === o.type ? 'selected' : ''}>${esc(tr(d.label))}</option>`).join('')}</select>`)}
        ${field('Désignation', `<input data-p="label" value="${esc(o.label || '')}">`)}
        ${field('Circuit', `<select data-p="circuit"><option value="">—</option>${P.circuits.map(c => `<option value="${c.id}" ${c.id === o.circuit ? 'selected' : ''}>${esc(c.name)} (${esc(c.cal)})</option>`).join('')}</select>`)}
        ${field('Mode', `<select data-p="mode">${['', 'S', 'VV', 'VV maître', 'VV esclave', 'ON', 'DM', 'DM/ON', 'BP'].map(m => `<option value="${m}" ${m === (o.mode || '') ? 'selected' : ''}>${m && tr(m)}</option>`).join('')}</select>`)}
        ${field('Hauteur (cm)', `<input data-p="height" value="${esc(o.height || '')}">`)}
        ${field('Note', `<textarea data-p="note">${esc(o.note || '')}</textarea>`)}
        <p class="muted">${tr('R : pivoter (90 puis Entrée pour un quart de tour). Liaisons : {0}', lv.gaines.filter(g => g.a === o.id || g.b === o.id).map(g => esc(g.num)).join(', ') || tr('aucune'))}</p>`;
    }
    if (sel.kind === 'gaines') {
      const a = lv.devices.find(d => d.id === o.a), b = lv.devices.find(d => d.id === o.b), len = gaineLen(o);
      h = `<span class="lbl">${tr('Gaine')}</span><h3>${esc(o.num)} · ${esc(a ? a.ref : '?')} → ${esc(b ? b.ref : '?')}</h3>
        ${field('Numéro', `<input data-p="num" value="${esc(o.num)}">`)}
        ${field('Nature', `<select data-p="kind">${Object.entries(GAINE_KINDS).map(([k, v]) => `<option value="${k}" ${k === o.kind ? 'selected' : ''}>${esc(tr(v.label))}</option>`).join('')}</select>`)}
        ${field('Conduit', `<input data-p="tube" value="${esc(o.tube || '')}">`)}
        ${field('Contenu', `<textarea data-p="content" placeholder="${tr('ex. R25.1, B25.1, T25.1')}">${esc(o.content || '')}</textarea>`)}
        ${field('Tracé', `<select data-p="curve"><option value="">${tr('Droit')}</option><option value="1" ${o.curve ? 'selected' : ''}>${tr('Courbe (Bézier)')}</option></select>`)}
        ${o.curve ? `<div class="row"><button class="btn" data-act="smooth">${tr('Lisser')}</button></div>` : ''}
        <p class="muted">${tr('Longueur sur plan ≈ {0} m. Glisse les coudes ; double-clic sur un coude dans l\'outil Sélection pour le retirer.', G.fmtM(len))}${o.curve ? ' ' + tr('Glisse les poignées rondes pour courber la gaine ; « Lisser » recalcule une courbe régulière.') : ''}</p>`;
    }
    box.innerHTML = h + `<div class="row">${EDITABLE[sel.kind] ? `<button class="btn" data-act="editenter">${tr('Éditer (Tab)')}</button>` : ''}<button class="btn" data-act="dup">${tr('Dupliquer')}</button><button class="btn danger" data-act="del">${tr('Supprimer')}</button></div>`;
  }
}
function circuitsTable() {
  if (!P.circuits.length) return `<p class="muted">${tr('Aucun circuit.')}</p>`;
  return `<table class="t"><thead><tr><th>${tr('Nom')}</th><th>${tr('Cal.')}</th><th>${tr('Sect.')}</th><th>${tr('Tab.')}</th><th></th></tr></thead><tbody>${P.circuits.map(c => `<tr><td><input class="inp" data-c="${c.id}" data-cf="name" value="${esc(c.name)}"></td><td><input class="inp" data-c="${c.id}" data-cf="cal" value="${esc(c.cal)}" style="width:52px"></td><td><input class="inp" data-c="${c.id}" data-cf="section" value="${esc(c.section)}" style="width:44px"></td><td><input class="inp" data-c="${c.id}" data-cf="tableau" value="${esc(c.tableau)}" style="width:44px"></td><td><button class="btn" data-delc="${c.id}" title="${tr('Supprimer')}">×</button></td></tr>`).join('')}</tbody></table>`;
}
$('#tab-props').addEventListener('change', e => {
  const t = e.target, lv = L();
  if (t.dataset.lv) { commit(); lv[t.dataset.lv] = t.type === 'number' ? +t.value : t.value; markDirty(); renderLevels(); render(); return; }
  if (t.dataset.bg) { commit(); lv.background[t.dataset.bg] = +t.value; markDirty(); render(); return; }
  if (t.dataset.set) { commit(); P.settings[t.dataset.set] = +t.value; markDirty(); render(); return; }
  if (t.dataset.c) { commit(); const c = P.circuits.find(x => x.id === t.dataset.c); c[t.dataset.cf] = t.value; markDirty(); return; }
  if (sel && (sel.kind === 'labels' || sel.kind === 'rooms') && ('larea' in t.dataset || 'lname' in t.dataset || 'lsize' in t.dataset)) {   // étiquette d'espace
    const lb = sel.kind === 'labels' ? findById('labels', sel.id) : labelOf(findById('rooms', sel.id)), r = lb && findById('rooms', lb.space); if (!lb || !r) return;
    if ('lsize' in t.dataset && !(+t.value >= 20)) { render(); return; }
    commit(); if ('larea' in t.dataset) lb.area = t.checked; if ('lname' in t.dataset) r.name = t.value; if ('lsize' in t.dataset) lb.size = Math.min(10, +t.value / 100);
    markDirty(); render(); return;
  }
  if (t.dataset.sw && sel && sel.kind === 'rooms') {   // murs de l'espace : case, épaisseur, position
    const r = findById('rooms', sel.id), w0 = r && spaceWalls(r)[0]; if (!r) return;
    if (t.dataset.sw === 'on') { if (t.checked && !w0) addSpaceWalls(r); else if (!t.checked) removeSpaceWalls(r); return; }
    if (!w0) return;
    const thick = t.dataset.sw === 'thick' ? +t.value : w0.thick, pos = t.dataset.sw === 'pos' ? t.value : w0.spacePos || 'out';
    if (!(thick >= 1)) { render(); return; } setSpaceWalls(r, thick, pos); return;
  }
  if (t.dataset.rect && sel && sel.kind === 'rooms') {
    const o = findById('rooms', sel.id), R = o && rectOf(o.pts), v = parseFloat(String(t.value).replace(',', '.')) * 100; if (!R || !(v >= 1)) { render(); return; }
    commit(); setRectSize(o, t.dataset.rect === 'w' ? v : R.w, t.dataset.rect === 'h' ? v : R.h); markDirty(); render(); return;
  }
  if (t.dataset.p && sel) {
    const o = (lv[sel.kind] || []).find(x => x.id === sel.id); if (!o) return; commit();
    let v = t.value; if (t.type === 'number') v = +v; if (t.dataset.p === 'flip' || t.dataset.p === 'side' || t.dataset.p === 'curve') v = !!t.value;
    if (t.dataset.p === 'curve') { if (v) o.h = autoHandles(gainePts(o)); else delete o.h; }
    if (t.dataset.p === 'color') o.color = v; else o[t.dataset.p] = v;
    markDirty(); render();
  }
});
// Entrée dans un champ d'une ligne : valider (la perte de focus déclenche « change »)
$('#tab-props').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); e.target.blur(); } });
$('#tab-props').addEventListener('input', e => { const t = e.target; if (t.dataset.bg === 'opacity') { L().background.opacity = +t.value; const im = gBg.querySelector('image'); if (im) im.setAttribute('opacity', t.value); } });
$('#tab-props').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.act === 'del') deleteSel();
  if (b.dataset.act === 'dup') duplicateSel();
  if (b.dataset.act === 'editenter') enterEdit();
  if (b.dataset.act === 'editexit') exitEdit();
  if (b.dataset.act === 'center' && sel && sel.kind === 'openings') {   // milieu du tronçon de mur sous l'ouverture, sens du battant conservé
    const o = findById('openings', sel.id), nw = o && nearestWall([o.x, o.y]);
    if (!nw) toast(tr('Aucun mur sous cette ouverture.'));
    else { const a = nw.w.pts[nw.r.i], c = nw.w.pts[nw.r.i + 1], L2 = G.dist(a, c) || 1, sp = wallSpan(nw.w, nw.r.i, nw.r.t * L2), ang = Math.atan2(c[1] - a[1], c[0] - a[0]) * 180 / Math.PI; commit();
      o.x = r1(a[0] + (c[0] - a[0]) * sp.mid / L2); o.y = r1(a[1] + (c[1] - a[1]) * sp.mid / L2); o.angle = Math.round((ang + Math.round(((o.angle || 0) - ang) / 180) * 180) * 10) / 10; o.thick = nw.w.thick; markDirty(); render(); }
  }
  if (b.dataset.act === 'labelspace' && sel && sel.kind === 'labels') { const lb = findById('labels', sel.id); if (lb) { sel = { kind: 'rooms', id: lb.space }; render(); } }
  if (b.dataset.act === 'smooth' && sel && sel.kind === 'gaines') { const o = findById('gaines', sel.id); if (o) { commit(); o.h = autoHandles(gainePts(o)); markDirty(); render(); } }
  if (b.dataset.act === 'bg') importBackground();
  if (b.dataset.act === 'calib') setTool('calib');
  if (b.dataset.act === 'bgdel') { commit(); L().background = null; markDirty(); render(); }
  if (b.dataset.act === 'addcirc') { commit(); P.circuits.push({ id: uid('c'), name: tr('Circuit {0}', P.circuits.length + 1), cal: '16A', section: '2,5', tableau: 'TD' }); markDirty(); render(); }
  if (b.dataset.delc) { commit(); P.circuits = P.circuits.filter(c => c.id !== b.dataset.delc); markDirty(); render(); }
});

// ---------- bibliothèque d'appareils ----------
function renderLib() {
  const groups = [...new Set(DEVICE_TYPES.map(d => d.group))];
  $('#tab-lib').innerHTML = groups.map(g => `<span class="lbl">${esc(tr(g))}</span><div class="libgrid">${DEVICE_TYPES.filter(d => d.group === g).map(d => `<button data-dev="${d.type}" aria-pressed="${d.type === devType}"><svg viewBox="-28 -20 56 40">${deviceSymbol(d.type, 1, theme().fg, theme().surface)}</svg>${esc(tr(d.label))}</button>`).join('')}</div>`).join('') +
    `<p class="muted">${tr('Choisis un type puis clique sur le plan. Le repère (P1, I2…) est attribué automatiquement et reste unique dans tout le projet.')}</p>`;
}
$('#tab-lib').addEventListener('click', e => { const b = e.target.closest('[data-dev]'); if (!b) return; devType = b.dataset.dev; renderLib(); setTool('device'); });

// ---------- nomenclature ----------
function renderNomen() {
  const box = $('#tab-nomen'); if (box.hidden) return;
  const rows = {}; P.levels.forEach(lv => lv.devices.forEach(d => { const k = d.type; rows[k] = rows[k] || { n: 0, per: {} }; rows[k].n++; rows[k].per[lv.name] = (rows[k].per[lv.name] || 0) + 1; }));
  const lv = L();
  box.innerHTML = `<span class="lbl">${tr('Appareils · tout le projet')}</span>
    <table class="t"><thead><tr><th>${tr('Type')}</th><th>${tr('Par niveau')}</th><th class="n">${tr('Total')}</th></tr></thead><tbody>${Object.entries(rows).map(([k, r]) => `<tr><td>${esc(DT[k] ? tr(DT[k].label) : k)}</td><td class="muted">${Object.entries(r.per).map(([l, n]) => tr('{0} : {1}', esc(l), n)).join(' · ')}</td><td class="n">${r.n}</td></tr>`).join('') || `<tr><td colspan="3" class="muted">${tr('Aucun appareil.')}</td></tr>`}</tbody></table>
    <span class="lbl">${tr('Gaines · {0}', esc(lv.name))}</span>
    <table class="t"><thead><tr><th>${tr('N°')}</th><th>${tr('De → vers')}</th><th>${tr('Contenu')}</th><th class="n">m</th></tr></thead><tbody>${lv.gaines.map(g => { const a = lv.devices.find(d => d.id === g.a), b = lv.devices.find(d => d.id === g.b), len = gaineLen(g); return `<tr><td><b>${esc(g.num)}</b></td><td>${esc(a ? a.ref : '?')} → ${esc(b ? b.ref : '?')}</td><td class="muted">${esc(g.content || '')}</td><td class="n">${G.fmtM(len)}</td></tr>`; }).join('') || `<tr><td colspan="4" class="muted">${tr('Aucune gaine.')}</td></tr>`}</tbody></table>
    <span class="lbl">${tr('Espaces · {0}', esc(lv.name))}</span>
    <table class="t"><tbody>${lv.rooms.map(r => `<tr><td>${esc(r.name)}</td><td class="n">${G.fmtArea(r.pts)} m²</td></tr>`).join('') || `<tr><td class="muted">${tr('Aucun espace.')}</td></tr>`}</tbody></table>
    <div class="row"><button class="btn" id="csvBtn">${tr('Exporter la nomenclature (CSV)')}</button></div>`;
  $('#csvBtn').onclick = exportCSV;
}
function exportCSV() {
  const sep = I18N.lang === 'fr' ? ';' : ',';           // séparateur attendu par les tableurs de chaque langue
  const row = a => a.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(sep);
  const lines = [row(['Niveau', 'Repère', 'Type', 'Désignation', 'Circuit', 'Mode', 'X (m)', 'Y (m)'].map(h => tr(h)))];
  P.levels.forEach(lv => lv.devices.forEach(d => lines.push(row([lv.name, d.ref, DT[d.type] ? tr(DT[d.type].label) : d.type, d.label || '', (P.circuits.find(c => c.id === d.circuit) || {}).name || '', d.mode || '', G.fmtM(d.x), G.fmtM(d.y)]))));
  lines.push(''); lines.push(row(['Niveau', 'Gaine', 'De', 'Vers', 'Nature', 'Conduit', 'Contenu'].map(h => tr(h))));
  P.levels.forEach(lv => lv.gaines.forEach(g => { const a = lv.devices.find(d => d.id === g.a), b = lv.devices.find(d => d.id === g.b); lines.push(row([lv.name, g.num, a ? a.ref : '', b ? b.ref : '', GAINE_KINDS[g.kind] ? tr(GAINE_KINDS[g.kind].label) : '', g.tube || '', g.content || ''])); }));
  saveTextFile('﻿' + lines.join('\n'), tr('{0} - nomenclature.csv', P.name || tr('projet')), 'csv');
}

// ---------- onglets ----------
$$('.tabs button').forEach(b => b.onclick = () => { $$('.tabs button').forEach(x => x.setAttribute('aria-selected', String(x === b))); $$('.tabbody').forEach(x => x.hidden = x.id !== 'tab-' + b.dataset.tab); if (b.dataset.tab === 'nomen') renderNomen(); if (b.dataset.tab === 'ai' && window.FPP_AI) window.FPP_AI.show(); });

// ---------- fichiers ----------
async function saveTextFile(data, name, ext) {
  if (API) { const p = await API.saveText({ data, suggested: name, ext }); if (p) toast(tr('Enregistré : {0}', p)); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data])); a.download = name; a.click();
}
async function save(as) {
  P.name = $('#projName').value || P.name;
  const data = JSON.stringify(P, null, 1);
  if (API) { const p = await API.saveProject({ path: as ? null : filePath, data, suggested: (P.name || tr('projet')) + '.elecplan.json' }); if (!p) return false; filePath = p; }
  else { await saveTextFile(data, (P.name || tr('projet')) + '.elecplan.json', 'json'); }
  dirty = false; clearAutosave(); syncDirty(); toast(tr('Projet enregistré.'));
  return true;
}
async function openFile(given) {   // given = { path, data } : fichier récent choisi dans le menu
  if (dirty && !(await confirmBox(tr('Le projet en cours n\'est pas enregistré. L\'abandonner ?'), tr('Abandonner')))) return;
  let txt = null;
  if (API) { const r = given && given.data != null ? given : await API.openProject(); if (!r) return; txt = r.data; filePath = r.path; }
  else { txt = await new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json'; i.onchange = () => { const f = i.files[0]; if (!f) return res(null); f.text().then(res); }; i.click(); }); if (!txt) return; filePath = null; }
  try { P = migrate(JSON.parse(txt)); } catch { toast(tr('Fichier illisible.')); return; }
  LI = 0; sel = null; edit = null; draft = null; hist.u = []; hist.r = []; dirty = false; clearAutosave(); syncDirty(); $('#projName').value = P.name || ''; renderLevels(); fit();
}
async function newFile() {
  if (dirty && !(await confirmBox(tr('Le projet en cours n\'est pas enregistré. L\'abandonner ?'), tr('Abandonner')))) return;
  P = newProject(); LI = 0; sel = null; edit = null; draft = null; filePath = null; hist.u = []; hist.r = []; dirty = false; clearAutosave(); syncDirty(); $('#projName').value = P.name; renderLevels(); fit();
}
async function importBackground() {
  let f = null;
  if (API) f = await API.pickImage();
  else f = await new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*,application/pdf'; i.onchange = () => { const x = i.files[0]; if (!x) return res(null); const r = new FileReader(); r.onload = () => res({ name: x.name, mime: x.type, base64: String(r.result).split(',')[1] }); r.readAsDataURL(x); }; i.click(); });
  if (!f) return;
  let src;
  if (f.mime === 'application/pdf') { if (!window.renderPdfFirstPage) { toast(tr('Lecteur PDF indisponible.')); return; } toast(tr('Lecture du PDF…')); src = await window.renderPdfFirstPage(f.base64); }
  else src = `data:${f.mime};base64,${f.base64}`;
  const img = new Image(); img.onload = () => {
    commit(); const w = 2000, h = w * img.naturalHeight / img.naturalWidth;   // largeur provisoire 20 m, à calibrer
    L().background = { src, name: f.name, x: 0, y: 0, w, h, opacity: 0.5 }; markDirty(); fit();
    toast(tr('Fond importé. Utilise l\'outil « Échelle » pour le mettre à la bonne dimension.'), 6000);
  }; img.src = src;
}

// ---------- export SVG / PDF ----------
function levelSVG(lv, forPrint) {
  const keepLI = LI, keepSel = sel, keepDraft = draft, keepView = { ...view };
  LI = P.levels.indexOf(lv); sel = null; draft = null; forceLight = true; syncGaineColors();
  const b = bounds(lv); Object.assign(view, b);
  render(); svg.setAttribute('viewBox', `${b.x} ${b.y} ${b.w} ${b.h}`);
  const clone = svg.cloneNode(true); clone.querySelectorAll('.gridline').forEach(n => n.remove());
  clone.querySelectorAll('.g-hit').forEach(n => n.remove());
  // styles résolus (le fichier CSS n'est pas embarqué)
  clone.querySelectorAll('.g-room').forEach(n => { if (!n.getAttribute('fill')) n.setAttribute('fill', pref('room')); });
  clone.querySelectorAll('.g-text').forEach(n => { n.setAttribute('font-family', 'DejaVu Sans, sans-serif'); n.setAttribute('font-weight', '600'); });   // même police que les étiquettes d'espace
  clone.querySelectorAll('.g-roomlab').forEach(n => { n.setAttribute('text-anchor', 'middle'); n.setAttribute('font-family', 'DejaVu Sans, sans-serif'); n.setAttribute('font-weight', '600'); n.setAttribute('fill', '#17201d'); });
  clone.querySelectorAll('.g-roomarea,.g-dimt').forEach(n => { n.setAttribute('text-anchor', 'middle'); n.setAttribute('font-family', 'DejaVu Sans Mono, monospace'); n.setAttribute('fill', '#3b4643'); });
  clone.querySelectorAll('.g-dim').forEach(n => { n.setAttribute('stroke', '#5d6b66'); n.setAttribute('fill', 'none'); if (!n.getAttribute('stroke-width')) n.setAttribute('stroke-width', '1'); });
  clone.querySelectorAll('.g-gaine').forEach(n => n.setAttribute('fill', 'none'));
  clone.setAttribute('xmlns', NS); clone.removeAttribute('id'); clone.removeAttribute('style');
  forceLight = false; syncGaineColors();
  LI = keepLI; sel = keepSel; draft = keepDraft; Object.assign(view, keepView); applyView(); render();
  return { svg: clone.outerHTML, b };
}
async function exportSVG() { const { svg: s } = levelSVG(L()); await saveTextFile('<?xml version="1.0" encoding="UTF-8"?>\n' + s, `${P.name} - ${L().name}.svg`, 'svg'); }
function pickScale(b, wmm, hmm) { for (const s of [20, 25, 50, 75, 100, 125, 150, 200, 250, 500, 1000]) { if (b.w * 10 / s <= wmm && b.h * 10 / s <= hmm) return s; } return 1000; }
async function exportPDF() {
  const date = new Date().toLocaleDateString(I18N.locale());
  const pages = P.levels.map(lv => {
    const { svg: s, b } = levelSVG(lv); const W = 400, H = 245, sc = pickScale(b, W, H), wmm = b.w * 10 / sc, hmm = b.h * 10 / sc;
    const sized = s.replace('<svg', `<svg width="${wmm}mm" height="${hmm}mm"`);
    const legend = [...new Set(lv.devices.map(d => d.type))].map(t => `<div class="lg"><svg viewBox="-28 -20 56 40" width="9mm" height="6.5mm">${deviceSymbol(t, 1)}</svg>${esc(tr(DT[t].label))}</div>`).join('');
    return `<section class="pg"><div class="draw">${sized}</div><div class="cart"><div class="c1"><b>${esc(P.name)}</b><span>${esc(lv.name)}</span></div><div class="c2">${legend}</div><div class="c3"><span>${tr('Échelle 1:{0}', sc)}</span><span>${date}</span><span>ElecPlan</span></div></div></section>`;
  }).join('');
  const html = `<!doctype html><html lang="${I18N.lang}"><meta charset="utf-8"><style>@page{size:A3 landscape;margin:0}body{margin:0;font-family:DejaVu Sans,sans-serif;color:#17201d}
  .pg{width:420mm;height:297mm;box-sizing:border-box;padding:10mm;display:flex;flex-direction:column;page-break-after:always;position:relative}
  .draw{flex:1;display:flex;align-items:center;justify-content:center;border:.4mm solid #17201d}
  .cart{height:24mm;margin-top:3mm;display:grid;grid-template-columns:90mm 1fr 60mm;border:.4mm solid #17201d}
  .cart>div{padding:2.5mm 4mm;border-right:.3mm solid #17201d;display:flex;flex-direction:column;justify-content:center;gap:1mm;font-size:3.2mm}
  .cart>div:last-child{border-right:0}.c1 b{font-size:5mm}.c2{flex-direction:row!important;flex-wrap:wrap;align-content:center;gap:1mm 5mm!important}
  .lg{display:flex;align-items:center;gap:1.5mm;font-size:2.8mm}.c3{font-family:DejaVu Sans Mono,monospace;font-size:3mm}</style>${pages}`;
  if (API) { const p = await API.exportPDF({ html, suggested: (P.name || tr('plan')) + '.pdf' }); if (p) toast(tr('PDF créé : {0}', p)); }
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
// fermeture demandée avec des modifications non enregistrées : le processus principal a déjà posé la question
if (API && API.onQuitRequest) API.onQuitRequest(async action => {
  if (action === 'save') { if (await save(false)) API.quitNow(); }   // dialogue d'enregistrement annulé : on reste
  else { clearAutosave(); API.quitNow(); }
});
if (API && API.onOpenFile) API.onOpenFile(r => openFile(r));
$('#bPrefs').onclick = openPrefs;
loadPrefs();
if (API) API.onMenu(m => ({ new: newFile, open: () => openFile(), recover: recoverAutosave, save: () => save(false), saveas: () => save(true), prefs: openPrefs, background: importBackground, pdf: exportPDF, svg: exportSVG, undo, redo }[m] || (() => {}))());

// ---------- langue ----------
// Les éléments statiques marqués data-i18n / data-i18n-title / data-i18n-aria gardent leur texte français d'origine comme clé.
function applyLang() {
  document.documentElement.lang = I18N.lang; $('#optLang').value = I18N.lang;
  $('#sCoord').textContent = `x ${G.fmtM(cursor[0])} · y ${G.fmtM(cursor[1])} m`;
  $$('[data-i18n]').forEach(n => { n.dataset.i18n ||= n.textContent.trim(); n.textContent = tr(n.dataset.i18n); });
  $$('[data-i18n-title]').forEach(n => { n.dataset.i18nTitle ||= n.title; n.title = tr(n.dataset.i18nTitle); });
  $$('[data-i18n-aria]').forEach(n => { n.dataset.i18nAria ||= n.getAttribute('aria-label'); n.setAttribute('aria-label', tr(n.dataset.i18nAria)); });
}
function setLang(l) {
  I18N.setLang(l);
  try { localStorage.setItem('elecplan-lang', I18N.lang); } catch {}
  // projet neuf et vide : recréer les noms par défaut (Niveau 0, circuits…) dans la nouvelle langue
  const empty = P.levels.every(l => !l.walls.length && !l.rooms.length && !l.devices.length && !l.texts.length && !l.background);
  if (!dirty && !filePath && !hist.u.length && empty) { P = newProject(); LI = 0; sel = null; $('#projName').value = P.name; }
  applyLang(); renderLevels(); renderLib(); setTool(tool); renderNomen();
  if (window.FPP_AI) window.FPP_AI.relabel();
}
$('#optLang').onchange = e => { if (API) API.setLang(e.target.value); setLang(e.target.value); };
if (API) API.onLang(setLang);

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
// démarrage : toujours un projet vide ; la copie de récupération (plantage) se recharge par Fichier → Récupérer le travail non enregistré
async function recoverAutosave() {
  let p = null; try { const a = localStorage.getItem('fpp-autosave'); if (a) p = JSON.parse(a); } catch {}
  if (!p || !p.levels) { toast(tr('Rien à récupérer.')); return; }
  if (dirty && !(await confirmBox(tr('Le projet en cours n\'est pas enregistré. L\'abandonner ?'), tr('Abandonner')))) return;
  P = migrate(p); LI = 0; sel = null; edit = null; draft = null; filePath = null; hist.u = []; hist.r = [];
  dirty = true; syncDirty(); $('#projName').value = P.name || ''; renderLevels(); fit(); toast(tr('Dernier travail non enregistré récupéré.'));
}
applyLang(); $('#projName').value = P.name; renderLevels(); renderLib(); setTool('select'); applyView(); fit();
})();
