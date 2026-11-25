import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {PNG} from 'pngjs';
import {bodyFromGLB,prepareTemplate,measureMesh,girthNames} from '../src/3d/mesh-tape.mjs';
import {anchors} from '../src/face/template.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),dir=path.join(root,'.private/module4-review');
const template=prepareTemplate(fs.readFileSync(path.join(root,'assets/3d/fitting-body.glb')));
const meshes={},maps={},cm={};
for(const name of ['body','original','styled']){
  const bytes=fs.readFileSync(path.join(dir,name+'.glb'));
  meshes[name]=bodyFromGLB(bytes);
  cm[name]=measureMesh(template.tape,meshes[name].positions).cm;
  if(name==='body')continue;
  const len=bytes.readUInt32LE(12),g=JSON.parse(bytes.subarray(20,20+len));
  const skin=g.meshes[g.nodes.find(n=>n.name==='Body').mesh].primitives[0];
  const mat=g.materials[skin.material].pbrMetallicRoughness;
  const image=g.images[g.textures[mat.baseColorTexture.index].source];
  assert.equal(image.mimeType,'image/png');assert.ok(Number.isInteger(image.bufferView));
  const buffer=g.bufferViews[image.bufferView],start=28+len+(buffer.byteOffset??0);
  const png=bytes.subarray(start,start+buffer.byteLength);
  const end=png.lastIndexOf(Buffer.from('49454e44ae426082','hex'));
  assert.ok(end>0);maps[name]=PNG.sync.read(png.subarray(0,end+8));
  for(const k of ['height',...girthNames]) assert.ok(Math.abs(cm[name][k]-cm.body[k])<.01);
}
function delta(i,a,b){
  return Math.hypot(...[0,1,2].map(k=>meshes[a].positions[3*i+k]-meshes[b].positions[3*i+k]));
}
let maxBody=0,maxJaw=0,maxIdentity=0;
for(let i=0;i<template.mesh.positions.length/3;i++){
  const y=template.mesh.positions[3*i+1];
  if(y<1.42)maxBody=Math.max(maxBody,delta(i,'body','styled'));
  if(y>1.44&&y<1.51)maxJaw=Math.max(maxJaw,delta(i,'original','styled'));
  maxIdentity=Math.max(maxIdentity,delta(i,'body','original'));
}
assert.equal(maxBody,0);assert.ok(maxJaw>.0002);assert.ok(maxIdentity>.001);
const textureChecks={};
for(const [name,id] of [['lips',0],['eyeliner',158],['cheek',50]]){
  const [x,y]=anchors[id],px=Math.round((.5+x/.25)*512),py=511-Math.round((1.68-y)/.25*512);
  let sum=0;
  for(let a=-5;a<=5;a++)for(let b=-5;b<=5;b++){
    const pos=4*((py+b)*512+px+a);
    for(let k=0;k<3;k++)sum+=Math.abs(maps.original.data[pos+k]-maps.styled.data[pos+k]);
  }
  textureChecks[name]=sum/(121*3);assert.ok(textureChecks[name]>1,name+' patch did not change');
}
const report={cm,maxBodyChangeMm:maxBody*1000,maxJawChangeMm:maxJaw*1000,maxIdentityChangeMm:maxIdentity*1000,textureChecks};
fs.writeFileSync(path.join(dir,'measurements.json'),JSON.stringify(report,null,2)+'\n');
console.log(report);

