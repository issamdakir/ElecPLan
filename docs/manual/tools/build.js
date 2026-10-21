// Builds the user manual from its Markdown sources: manual.<lang>.md → manual_<lang>.html (pandoc) → PDF (Electron's Chromium).
// Usage, from the repository root:  npm run manual            (both languages)
//                                   npm run manual -- en      (one language)
// Outputs: docs/manual/manual_<lang>.html, docs/ElecPlan_Manual.pdf (en), docs/ElecPlan_Manuel.pdf (fr).
// Needs pandoc (sudo apt install pandoc). Screenshots are not retaken here: see npm run manual:shots.
const { app, BrowserWindow } = require('electron');
const path = require('path'), fs = require('fs');
const { execFileSync } = require('child_process');

const HERE = path.resolve(__dirname, '..');
const PDF = { en: 'ElecPlan_Manual.pdf', fr: 'ElecPlan_Manuel.pdf' };
const langs = process.argv.filter(a => a === 'en' || a === 'fr');
if (!langs.length) langs.push('en', 'fr');

function toHTML(lang) {
  const out = path.join(HERE, `manual_${lang}.html`);
  try {
    execFileSync('pandoc', [`manual.${lang}.md`, '-f', 'markdown', '-t', 'html5', '-s', '--template', 'tools/template.html', '--toc', '--toc-depth=1', '-o', out], { cwd: HERE, stdio: ['ignore', 'inherit', 'inherit'] });
  } catch (e) {
    if (e.code === 'ENOENT') { console.error('pandoc not found: install it (sudo apt install pandoc) and run again.'); app.exit(1); }
    throw e;
  }
  return out;
}

// pied de page : texte de la clé « footer » du front matter, et numéro de page (pas sur la couverture, qui n'a pas de marge)
function footer(lang) {
  const m = fs.readFileSync(path.join(HERE, `manual.${lang}.md`), 'utf8').match(/^footer:\s*(.+)$/m);
  const text = m ? m[1].trim() : 'ElecPlan';
  return `<div style="width:100%;margin:0 15mm;display:flex;justify-content:space-between;border-top:.25mm solid #d5dcd8;padding-top:2mm;font:7.5px 'DejaVu Sans Mono',monospace;color:#8c9590"><span>${text}</span><span class="pageNumber"></span></div>`;
}

app.on('window-all-closed', () => {});   // une fenêtre par langue : ne pas quitter entre les deux
app.whenReady().then(async () => {
  for (const lang of langs) {
    const html = toHTML(lang);
    const win = new BrowserWindow({ show: false });
    await win.loadFile(html);
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => Promise.all([...document.images].map(i => i.complete || new Promise(r => { i.onload = i.onerror = r; })))).then(() => 0)');
    const pdf = await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: footer(lang) });
    fs.writeFileSync(path.join(HERE, '..', PDF[lang]), pdf);
    win.destroy();
    console.log(`${lang}: docs/manual/manual_${lang}.html → docs/${PDF[lang]}`);
  }
  app.exit(0);
}).catch(e => { console.error(e); app.exit(1); });
