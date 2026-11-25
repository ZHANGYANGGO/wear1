import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { bodyTemplates, placeHead, project } from '../src/avatar/body-templates.mjs';
import { mila } from '../src/avatar/config.mjs';
import { personalSlots, layerFitsSlot } from '../src/stage1a/alpha.mjs';
import { adaptGeneratedProfile } from '../src/stage1a/protocol.mjs';
import { garments } from '../src/wardrobe/catalog.mjs';
import { getFitInfo, wardrobeSprites } from '../src/wardrobe/tryon-assets.mjs';

const head=JSON.parse(await readFile(new URL('../reports/cartoon/example/head.json',import.meta.url),'utf8'));

test('both templates preserve the whole observed crop and all calibrated features on the same canvas',()=>{
  for (const template of Object.values(bodyTemplates)) {
    const g=placeHead(head,template);
    const [left,top]=project(g.layerToCanvas,[0,0]);
    const [right,bottom]=project(g.layerToCanvas,head.size);
    assert.ok(left>=0 && top>=0 && right<=560 && bottom<=template.anchors.waist[1]);
    assert.equal(g.landmarks.length,478);
    assert.ok(Math.abs(g.neck[0]-template.anchors.neck[0])<1e-6);
    assert.ok(Math.abs(g.landmarks[152][1]-template.chinY)<1e-6);
    for (const indices of Object.values(head.features)) {
      for (const i of indices) assert.deepEqual(g.landmarks[i],project(g.layerToCanvas,head.landmarks[i]));
    }
  }
});

test('version two binds anchors and z-order to the selected template, including asymmetric or absent hair',()=>{
  const template=bodyTemplates.straight;
  const photo={...mila,id:'photo-test',anchors:template.anchors,version:2,template:'straight'};
  assert.equal(adaptGeneratedProfile(photo,garments).ok,true);
  assert.equal(adaptGeneratedProfile({...photo,anchors:mila.anchors},garments).ok,false);
  const hair={id:'frontHair',layer:45,image:'blob:https://example.test/front'};
  assert.equal(adaptGeneratedProfile({...photo,baseLayers:[...photo.baseLayers,hair]},garments).ok,true);
  assert.equal(adaptGeneratedProfile({...photo,baseLayers:[...photo.baseLayers,{...hair,layer:5}]},garments).ok,false);
  const slots=personalSlots(template,[150,5,450,550]);
  const pixels=new Uint8ClampedArray(560*1536*4);
  pixels[(320*560+355)*4+3]=255;
  assert.equal(layerFitsSlot('frontHair',pixels,560,1536,slots),true);
  pixels[(321*560+450+5)*4+3]=255;
  assert.equal(layerFitsSlot('frontHair',pixels,560,1536,slots),false);
});

test('photo roles share only their template wardrobe and use their own instep behind the strap',()=>{
  for (const templateId of Object.keys(bodyTemplates)) {
    const role='photo-example', inset={id:'personal-insteps',layer:11,image:'blob:https://example.test/foot'};
    const choices=wardrobeSprites(role,templateId,{'ivory-mary-janes':inset});
    assert.equal(choices.length,11);
    assert.equal(choices.find(item=>item.id==='ivory-mary-janes').parts.at(-1),inset);
    assert.equal(getFitInfo('navy-shirt',role,templateId).template,templateId);
    assert.equal(getFitInfo('nude-pumps',role,templateId).status,'pending');
  }
  assert.equal(wardrobeSprites('photo-example','woman-bob').length,0);
  assert.equal(wardrobeSprites('woman-bob','straight').length,9);
});
