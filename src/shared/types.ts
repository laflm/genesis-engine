// ===== Types partagés. Aucun import depuis un module : ce fichier est la base de tout. =====

export type AssetKind = 'sheet' | 'sprite' | 'icon';
export type AssetGroup = 'skin' | 'item' | 'fixed' | 'icon';

/** Une animation d'une sheet : une LIGNE, `frames` images côte à côte. */
export interface AnimDef { row: number; frames: number; fps: number }

/** Un skin = un corps animé (hero, robot…). */
export interface SkinDef { key: string; label: string; fw: number; fh: number; ax: number; ay: number }

export interface ItemDef { id: string; name: string; slot?: string }

export interface FixedSpriteDef {
  key: string; label: string;
  /** Taille recommandée (avertissement si le ratio diffère de plus de 5 %). */
  recommended?: { w: number; h: number };
}

/** Description complète d'un fichier que le jeu sait lire (dérivée de l'adaptateur). */
export interface AssetSpec {
  key: string;
  kind: AssetKind;
  group: AssetGroup;
  label: string;
  /** Dossier + nom de fichier à l'export, ex. "hero.png". */
  fileName: string;
  /** Section de pack.json où la clé est déclarée. */
  packSection: 'sheets' | 'sprites';
  /** Sheets uniquement : dimensions d'une frame et ancre (pieds). */
  fw?: number; fh?: number; ax?: number; ay?: number;
  /** Sheets d'équipement : le skin dont elles suivent la grille. */
  skinRef?: string;
  slot?: string;
  recommended?: { w: number; h: number };
}

/** Ce que l'état du jeu fournit pour choisir l'animation (même logique que le jeu). */
export interface AnimState { swing: number; hit: number; vx: number }

/** Données déclaratives d'un jeu. Un nouveau jeu = un nouvel objet de ce type. */
export interface AdapterData {
  id: string;
  name: string;
  /** Dossier d'export dans le repo du jeu, ex. "sprites". */
  exportDir: string;
  packFile: string;
  /** Animations dans l'ordre d'affichage. */
  anims: Record<string, AnimDef>;
  /** Ordre de superposition des équipements (du dessous vers le dessus). */
  layerOrder: string[];
  slots: string[];
  skins: SkinDef[];
  /** Skin utilisé comme corps de référence pour dessiner les équipements. */
  playerSkin: string;
  items: ItemDef[];
  fixedSprites: FixedSpriteDef[];
  /** Préfixes de clés. */
  itemSheetPrefix: string;
  iconPrefix: string;
  /** Icônes : taille affichée par le jeu et taille de travail conseillée. */
  iconSize: { w: number; h: number };
  /** Choix de l'animation à partir de l'état (copie de la logique du jeu). */
  selectAnimation(s: AnimState): string;
  /** Frame de l'animation d'attaque selon le temps restant (copie de la logique du jeu). */
  frameFor(anim: string, t: number, swing: number): number;
  validation: { keyPattern: RegExp; maxFileBytes: number };
  /** Chemin (relatif à index.html du jeu) du fichier HTML utilisé par « Tester dans le jeu ». */
  testGameUrl?: string;
  /** Réservé aux futurs outils (non utilisé en v1). */
  future?: { levels?: unknown; hud?: unknown; sounds?: unknown };
}

/** Adaptateur prêt à l'emploi (données + index dérivés). */
export interface GameAdapter extends AdapterData {
  specs: AssetSpec[];
  spec(key: string): AssetSpec | undefined;
  skin(key: string): SkinDef | undefined;
  /** Colonnes max d'une sheet (= max des frames par animation). */
  sheetCols: number;
  sheetRows: number;
}

export interface PackJson { sheets?: Record<string, string>; sprites?: Record<string, string> }

export interface ExportFile { path: string; data: Uint8Array }

/** Destination d'un export : aujourd'hui ZIP, demain commit GitHub. */
export interface ExportTarget {
  id: string;
  label: string;
  deliver(files: ExportFile[], meta: { baseName: string }): Promise<void>;
}

/** Outil de GENESIS Engine (Sprite Editor aujourd'hui, Level Editor… demain). */
export interface ToolModule {
  id: string;
  label: string;
  status: 'ready' | 'planned';
  /** Un outil peut refuser un jeu (pas de niveaux dans l'adaptateur, par ex.). */
  supports(adapter: GameAdapter): boolean;
  mount(host: HTMLElement, adapter: GameAdapter): void | Promise<void>;
  unmount(): void;
}

/** Rapport d'import. */
export interface ImportReport {
  accepted: string[]; ignored: string[]; corrected: string[]; warnings: string[];
}
