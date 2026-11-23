import { editableFields } from './model.mjs';

export const storageKey = 'wearmate.personal-wardrobe.v1';

function storageError() {
  return new Error('衣橱本地记录暂不可用。请检查浏览器的站点存储设置后重试。');
}

export class WardrobeStore {
  #storage;
  #source;

  #key;
  #initialCatalog;

  constructor(storage, source, key = storageKey, initialCatalog = false) {
    this.#key = key;
    this.#initialCatalog = initialCatalog;
    this.#storage = storage;
    this.#source = source;
  }

  #read() {
    try {
      const raw = this.#storage?.getItem(this.#key);
      if (!this.#storage) throw storageError();
      if (raw === null) {
        return new Map(this.#initialCatalog
          ? this.#source.list().map(item => [item.id, editableFields(item)]) : []);
      }
      const data = JSON.parse(raw);
      if (data?.version !== 1 || !Array.isArray(data.entries)) throw storageError();
      const entries = new Map();
      for (const { id, ...info } of data.entries) {
        if (typeof id !== 'string' || entries.has(id)) throw storageError();
        entries.set(id, editableFields(info));
      }
      return entries;
    } catch {
      throw storageError();
    }
  }

  #write(entries) {
    try {
      const records = [...entries].map(([id, info]) => ({ id, ...info }));
      this.#storage.setItem(this.#key, JSON.stringify({ version: 1, entries: records }));
    } catch {
      throw new Error('衣橱修改未保存。请检查浏览器的存储权限或剩余空间后重试。');
    }
  }

  list() {
    return [...this.#read()].flatMap(([id, info]) => {
      const item = this.#source.get(id);
      return item ? [{ ...item, ...info }] : [];
    });
  }

  add(id, fields) {
    const entries = this.#read();
    const item = this.#source.get(id);
    if (!item) throw new Error('找不到这件预制衣物。');
    if (entries.has(id)) return false;
    entries.set(id, editableFields(fields ?? item));
    this.#write(entries);
    return true;
  }

  importSamples() {
    const entries = this.#read();
    let count = 0;
    for (const item of this.#source.list()) {
      if (entries.has(item.id)) continue;
      entries.set(item.id, editableFields(item));
      count++;
    }
    if (count) this.#write(entries);
    return count;
  }

  edit(id, fields) {
    const entries = this.#read();
    if (!entries.has(id) || !this.#source.get(id)) throw new Error('这件衣物已不在个人衣橱中。');
    entries.set(id, editableFields(fields));
    this.#write(entries);
  }

  remove(id) {
    const entries = this.#read();
    if (!entries.delete(id)) return false;
    this.#write(entries);
    return true;
  }
}
