import * as THREE from 'three';
import {createPointDeformer} from '../3d/fitting.mjs';
import {facePoint,clamp} from './geometry.mjs';
import {composeAtlas,prepareAtlas} from './atlas.mjs';
import {baseStyle} from './style.mjs';
import {observedHair} from './hair.mjs';

// Procedural scalp shell in the same rest coordinates as Body. A frontal fringe,
// temple length and back cap are continuous around the head.
function hairGeometry(h,depth,deform){
  const pos=[],indices=[],colors=[];
  const resolution=72,rings=26;
  const rgb=new THREE.Color('rgb('+h.color.join(',')+')');
  for(let j=0;j<=rings;j++)for(let i=0;i<=resolution;i++){
    const t=i/resolution*2*Math.PI,front=Math.cos(t),across=Math.sin(t);
    const fore=Math.max(0,front)**3,side=1-fore;
    const end=(1.35+(h.fringe??0)*1.5)*fore+(2.02+.50*clamp(h.length-.44,0,1))*side;
    const a=.008+(end-.008)*j/rings, extension=Math.max(0,j/rings-.65)/.35;
    const wave=1+(.014*Math.sin(19*t+1.3*a)+.011*Math.cos(11*t-2*a))*Math.sin(a);
    const radius=.083+clamp((h.width-.72)*.036,0,.032);
    const x=across*Math.sin(a)*radius*wave;
    const y=1.559+(.107+clamp(h.lift*.038,0,.028))*Math.cos(a)-side*extension*clamp((h.length-.53)*.145,0,.17);
    const z=.044+front*Math.sin(a)*(.108+clamp((depth-.65)*.043,0,.035))*wave;
    pos.push(...deform(x,y,z));const light=.82+.13*Math.cos(19*t+a)+.05*Math.sin(11*t);
    colors.push(rgb.r*light,rgb.g*light,rgb.b*light);
    if(j<rings && i<resolution){const n=j*(resolution+1)+i;indices.push(n,n+1,n+resolution+1,n+1,n+resolution+2,n+resolution+1);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();
  return g;
}
export async function mountFace(model,profile,restMeshes,appearance) {
  const cache=await prepareAtlas(appearance?.front??null),deform=createPointDeformer(profile);
  const body=model.getObjectByName('Body'),pos=body.geometry.attributes.position;
  const rest=restMeshes.get(body),uvs=new Float32Array(pos.count*2);
  const color=body.geometry.attributes.color;
  let fabric;
  for(let i=0;i<pos.count;i++){
    const x=rest.getX(i),y=rest.getY(i),z=rest.getZ(i);
    const skin=color.getX(i)>color.getY(i);
    if(!skin&&!fabric){
      const sampled=new THREE.Color(color.getX(i),color.getY(i),color.getZ(i)).convertLinearToSRGB();
      fabric=sampled.toArray().map(channel=>Math.round(255*channel));
    }
    let u=.010,v=skin ? .12 : .022;
    if(y>1.345&&y<1.44)v=clamp(.065+(y-1.403)*1.8,.022,.12);
    if(skin && y>1.437){
      const wrap=clamp((.082-z)/.05,0,1);
      u=clamp(.5+x/.25+Math.sign(x)*wrap*.32,.035,.98);
      v=clamp(1-(1.68-y)/.25,.032,.98);
      if(z<.015)v=.12;
    }
    uvs[i*2]=u;uvs[i*2+1]=v;
    color.setXYZ(i,1,1,1);
  }
  body.geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2));color.needsUpdate=true;
  const hair=appearance?.front?.hair;
  if(hair?.present){
    const mesh=hair.patch?await observedHair(hair,appearance.side?.hair,deform):
      new THREE.Mesh(hairGeometry(hair,appearance.side?.hair?.width??.75,deform),
        new THREE.MeshStandardMaterial({vertexColors:true,roughness:.92,side:THREE.DoubleSide}));
    mesh.name='Hair';model.add(mesh);
  }
  let lastJaw=null,texture=null;
  const shape=appearance?.shape??null;
  return (style=baseStyle(),gray=false)=>{
    if(lastJaw!==style.beauty.jaw){
      for(const [obj,original] of restMeshes){
        const p=obj.geometry.attributes.position;
        for(let i=0;i<p.count;i++){
          const x=original.getX(i),y=original.getY(i),z=original.getZ(i);
          if(y>1.42 && y<1.656 && Math.abs(x)<.115)p.setXYZ(i,...deform(...facePoint(x,y,z,shape,style.beauty.jaw)));
        }
        p.needsUpdate=true;obj.geometry.computeVertexNormals();obj.geometry.computeBoundingSphere();
      }
      lastJaw=style.beauty.jaw;
    }
    texture?.dispose();texture=new THREE.CanvasTexture(composeAtlas(cache,style,fabric));
    texture.colorSpace=THREE.SRGBColorSpace;
    body.material.map=gray?null:texture;body.material.vertexColors=!gray;
    body.material.color.set(gray?0xb7b2aa:0xffffff);body.material.needsUpdate=true;
    // The grey shape check keeps eyes and teeth as landmarks but removes the hair silhouette.
    const h=model.getObjectByName('Hair');if(h)h.visible=!gray;
    if(gray){texture.dispose();texture=null;}
  };
}

