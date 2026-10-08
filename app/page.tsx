/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import JSZip from "jszip";
import { useEffect, useMemo, useRef, useState } from "react";

type Simulation =
  | "PROVIA"
  | "VELVIA"
  | "ASTIA"
  | "CLASSIC_CHROME"
  | "PRO_NEG_HI"
  | "PRO_NEG_STD"
  | "CLASSIC_NEG"
  | "NOSTALGIC_NEG"
  | "ETERNA"
  | "ETERNA_BLEACH"
  | "ACROS"
  | "MONO"
  | "SEPIA"
  | "REALA_ACE";

type SensorGeneration = "AUTO" | "X_TRANS_V" | "X_TRANS_IV" | "X_TRANS_III" | "X_TRANS_II" | "X_TRANS_I" | "BAYER" | "GFX";

type Settings = {
  simulation: Simulation;
  dr: 100 | 200 | 400;
  wb: string;
  wbKelvin: number;
  wbR: number;
  wbB: number;
  exposure: number;
  contrast: number;
  highlight: number;
  shadow: number;
  color: number;
  sharpness: number;
  nr: number;
  clarity: number;
  grain: number;
  grainSize: number;
  chrome: number;
  chromeBlue: number;
  saturation: number;
  hue: number;
  outputScale: 1 | 2;
  aiUpscale: boolean;
  cameraProfile: "AUTO" | "X_TRANS_IV" | "X_TRANS_V";
  sensor: SensorGeneration;
};

type Photo = { id: number; name: string; file: File; raw: true };
type Source = { width: number; height: number; data: Uint8ClampedArray };

const DEFAULT: Settings = {
  simulation: "PROVIA", dr: 100, wb: "Auto", wbKelvin: 5600, wbR: 0, wbB: 0,
  exposure: 0, contrast: 0, highlight: 0, shadow: 0, color: 0,
  sharpness: 0, nr: 0, clarity: 0, grain: 0, grainSize: 0,
  chrome: 0, chromeBlue: 0, saturation: 0, hue: 0, outputScale: 1, aiUpscale: false, cameraProfile: "AUTO", sensor: "AUTO"
};

const RECIPES: Record<string, Partial<Settings>> = {
  "Kodachrome 64 - X-Trans V": { simulation:"CLASSIC_CHROME", dr:200, highlight:0, shadow:1, color:2, nr:-4, sharpness:1, clarity:3, grain:1, grainSize:1, chrome:2, chromeBlue:0, wb:"Daylight", wbR:2, wbB:-5, sensor:"X_TRANS_V" },
  "Pacific Blues - X-Trans V": { simulation:"CLASSIC_NEG", dr:400, highlight:-2, shadow:3, color:4, nr:-4, sharpness:-2, clarity:-3, grain:3, grainSize:2, chrome:2, chromeBlue:1, wb:"Kelvin", wbKelvin:5800, wbR:1, wbB:-3, sensor:"X_TRANS_V" },
  "McCurry Kodachrome - X-Trans IV": { simulation:"CLASSIC_CHROME", dr:100, highlight:0, shadow:0, color:2, nr:-2, sharpness:-2, clarity:0, grain:1, grainSize:1, chrome:2, chromeBlue:0, wb:"Kelvin", wbKelvin:5900, wbR:-1, wbB:4, sensor:"X_TRANS_IV" },
  "Classic Chrome - Daylight": { simulation:"CLASSIC_CHROME", dr:200, highlight:0, shadow:0, color:2, nr:-4, sharpness:1, clarity:3, grain:1, grainSize:1, chrome:2, chromeBlue:1, wb:"Daylight", wbR:2, wbB:-5 },
  "Classic Chrome Street": { simulation:"CLASSIC_CHROME", dr:200, wb:"Daylight", wbR:-1, wbB:1, highlight:-1, shadow:1, color:-2, chrome:2, chromeBlue:1, saturation:-1, grain:1, grainSize:1, clarity:1 },
  "Nostalgic Print": { simulation:"NOSTALGIC_NEG", dr:400, wb:"Daylight", wbR:2, wbB:-2, highlight:-1, shadow:2, color:1, chrome:2, chromeBlue:-1, saturation:-1, grain:2, grainSize:1 },
  "Eterna Cinema": { simulation:"ETERNA", dr:400, wb:"Auto", highlight:-2, shadow:1, color:-2, contrast:-2, saturation:-2, clarity:-1, grain:1 },
  "Acros Grain": { simulation:"ACROS", dr:200, wb:"Auto", contrast:2, shadow:1, sharpness:2, nr:-2, grain:3, grainSize:2 }
};

const RECIPE_SENSORS: Record<string, SensorGeneration[]> = {
  "Kodachrome 64 - X-Trans V":["X_TRANS_V","GFX"],
  "Pacific Blues - X-Trans V":["X_TRANS_V","GFX"],
  "McCurry Kodachrome - X-Trans IV":["X_TRANS_IV","X_TRANS_V"],
  "Classic Chrome - Daylight":["X_TRANS_IV","X_TRANS_V"],
  "Classic Chrome Street":["X_TRANS_IV","X_TRANS_V"],
  "Nostalgic Print":["X_TRANS_IV","X_TRANS_V"],
  "Eterna Cinema":["X_TRANS_IV","X_TRANS_V"],
  "Acros Grain":["X_TRANS_III","X_TRANS_IV","X_TRANS_V"]
};

const SENSOR_OPTIONS: Array<[SensorGeneration,string]> = [["AUTO","Automatisch"],["X_TRANS_V","X-Trans V (X100VI, X-T5, X-H2)"],["X_TRANS_IV","X-Trans IV (X100V, X-T4, X-Pro3)"],["X_TRANS_III","X-Trans III (X100F, X-T2)"],["X_TRANS_II","X-Trans II (X100S, X-T1)"],["X_TRANS_I","X-Trans I (X-Pro1, X-E1)"],["BAYER","Bayer"],["GFX","GFX"]];

const WB: Record<string,[number,number]> = {
  Auto:[1,1], Daylight:[1.05,.97], Shade:[1.11,.94], Cloudy:[1.07,.96],
  "Incandescent":[.88,1.14], "Fluorescent 1":[.96,1.06], "Fluorescent 2":[.93,1.08], Underwater:[.93,1.12]
};

function kelvinMultipliers(kelvin:number):[number,number]{
  const t=Math.max(2000,Math.min(10000,kelvin))/100;
  let r:number,g:number,b:number;
  if(t<=66){r=255;g=99.47*Math.log(t)-161.12;b=t<=19?0:138.52*Math.log(t-10)-305.04}
  else {r=329.7*Math.pow(t-60,-.1332);g=288.12*Math.pow(t-60,-.0755);b=255}
  g=Math.max(1,Math.min(255,g));r=Math.max(1,Math.min(255,r));b=Math.max(1,Math.min(255,b));
  return [r/g,b/g];
}

function clamp(v:number,a=0,b=255){return v<a?a:v>b?b:v}
function srgbToLinear(v:number){v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)}
function linearToSrgb(v:number){v=Math.max(0,v);return 255*(v<=.0031308?v*12.92:1.055*Math.pow(v,1/2.4)-.055)}
function rgbHsl(r:number,g:number,b:number){
  r/=255;g/=255;b/=255; const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
  let h=0,s=0,l=(max+min)/2;
  if(d){s=l>.5?d/(2-max-min):d/(max+min);switch(max){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;default:h=(r-g)/d+4}h/=6}
  return [h,s,l];
}
function hue2rgb(p:number,q:number,t:number){if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p}
function hslRgb(h:number,s:number,l:number){
  let r,g,b;if(!s)return [l*255,l*255,l*255];const q=l<.5?l*(1+s):l+s-l*s,p=2*l-q;
  r=hue2rgb(p,q,h+1/3);g=hue2rgb(p,q,h);b=hue2rgb(p,q,h-1/3);return [r*255,g*255,b*255]
}
function curve(v:number, amount:number){const x=v/255;const k=1+amount;const y=.5+Math.sign(x-.5)*Math.pow(Math.abs(x-.5)*2,1/(Math.max(.05,k)))/2;return clamp(y*255)}
function hash(n:number){const x=Math.sin(n*12.9898+78.233)*43758.5453;return x-Math.floor(x)}

function filmLook(r:number,g:number,b:number,s:Settings){
  let [h,sa,l]=rgbHsl(r,g,b);
  switch(s.simulation){
    case "VELVIA": sa*=1.28; l=.5+(l-.5)*1.16; break;
    case "ASTIA": sa*=1.08; l=.5+(l-.5)*.90; break;
    case "CLASSIC_CHROME": sa*=.82; l=.5+(l-.5)*1.12; if(l<.45){r*=.95;g*=.98;b*=1.02}else{r*=1.02;g*=1.0;b*=.96};break;
    case "PRO_NEG_HI": sa*=.98;l=.5+(l-.5)*1.08;break;
    case "PRO_NEG_STD": sa*=.94;l=.5+(l-.5)*.90;break;
    case "CLASSIC_NEG": sa*=1.08;l=.5+(l-.5)*1.16;h+=(-.01*(1-l));break;
    case "NOSTALGIC_NEG": sa*=.96;l=.5+(l-.5)*1.10;if(l>.52){r*=1.05;g*=1.01;b*=.94}else{r*=.96;g*=.98;b*=1.04};break;
    case "ETERNA": sa*=.78;l=.5+(l-.5)*.82;break;
    case "ETERNA_BLEACH": sa*=.55;l=.5+(l-.5)*1.28;r*=.99;g*=1.01;b*=1.03;break;
    case "REALA_ACE": sa*=.98;l=.5+(l-.5)*1.10;break;
    case "ACROS":
    case "MONO": {const y=(r*.2126+g*.7152+b*.0722);const k=s.simulation==="ACROS"?1.05:1;r=g=b=clamp(curve(y,k-.98));sa=0;break}
    case "SEPIA": {const y=(r*.299+g*.587+b*.114);r=y*1.08;g=y*.98;b=y*.84;sa=0;break}
    default: break;
  }
  if(s.simulation!=="ACROS"&&s.simulation!=="MONO"&&s.simulation!=="SEPIA"){
    h=(h+s.hue/360+1)%1;sa=Math.max(0,Math.min(1,sa*(1+s.saturation*.08+s.color*.045)));
    [r,g,b]=hslRgb(h,sa,Math.max(0,Math.min(1,l)));
    if(s.simulation==="CLASSIC_CHROME") { r*=1.02; b*=.96; }
    if(s.simulation==="NOSTALGIC_NEG") { r*=1.05; b*=.94; }
    if(s.simulation==="ETERNA_BLEACH") { g*=1.01; b*=1.03; }
  }
  return [r,g,b];
}

function processPixels(src:Source,s:Settings,seed=1):Source{
  const out=new Uint8ClampedArray(src.data.length), w=src.width,h=src.height;
  const [wr,wb]=s.wb==="Kelvin"?kelvinMultipliers(s.wbKelvin):(WB[s.wb]||[1,1]);
  const exposure=Math.pow(2,s.exposure);
  const drCompress=s.dr===400?.72:s.dr===200?.86:1;
  // The 40 MP X-Trans V profile needs less pixel-level sharpening and denoising than the 26 MP profile.
  const sensorDetail=s.sensor==="X_TRANS_V"?.82:s.sensor==="X_TRANS_IV"?1.08:1;
  const nr=Math.max(0,s.nr)*.12*sensorDetail, sharp=Math.max(0,s.sharpness)*.055*sensorDetail;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4;
    let r=srgbToLinear(src.data[i]),g=srgbToLinear(src.data[i+1]),b=srgbToLinear(src.data[i+2]);
    r*=exposure*wr*(1+s.wbR*.018);g*=exposure;b*=exposure*wb*(1+s.wbB*.018);
    r=linearToSrgb(r);g=linearToSrgb(g);b=linearToSrgb(b);
    const lum=.2126*r+.7152*g+.0722*b;
    const hi=Math.max(0,(lum-150)/105), lo=Math.max(0,(105-lum)/105);
    const dr=1-drCompress*hi*.24;
    r*=dr;g*=dr;b*=dr;
    // Positive Fujifilm shadow steps make shadows denser; positive highlights harden highlights.
    const sh=-s.shadow*.20*lo, hl=s.highlight*.20*hi;
    r+=sh*24+hl*18;g+=sh*24+hl*18;b+=sh*24+hl*18;
    const ca=1+s.contrast*.075+s.clarity*.035;
    r=(r-128)*ca+128;g=(g-128)*ca+128;b=(b-128)*ca+128;
    [r,g,b]=filmLook(clamp(r),clamp(g),clamp(b),s);
    const chroma=s.chrome*.018, blue=s.chromeBlue*.024;
    if(r>g*1.08){r*=1+chroma;g*=1-chroma*.35}
    if(b>r*1.12){b*=1+blue;g*=1-blue*.2}
    if(nr>0){
      let ar=0,ag=0,ab=0,count=0;
      for(let ny=Math.max(0,y-1);ny<=Math.min(h-1,y+1);ny++)for(let nx=Math.max(0,x-1);nx<=Math.min(w-1,x+1);nx++){
        const ni=(ny*w+nx)*4;ar+=src.data[ni];ag+=src.data[ni+1];ab+=src.data[ni+2];count++;
      }
      r=r*(1-nr)+(ar/count)*nr;g=g*(1-nr)+(ag/count)*nr;b=b*(1-nr)+(ab/count)*nr;
    }
    if(sharp>0){
      const lx=((y*w+Math.max(0,x-1))*4), rx=((y*w+Math.min(w-1,x+1))*4);
      r+=((src.data[i]*2-src.data[lx]-src.data[rx])/255)*255*sharp;
      g+=((src.data[i+1]*2-src.data[lx+1]-src.data[rx+1])/255)*255*sharp;
      b+=((src.data[i+2]*2-src.data[lx+2]-src.data[rx+2])/255)*255*sharp;
    }
    if(s.grain){
      const n=(hash(i+seed*9973)-.5)*s.grain*(s.grainSize===2?13:8);
      r+=n;g+=n;b+=n;
    }
    out[i]=clamp(r);out[i+1]=clamp(g);out[i+2]=clamp(b);out[i+3]=src.data[i+3]||255;
  }
  return {width:w,height:h,data:out};
}

async function decodeStandard(file:File,maxDim?:number):Promise<Source>{
  const bmp=await createImageBitmap(file);
  const scale=maxDim?Math.min(1,maxDim/Math.max(bmp.width,bmp.height)):1;
  const w=Math.max(1,Math.round(bmp.width*scale)),h=Math.max(1,Math.round(bmp.height*scale));
  const c=document.createElement("canvas");c.width=w;c.height=h;const ctx=c.getContext("2d",{willReadFrequently:true})!;
  ctx.drawImage(bmp,0,0,w,h);bmp.close();const d=ctx.getImageData(0,0,w,h);return {width:w,height:h,data:new Uint8ClampedArray(d.data)}
}

async function decodeRaw(file:File,maxDim?:number):Promise<Source>{
  const mod:any=await import("libraw-wasm"); const LibRaw=mod.default||mod;
  const raw=new LibRaw(); const bytes=new Uint8Array(await file.arrayBuffer());
  // Fuji's special sensor rotation can be misread by some RAF files. Keep the decoded frame intact.
  // Previews deliberately use LibRaw's half-size decode and faster interpolation.
  // Exports call this function without maxDim and therefore retain full-quality processing.
  const previewMode=Boolean(maxDim);
  await raw.open(bytes,{useCameraWb:true,useCameraMatrix:1,outputColor:1,outputBps:8,useFujiRotate:0,userQual:previewMode?1:3,halfSize:previewMode,noAutoBright:false});
  const meta=await raw.metadata(false); const result:any=await raw.imageData();
  const data:any=result?.data??result;
  const width=Number(result?.width||result?.cols||meta?.width||meta?.imageWidth||meta?.sizes?.width);
  const height=Number(result?.height||result?.rows||meta?.height||meta?.imageHeight||meta?.sizes?.height);
  if(!width||!height||!data) throw new Error("LibRaw lieferte keine verwertbaren Bilddimensionen.");
  const src=new Uint8ClampedArray(width*height*4);
  const channels=Number(result?.colors)||Math.max(3,Math.floor(data.length/(width*height)));
  for(let i=0,j=0;i<width*height;i++,j+=channels){src[i*4]=data[j];src[i*4+1]=data[j+1];src[i*4+2]=data[j+2];src[i*4+3]=255}
  raw.dispose?.();
  if(maxDim&&Math.max(width,height)>maxDim){
    const scale=maxDim/Math.max(width,height),w=Math.round(width*scale),h=Math.round(height*scale);
    // Draw the complete decoded frame at native size first, then scale it down.
    // Writing the full ImageData into an already-small canvas crops the image.
    const full=document.createElement("canvas");full.width=width;full.height=height;
    full.getContext("2d",{willReadFrequently:true})!.putImageData(new ImageData(src,width,height),0,0);
    const preview=document.createElement("canvas");preview.width=w;preview.height=h;
    const ctx=preview.getContext("2d",{willReadFrequently:true})!;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
    ctx.drawImage(full,0,0,w,h);const d=ctx.getImageData(0,0,w,h);return {width:w,height:h,data:new Uint8ClampedArray(d.data)}
  }
  return {width,height,data:src};
}

async function sourceFor(photo:Photo,maxDim?:number):Promise<Source>{
  return decodeRaw(photo.file,maxDim);
}
function putCanvas(canvas:HTMLCanvasElement,src:Source){
  canvas.width=src.width;canvas.height=src.height;canvas.getContext("2d")!.putImageData(new ImageData(src.data,src.width,src.height),0,0)
}
function scaledCanvas(src:Source,scale:1|2){
  const base=document.createElement("canvas");putCanvas(base,src);
  if(scale===1)return base;
  const output=document.createElement("canvas");output.width=src.width*scale;output.height=src.height*scale;
  const ctx=output.getContext("2d")!;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
  ctx.drawImage(base,0,0,output.width,output.height);return output;
}

let aiSession: Promise<any> | null = null;
let ortRuntime: Promise<any> | null = null;
const publicAsset=(path:string)=>`${process.env.NEXT_PUBLIC_BASE_PATH||""}${path}`;
function getOrt(){
  if(!ortRuntime) ortRuntime=new Promise((resolve,reject)=>{
    const existing=(window as any).ort;if(existing){resolve(existing);return}
    const script=document.createElement("script");script.src=publicAsset("/ort/ort.wasm.min.js");script.async=true;
    script.onload=()=>resolve((window as any).ort);script.onerror=()=>reject(new Error("ONNX Runtime konnte nicht geladen werden."));document.head.appendChild(script);
  });
  return ortRuntime;
}
async function getAiSession(){
  if(!aiSession) aiSession=(async()=>{
    const ort:any=await getOrt();
    return ort.InferenceSession.create(publicAsset("/models/realesrgan-x4plus.onnx"),{executionProviders:["wasm"]});
  })();
  return aiSession;
}
function resizedSource(src:Source,maxSide:number):Source{
  if(Math.max(src.width,src.height)<=maxSide)return src;
  const scale=maxSide/Math.max(src.width,src.height), w=Math.round(src.width*scale),h=Math.round(src.height*scale);
  const input=document.createElement("canvas");putCanvas(input,src);const output=document.createElement("canvas");output.width=w;output.height=h;
  const ctx=output.getContext("2d",{willReadFrequently:true})!;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";ctx.drawImage(input,0,0,w,h);
  return {width:w,height:h,data:new Uint8ClampedArray(ctx.getImageData(0,0,w,h).data)};
}
async function aiUpscaleSource(src:Source,onProgress:(done:number,total:number)=>void,maxSide=1024):Promise<Source>{
  // Real-ESRGAN creates a 4× raster. The caller sets a safe input limit for preview or export.
  const input=resizedSource(src,maxSide), tile=128, pad=8, core=tile-pad*2, scale=4;
  const outW=input.width*scale,outH=input.height*scale,out=new Uint8ClampedArray(outW*outH*4);
  const session=await getAiSession(); const tiles=Math.ceil(input.width/core)*Math.ceil(input.height/core);let done=0;
  for(let y=0;y<input.height;y+=core)for(let x=0;x<input.width;x+=core){
    const tensorData=new Float32Array(3*tile*tile);
    for(let ty=0;ty<tile;ty++)for(let tx=0;tx<tile;tx++){
      const sx=Math.min(input.width-1,Math.max(0,x+tx-pad)),sy=Math.min(input.height-1,Math.max(0,y+ty-pad)),si=(sy*input.width+sx)*4,ti=ty*tile+tx;
      tensorData[ti]=input.data[si]/255;tensorData[tile*tile+ti]=input.data[si+1]/255;tensorData[tile*tile*2+ti]=input.data[si+2]/255;
    }
    const ort:any=await getOrt();const feeds:any={data:new ort.Tensor("float32",tensorData,[1,3,tile,tile])};
    const result:any=await session.run(feeds), prediction=result[Object.keys(result)[0]], pixels:Float32Array=prediction.data;
    const copyW=Math.min(core,input.width-x),copyH=Math.min(core,input.height-y);
    for(let ty=0;ty<copyH*scale;ty++)for(let tx=0;tx<copyW*scale;tx++){
      const sourceIndex=(ty+pad*scale)*tile*scale+(tx+pad*scale),targetIndex=((y*scale+ty)*outW+x*scale+tx)*4;
      out[targetIndex]=clamp(pixels[sourceIndex]*255);out[targetIndex+1]=clamp(pixels[tile*scale*tile*scale+sourceIndex]*255);out[targetIndex+2]=clamp(pixels[tile*scale*tile*scale*2+sourceIndex]*255);out[targetIndex+3]=255;
    }
    done++;onProgress(done,tiles);
  }
  return {width:outW,height:outH,data:out};
}

export default function Home(){
  const [view,setView]=useState<"home"|"lab">("home");
  const [photos,setPhotos]=useState<Photo[]>([]);
  const [active,setActive]=useState(0);
  const [settings,setSettings]=useState<Record<number,Settings>>({});
  const [scope,setScope]=useState<"one"|"all">("one");
  const [previewMode,setPreviewMode]=useState<"original"|"edited">("edited");
  const [dragging,setDragging]=useState(false);
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState("Bereit");
  const [previewUrl,setPreviewUrl]=useState<string | null>(null);
  const [previewSize,setPreviewSize]=useState({width:0,height:0});
  const [lens,setLens]=useState<{x:number;y:number;bgX:number;bgY:number;bgW:number;bgH:number}|null>(null);
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const previewFrameRef=useRef<HTMLDivElement>(null);
  const cache=useRef<Map<string,Source>>(new Map());
  const previewRun=useRef(0);
  const current=photos[active];
  const currentSettings=settings[current?.id]||DEFAULT;

  useEffect(()=>{
    if(!current)return;
    const timer=window.setTimeout(()=>renderPreview(current,currentSettings),currentSettings.aiUpscale?220:0);
    return()=>window.clearTimeout(timer);
  },[current?.id,currentSettings,photos.length,previewMode]);

  async function renderPreview(photo:Photo,s:Settings){
    const run=++previewRun.current;
    const key=photo.id+":preview";
    setBusy(true);setStatus("Pixel-Engine rendert Vorschau …");
    try{
      let src=cache.current.get(key);if(!src){src=await sourceFor(photo,1200);cache.current.set(key,src)}
      let out=previewMode==="original"?src:processPixels(src,s,photo.id);
      if(previewMode==="edited"&&s.aiUpscale)out=await aiUpscaleSource(out,(done,total)=>{if(run===previewRun.current)setStatus(`KI-Vorschau berechnet: Kachel ${done}/${total}`)},512);
      if(run!==previewRun.current)return;
      if(canvasRef.current){putCanvas(canvasRef.current,out);setPreviewUrl(canvasRef.current.toDataURL("image/jpeg",.92));setPreviewSize({width:out.width,height:out.height});}
      setStatus(`${photo.raw?"RAF / LibRaw":"Bild"} · ${previewMode==="original"?"RAW-Basis":"Bearbeitete Vorschau"} · ${out.width}×${out.height}`);
    }catch(e:any){if(run===previewRun.current)setStatus("Fehler: "+(e?.message||String(e)))}finally{if(run===previewRun.current)setBusy(false)}
  }

  function update(patch:Partial<Settings>){
    setSettings(prev=>{
      if(!current) return prev;
      const next={...prev};const base=next[current.id]||DEFAULT;
      if(scope==="one")next[current.id]={...base,...patch};
      else photos.forEach(p=>{next[p.id]={...(next[p.id]||DEFAULT),...patch}});
      return next;
    });
  }
  function recipe(name:string){update(RECIPES[name]||{})}
  function reset(){update(DEFAULT)}
  function individualRecipe(){update({...DEFAULT,sensor:currentSettings.sensor})}
  function moveLens(event:React.MouseEvent<HTMLDivElement>){
    const frame=previewFrameRef.current;if(!frame||!previewUrl||!previewSize.width)return;
    const rect=frame.getBoundingClientRect(), x=event.clientX-rect.left,y=event.clientY-rect.top;
    const scale=Math.min(rect.width/previewSize.width,rect.height/previewSize.height),width=previewSize.width*scale,height=previewSize.height*scale,left=(rect.width-width)/2,top=(rect.height-height)/2;
    if(x<left||x>left+width||y<top||y>top+height){setLens(null);return}
    const zoom=2.5,lensRadius=62;setLens({x,y,bgX:(x-left)*zoom-lensRadius,bgY:(y-top)*zoom-lensRadius,bgW:width*zoom,bgH:height*zoom});
  }
  async function addFiles(list:FileList|null){
    if(!list)return;
    const incoming=Array.from(list), arr=incoming.filter(f=>/\.raf$/i.test(f.name));
    const rejected=incoming.length-arr.length, base=Date.now();
    const next=arr.map((file,i)=>({id:base+i,name:file.name,file,raw:true as const}));
    if(next.length){setPhotos(p=>[...p,...next]);setActive(photos.length);setView("lab")}
    setStatus(rejected ? `${next.length} RAF-Datei(en) hinzugefügt. ${rejected} Datei(en) übersprungen: nur Fujifilm RAF.` : `${next.length} RAF-Datei(en) hinzugefügt`);
  }
  async function exportZip(){
    if(!photos.length)return;setBusy(true);setStatus("Exportiere echte Pixel …");
    try{
      const zip=new JSZip();
      for(let i=0;i<photos.length;i++){
        const p=photos[i];setStatus(`Export ${i+1}/${photos.length}: ${p.name}`);
        const key=p.id+":full";let src=cache.current.get(key);if(!src){src=await sourceFor(p);cache.current.set(key,src)}
        const pictureSettings=settings[p.id]||DEFAULT;
        let out=processPixels(src,pictureSettings,p.id);
        if(pictureSettings.aiUpscale){setStatus(`KI-Super-Resolution ${i+1}/${photos.length}: Modell lädt …`);out=await aiUpscaleSource(out,(done,total)=>setStatus(`KI-Super-Resolution ${i+1}/${photos.length}: Kachel ${done}/${total}`))}
        const c=scaledCanvas(out,pictureSettings.aiUpscale?1:pictureSettings.outputScale);
        const blob=await new Promise<Blob|null>(r=>c.toBlob(r,"image/jpeg",.94));
        if(blob)zip.file(p.name.replace(/\.[^.]+$/,"")+"_fuji.jpg",blob);
      }
      const blob=await zip.generateAsync({type:"blob"});
      const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="fuji-recipe-lab-export.zip";a.click();URL.revokeObjectURL(a.href);
      setStatus("Export fertig");
    }catch(e:any){setStatus("Exportfehler: "+(e?.message||String(e)))}finally{setBusy(false)}
  }

  const paramControls=useMemo(()=>[
    ["exposure","Belichtung",-4,4,.1],["contrast","Kontrast",-4,4,1],["highlight","Lichter",-4,4,1],["shadow","Schatten",-4,4,1],
    ["color","Farbe",-4,4,1],["saturation","Sättigung",-4,4,1],["hue","Farbton",-30,30,1],["clarity","Klarheit",-4,4,1],
    ["sharpness","Schärfe",-4,4,1],["nr","Rauschreduzierung",-4,4,1],["grain","Körnung",0,5,1],["grainSize","Körnungsgröße",0,2,1],
    ["chrome","Color Chrome",0,4,1],["chromeBlue","Color Chrome FX Blue",0,4,1]
  ] as const,[]);
  const visibleRecipes=Object.keys(RECIPES).filter(name=>currentSettings.sensor==="AUTO"||RECIPE_SENSORS[name]?.includes(currentSettings.sensor));

  if(view==="home") return <main className="landing">
    <nav className="landing-nav"><button className="wordmark" onClick={()=>setView("home")}>FUJI RECIPE LAB</button><button className="text-button" onClick={()=>setView("lab")}>Labor öffnen</button></nav>
    <section className="hero">
      <div className="hero-copy"><p className="eyebrow">Fujifilm RAW Entwicklung</p><h1>Dein Bild. Dein Rezept.</h1><p>Entwickle Fujifilm RAF-Dateien im Browser mit Filmsimulationen und nachvollziehbaren Kamera-Parametern.</p><div className="hero-actions"><button className="btn primary large" onClick={()=>document.getElementById("hero-files")?.click()}>RAF auswählen</button><button className="btn large" onClick={()=>setView("lab")}>Labor ansehen</button></div><input id="hero-files" hidden multiple type="file" accept=".raf" onChange={e=>addFiles(e.target.files)}/></div>
      <div className="hero-visual" aria-hidden="true"><div className="hero-image"></div><div className="film-label">CLASSIC CHROME<br/><span>RAW TO RECIPE</span></div></div>
    </section>
    <section className="landing-features"><article><strong>RAF-only</strong><span>Keine JPEGs, keine Mischformate. Das Labor beginnt mit deinen RAW-Daten.</span></article><article><strong>Filmsimulationen</strong><span>Von Provia bis Acros, direkt in der Pixel-Engine angewendet.</span></article><article><strong>Eigene Kontrolle</strong><span>Weißabgleich, Tonwerte, Farbe, Körnung und Schärfe bleiben editierbar.</span></article></section>
  </main>;

  return <div className="app">
    <header className="top"><div className="brand">FUJI RECIPE LAB<small>v3 · pixel color engine</small></div>
      <div className="top-actions"><button className="btn home-button" onClick={()=>setView("home")}>Startseite</button><button className="btn" onClick={()=>document.getElementById("files")?.click()}>{photos.length?"Weitere Dateien hinzufügen":"RAF-Dateien auswählen"}</button><button className="btn primary" disabled={!photos.length||busy} onClick={exportZip}>ZIP exportieren</button></div>
    </header>
    <input id="files" hidden multiple type="file" accept=".raf" onChange={e=>addFiles(e.target.files)}/>
    <main className="workspace">
      <aside className="panel"><div className="panel-inner">
        <div className="section"><h3>Fujifilm RAW</h3>{photos.length>0&&<div className="uploaded-raws">{photos.map((photo,index)=><button key={photo.id} className={`uploaded-raw ${index===active?"active":""}`} onClick={()=>setActive(index)}><span>RAF</span><strong>{photo.name}</strong></button>)}</div>}<label className={`drop ${dragging?"dragging":""}`} onDragEnter={event=>{event.preventDefault();setDragging(true)}} onDragOver={event=>event.preventDefault()} onDragLeave={()=>setDragging(false)} onDrop={event=>{event.preventDefault();setDragging(false);addFiles(event.dataTransfer.files)}}><strong>{photos.length?"Weitere Dateien hinzufügen":"RAF-Dateien auswählen"}</strong><span className="muted">RAF-Dateien hier ablegen oder <b>Dateien auswählen</b></span><input hidden multiple type="file" accept=".raf" onChange={e=>addFiles(e.target.files)}/></label></div>
        {current&&<div className="section"><h3>Sensor</h3><select className="select" value={currentSettings.sensor} onChange={e=>update({sensor:e.target.value as SensorGeneration})}>{SENSOR_OPTIONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><span className="muted">Recipes werden auf kompatible Sensor-Generationen gefiltert.</span></div>}
        <div className="section"><h3>Film Simulation</h3>
          <select className="select" value={currentSettings.simulation} onChange={e=>update({simulation:e.target.value as Simulation})}>
            <option value="PROVIA">PROVIA / Standard</option><option value="VELVIA">Velvia / Vivid</option><option value="ASTIA">ASTIA / Soft</option><option value="CLASSIC_CHROME">Classic Chrome</option><option value="PRO_NEG_HI">PRO Neg. Hi</option><option value="PRO_NEG_STD">PRO Neg. Std</option><option value="CLASSIC_NEG">Classic Neg.</option><option value="NOSTALGIC_NEG">Nostalgic Neg.</option><option value="ETERNA">ETERNA / Cinema</option><option value="ETERNA_BLEACH">ETERNA Bleach Bypass</option><option value="ACROS">ACROS</option><option value="MONO">Monochrome</option><option value="REALA_ACE">REALA ACE</option><option value="SEPIA">Sepia</option>
          </select>
        </div>
        <div className="section"><h3>Bereich</h3><div className="seg"><button className={scope==="one"?"on":""} onClick={()=>setScope("one")}>Dieses Bild</button><button className={scope==="all"?"on":""} onClick={()=>setScope("all")}>Alle Bilder</button></div></div>
        <div className="section"><h3>Recipes</h3><div className="recipes"><button className="recipe individual-recipe" onClick={individualRecipe}><strong>Individuell</strong><span>Neutrale Standardwerte ohne Recipe anwenden</span></button>{visibleRecipes.map(n=><button className="recipe" key={n} onClick={()=>recipe(n)}><strong>{n}</strong><span>auf {scope==="one"?"dieses":"alle"} Bild(er) anwenden</span></button>)}{!visibleRecipes.length&&<span className="muted">Für diesen Sensor ist noch kein Recipe hinterlegt.</span>}</div></div>
        <div className={current?"ok":"warning"}>{current?"RAF erkannt: LibRaw decodiert die RAW-Daten direkt im Browser.":"Noch keine RAF-Datei geladen."}</div>
        <div className="footer-note">Die Parameter werden auf die dekodierten RAW-Pixel angewendet und beim Export in das JPEG übernommen.</div>
      </div></aside>
      <section className="stage">
        <div className="stagebar">
          <div className="nav"><button className="btn" disabled={!photos.length} onClick={()=>setActive(a=>Math.max(0,a-1))}>←</button><button className="btn" disabled={!photos.length} onClick={()=>setActive(a=>Math.min(photos.length-1,a+1))}>→</button></div>
          <div className="name">{current?.name||"Keine Datei"} {current&&<span className="pill">RAF</span>}</div>
          <div className="stage-actions"><div className="seg"><button className={previewMode==="original"?"on":""} onClick={()=>setPreviewMode("original")}>Original</button><button className={previewMode==="edited"?"on":""} onClick={()=>setPreviewMode("edited")}>Bearbeitet</button></div></div>
        </div>
        <div className="preview-wrap"><div ref={previewFrameRef} className="preview-frame" onMouseMove={moveLens} onMouseLeave={()=>setLens(null)}>
          {!current&&<div className="empty">Noch keine RAF-Datei geladen.<br/><button className="btn" onClick={()=>document.getElementById("files")?.click()}>RAF auswählen</button></div>}
          <canvas ref={canvasRef} className="preview-buffer" />
          {previewUrl&&<img className="processed-preview" src={previewUrl} alt="Bearbeitete RAF-Vorschau" />}
          {lens&&previewUrl&&<div className="zoom-lens" aria-hidden="true" style={{left:lens.x,top:lens.y,backgroundImage:`url(${previewUrl})`,backgroundSize:`${lens.bgW}px ${lens.bgH}px`,backgroundPosition:`-${lens.bgX}px -${lens.bgY}px`}}/>}
          {busy&&current&&<div className="loading">Pixel werden berechnet …</div>}
        </div></div>
        <div className="status">{status}</div>
      </section>
      <aside className="panel right"><div className="panel-inner">
        {photos.length>0&&<div className="section"><h3>Filmstrip</h3><div className="gallery">{photos.map((p,i)=><button className={"thumb "+(i===active?"active":"")} key={p.id} onClick={()=>setActive(i)}><span>{p.name}</span></button>)}</div></div>}
        <div className="section"><h3>RAW / Kamera</h3>
          <div className="control"><div className="control-row"><label>Dynamic Range</label><span className="value">{currentSettings.dr}%</span></div><div className="seg"><button className={currentSettings.dr===100?"on":""} onClick={()=>update({dr:100})}>100</button><button className={currentSettings.dr===200?"on":""} onClick={()=>update({dr:200})}>200</button><button className={currentSettings.dr===400?"on":""} onClick={()=>update({dr:400})}>400</button></div></div>
          <div className="control wb-control"><div className="control-row"><label>Weißabgleich</label><span className="value">R {currentSettings.wbR > 0 ? "+" : ""}{currentSettings.wbR} / B {currentSettings.wbB > 0 ? "+" : ""}{currentSettings.wbB}</span></div><select className="select" value={currentSettings.wb} onChange={e=>update({wb:e.target.value})}>{Object.keys(WB).map(x=><option key={x}>{x}</option>)}<option value="Kelvin">Kelvin</option></select>{currentSettings.wb==="Kelvin"&&<div className="kelvin-row"><input className="range" type="range" min="2000" max="10000" step="100" value={currentSettings.wbKelvin} onChange={e=>update({wbKelvin:Number(e.target.value)})}/><input className="kelvin-input" type="number" min="2000" max="10000" step="100" value={currentSettings.wbKelvin} onChange={e=>update({wbKelvin:Number(e.target.value)})}/><span>K</span></div>}<div className="wb-grid-wrap"><div className="wb-axis"><span>B</span><span>A</span></div><div className="wb-grid" aria-label="Weißabgleich Verschiebung">{Array.from({length:361},(_,index)=>{const r=index%19-9,b=9-Math.floor(index/19),active=r===currentSettings.wbR&&b===currentSettings.wbB;return <button key={`${r}:${b}`} type="button" title={`Rot ${r}, Blau ${b}`} aria-label={`Rot ${r}, Blau ${b}`} className={`wb-cell ${active?"active":""} ${r===0&&b===0?"origin":""}`} onClick={()=>update({wbR:r,wbB:b})}/>})}</div><div className="wb-axis horizontal"><span>C</span><span>R</span></div></div></div>
        </div>
        <div className="section"><h3>Feintuning</h3>{paramControls.map(([key,label,min,max,step])=><div className="control" key={key}><div className="control-row"><label>{label}</label><span className="value">{String((currentSettings as any)[key])}</span></div><input className="range" type="range" min={min} max={max} step={step} value={(currentSettings as any)[key]} onChange={e=>update({[key]:Number(e.target.value)} as Partial<Settings>)}/></div>)}<div className="control"><div className="control-row"><label>Export-Auflösung</label></div><select className="select" value={currentSettings.outputScale} onChange={e=>update({outputScale:Number(e.target.value) as 1|2})}><option value="1">Originalgröße</option><option value="2">2× exportieren</option></select><span className="muted">2× vergrößert Pixel beim JPEG-Export. Es rekonstruiert keine neuen Sensordetails.</span></div><div className="control"><div className="control-row"><label htmlFor="ai-upscale">KI-Super-Resolution</label><input id="ai-upscale" type="checkbox" checked={currentSettings.aiUpscale} onChange={e=>update({aiUpscale:e.target.checked})}/></div><span className="muted">Wirkt live in der Vorschau. Die Vorschau nutzt 512 px Eingabe, der Export bis zu 1.024 px für bessere Qualität.</span></div></div>
        <button className="btn" style={{width:"100%"}} onClick={reset}>Aktuelles zurücksetzen</button>
      </div></aside>
    </main>
  </div>
}
