"""Manuel utilisateur ElecPlan 0.1 → manual.html (pages A4 fixes), rendu ensuite en PDF."""
import html
E = html.escape
pages = []
SECTIONS = []

def page(sec, title, body, lead=None):
    if sec and (not SECTIONS or SECTIONS[-1][0] != sec):
        SECTIONS.append((sec, title, len(pages) + 1))
    pages.append(f"""<div class='pg'><div class='top'><div><div class='sec'>{E(sec)}</div><h1>{E(title)}</h1></div><div class='brand'>Elec<b>Plan</b> · manuel</div></div>
{f"<p class='lead'>{lead}</p>" if lead else ''}{body}<div class='foot'><span>ElecPlan 0.1 · Manuel utilisateur</span><span class='pn'></span></div></div>""")

def tbl(head, rows, cls=''):
    return f"<table class='{cls}'><thead><tr>{''.join(f'<th>{h}</th>' for h in head)}</tr></thead><tbody>" + ''.join('<tr>' + ''.join(f'<td>{c}</td>' for c in r) + '</tr>' for r in rows) + "</tbody></table>"

def shot(src, cap, h=None):
    st = f" style='max-height:{h}mm'" if h else ''
    return f"<figure><img src='{src}'{st}><figcaption>{cap}</figcaption></figure>"

kbd = lambda k: f"<kbd>{E(k)}</kbd>"

# ---------- couverture ----------
cover = """<div class='pg cover'><div class='cv-top'><div class='sec'>Manuel utilisateur · version 0.1</div>
<h1>Elec<span>Plan</span></h1><p class='cv-sub'>Plans d'architecte et plans électriques, avec assistance IA par Claude Code.</p></div>
<img class='cv-img' src='s_main.png'>
<div class='cv-foot'><div><b>Plateforme</b><br>Linux (AppImage, .deb)</div><div><b>Fichiers</b><br>projet .elecplan.json · PDF A3 · SVG · CSV</div><div><b>Assistance IA</b><br>Claude Code installé sur le PC, compte Claude connecté</div><div><b>Édition</b><br>20/10/2026</div></div></div>"""

# ---------- 1 présentation ----------
page("01 · Présentation", "Ce que fait ElecPlan", f"""
<div class='grid2'>
<div><h2>En bref</h2><p>ElecPlan dessine le plan d'un bâtiment (murs, pièces, portes, fenêtres, cotes) puis, par-dessus, le plan électrique : appareils repérés, boîtes de dérivation, gaines numérotées et circuits. Il produit un plan A3 imprimable, une nomenclature et, avec l'assistant IA, des propositions de câblage, un contrôle de conformité et un dossier complet.</p>
<h2>Principes</h2><ul>
<li><b>Unité : le centimètre.</b> Les coordonnées, épaisseurs et largeurs sont en cm ; l'affichage des longueurs est en mètres.</li>
<li><b>Niveaux.</b> Un projet contient plusieurs niveaux (RDC, étage, cave…), chacun avec son plan et son fond.</li>
<li><b>Repères uniques.</b> Chaque appareil reçoit un repère automatique (P1, I2, BD3…) unique dans tout le projet.</li>
<li><b>Gaines numérotées une fois pour toutes.</b> G01, G02… Un numéro n'est jamais réattribué automatiquement.</li>
<li><b>Hors ligne.</b> Le dessin, les fichiers et les exports fonctionnent sans Internet. Seul l'assistant IA utilise Claude.</li></ul></div>
<div><h2>Les trois couches d'un plan</h2>
<div class='card'><b>Architecture</b><p>Murs épais, pièces avec surface, portes et fenêtres collées aux murs, cotes, textes. Un fond de plan (image ou PDF) peut servir de calque.</p></div>
<div class='card'><b>Électricité</b><p>17 types d'appareils (prises, inters S / VV / ON, détecteurs, luminaires, spots, BD, tableau, coffret, RJ45…), chacun avec circuit, mode, hauteur et note.</p></div>
<div class='card'><b>Gaines</b><p>Tracées d'un appareil à un autre, avec coudes. Nature (courant fort, faible, réserve, extérieur), conduit et contenu (codes de fils).</p></div>
<div class='note'>L'assistant IA est facultatif : sans Claude Code, toutes les fonctions de dessin et d'export restent disponibles.</div></div></div>""")

# ---------- 2 installation ----------
page("02 · Installation", "Installer et lancer l'application", f"""
<div class='grid2'><div>
<h2>Option A · paquet Debian / Ubuntu</h2>
<pre>sudo apt install ./elecplan_0.1.0_amd64.deb</pre>
<p>L'application apparaît dans le menu sous le nom <b>ElecPlan</b>. Pour la désinstaller : <code>sudo apt remove elecplan</code>.</p>
<h2>Option B · AppImage portable</h2>
<pre>chmod +x ElecPlan-0.1.0.AppImage
./ElecPlan-0.1.0.AppImage</pre>
<p>Aucune installation : le fichier se lance tel quel, depuis une clé USB par exemple. Sur certaines distributions récentes, il faut installer <code>libfuse2</code> pour les AppImage.</p>
<h2>Où sont mes données ?</h2>
{tbl(['Élément', 'Emplacement'], [
 ['Projets', 'là où tu les enregistres (fichiers <code>.elecplan.json</code> ; les anciens <code>.fpp.json</code> s\'ouvrent aussi)'],
 ['Récupération automatique', 'mémoire locale de l\'application, à chaque modification'],
 ['Réglages de l\'assistant', '<code>~/.config/ElecPlan/settings.json</code>'],
 ['Tâches IA', '<code>~/.config/ElecPlan/jobs/&lt;id&gt;/</code>']])}
</div><div>
<h2>Assistant IA · Claude Code</h2>
<p>Pour utiliser l'assistant, installe Claude Code une seule fois (Node.js 18 ou plus récent requis) :</p>
<pre>npm install -g @anthropic-ai/claude-code
claude
# dans Claude Code : /login</pre>
<p>Connecte-toi avec ton compte Claude (abonnement Pro ou Max). ElecPlan lance ensuite Claude Code en arrière-plan ; il n'a besoin d'aucune clé et n'en stocke aucune.</p>
<div class='note'>Les tâches IA comptent dans les limites d'usage de ton abonnement Claude, comme une utilisation de Claude Code en ligne de commande.</div>
<h2>Vérifier</h2>
<p>Ouvre l'onglet <b>Assistant IA</b> : la carte « Claude Code » doit afficher ✅ et la version détectée. Sinon, voir <b>Dépannage</b> (section 11).</p>
<h2>Développement</h2>
<pre>npm install
npm start        # lancer
npm run dist     # construire .AppImage et .deb</pre>
</div></div>""")

# ---------- 3 interface ----------
marks = [(1, 2, 2.2), (2, 37.5, 2.2), (3, 54.5, 2.2), (4, 3, 30), (5, 40, 50), (6, 83, 5.5), (7, 30, 98), (8, 73, 94)]
mk = ''.join(f"<span class='mk' style='left:{x}%;top:{y}%'>{n}</span>" for n, x, y in marks)
page("03 · Interface", "L'écran principal", f"""
<div class='annot'><img src='s_main.png'>{mk}</div>
{tbl(['', 'Zone', 'Rôle'], [
 ['1', 'Nom du projet', 'Clique pour le modifier. « ● non enregistré » signale des changements à enregistrer.'],
 ['2', 'Fichiers', 'Nouveau, Ouvrir, Enregistrer, Fond de plan, Exporter PDF.'],
 ['3', 'Niveaux', 'Un onglet par niveau. Double-clic pour renommer, « + Niveau » pour en ajouter.'],
 ['4', 'Outils', 'Sélection, vue, outils d\'architecture, d\'électricité et mise à l\'échelle du fond.'],
 ['5', 'Plan', 'Zone de dessin. Molette : zoom au curseur. Espace + glisser ou clic molette : déplacer la vue.'],
 ['6', 'Panneau', 'Propriétés de la sélection, bibliothèque d\'appareils, nomenclature, assistant IA.'],
 ['7', 'Barre d\'état', 'Coordonnées, zoom, grille et pas, angles 15°, épaisseur des murs, couches visibles.'],
 ['8', 'Zoom', '+, −, et ⤢ pour tout voir.']], 'compact')}""")

# ---------- 4 premier projet ----------
steps = [
 ('Créer le projet', 'Clique « Nouveau », puis renomme le projet en haut à gauche. Renomme le niveau « RDC » si besoin (double-clic sur l\'onglet).'),
 ('Importer un fond (facultatif)', '« Fond de plan » → image ou PDF. Puis outil <b>Échelle</b> : clique 2 points dont tu connais la distance et saisis-la en mètres.'),
 ('Tracer les murs', 'Outil <b>Mur</b> ' + kbd('W') + ' : clique chaque angle. Clique sur le premier point pour fermer, ou double-clic / ' + kbd('Entrée') + ' pour finir. Choisis l\'épaisseur dans la barre d\'état.'),
 ('Définir les pièces', 'Outil <b>Pièce</b> ' + kbd('R') + ' : clique les angles intérieurs. La surface s\'affiche ; nomme la pièce dans Propriétés.'),
 ('Poser portes et fenêtres', 'Outils ' + kbd('D') + ' et ' + kbd('F') + ' : survole un mur, l\'ouverture s\'y colle. ' + kbd('R') + ' tourne le battant, ' + kbd('Maj+R') + ' l\'inverse.'),
 ('Coter', 'Outil <b>Cote</b> ' + kbd('C') + ' : 2 clics. Règle le décalage dans Propriétés.'),
 ('Placer les appareils', 'Onglet <b>Appareils</b> : choisis un type puis clique sur le plan. Le repère est automatique. Renseigne circuit et mode dans Propriétés.'),
 ('Tracer les gaines', 'Outil <b>Gaine</b> ' + kbd('G') + ' : clique l\'appareil de départ (souvent une BD), les coudes, puis l\'appareil d\'arrivée. Saisis le contenu (R25.1, B25.1…).'),
 ('Contrôler', 'Onglet <b>Nomenclature</b> pour les quantités et longueurs ; onglet <b>Assistant IA</b> → « Vérifier la conformité ».'),
 ('Enregistrer et exporter', kbd('Ctrl+S') + ' pour enregistrer le projet, « Exporter PDF » pour le plan A3 de chaque niveau.')]
page("04 · Prise en main", "Un premier plan en 10 étapes",
 "<ol class='steps'>" + ''.join(f"<li><b>{t}</b><span>{d}</span></li>" for t, d in steps) + "</ol>" + shot('s_wall.png', 'Tracé d\'un mur : la longueur s\'affiche en direct près du curseur.', 70))

# ---------- 5 outils ----------
page("05 · Dessin", "Outils d'architecture", tbl(['Outil', 'Touche', 'Utilisation', 'Astuces'], [
 ['Sélection', kbd('V'), 'Clic pour sélectionner, glisser pour déplacer. Les sommets d\'un mur, d\'une pièce ou d\'une gaine ont des poignées.', 'Double-clic sur un tronçon : ajoute un sommet. Double-clic sur une poignée : la retire. Flèches : déplacer de la valeur du pas ; Maj + flèche : 50 cm.'],
 ['Vue', kbd('H'), 'Glisser pour déplacer la vue.', 'À tout moment : ' + kbd('Espace') + ' + glisser, ou clic molette. Molette : zoom au curseur.'],
 ['Mur', kbd('W'), 'Clics successifs. Fin : double-clic, ' + kbd('Entrée') + ', clic droit, ou clic sur le premier point (mur fermé).', 'Angles par pas de 15° et longueurs au pas de grille ; ' + kbd('Maj') + ' pour un angle libre. Accrochage automatique aux sommets existants.'],
 ['Pièce', kbd('R'), 'Clics sur les angles, fin par double-clic ou ' + kbd('Entrée') + '.', 'Surface et périmètre dans Propriétés. Couleur de fond réglable.'],
 ['Porte', kbd('D'), 'Survole un mur, clic pour poser (83 cm par défaut).', kbd('R') + ' : tourne le battant ; ' + kbd('Maj+R') + ' : inverse. Largeur, battant et côté dans Propriétés.'],
 ['Fenêtre', kbd('F'), 'Survole un mur, clic pour poser (120 cm par défaut).', 'S\'aligne sur le mur et prend son épaisseur.'],
 ['Cote', kbd('C'), '2 clics sur les points à coter.', 'Décalage positif ou négatif dans Propriétés ; la valeur suit les points.'],
 ['Texte', kbd('T'), 'Clic puis saisie.', 'Double-clic en Sélection pour modifier.'],
 ['Échelle', '—', '2 clics sur le fond de plan, puis distance réelle en mètres.', 'À faire avant de dessiner sur un fond importé.']]) +
 """<div class='grid2' style='margin-top:4mm'><div class='card'><b>Grille et accrochage</b><p>Case « Grille » et pas (5, 10, 25 ou 50 cm) dans la barre d'état. Maintiens <kbd>Alt</kbd> pendant un déplacement pour ignorer la grille.</p></div>
 <div class='card'><b>Couches</b><p>Les cases Fond, Archi, Électrique, Gaines et Cotes masquent une couche à l'écran ; un élément masqué ne peut pas être sélectionné.</p></div></div>""")

# ---------- 6 électricité ----------
page("06 · Électricité", "Appareils et circuits", f"""
<div class='grid2'><div>{shot('c_lib.png', 'Onglet Appareils : choisir un type, puis cliquer sur le plan.', 105)}</div>
<div><h2>Poser un appareil</h2><ol><li>Onglet <b>Appareils</b>, clic sur le type.</li><li>L'outil <b>Appareil</b> s'active : clique sur le plan.</li><li>Le repère est attribué : P pour les prises, I pour les inters, L pour les luminaires, SP pour les spots, BD pour les boîtes, DM pour les détecteurs…</li></ol>
<h2>Propriétés d'un appareil</h2>
{tbl(['Champ', 'Usage'], [['Repère', 'Modifiable ; garde-le unique'], ['Type', 'Change le symbole'], ['Désignation', 'Texte libre (« Prise service garage »)'], ['Circuit', 'Choisi dans les circuits du projet'], ['Mode', 'S, VV, VV maître / esclave, ON, DM, DM/ON, BP'], ['Hauteur', 'Hauteur de pose en cm'], ['Note', 'Remarque de chantier']], 'compact')}
<p><kbd>R</kbd> tourne l'appareil sélectionné de 90°. <kbd>Ctrl+D</kbd> le duplique avec un nouveau repère. Supprimer un appareil supprime aussi ses gaines (un message l'indique).</p>
<h2>Circuits</h2><p>Sans sélection, le panneau Propriétés liste les circuits du projet (nom, calibre, section, tableau). « + Circuit » en ajoute un ; ils sont proposés dans la fiche de chaque appareil.</p></div></div>""")

# ---------- 7 gaines ----------
page("07 · Gaines", "Tracer et documenter les gaines", f"""
<div class='grid2'><div>
<h2>Tracer</h2><ol><li>Outil <b>Gaine</b> <kbd>G</kbd>.</li><li>Clic sur l'appareil de départ (tableau, coffret, BD…).</li><li>Clics pour les coudes.</li><li>Clic sur l'appareil d'arrivée : la gaine est créée avec le numéro suivant libre (G01, G02…).</li></ol>
<p><kbd>Échap</kbd> annule le tracé en cours. Les extrémités suivent les appareils quand on les déplace.</p>
<h2>Modifier</h2><ul><li>Glisser une poignée pour déplacer un coude.</li><li>Double-clic sur un tronçon : ajoute un coude ; double-clic sur un coude : le retire.</li></ul>
<h2>Propriétés</h2>
{tbl(['Champ', 'Exemple'], [['Numéro', 'G07 (modifiable)'], ['Nature', 'Courant fort · Courant faible · Réserve · Extérieur / enterré'], ['Conduit', 'ICTA Ø25'], ['Contenu', 'R25.1, B25.1, T25.1']], 'compact')}
<div class='note'>Convention de codage conseillée : lettre (R phase, B neutre, T terre, J navette, N retour) + section (15 = 1,5 mm², 25 = 2,5 mm²) + numéro de réseau. Même code de bout en bout, Wago compris.</div>
</div><div>{shot('c_gaine_plan.png', 'Gaine G01 sélectionnée : poignées carrées sur les coudes.', 80) + shot('c_gaine_props.png', 'Propriétés de la gaine.', 85)}</div></div>""")

# ---------- 8 fond, niveaux, nomenclature ----------
page("08 · Organisation", "Fond de plan, niveaux et nomenclature", f"""
<div class='grid2'><div>
<h2>Fond de plan</h2><p>« Fond de plan » importe une image (PNG, JPG, WEBP) ou la première page d'un PDF. Il est posé à 20 m de large par défaut : utilise l'outil <b>Échelle</b> pour le mettre aux bonnes dimensions. L'opacité se règle dans Propriétés (sans sélection) ; « Retirer » le supprime.</p>
<h2>Niveaux</h2><p>« + Niveau » ajoute un niveau ; double-clic sur un onglet pour le renommer. Chaque niveau a ses murs, appareils, gaines et son fond. Les repères et numéros de gaines restent uniques sur tout le projet. Le PDF exporte un niveau par page.</p>
<h2>Nomenclature</h2><p>L'onglet <b>Nomenclature</b> donne :</p><ul><li>le nombre d'appareils par type et par niveau ;</li><li>la liste des gaines du niveau (départ, arrivée, contenu, longueur sur plan) ;</li><li>les pièces et leurs surfaces.</li></ul>
<p>« Exporter la nomenclature (CSV) » produit un fichier lisible dans un tableur (séparateur point-virgule).</p></div>
<div>{shot('c_nomen.png', 'Nomenclature : appareils, gaines et pièces.', 150)}</div></div>""")

# ---------- 9 fichiers et exports ----------
page("09 · Fichiers", "Enregistrer, ouvrir, exporter", f"""
{tbl(['Action', 'Raccourci', 'Résultat'], [
 ['Enregistrer', kbd('Ctrl+S'), 'Fichier projet <code>.elecplan.json</code> (toutes les données, fond compris)'],
 ['Enregistrer sous', kbd('Ctrl+Maj+S'), 'Nouvelle copie du projet'],
 ['Ouvrir', kbd('Ctrl+O'), 'Charge un projet ; propose d\'abandonner les changements non enregistrés'],
 ['Exporter PDF', kbd('Ctrl+P'), 'A3 paysage, un niveau par page, échelle normalisée (1:20 à 1:1000), cartouche et légende des symboles utilisés'],
 ['Exporter SVG', 'menu Fichier', 'Plan vectoriel du niveau courant, pour un logiciel de dessin'],
 ['Nomenclature CSV', 'onglet Nomenclature', 'Appareils et gaines de tout le projet']], 'compact')}
<div class='grid2' style='margin-top:4mm'><div>{shot('s_pdfhi-1.png', 'Export PDF A3 : plan à l\'échelle, cartouche (projet, niveau), légende, échelle et date.', 95)}</div>
<div><h2>Récupération</h2><p>Chaque modification est gardée en mémoire locale. Si l'application se ferme sans enregistrement, le dernier travail est proposé au démarrage suivant (« Dernier travail non enregistré récupéré »). Cela ne remplace pas l'enregistrement du projet.</p>
<h2>Annuler</h2><p><kbd>Ctrl+Z</kbd> annule, <kbd>Ctrl+Maj+Z</kbd> ou <kbd>Ctrl+Y</kbd> rétablit (120 étapes). Une proposition de l'assistant appliquée s'annule aussi d'un seul <kbd>Ctrl+Z</kbd>.</p>
<h2>Échanger un projet</h2><p>Le fichier <code>.elecplan.json</code> est un texte JSON lisible : il peut être envoyé, archivé ou traité par un script (voir section 12).</p></div></div>""")

# ---------- 10 assistant IA ----------
page("10 · Assistant IA", "Tâches en arrière-plan avec Claude Code", f"""
<div class='grid2'><div>
<h2>Comment ça marche</h2><ol><li>Tu choisis une tâche et tu la lances.</li><li>ElecPlan crée un dossier de tâche avec <code>CONSIGNE.md</code>, <code>projet.json</code> et, si besoin, l'image.</li><li>Il lance <code>claude -p</code> dans ce dossier, en arrière-plan. Le journal s'affiche en direct ; tu continues à dessiner.</li><li>Claude écrit <code>resultat.json</code> (proposition) et <code>rapport.md</code>.</li><li>« Voir le résultat », puis « Appliquer » : la proposition est ajoutée au niveau courant (annulable par <kbd>Ctrl+Z</kbd>).</li></ol>
<p>Les tâches passent une par une, dans l'ordre. « Annuler » arrête une tâche ; « Dossier » ouvre son dossier de travail.</p>
<h2>Sécurité</h2><ul><li>Par défaut, Claude ne peut que lire et écrire des fichiers dans le dossier de la tâche ; les commandes système sont interdites.</li><li>« Autoriser les commandes » (tâche Dossier, ou Réglages) permet par exemple de produire un PDF.</li><li>Le projet envoyé n'inclut pas l'image de fond (sauf la tâche Croquis, qui envoie l'image choisie).</li></ul>
</div><div>{shot('c_ai.png', 'Tâche terminée : journal, proposition à appliquer et rapport.', 200)}</div></div>""")

page("10 · Assistant IA", "Les cinq tâches", tbl(['Tâche', 'À fournir', 'Résultat', 'Conseils'], [
 ['<b>Lire un croquis ou une photo</b>', 'Une image ; précisions (orientation, cotes connues, échelle)', 'Murs, pièces, ouvertures, appareils, gaines à appliquer ; rapport des hypothèses', 'Photo nette, de face. Indique une cote réelle : la reconstitution sera à la bonne échelle.'],
 ['<b>Proposer gaines et câblage</b>', 'Le plan avec ses appareils ; consignes (BD à utiliser, circuits imposés) ; remplacer ou compléter', 'Gaines tracées et numérotées, contenu codé, circuits, affectations ; rapport (remplissage, Wago par boîte)', 'Place d\'abord tableau et BD. Sans « Remplacer », les gaines existantes sont gardées.'],
 ['<b>Générer le dossier complet</b>', 'Le projet ; titre, date, points particuliers', 'dossier.html (et dossier.pdf si commandes autorisées) dans le dossier de la tâche', 'Si la skill « dossier-electrique-zone » est installée dans Claude Code, sa méthode est suivie.'],
 ['<b>Vérifier la conformité</b>', 'Le projet ; points prioritaires', 'Liste classée (bloquant, important, conseil) avec correction ; bouton « Voir » pour localiser', 'À lancer avant l\'export final.'],
 ['<b>Demande libre</b>', 'Ta demande en texte', 'Réponse dans le rapport ; modifications éventuelles à appliquer', 'Ex. : « Ajoute une prise IP44 à côté de chaque porte extérieure ».']]) +
 f"""<div class='grid2' style='margin-top:4mm'><div class='card'><b>Réglages</b><p>Dans l'onglet Assistant IA → Réglages : commande à lancer (par défaut <code>claude</code>, ou chemin complet), modèle (vide = celui de Claude Code), autorisation des commandes pour toutes les tâches.</p></div>
 <div class='card'><b>Usage et abonnement</b><p>Les tâches utilisent le compte connecté dans Claude Code et comptent dans les limites de l'abonnement. Une tâche simple prend de quelques secondes à une minute ; un dossier complet peut prendre plusieurs minutes.</p></div></div>
 <div class='card' style='margin-top:4mm'><b>Conventions transmises à Claude</b><p>Disjoncteurs 2P courbe C, ID 30 mA, fils rigides H07V-U, ICTA Ø25 (Ø30 borne) rempli au plus au tiers, 16 A / 20 A en 2,5 et 6–10 A en 1,5, codes R/B/T/J/N + section + numéro, gaines jamais renumérotées, Wago dans les BD et là où un fil se divise, fil traversant continu, repiquage sur borne double. Elles sont écrites dans <code>src/ai.js</code> et modifiables.</p></div>""")

# ---------- raccourcis ----------
page("11 · Référence", "Raccourcis clavier et dépannage", f"""
<div class='grid2'><div><h2>Raccourcis</h2>{tbl(['Touche', 'Action'], [
 [kbd('V'), 'Sélection'], [kbd('H') + ' / ' + kbd('Espace'), 'Vue (déplacer)'], [kbd('W'), 'Mur'], [kbd('R'), 'Pièce · ou tourner porte / appareil'], [kbd('D') + ' / ' + kbd('F'), 'Porte / Fenêtre'], [kbd('C'), 'Cote'], [kbd('T'), 'Texte'], [kbd('E'), 'Appareil'], [kbd('G'), 'Gaine'],
 [kbd('Entrée'), 'Terminer mur / pièce'], [kbd('Échap'), 'Annuler le tracé, puis désélectionner'], [kbd('Suppr'), 'Supprimer la sélection'], [kbd('Ctrl+D'), 'Dupliquer'], [kbd('Flèches'), 'Déplacer (Maj : 50 cm)'],
 [kbd('Ctrl+Z') + ' / ' + kbd('Ctrl+Maj+Z'), 'Annuler / rétablir'], [kbd('Ctrl+S') + ' / ' + kbd('Ctrl+O'), 'Enregistrer / ouvrir'], [kbd('Ctrl+P'), 'Exporter PDF'], [kbd('Maj') + ' (tracé)', 'Angle libre'], [kbd('Alt') + ' (déplacement)', 'Sans grille']], 'compact')}</div>
<div><h2>Dépannage</h2>{tbl(['Problème', 'Solution'], [
 ['« Claude Code introuvable »', 'Installe-le (<code>npm i -g @anthropic-ai/claude-code</code>). S\'il est installé ailleurs, mets son chemin complet dans Réglages (<code>which claude</code>).'],
 ['La tâche échoue tout de suite', 'Lance <code>claude</code> dans un terminal et fais <code>/login</code>. Vérifie la connexion Internet.'],
 ['« terminée (sans fichier de sortie) »', 'Claude n\'a pas écrit resultat.json ni rapport.md : relance avec une demande plus précise ; consulte le journal et le dossier.'],
 ['Limite d\'usage atteinte', 'Attends la réinitialisation de ton abonnement ; les fonctions de dessin restent disponibles.'],
 ['L\'AppImage ne démarre pas', 'Installe <code>libfuse2</code>, ou utilise le paquet .deb.'],
 ['Le fond PDF est flou', 'Il est rendu à 3× ; pour plus de détail, exporte la page en image haute définition et importe l\'image.'],
 ['Un élément ne se sélectionne pas', 'Vérifie que sa couche est cochée dans la barre d\'état.'],
 ['Les symboles sont trop petits', 'Propriétés (sans sélection) → Symboles → Taille.']], 'compact')}</div></div>""")

# ---------- format fichier ----------
page("12 · Référence", "Format du fichier projet", """
<p class='lead'>Un projet <code>.elecplan.json</code> est un JSON lisible (les anciens projets <code>.fpp.json</code> s'ouvrent aussi). Unités en centimètres, origine en haut à gauche, Y vers le bas.</p>
<pre class='big'>{
  "app": "ElecPlan", "version": 1, "name": "Villa exemple",
  "settings": { "grid": 10, "symbol": 2 },
  "circuits": [ { "id": "c1", "name": "Éclairage 1", "cal": "10A", "section": "1,5", "tableau": "TD" } ],
  "levels": [ {
    "id": "lv…", "name": "RDC", "elevation": 0,
    "background": { "src": "data:image/png;base64,…", "x": 0, "y": 0, "w": 2000, "h": 1400, "opacity": 0.5 },
    "walls":    [ { "id": "w…", "pts": [[0,0],[1200,0],[1200,800]], "thick": 20 } ],
    "rooms":    [ { "id": "r…", "name": "Garage", "pts": [[0,0],[500,0],[500,800],[0,800]] } ],
    "openings": [ { "id": "o…", "type": "door", "x": 250, "y": 800, "angle": 0, "w": 83, "flip": false } ],
    "dims":     [ { "id": "d…", "a": [0,0], "b": [1200,0], "offset": -60 } ],
    "texts":    [ { "id": "t…", "x": 100, "y": 100, "text": "Niche", "size": 18 } ],
    "devices":  [ { "id": "e…", "type": "prise_ip", "ref": "P1", "x": 60, "y": 450, "rot": 0,
                    "label": "Prise IP44", "circuit": "c2", "mode": "", "height": "30", "note": "" } ],
    "gaines":   [ { "id": "g…", "num": "G01", "a": "e…(BD1)", "b": "e…(P1)", "pts": [[60,70]],
                    "kind": "pwr", "tube": "ICTA Ø25", "content": "R25.1, B25.1, T25.1" } ]
  } ]
}</pre>
<div class='grid2'><div class='card'><b>Types d'appareils</b><p>prise, prise_ip, prise_spe, inter_s, inter_vv, inter_on, poussoir, dm, lum, applique, spots, bd, tableau, coffret, equip, rj45, reserve.</p></div>
<div class='card'><b>Nature des gaines</b><p>pwr (courant fort), lv (courant faible), res (réserve), ext (extérieur / enterré). Une gaine relie deux appareils par leur <code>id</code> ; <code>pts</code> contient seulement les coudes.</p></div></div>
<h2>Prévu dans les prochaines versions</h2><p>Import DXF, schéma unifilaire, cotation automatique des pièces, déplacement des étiquettes de pièce, calques personnalisés, icône de l'application.</p>""")

# ---------- sommaire ----------
toc_rows = ''.join(f"<div class='tn'>{E(s.split(' · ')[0])}</div><div class='tt'>{E(s.split(' · ')[1])}<small>{E(t)}</small></div><div class='tp'>{p + 2}</div>" for s, t, p in SECTIONS)
toc = f"""<div class='pg'><div class='top'><div><div class='sec'>Sommaire</div><h1>Contenu du manuel</h1></div><div class='brand'>Elec<b>Plan</b> · manuel</div></div><div class='toc'>{toc_rows}</div><div class='foot'><span>ElecPlan 0.1 · Manuel utilisateur</span><span class='pn'></span></div></div>"""

CSS = """
@font-face{font-family:Barlow;src:url(fonts/Barlow-Regular.ttf);font-weight:400}
@font-face{font-family:Barlow;src:url(fonts/Barlow-SemiBold.ttf);font-weight:600}
@font-face{font-family:Barlow;src:url(fonts/Barlow-Bold.ttf);font-weight:700}
@font-face{font-family:"Barlow Condensed";src:url(fonts/BarlowCondensed-Bold.ttf);font-weight:700}
@font-face{font-family:"JetBrains Mono";src:url(fonts/JetBrainsMono-Variable.ttf);font-weight:100 800}
@page{size:A4;margin:0}
*{box-sizing:border-box}
body{margin:0;font-family:Barlow,sans-serif;color:#17201d;font-size:10.6pt;line-height:1.42;counter-reset:pg}
.pg{width:210mm;height:297mm;padding:15mm 15mm 16mm;position:relative;page-break-after:always;overflow:hidden;counter-increment:pg;display:flex;flex-direction:column;gap:3mm}
.top{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:.6mm solid #17201d;padding-bottom:2.5mm;margin-bottom:1mm}
.sec{font:700 8pt "JetBrains Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:#0f6b5a}
h1{font:700 22pt "Barlow Condensed",sans-serif;margin:1mm 0 0;line-height:1}
h2{font:700 12.5pt "Barlow Condensed",sans-serif;margin:3mm 0 1mm;color:#17201d}
.brand{font:600 8.5pt "JetBrains Mono",monospace;color:#5d6b66}.brand b{color:#0f6b5a}
.lead{font-size:11.5pt;color:#3b4643;margin:0}
p{margin:0 0 1.6mm} ul,ol{margin:0 0 1.6mm;padding-left:5mm} li{margin-bottom:.8mm}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:6mm;align-items:start}
.card{border:.3mm solid #d5dcd8;border-radius:2mm;padding:3mm 3.5mm;margin-bottom:2.5mm;background:#fff}.card b{font-size:10.5pt}.card p{margin:1mm 0 0}
.note{background:#fbf0dc;color:#7a4800;border-radius:2mm;padding:3mm 3.5mm;font-size:10pt;margin:2mm 0}
pre{background:#17201d;color:#e9f1ee;border-radius:2mm;padding:3mm 3.5mm;font:9pt/1.45 "JetBrains Mono",monospace;margin:1mm 0 2.5mm;white-space:pre-wrap}
pre.big{font-size:8.2pt}
code{font:9pt "JetBrains Mono",monospace;background:#eef1ef;padding:0 1mm;border-radius:1mm}
kbd{font:600 8.5pt "JetBrains Mono",monospace;border:.3mm solid #b9c3be;border-bottom-width:.7mm;border-radius:1mm;padding:0 1.2mm;background:#fff;white-space:nowrap}
table{border-collapse:collapse;width:100%;font-size:9.6pt}
th{text-align:left;font:700 7.5pt "JetBrains Mono",monospace;letter-spacing:.06em;text-transform:uppercase;color:#5d6b66;border-bottom:.4mm solid #17201d;padding:1.5mm 1.5mm}
td{border-bottom:.25mm solid #d5dcd8;padding:1.6mm 1.5mm;vertical-align:top}
table.compact td{padding:1.1mm 1.5mm}
figure{margin:0 0 2mm;display:flex;flex-direction:column;align-items:center}
figure img{max-width:100%;border:.3mm solid #d5dcd8;border-radius:1.5mm;box-shadow:0 .5mm 2mm rgba(0,0,0,.08)}
figcaption{font-size:8.6pt;color:#5d6b66;margin-top:1.2mm;text-align:center}
.annot{position:relative;margin-bottom:2mm}.annot img{width:100%;border:.3mm solid #d5dcd8;border-radius:1.5mm;display:block}
.mk{position:absolute;width:6.5mm;height:6.5mm;border-radius:50%;background:#e8572a;color:#fff;font:700 9pt "JetBrains Mono",monospace;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 .7mm #fff}
td:first-child .mkx{}
.steps{list-style:none;padding:0;counter-reset:st;display:grid;grid-template-columns:1fr 1fr;gap:2.5mm 6mm;margin:0 0 3mm}
.steps li{counter-increment:st;display:grid;grid-template-columns:8mm 1fr;gap:0 2mm;margin:0}
.steps li::before{content:counter(st);grid-row:span 2;width:7mm;height:7mm;border-radius:50%;background:#0f6b5a;color:#fff;font:700 9.5pt "JetBrains Mono",monospace;display:flex;align-items:center;justify-content:center}
.steps li b{font-size:10.5pt}.steps li span{font-size:9.8pt;color:#3b4643}
.foot{position:absolute;left:15mm;right:15mm;bottom:8mm;display:flex;justify-content:space-between;font:8pt "JetBrains Mono",monospace;color:#8c9590;border-top:.25mm solid #d5dcd8;padding-top:2mm}
.pn::after{content:counter(pg)}
.toc{display:grid;grid-template-columns:16mm 1fr 14mm;gap:0;margin-top:4mm}
.toc>div{border-bottom:.25mm solid #d5dcd8;padding:3.2mm 0}
.tn{font:700 14pt "Barlow Condensed",sans-serif;color:#0f6b5a}.tt{font-size:12pt;font-weight:600}.tt small{display:block;font-weight:400;color:#5d6b66;font-size:9.5pt}
.tp{text-align:right;font:600 11pt "JetBrains Mono",monospace}
.cover{padding:0;background:#17201d;color:#fff;gap:0}
.cv-top{padding:22mm 18mm 8mm}.cover .sec{color:#7fd3bd}
.cover h1{font-size:58pt;line-height:.92;margin-top:5mm}.cover h1 span{color:#7fd3bd}
.cv-sub{font-size:14pt;color:#c9d6d1;margin-top:5mm;max-width:150mm}
.cv-img{width:174mm;margin:6mm 18mm 0;border-radius:2mm;border:.4mm solid #3b4643}
.cv-foot{position:absolute;left:18mm;right:18mm;bottom:16mm;display:grid;grid-template-columns:repeat(4,1fr);gap:5mm;font-size:9.5pt;color:#c9d6d1;border-top:.3mm solid #3b4643;padding-top:4mm}
.cv-foot b{color:#fff;font:700 8pt "JetBrains Mono",monospace;letter-spacing:.08em;text-transform:uppercase}
"""
doc = f"<!doctype html><html lang='fr'><head><meta charset='utf-8'><title>ElecPlan · Manuel</title><style>{CSS}</style></head><body>{cover}{toc}{''.join(pages)}</body></html>"
open('manual.html', 'w').write(doc)
print(len(pages) + 2, 'pages')
