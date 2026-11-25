import { builtinPeople } from '../create/profiles.mjs';
import { bodyTemplates } from '../avatar/body-templates.mjs';

export const modules = {
  library: '人物库', beauty: '美颜', makeup: '试妆', cartoon: '照片转卡通', body: '体型调整',
};
const builtinIds = new Set(builtinPeople.map(person => person.id));
let connection;

function database() {
  if (connection) return connection;
  connection = new Promise((resolve, reject) => {
    const request = indexedDB.open('wearmate.2d.people', 2);
    request.onupgradeneeded = event => {
      const db = request.result;
      db.createObjectStore('analyses', { keyPath: 'personId' });
      if (event.oldVersion >= 1) return;
      db.createObjectStore('people', { keyPath: 'id' });
      db.createObjectStore('images');
      db.createObjectStore('targets');
      db.createObjectStore('results', { keyPath: ['personId', 'module'] });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); connection = null; };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  }).catch(error => { connection = null; throw error; });
  return connection;
}

function validatedModule(module) {
  if (!Object.hasOwn(modules, module)) throw new Error('未知的人物模块。');
  return module;
}

async function read(store, key) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const objectStore = db.transaction(store).objectStore(store);
    const request = key === undefined ? objectStore.getAll() : objectStore.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function write(stores, operation) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('人物记录未能保存。'));
    try { operation(tx); } catch (error) { tx.abort(); reject(error); }
  });
}

export async function listPeople() {
  const photos = await read('people');
  return [...builtinPeople, ...photos.sort((a,b) => a.createdAt - b.createdAt)];
}

export function getImage(personId) { return read('images', personId); }
export function getPhotoPerson(personId) { return read('people',personId); }
export function getFitting(personId) { return read('results',[personId,'fitting']); }
export function getAnalysis(personId) { return read('analyses', personId); }

export async function sourceHash(source) {
  const bytes = await crypto.subtle.digest('SHA-256', await source.original.arrayBuffer());
  return Array.from(new Uint8Array(bytes),byte => byte.toString(16).padStart(2,'0')).join('');
}

export async function getCartoon(personId) {
  const result = await getResult(personId,'cartoon');
  const head=result?.parameters?.cartoon;
  return head ? {...head,revision:head.revision ?? 'legacy-'+result.updatedAt} : null;
}

export async function confirmFitting(personId, body) {
  if (body?.version!==2 || !Object.hasOwn(bodyTemplates,body.templateId) || !body.headRevision
      || body.geometry?.landmarks?.length!==478
      || !['head','arms','ankles'].every(key=>body.layers?.[key] instanceof Blob)) throw new Error('个人角色图层不完整。');
  let mismatch=false;
  await write(['people','results'],tx=>{
    const people=tx.objectStore('people'), results=tx.objectStore('results');
    const current=results.get([personId,'cartoon']);
    current.onsuccess=()=>{
      const record=current.result, head=record?.parameters?.cartoon;
      if (!head || (head.revision ?? 'legacy-'+record.updatedAt)!==body.headRevision) {
        mismatch=true; return;
      }
      const find=people.get(personId);
      find.onsuccess=()=>{
        if (!find.result) { mismatch=true; return; }
        people.put({...find.result,templateId:body.templateId});
        results.put({personId,module:'fitting',body});
      };
    };
  });
  if (mismatch) throw new Error('人物头层已更新，请重新打开人物并确认模板。');
}

export async function confirmAnalysis({name, primary, supplement, module, personId, measurements, cartoon}) {
  validatedModule(module);
  if (primary?.sourceId !== 'primary' || !(primary.assets?.foreground instanceof Blob)
      || supplement && (supplement.sourceId !== 'supplement' || supplement.needsSupplement || !supplement.landmarks?.length)) {
    throw new Error('请先完成照片分析。');
  }
  const previous = personId ? await read('people',personId) : null;
  if (personId && !previous) throw new Error('找不到要更新的照片人物。');
  const id = previous?.id ?? 'photo-' + crypto.randomUUID();
  const [width,height] = primary.geometry.orientedSize;
  const person = {...previous,id,kind:'photo',name:name.trim().slice(0,64) || '照片人物',
    width,height,createdAt:previous?.createdAt ?? Date.now(),analysisVersion:1};
  if (measurements) person.measurements = measurements;
  const record = {schemaVersion:1,personId:id,primary,supplement:supplement ?? null,
    faceSourceId:supplement ? 'supplement' : primary.needsSupplement ? null : 'primary',updatedAt:Date.now()};
  const face = record.faceSourceId && record[record.faceSourceId];
  const hash = face ? await sourceHash(face) : null;
  if (cartoon && (!face || cartoon.sourceHash !== hash || cartoon.sourceId !== record.faceSourceId
      || !(cartoon.assets?.head instanceof Blob) || cartoon.landmarks?.length !== 478)) {
    throw new Error('卡通头层与当前照片不匹配，请重新生成。');
  }
  await write(['people','images','targets','analyses','results'],tx => {
    tx.objectStore('images').put(primary.original,id);
    tx.objectStore('targets').put(id,module);
    tx.objectStore('analyses').put(record);
    const results = tx.objectStore('results');
    const old=results.get([id,'cartoon']), fit=results.get([id,'fitting']);
    fit.onsuccess=()=>{
      const prior=old.result?.parameters?.cartoon;
      let revision;
      if (cartoon) {
        revision=cartoon.revision ?? crypto.randomUUID();
        results.put({personId:id,module:'cartoon',parameters:{cartoon:{...cartoon,revision}},image:cartoon.assets.head,updatedAt:Date.now()});
      } else if (prior && prior.sourceHash===hash && prior.sourceId===record.faceSourceId) {
        revision=prior.revision ?? 'legacy-'+old.result.updatedAt;
      } else results.delete([id,'cartoon']);
      if (fit.result && revision===fit.result.body.headRevision) person.templateId=fit.result.body.templateId;
      else {
        delete person.templateId;
        if (fit.result) results.delete([id,'fitting']);
      }
      tx.objectStore('people').put(person);
    };
  });
  return person;
}
export function getTarget(module) { return read('targets', validatedModule(module)); }

export async function createPhoto(name, photo, module = 'library', measurements) {
  validatedModule(module);
  const person = {
    id: 'photo-' + crypto.randomUUID(), kind: 'photo', name: name.trim().slice(0, 64) || '照片人物',
    width: photo.width, height: photo.height, createdAt: Date.now(),
  };
  const blob = new Blob([photo.buffer], { type: photo.type });
  if (measurements) person.measurements = measurements;
  await write(['people','images','targets'], tx => {
    tx.objectStore('people').add(person);
    tx.objectStore('images').add(blob, person.id);
    tx.objectStore('targets').put(person.id, module);
  });
  return person;
}

async function requirePerson(id) {
  if (!builtinIds.has(id) && !await read('people', id)) throw new Error('找不到这个二维人物。');
}

export async function selectTarget(module, id) {
  validatedModule(module);
  await requirePerson(id);
  return write(['targets'], tx => tx.objectStore('targets').put(id, module));
}

// An effect implementation supplies its own parameters and optional rendered image.
// Always name the person explicitly, even when a different module is on screen.
export async function saveResult(personId, module, parameters, image = null) {
  validatedModule(module);
  if (module === 'library') throw new Error('人物库不保存编辑效果。');
  if (image !== null && (!(image instanceof Blob) || !image.type.startsWith('image/'))) {
    throw new Error('编辑结果需要可显示的图像文件。');
  }
  await requirePerson(personId);
  const replaceHead=module==='cartoon' && !builtinIds.has(personId);
  return write(replaceHead?['results','people']:['results'],tx=>{
    const results=tx.objectStore('results');
    if (replaceHead) {
      results.delete([personId,'fitting']);
      const people=tx.objectStore('people'), find=people.get(personId);
      find.onsuccess=()=>{
        if (find.result?.templateId) {
          const person={...find.result};
          delete person.templateId;
          people.put(person);
        }
      };
    }
    results.put({personId,module,parameters,image,updatedAt:Date.now()});
  });
}

export function getResult(personId, module) {
  return read('results', [personId, validatedModule(module)]);
}
