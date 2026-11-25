import {anchors,triangles} from './template.mjs';
import {clamp} from './geometry.mjs';
export const size=512;
export const uv=anchors.map(([x,y])=>[(.5+x/.25)*size,(1.68-y)/.25*size]);
export const lips=[61,40,37,0,267,270,291,321,314,17,84,91];
const opening=[78,81,13,311,308,402,14,178];
const eyelids=[[33,160,158,133,153,144],[263,387,385,362,380,373]];
export function canvas(w=size,h=w){
  const c=document.createElement('canvas');c.width=w;c.height=h;return c;
}
function path(ctx,ids){
  ctx.beginPath();ids.forEach((id,i)=>ctx[i?'lineTo':'moveTo'](...uv[id]));ctx.closePath();
}
function triangle(ctx,im,src,dst) {
  const [[a,b],[c,d],[e,f]]=src, [[u,v],[w,x],[y,z]]=dst;
  const det=(c-a)*(f-b)-(e-a)*(d-b);
  if(Math.abs(det)<.1)return;
  const A=((w-u)*(f-b)-(y-u)*(d-b))/det,C=((c-a)*(y-u)-(e-a)*(w-u))/det;
  const B=((x-v)*(f-b)-(z-v)*(d-b))/det,D=((c-a)*(z-v)-(e-a)*(x-v))/det;
  ctx.save();ctx.beginPath();
  const mx=(u+w+y)/3,my=(v+x+z)/3;
  dst.forEach(([px,py],i)=>{const r=Math.hypot(px-mx,py-my)||1;ctx[i?'lineTo':'moveTo'](px+.55*(px-mx)/r,py+.55*(py-my)/r);});
  ctx.closePath();ctx.clip();ctx.transform(A,B,C,D,u-A*a-C*b,v-B*a-D*b);ctx.drawImage(im,0,0);ctx.restore();
}
export function captureAtlas(image,points,skin) {
  const result=canvas(),ctx=result.getContext('2d');
  ctx.fillStyle='rgb('+skin+')';ctx.fillRect(0,0,size,size);
  const layer=canvas(),lc=layer.getContext('2d');
  for(const ids of triangles) triangle(lc,image,ids.map(i=>points[i]),ids.map(i=>uv[i]));
  // Feather the observed face into the sampled cheek colour at its boundary.
  const mask=canvas(),mc=mask.getContext('2d');
  mc.filter='blur(5px)';
  path(mc,[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109]);mc.fill();
  lc.globalCompositeOperation='destination-in';lc.drawImage(mask,0,0);ctx.drawImage(layer,0,0);
  return result.toDataURL('image/png');
}
function fade(ctx,x,y,rx,ry,color,amount) {
  ctx.save();ctx.translate(x,y);ctx.scale(rx,ry);const g=ctx.createRadialGradient(0,0,0,0,0,1);
  g.addColorStop(0,color);g.addColorStop(1,color+'00');ctx.fillStyle=g;ctx.globalAlpha=amount;
  ctx.fillRect(-1,-1,2,2);ctx.restore();
}
export async function prepareAtlas(base) {
  const c=canvas(),ctx=c.getContext('2d',{willReadFrequently:true});
  const skin=base?.skin??[224,207,191];
  ctx.fillStyle='rgb('+skin+')';ctx.fillRect(0,0,size,size);
  if(base?.atlas){const im=new Image();im.src=base.atlas;await im.decode();ctx.drawImage(im,0,0);}
  const original=ctx.getImageData(0,0,size,size),smooth=new Uint8ClampedArray(original.data);
  const mask=canvas(),mc=mask.getContext('2d');
  mc.fillStyle='white';mc.fillRect(0,0,size,size);mc.fillStyle='black';mc.strokeStyle='black';mc.lineWidth=8;
  for(const ids of [...eyelids,lips,[70,63,105,66,107],[336,296,334,293,300],[98,97,2,326,327]]){path(mc,ids);mc.fill();mc.stroke();}
  const protectedSkin=mc.getImageData(0,0,size,size).data;
  const d=original.data;
  for(let y=4;y<size-4;y++)for(let x=4;x<size-4;x++){
    const i=4*(y*size+x);if(!protectedSkin[i])continue;
    const sum=[0,0,0];let total=0;
    for(const dy of [-4,0,4])for(const dx of [-4,0,4]){
      const j=i+4*(dy*size+dx);
      const diff=Math.abs(d[i]-d[j])+Math.abs(d[i+1]-d[j+1])+Math.abs(d[i+2]-d[j+2]);
      const w=1/(1+(diff/38)**2);total+=w;
      for(let k=0;k<3;k++)sum[k]+=w*d[j+k];
    }
    for(let k=0;k<3;k++)smooth[i+k]=sum[k]/total;
  }
  return {original,smooth,protectedSkin,skin};
}
export function composeAtlas(cache,style,fabric=[133,150,151]) {
  const c=canvas(),ctx=c.getContext('2d'),out=ctx.createImageData(size,size);
  const {original,smooth,protectedSkin,skin}=cache,{beauty,makeup:m}=style;
  const d=original.data;
  for(let i=0;i<d.length;i+=4){
    const region=protectedSkin[i]/255;
    for(let k=0;k<3;k++){
      const retouched=d[i+k]+region*(smooth[i+k]-d[i+k])*beauty.smooth/100;
      out.data[i+k]=retouched+region*(skin[k]-retouched)*beauty.even*.005+region*(255-retouched)*beauty.light*.003;
    }
    out.data[i+3]=255;
  }
  ctx.putImageData(out,0,0);
  for(const id of [50,280])fade(ctx,...uv[id],42,26,m.blush.color,m.blush.amount*.006);
  ctx.save();path(ctx,lips);ctx.clip();
  ctx.beginPath();ctx.rect(0,0,size,size);opening.forEach((id,i)=>ctx[i?'lineTo':'moveTo'](...uv[id]));ctx.closePath();ctx.clip('evenodd');
  ctx.fillStyle=m.lip.color;ctx.globalAlpha=m.lip.amount*.007;ctx.fillRect(0,0,size,size);ctx.restore();
  for(const eye of eyelids) {
    const p=eye.slice(0,4).map(id=>uv[id]);
    ctx.save();ctx.beginPath();p.forEach(([x,y],i)=>ctx[i?'lineTo':'moveTo'](x,y));
    p.slice().reverse().forEach(([x,y],i)=>ctx.lineTo(x,y-[1,12,13,2][i]));ctx.closePath();ctx.clip();
    fade(ctx,(p[0][0]+p[3][0])/2,(p[1][1]+p[2][1])/2,Math.abs(p[3][0]-p[0][0])*.72,19,m.shadow.color,m.shadow.amount*.012);
    ctx.restore();
    if(m.liner.amount){ctx.save();ctx.beginPath();ctx.moveTo(p[0][0],p[0][1]-1);
      for(let j=1;j<p.length;j++)ctx.lineTo(p[j][0],p[j][1]-1);
      ctx.strokeStyle=m.liner.color;ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=.5+m.liner.amount*.046;
      ctx.globalAlpha=clamp(m.liner.amount/40,.2,1);ctx.stroke();ctx.restore();}
  }
  // A strip of the atlas carries the base garment to neck transition. The
  // neckline can pass through triangles without following their jagged edges.
  ctx.fillStyle='rgb('+fabric+')';ctx.fillRect(0,Math.round(size*(1-.065)),12,size);
  return c;
}

