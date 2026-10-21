// Captures d'écran du manuel, prises dans la vraie application avec le projet d'exemple (tools/demo.js).
// Usage (depuis la racine du dépôt) : npx electron docs/manual/tools/capture.js fr|en   → docs/manual/img/<langue>/*.png
// Dans le terminal de VS Code, préfixer par « env -u ELECTRON_RUN_AS_NODE ».
const { app, ipcMain, BrowserWindow } = require('electron');
const path = require('path'), fs = require('fs'), os = require('os');
const { execFileSync } = require('child_process');
const demo = require('./demo.js');

const lang = process.argv.find(a => a === 'fr' || a === 'en') || 'en';
const ROOT = path.resolve(__dirname, '../../..');
const OUT = path.join(__dirname, '..', 'img', lang);
fs.mkdirSync(OUT, { recursive: true });

// profil jetable : n'écrit pas dans les réglages de l'utilisateur
const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'elecplan-shots-'));
fs.writeFileSync(path.join(ud, 'settings.json'), JSON.stringify({ claudePath: 'claude', model: '', allowBash: false, lang }));
app.setPath('userData', ud);
require(path.join(ROOT, 'main.js'));

// remplacer les entrées/sorties par des données d'exemple (pas de dialogue, pas d'appel à Claude)
const swap = (ch, fn) => { ipcMain.removeHandler(ch); ipcMain.handle(ch, fn); };
const P = demo.project(lang), J = demo.job(lang);
const pdfPath = path.join(ud, 'plan.pdf');
swap('file:open', () => ({ path: path.join(ud, 'demo.elecplan.json'), data: JSON.stringify(P) }));
swap('ai:check', () => ({ ok: true, version: '2.1.0 (Claude Code)' }));
swap('ai:list', () => []);
swap('ai:readResult', () => J.result);
swap('pdf:export', async (_e, { html }) => {
  const tmp = path.join(ud, 'print.html'); fs.writeFileSync(tmp, html);
  const pw = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await pw.loadFile(tmp); await wait(400);
  fs.writeFileSync(pdfPath, await pw.webContents.printToPDF({ landscape: true, pageSize: 'A3', printBackground: true, margins: { marginType: 'none' } }));
  pw.destroy(); return pdfPath;
});

const wait = ms => new Promise(r => setTimeout(r, ms));
app.on('browser-window-created', (_e, w) => {
  if (w.getTitle() !== 'ElecPlan' || w.shotsStarted) return; w.shotsStarted = true;
  w.setContentSize(1500, 920);
  w.webContents.once('did-finish-load', () => run(w).catch(e => { console.error(e); app.exit(1); }));
});

async function run(w) {
  const wc = w.webContents, js = s => wc.executeJavaScript(s);
  const shot = async (name, rect) => { fs.writeFileSync(path.join(OUT, name), (await wc.capturePage(rect)).toPNG()); console.log(lang, name); };
  const click = async (sel) => { await js(`document.querySelector(${JSON.stringify(sel)}).click(); 0`); await wait(250); };
  const screen = (x, y) => js(`(() => { const s = document.querySelector('#cv'), p = s.createSVGPoint(); p.x = ${x}; p.y = ${y}; const q = p.matrixTransform(s.getScreenCTM()); return [Math.round(q.x), Math.round(q.y)]; })()`);
  const mouse = (type, [x, y]) => wc.sendInputEvent({ type, x, y, button: 'left', clickCount: 1 });
  const rect = sel => js(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }; })()`);
  // panneau latéral recadré à la hauteur de son contenu
  const panelShot = async (name) => {
    const r = await rect('.panel');
    const h = await js(`(() => { const b = [...document.querySelectorAll('.tabbody')].find(x => !x.hidden); const last = b.lastElementChild; return Math.round(last.getBoundingClientRect().bottom + 12); })()`);
    await shot(name, { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, h - r.y) });
  };

  await wait(800);
  wc.send('menu', 'open'); await wait(800);
  await js(`localStorage.clear(); 0`);

  // écran principal
  await click('[data-tool=select]'); await wait(300);
  await shot('s_main.png');

  // tracé d'un mur en cours (sous le bâtiment)
  await click('[data-tool=wall]');
  const a = await screen(100, 900), b = await screen(530, 900);
  mouse('mouseMove', a); mouse('mouseDown', a); mouse('mouseUp', a); await wait(150);
  for (let i = 1; i <= 10; i++) { mouse('mouseMove', [Math.round(a[0] + (b[0] - a[0]) * i / 10), b[1]]); await wait(30); }
  await wait(300); await shot('s_wall.png');
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' }); await wait(200);
  await click('[data-tool=select]');

  // gaine sélectionnée : plan recadré + propriétés
  await js(`window.FPP.select('gaines', 'g1'); 0`); await wait(300);
  await panelShot('c_gaine_props.png');                       // panneau en mode objet
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' }); await wait(300);   // mode édition : coudes visibles
  const c = await screen(600, 400);
  await shot('c_gaine_plan.png', { x: c[0] - 485, y: c[1] - 350, width: 970, height: 700 });
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' }); await wait(200);
  await js(`window.FPP.select(null, null); 0`);
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' }); await wait(200);

  // bibliothèque d'appareils, nomenclature
  await click('[data-tab=lib]'); await click('[data-dev=inter_vv]'); await panelShot('c_lib.png');
  await click('[data-tool=select]');
  await click('[data-tab=nomen]'); await panelShot('c_nomen.png');

  // assistant IA : tâche terminée, résultat affiché
  await click('[data-tab=ai]'); await wait(500);
  wc.send('ai:update', J.job); await wait(300);
  await click('[data-a=result]'); await wait(300);
  await js(`document.querySelector('#aiJobs').previousElementSibling.scrollIntoView(); 0`); await wait(200);
  const r = await rect('.panel'); await shot('c_ai.png', r);
  await click('[data-tab=props]');

  // export PDF A3, 1re page rendue en image
  wc.send('menu', 'pdf');
  for (let i = 0; i < 50 && !fs.existsSync(pdfPath); i++) await wait(200);
  await wait(500);
  execFileSync('pdftoppm', ['-png', '-f', '1', '-l', '1', '-singlefile', '-scale-to-x', '1159', '-scale-to-y', '-1', pdfPath, path.join(OUT, 's_pdf')]);
  console.log(lang, 's_pdf.png');

  fs.rmSync(ud, { recursive: true, force: true });
  app.exit(0);
}
