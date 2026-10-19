// ElecPlan — Assistant IA : tâches en arrière-plan exécutées par Claude Code (claude -p) installé sur le PC.
// Claude Code utilise le compte Claude connecté sur la machine (abonnement Pro / Max) : rien n'est stocké ici.
(() => {
'use strict';
const API = window.api || null;
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const box = $('#tab-ai');
let status = null, settings = null;
const jobs = new Map();
const results = new Map();   // id -> {json, md, dir}

const SCHEMA = `Le fichier projet.json est un projet ElecPlan. Unités : centimètres, origine en haut à gauche, Y vers le bas.
Structure : { name, circuits:[{id,name,cal,section,tableau}], levels:[{ name, elevation,
  walls:[{pts:[[x,y],…], thick}], rooms:[{name, pts:[[x,y],…]}], openings:[{type:"door"|"window", x, y, angle (degrés, sens du mur), w}],
  dims:[{a:[x,y], b:[x,y], offset}], texts:[{x,y,text,size}],
  devices:[{id, ref, type, x, y, rot, label, circuit (id), mode, height, note}],
  gaines:[{id, num ("G01"…), a (id appareil départ), b (id appareil arrivée), pts:[[x,y],…] (coudes), kind:"pwr"|"lv"|"res"|"ext", tube, content}] }] }
Types d'appareils : ${typeof DEVICE_TYPES !== 'undefined' ? DEVICE_TYPES.map(d => d.type + ' (' + d.label + ', repère ' + d.prefix + 'n)').join(', ') : ''}.`;

const CONVENTIONS = `Conventions de l'utilisateur (électricien, Maroc, NF C 15-100, schéma TT) :
- Disjoncteurs 2P courbe C ; ID 30 mA ; fils rigides H07V-U ; conduits ICTA Ø25 (Ø30 pour borne), remplissage ≤ 1/3 (Ø25 ≈ 276 mm² ; 1,5 ≈ 7,1 mm² ; 2,5 ≈ 10,2 mm²).
- 16 A en 2,5 (clim), 20 A en 2,5 (prises), 6–10 A en 1,5 (éclairage, commande).
- Codes de fils : R phase, B neutre, T terre, J navette, N retour ; + section (15, 25) + numéro de réseau : R25.1. Même code de bout en bout, Wago compris.
- Gaines numérotées G01… une fois pour toutes (ne jamais renuméroter les existantes).
- Raccordement : fil qui traverse une boîte sans se diviser = continu ; Wago dans les BD et là où un fil se divise ; navettes : Wago 2 dans les BD ; repiquage sur borne double des prises/inters ; > 5 fils de terre → bornier.
- Une terre commune par tableau dimensionnée sur la plus grosse phase ; groupe 1,5 sans PE propre si la PE 2,5 arrive dans la même boîte.`;

const OUT_PATCH = `Format de resultat.json (ajout au niveau courant ; coordonnées en cm) :
{ "walls":[{pts,thick}], "rooms":[{name,pts}], "openings":[{type,x,y,angle,w}], "dims":[…], "texts":[…],
  "devices":[{ref,type,x,y,label,mode}], "gaines":[{num?, a_ref, b_ref, pts, kind, tube, content}],
  "replace_gaines": false, "circuits":[{id,name,cal,section,tableau}], "assign":[{ref, circuit, mode}], "notes":["…"] }
Toutes les clés sont facultatives : n'écris que ce que tu proposes. Les gaines référencent les appareils par leur repère (a_ref, b_ref).`;

function levelInfo() { const P = window.FPP.project; return `Niveau courant : « ${window.FPP.level.name} » (index ${window.FPP.levelIndex} dans levels). Projet : « ${P.name} ».`; }

const TASKS = {
  sketch: { title: 'Lire un croquis ou une photo', needsImage: true, extra: 'Précisions (orientation, échelle, cotes connues…)',
    prompt: (x) => `${SCHEMA}\n\n${levelInfo()}\n\nTâche : l'image « ${x.imageName} » est un croquis, une photo ou un plan. Reconstitue le niveau courant : murs (épaisseur 20 cm par défaut), pièces nommées, portes et fenêtres, appareils électriques repérés (avec leur repère s'il est écrit), et gaines si elles sont dessinées. Utilise les cotes lisibles ; sinon estime (porte = 83 cm, hauteur de pièce standard). Place l'origine près du coin haut gauche du plan.\nPrécisions de l'utilisateur : ${x.extra || 'aucune'}.\n\n${OUT_PATCH}\n\nÉcris resultat.json (JSON valide uniquement) puis rapport.md : ce que tu as reconnu, tes hypothèses, ce qui reste incertain.` },
  gaines: { title: 'Proposer gaines et câblage', extra: 'Consignes (boîtes à utiliser, circuits imposés…)', replace: true,
    prompt: (x) => `${SCHEMA}\n\n${CONVENTIONS}\n\n${levelInfo()}\n\nTâche : propose le tracé des gaines du niveau courant (départ du tableau ou d'une BD, passage par les boîtes de dérivation, arrivée aux appareils), la répartition en circuits, et le contenu de chaque gaine (codes de fils). Vérifie le remplissage. ${x.replace ? 'Remplace les gaines existantes (replace_gaines: true).' : 'Garde les gaines existantes et complète seulement ce qui manque (numéros à partir du suivant libre).'}\nConsignes : ${x.extra || 'aucune'}.\n\n${OUT_PATCH}\n\nÉcris resultat.json puis rapport.md : tableau des gaines (n°, de → vers, fils, remplissage), liste des fils codés, nombre de Wago par boîte, hypothèses.` },
  dossier: { title: 'Générer le dossier complet', extra: 'Titre, date, points particuliers…', bash: true,
    prompt: (x) => `${SCHEMA}\n\n${CONVENTIONS}\n\nTâche : produis le dossier électrique complet de tout le projet dans le dossier courant. Si une skill « dossier-electrique-zone » est disponible, suis sa méthode.\nLivrables : dossier.html autonome et imprimable (A4 ; A3 paysage pour le plan) avec couverture, sommaire, synthèse (règles, protections), plan de chaque niveau (SVG redessiné depuis projet.json), boîtes et repères, gaines et fils (codes, remplissage), liste des fils, raccordements par nœud (Wago, bornes, fils continus), matériel (Wago, gaines), points ouverts. Si la commande Bash est disponible et qu'un navigateur headless (chromium, playwright) est installé, imprime aussi dossier.pdf.\nPrécisions : ${x.extra || 'aucune'}.\n\nTermine par rapport.md : résumé, liste des fichiers produits, hypothèses et points à vérifier.` },
  check: { title: 'Vérifier la conformité', extra: 'Points à regarder en priorité…',
    prompt: (x) => `${SCHEMA}\n\n${CONVENTIONS}\n\nTâche : contrôle tout le projet : protections et sections, remplissage des gaines, terre, appareils sans circuit, gaines sans contenu, repères en double, prises en zones humides (IP), éclairages sur un seul ID, cohérence des va-et-vient (2 navettes + retour), DM et forçage, distances et hauteurs si renseignées.\nPoints prioritaires : ${x.extra || 'aucun'}.\n\nÉcris resultat.json : {"issues":[{"gravite":"bloquant"|"important"|"conseil","niveau":"…","ref":"repère ou null","gaine":"Gxx ou null","message":"…","correction":"…"}]} puis rapport.md lisible (classé par gravité).` },
  free: { title: 'Demande libre', extra: 'Ta demande', free: true,
    prompt: (x) => `${SCHEMA}\n\n${CONVENTIONS}\n\n${levelInfo()}\n\nDemande de l'utilisateur : ${x.extra}\n\nSi ta réponse modifie le plan, écris resultat.json au format suivant. ${OUT_PATCH}\nDans tous les cas, écris rapport.md avec ta réponse.` }
};

// ---------- interface ----------
function statusCard() {
  if (!API) return `<div class="note">L'assistant IA fonctionne dans l'application de bureau (Electron), qui lance Claude Code sur ton PC.</div>`;
  if (!status) return `<div class="card"><span class="lbl">Claude Code</span><p class="muted">Vérification…</p></div>`;
  if (status.ok) return `<div class="card"><span class="lbl">Claude Code</span><p>✅ Détecté : ${esc(status.version)}</p><p class="muted">Les tâches utilisent le compte Claude connecté dans Claude Code sur ce PC et comptent dans les limites d'usage de ton abonnement.</p></div>`;
  return `<div class="card"><span class="lbl">Claude Code</span><p>❌ ${esc(status.error)}</p>
    <p class="muted">Installe-le puis connecte-toi avec ton compte Claude (abonnement Pro ou Max) :</p>
    <pre style="margin:0;background:var(--sunk);padding:6px;border-radius:4px;font:11.5px var(--mono);white-space:pre-wrap">npm install -g @anthropic-ai/claude-code\nclaude        # puis /login</pre>
    <button class="btn" data-a="recheck">Vérifier à nouveau</button></div>`;
}
function settingsCard() {
  if (!API || !settings) return '';
  return `<details class="card"><summary class="lbl" style="cursor:pointer">Réglages</summary>
    <label class="field"><span class="muted">Commande</span><input data-s="claudePath" value="${esc(settings.claudePath)}"></label>
    <label class="field"><span class="muted">Modèle</span><input data-s="model" value="${esc(settings.model)}" placeholder="par défaut"></label>
    <label class="row"><input type="checkbox" data-s="allowBash" ${settings.allowBash ? 'checked' : ''}> Autoriser les commandes (Bash) pour toutes les tâches</label>
    <p class="muted">Sans Bash, Claude lit et écrit seulement des fichiers dans le dossier de la tâche.</p></details>`;
}
function taskForm() {
  return `<div class="card"><span class="lbl">Nouvelle tâche</span>
    <select class="inp" id="aiTask">${Object.entries(TASKS).map(([k, t]) => `<option value="${k}">${esc(t.title)}</option>`).join('')}</select>
    <div id="aiTaskBody"></div>
    <button class="btn primary" id="aiGo" ${API && status && status.ok ? '' : 'disabled'}>Lancer en arrière-plan</button></div>`;
}
function taskBody() {
  const k = $('#aiTask').value, t = TASKS[k];
  $('#aiTaskBody').innerHTML = `${t.needsImage ? `<div class="row"><button class="btn" id="aiImg">Choisir l'image…</button><span class="muted" id="aiImgName">aucune</span></div>` : ''}
    <textarea class="inp" id="aiExtra" rows="${t.free ? 4 : 2}" placeholder="${esc(t.extra)}"></textarea>
    ${t.replace ? `<label class="row"><input type="checkbox" id="aiReplace"> Remplacer les gaines existantes du niveau</label>` : ''}
    ${t.bash ? `<label class="row"><input type="checkbox" id="aiBash"> Autoriser les commandes (pour produire le PDF)</label>` : ''}`;
  const ib = $('#aiImg'); if (ib) ib.onclick = async () => { const f = await API.pickImage(); if (f) { pendingImage = f; $('#aiImgName').textContent = f.name; } };
}
let pendingImage = null;
function jobHTML(j) {
  const cls = { 'en cours': 'run', 'terminée': 'ok', 'en attente': 'wait', 'annulée': 'wait' }[j.status] || (j.status.startsWith('terminée') ? 'ok' : 'err');
  const dur = j.started ? Math.round(((j.ended || Date.now()) - j.started) / 1000) + ' s' : '';
  const r = results.get(j.id);
  return `<div class="job" data-j="${j.id}"><div class="row" style="justify-content:space-between"><b>${esc(j.title)}</b><span class="st ${cls}">${esc(j.status)} ${dur}</span></div>
    <pre>${esc((j.log || []).slice(-14).join('\n')) || '…'}</pre>
    <div class="row">${j.status === 'en cours' || j.status === 'en attente' ? `<button class="btn danger" data-a="cancel">Annuler</button>` : ''}
    ${j.status.startsWith('terminée') ? `<button class="btn" data-a="result">Voir le résultat</button>` : ''}
    <button class="btn" data-a="folder">Dossier</button></div>
    ${r ? resultHTML(j, r) : ''}</div>`;
}
function resultHTML(j, r) {
  let h = '';
  const J = r.json;
  if (J && J.issues) h += `<span class="lbl">Contrôle · ${J.issues.length} point(s)</span><table class="t"><tbody>${J.issues.map((i, n) => `<tr><td><b style="color:${i.gravite === 'bloquant' ? 'var(--danger)' : i.gravite === 'important' ? 'var(--warn)' : 'var(--muted)'}">${esc(i.gravite)}</b></td><td>${esc(i.message)}${i.correction ? `<br><span class="muted">→ ${esc(i.correction)}</span>` : ''}</td><td>${i.ref || i.gaine ? `<button class="btn" data-a="goto" data-ref="${esc(i.ref || '')}" data-g="${esc(i.gaine || '')}">Voir</button>` : ''}</td></tr>`).join('')}</tbody></table>`;
  else if (J) { const c = k => (J[k] || []).length; h += `<span class="lbl">Proposition</span><p class="muted">${['walls', 'rooms', 'openings', 'devices', 'gaines', 'circuits', 'assign'].filter(k => c(k)).map(k => c(k) + ' ' + ({ walls: 'murs', rooms: 'pièces', openings: 'ouvertures', devices: 'appareils', gaines: 'gaines', circuits: 'circuits', assign: 'affectations' })[k]).join(' · ') || 'aucune modification'}${J.replace_gaines ? ' · remplace les gaines' : ''}</p>${(J.notes || []).length ? `<p class="muted">${J.notes.map(esc).join('<br>')}</p>` : ''}<div class="row"><button class="btn primary" data-a="apply">Appliquer au niveau « ${esc(window.FPP.level.name)} »</button></div>`; }
  if (r.md) h += `<span class="lbl">Rapport</span><div class="report">${esc(r.md)}</div>`;
  if (r.err) h += `<div class="note">${esc(r.err)}</div>`;
  return h;
}
function renderJobs() { const l = $('#aiJobs'); if (!l) return; const arr = [...jobs.values()].sort((a, b) => b.created - a.created); l.innerHTML = arr.map(jobHTML).join('') || '<p class="muted">Aucune tâche pour l\'instant.</p>'; }
function render() {
  box.innerHTML = `${statusCard()}${settingsCard()}${taskForm()}<span class="lbl">Tâches</span><div class="joblist" id="aiJobs"></div>`;
  if ($('#aiTask')) { $('#aiTask').onchange = taskBody; taskBody(); }
  renderJobs();
}

// ---------- actions ----------
box.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.a === 'recheck') { status = await API.aiCheck(); render(); return; }
  if (b.id === 'aiGo') return submit();
  const jEl = b.closest('[data-j]'); const id = jEl && jEl.dataset.j; const j = id && jobs.get(id);
  if (b.dataset.a === 'cancel') await API.aiCancel(id);
  if (b.dataset.a === 'folder' && j) API.openPath(j.dir);
  if (b.dataset.a === 'result') { const r = await API.aiResult(id); const out = { md: r['rapport.md'] || '', dir: r.dir };
    if (r['resultat.json']) { try { out.json = JSON.parse(r['resultat.json']); } catch (err) { out.err = 'resultat.json illisible : ' + err.message; } }
    results.set(id, out); renderJobs(); }
  if (b.dataset.a === 'apply') { const r = results.get(id); if (r && r.json) applyPatch(r.json); }
  if (b.dataset.a === 'goto') goto(b.dataset.ref, b.dataset.g);
});
box.addEventListener('change', async e => { const t = e.target; if (t.dataset.s) { const v = t.type === 'checkbox' ? t.checked : t.value; settings = await API.setSettings({ [t.dataset.s]: v }); if (t.dataset.s === 'claudePath') { status = await API.aiCheck(); render(); } } });

async function submit() {
  const k = $('#aiTask').value, t = TASKS[k];
  const x = { extra: ($('#aiExtra') || {}).value || '', replace: !!($('#aiReplace') || {}).checked };
  if (t.needsImage && !pendingImage) { window.FPP.toast('Choisis d\'abord une image.'); return; }
  if (t.free && !x.extra.trim()) { window.FPP.toast('Écris ta demande.'); return; }
  const files = [{ name: 'projet.json', text: JSON.stringify(window.FPP.project, (key, v) => key === 'src' && typeof v === 'string' && v.length > 2000 ? '(image de fond omise)' : v, 1) }];
  if (t.needsImage) { const ext = pendingImage.name.split('.').pop(); x.imageName = 'croquis.' + ext; files.push({ name: x.imageName, base64: pendingImage.base64 }); }
  const prompt = t.prompt(x);
  await API.aiSubmit({ kind: k, title: t.title + (x.extra && !t.free ? '' : t.free ? ' : ' + x.extra.slice(0, 40) : ''), prompt, files, allowBash: !!($('#aiBash') || {}).checked });
  pendingImage = null; window.FPP.toast('Tâche lancée en arrière-plan. Tu peux continuer à dessiner.');
}

// ---------- application d'un résultat ----------
function applyPatch(J) {
  window.FPP.apply((P, lv) => {
    const uidx = p => p + Math.random().toString(36).slice(2, 8);
    for (const k of ['walls', 'rooms', 'openings', 'dims', 'texts']) for (const o of J[k] || []) lv[k].push(Object.assign({}, o, { id: uidx(k[0]) }));
    const refMap = {};
    for (const d of J.devices || []) {
      const T = DT[d.type] ? d.type : 'equip';
      let ref = d.ref; const clash = ref && P.levels.some(l => l.devices.some(x => x.ref === ref));
      if (!ref || clash) ref = nextRef(P, (DT[T] || DT.equip).prefix);
      const nd = { id: uidx('e'), type: T, ref, x: +d.x || 0, y: +d.y || 0, rot: d.rot || 0, label: d.label || DT[T].label, circuit: d.circuit || '', mode: d.mode || '', height: d.height || '', note: d.note || '' };
      lv.devices.push(nd); if (d.ref) refMap[d.ref] = nd.id;
    }
    const byRef = r => refMap[r] || (lv.devices.find(x => x.ref === r) || {}).id;
    if (J.replace_gaines) lv.gaines = [];
    let skipped = 0;
    for (const g of J.gaines || []) {
      const a = byRef(g.a_ref || g.a), b = byRef(g.b_ref || g.b); if (!a || !b) { skipped++; continue; }
      let num = g.num; if (!num || P.levels.some(l => l.gaines.some(x => x.num === num))) num = nextGaineNum(P);
      lv.gaines.push({ id: uidx('g'), num, a, b, pts: g.pts || [], kind: g.kind || 'pwr', tube: g.tube || 'ICTA Ø25', content: g.content || '' });
    }
    for (const c of J.circuits || []) { const i = P.circuits.findIndex(x => x.id === c.id); if (i >= 0) P.circuits[i] = Object.assign(P.circuits[i], c); else P.circuits.push(c); }
    for (const a of J.assign || []) { for (const l of P.levels) { const d = l.devices.find(x => x.ref === a.ref); if (d) { if (a.circuit != null) d.circuit = a.circuit; if (a.mode != null) d.mode = a.mode; } } }
    window.FPP.toast('Proposition appliquée' + (skipped ? ` (${skipped} gaine(s) ignorée(s) : appareil introuvable)` : '') + '. Ctrl+Z pour annuler.', 6000);
  });
}
function goto(ref, gnum) {
  const P = window.FPP.project;
  if (ref) { const f = window.FPP.findByRef(ref); if (f) { window.FPP.gotoLevel(f.li); window.FPP.select('devices', f.d.id); return; } }
  if (gnum) for (let i = 0; i < P.levels.length; i++) { const g = P.levels[i].gaines.find(x => x.num === gnum); if (g) { window.FPP.gotoLevel(i); window.FPP.select('gaines', g.id); return; } }
  window.FPP.toast('Élément introuvable sur le plan.');
}

// ---------- démarrage ----------
window.FPP_AI = { show: async () => { if (API && !status) { settings = await API.getSettings(); status = await API.aiCheck(); } render(); } };
if (API) {
  API.onAiUpdate(j => { jobs.set(j.id, j); if (!box.hidden) renderJobs(); if (j.status.startsWith('terminée')) window.FPP.toast('Tâche IA terminée : ' + j.title, 6000); });
  API.aiList().then(l => l.forEach(j => jobs.set(j.id, j)));
}
render();
})();
