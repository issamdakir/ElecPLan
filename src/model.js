// Modèle de données ElecPlan. Unités : centimètres. Y vers le bas.
const FPP_VERSION = 1;
const uid = (p = 'x') => p + Math.random().toString(36).slice(2, 8);

function newLevel(name, elevation = 0) {
  return { id: uid('lv'), name, elevation, background: null,
    walls: [], rooms: [], openings: [], dims: [], texts: [], devices: [], gaines: [] };
}
function newProject() {
  return { app: 'ElecPlan', version: FPP_VERSION, name: 'Nouveau projet', created: new Date().toISOString(),
    settings: { grid: 10, symbol: 2 },
    circuits: [
      { id: 'c1', name: 'Éclairage 1', cal: '10A', section: '1,5', tableau: 'TD' },
      { id: 'c2', name: 'Prises', cal: '20A', section: '2,5', tableau: 'TD' }
    ],
    levels: [newLevel('RDC', 0)] };
}
function migrate(p) {
  p.settings = Object.assign({ grid: 10, symbol: 2 }, p.settings || {});
  p.circuits = p.circuits || [];
  for (const l of p.levels) for (const k of ['walls', 'rooms', 'openings', 'dims', 'texts', 'devices', 'gaines']) l[k] = l[k] || [];
  return p;
}

// --- géométrie ---
const G = {
  dist: (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]),
  polyArea(pts) { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; },
  centroid(pts) { let x = 0, y = 0, a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; const f = p[0] * q[1] - q[0] * p[1]; x += (p[0] + q[0]) * f; y += (p[1] + q[1]) * f; a += f; } if (Math.abs(a) < 1e-6) { const n = pts.length; return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n]; } return [x / (3 * a), y / (3 * a)]; },
  segDist(p, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1; let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L; t = Math.max(0, Math.min(1, t)); return { d: Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy), t, x: a[0] + t * dx, y: a[1] + t * dy }; },
  polyDist(p, pts, closed) { let best = { d: Infinity }; const n = pts.length; for (let i = 0; i < n - (closed ? 0 : 1); i++) { const r = G.segDist(p, pts[i], pts[(i + 1) % n]); if (r.d < best.d) best = Object.assign(r, { i }); } return best; },
  inPoly(p, pts) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; },
  // polygone d'un mur épais (polyligne) — renvoie une liste de quadrilatères
  wallQuads(w) { const out = [], h = w.thick / 2; for (let i = 0; i < w.pts.length - 1; i++) { const a = w.pts[i], b = w.pts[i + 1], L = G.dist(a, b) || 1, nx = -(b[1] - a[1]) / L * h, ny = (b[0] - a[0]) / L * h; out.push([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]]); } return out; },
  fmtM: (cm) => (cm / 100).toFixed(2).replace('.', ',')
};

// --- numérotation des gaines : G01, G02… unique par projet, jamais réutilisée automatiquement ---
function nextGaineNum(p) {
  let m = 0; for (const l of p.levels) for (const g of l.gaines) { const n = parseInt(String(g.num).replace(/\D/g, ''), 10); if (n > m) m = n; }
  return 'G' + String(m + 1).padStart(2, '0');
}
// --- repères d'appareils : P1, P2… par préfixe, unique par projet ---
function nextRef(p, prefix) {
  let m = 0; const re = new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d+)$');
  for (const l of p.levels) for (const d of l.devices) { const r = re.exec(d.ref || ''); if (r && +r[1] > m) m = +r[1]; }
  return prefix + (m + 1);
}

// --- historique (annuler / rétablir) par instantanés ---
class History {
  constructor(limit = 120) { this.u = []; this.r = []; this.limit = limit; }
  push(state) { this.u.push(JSON.stringify(state)); if (this.u.length > this.limit) this.u.shift(); this.r = []; }
  undo(cur) { if (!this.u.length) return null; this.r.push(JSON.stringify(cur)); return JSON.parse(this.u.pop()); }
  redo(cur) { if (!this.r.length) return null; this.u.push(JSON.stringify(cur)); return JSON.parse(this.r.pop()); }
}
