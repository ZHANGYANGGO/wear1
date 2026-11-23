import { mila } from '../avatar/config.mjs';
import { mountAvatar } from '../avatar/renderer.mjs';
import { categories, garments, outfits } from '../wardrobe/catalog.mjs';
import { matchOutfit, selectGarment, selectOutfit } from '../wardrobe/selection.mjs';
import { inspectGeneratedLayers } from './alpha.mjs';
import { cases } from './cases.mjs';
import { adaptGeneratedProfile } from './protocol.mjs';

const roleSelect = document.querySelector('#role-select');
const stage = document.querySelector('#lab-stage');
const status = document.querySelector('#lab-status');
const reference = document.querySelector('#lab-reference');
const outfitControls = new Map();
const garmentControls = new Map();
let active;
let busy = false;
let selection = selectOutfit('casual');

function canWear(id) {
  return active?.mounted.garmentLoads.get(id)?.status === 'ready';
}

function refresh() {
  const matched = matchOutfit(selection);
  roleSelect.disabled = busy;
  for (const outfit of outfits) {
    const button = outfitControls.get(outfit.id);
    button.disabled = busy || !Object.values(outfit.items).every(canWear);
    button.setAttribute('aria-pressed', String(matched?.id === outfit.id));
  }
  for (const [id, select] of garmentControls) {
    select.disabled = busy || !active;
    for (const option of select.options) option.disabled = !canWear(option.value);
    select.value = selection[id];
  }
  active?.mounted.show(selection);
  document.querySelector('#current-outfit').textContent = matched?.name ?? '自定义搭配';
}

async function activate(id) {
  if (busy) return;
  const sample = cases.find(entry => entry.id === id);
  const converted = id === mila.id ? { ok: true, avatar: mila }
    : adaptGeneratedProfile(sample?.profile, garments);
  if (!converted.ok) {
    status.textContent = converted.message;
    roleSelect.value = active?.id ?? mila.id;
    return;
  }

  busy = true;
  status.textContent = '正在检查角色图层…';
  refresh();
  try {
    const currentNode = stage.querySelector('#lab-avatar');
    const nextNode = currentNode.cloneNode(false);
    const mounted = mountAvatar(nextNode, converted.avatar, garments);
    const result = await mounted.ready;
    if (!result.ok) {
      status.textContent = result.message;
      return;
    }
    if (sample) {
      const issue = inspectGeneratedLayers(nextNode, converted.avatar);
      if (issue) {
        status.textContent = issue;
        return;
      }
    }
    await Promise.all([...mounted.garmentLoads.values()].map(load => load.settled));
    if (!Object.values(selection).every(garment => mounted.garmentLoads.get(garment)?.status === 'ready')) {
      status.textContent = '候选角色的当前搭配缺少可用素材。';
      return;
    }
    mounted.show(selection);
    currentNode.replaceWith(nextNode);
    active = { id, mounted };
    document.querySelector('#avatar-name').textContent = converted.avatar.label;
    reference.hidden = !sample;
    if (sample) {
      const image = document.querySelector('#reference-image');
      image.src = sample.reference;
      image.alt = `${sample.label} 的合成参考照片`;
      document.querySelector('#reference-traits').textContent = sample.features;
    }
    status.textContent = '';
  } catch {
    status.textContent = '候选角色处理失败。';
  } finally {
    roleSelect.value = active?.id ?? mila.id;
    busy = false;
    refresh();
  }
}

for (const sample of cases) roleSelect.add(new Option(`${sample.label}（合成照片样本）`, sample.id));
roleSelect.addEventListener('change', () => activate(roleSelect.value));
for (const outfit of outfits) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.outfit = outfit.id;
  button.textContent = `${outfit.letter} · ${outfit.name}`;
  button.addEventListener('click', () => {
    selection = selectOutfit(outfit.id);
    refresh();
  });
  document.querySelector('#lab-presets').append(button);
  outfitControls.set(outfit.id, button);
}
for (const category of categories) {
  const label = document.createElement('label');
  const select = document.createElement('select');
  label.className = 'lab-field';
  label.textContent = category.name;
  select.id = `lab-${category.id}`;
  for (const garment of garments.filter(item => item.category === category.id)) {
    select.add(new Option(garment.name, garment.id));
  }
  select.addEventListener('change', () => {
    selection = selectGarment(selection, select.value);
    refresh();
  });
  label.append(select);
  document.querySelector('#lab-garments').append(label);
  garmentControls.set(category.id, select);
}
await activate('mila');
await activate(cases[0].id);
