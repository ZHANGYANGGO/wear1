import * as THREE from 'three';
import {canvas} from './atlas.mjs';
import {clamp} from './geometry.mjs';

// Sample the measured frontal silhouette at each height. The unobserved back
// uses a rounded scalp prior and pixels from the observed hair only.
export async function observedHair(h,side,deform){
  const im=new Image();im.src=h.patch;await im.decode();
  const src=canvas(256),sc=src.getContext('2d');sc.drawImage(im,0,0);
  const pixels=sc.getImageData(0,0,256,256).data;
  const colourSamples=[];
  for(let i=0;i<pixels.length;i+=4)if(pixels[i+3])colourSamples.push(i);
  const ringCount=48,radial=96,positions=[],uv=[],indices=[];
  function ring(v) {
    const row=v*(h.profile.length-1),nearest=Math.round(row);
    const nearby=h.profile.slice(Math.max(0,nearest-5),nearest+6).filter(Boolean);
    const radius=nearby.length?nearby.reduce((s,p)=>s+Math.max((128-p[0])*.32/255,(p[1]-128)*.32/255),0)/nearby.length:.035;
    const y=1.735-(h.first+row)*.39/255;
    return {y,rx:clamp(radius,.003,.15),rz:Math.sqrt(Math.max(.015,1-((Math.max(1.51,y)-1.552)/Math.max(.112,1.735-h.first*.39/255-1.552))**2))*
      (.113+clamp(((side?.width??.8)-.8)*.025,-.008,.025))};
  }
  for(let j=0;j<=ringCount;j++)for(let i=0;i<=radial;i++){
    const u=i/radial,v=j/ringCount,t=(u-.5)*Math.PI*2,r=ring(v);
    const x=r.rx*Math.sin(t),z=.043+r.rz*Math.cos(t);
    positions.push(...deform(x,r.y,z));uv.push(u,1-v);
    if(i<radial&&j<ringCount){const k=j*(radial+1)+i;indices.push(k,k+radial+1,k+1,k+1,k+radial+1,k+radial+2);}
  }
  const tex=canvas(512,256),ctx=tex.getContext('2d'),data=ctx.createImageData(512,256);
  for(let j=0;j<256;j++){
    const v=j/255,r=ring(v),row=Math.round(h.first+v*(h.profile.length-1));
    for(let i=0;i<512;i++){
      const t=(i/511-.5)*Math.PI*2,x=clamp(Math.round((.5+r.rx*Math.sin(t)/.32)*255),0,255);
      const index=4*(row*256+x),dest=4*(j*512+i), facing=Math.cos(t);
      const sampled=pixels[index+3]>0;
      if(!sampled && facing>.58)continue;
      const source=sampled?index:colourSamples[(Math.floor(i/4)*71+Math.floor(j/4)*17)%colourSamples.length];
      for(let c=0;c<3;c++)data.data[dest+c]=sampled?pixels[source+c]:.65*h.color[c]+.35*pixels[source+c];
      data.data[dest+3]=255;
    }
  }
  ctx.putImageData(data,0,0);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
  const map=new THREE.CanvasTexture(tex);map.colorSpace=THREE.SRGBColorSpace;
  return new THREE.Mesh(g,new THREE.MeshStandardMaterial({map,alphaTest:.42,roughness:.92,side:THREE.DoubleSide}));
}

