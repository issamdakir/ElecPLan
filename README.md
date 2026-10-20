# ElecPlan 0.1

Application de bureau Linux pour dessiner des plans d'architecte et des plans électriques, avec assistance IA via **Claude Code** installé sur le PC.

## Installation

- **AppImage** : `chmod +x ElecPlan-0.1.0.AppImage` puis double-clic (ou `./ElecPlan-0.1.0.AppImage`).
- **Debian / Ubuntu** : `sudo apt install ./elecplan_0.1.0_amd64.deb`, puis lancer « ElecPlan » depuis le menu.

L'application fonctionne entièrement **hors ligne** pour le dessin, les fichiers et les exports.

## Assistant IA (facultatif)

Les tâches IA sont exécutées en arrière-plan par Claude Code, avec le compte Claude connecté sur ce PC
(abonnement Pro ou Max). Elles comptent dans les limites d'usage de l'abonnement. Aucune clé n'est stockée dans l'application.

```bash
npm install -g @anthropic-ai/claude-code
claude          # puis /login avec ton compte Claude
```

Tâches disponibles (onglet « Assistant IA ») :
1. **Lire un croquis ou une photo** → murs, pièces, ouvertures, appareils, gaines proposés, à appliquer en un clic.
2. **Proposer gaines et câblage** → tracé des gaines, circuits, contenu codé (R25.1…), remplissage, Wago.
3. **Générer le dossier complet** → dossier.html (+ PDF si les commandes sont autorisées).
4. **Vérifier la conformité** → liste des points (bloquant / important / conseil), clic pour voir l'élément.
5. **Demande libre**.

Chaque tâche travaille dans son propre dossier (`~/.config/ElecPlan/jobs/<id>/`) : `CONSIGNE.md`, `projet.json`,
puis `resultat.json` et `rapport.md` écrits par Claude. Par défaut, Claude n'a accès qu'aux fichiers de ce dossier ;
les commandes (Bash) ne sont autorisées que si tu coches l'option.

## Utilisation

| Outil | Touche | Usage |
|---|---|---|
| Sélection | V | clic, glisser, poignées de sommets ; double-clic sur un tronçon = ajouter un sommet/coude, sur un sommet = le retirer |
| Vue | H / Espace / molette | déplacer, zoomer |
| Mur | W | clics successifs ; double-clic, Entrée ou clic droit pour finir ; Maj = angle libre |
| Pièce | R | clics sur les angles ; surface calculée |
| Porte / Fenêtre | D / F | se colle au mur le plus proche ; R tourne, Maj+R inverse |
| Cote | C | 2 clics |
| Texte | T | clic |
| Appareil | E | choisir le type dans « Appareils » ; repère automatique unique (P1, I2…) ; R tourne |
| Gaine | G | appareil de départ → coudes → appareil d'arrivée ; numéro G01… automatique |
| Échelle | — | 2 points sur le fond de plan + distance réelle |

Fichiers : projet `.elecplan.json`, les anciens `.fpp.json` s'ouvrent aussi (Ctrl+S / Ctrl+O), fond de plan image ou PDF (1re page), export **PDF A3** (un niveau par page, échelle normalisée, cartouche et légende), export SVG, nomenclature CSV. Annuler / rétablir : Ctrl+Z / Ctrl+Maj+Z. Niveaux multiples (onglets en haut).

## Développement

```bash
npm install
npm start          # lance l'application
npm run dist       # construit dist/*.AppImage et dist/*.deb
```

Fichiers : `main.js` (fenêtre, fichiers, PDF, file des tâches Claude Code), `preload.js` (pont sécurisé),
`src/app.js` (éditeur), `src/ai.js` (assistant), `src/model.js` (données, géométrie), `src/symbols.js` (symboles), `src/pdfbg.js` (lecture PDF),
`src/fonts/` (Inter et JetBrains Mono, licence OFL, embarquées dans l'application).

## Prévu ensuite

Import DXF, schéma unifilaire, cotation automatique des pièces, calques personnalisés, impression multi-échelles.
