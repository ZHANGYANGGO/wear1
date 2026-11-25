import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {prepareTemplate,bodyFromGLB,measureMesh} from '../src/3d/mesh-tape.mjs';
import {fitGeometry,measureProfile,observeView} from '../src/3d/photo-geometry.mjs';
import {fitBody,validLocalFit} from '../src/3d/fitting.mjs';

const read=file=>readFileSync(new URL(file,import.meta.url));
const template=prepareTemplate(read('../assets/3d/fitting-body.glb'));
const input={tier:'measured',heightCm:170,weightKg:65,views:{
  front:{chest:.2,waist:.16,hips:.21,shoulders:.24},side:{chest:.13,waist:.12,hips:.13,shoulders:.09}}};

test('the torso tape follows the same closed mesh paths after GLB export',()=>{
  const exported=bodyFromGLB(read('../reports/geometry/fixed.glb'));
  const {cm,paths}=measureMesh(template.tape,exported.positions);
  for(const [k,value] of Object.entries({height:170,chest:98,waist:82,hips:101})) assert.ok(Math.abs(cm[k]-value)<.1);
  for(const k of ['waist','chest','hips']) assert.ok(paths[k].length>40 && paths[k].every(p=>Math.abs(p[0])<.26));
});

test('partial manual measurements calibrate actual mesh perimeter without requiring other labels',()=>{
  const profile=fitGeometry({...input,girths:{waist:82}},template);
  assert.ok(validLocalFit(profile));
  assert.ok(Math.abs(measureProfile(template,profile).cm.waist-82)<.1);
  assert.throws(()=>fitGeometry({...input,girths:{}},template),/至少一项/);
});

test('quick fitting preserves its existing scales and does not require any photo observations',()=>{
  const quick={tier:'quick',heightCm:170,weightKg:65,adjust:{hips:8}};
  assert.deepEqual(fitGeometry(quick,template).bands,fitBody(quick).bands);
});

test('unknown orientation, separated arms and masked rows preserve only supported torso evidence',()=>{
  const rows=Array.from({length:501},(_,i)=>[1-i/500,-.24,.22,[[-.24,-.21],[-.08,.06],[.2,.22]]]);
  const contour={view:'side',rows,frame:{top:12},issues:[{fromRow:1,toRow:600}],direction:null};
  const obs=observeView(contour);
  assert.equal(obs.anterior,null);
  assert.ok(Math.abs(obs.samples.waist.width-.14)<1e-9);
  assert.ok(obs.samples.waist.confidence<.3);
  const photos={...input,tier:'photos',views:{},contours:{front:{...contour,view:'front'},side:contour}};
  const profile=fitGeometry(photos,template);
  assert.deepEqual(profile.depthOffsets,{});
  assert.ok(validLocalFit(profile));
});

