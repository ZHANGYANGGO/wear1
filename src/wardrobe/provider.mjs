import { fingerprint } from '../create/photo.mjs';
import { garmentCatalog } from './garments.mjs';

/** A wardrobe source supplies an item with separate original, display and try-on references. */
export class LocalGarmentProvider {
  #byHash;
  #byId;

  constructor(catalog = garmentCatalog) {
    this.#byHash = new Map(catalog.map(item => [item.sha256, item]));
    this.#byId = new Map(catalog.map(item => [item.id, item]));
    if (this.#byHash.size !== catalog.length || this.#byId.size !== catalog.length) {
      throw new Error('预制衣物注册表有重复条目。');
    }
  }

  async match(buffer) {
    const item = this.#byHash.get(await fingerprint(buffer, '请通过本机预览地址或 HTTPS 打开衣橱。'));
    return item ? structuredClone(item) : null;
  }

  get(id) {
    const item = this.#byId.get(id);
    return item ? structuredClone(item) : null;
  }

  list() {
    return [...this.#byId.values()].map(item => structuredClone(item));
  }
}
