import {anchors} from './template.mjs';

export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const poseIds=[33,133,263,362,168,6,127,356,10];
const fitIds=[1,4,5,195,2,98,327,33,133,263,362,70,300,61,291,0,17,152,172,397,234,454,93,323,136,365,10];
export const scoreIds=[1,4,152,172,397,136,365,58,288];
const gaussian=(a,b)=>Math.exp(-.5*(a*a+b*b));

// Coefficients are metres of symmetric local displacement, bounded in rest space.
function basis([x,y,z]) {
  const ax=Math.abs(x), sign=Math.sign(x);
  const gate=clamp((y-1.42)/.04,0,1)*clamp((1.655-y)/.035,0,1)*clamp((z+.005)/.085,0,1);
  const g=(cx,cy,rx,ry)=>gate*gaussian((ax-cx)/rx,(y-cy)/ry);
  return [[sign*g(.055,1.495,.030,.026),0,0],[sign*g(.060,1.546,.032,.043),0,0],
    [sign*g(.030,1.551,.021,.015),0,0],[0,g(.028,1.552,.045,.016),0],
    [0,g(0,1.465,.040,.017),0],[0,g(0,1.489,.031,.013),0],
    [0,g(0,1.521,.016,.014),0],[0,0,g(0,1.521,.017,.015)],
    [0,0,g(0,1.460,.035,.018)],[0,0,g(0,1.491,.031,.012)]];
}
export const neutralShape=()=>Array(10).fill(0);
export function facePoint(x,y,z,shape,jaw=0) {
  if(y<1.42||y>1.655||Math.abs(x)>.115) return [x,y,z];
  const b=basis([x,y,z]), p=[x,y,z];
  for(let i=0;i<b.length;i++) for(let j=0;j<3;j++) p[j]+=b[i][j]*((shape?.[i]??0)-(i===0?.007*jaw/100:0));
  return p;
}
// Weak perspective with independent yaw, pitch, roll, scale and image origin.
export function project([x,y,z],[yaw,pitch,roll,logScale,tx,ty]) {
  y-=1.54; z-=.10;
  const u=Math.cos(yaw)*x+Math.sin(yaw)*z, depth=-Math.sin(yaw)*x+Math.cos(yaw)*z;
  const v=Math.cos(pitch)*y-Math.sin(pitch)*depth, s=Math.exp(logScale);
  return [tx+s*(Math.cos(roll)*u-Math.sin(roll)*v),ty-s*(Math.sin(roll)*u+Math.cos(roll)*v)];
}
function solve(A,b) {
  const n=b.length;
  for(let k=0;k<n;k++) {
    let pivot=k;
    for(let i=k+1;i<n;i++) if(Math.abs(A[i][k])>Math.abs(A[pivot][k])) pivot=i;
    [A[k],A[pivot]]=[A[pivot],A[k]]; [b[k],b[pivot]]=[b[pivot],b[k]];
    const d=A[k][k]||1e-9;
    for(let j=k;j<n;j++) A[k][j]/=d;
    b[k]/=d;
    for(let i=0;i<n;i++) if(i!==k) {
      const f=A[i][k];for(let j=k;j<n;j++) A[i][j]-=f*A[k][j]; b[i]-=f*b[k];
    }
  }
  return b;
}
function step(params,residual,penalty) {
  const r=residual(params),n=params.length;
  const J=params.map((_,i)=>{const q=params.slice();q[i]+=.0001;const s=residual(q);return s.map((v,k)=>(v-r[k])/.0001);});
  const dot=(a,b)=>a.reduce((s,x,k)=>s+x*b[k],0);
  const A=J.map((a,i)=>J.map((b,j)=>dot(a,b)+(i===j?penalty:0)));
  return solve(A,J.map(a=>-dot(a,r)));
}
export function visible(id,yaw) {
  return Math.abs(yaw)<.55 || Math.abs(anchors[id][0])<.018 || anchors[id][0]*Math.sign(yaw)<0;
}
export function cameraFor(observation,shape=neutralShape()) {
  const p=observation.points;
  const init=Math.atan2(p[1][0]-(p[234][0]+p[454][0])/2,Math.max(.001,Math.abs(p[454][0]-p[234][0])*.27));
  let c=[init,0,0,Math.log(Math.max(.3,(p[152][1]-p[10][1])/.18)),p[168][0],p[168][1]];
  const ids=poseIds.filter(i=>visible(i,init));
  const residual=q=>ids.flatMap(i=>project(facePoint(...anchors[i],shape),q).map((v,j)=>(v-p[i][j])*(observation.weights?.[i]??1)));
  for(let k=0;k<12;k++){
    const d=step(c,residual,.0002);c=c.map((v,i)=>v+clamp(d[i],-.25,.25));
    c[0]=clamp(c[0],-1.57,1.57);c[1]=clamp(c[1],-.65,.65);
  }
  return c;
}
export function fitFace(front,side) {
  let shape=neutralShape();
  const views=side?[front,side]:[front];
  for(let k=0;k<5;k++) {
    const cameras=views.map(v=>cameraFor(v,shape));
    const residual=q=>views.flatMap((v,n)=>fitIds.filter(id=>visible(id,cameras[n][0])).flatMap(id=>{
      const expressionWeight=(v.expression>.25 && [0,17,61,291,152].includes(id))?.25:1;
      const weight=expressionWeight*(v.weights?.[id]??1);
      return project(facePoint(...anchors[id],q),cameras[n]).map((x,j)=>weight*clamp(x-v.points[id][j],-.035,.035));
    })).concat(q.map(x=>x*1.3));
    const d=step(shape,residual,.015);
    shape=shape.map((v,i)=>i>=7&&!side?0:clamp(v+clamp(d[i],-.005,.005),-.012,.012));
  }
  return shape;
}
export function heldOut(observation,shape,ids=scoreIds) {
  const cam=cameraFor(observation,shape);
  const width=Math.max(...observation.points.map(p=>p[0]))-Math.min(...observation.points.map(p=>p[0]));
  const points=ids.filter(i=>visible(i,cam[0])).map(id=>{
    const p=project(facePoint(...anchors[id],shape),cam);
    return {id,error:Math.hypot(...p.map((v,j)=>v-observation.points[id][j]))/width};
  });
  return {points,mean:points.reduce((s,p)=>s+p.error,0)/points.length};
}

