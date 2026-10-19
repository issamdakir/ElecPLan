// Catalogue des appareils et symboles (unités : cm, symbole centré sur 0,0, taille ~30 cm à l'échelle 1)
const DEVICE_TYPES = [
  { type: 'prise', label: 'Prise', prefix: 'P', group: 'Prises' },
  { type: 'prise_ip', label: 'Prise IP44', prefix: 'P', group: 'Prises' },
  { type: 'prise_spe', label: 'Prise spécialisée', prefix: 'PS', group: 'Prises' },
  { type: 'inter_s', label: 'Inter simple', prefix: 'I', group: 'Commandes', mode: 'S' },
  { type: 'inter_vv', label: 'Va-et-vient', prefix: 'I', group: 'Commandes', mode: 'VV' },
  { type: 'inter_on', label: 'Inter ON (forçage)', prefix: 'I', group: 'Commandes', mode: 'ON' },
  { type: 'poussoir', label: 'Poussoir', prefix: 'BP', group: 'Commandes', mode: 'BP' },
  { type: 'dm', label: 'Détecteur mvt', prefix: 'DM', group: 'Commandes' },
  { type: 'lum', label: 'Luminaire', prefix: 'L', group: 'Éclairage' },
  { type: 'applique', label: 'Applique', prefix: 'L', group: 'Éclairage' },
  { type: 'spots', label: 'Groupe de spots', prefix: 'SP', group: 'Éclairage' },
  { type: 'bd', label: 'Boîte de dérivation', prefix: 'BD', group: 'Distribution' },
  { type: 'tableau', label: 'Tableau', prefix: 'T', group: 'Distribution' },
  { type: 'coffret', label: 'Coffret', prefix: 'CF', group: 'Distribution' },
  { type: 'equip', label: 'Équipement', prefix: 'E', group: 'Autres' },
  { type: 'rj45', label: 'Prise RJ45', prefix: 'R', group: 'Autres' },
  { type: 'reserve', label: 'Réserve / attente', prefix: 'R', group: 'Autres' }
];
const DT = Object.fromEntries(DEVICE_TYPES.map(d => [d.type, d]));
const GAINE_KINDS = { pwr: { label: 'Courant fort', color: '#0f6b5a', dash: '' }, lv: { label: 'Courant faible', color: '#1f6fd1', dash: '7 4' }, res: { label: 'Réserve', color: '#8c9590', dash: '2 4' }, ext: { label: 'Extérieur / enterré', color: '#9a5b00', dash: '10 4 2 4' } };

// Renvoie le markup SVG (string) d'un symbole, en coordonnées locales.
function deviceSymbol(type, s = 1, color = '#17201d') {
  const r = 13 * s, sw = 2.2 * s, st = `stroke="${color}" stroke-width="${sw}" fill="#fff"`;
  const txt = (t, fs = 9) => `<text x="0" y="${3.2 * s}" text-anchor="middle" font-family="DejaVu Sans Mono, monospace" font-weight="700" font-size="${fs * s}" fill="${color}">${t}</text>`;
  switch (type) {
    case 'prise': return `<circle r="${r}" ${st}/><path d="M${-r * .62} ${r * .1}A${r * .62} ${r * .62} 0 0 1 ${r * .62} ${r * .1}" stroke="${color}" stroke-width="${sw}" fill="none"/><line x1="${-r * .62}" y1="${r * .45}" x2="${r * .62}" y2="${r * .45}" stroke="${color}" stroke-width="${sw}"/>`;
    case 'prise_ip': return deviceSymbol('prise', s, color) + `<text x="${r + 2 * s}" y="${-r * .6}" font-size="${7 * s}" font-family="DejaVu Sans Mono, monospace" fill="${color}">IP44</text>`;
    case 'prise_spe': return `<circle r="${r}" ${st}/>` + txt('SPE', 7.5);
    case 'inter_s': return `<circle r="${r}" ${st}/>` + txt('S');
    case 'inter_vv': return `<circle r="${r}" ${st}/>` + txt('VV', 8);
    case 'inter_on': return `<circle r="${r}" ${st}/>` + txt('ON', 8);
    case 'poussoir': return `<circle r="${r}" ${st}/>` + txt('BP', 8);
    case 'dm': return `<path d="M0 ${-r}L${r} ${r * .8}H${-r}Z" ${st} stroke-linejoin="round"/>` + `<text x="0" y="${r * .55}" text-anchor="middle" font-family="DejaVu Sans Mono, monospace" font-weight="700" font-size="${6.5 * s}" fill="${color}">DM</text>`;
    case 'lum': return `<circle r="${r}" ${st}/><path d="M${-r * .7} ${-r * .7}L${r * .7} ${r * .7}M${r * .7} ${-r * .7}L${-r * .7} ${r * .7}" stroke="${color}" stroke-width="${sw}"/>`;
    case 'applique': return `<circle r="${r}" ${st}/><path d="M${-r * .7} ${-r * .7}L${r * .7} ${r * .7}M${r * .7} ${-r * .7}L${-r * .7} ${r * .7}" stroke="${color}" stroke-width="${sw}"/><line x1="${-r}" y1="${r + 3 * s}" x2="${r}" y2="${r + 3 * s}" stroke="${color}" stroke-width="${sw * 1.4}"/>`;
    case 'spots': return [-1, 0, 1].map(k => `<circle cx="${k * r * 1.05}" r="${r * .38}" fill="${color}"/>`).join('');
    case 'bd': return `<rect x="${-r * 1.25}" y="${-r * .9}" width="${r * 2.5}" height="${r * 1.8}" rx="${3 * s}" ${st}/>` + txt('BD', 8);
    case 'tableau': return `<rect x="${-r * 1.6}" y="${-r}" width="${r * 3.2}" height="${r * 2}" rx="${2 * s}" stroke="${color}" stroke-width="${sw}" fill="${color}"/><text x="0" y="${3.2 * s}" text-anchor="middle" font-family="DejaVu Sans Mono, monospace" font-weight="700" font-size="${8 * s}" fill="#fff">TAB</text>`;
    case 'coffret': return `<rect x="${-r * 1.6}" y="${-r * .9}" width="${r * 3.2}" height="${r * 1.8}" rx="${2 * s}" ${st} stroke-width="${sw * 1.4}"/>` + txt('CF', 8);
    case 'equip': return `<rect x="${-r * .9}" y="${-r * .9}" width="${r * 1.8}" height="${r * 1.8}" rx="${2 * s}" ${st}/>` + txt('E', 9);
    case 'rj45': return `<rect x="${-r * .9}" y="${-r * .9}" width="${r * 1.8}" height="${r * 1.8}" rx="${2 * s}" stroke="#1f6fd1" stroke-width="${sw}" fill="#fff"/><text x="0" y="${3 * s}" text-anchor="middle" font-family="DejaVu Sans Mono, monospace" font-weight="700" font-size="${6.5 * s}" fill="#1f6fd1">RJ45</text>`;
    case 'reserve': return `<circle r="${r}" stroke="${color}" stroke-width="${sw}" fill="#fff" stroke-dasharray="${3 * s} ${2.5 * s}"/>`;
    default: return `<circle r="${r}" ${st}/>`;
  }
}
