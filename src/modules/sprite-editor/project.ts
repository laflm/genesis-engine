import type { AssetSpec, GameAdapter, PackJson, SkinDef } from '../../shared/types';
import { createAsset, type Asset } from './model';
import { customSkinSpec, specOf } from './specs';

/** Le projet ouvert : les assets importés/créés + skins perso + ancien pack.json. */
export class Project {
  assets = new Map<string, Asset>();
  customSkins: SkinDef[] = [];
  basePack: PackJson | undefined;
  name = 'projet';
  constructor(public adapter: GameAdapter) {}

  spec(key: string): AssetSpec | undefined { return specOf(this.adapter, this.customSkins, key); }

  /** Renvoie l'asset, en le créant vide (statut « created ») s'il n'existe pas encore. */
  ensure(key: string): Asset | undefined {
    const ex = this.assets.get(key);
    if (ex) return ex;
    const spec = this.spec(key);
    if (!spec) return undefined;
    const a = createAsset(spec, this.adapter, 'created');
    this.assets.set(key, a);
    return a;
  }

  addCustomSkin(def: SkinDef): AssetSpec {
    if (this.adapter.spec(def.key) || this.customSkins.some((s) => s.key === def.key)) throw new Error(`La clé « ${def.key} » existe déjà.`);
    this.customSkins.push(def);
    return customSkinSpec(def);
  }
}
