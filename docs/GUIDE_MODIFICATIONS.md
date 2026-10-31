# Guide de modifications — GENESIS Engine

Ce guide dit **où** et **comment** modifier chaque fonctionnalité, pas à pas, avec des exemples.
Règle d'or : **une fonctionnalité = un fichier (ou un petit dossier)**. Pour en ajouter, on crée un fichier
puis on ajoute **une ligne d'import**. Pour en retirer, on supprime cette ligne.

Après CHAQUE modification, lance : `npm run typecheck && npm test` (et `npm run build:local && npm run bot` pour les bots).

## 0. Carte du projet

| Je veux modifier…                         | Fichier(s)                                             |
|-------------------------------------------|--------------------------------------------------------|
| Une valeur (taille, couleur, délai, geste)| `src/config/index.ts`                                   |
| Ce que le moteur sait d'un jeu            | `src/games/<jeu>/adapter.ts`                            |
| La liste des jeux disponibles             | `src/games/index.ts` (1 ligne par jeu)                  |
| Un pinceau                                | `src/modules/sprite-editor/brushes/`                    |
| Un outil (remplir, pipette…)              | `src/modules/sprite-editor/tools/`                      |
| La façon d'importer des fichiers          | `src/modules/sprite-editor/import/`                     |
| Ce qui est exporté / vérifié              | `src/modules/sprite-editor/export/`                     |
| Les gestes tactiles / Pencil              | `src/modules/sprite-editor/canvas/input.ts` + CONFIG    |
| L'aperçu animé                            | `src/modules/sprite-editor/preview/preview.ts`          |
| Les calques / frames (actions annulables) | `src/modules/sprite-editor/layers/actions.ts`           |
| L'apparence (couleurs, tailles de boutons)| `src/ui/style.css`                                      |
| Les futurs outils (niveaux, HUD, sons)    | `src/modules/level-editor`, `ui-editor`, `sound-manager`|

Schéma des dépendances (jamais de cycle) : `shared` ← `config` ← `core` ← `engine` ← `games` / `modules`.
Les modules ne s'appellent **pas** entre eux directement : ils se parlent via le bus d'événements
(`src/core/events.ts`) et lisent l'état commun `session` (`src/modules/sprite-editor/session.ts`).

---

## 1. Changer une valeur (le plus simple)

Tout est dans `src/config/index.ts`.

**Exemple : épaissir le contour noir du pinceau d'encrage.**
1. Ouvre `src/config/index.ts`, section `brush`.
2. Change `inkOutlineRatio: 0.3` en `0.45` (contour = 45 % de la taille du pinceau).
3. `npm test` puis recharge l'appli : le contour est plus épais.

**Exemple : appui long plus court pour la pipette** → `brush.longPressMs: 550` → `350`.
**Exemple : zones tactiles plus grandes** → `minTouchPx: 44` → `52`, puis dans `src/ui/style.css` change `--touch:44px` en `52px`.
**Exemple : plus d'annulations** → `undoDepth: 100` → `300` (attention à la mémoire sur iPad).
**Exemple : fond de l'aperçu** → `preview.background`.
**Exemple : aperçu plus grand / plus petit** → `preview.canvasPx` (côté du carré, 520 par défaut). L'échelle est calculée pour que la frame ENTIÈRE du corps tienne (tête, arme, attaque) ; `marginPx` règle la marge, `zoomMin`/`zoomMax` les bornes du curseur Zoom. Code : `preview/preview.ts`.
**Exemple : autosave plus rapide** → `autosaveMs`.

## 2. Changer un geste

Les gestes sont dans `src/modules/sprite-editor/canvas/input.ts`, leurs seuils dans `CONFIG.gestures`.

**Exemple : le tap à deux doigts doit RÉTABLIR au lieu d'annuler.**
1. Dans `input.ts`, cherche `gestureMax === 2` (fonction `end`).
2. Remplace `session.history.undo()` par `session.history.redo()` pour 2 doigts, et l'inverse pour 3 doigts.
3. Mets à jour le test du bot `tests/bot/e2e.py` (`touch_tap(2)` / `touch_tap(3)`).

**Exemple : empêcher les doigts de dessiner (Pencil seulement)** → `CONFIG.gestures.touchDrawsWithoutPen: false`.
**Exemple : appui long = autre action** → dans `input.ts`, remplace l'appel à `pickColor` dans le `setTimeout`.

## 3. Ajouter un pinceau (1 fichier + 1 ligne)

**Exemple : un « marqueur » à bout carré fin, sans contour.**
1. Crée `src/modules/sprite-editor/brushes/marker.ts` :
   ```ts
   import { registerBrush } from './registry';
   registerBrush({
     id: 'marker', label: 'Marqueur',
     outline: false,       // true = contour noir épais comme le pinceau d'encrage
     erase: false,         // true = se comporte comme une gomme
     radius: (size, pressure) => Math.max(0.5, (size / 2) * (0.6 + 0.4 * pressure)), // rayon du tampon
   });
   ```
2. Ouvre `src/modules/sprite-editor/brushes/index.ts` et ajoute `import './marker';`.
3. Le pinceau apparaît dans la liste déroulante sous le canvas. Fini.
Pour le retirer : supprime l'import (et le fichier).

## 4. Ajouter un outil (1 fichier + 1 ligne)

Un outil peut aussi définir `activate()`, `deactivate()` (ex. valider une action en cours) et `options(host)` (sa barre de réglages) ; pour changer d'outil par code utilise `setActiveTool('id')`.

**Exemple : un outil « miroir horizontal » du calque.**
1. Crée `src/modules/sprite-editor/tools/flip.ts` :
   ```ts
   import { cloneCanvas, ctxOf } from '../canvas/pixels';
   import { commitPixels } from '../layers/actions';
   import { session } from '../session';
   import { registerSpriteTool } from './registry';

   registerSpriteTool({
     id: 'flip', label: 'Miroir', icon: '⇋', shortcut: 'F',
     down() {
       const l = session.layer; if (!l || l.locked) return;
       const g = ctxOf(l.canvas), before = g.getImageData(0, 0, l.canvas.width, l.canvas.height), copy = cloneCanvas(l.canvas);
       g.clearRect(0, 0, l.canvas.width, l.canvas.height);
       g.save(); g.scale(-1, 1); g.drawImage(copy, -l.canvas.width, 0); g.restore();
       commitPixels(l, before, 'Miroir');   // rend l'action annulable
     },
     move() {}, up() {}, cancel() {},
   });
   ```
2. Ajoute `import './flip';` dans `tools/index.ts`.
3. (Optionnel) raccourci clavier : dans `ui/shortcuts.ts`, ajoute `else if (k === 'f') tool('flip');` et la clé dans `CONFIG.shortcuts`.

## 4b. Sélection, transformation et fondu de couleurs (outils intégrés)

| Fonction | Fichier | Réglages (`src/config/index.ts`) |
|---|---|---|
| Sélection (rectangle, ellipse, lasso) | `tools/select.ts`, état dans `selection/selection.ts` | `selection` |
| Déplacer / pivoter / redimensionner / miroir | `tools/transform.ts`, géométrie pure dans `tools/transformMath.ts` | `transform` |
| Fondu (mélange les couleurs en glissant) | `tools/blend.ts` | `blend` |
| Modes de fusion des calques | `model.ts` (`drawFrame`), liste dans `CONFIG.blendModes` | `blendModes` |

Comment ça se comporte :
- **Sélection** : un glissé crée la zone, un simple tap la supprime. Pinceau, gomme, remplissage et fondu ne modifient que l'intérieur
  (le calcul est dans `selection/selection.ts`, fonction `restoreOutside`, appelée par chaque outil de dessin).
- **Transformer** (`T`) : soulève la sélection (ou tout le calque s'il n'y a pas de sélection). Glisse à l'intérieur = déplacer,
  un coin = redimensionner, la poignée ronde au-dessus = pivoter ; ou utilise les curseurs Rotation / Échelle, `±15°`, les miroirs.
  `Entrée` ou ✓ valide (une seule étape d'annulation), `Échap` ou ✕ annule.
- **Fondu** (`U`) : glisse d'une couleur vers l'autre. Taille = diamètre, Opacité = force du mélange.
- **Modes de fusion** : panneau Calques > « Mode de fusion ». Ils sont appliqués aussi dans le PNG exporté (ce que tu vois = ce que le jeu affiche).

**Exemple : pivoter par pas de 5° au lieu de 15°** → `CONFIG.transform.stepDeg: 5`.
**Exemple : poignées plus faciles à toucher** → `CONFIG.transform.handlePx: 22` → `30`.
**Exemple : le fondu étale la couleur plus loin** → `CONFIG.blend.carry` plus haut (0,9) ; plus court → plus bas (0,6).
**Exemple : fondu plus doux sur les bords** → `CONFIG.blend.hardness` plus bas (0,1).
**Exemple : ajouter le mode « Soustraire »** → aucun : seuls les modes listés dans `CONFIG.blendModes` (valeurs canvas) sont proposés ;
ajoute `{ id: 'plus-lighter', label: 'Ajouter' }` à la liste.
**Exemple : ajouter une forme de sélection (triangle)** → dans `select.ts`, ajoute `'triangle'` au type `SelectShape`,
un cas dans `shapePath()` et une `<option>` dans `options()`.
**Raccourcis** : chaque outil déclare le sien (`shortcut: 'U'` dans son fichier) ; Ctrl+A / Ctrl+D / Ctrl+I et Entrée/Échap sont dans `CONFIG.shortcuts`.

## 5. Ajouter un importer (nouveau format de fichier)

Les importers sont dans `src/modules/sprite-editor/import/importers.ts` (PNG, ZIP, pack.json).

**Exemple : accepter aussi les fichiers `.webp`.**
1. Crée `src/modules/sprite-editor/import/webp.ts` :
   ```ts
   import { registerImporter } from './importers';
   registerImporter({
     id: 'webp', label: 'Image WebP',
     accepts: (name) => /\.webp$/i.test(name),
     async read(name, bytes, ctx) {
       // Convertit en PNG puis donne le résultat au système (comme si l'utilisateur avait déposé un PNG).
       const bmp = await createImageBitmap(new Blob([bytes as BlobPart]));
       const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
       c.getContext('2d')!.drawImage(bmp, 0, 0);
       const png = new Uint8Array(await (await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'))).arrayBuffer());
       await ctx.expand(name.replace(/\.webp$/i, '.png'), png);
     },
   });
   ```
2. Ajoute `import './webp';` en haut de `import/ui.ts`, et `.webp` dans l'attribut `accept` de `pickFiles()`.

**Changer l'association automatique fichier → clé** : `import/matcher.ts` (`SUFFIXES`, `PREFIXES` = suffixes/préfixes ignorés,
ex. ajoute `|_fix` à `SUFFIXES` pour que `hero_fix.png` → `hero`). Les tests : `tests/import.test.ts`.

## 6. Ajouter un skin (ennemi, PNJ…) au jeu

**Dans l'éditeur** (sans code) : onglet « Skins » → « ＋ Nouveau skin » → clé, taille de frame, ancre. À l'export, `PATCH_NOTES.txt`
donne la ligne à coller dans `SHEETDIM` du jeu.

**Dans l'adaptateur** (pour qu'il existe en permanence) : `src/games/black-boy-go/adapter.ts`, tableau `skins` :
```ts
{ key: 'ninja', label: 'Ninja', fw: 200, fh: 180, ax: 100, ay: 170 },
```
Ajoute la **même** entrée dans `SHEETDIM` du `index.html` du jeu. C'est tout : clé, export, validation, pack.json suivent.

## 7. Ajouter un item (arme, chapeau…)

1. Ajoute l'item dans l'objet `ITEMS` du **jeu** (`index.html`).
2. Copie le jeu à jour dans `public/game/index.html`, puis `npm run extract:items` : il régénère
   `src/games/black-boy-go/items.generated.json`. L'éditeur propose alors `item_<id>` et `icon_<id>`.
3. Rien d'autre à modifier : les items ne sont jamais écrits à la main dans l'éditeur.

## 8. Ajouter un layer / un slot d'équipement

1. Dans le jeu : ajoute le nom dans `SLOTS` et `LAYER` (voir l'en-tête du `index.html`).
2. Dans `src/games/black-boy-go/adapter.ts` : ajoute-le dans `slots` et `layerOrder` (même ordre que `LAYER`).
3. L'aperçu affiche automatiquement un nouveau sélecteur pour ce slot ; l'ordre de superposition suit `layerOrder`.

## 9. Changer un chemin ou un nom d'export

- Dossier (`sprites/` → `assets/sprites/`) : `exportDir` dans l'adaptateur. `pack.json` et le README_UPLOAD suivent.
- Nom du fichier pack : `packFile`. Nom de chaque PNG : `fileName` dans `src/engine/adapter.ts` (fonction `createAdapter`).
- Nom du ZIP : `CONFIG.export.baseName`.
- Contenu de `PATCH_NOTES.txt` / `README_UPLOAD.txt` : `export/docs.ts`.
- Règles de validation (taille max, noms valides) : `validation` dans l'adaptateur + `export/validate.ts`.
  Exemple : limite 1 Mo par PNG → `maxFileBytes: 1_000_000`.

## 10. Ajouter une destination d'export (ex. GitHub direct)

L'export passe par l'interface `ExportTarget` (`src/shared/types.ts`).
1. Crée `src/modules/sprite-editor/export/github.ts` :
   ```ts
   import { registerTarget } from './targets';
   registerTarget({ id: 'github', label: 'Commit GitHub',
     async deliver(files, meta) { /* pour chaque fichier : PUT /repos/{o}/{r}/contents/{path} */ } });
   ```
2. Importe-le dans `export/ui.ts` et remplace `getTarget('zip')` par `getTarget('github')` (ou ajoute un choix dans la fenêtre d'export).
Le plan d'export (`planExport`) et la validation ne changent pas.

## 11. Ajouter un jeu

1. Copie `src/games/black-boy-go/` vers `src/games/mon-jeu/` et édite `adapter.ts` : skins, animations (`anims`), `layerOrder`,
   `slots`, `fixedSprites`, `exportDir`, et les deux fonctions `selectAnimation` / `frameFor` (copie de la logique du jeu).
2. Dans `src/games/index.ts`, ajoute `registerAdapter(monJeu);` (+ l'import).
3. L'écran de démarrage propose le nouveau jeu. **Le noyau et les outils ne sont pas modifiés.**
Si les items viennent d'un fichier du jeu, duplique `scripts/extract-items.mjs`.

## 12. Brancher un nouvel outil (Level Editor, HUD, sons)

Les trois stubs existent déjà (`src/modules/level-editor`, `ui-editor`, `sound-manager`).
1. Ouvre le stub, remplis `mount(host, adapter)` (l'interface de l'outil) et `supports(adapter)`
   (ex. `adapter.future?.levels !== undefined`), passe `status` à `'ready'`.
2. Déclare les données du jeu nécessaires dans `AdapterData.future` (`src/shared/types.ts`) puis dans l'adaptateur.
3. Importe le module dans `src/main.ts` (déjà fait pour les 3 stubs). Le noyau n'est pas touché.

## 13. Changer l'apparence

`src/ui/style.css` : variables en haut (`--acc` couleur d'accent, `--panel` fond des panneaux, `--touch` taille minimale des boutons).
Raccourcis clavier : `CONFIG.shortcuts` + `ui/shortcuts.ts`. Modes de l'éditeur (onglets) : `CONFIG.modes`.

## 14. Ajouter un test

- Logique pure (adaptateur, import, validation, export) : `tests/*.test.ts` (`node:test`, lancés par `npm test`).
- Scénario complet (traits, import de PNG, export, chargement dans le jeu) : `tests/bot/e2e.py` (Playwright), via `npm run build:local && npm run bot`.
  Ajoute un `check('nom', condition)` à l'endroit voulu du scénario.

## 15. Fichiers projet et sélecteurs de fichiers (iPad)

- Le fichier projet est un ZIP nommé `<nom>.genesis.zip` (génération : `export/ui.ts`, `openProjectDialog`). Il est reconnu à son CONTENU
  (signature ZIP + `project.json`), jamais à son extension : les anciens `.genesis` s'ouvrent toujours.
- **Ne mets pas d'extension inconnue dans un attribut `accept`** : l'iPad grise alors les fichiers. Tous les sélecteurs passent par
  `pickFiles()` (`ui/dom.ts`), qui attache l'input à la page (nécessaire sur Safari) ; ajoute `accept` seulement pour des types standard (`.png`, `.zip`).
- Enregistrement d'un fichier (ZIP d'export, projet) : `saveFile()` dans `export/targets.ts` (feuille de partage sur iPad, téléchargement ailleurs).

## 16. Calques : insertion, sélection multiple, copier/coller

Fichiers : logique d'ordre pure `layers/order.ts` (testée), actions annulables `layers/actions.ts`, interface `layers/panel.ts`.
- **Nouveau calque** : inséré JUSTE AU-DESSUS du calque actif (`insertIndexAbove`). Pour l'insérer plutôt en haut de la pile, remplace l'appel dans `addLayer()` par `f.layers.length`.
- **En-tête collant** : le bloc `.layers-head` (boutons, opacité, mode de fusion) est en `position: sticky` dans `src/ui/style.css`. Retire cette règle pour qu'il défile avec la liste.
- **Sélection multiple** : bouton ☑ (tactile), Ctrl/Cmd + clic (ajouter/retirer), Maj + clic (plage). Le groupe = `session.selectedLayers`. Agissent sur tout le groupe : visibilité, verrou, opacité, mode de fusion, monter/descendre, fusionner, supprimer, copier, dupliquer et l'outil Déplacer.
  Transformer et Déformer travaillent sur le calque actif seulement.
  *Exemple : faire agir un nouvel outil sur le groupe* → utilise `session.selectedLayers` à la place de `session.layer`.
- **Coller** n'efface jamais rien : les calques copiés sont AJOUTÉS au-dessus du calque actif (`pasteLayers`). Pour vider la frame, utilise « ∅ Vider ».
  Entre sprites de tailles différentes, le contenu est aligné sur l'ancre (pieds) si les deux en ont une, sinon centré.
  *Exemple : coller sans alignement* → mets `dx = 0, dy = 0` dans `pasteLayers`.

## 17. Outil Déformer (`D`)

Fichiers : `tools/deform.ts` (interface, 4 modes), `tools/deformMath.ts` (maillage, perspective, warp ; pur et testé), `tools/lift.ts` (soulève le contenu, partagé avec Transformer).
Réglages `CONFIG.deform` : `perspectiveSub` (finesse du maillage de perspective), `warpGrid` (points de contrôle par côté, 4 = grille 4×4), `warpSub` (finesse de la courbe du warp), `minSizePx`.
- **Libre** : chaque bord/coin se déplace séparément. **Ratio** : garde le rapport largeur/hauteur, le côté opposé reste fixe. **Perspective** : 4 coins indépendants (le quadrilatère doit rester convexe). **Warp** : grille de points de contrôle lissée (Catmull-Rom).
- Changer de mode « cuit » la déformation en cours dans l'image : on peut enchaîner libre → perspective → warp. Tout s'annule en UNE étape. Entrée = appliquer, Échap = annuler.
- *Exemple : warp plus souple* → `warpGrid: 5` (25 points). *Perspective plus précise* → `perspectiveSub: 20`.
- *Exemple : ajouter un mode « Cisaillement »* : ajoute `'shear'` à `Mode` et `GROUP` dans `deform.ts`, un cas dans `nodes()` qui renvoie les 4 nœuds d'un parallélogramme, et la poignée correspondante.
- Le rendu (`renderMesh`) est logiciel et suréchantillonné ×2 à la validation pour des bords lisses.

## 18. Rotation de la vue

Fichiers : `canvas/viewMath.ts` (maths pures et testées), `canvas/view.ts` (rendu), `canvas/input.ts` (gestes).
- **Deux doigts** : pincer = zoom, glisser = déplacer, tourner = pivoter. La rotation ne démarre qu'après `CONFIG.view.rotateStartDeg` (8°) pour éviter de tourner par accident en zoomant ; en fin de geste, un angle résiduel inférieur à `rotateSnapDeg` (5°) est redressé.
- **Ordinateur** : Alt + molette. Bouton 🧭 = remettre la vue droite. ⛶ = ajuster zoom + rotation.
- La vue reste ajustée à la zone de dessin tant que tu n'as pas zoomé/déplacé/pivoté toi-même (`autoFit` dans `view.ts`).
  *Exemple : désactiver la rotation par geste* → supprime le bloc `rotating` dans `input.ts` (zoom et déplacement continuent de marcher).

## 19. Règles à respecter quand tu ajoutes de l'interface

- **Nettoyage** : l'interface est reconstruite à l'ouverture d'un projet. Tout écouteur global doit passer par `listen(window, …)` ; tout abonnement par `bus.on(...)` ; toute boucle d'animation doit s'arrêter avec `registerDisposer(() => { alive = false; })` (`core/events.ts`). Sinon les raccourcis se déclenchent en double (un Ctrl+Z annulerait plusieurs actions).
- **Barre de réglages à hauteur fixe** (`.settings` dans `style.css`) : changer d'outil ne doit jamais redimensionner la zone de dessin. Un outil avec beaucoup d'options met `hideBrushSettings: true` pour masquer taille/couleur/pinceau.
- **PNG** : `canvasToPng` utilise l'encodeur maison `core/png.ts` (et un cache par contenu), pas `canvas.toBlob`, qui devient très lent (~1 s par image) quand la page anime en continu. Ne remets pas `toBlob`.
