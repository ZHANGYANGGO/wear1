import {canvas,captureAtlas} from './atlas.mjs';
import {cameraFor,clamp} from './geometry.mjs';
let tasks,segmenter;
async function vision(){
  return tasks??=(async()=>{
    const lib=await import('/vendor/pose/vision_bundle.mjs');
    const wasm=await lib.FilesetResolver.forVisionTasks('/vendor/pose/wasm');
    const face=await lib.FaceLandmarker.createFromOptions(wasm,{baseOptions:{modelAssetPath:'/assets/3d/face-landmarker.task'},
      runningMode:'IMAGE',numFaces:2,minFaceDetectionConfidence:.40,outputFaceBlendshapes:true});
    return {face,wasm,lib};
  })().catch(e=>{tasks=null;throw e;});
}
async function parseHair(task,crop){
  segmenter??=task.lib.ImageSegmenter.createFromOptions(task.wasm,{baseOptions:{modelAssetPath:'/assets/3d/selfie-multiclass.tflite'},
    runningMode:'IMAGE',outputCategoryMask:true,outputConfidenceMasks:false}).catch(e=>{segmenter=null;throw e;});
  const engine=await segmenter;
  const result=engine.segment(crop);
  try {const m=result.categoryMask;return {data:m.getAsUint8Array().slice(),w:m.width,h:m.height};}finally{result.close();}
}
const median=a=>a.sort((x,y)=>x-y)[Math.floor(a.length/2)];
function sampleColour(samples,fallback) {
  return samples.length?[0,1,2].map(k=>median(samples.map(p=>p[k]))):fallback;
}
async function decode(file){
  if(!file || file.size>16*1024*1024)throw new Error('请选择小于 16 MB 的单人照片。');
  const url=URL.createObjectURL(file),img=new Image();img.src=url;
  try{await img.decode();return img;}catch{throw new Error('图片无法解码，请使用 PNG 或 JPEG。');}finally{URL.revokeObjectURL(url);}
}
export async function observePhoto(file,view,mirror=false) {
  const im=await decode(file),task=await vision();
  const factor=Math.min(1,1500/Math.max(im.width,im.height));
  const initial=canvas(Math.round(im.width*factor),Math.round(im.height*factor)),ic=initial.getContext('2d');
  if(mirror){ic.translate(initial.width,0);ic.scale(-1,1);}ic.drawImage(im,0,0,initial.width,initial.height);
  let source=initial, result=task.face.detect(source);
  if(!result.faceLandmarks.length){
    source=canvas(Math.round(initial.width*.66),Math.round(initial.height*.55));
    source.getContext('2d').drawImage(initial,(initial.width-source.width)/2,0,source.width,source.height,0,0,source.width,source.height);
    result=task.face.detect(source);
  }
  if(result.faceLandmarks.length!==1) throw new Error(result.faceLandmarks.length?'请使用只有一张脸的照片。':'未定位到脸，请用清晰近照；侧照可选三分之二角度。');
  const raw=result.faceLandmarks[0].slice(0,468).map(p=>[p.x*source.width,p.y*source.height]);
  const xs=raw.map(p=>p[0]),ys=raw.map(p=>p[1]);
  const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys),height=bottom-top;
  if(height<60 || top<1 || bottom>=source.height-1)throw new Error('脸部太小或下颌被裁切，请补拍近照。');
  const cx=(left+right)/2,cy=(top+bottom)/2;
  const obs={points:raw.map(([x,y])=>[(x-cx)/height,(y-cy)/height]),mirror,
    expression:Math.max(0,...(result.faceBlendshapes?.[0]?.categories??[]).filter(c=>['jawOpen','mouthSmileLeft','mouthSmileRight'].includes(c.categoryName)).map(c=>c.score))};
  const yaw=cameraFor(obs)[0];
  if(view==='front' && Math.abs(yaw)>.52)throw new Error('正脸偏转过大，请正对镜头。');
  if(view==='side' && Math.abs(yaw)<.35)throw new Error('侧照角度太接近正面，请转身约 40–75°。');
  obs.yaw=yaw;
  const span=height*2, n=640, x0=cx-span/2,y0=cy-span*.49;
  const crop=canvas(n),ctx=crop.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(source,x0,y0,span,span,0,0,n,n);
  const pts=raw.map(([x,y])=>[(x-x0)*n/span,(y-y0)*n/span]);
  const rgba=ctx.getImageData(0,0,n,n), d=rgba.data, mask=await parseHair(task,crop);
  const label=(x,y)=>mask.data[Math.floor(y*mask.h/n)*mask.w+Math.floor(x*mask.w/n)];
  // A voting window prevents a single hair or accessory pixel from hiding a contour.
  obs.weights=pts.map(([x,y])=>{
    let covered=0;
    for(const dx of [-3,0,3])for(const dy of [-3,0,3]){
      const part=label(clamp(x+dx,0,n-1),clamp(y+dy,0,n-1));
      if(part===1||part===4||part===5)covered++;
    }
    return 1-.8*covered/9;
  });
  const cheeks=[], hair=[], hx=[],hy=[];
  for(let y=0;y<n;y+=3)for(let x=0;x<n;x+=3){
    const cat=label(x,y),i=4*(y*n+x);
    if(cat===1){hair.push([d[i],d[i+1],d[i+2]]);hx.push(x);hy.push(y);}
    if(cat===3 && [50,280,205,425].some(id=>Math.hypot(x-pts[id][0],y-pts[id][1])<24))
      cheeks.push([d[i],d[i+1],d[i+2]]);
  }
  if(!cheeks.length){for(const id of [50,280,205,425]){const [x,y]=pts[id].map(Math.round),i=4*(y*n+x);cheeks.push(Array.from(d.slice(i,i+3)));}}
  obs.skin=sampleColour(cheeks,[197,158,134]);
  const sorted=hy.sort((a,b)=>a-b);
  const width=hx.length?(Math.max(...hx)-Math.min(...hx))/(n/2):0;
  obs.hair={present:hair.length>100,color:sampleColour(hair,[55,42,38]),width:clamp(width,.55,1.85),
    lift:sorted.length?clamp((pts[10][1]-sorted[Math.floor(sorted.length*.015)])/(n/2),0,.65):0,
    length:sorted.length?clamp((sorted[Math.floor(sorted.length*.97)]-pts[10][1])/(n/2),.10,1.9):.4};
  const forehead=[];
  for(let x=Math.round(pts[10][0])-22;x<pts[10][0]+22;x+=3)for(let y=Math.max(0,Math.round(pts[10][1]-70));y<pts[168][1];y++)
    if(label(x,y)===1 && label(x,y+1)===3)forehead.push(y);
  obs.hair.fringe=forehead.length?clamp((median(forehead)-pts[10][1])/(n/2),-.15,.45):0;
  if(view==='front'){
    if(obs.hair.present){
      // Register only the segmented hair pixels to the frontal rest-space atlas.
      const unit=.154/(pts[152][1]-pts[10][1]),center=(pts[33][0]+pts[263][0])/2;
      const hc=canvas(256),hctx=hc.getContext('2d'),patch=hctx.createImageData(256,256);
      const profile=[];let first=256,last=-1;
      for(let row=0;row<256;row++){
        const py=Math.round(pts[152][1]+(1.444-(1.735-row*.39/255))/unit),columns=[];
        for(let col=0;col<256;col++){
          const px=Math.round(center+(col/255-.5)*.32/unit);
          if(px<0||px>=n||py<0||py>=n||label(px,py)!==1)continue;
          const dest=4*(row*256+col),src=4*(py*n+px);
          patch.data.set(d.subarray(src,src+4),dest);columns.push(col);
        }
        if(columns.length>=4){
          first=Math.min(first,row);last=row;
          profile[row]=[columns[Math.floor(columns.length*.02)],columns[Math.floor(columns.length*.98)]];
        }
      }
      if(last-first>8){
        hctx.putImageData(patch,0,0);obs.hair.patch=hc.toDataURL('image/png');
        obs.hair.profile=Array.from({length:last-first+1},(_,i)=>profile[i+first]??null);
        obs.hair.first=first;
      }
    }
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const cat=label(x,y),i=4*(y*n+x);
      if(cat!==3 && cat!==2)for(let k=0;k<3;k++)d[i+k]=obs.skin[k];
    }
    ctx.putImageData(rgba,0,0);obs.atlas=captureAtlas(crop,pts,obs.skin);
  }
  return obs;
}

