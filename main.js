// ElecPlan — processus principal Electron
// Fenêtre, fichiers projet (.elecplan.json), export PDF, et tâches IA en arrière-plan via Claude Code (claude -p).
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFile } = require('child_process');
const I18N = require('./src/i18n.js');
const tr = I18N.t;

let win;
const DATA = path.join(app.getPath('userData'));
const JOBS_DIR = path.join(DATA, 'jobs');
const SETTINGS_FILE = path.join(DATA, 'settings.json');
fs.mkdirSync(JOBS_DIR, { recursive: true });

function loadSettings() {
  const def = { claudePath: 'claude', model: '', allowBash: false, recent: [] };
  try { return Object.assign(def, JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))); }
  catch { return def; }
}
// ---------- Fichiers récents (10 au plus, le plus récent en tête) ----------
function addRecent(p) {
  const s = loadSettings(); s.recent = [p].concat((s.recent || []).filter(x => x !== p)).slice(0, 10);
  saveSettings(s); app.addRecentDocument(p); buildMenu();
}
function openRecent(p) {
  if (!fs.existsSync(p)) {
    const s = loadSettings(); s.recent = (s.recent || []).filter(x => x !== p); saveSettings(s); buildMenu();
    dialog.showMessageBox(win, { type: 'warning', message: tr('Fichier introuvable : {0}', p), detail: tr('Il a été retiré de la liste des fichiers récents.') });
    return;
  }
  addRecent(p); win.webContents.send('open-file', { path: p, data: fs.readFileSync(p, 'utf8') });
}
function recentMenu() {
  const list = loadSettings().recent || [], home = os.homedir();
  if (!list.length) return [{ label: tr('Aucun fichier récent'), enabled: false }];
  return list.map(p => ({ label: path.basename(p) + '   —   ' + path.dirname(p).replace(home, '~'), click: () => openRecent(p) }))
    .concat([{ type: 'separator' }, { label: tr('Effacer la liste'), click: () => { const s = loadSettings(); s.recent = []; saveSettings(s); app.clearRecentDocuments(); buildMenu(); } }]);
}
function saveSettings(s) { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2)); }

// ---------- Langue (réglage « lang », sinon locale du système) ----------
function initLang() { I18N.setLang(loadSettings().lang || I18N.fromLocale(app.getLocale())); }
ipcMain.on('i18n:get', e => { e.returnValue = I18N.lang; });
ipcMain.handle('i18n:set', (_e, l) => { changeLang(l, false); return I18N.lang; });
function changeLang(l, notify) {
  saveSettings(Object.assign(loadSettings(), { lang: I18N.setLang(l) }));
  buildMenu();
  if (notify && win && !win.isDestroyed()) win.webContents.send('lang', I18N.lang);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1500, height: 950, minWidth: 1000, minHeight: 650,
    title: 'ElecPlan',
    icon: path.join(__dirname, 'src', 'icon.png'),
    backgroundColor: '#f4f6f5',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.on('close', confirmClose);
  buildMenu();
}

// ---------- Garde à la fermeture : enregistrer / ne pas enregistrer / annuler ----------
let doc = { dirty: false, name: '' }, forceClose = false, asking = false;
// mode clair / sombre choisi dans les paramètres : menus et boîtes de dialogue natives assortis
ipcMain.on('theme:mode', (_e, m) => { nativeTheme.themeSource = m === 'light' || m === 'dark' ? m : 'system'; });
ipcMain.on('app:dirty', (_e, s) => { doc = s || doc; });
ipcMain.on('app:quit-now', () => { forceClose = true; if (win && !win.isDestroyed()) win.close(); });
async function confirmClose(e) {
  if (forceClose || !doc.dirty) return;
  e.preventDefault(); if (asking) return; asking = true;
  const r = await dialog.showMessageBox(win, {
    type: 'warning', noLink: true, defaultId: 0, cancelId: 2,
    buttons: [tr('Enregistrer'), tr('Ne pas enregistrer'), tr('Annuler')],
    message: tr('Le projet « {0} » n\'est pas enregistré.', doc.name || tr('Nouveau projet')),
    detail: tr('Enregistrer les modifications avant de quitter ? Sans enregistrement, elles seront perdues.')
  });
  asking = false;
  if (r.response === 0) win.webContents.send('app:quit-request', 'save');   // la fenêtre enregistre puis confirme (ou reste ouverte si annulé)
  else if (r.response === 1) {
    win.webContents.send('app:quit-request', 'discard');
    setTimeout(() => { forceClose = true; if (win && !win.isDestroyed()) win.close(); }, 1500);   // si la fenêtre ne répond plus
  }
}
function buildMenu() {
  const menu = Menu.buildFromTemplate([
    { label: tr('Fichier'), submenu: [
      { label: tr('Nouveau'), accelerator: 'CmdOrCtrl+N', click: () => win.webContents.send('menu', 'new') },
      { label: tr('Ouvrir…'), accelerator: 'CmdOrCtrl+O', click: () => win.webContents.send('menu', 'open') },
      { label: tr('Ouvrir un fichier récent'), submenu: recentMenu() },
      { label: tr('Enregistrer'), accelerator: 'CmdOrCtrl+S', click: () => win.webContents.send('menu', 'save') },
      { label: tr('Enregistrer sous…'), accelerator: 'CmdOrCtrl+Shift+S', click: () => win.webContents.send('menu', 'saveas') },
      { type: 'separator' },
      { label: tr('Récupérer le travail non enregistré'), click: () => win.webContents.send('menu', 'recover') },
      { type: 'separator' },
      { label: tr('Importer un fond de plan…'), click: () => win.webContents.send('menu', 'background') },
      { label: tr('Exporter en PDF…'), accelerator: 'CmdOrCtrl+P', click: () => win.webContents.send('menu', 'pdf') },
      { label: tr('Exporter en SVG…'), click: () => win.webContents.send('menu', 'svg') },
      { type: 'separator' }, { role: 'quit', label: tr('Quitter') } ] },
    { label: tr('Édition'), submenu: [
      { label: tr('Annuler|undo'), accelerator: 'CmdOrCtrl+Z', click: () => win.webContents.send('menu', 'undo') },
      { label: tr('Rétablir'), accelerator: 'CmdOrCtrl+Shift+Z', click: () => win.webContents.send('menu', 'redo') },
      { type: 'separator' }, { role: 'copy', label: tr('Copier') }, { role: 'paste', label: tr('Coller') },
      { type: 'separator' }, { label: tr('Paramètres…'), accelerator: 'CmdOrCtrl+,', click: () => win.webContents.send('menu', 'prefs') } ] },
    { label: tr('Affichage'), submenu: [ { role: 'reload', label: tr('Recharger') }, { role: 'toggleDevTools', label: tr('Outils développeur') }, { role: 'togglefullscreen', label: tr('Plein écran') },
      { type: 'separator' },
      // noms des langues dans leur propre langue : ils ne se traduisent pas
      { label: tr('Langue'), submenu: [
        { label: 'Français', type: 'radio', checked: I18N.lang === 'fr', click: () => changeLang('fr', true) },
        { label: 'English', type: 'radio', checked: I18N.lang === 'en', click: () => changeLang('en', true) } ] } ] }
  ]);
  Menu.setApplicationMenu(menu);
}
app.whenReady().then(() => { initLang(); createWindow(); });
app.on('window-all-closed', () => app.quit());

// ---------- Fichiers ----------
ipcMain.handle('file:open', async () => {
  const r = await dialog.showOpenDialog(win, { filters: [{ name: tr('Projet ElecPlan'), extensions: ['json'] }], properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return null;
  addRecent(r.filePaths[0]);
  return { path: r.filePaths[0], data: fs.readFileSync(r.filePaths[0], 'utf8') };
});
ipcMain.handle('file:save', async (_e, { path: p, data, suggested }) => {
  let target = p;
  if (!target) {
    const r = await dialog.showSaveDialog(win, { defaultPath: suggested || tr('projet.elecplan.json'), filters: [{ name: tr('Projet ElecPlan'), extensions: ['json'] }] });
    if (r.canceled || !r.filePath) return null;
    target = r.filePath;
  }
  fs.writeFileSync(target, data); addRecent(target);
  return target;
});
ipcMain.handle('file:image', async () => {
  const r = await dialog.showOpenDialog(win, { filters: [{ name: tr('Image ou PDF'), extensions: ['png', 'jpg', 'jpeg', 'webp', 'pdf'] }], properties: ['openFile'] });
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
  const r = await dialog.showSaveDialog(win, { defaultPath: suggested || tr('plan') + '.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] });
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
  const job = { id, kind, title, status: 'queued', dir, log: [], created: Date.now(), allowBash: !!allowBash, result: null };
  jobs.set(id, job); queue.push(id); pub(job); pump();
  return id;
});
ipcMain.handle('ai:cancel', (_e, id) => {
  const j = jobs.get(id); if (!j) return false;
  if (j.proc) { try { j.proc.kill('SIGTERM'); } catch {} }
  const qi = queue.indexOf(id); if (qi >= 0) queue.splice(qi, 1);
  j.status = 'cancelled'; pub(j); return true;
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
  const id = queue.shift(); const job = jobs.get(id); if (!job || job.status === 'cancelled') return pump();
  running = id; job.status = 'running'; job.started = Date.now(); pub(job);
  const s = loadSettings();
  const tools = ['Read', 'Write', 'Edit', 'Glob', 'Grep'].concat(job.allowBash || s.allowBash ? ['Bash'] : []);
  const args = ['-p', 'Lis CONSIGNE.md dans le dossier courant et exécute-la entièrement. Ne pose aucune question : fais des hypothèses raisonnables et note-les dans le fichier de sortie.',
    '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits', '--allowedTools', tools.join(',')];
  if (!tools.includes('Bash')) args.push('--disallowedTools', 'Bash');
  if (s.model) args.push('--model', s.model);
  let proc;
  try { proc = spawn(s.claudePath, args, { cwd: job.dir, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { job.status = 'failed'; job.log.push(tr('Impossible de lancer Claude Code : {0}', e.message)); running = null; pub(job); return pump(); }
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
          if (m.is_error) job.log.push(tr('Erreur : {0}', m.result || m.subtype));
        }
      } catch { job.log.push(line.slice(0, 300)); }
      if (job.log.length > 400) job.log.splice(0, job.log.length - 400);
      pub(job);
    }
  });
  proc.stderr.on('data', d => { job.log.push('! ' + d.toString().trim().slice(0, 400)); pub(job); });
  proc.on('error', e => { job.log.push(tr('Erreur : {0}', e.code === 'ENOENT' ? tr('Claude Code introuvable. Installe-le (npm i -g @anthropic-ai/claude-code) puis connecte-toi avec « claude ».') : e.message)); });
  proc.on('close', code => {
    job.proc = null; job.ended = Date.now();
    if (job.status !== 'cancelled') {
      const hasOut = fs.existsSync(path.join(job.dir, 'resultat.json')) || fs.existsSync(path.join(job.dir, 'rapport.md'));
      job.status = code === 0 && hasOut ? 'done' : (code === 0 ? 'done_noout' : 'failed');
    }
    running = null; pub(job); pump();
  });
}
