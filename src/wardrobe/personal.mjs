import { LocalGarmentProvider } from './provider.mjs';
import { WardrobeStore, storageKey } from './store.mjs';
import { bobCatalog, bobId } from './woman-bob-wardrobe.mjs';

export function openPersonalWardrobe(storage, roleId) {
  const dedicated = roleId === bobId;
  const provider = new LocalGarmentProvider(dedicated ? bobCatalog : undefined);
  const key = dedicated ? 'wearmate.wardrobe.woman-bob.v1' : storageKey;
  const store = new WardrobeStore(storage, provider, key, dedicated);
  return { provider, store, key };
}
