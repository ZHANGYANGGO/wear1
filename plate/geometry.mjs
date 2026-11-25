// Coordinates are in tiles, with integer coordinates at tile centres.
export const radius=.21;
const eps=1e-7;
export const edgeKey=e=>[e.x,e.y,e.side].join(",");
export function doorCells(e){
  return [[e.x,e.y],[e.x+Number(e.side==="right"),e.y+Number(e.side==="down")]];
}
function tile(x,y,hx=.5,hy=.5){return {l:x-hx,r:x+hx,t:y-hy,b:y+hy};}
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
function edgeBox(e){
  return e.side==="right"?tile(e.x+.5,e.y,0,.5):tile(e.x,e.y+.5,.5,0);
}
function inside(x,y,b,r=0){
  return x>b.l-r+eps && x<b.r+r-eps && y>b.t-r+eps && y<b.b+r-eps;
}
// Clip a segment to a box. Closed wall endpoints also seal a diagonal crack.
function intersects(x,y,tx,ty,b,pad=0){
  let lo=0,hi=1;
  for(const [a,d,min,max] of [[x,tx-x,b.l-pad,b.r+pad],[y,ty-y,b.t-pad,b.b+pad]]){
    if(Math.abs(d)<eps){if(a<min || a>max)return false;continue;}
    const t1=(min-a)/d,t2=(max-a)/d;
    lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));
    if(lo>hi+eps)return false;
  }
  return hi>eps && lo<1-eps;
}
const cache=new WeakMap();
export function geometry(s,map,book){
  const previous=cache.get(s);
  if(previous && previous.version===s.layoutVersion && previous.map===map)return previous;
  const solid=[],opaque=[],faces=new Map(),doors={};
  for(const f of s.fixtures){
    const rack=book.tools[f.kind].action==="plates",vertical=f.dir%2===1;
    const b=rack?tile(f.x,f.y,vertical ? .30 : .5,vertical ? .5 : .30):tile(f.x,f.y);
    b.id=f.id;faces.set(f.id,b);solid.push(b);opaque.push(b);
  }
  for(const [x,y] of [...map.walls,...(map.planters || [])]){
    const b=tile(x,y);solid.push(b);opaque.push(b);
  }
  for(const e of map.edges || []){
    const b=edgeBox(e);
    if(e.kind==="door"){
      const cells=doorCells(e),window=cells.some(([x,y])=>s.fixtures.some(f=>f.x===x && f.y===y));
      doors[edgeKey(e)]={window};
      if(!window)continue;
    }
    solid.push(b);if(e.kind==="wall")opaque.push(b);
  }
  const nearby=(b,x,y,tx,ty,r)=>Math.min(x,tx)<=b.r+r && Math.max(x,tx)>=b.l-r && Math.min(y,ty)<=b.b+r && Math.max(y,ty)>=b.t-r;
  const result={version:s.layoutVersion,map,doors,faces,
    fits(x,y){
      return x>=-.5+radius && x<=map.width-.5-radius && y>=-.5+radius && y<=map.height-.5-radius &&
        !solid.some(b=>inside(x,y,b,radius));
    },
    clear(x,y,tx,ty){
      return this.fits(tx,ty) && !solid.some(b=>nearby(b,x,y,tx,ty,radius) && intersects(x,y,tx,ty,b,radius-eps));
    },
    reach(p,f,limit=.8){
      const b=faces.get(f.id);if(!b)return Infinity;
      const x=clamp(p.x,b.l,b.r),y=clamp(p.y,b.t,b.b);
      const distance=Math.hypot(p.x-x,p.y-y);
      if(distance>limit)return Infinity;
      const visible=(tx,ty)=>{
        // Look just inside the surface so a wall flush with the counter still blocks hands.
        const ex=tx+(tx-p.x)*.0001,ey=ty+(ty-p.y)*.0001;
        return !opaque.some(o=>o!==b && nearby(o,p.x,p.y,ex,ey,0) && intersects(p.x,p.y,ex,ey,o));
      };
      if(visible(x,y))return distance;
      if((x!==b.l && x!==b.r) || (y!==b.t && y!==b.b))return Infinity;
      // At a corner, either exposed face can be used. Two sealed faces block both rays.
      for(const [tx,ty] of [[x+(x===b.l ? .025 : -.025),y],[x,y+(y===b.t ? .025 : -.025)]]){
        const d=Math.hypot(tx-p.x,ty-p.y);
        if(d<=limit && visible(tx,ty))return d;
      }
      return Infinity;
    }
  };
  cache.set(s,result);return result;
}

// A quarter-tile navigation mesh permits offset approaches and thin aisles.
// Search only when the chef is given a new destination or the route is blocked.
export function findRoute(shape,start,goal,finish,avoid=()=>false,estimate){
  const [sx,sy]=start,[gx,gy]=goal;
  if(finish(sx,sy))return [];
  const q=[],parents=new Map(),cost=new Map();
  const key=(x,y)=>x+","+y;
  function offer(x,y,d,parent){
    const k=key(x,y);if(d>=(cost.get(k)??Infinity)-eps || avoid(x,y))return;
    const priority=d+(estimate?estimate(x,y):Math.hypot(x-gx,y-gy));
    let lo=0,hi=q.length;
    while(lo<hi){const m=(lo+hi)>>1;if(q[m].priority>priority)lo=m+1;else hi=m;}
    q.splice(lo,0,{x,y,d,priority,k});parents.set(k,parent);cost.set(k,d);
  }
  for(const x of new Set([Math.floor(sx*4)/4,Math.ceil(sx*4)/4]))
    for(const y of new Set([Math.floor(sy*4)/4,Math.ceil(sy*4)/4]))
      if(shape.clear(sx,sy,x,y))offer(x,y,Math.hypot(x-sx,y-sy),null);
  const deltas=[[0,-1],[-1,0],[1,0],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
  while(q.length){
    const n=q.pop();if(n.d!==cost.get(n.k))continue;
    if(finish(n.x,n.y)){
      const route=[];for(let k=n.k;k!==null;k=parents.get(k))route.unshift(k.split(",").map(Number));
      if(route[0][0]===sx && route[0][1]===sy)route.shift();
      return route;
    }
    for(const [dx,dy] of deltas){
      const x=n.x+dx/4,y=n.y+dy/4,d=n.d+Math.hypot(dx,dy)/4;
      if(d<(cost.get(key(x,y))??Infinity)-eps && shape.clear(n.x,n.y,x,y))offer(x,y,d,n.k);
    }
  }
  return null;
}
