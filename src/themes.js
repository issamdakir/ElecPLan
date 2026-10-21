// ElecPlan — thèmes de l'interface et du plan, chacun en version claire et sombre.
// Clés d'interface : bg … danger (variables CSS) ; clés du plan : mêmes noms que les couleurs des paramètres
// (canvas, wall, room, device, grid…, g_<nature de gaine>), qui peuvent encore être personnalisées une à une.
// Les exports (PDF, SVG) utilisent toujours la version claire du thème : ils sont faits pour le papier.
const THEMES = {
  atelier: { name: 'Atelier',   // vert d'eau sur papier crème : le thème d'origine
    light: { bg: '#eef1ef', surface: '#ffffff', sunk: '#f6f8f7', fg: '#17201d', muted: '#5d6b66', line: '#d5dcd8', line2: '#b9c3be',
      accent: '#0f6b5a', accentSoft: '#e1f0ec', sel: '#e8572a', warn: '#9a5b00', warnSoft: '#fbf0dc', danger: '#b42318',
      canvas: '#fbfcfb', grid: '#e7ecea', gridMajor: '#d7dfdb', axisX: '#e2867d', axisY: '#86b86f', wall: '#2b3330', room: '#f3efe4', device: '#17201d',
      g_pwr: '#0f6b5a', g_lv: '#1f6fd1', g_res: '#8c9590', g_ext: '#9a5b00' },
    dark: { bg: '#121816', surface: '#1a2220', sunk: '#212b28', fg: '#e4ebe8', muted: '#93a19b', line: '#2d3834', line2: '#45524d',
      accent: '#3db398', accentSoft: '#1b3631', sel: '#ff7a4d', warn: '#e0a43c', warnSoft: '#382c15', danger: '#f0645a',
      canvas: '#151c1a', grid: '#1f2825', gridMajor: '#2a3531', axisX: '#b95c55', axisY: '#5a9448', wall: '#d7e0dc', room: '#2a2d25', device: '#e4ebe8',
      g_pwr: '#3db398', g_lv: '#5b9cf0', g_res: '#8c9590', g_ext: '#e0a43c' } },
  nordic: { name: 'Nordique',   // ardoise froide, accent indigo
    light: { bg: '#edf0f5', surface: '#ffffff', sunk: '#f5f7fb', fg: '#1b2333', muted: '#5f6b80', line: '#d8dee9', line2: '#b8c2d3',
      accent: '#4c5fd5', accentSoft: '#e6e9fb', sel: '#f08a3c', warn: '#a86500', warnSoft: '#fdf1df', danger: '#c62f3a',
      canvas: '#fafbfd', grid: '#e8ecf3', gridMajor: '#d6dce8', axisX: '#e07b7b', axisY: '#6fb38a', wall: '#2e3646', room: '#e9eef7', device: '#1b2333',
      g_pwr: '#4c5fd5', g_lv: '#0f9fb5', g_res: '#8a94a6', g_ext: '#b7791f' },
    dark: { bg: '#10141c', surface: '#171d28', sunk: '#1d2430', fg: '#e5e9f0', muted: '#98a2b5', line: '#283041', line2: '#3b4558',
      accent: '#8195ff', accentSoft: '#252c4b', sel: '#f5a75f', warn: '#e9b24a', warnSoft: '#382d17', danger: '#f07178',
      canvas: '#121722', grid: '#1c2330', gridMajor: '#28303e', axisX: '#c16363', axisY: '#5c9b76', wall: '#d8dee9', room: '#1e283a', device: '#e5e9f0',
      g_pwr: '#8195ff', g_lv: '#3cc6d8', g_res: '#8a94a6', g_ext: '#e9b24a' } },
  graphite: { name: 'Graphite',   // gris neutres, accent ambre
    light: { bg: '#efefef', surface: '#ffffff', sunk: '#f6f6f6', fg: '#1a1a1a', muted: '#666666', line: '#dcdcdc', line2: '#bdbdbd',
      accent: '#c76a05', accentSoft: '#fbeedd', sel: '#2563eb', warn: '#9a5b00', warnSoft: '#fbf0dc', danger: '#c0262d',
      canvas: '#fcfcfc', grid: '#ebebeb', gridMajor: '#d9d9d9', axisX: '#e07070', axisY: '#70b070', wall: '#262626', room: '#f1f0ec', device: '#1a1a1a',
      g_pwr: '#c76a05', g_lv: '#2563eb', g_res: '#8a8a8a', g_ext: '#7c5a2a' },
    dark: { bg: '#111111', surface: '#1a1a1a', sunk: '#212121', fg: '#ebebeb', muted: '#9a9a9a', line: '#2c2c2c', line2: '#444444',
      accent: '#f59e0b', accentSoft: '#3a2a10', sel: '#60a5fa', warn: '#fbbf24', warnSoft: '#382d12', danger: '#f87171',
      canvas: '#151515', grid: '#202020', gridMajor: '#2c2c2c', axisX: '#b35a5a', axisY: '#5a985a', wall: '#e3e3e3', room: '#252525', device: '#ebebeb',
      g_pwr: '#f59e0b', g_lv: '#60a5fa', g_res: '#8a8a8a', g_ext: '#c9a26b' } }
};
