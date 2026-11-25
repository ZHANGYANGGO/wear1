import { bodyTemplates, placeHead, project } from './body-templates.mjs';

function surface(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('浏览器无法合成角色图层。');
  return ctx;
}

function png(ctx) {
  return new Promise((resolve,reject) => ctx.canvas.toBlob(blob => blob ? resolve(blob)
    : reject(new Error('角色图层生成失败。')), 'image/png'));
}

function pixels(bitmap) {
  const ctx = surface(bitmap.width,bitmap.height);
  ctx.drawImage(bitmap,0,0);
  return ctx.getImageData(0,0,bitmap.width,bitmap.height);
}

async function readImage(url) {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

function median(values) {
  values.sort((a,b) => a-b);
  return values[Math.floor(values.length/2)];
}

function cheekColor(head, rgba, parts) {
  const samples = [[],[],[]];
  const radius = Math.max(2,Math.round(Math.abs(head.landmarks[454][0]-head.landmarks[234][0])*.045));
  for (const index of [50,280,205,425]) {
    const [cx,cy] = head.landmarks[index].map(Math.round);
    for (let y=Math.max(0,cy-radius); y<=Math.min(rgba.height-1,cy+radius); y++) {
      for (let x=Math.max(0,cx-radius); x<=Math.min(rgba.width-1,cx+radius); x++) {
        const i=4*(y*rgba.width+x);
        if (parts.data[i]!==3 || rgba.data[i+3]<224) continue;
        samples.forEach((channel,k) => channel.push(rgba.data[i+k]));
      }
    }
  }
  if (!samples[0].length) {
    for (let i=0;i<rgba.data.length;i+=16) {
      if (parts.data[i]===3 && rgba.data[i+3]>224) samples.forEach((ch,k)=>ch.push(rgba.data[i+k]));
    }
  }
  if (!samples[0].length) throw new Error('头层缺少可用于身体配色的脸部皮肤。请重新生成头层。');
  return samples.map(median);
}

// Replace the old cuff and shoe fragments with the adjacent bare-skin cross section.
// Use the remaining limb artwork as a luminance map so fingers and ankle shadows survive.
function skinLimb(image, id, template, tone) {
  const source = pixels(image);
  const ctx = surface(560,1536);
  const target = ctx.createImageData(560,1536);
  const low = id === 'arms' ? template.armStart : (template === bodyTemplates.fitted ? 1411 : 1418);
  const high = id === 'arms' ? 938 : 1468;
  const luminance = i => .299*source.data[i]+.587*source.data[i+1]+.114*source.data[i+2];
  const light = [];
  for (let y=low; y<high; y+=2) {
    for (let x=0; x<560; x+=2) {
      const i=4*(y*560+x);
      if (source.data[i+3]>224 && (id==='arms' ? y>template.bareArmRow : Math.abs(y-template.ankleSample)<4)) light.push(luminance(i));
    }
  }
  if (!light.length) throw new Error('身体模板缺少皮肤素材。');
  const reference = Math.max(1,median(light));
  for (let y=low;y<high;y++) {
    const sampleY = id==='arms' ? Math.max(template.bareArmRow,y) : Math.min(template.ankleSample,y);
    for (let x=0;x<560;x++) {
      const i=4*(sampleY*560+x), dest=4*(y*560+x);
      if (!source.data[i+3]) continue;
      const shade = Math.max(.32, Math.min(1.28, luminance(i)/reference))**.84;
      for (let k=0;k<3;k++) target.data[dest+k]=tone[k]*shade*.96;
      target.data[dest+3]=source.data[i+3];
    }
  }
  ctx.putImageData(target,0,0);
  return png(ctx);
}

function drawHeadLayers(head, assets, geometry, template) {
  const rgba = pixels(assets.head), parts = pixels(assets.parts), hair = pixels(assets.frontHair);
  const tone = cheekColor(head,rgba,parts);
  const [s,,tx,,,ty]=geometry.layerToCanvas;
  const height=template.anchors.waist[1];
  const warped=surface(560,height);
  warped.setTransform(s,0,0,s,tx,ty);
  warped.drawImage(assets.head,0,0);
  const portrait=warped.getImageData(0,0,560,height).data;
  const join=surface(560,height);
  const placement=head.mapping.placements?.[template.id];
  const chinY=geometry.landmarks[152][1];
  if (placement) join.drawImage(assets.neckJoin,...placement.neckJoinAt);
  else {
    const joinTop=template.chinY-24, center=template.anchors.neck[0];
    const [left,top]=head.mapping.neckJoinAt;
    const xScale=template.joinWidth/assets.neckJoin.width, yScale=(template.collarBottom-joinTop)/110;
    join.drawImage(assets.neckJoin,center+(left-276)*xScale,joinTop+(top-178)*yScale,
      assets.neckJoin.width*xScale,assets.neckJoin.height*yScale);
  }
  const channels={head:join.getImageData(0,0,560,height),frontHair:join.createImageData(560,height),
    backHair:join.createImageData(560,height)};
  const visible=new Set(['head']);
  // Sample the portrait once in the final canvas. Cutting and resizing the sprites
  // separately leaves a translucent horizontal seam through otherwise opaque hair.
  for (let y=0;y<height;y++) {
    const v=Math.floor((y+.5-ty)/s);
    if (v<0 || v>=rgba.height) continue;
    for (let x=0;x<560;x++) {
      const i=4*(y*560+x), opacity=portrait[i+3];
      if (!opacity) continue;
      const u=Math.floor((x+.5-tx)/s);
      if (u<0 || u>=rgba.width) continue;
      const j=4*(v*rgba.width+u), label=parts.data[j];
      if (label===4) continue;
      const lock=(label===1 || label===0) && y>chinY;
      const id=lock ? (hair.data[j]>0?'frontHair':'backHair') : 'head';
      const dest=channels[id].data;
      if (id==='head' && dest[i+3]) {
        // Feather the observable neck into the underlying clavicles. The dark cut
        // edge of a photographed neckline must not become a second collar.
        const t=!placement && (label===2 || label===3) ? Math.max(0,Math.min(1,(y-chinY-2)/25)) : 0;
        const a=opacity/255*(1-t*t*(3-2*t)), b=dest[i+3]/255*(1-a);
        for (let k=0;k<3;k++) dest[i+k]=(portrait[i+k]*a+dest[i+k]*b)/(a+b);
        dest[i+3]=255*(a+b);
      } else dest.set(portrait.subarray(i,i+4),i);
      if (opacity>32) visible.add(id);
      if (label===1 && opacity>=250 && Math.abs(y-chinY)<5) {
        channels.backHair.data.set(portrait.subarray(i,i+4),i);
        visible.add('backHair');
      }
    }
  }
  const layers={};
  for (const id of visible) {
    const ctx=surface(560,1536);
    ctx.putImageData(channels[id],0,0);
    layers[id]=png(ctx);
  }
  return { layers,tone };
}

async function instepOverlay(templateId,tone) {
  const path=new URL('../../assets/wardrobe/tryon/'+templateId+'/mary-jane-insteps.webp',import.meta.url);
  const material=pixels(await readImage(path));
  for (let i=0;i<material.data.length;i+=4) {
    if (!material.data[i+3]) continue;
    const shade=material.data[i]/255*.96;
    for (let k=0;k<3;k++) material.data[i+k]=tone[k]*shade;
  }
  const ctx=surface(560,1536);
  ctx.putImageData(material,0,0);
  return png(ctx);
}

export async function composePersonalBody(head, templateId, donor) {
  if (!Object.hasOwn(bodyTemplates,templateId) || !head?.revision || head.landmarks?.length!==478) {
    throw new Error('请选择身体模板并确认个人卡通头层。');
  }
  const template=bodyTemplates[templateId], geometry=placeHead(head,template);
  const bitmaps={};
  try {
    for (const key of ['head','parts','frontHair']) bitmaps[key]=await createImageBitmap(head.assets[key]);
    const neckKey=templateId==='straight' && head.mapping.placements?.straight ? 'straightNeckJoin' : 'neckJoin';
    bitmaps.neckJoin=await createImageBitmap(head.assets[neckKey]);
    if (['head','parts','frontHair'].some(id=>bitmaps[id].width!==head.size[0] || bitmaps[id].height!==head.size[1])) {
      throw new Error('头层与遮罩尺寸不一致，请重新生成头层。');
    }
    const {layers,tone}=drawHeadLayers(head,bitmaps,geometry,template);
    for (const id of ['arms','ankles']) {
      const asset=donor.avatar.baseLayers.find(layer=>layer.id===id);
      layers[id]=skinLimb(await readImage(asset.image),id,template,tone);
    }
    const entries=await Promise.all(Object.entries(layers).map(async ([id,blob])=>[id,await blob]));
    geometry.crop=[...project(geometry.layerToCanvas,[0,0]),...project(geometry.layerToCanvas,head.size)];
    return {version:2,templateId,headRevision:head.revision,geometry,layers:Object.fromEntries(entries),
      maryJaneInsteps:await instepOverlay(templateId,tone)};
  } finally {
    Object.values(bitmaps).forEach(bitmap=>bitmap.close());
  }
}
