import { defineConfig } from 'vite';

// BASE RELATIVE : le site fonctionne dans n'importe quel sous-dossier GitHub Pages.
// Pour fixer un chemin absolu (ex. '/mon-repo/'), changer la valeur ci-dessous.
export default defineConfig({
  base: './',
  build: { target: 'es2022', outDir: 'dist', sourcemap: false },
});
