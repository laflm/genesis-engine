# GENESIS Engine — v1 (Sprite Editor pour *Black Boy Go!*)

Suite d'outils web pour **modifier** des jeux existants. Au démarrage on choisit un jeu ; l'outil se configure
grâce à l'**adaptateur** de ce jeu (`src/games/<jeu>/adapter.ts`). La v1 contient le **Sprite Editor** ;
Level Editor, UI/HUD Editor et Sound Manager sont des stubs prêts à brancher.

## Installation et lancement
```bash
npm install
npm run dev          # http://localhost:5173 (iPad : ouvre l'adresse « Network » dans Safari)
npm test             # tests unitaires
npm run typecheck    # TypeScript strict
npm run build        # production -> dist/
npm run preview      # teste le build
```
Sans Vite (secours) : `npm run build:local` (esbuild), puis servir `dist/` avec n'importe quel serveur statique.
Bots de test de bout en bout : `npm run build:local && pip install playwright pillow numpy && playwright install chromium && npm run bot`.

## Déploiement sur GitHub Pages
1. Crée un repo, uploade tout le contenu de ce dossier (sauf `node_modules`, `dist`).
2. Settings > Pages > Source : **GitHub Actions**. Le workflow `.github/workflows/pages.yml` teste, construit et publie à chaque push sur `main`.
3. L'app est servie en chemin relatif (`base: './'` dans `vite.config.ts`) : elle marche dans `https://<compte>.github.io/<repo>/`.
4. Sur iPad : Safari > Partager > « Sur l'écran d'accueil » pour l'installer (PWA, utilisable hors ligne après la 1re visite).

## Utilisation rapide
1. **⬆ Importer** : choisis ou glisse plusieurs PNG, un ZIP, ou un pack (`pack.json` + PNG). Corrige les associations, valide, lis le rapport.
2. Onglet **Retouche** : ouvre un sprite importé ; `⇄ Original` superpose l'original, `🧅` l'onion skin, `↺ Original` restaure la frame.
3. **Aperçu** (panneau de droite) : animation en direct avec les équipements, mêmes règles que le jeu.
4. **▶ Tester** : lance le jeu dans une fenêtre avec ton pack (le code du jeu n'est pas modifié).
5. **⬇ Exporter** : ZIP à extraire à la racine du repo du jeu ; `README_UPLOAD.txt` explique l'upload, `PATCH_NOTES.txt` liste les modifications manuelles éventuelles.

Gestes : Pencil/souris dessine ; deux doigts = déplacer/zoomer ; tap 2 doigts = annuler ; tap 3 doigts = rétablir ; appui long = pipette.
Outils : `S` sélection (rectangle/ellipse/lasso, tap = désélectionner), `T` transformer (déplacer/pivoter/échelle/miroir), `U` fondu de couleurs, modes de fusion par calque.
Clavier : Ctrl+Z / Ctrl+Maj+Z, B pinceau, E gomme, G remplir, I pipette, V déplacer, `[` `]` taille, `,` `.` frames, Espace + glisser = déplacer la vue.

## Documentation
- `docs/GUIDE_MODIFICATIONS.md` : où et comment modifier chaque fonctionnalité (avec exemples).
- `PATCH_NOTES.txt` / `README_UPLOAD.txt` : générés dans chaque export.
