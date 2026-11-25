import test from 'node:test';
import assert from 'node:assert/strict';
import {anchors} from '../src/face/template.mjs';
import {facePoint,project,cameraFor,neutralShape,heldOut,fitFace} from '../src/face/geometry.mjs';
import {baseStyle,selectBeauty,selectMakeup} from '../src/face/style.mjs';
function observe(shape,yaw) {
  const cam=[yaw,.03,-.05,Math.log(5.8),.02,.03];
  return {points:anchors.map(p=>project(facePoint(...p,shape),cam)),expression:0};
}
test('a makeup preset preserves retouching and resets are independent',()=>{
  const zero=baseStyle(),warm=selectMakeup(selectBeauty(zero,'柔和上镜'),'暖调晚妆');
  assert.equal(warm.beauty.even,25);assert.equal(zero.makeup.lip.amount,0);
  assert.deepEqual(selectBeauty(warm,'原貌').makeup,warm.makeup);
  assert.deepEqual({...warm,makeup:baseStyle().makeup}.beauty,warm.beauty);
});
test('jaw changes the rest mesh locally and reversibly without moving the crown or neck',()=>{
  const s=neutralShape(),p=[.055,1.49,.12];
  assert.ok(facePoint(...p,s,100)[0]<p[0]-.004);
  assert.deepEqual(facePoint(...p,s,0),p);
  for(const point of [[0,1.659,.04],[.05,1.40,.05],[.15,1.04,.1]])assert.deepEqual(facePoint(...point,s,100),point);
});
test('single view retains depth prior and two views constrain a shared nose profile',()=>{
  const truth=neutralShape();truth[7]=.009;truth[8]=-.005;
  const front=observe(truth,0),side=observe(truth,.93),held=observe(truth,-.65);
  const a=fitFace(front,null),b=fitFace(front,side);
  assert.equal(a[7],0);assert.ok(b[7]>.002);
  assert.ok(heldOut(held,b).mean<heldOut(held,a).mean);
  assert.ok(Math.abs(cameraFor(side,truth)[0]-.93)<.04);
});

