export type AssetStatus = 'imported' | 'edited' | 'created';

/** Description d'un fichier prêt à exporter (indépendante du canvas : testable en Node). */
export interface ExportItem {
  key: string;
  width: number; height: number;
  /** Animations dont toutes les frames sont totalement transparentes. */
  emptyAnims: string[];
  allEmpty: boolean;
  bytes: number;
  status: AssetStatus;
  png: Uint8Array;
}
export interface Issue { level: 'error' | 'warning'; key?: string; message: string }
