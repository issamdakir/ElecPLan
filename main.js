// ElecPlan — processus principal Electron
// Fenêtre, fichiers projet (.elecplan.json), export PDF, et tâches IA en arrière-plan via Claude Code (claude -p).
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFile } = require('child_process');

let win;
const DATA = path.join(app.getPath('userData'));
const JOBS_DIR = path.join(DATA, 'jobs');
const SETTINGS_FILE = path.join(DATA, 'settings.json');
fs.mkdirSync(JOBS_DIR, { recursive: true });

function loadSettings() {
  try { return Object.assign({ claudePath: 'claude', model: '', allowBash: false }, JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))); }
  catch { return { claudePath: 'claude', model: '', allowBash: false }; }
}
function saveSettings(s) { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2)); }

function createWindow() {
  win = new BrowserWindow({
    width: 1500, height: 950, minWidth: 1000, minHeight: 650,
    title: 'ElecPlan',
    backgroundColor: '#f4f6f5',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  const menu = Menu.buildFromTemplate([
    { label: 'Fichier', submenu: [
      { label: 'Nouveau', accelerator: 'CmdOrCtrl+N', click: () => win.webContents.send('menu', 'new') },
      { label: 'Ouvrir…', accelerator: 'CmdOrCtrl+O', click: () => win.webContents.send('menu', 'open') },
      { label: 'Enregistrer', accelerator: 'CmdOrCtrl+S', click: () => win.webContents.send('menu', 'save') },
      { label: 'Enregistrer sous…', accelerator: 'CmdOrCtrl+Shift+S', click: () => win.webContents.send('menu', 'saveas') },
      { type: 'separator' },
      { label: 'Importer un fond de plan…', click: () => win.webContents.send('menu', 'background') },
      { label: 'Exporter en PDF…', accelerator: 'CmdOrCtrl+P', click: () => win.webContents.send('menu', 'pdf') },
      { label: 'Exporter en SVG…', click: () => win.webContents.send('menu', 'svg') },
      { type: 'separator' }, { role: 'quit', label: 'Quitter' } ] },
    { label: 'Édition', submenu: [
      { label: 'Annuler', accelerator: 'CmdOrCtrl+Z', click: () => win.webContents.send('menu', 'undo') },
      { label: 'Rétablir', accelerator: 'CmdOrCtrl+Shift+Z', click: () => win.webContents.send('menu', 'redo') },
      { type: 'separator' }, { role: 'copy', label: 'Copier' }, { role: 'paste', label: 'Coller' } ] },
    { label: 'Affichage', submenu: [ { role: 'reload', label: 'Recharger' }, { role: 'toggleDevTools', label: 'Outils développeur' }, { role: 'togglefullscreen', label: 'Plein écran' } ] }
  ]);
  Menu.setApplicationMenu(menu);
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ---------- Fichiers ----------
ipcMain.handle('file:open', async () => {
  const r = await dialog.showOpenDialog(win, { filters: [{ name: 'Projet ElecPlan', extensions: ['json'] }], properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return null;
  return { path: r.filePaths[0], data: fs.readFileSync(r.filePaths[0], 'utf8') };
});
ipcMain.handle('file:save', async (_e, { path: p, data, suggested }) => {
  let target = p;
  if (!target) {
    const r = await dialog.showSaveDialog(win, { defaultPath: suggested || 'projet.elecplan.json', filters: [{ name: 'Projet ElecPlan', extensions: ['json'] }] });
    if (r.canceled || !r.filePath) return null;
    target = r.filePath;
  }
  fs.writeFileSync(target, data);
  return target;
});
ipcMain.handle('file:image', async () => {
  const r = await dialog.showOpenDialog(win, { filters: [{ name: 'Image ou PDF', extensions: ['png', 'jpg', 'jpeg', 'webp', 'pdf'] }], properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const f = r.filePaths[0], ext = path.extname(f).slice(1).toLowerCase();
  const b64 = fs.readFileSync(f).toString('base64');
  const mime = ext === 'pdf' ? 'application/pdf' : ext === 'jpg' ? 'image/jpeg' : 'image/' + ext;
  return { name: path.basename(f), path: f, mime, base64: b64 };
});
ipcMain.handle('file:saveText', async (_e, { data, suggested, ext }) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: suggested, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, data); return r.filePath;
});

// ---------- Export PDF (fenêtre cachée + printToPDF, vectoriel) ----------
ipcMain.handle('pdf:export', async (_e, { html, suggested, landscape = true, pageSize = 'A3' }) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: suggested || 'plan.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled || !r.filePath) return null;
  const tmp = path.join(os.tmpdir(), 'fpp-print-' + Date.now() + '.html');
  fs.writeFileSync(tmp, html);
  const pw = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await pw.loadFile(tmp);
  await new Promise(res => setTimeout(res, 400));
  const pdf = await pw.webContents.printToPDF({ landscape, pageSize, printBackground: true, margins: { marginType: 'none' } });
  fs.writeFileSync(r.filePath, pdf); pw.destroy(); fs.unlink(tmp, () => {});
  return r.filePath;
});
ipcMain.handle('shell:open', (_e, p) => shell.openPath(p));
ipcMain.handle('shell:show', (_e, p) => shell.showItemInFolder(p));

// ---------- Réglages ----------
ipcMain.handle('settings:get', () => loadSettings());
ipcMain.handle('settings:set', (_e, s) => { saveSettings(Object.assign(loadSettings(), s)); return loadSettings(); });

// ---------- Claude Code : détection ----------
ipcMain.handle('ai:check', async () => {
  const s = loadSettings();
  return new Promise(res => {
    execFile(s.claudePath, ['--version'], { timeout: 15000 }, (err, stdout) => {
      if (err) res({ ok: false, error: err.code === 'ENOENT' ? 'Claude Code introuvable' : String(err.message || err) });
      else res({ ok: true, version: String(stdout).trim() });
    });
  });
});

// ---------- Tâches IA (file d'attente, une à la fois) ----------
const jobs = new Map();   // id -> {id, kind, title, status, dir, log[], proc, result}
const queue = [];
let running = null;

function pub(job) {
  const { proc, ...o } = job;
  if (win && !win.isDestroyed()) win.webContents.send('ai:update', o);
}
ipcMain.handle('ai:list', () => [...jobs.values()].map(({ proc, ...o }) => o));

ipcMain.handle('ai:submit', async (_e, { kind, title, prompt, files, allowBash }) => {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const dir = path.join(JOBS_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of files || []) {
    const buf = f.base64 != null ? Buffer.from(f.base64, 'base64') : Buffer.from(f.text || '', 'utf8');
    fs.writeFileSync(path.join(dir, f.name), buf);
  }
  fs.writeFileSync(path.join(dir, 'CONSIGNE.md'), prompt);
  const job = { id, kind, title, status: 'en attente', dir, log: [], created: Date.now(), allowBash: !!allowBash, result: null };
  jobs.set(id, job); queue.push(id); pub(job); pump();
  return id;
});
ipcMain.handle('ai:cancel', (_e, id) => {
  const j = jobs.get(id); if (!j) return false;
  if (j.proc) { try { j.proc.kill('SIGTERM'); } catch {} }
  const qi = queue.indexOf(id); if (qi >= 0) queue.splice(qi, 1);
  j.status = 'annulée'; pub(j); return true;
});
ipcMain.handle('ai:readResult', (_e, id) => {
  const j = jobs.get(id); if (!j) return null;
  const out = {};
  for (const f of fs.readdirSync(j.dir)) {
    if (/^(resultat\.json|rapport\.md)$/.test(f)) out[f] = fs.readFileSync(path.join(j.dir, f), 'utf8');
  }
  out.dir = j.dir;
  return out;
});

function pump() {
  if (running || !queue.length) return;
  const id = queue.shift(); const job = jobs.get(id); if (!job || job.status === 'annulée') return pump();
  running = id; job.status = 'en cours'; job.started = Date.now(); pub(job);
  const s = loadSettings();
  const tools = ['Read', 'Write', 'Edit', 'Glob', 'Grep'].concat(job.allowBash || s.allowBash ? ['Bash'] : []);
  const args = ['-p', 'Lis CONSIGNE.md dans le dossier courant et exécute-la entièrement. Ne pose aucune question : fais des hypothèses raisonnables et note-les dans le fichier de sortie.',
    '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits', '--allowedTools', tools.join(',')];
  if (!tools.includes('Bash')) args.push('--disallowedTools', 'Bash');
  if (s.model) args.push('--model', s.model);
  let proc;
  try { proc = spawn(s.claudePath, args, { cwd: job.dir, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { job.status = 'échec'; job.log.push('Impossible de lancer Claude Code : ' + e.message); running = null; pub(job); return pump(); }
  job.proc = proc;
  let buf = '';
  proc.stdout.on('data', d => {
    buf += d.toString();
    let i; while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue;
      try {
        const m = JSON.parse(line);
        if (m.type === 'assistant' && m.message && Array.isArray(m.message.content)) {
          for (const c of m.message.content) {
            if (c.type === 'text' && c.text.trim()) job.log.push(c.text.trim().slice(0, 600));
            if (c.type === 'tool_use') job.log.push('→ ' + c.name + (c.input && (c.input.file_path || c.input.command) ? ' ' + (c.input.file_path || c.input.command).toString().slice(0, 120) : ''));
          }
        } else if (m.type === 'result') {
          job.cost = m.total_cost_usd; job.turns = m.num_turns;
          if (m.is_error) job.log.push('Erreur : ' + (m.result || m.subtype));
        }
      } catch { job.log.push(line.slice(0, 300)); }
      if (job.log.length > 400) job.log.splice(0, job.log.length - 400);
      pub(job);
    }
  });
  proc.stderr.on('data', d => { job.log.push('! ' + d.toString().trim().slice(0, 400)); pub(job); });
  proc.on('error', e => { job.log.push('Erreur : ' + (e.code === 'ENOENT' ? 'Claude Code introuvable. Installe-le (npm i -g @anthropic-ai/claude-code) puis connecte-toi avec « claude ».' : e.message)); });
  proc.on('close', code => {
    job.proc = null; job.ended = Date.now();
    if (job.status !== 'annulée') {
      const hasOut = fs.existsSync(path.join(job.dir, 'resultat.json')) || fs.existsSync(path.join(job.dir, 'rapport.md'));
      job.status = code === 0 && hasOut ? 'terminée' : (code === 0 ? 'terminée (sans fichier de sortie)' : 'échec');
    }
    running = null; pub(job); pump();
  });
}
