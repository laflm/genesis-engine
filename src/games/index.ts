import { registerAdapter } from '../engine/registry';
import { blackBoyGo } from './black-boy-go/adapter';

// Pour ajouter un jeu : créer src/games/<jeu>/adapter.ts puis ajouter UNE ligne ici.
export function registerAllGames(): void {
  registerAdapter(blackBoyGo);
}
