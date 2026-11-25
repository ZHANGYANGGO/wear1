import { fitBody, createPointDeformer, templateHeight } from './fitting.mjs';
import { levels, girthNames, measureMesh } from './mesh-tape.mjs';
import { geometryWeights } from './geometry-weights.mjs';

const clamp=(x,lo,hi)=>Math.min(hi,Math.max(lo,x));
const heightOf={...levels,shoulders:1.357};
const band={hips:2,waist:3,chest:4,shoulders:5};
const middle = a => a.sort((x,y)=>x-y)[Math.floor(a.length/2)];

function orientation(contour) {
  const points=contour.worldLandmarks;
  if (!points) return 0;
  const angles=[];
  for(const i of [11,23]) {
    if(!points[i] || !points[i+1] || Math.min(contour.landmarks?.[i]?.visibility??0,contour.landmarks?.[i+1]?.visibility??0)<.65) continue;
    const dx=Math.abs(points[i].x-points[i+1].x), dz=Math.abs(points[i].z-points[i+1].z);
    angles.push(contour.view==='front'?Math.atan2(dz,dx):Math.atan2(dx,dz));
  }
  return angles.length ? Math.min(.20,middle(angles)) : 0;
}

// Select the broad central foreground run at each anatomical height. All side
// boundaries retain a single pelvis origin; recentering each row loses the belly.
export function observeView(contour, sections={}) {
  const hip=clamp(sections.hipHeight ?? .874/templateHeight,.46,.57);
  const shoulder=clamp(sections.shoulderHeight ?? 1.357/templateHeight,.76,.87);
  const samples={};
  for(const [name,y] of Object.entries(heightOf)) {
    const h=hip+(y-.874)*(shoulder-hip)/(1.357-.874);
    const left=[], right=[], confidence=[];
    const n=contour.rows.length;
    for(let i=Math.max(0,Math.floor((1-h-.009)*(n-1)));i<=Math.min(n-1,Math.ceil((1-h+.009)*(n-1)));i++) {
      const row=contour.rows[i];
      if(row[1]==null) continue;
      const runs=row[3]??[[row[1],row[2]]];
      const torso=runs.reduce((a,b)=>b[1]-b[0]>a[1]-a[0]?b:a);
      if(torso[1]-torso[0]<.04) continue;
      const maskY=contour.frame.top+i;
      const flagged=contour.issues.some(r=>r.fromRow<=maskY && r.toRow>=maskY);
      left.push(torso[0]); right.push(torso[1]); confidence.push(flagged ? .22 : 1);
    }
    if(!left.length) continue;
    const lo=middle(left), hi=middle(right);
    const poseConfidence=sections.confidence?.[name] ?? (name==='belly'
      ? Math.min(sections.confidence?.hips??1,sections.confidence?.waist??1) : 1);
    const reliability=Math.min(middle(confidence),poseConfidence);
    samples[name]={lo,hi,width:hi-lo,confidence:reliability};
    if(name==='shoulders' && contour.view==='front' && sections.shoulders && sections.confidence?.shoulders===1)
      samples[name].width=sections.shoulders;
  }
  return {samples,hipHeight:hip,shoulderHeight:shoulder,angle:orientation(contour),
    poseConfidence:sections.confidence,anterior:contour.direction?.anterior??null};
}

export function observedSections(view,rest,dimension) {
  const result={hipHeight:view.hipHeight,shoulderHeight:view.shoulderHeight,confidence:{}};
  for(const name of Object.keys(band)) {
    const b=rest.bounds[name], s=view.samples[name];
    const neutral=b?(dimension==='front'?b.right-b.left:b.front-b.back):(dimension==='front'?.408:.145);
    result[name]=s?.width??neutral/templateHeight;
    result.confidence[name]=s?.confidence??0;
  }
  return result;
}

export function geometryFeatures(input,obs) {
  const h=input.heightCm, build=Math.sqrt(input.weightKg/(h/100)**2/22);
  const features=[1,(h-170)/20,build-1,(build-1)**2];
  for(const name of ['hips','belly','waist','chest','shoulders']) {
    for(const view of ['front','side']) {
      const s=obs[view].samples[name];
      const neutral=(view==='front'?{hips:.21,belly:.18,waist:.16,chest:.19,shoulders:.245}:
        {hips:.13,belly:.12,waist:.11,chest:.135,shoulders:.10})[name];
      features.push(clamp((s?.width??neutral*build)/neutral,.55,1.95)-1);
    }
  }
  return features;
}

export function measureProfile(template,record) {
  return measureMesh(template.tape,template.mesh.positions,createPointDeformer(record),template.mesh.weights);
}

function calibrate(template,record,targets) {
  const entries=Object.entries(targets);
  for(let iteration=0;iteration<7 && entries.length;iteration++) {
    const {cm}=measureProfile(template,record);
    if(entries.every(([k,target])=>Math.abs(cm[k]-target)<.05)) break;
    const factors={};
    for(const [k,target] of entries) {
      const ratio=clamp(target/cm[k],.6,1.6);
      const b=record.bands[band[k]];
      b[1]*=ratio; b[2]*=ratio; factors[k]=ratio;
    }
    if(record.bellyBand) {
      const r=Math.sqrt((factors.hips??1)*(factors.waist??1));
      record.bellyBand[1]*=r; record.bellyBand[2]*=r;
    }
  }
}

export function fitGeometry(input,template,prepared) {
  if(!['quick','photos','measured','appearance'].includes(input.tier)) throw new Error('请选择建模方式。');
  if(input.tier==='quick') return fitBody(input);
  const obs=prepared??(input.contours?Object.fromEntries(['front','side'].map(v=>[v,observeView(input.contours[v],input.views?.[v])])):null);
  const views=obs?Object.fromEntries(['front','side'].map(v=>[v,observedSections(obs[v],template.rest,v)])):input.views;
  // Legacy sections remain a supported input when replaying saved fixtures.
  const record=fitBody({...input,views,tier:'photos'});
  record.tier=input.tier; record.photoFitVersion=3;
  if(obs) {
    const build=clamp(Math.sqrt(input.weightKg/(input.heightCm/100)**2/22),.72,1.65);
    const hip=obs.side.samples.hips, sign=obs.side.anterior==='left'?-1:1;
    const bounds=template.rest.bounds, hipMid=(bounds.hips.front+bounds.hips.back)/2;
    record.depthOffsets={};
    for(const [name,y] of Object.entries(levels)) {
      const b=bounds[name], f=obs.front.samples[name], s=obs.side.samples[name];
      const dims=[b.right-b.left,b.front-b.back];
      const scales=[f,s].map((sample,i)=>{
        if(!sample) return build;
        const angle=(i?obs.side:obs.front).angle;
        const other=[s,f][i]?.width??dims[1-i]*build/templateHeight;
        const width=Math.sqrt(Math.max(.0025,sample.width**2-(other*Math.sin(angle))**2))/Math.cos(angle);
        const raw=clamp(width*templateHeight/dims[i],.58,1.8);
        const trust=.92*sample.confidence;
        return build+trust*(raw-build);
      });
      if(name==='belly') record.bellyBand=[y,...scales];
      else record.bands[band[name]]=[y,...scales];
      if(hip && s && obs.side.anterior) {
        const desired=sign*((s.lo+s.hi)-(hip.lo+hip.hi))*templateHeight/2;
        const hipScale=record.bands[band.hips][2];
        const actual=((b.front+b.back)/2-.025)*scales[1]-(hipMid-.025)*hipScale;
        record.depthOffsets[name]=clamp(desired-actual,-.07,.07)*Math.min(hip.confidence,s.confidence);
      }
    }
  }
  const targets={};
  if(obs && geometryWeights) {
    const features=geometryFeatures(input,obs);
    // Known direction and sharp edges constrain local shape directly. For a
    // directionless mask, use the train-calibrated circumference estimate.
    const direct=obs.side.anterior||obs.front.poseConfidence||obs.side.poseConfidence?measureProfile(template,record).cm:null;
    for(const k of girthNames) {
      const prediction=geometryWeights[k].reduce((sum,w,j)=>sum+w*features[j],0);
      // When pose evidence puts an arm over the torso, a mask-only predictor
      // would reintroduce the garment/arm width we just downweighted.
      const poseTrust=Math.min(obs.front.poseConfidence?.[k]??1,obs.side.poseConfidence?.[k]??1);
      const boundaryTrust=obs.side.anterior ? .85*Math.min(obs.front.samples[k]?.confidence??0,obs.side.samples[k]?.confidence??0) : 0;
      const trust=Math.max(1-poseTrust,boundaryTrust);
      targets[k]=clamp(prediction*(1-trust)+(direct?.[k]??0)*trust,35,220);
    }
  }
  if(input.tier==='measured' && !girthNames.some(k=>input.girths?.[k]!=null)) throw new Error('请填写至少一项实测围度。');
  if(['measured','appearance'].includes(input.tier)) for(const k of girthNames) {
    const value=input.girths?.[k];
    if(value==null) continue;
    if(!Number.isFinite(value)||value<35||value>220) throw new Error('实测围度需在 35–220 cm 之间。');
    targets[k]=value;
  }
  calibrate(template,record,targets);
  if (['measured','appearance'].includes(input.tier) && girthNames.some(k => input.girths?.[k] != null)) {
    const {cm}=measureProfile(template,record);
    if (girthNames.some(k=>input.girths[k]!=null && Math.abs(cm[k]-input.girths[k])>1))
      throw new Error('当前模板未能同时满足填写的围度，请核对量体位置和单位。');
  }
  return record;
}

