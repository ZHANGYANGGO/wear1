import Phaser from "phaser";
import { HEIGHT, STEP, WIDTH, type Controls, type Snapshot } from "../shared/moving";
import { freightArt, mapArt, playersArt, sofaArt } from "./art";
import { session } from "./session";

// Fixed tick input and remote pose interpolation follow tutorial-phaser Part 4.
export class Part4Scene extends Phaser.Scene {
  private accumulated=0;
  private mapWidth=0;
  private map!:Phaser.Textures.CanvasTexture;
  private layer!: Phaser.Textures.CanvasTexture;
  private previous?: Snapshot;
  private viewedId="";
  constructor(private controls:()=>Controls,private hud:(s:Snapshot)=>void) {super("moving");}
  create(){
    this.map=this.textures.createCanvas("map",WIDTH,HEIGHT)!;
    this.add.image(0,0,"map").setOrigin(0);
    this.layer=this.textures.createCanvas("movers",WIDTH,HEIGHT)!;
    this.add.image(0,0,"movers").setOrigin(0);
  }
  update(_time:number,delta:number){
    this.accumulated+=Math.min(delta,120);
    while(this.accumulated>=STEP){session.tick(this.controls());this.accumulated-=STEP;}
    const f=session.frame;
    if(f.width!==this.mapWidth){this.mapWidth=f.width;mapArt(this.map.context,f.width);this.map.refresh();}
    const prev=this.previous;
    let display=f;
    if(session.room && prev && prev.round===f.round && session.id===this.viewedId){
      const t=1-Math.exp(-delta/38);
      const blend=(a:number,b:number)=>Phaser.Math.Linear(a,b,t);
      display={...f,sofa:{
        x:blend(prev.sofa.x,f.sofa.x), y:blend(prev.sofa.y,f.sofa.y),
        angle:prev.sofa.angle+Math.atan2(Math.sin(f.sofa.angle-prev.sofa.angle),Math.cos(f.sofa.angle-prev.sofa.angle))*t,
      },people:f.people.map(p=>{
        const a=prev.people.find(old=>old.id===p.id);
        return a?{...p,x:blend(a.x,p.x),y:blend(a.y,p.y)}:p;
      })};
      for(const item of ["box","cart","plant"] as const) {
        display[item]={...f[item],x:blend(prev[item].x,f[item].x),y:blend(prev[item].y,f[item].y)};
      }
    }
    this.previous=display;this.viewedId=session.id;
    const c=this.layer.context;c.clearRect(0,0,WIDTH,HEIGHT);
    freightArt(c,display);sofaArt(c,display,session.id);playersArt(c,display,session.id);
    if(session.run.weather==="rain"){
      c.strokeStyle="#80a7be";c.lineWidth=1.5;
      for(let i=0;i<52;i++){
        const x=(i*79+_time*.065)%WIDTH,y=392+(i*41+_time*.24)%170;
        c.beginPath();c.moveTo(x,y);c.lineTo(x-3,y+9);c.stroke();
      }
    }
    this.layer.refresh();this.hud(f);
  }
}
