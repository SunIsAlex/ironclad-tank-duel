import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(root, 'src/models/portal-ai-model.json');
const INPUTS = 10, HIDDEN = 48, OUTPUTS = 2;
const weapons = [[1,1,1],[1,1,.8],[1,1.1,.6],[.85,1.25,.7],[1,.6,1],[1.35,.72,.3],[.9,1.05,.65]];
let seed = 0xb10e5a1;
function random(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const sigmoid=(v)=>1/(1+Math.exp(-v));

function features(d,h,wind,entryX,entryY,exitX,exitY,[speed,gravity,windMul]){
  return [clamp((d-150)/1000,0,1)*2-1,clamp(h/180,-1,1),clamp(wind/3,-1,1),
    clamp(entryX/1100,0,1)*2-1,clamp(entryY/320,-1,1),clamp(exitX/1300,0,1)*2-1,clamp(exitY/320,-1,1),
    clamp((speed-.8)/.6,0,1)*2-1,clamp((gravity-.7)/.6,0,1)*2-1,clamp((windMul-.3)/.7,0,1)*2-1];
}

function segmentHit(x1,y1,x2,y2,cx,cy,r){
  const dx=x2-x1,dy=y2-y1,fx=x1-cx,fy=y1-cy,a=dx*dx+dy*dy;
  if(a===0)return false;const b=2*(fx*dx+fy*dy),c=fx*fx+fy*fy-r*r,disc=b*b-4*a*c;
  if(disc<0)return false;const q=Math.sqrt(disc),t1=(-b-q)/(2*a),t2=(-b+q)/(2*a);
  return(t1>=0&&t1<=1)||(t2>=0&&t2<=1);
}

function evaluate(angle,power,d,h,wind,entryX,entryY,exitX,exitY,[speedMul,gravityMul,windMul]){
  const r=angle*Math.PI/180;let x=Math.cos(r)*30,y=Math.sin(r)*30;
  let vx=Math.cos(r)*power*speedMul,vy=Math.sin(r)*power*speedMul,teleported=false,nearest=Infinity;
  for(let time=0;time<6;time+=.05){const px=x,py=y;vx+=wind*55*windMul*.05;vy-=520*gravityMul*.05;x+=vx*.05;y+=vy*.05;
    if(!teleported&&segmentHit(px,py,x,y,entryX,entryY,29)){const speed=Math.hypot(vx,vy)||1;vx=-vx;vy=-vy;x=exitX+vx/speed*36;y=exitY+vy/speed*36;teleported=true;}
    if(teleported)nearest=Math.min(nearest,Math.hypot(x-d,y-h));if(x<-200||x>1500||y<-500)break;}
  return nearest;
}

function makeRows(count){const rows=[];for(let n=0;n<count;n++){
  const physics=weapons[n%weapons.length],d=480+random()*500,h=-100+random()*200,wind=-3+random()*6;
  const entryX=120+random()*Math.max(120,d*.68),entryY=70+random()*220;
  const exitX=d+80+random()*300,exitY=60+random()*230;
  const sight=Math.atan2(entryY,entryX)*180/Math.PI;let best={angle:clamp(sight+15,20,76),power:500,miss:Infinity};
  for(let angle=clamp(sight+3,18,76);angle<=clamp(sight+34,18,80);angle+=3)for(let power=150;power<=820;power+=10){
    const miss=evaluate(angle,power,d,h,wind,entryX,entryY,exitX,exitY,physics);if(miss<best.miss)best={angle,power,miss};}
  rows.push({x:features(d,h,wind,entryX,entryY,exitX,exitY,physics),y:[(best.angle-18)/62,(best.power-150)/670]});
  }return rows;}

function params(){const s1=Math.sqrt(2/(INPUTS+HIDDEN)),s2=Math.sqrt(2/(HIDDEN+OUTPUTS));return{
  w1:Array.from({length:HIDDEN*INPUTS},()=> (random()*2-1)*s1),b1:Array(HIDDEN).fill(0),
  w2:Array.from({length:OUTPUTS*HIDDEN},()=> (random()*2-1)*s2),b2:Array(OUTPUTS).fill(0)};}
function forward(p,x){const hidden=Array(HIDDEN);for(let h=0;h<HIDDEN;h++){let s=p.b1[h];for(let i=0;i<INPUTS;i++)s+=p.w1[h*INPUTS+i]*x[i];hidden[h]=Math.tanh(s);}const output=Array(2);for(let o=0;o<2;o++){let s=p.b2[o];for(let h=0;h<HIDDEN;h++)s+=p.w2[o*HIDDEN+h]*hidden[h];output[o]=sigmoid(s);}return{hidden,output};}
function train(p,rows,epochs=120){const names=['w1','b1','w2','b2'],m1=Object.fromEntries(names.map(n=>[n,p[n].map(()=>0)])),m2=Object.fromEntries(names.map(n=>[n,p[n].map(()=>0)]));let step=0;
  for(let e=0;e<epochs;e++)for(let n=0;n<rows.length;n++){const row=rows[Math.floor(random()*rows.length)],{hidden,output}=forward(p,row.x),d2=output.map((v,o)=>(v-row.y[o])*v*(1-v));
    const g={w1:Array(HIDDEN*INPUTS).fill(0),b1:Array(HIDDEN).fill(0),w2:Array(OUTPUTS*HIDDEN).fill(0),b2:[...d2]};
    for(let o=0;o<2;o++)for(let h=0;h<HIDDEN;h++)g.w2[o*HIDDEN+h]=d2[o]*hidden[h];for(let h=0;h<HIDDEN;h++){let down=0;for(let o=0;o<2;o++)down+=p.w2[o*HIDDEN+h]*d2[o];const d=down*(1-hidden[h]**2);g.b1[h]=d;for(let i=0;i<INPUTS;i++)g.w1[h*INPUTS+i]=d*row.x[i];}
    step++;for(const name of names)for(let i=0;i<p[name].length;i++){const q=clamp(g[name][i],-1,1);m1[name][i]=.9*m1[name][i]+.1*q;m2[name][i]=.999*m2[name][i]+.001*q*q;const m=m1[name][i]/(1-.9**step),v=m2[name][i]/(1-.999**step);p[name][i]-=.0022*m/(Math.sqrt(v)+1e-8);}}}
function validate(p,rows){let a=0,pw=0;for(const row of rows){const o=forward(p,row.x).output;a+=Math.abs(o[0]-row.y[0])*62;pw+=Math.abs(o[1]-row.y[1])*670;}return{angleMae:a/rows.length,powerMae:pw/rows.length};}

const training=makeRows(1400),validation=makeRows(180),p=params();train(p,training);const metrics=validate(p,validation);
const rounded=Object.fromEntries(Object.entries(p).map(([name,v])=>[name,v.map(x=>Number(x.toFixed(6)))]));
const model={version:1,architecture:{inputs:INPUTS,hidden:HIDDEN,outputs:OUTPUTS},trainedSamples:training.length,weaponProfiles:weapons.length,validation:{angleMae:Number(metrics.angleMae.toFixed(2)),powerMae:Number(metrics.powerMae.toFixed(2))},...rounded};
await mkdir(dirname(outputPath),{recursive:true});await writeFile(outputPath,`${JSON.stringify(model)}\n`,'utf8');
console.log(`Portal AI saved to ${outputPath}`);console.log(`Validation MAE: ${model.validation.angleMae}° / ${model.validation.powerMae} power`);
