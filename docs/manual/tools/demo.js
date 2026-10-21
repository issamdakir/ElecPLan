// Projet d'exemple et tâche IA de démonstration utilisés pour les captures du manuel (une version par langue).
const T = {
  fr: { project: 'Villa exemple', level: 'Niveau 0', garage: 'Garage', yard: 'Cour', c1: 'Éclairage 1', c2: 'Prises' },
  en: { project: 'Sample villa', level: 'Level 0', garage: 'Garage', yard: 'Yard', c1: 'Lighting 1', c2: 'Sockets' }
};
const LABEL = {
  fr: { bd: 'Boîte de dérivation', prise: 'Prise', inter_vv: 'Va-et-vient', lum: 'Luminaire', spots: 'Groupe de spots', dm: 'Détecteur mvt' },
  en: { bd: 'Junction box', prise: 'Socket', inter_vv: 'Two-way switch', lum: 'Light fitting', spots: 'Spotlight group', dm: 'Motion detector' }
};

function project(lang) {
  const t = T[lang], L = LABEL[lang];
  const dev = (id, type, ref, x, y, circuit = '', mode = '') => ({ id, type, ref, x, y, rot: 0, label: L[type], circuit, mode, height: '', note: '' });
  return {
    app: 'ElecPlan', version: 1, name: t.project, created: '2026-10-20T08:00:00.000Z',
    settings: { grid: 10, symbol: 2 },
    circuits: [{ id: 'c1', name: t.c1, cal: '10A', section: '1,5', tableau: 'TD' }, { id: 'c2', name: t.c2, cal: '20A', section: '2,5', tableau: 'TD' }],
    levels: [{
      id: 'lv1', name: t.level, elevation: 0, background: null,
      walls: [{ id: 'w1', pts: [[0, 0], [1200, 0], [1200, 800], [0, 800], [0, 0]], thick: 20 }, { id: 'w2', pts: [[500, 0], [500, 800]], thick: 15 }],
      rooms: [{ id: 'r1', name: t.garage, pts: [[0, 0], [500, 0], [500, 800], [0, 800]] }, { id: 'r2', name: t.yard, pts: [[500, 0], [1200, 0], [1200, 800], [500, 800]] }],
      openings: [{ id: 'o1', type: 'door', x: 210, y: 800, angle: 0, w: 83, thick: 20, flip: false, side: false },
                 { id: 'o2', type: 'window', x: 840, y: 0, angle: 0, w: 120, thick: 20, flip: false, side: false }],
      dims: [{ id: 'd1', a: [0, 0], b: [1200, 0], offset: -60 }, { id: 'd2', a: [1200, 0], b: [1200, 800], offset: -60 }],
      texts: [],
      devices: [dev('e1', 'bd', 'BD1', 480, 80), dev('e2', 'prise', 'P1', 70, 480, 'c2'), dev('e3', 'inter_vv', 'I1', 480, 740, 'c1', 'VV'),
                dev('e4', 'lum', 'L1', 880, 480, 'c1'), dev('e5', 'spots', 'SP1', 880, 690, 'c1'), dev('e6', 'dm', 'DM1', 1150, 130, 'c1', 'DM')],
      gaines: [{ id: 'g1', num: 'G01', a: 'e1', b: 'e2', pts: [[70, 80]], kind: 'pwr', tube: 'ICTA Ø25', content: 'R25.1, B25.1, T25.1' },
               { id: 'g2', num: 'G02', a: 'e1', b: 'e4', pts: [[880, 80]], kind: 'pwr', tube: 'ICTA Ø25', content: 'R15.2, B15.2, T15.2, N15.2' },
               { id: 'g3', num: 'G03', a: 'e1', b: 'e3', pts: [], kind: 'pwr', tube: 'ICTA Ø25', content: 'R15.2, J15.2, J15.3' },
               { id: 'g4', num: 'G04', a: 'e4', b: 'e5', pts: [], kind: 'pwr', tube: 'ICTA Ø25', content: 'N15.2, B15.2, T15.2' },
               { id: 'g5', num: 'G05', a: 'e1', b: 'e6', pts: [[1150, 80]], kind: 'lv', tube: 'ICTA Ø20', content: 'Bus 2×0,8' }]
    }]
  };
}

// Tâche « Demande libre » terminée, avec sa proposition et son rapport.
function job(lang) {
  const fr = lang === 'fr';
  return {
    job: { id: 'demo1', kind: 'free', title: fr ? 'Demande libre : Ajoute une prise de courant dans le gara' : 'Free request: Add a socket outlet in the garage next to',
      status: 'done', dir: '/home/user/.config/ElecPlan/jobs/demo1', created: Date.now() - 60000, started: Date.now() - 52000, ended: Date.now() - 26000,
      log: ['→ Read CONSIGNE.md', '→ Read projet.json',
        fr ? 'Je place la prise près de la porte du garage et je la raccorde à BD1.' : 'Placing the socket next to the garage door and connecting it to BD1.',
        '→ Write resultat.json', '→ Write rapport.md', fr ? 'Terminé : 1 appareil, 1 gaine.' : 'Done: 1 device, 1 conduit.'] },
    result: {
      'resultat.json': JSON.stringify({
        devices: [{ ref: 'P2', type: 'prise', x: 330, y: 760, label: fr ? 'Prise service garage' : 'Garage utility socket' }],
        gaines: [{ a_ref: 'BD1', b_ref: 'P2', pts: [[330, 80]], kind: 'pwr', tube: 'ICTA Ø25', content: 'R25.1, B25.1, T25.1' }],
        assign: [{ ref: 'P2', circuit: 'c2' }],
        notes: [fr ? 'P2 à droite de la porte du garage (330, 760) ; gaine G06 BD1 → P2 en L via (330, 80), ≈ 7,3 m.' : 'P2 to the right of the garage door (330, 760); conduit G06 BD1 → P2, L-shaped via (330, 80), ≈ 7.3 m.',
                fr ? 'Circuit c2 Prises (20 A, 2,5) ; remplissage 3 × 10,2 = 30,6 mm² ≪ 92 mm² (1/3 de Ø25).' : 'Circuit c2 Sockets (20 A, 2.5); fill 3 × 10.2 = 30.6 mm² ≪ 92 mm² (1/3 of Ø25).']
      }),
      'rapport.md': fr
        ? '# Rapport\n\n- **P2** (prise) ajoutée à droite de la porte du garage : (330, 760) cm.\n- **G06** : BD1 → P2, ICTA Ø25, tracé en L par (330, 80), fils R25.1 / B25.1 / T25.1.\n\n## Hypothèses\n- P2 sur le circuit c2 « Prises » (20 A, 2,5 mm²), en repiquage depuis BD1.\n- Remplissage : 3 × 10,2 = 30,6 mm² ≤ 1/3 de 276 mm².\n- Hauteur de pose non précisée.'
        : '# Report\n\n- **P2** (socket) added to the right of the garage door: (330, 760) cm.\n- **G06**: BD1 → P2, ICTA Ø25, L-shaped via (330, 80), wires R25.1 / B25.1 / T25.1.\n\n## Assumptions\n- P2 on circuit c2 “Sockets” (20 A, 2.5 mm²), fed from BD1.\n- Fill: 3 × 10.2 = 30.6 mm² ≤ 1/3 of 276 mm².\n- Mounting height not specified.',
      dir: '/home/user/.config/ElecPlan/jobs/demo1'
    }
  };
}
module.exports = { project, job };
