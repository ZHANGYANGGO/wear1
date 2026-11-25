import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { prepareTemplate,bodyFromGLB,measureMesh,levels,girthNames } from '../src/3d/mesh-tape.mjs';
import { templateHeight,fitBody,createPointDeformer } from '../src/3d/fitting.mjs';
import { observeView,fitGeometry,measureProfile } from '../src/3d/photo-geometry.mjs';
import { originalPoint } from '../src/create/contour.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const template=prepareTemplate(fs.readFileSync(path.join(root,'assets/3d/fitting-body.glb')));
const output=path.join(root,'reports/geometry');
fs.mkdirSync(output,{recursive:true});
const save=(file,value)=>fs.writeFileSync(path.join(output,file),JSON.stringify(value,null,2)+'\n');
const height=170;
// Independent orthographic contours drawn on a 720-pixel standing-height grid.
// Boundaries are annotated to four pixels (~0.94 cm); accept at most 1 cm.
const tolerance=1;
const refs={A:{waist:[.306,.188],belly:[.311,-.067,.137]},B:{waist:[.273,.228],belly:[.291,-.067,.177]}};
function silhouette(which,view) {
  const ref=refs[which];
  const dimensions=[[0,.14,-.05,.07],[.70,.28,-.08,.10],[levels.hips,.346,-.091,.116],
    [levels.belly,...ref.belly],[levels.waist,ref.waist[0],.044-ref.waist[1]/2,.044+ref.waist[1]/2],
    [levels.chest,.32,-.066,.152],[1.357,.405,-.060,.10],[templateHeight,.13,-.035,.095]];
  const rows=[];
  for(let i=0;i<=720;i++) {
    const h=1-i/720, y=h*templateHeight;
    const j=dimensions.findIndex((d,k)=>k && d[0]>=y), a=dimensions[j-1],b=dimensions[j];
    const t=(y-a[0])/(b[0]-a[0]);
    const [w,lo,hi]=[1,2,3].map(k=>a[k]+t*(b[k]-a[k]));
    const dx=view==='front'?.035:-.047;
    const edges=(view==='front'?[-w/2,w/2]:[lo,hi]).map(x=>Math.round((dx+x/templateHeight)*720)/720);
    rows.push([h,...edges]);
  }
  return {view,frame:{top:0},rows,issues:[],direction:view==='side'?{anterior:'right'}:null};
}
function values(b) {
  const pelvis=(b.hips.front+b.hips.back)/2;
  return {waistWidth:(b.waist.right-b.waist.left)*100,waistDepth:(b.waist.front-b.waist.back)*100,
    bellyFront:(b.belly.front-pelvis)*100,lowerBack:(b.belly.back-pelvis)*100};
}
function referenceBounds(contours) {
  const front=observeView(contours.front).samples,side=observeView(contours.side).samples;
  return Object.fromEntries(Object.keys(levels).map(k=>[k,{left:front[k].lo*height/100,right:front[k].hi*height/100,
    back:side[k].lo*height/100,front:side[k].hi*height/100}]));
}
function panel(label,view,contours,measured,offset) {
  const source=contours[view],sample=observeView(source).samples.hips;
  const origin=(sample.lo+sample.hi)/2;
  const x=v=>(145+v*730).toFixed(2), y=v=>(345-(v-.78)*600).toFixed(2);
  const line=(points,color,dash='')=>'<polyline fill="none" stroke="'+color+'" stroke-width="2.5" stroke-dasharray="'+dash+'" points="'+points.join(' ')+'"/>';
  const b=measured.bounds.hips, mid=view==='front'?(b.left+b.right)/2:(b.front+b.back)/2;
  const paths=[];
  for(let edge=0;edge<2;edge++) {
    const observed=source.rows.filter(r=>r[0]*templateHeight>=.81 && r[0]*templateHeight<=1.23);
    paths.push(line(observed.map(r=>x((r[1+edge]-origin)*height/100)+','+y(r[0]*templateHeight)),'#126252'));
    const fitted=Object.keys(levels).map(k=>{
      const box=measured.bounds[k];
      return x((view==='front'?[box.left,box.right]:[box.back,box.front])[edge]-mid)+','+y(levels[k]);
    });
    paths.push(line(fitted,'#bb342e','5 3'));
  }
  return '<g transform="translate('+offset+' 0)"><text x="18" y="32">'+label+'</text>'+paths.join('')+'</g>';
}

const contrast={},panels=[];
for(const which of ['A','B']) {
  const contours={front:silhouette(which,'front'),side:silhouette(which,'side')};
  const fit=fitGeometry({tier:'photos',heightCm:height,weightKg:65,contours},template);
  const measured=measureProfile(template,fit),reference=values(referenceBounds(contours)),actual=values(measured.bounds);
  contrast[which]={reference,actual,waistGirth:measured.cm.waist,
    errors:Object.fromEntries(Object.keys(actual).map(k=>[k,actual[k]-reference[k]]))};
  for(const view of ['front','side']) panels.push(panel(which+' · '+(view==='front'?'正面':'侧面'),view,contours,measured,panels.length*290));
}
const {A,B}=contrast;
const passed=A.actual.waistWidth>B.actual.waistWidth && A.actual.waistDepth<B.actual.waistDepth &&
  Math.abs(A.waistGirth-B.waistGirth)<3 && ['bellyFront','lowerBack'].every(k=>Math.abs(B.errors[k])<=tolerance);
save('contrast.json',{units:'cm',tolerance,passed,...contrast});
fs.writeFileSync(path.join(output,'contrast.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="1160" height="420" viewBox="0 0 1160 420"><rect width="100%" height="100%" fill="white"/><g font-family="sans-serif" font-size="18">'+panels.join('')+'<text x="20" y="405">躯干（骨盆对齐）　绿线：输入轮廓　红虚线：网格臀、小腹、腰、胸四个截面的投影边界</text></g></svg>');

const browser=path.join(root,'.private/module3/browser');
if(fs.existsSync(path.join(browser,'current/fixed.glb'))) {
  const requested={height:170,chest:98,waist:82,hips:101},fixed={requested};
  for(const version of ['baseline','current']) {
    const exported=fs.readFileSync(path.join(browser,version,'fixed.glb'));
    const actual=measureMesh(template.tape,bodyFromGLB(exported).positions).cm;
    fixed[version]=Object.fromEntries(Object.keys(requested).map(k=>[k,actual[k]]));
    if(version==='current') {
      assert.ok(girthNames.every(k=>Math.abs(actual[k]-requested[k])<=1));
      fs.copyFileSync(path.join(browser,version,'fixed.glb'),path.join(output,'fixed.glb'));
    }
  }
  save('fixed.json',fixed);
}

// Overlay the exported model on the actual RGB inputs. Retain the unlabelled
// clothing silhouette and its uncertainty; its border is not a tape measurement.
if(fs.existsSync(path.join(browser,'current/observed.json')) && fs.existsSync(path.join(browser,'current/front-source.png'))) {
  const versions=['baseline','current'], observations=JSON.parse(fs.readFileSync(path.join(browser,'current/observed.json')));
  const measured={},summary={};
  for(const version of versions) {
    const mesh=bodyFromGLB(fs.readFileSync(path.join(browser,version,'photos.glb')));
    measured[version]=measureMesh(template.tape,mesh.positions);
    let min=Infinity,max=-Infinity;
    for(let i=0;i<mesh.positions.length;i+=3) {min=Math.min(min,mesh.positions[i]);max=Math.max(max,mesh.positions[i]);}
    summary[version]={meshHeightCm:measured[version].cm.height,posedHandSpanCm:(max-min)*100,cm:measured[version].cm};
  }
  const quick=createPointDeformer(fitBody({tier:'quick',heightCm:height,weightKg:65}));
  const xyz=template.mesh.positions;
  let minX=Infinity,maxX=-Infinity;
  for(let i=0;i<xyz.length;i+=3) {
    const [x]=quick(xyz[i],xyz[i+1],xyz[i+2]);
    minX=Math.min(minX,x);maxX=Math.max(maxX,x);
  }
  summary.quickPosedHandSpanCm=(maxX-minX)*100;
  // Same photos, weight, stature and rest pose as the historical 165 cm failure.
  // Allow shoulder breadth to move the arms while catching the earlier elongation.
  const historical=['front','side'].every(v=>{
    const reference=path.join(root,'.private/bodym-analysis/qa',v+'.png');
    return fs.existsSync(reference) && fs.readFileSync(reference).equals(fs.readFileSync(path.join(browser,'current',v+'-source.png')));
  });
  if(historical) summary.armSpanWithinFiveCm=Math.abs(summary.current.posedHandSpanCm-summary.quickPosedHandSpanCm)<=5;
  const panels=[];
  for(const [index,view] of ['front','side'].entries()) {
    const {contour,sections}=observations[view];
    const observation=observeView(contour,sections),{frame}=contour;
    const pelvis=observation.samples.hips,axis=(pelvis.lo+pelvis.hi)/2;
    const sign=view==='side' && observation.anterior==='left'?-1:1;
    const body=fs.readFileSync(path.join(browser,'current',view+'-source.png')).toString('base64');
    const rows=contour.rows.filter(r=>r[0]>.46 && r[0]<.81 && r[1]!=null);
    const coords=(h,x)=>{const p=originalPoint(frame,h,x);return p.x.toFixed(1)+','+p.y.toFixed(1);};
    let drawing='<image width="'+frame.originalWidth+'" height="'+frame.originalHeight+'" href="data:image/png;base64,'+body+'"/>';
    const poly=(points,color)=>'<polyline points="'+points.join(' ')+'" fill="none" stroke="'+color+'" stroke-width="3"/>';
    for(const edge of [1,2]) drawing+=poly(rows.map(r=>coords(r[0],r[edge])),'#00ceb0');
    for(const version of versions) {
      const {bounds}=measured[version],hip=bounds.hips,mid=view==='front'?(hip.left+hip.right)/2:(hip.front+hip.back)/2;
      for(const side of [0,1]) {
        const points=[];
        for(const [k,y] of Object.entries(levels)) {
          const b=bounds[k],p=view==='front'?[b.left,b.right]:[b.back,b.front];
          const h=observation.hipHeight+(y-.874)*(observation.shoulderHeight-observation.hipHeight)/(1.357-.874);
          points.push(coords(h,axis+sign*(p[side]-mid)/(height/100)));
        }
        drawing+=poly(points,version==='baseline'?'#fdc331':'#cf2765');
      }
    }
    panels.push('<svg x="'+(index*380)+'" y="25" width="380" height="600" viewBox="0 0 '+frame.originalWidth+' '+frame.originalHeight+'">'+drawing+'</svg>');
  }
  fs.writeFileSync(path.join(browser,'photo-overlay.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="760" height="660"><rect width="100%" height="100%" fill="white"/>'+panels.join('')+'<text x="12" y="647" font-family="sans-serif">青：照片外轮廓　黄：旧网格胸腰臀腹边界　红：新网格胸腰臀腹边界</text></svg>');
  save('photo-check.json',summary);
  if(historical) assert.ok(summary.armSpanWithinFiveCm,'实拍档手臂拉伸回归');
}
console.log({passed,contrast});
assert.ok(passed,'同身高近腰围的腹背对照超出预设容差');

