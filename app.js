'use strict';
const $ = id => document.getElementById(id);
const arena=$('arena'), food=$('food'), foodCanvas=$('food-canvas'), hotzone=$('hotzone');
const ctx=foodCanvas.getContext('2d'), fx=$('particles').getContext('2d');
const original=document.createElement('canvas'), originalCtx=original.getContext('2d');
const renderer=window.FryRenderer;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
let seconds=0, dragging=false, frying=false, muted=false, name='감자', particles=[], last=performance.now(), lastPaint=0;
let offset={x:0,y:0}, position={x:.135,y:.4}, audio=null, holdActive=false, loadToken=0, currentLevel='', pointerId=null;
let uncutUpload=null;
let ingredientKind='potato',exploded=false,crumbled=false,blastAge=0,blastOrigin={x:0,y:0};

function initAudio(){
  try{
    if(!audio){
      const AudioCtor=window.AudioContext||window.webkitAudioContext;
      if(!AudioCtor)return;
      const ac=new AudioCtor(), buffer=ac.createBuffer(1,ac.sampleRate*3,ac.sampleRate), data=buffer.getChannelData(0);
      let prev=0;
      for(let i=0;i<data.length;i++){const white=Math.random()*2-1;prev=(prev+white*.09)/1.09;data[i]=white*.5+prev*2;}
      const source=ac.createBufferSource();source.buffer=buffer;source.loop=true;
      const filter=ac.createBiquadFilter();filter.type='highpass';filter.frequency.value=650;
      const gain=ac.createGain();gain.gain.value=0;source.connect(filter);filter.connect(gain);gain.connect(ac.destination);source.start();
      audio={ac,gain};
    }
    if(audio.ac.state==='suspended')audio.ac.resume().catch(()=>{});
  }catch{ $('sound-label').textContent='소리 사용 불가'; }
}
function silenceBlast(){if(audio?.blastGain){const now=audio.ac.currentTime;audio.blastGain.gain.cancelScheduledValues(now);audio.blastGain.gain.setTargetAtTime(0,now,.02);}}
function setSound(){if(!audio)return;const now=audio.ac.currentTime;audio.gain.gain.cancelScheduledValues(now);audio.gain.gain.setTargetAtTime(frying&&!muted?.17:0,now,.09);if(muted)silenceBlast();}
function explosionSound(){
  if(!audio||muted)return;
  try{const ac=audio.ac,now=ac.currentTime,gain=ac.createGain(),filter=ac.createBiquadFilter(),noise=ac.createBufferSource(),buffer=ac.createBuffer(1,Math.ceil(ac.sampleRate*.8),ac.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length);
    noise.buffer=buffer;filter.type='lowpass';filter.frequency.setValueAtTime(4000,now);filter.frequency.exponentialRampToValueAtTime(150,now+.7);gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.42,now+.018);gain.gain.exponentialRampToValueAtTime(.0001,now+.8);noise.connect(filter);filter.connect(gain);gain.connect(ac.destination);noise.start();noise.stop(now+.8);
    const bass=ac.createOscillator();bass.frequency.setValueAtTime(130,now);bass.frequency.exponentialRampToValueAtTime(35,now+.35);bass.connect(gain);bass.start();bass.stop(now+.4);audio.blastGain=gain;noise.onended=()=>{noise.disconnect();filter.disconnect();bass.disconnect();gain.disconnect();if(audio.blastGain===gain)audio.blastGain=null;};
  }catch{}
}
function explodeIce(){
  if(exploded||crumbled||ingredientKind!=='ice')return;
  exploded=true;stop();$('inspect').disabled=true;blastAge=0;const a=arena.getBoundingClientRect();blastOrigin={x:position.x*a.width,y:position.y*a.height};
  arena.classList.add('exploded');$('explosion-message').hidden=false;$('stage-hint').textContent='실험 종료! 다시 튀기기를 눌러보세요.';$('hold').disabled=true;food.setAttribute('aria-disabled','true');
  currentLevel='이스터에그 발견!';$('level-label').textContent=currentLevel;$('percent').textContent='펑!';$('seconds').textContent=seconds.toFixed(1).padStart(4,'0');
  particles=[];if(!reducedMotion)for(let i=0;i<120;i++){const angle=Math.random()*Math.PI*2,speed=90+Math.random()*350;particles.push({x:blastOrigin.x,y:blastOrigin.y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-90,life:.8+Math.random()*.8,age:0,size:2+Math.random()*7,steam:i%4===0,burst:true});}
  explosionSound();
}
function inOil(){
  const a=arena.getBoundingClientRect(), h=hotzone.getBoundingClientRect();
  const x=a.left+position.x*a.width,y=a.top+position.y*a.height;
  return x>=h.left&&x<=h.right&&y>=h.top&&y<=h.bottom;
}
function crumbleFood(){
  if(crumbled||exploded)return;crumbled=true;stop();paintFood();
  arena.classList.add('crumbled');$('crumble-message').hidden=false;$('inspect').disabled=true;$('hold').disabled=true;food.setAttribute('aria-disabled','true');
  currentLevel='바사삭… 검은 가루가 됐어요';$('level-label').textContent=currentLevel;$('percent').textContent='가루';$('seconds').textContent=seconds.toFixed(1).padStart(4,'0');$('stage-hint').textContent='과유불급! 다시 튀기기로 돌아가세요.';
  const a=arena.getBoundingClientRect(),r=foodCanvas.getBoundingClientRect(),pixels=ctx.getImageData(0,0,foodCanvas.width,foodCanvas.height).data;
  particles=[];
  if(!reducedMotion)for(let i=0;i<180;i++){let x=0,y=0,valid=false;for(let tries=0;tries<30;tries++){x=Math.floor(Math.random()*foodCanvas.width);y=Math.floor(Math.random()*foodCanvas.height);if(pixels[(y*foodCanvas.width+x)*4+3]>80){valid=true;break;}}if(!valid)continue;particles.push({charcoal:true,x:r.left-a.left+x/foodCanvas.width*r.width,y:r.top-a.top+y/foodCanvas.height*r.height,vx:(Math.random()-.5)*100,vy:-25+Math.random()*35,age:0,life:3.3+Math.random()*.8,size:1.8+Math.random()*4,angle:Math.random()*Math.PI,spin:(Math.random()-.5)*9,colour:['#080808','#15120f','#211a14','#0f0e0c'][i%4],settled:false,bounced:false});}
  crunchSound(.75,.4);
}
function setFrying(value){
  if(value&&(exploded||crumbled))return;
  if(frying===value)return;frying=value;
  arena.classList.toggle('frying',value);
  $('stage-hint').textContent=value?'좋아요, 지금 튀겨지고 있어요!':seconds>0?'꺼내면 멈춰요. 다시 넣으면 이어서 튀겨요.':'이미지를 잡고 기름 위로!';
  setSound();
}
function moveFood(){food.style.left=position.x*100+'%';food.style.top=position.y*100+'%';}
function putInOil(){const a=arena.getBoundingClientRect(),h=hotzone.getBoundingClientRect();position={x:(h.left+h.width/2-a.left)/a.width,y:(h.top+h.height/2-a.top)/a.height};moveFood();}
function stop(){dragging=false;holdActive=false;pointerId=null;arena.classList.remove('dragging');setFrying(false);}
function reset(){stop();if($('inspect-dialog').open)$('inspect-dialog').close();exploded=false;crumbled=false;blastAge=0;arena.classList.remove('exploded','crumbled');$('crumble-message').hidden=true;$('explosion-message').hidden=true;$('hold').disabled=false;food.setAttribute('aria-disabled','false');silenceBlast();seconds=0;position={x:.135,y:innerWidth<=760?.36:.4};moveFood();food.classList.remove('used');particles=[];currentLevel='';updateStatus();paintFood();$('stage-hint').textContent='이미지를 잡고 기름 위로!';}
function prepareImage(img,label){
  const scale=Math.min(1,640/Math.max(img.width,img.height));
  original.width=Math.max(1,Math.round(img.width*scale));original.height=Math.max(1,Math.round(img.height*scale));
  originalCtx.drawImage(img,0,0,original.width,original.height);
  renderer.setSource(original);
  name=label;food.setAttribute('aria-label',label+' 이미지. 기름 위로 드래그하거나 스페이스 키를 누르고 있으면 튀겨집니다.');reset();
}
function paintFood(){renderer.render(seconds,ctx,ingredientKind);}
function updateStatus(){
  const recipe=renderer.getRecipe(),ratio=seconds/recipe.targetSeconds,value=Math.min(100,ratio*65);
  const label=seconds<.5?'튀김옷 준비 완료':ratio<.4?'보글보글, 튀김옷이 부풀어요':ratio<.75?'황금빛으로 익는 중':ratio<1.5?'지금이 딱! 바삭하게 완성':ratio<1.9?'조금 진하게 튀겨졌어요':'앗, 까맣게 탔어요!';
  if(currentLevel!==label){$('level-label').textContent=label;currentLevel=label;}
  $('percent').textContent=Math.round(value)+'%';$('seconds').textContent=seconds.toFixed(1).padStart(4,'0');
  $('meter-fill').style.width=value+'%';$('meter-fill').style.background=ratio>=1.5?'#ffa25b':'var(--yellow)';
  document.querySelector('.meter').setAttribute('aria-valuenow',Math.round(value));
  $('inspect').disabled=seconds<.1||exploded||crumbled;
  $('recipe-summary').textContent=recipe.label+' '+recipe.thickness+'겹 · '+(ratio>=.75&&ratio<1.5?'지금 꺼내면 딱 좋아요!':'노릇해지면 꺼내보세요');
}
function sample(emoji,label){loadToken++;uncutUpload=null;ingredientKind=emoji==='🧊'?'ice':emoji==='🍤'?'shrimp':'potato';$('edit-bg').hidden=true;document.querySelectorAll('[data-sample]').forEach(b=>b.classList.toggle('selected',b.dataset.sample===emoji));const c=document.createElement('canvas');c.width=c.height=400;const cctx=c.getContext('2d');cctx.font='280px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';cctx.textAlign='center';cctx.textBaseline='middle';cctx.fillText(emoji,200,210);prepareImage(c,label);$('error').textContent='';}
async function loadFile(file){
  if(!file)return;
  if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type)){ $('error').textContent='PNG, JPG, WEBP, GIF 이미지를 선택해주세요.';return; }
  if(file.size>20*1024*1024){$('error').textContent='20MB 이하의 이미지를 선택해주세요.';return;}
  const token=++loadToken,url=URL.createObjectURL(file),img=new Image();stop();$('upload').disabled=true;$('error').textContent='';
  try{img.src=url;await img.decode();if(token!==loadToken)return;if(img.naturalWidth*img.naturalHeight>50000000)throw new Error('large');let input=img;if($('remove-bg').checked){input=await window.BackgroundEditor.open(img);if(!input||token!==loadToken)return;}const saved=document.createElement('canvas'),scale=Math.min(1,1024/Math.max(img.naturalWidth,img.naturalHeight));saved.width=Math.round(img.naturalWidth*scale);saved.height=Math.round(img.naturalHeight*scale);saved.getContext('2d').drawImage(img,0,0,saved.width,saved.height);uncutUpload=saved;ingredientKind='upload';prepareImage(input,file.name);$('edit-bg').hidden=false;document.querySelectorAll('[data-sample]').forEach(b=>b.classList.remove('selected'));}
  catch{if(token===loadToken)$('error').textContent='이 이미지를 열 수 없어요. 더 작은 이미지나 다른 파일을 선택해주세요.';}
  finally{URL.revokeObjectURL(url);$('upload').disabled=false;$('file').value='';}
}
$('upload').addEventListener('click',()=>$('file').click());$('file').addEventListener('change',e=>loadFile(e.target.files[0]));
$('edit-bg').addEventListener('click',async()=>{stop();const token=++loadToken,label=name;const result=await window.BackgroundEditor.open(uncutUpload||original,original);if(result&&token===loadToken)prepareImage(result,label);});
for(const type of ['dragenter','dragover'])$('upload').addEventListener(type,e=>{e.preventDefault();$('upload').classList.add('dragover');});
$('upload').addEventListener('dragleave',()=>$('upload').classList.remove('dragover'));
$('upload').addEventListener('drop',e=>{e.preventDefault();$('upload').classList.remove('dragover');loadFile(e.dataTransfer.files[0]);});
window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('drop',e=>e.preventDefault());
document.querySelectorAll('[data-sample]').forEach(b=>b.addEventListener('click',()=>sample(b.dataset.sample,b.dataset.name)));
$('sound').addEventListener('click',()=>{muted=!muted;initAudio();$('sound').setAttribute('aria-pressed',String(!muted));$('sound-label').textContent=muted?'소리 꺼짐':'소리 켜짐';$('sound-icon').textContent=muted?'◖×':'◖))';setSound();});
$('reset').addEventListener('click',reset);
function changeRecipe(){const type=document.querySelector('input[name="batter"]:checked').value,n=Number($('thickness').value);renderer.configure(type,n);reset();}
document.querySelectorAll('input[name="batter"]').forEach(r=>r.addEventListener('change',changeRecipe));
$('thickness').addEventListener('input',()=>{$('thickness-value').textContent=$('thickness').value+'겹';});$('thickness').addEventListener('change',changeRecipe);
let splitView=false,splitProgress=0,cutAnimation=0,cutRatio=.5,sectionMode='line';
let viewer3d=null,viewPitch=-.27,viewYaw=0,viewZoom=1,viewDrag=null;
function drawInspection(){try{if(!viewer3d)viewer3d=window.Fry3D.create($('inspect-canvas'));viewer3d.update(renderer.getModelData(seconds),splitProgress,cutRatio,sectionMode);}catch(error){$('cut-caption').textContent=error.message||'3D 화면을 준비하지 못했어요.';}}
function updateCamera(){viewer3d?.camera(viewPitch,viewYaw,viewZoom);}
function resetCamera(){viewPitch=-.27;viewYaw=0;viewZoom=1;$('inspect-zoom').value='1';$('zoom-value').textContent='1×';updateCamera();}
function crunchSound(duration=.36,volume=.32){
  initAudio();if(!audio||muted)return;
  try{const ac=audio.ac,now=ac.currentTime,gain=ac.createGain(),noise=ac.createBufferSource(),filter=ac.createBiquadFilter(),buffer=ac.createBuffer(1,Math.ceil(ac.sampleRate*duration),ac.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++){const t=i/ac.sampleRate,envelope=Math.exp(-t*(duration>.4?5:12))*(.35+.65*Math.max(0,Math.sin(t*150)));data[i]=(Math.random()*2-1)*envelope;}noise.buffer=buffer;filter.type='highpass';filter.frequency.value=1100;gain.gain.value=volume;noise.connect(filter);filter.connect(gain);gain.connect(ac.destination);noise.start(now);noise.stop(now+duration);audio.blastGain=gain;noise.onended=()=>{noise.disconnect();filter.disconnect();gain.disconnect();if(audio.blastGain===gain)audio.blastGain=null;};}catch{}
}
function openInspection(){if(exploded||crumbled||seconds<.1)return;stop();splitView=false;splitProgress=0;cutRatio=.5;$('cut-position').value='50';$('cut-position-value').textContent='50%';$('cut-position-control').hidden=true;$('cut').textContent='반으로 가르기';$('cut').setAttribute('aria-pressed','false');$('split-control').hidden=true;$('inspect-zoom').value='1';$('zoom-value').textContent='1×';$('inspect-canvas').style.width='100%';$('cut-caption').textContent='드래그해서 돌려보세요. 갈랐을 때만 내부가 보여요.';const r=renderer.getRecipe();$('inspect-meta').textContent=r.label+' '+r.thickness+'겹 · '+seconds.toFixed(1)+'초 · '+currentLevel;$('inspect-dialog').showModal();resetCamera();drawInspection();}
$('inspect').addEventListener('click',openInspection);
$('inspect-close').addEventListener('click',()=>$('inspect-dialog').close());$('inspect-dialog').addEventListener('close',()=>{cancelAnimationFrame(cutAnimation);silenceBlast();});
$('inspect-zoom').addEventListener('input',()=>{const zoom=Number($('inspect-zoom').value);$('zoom-value').textContent=zoom+'×';viewZoom=zoom;updateCamera();});
$('view-reset').addEventListener('click',resetCamera);
$('section-mode').addEventListener('change',()=>{sectionMode=$('section-mode').value==='image'?'image':'line';$('section-mode-help').textContent=sectionMode==='line'?'자르는 선 위의 색만 두께 방향으로 쭉 이어 보여요. 자르는 위치를 바꾸면 색도 달라져요.':'자르는 선 주변의 이미지 무늬를 단면의 두께에 펼쳐 보여요.';drawInspection();});
$('inspect-canvas').addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();viewDrag={id:e.pointerId,x:e.clientX,y:e.clientY};$('inspect-canvas').setPointerCapture(e.pointerId);});
$('inspect-canvas').addEventListener('pointermove',e=>{if(!viewDrag||viewDrag.id!==e.pointerId)return;viewYaw+=(e.clientX-viewDrag.x)*.009;viewPitch=Math.max(-1.2,Math.min(1.2,viewPitch+(e.clientY-viewDrag.y)*.009));viewDrag.x=e.clientX;viewDrag.y=e.clientY;updateCamera();});
for(const event of ['pointerup','pointercancel','lostpointercapture'])$('inspect-canvas').addEventListener(event,()=>{viewDrag=null;});
$('inspect-canvas').addEventListener('wheel',e=>{e.preventDefault();viewZoom=Math.max(1,Math.min(3,viewZoom-e.deltaY*.0015));$('inspect-zoom').value=String(viewZoom);$('zoom-value').textContent=viewZoom.toFixed(1)+'×';updateCamera();},{passive:false});
$('inspect-canvas').addEventListener('keydown',e=>{const step=.12;if(e.key==='ArrowLeft')viewYaw-=step;else if(e.key==='ArrowRight')viewYaw+=step;else if(e.key==='ArrowUp')viewPitch=Math.max(-1.2,viewPitch-step);else if(e.key==='ArrowDown')viewPitch=Math.min(1.2,viewPitch+step);else return;e.preventDefault();updateCamera();});
$('inspect-canvas').addEventListener('fry3derror',e=>{$('cut-caption').textContent=e.detail;});
new ResizeObserver(()=>{if($('inspect-dialog').open)viewer3d?.draw();}).observe($('inspect-canvas'));
$('cut').addEventListener('click',()=>{cancelAnimationFrame(cutAnimation);splitView=!splitView;$('cut').textContent=splitView?'다시 합치기':'반으로 가르기';$('cut').setAttribute('aria-pressed',String(splitView));$('split-control').hidden=!splitView;$('cut-position-control').hidden=!splitView;$('split-amount').value='100';$('cut-caption').textContent=splitView?'겉은 그대로 바삭하게. 조각을 돌려 잘린 면을 들여다보세요.':'드래그해서 돌려보세요. 갈랐을 때만 내부가 보여요.';if(splitView)crunchSound();const start=performance.now(),from=splitProgress,to=splitView?1:0;function animate(t){const p=reducedMotion?1:Math.min(1,(t-start)/450);splitProgress=from+(to-from)*(1-(1-p)**3);drawInspection();if(p<1&&$('inspect-dialog').open)cutAnimation=requestAnimationFrame(animate);}cutAnimation=requestAnimationFrame(animate);});
$('cut-position').addEventListener('input',()=>{cutRatio=Number($('cut-position').value)/100;$('cut-position-value').textContent=$('cut-position').value+'%';drawInspection();});
$('split-amount').addEventListener('input',()=>{cancelAnimationFrame(cutAnimation);splitProgress=Number($('split-amount').value)/100;drawInspection();});
food.addEventListener('pointerdown',e=>{
  if(e.button!==0||dragging||holdActive||exploded||crumbled)return;e.preventDefault();initAudio();dragging=true;pointerId=e.pointerId;food.setPointerCapture(e.pointerId);
  const a=arena.getBoundingClientRect();offset={x:e.clientX-(a.left+position.x*a.width),y:e.clientY-(a.top+position.y*a.height)};
  arena.classList.add('dragging');food.classList.add('used');setFrying(inOil());
});
food.addEventListener('pointermove',e=>{if(!dragging||e.pointerId!==pointerId)return;const a=arena.getBoundingClientRect();position={x:Math.min(.96,Math.max(.04,(e.clientX-a.left-offset.x)/a.width)),y:Math.min(.92,Math.max(.1,(e.clientY-a.top-offset.y)/a.height))};moveFood();setFrying(inOil());});
for(const type of ['pointerup','pointercancel','lostpointercapture'])food.addEventListener(type,stop);
function beginHold(){if(holdActive||exploded||crumbled)return;stop();initAudio();holdActive=true;putInOil();food.classList.add('used');arena.classList.add('dragging');setFrying(true);}
$('hold').addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();$('hold').setPointerCapture(e.pointerId);beginHold();});
for(const type of ['pointerup','pointercancel','lostpointercapture'])$('hold').addEventListener(type,stop);
for(const el of [food,$('hold')]){el.addEventListener('keydown',e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();beginHold();}});el.addEventListener('keyup',e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();stop();}});el.addEventListener('blur',stop);}
window.addEventListener('blur',stop);document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
window.addEventListener('keydown',e=>{if(e.key==='Escape')stop();});
function resize(){const r=arena.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);$('particles').width=r.width*dpr;$('particles').height=r.height*dpr;fx.setTransform(dpr,0,0,dpr,0,0);if(holdActive)putInOil();if(dragging)setFrying(inOil());}
new ResizeObserver(resize).observe(arena);
function frame(now){
  const dt=Math.min((now-last)/1000,.05);last=now;
  if(frying){seconds=Math.min(99.9,seconds+dt);if(ingredientKind==='ice'&&seconds>=1.1)explodeIce();else if(ingredientKind!=='ice'&&seconds>=renderer.getRecipe().targetSeconds*2.8)crumbleFood();else if(now-lastPaint>100){paintFood();updateStatus();lastPaint=now;}}
  if(exploded)blastAge+=dt;
  const a=arena.getBoundingClientRect(),h=hotzone.getBoundingClientRect();fx.clearRect(0,0,a.width,a.height);
  if(frying&&!reducedMotion){
    for(let i=0;i<4;i++){const angle=Math.random()*Math.PI*2,r=25+Math.random()*food.offsetWidth*.4;particles.push({x:position.x*a.width+Math.cos(angle)*r,y:position.y*a.height+Math.sin(angle)*r*.6,vx:(Math.random()-.5)*48,vy:-20-Math.random()*70,life:.35+Math.random()*.6,age:0,size:1+Math.random()*4,steam:Math.random()<.15});}
  }
  particles=particles.filter(p=>p.age<p.life);
  for(const p of particles){p.age+=dt;if(p.charcoal){if(!p.settled){p.vy+=620*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.angle+=p.spin*dt;const floor=a.height-8-p.size;if(p.y>=floor){p.y=floor;if(!p.bounced){p.vy=-p.vy*.2;p.vx*=.45;p.bounced=true;}else p.settled=true;}}fx.save();fx.translate(p.x,p.y);fx.rotate(p.angle);fx.globalAlpha=Math.min(1,Math.max(0,(p.life-p.age)/.9));fx.fillStyle=p.colour;fx.strokeStyle='#655446';fx.lineWidth=.65;fx.beginPath();fx.moveTo(-p.size,-p.size*.55);fx.lineTo(p.size*.65,-p.size);fx.lineTo(p.size,p.size*.65);fx.lineTo(-p.size*.6,p.size);fx.closePath();fx.fill();fx.stroke();fx.restore();continue;}if(p.burst&&!p.steam)p.vy+=260*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;const opacity=Math.max(0,1-p.age/p.life);fx.beginPath();fx.arc(p.x,p.y,p.steam?p.size+p.age*(p.burst?55:12):p.size,0,Math.PI*2);fx.fillStyle=p.steam?`rgba(244,235,202,${opacity*(p.burst?.23:.11)})`:p.burst?`rgba(255,183,76,${opacity*.9})`:`rgba(255,207,81,${opacity*.6})`;fx.fill();if(!p.steam){fx.strokeStyle=`rgba(255,246,185,${opacity*.85})`;fx.lineWidth=1;fx.stroke();}}
  if(exploded&&blastAge<.7&&!reducedMotion){fx.beginPath();fx.arc(blastOrigin.x,blastOrigin.y,blastAge*350,0,Math.PI*2);fx.strokeStyle=`rgba(255,213,111,${(1-blastAge/.7)*.75})`;fx.lineWidth=8*(1-blastAge/.7);fx.stroke();}
  if(frying&&!reducedMotion){fx.save();fx.beginPath();fx.ellipse(position.x*a.width,position.y*a.height,food.offsetWidth*.55,food.offsetWidth*.32,0,0,Math.PI*2);fx.strokeStyle=`rgba(255,229,128,${.12+Math.sin(now/100)*.05})`;fx.lineWidth=5;fx.stroke();fx.restore();}
  requestAnimationFrame(frame);
}
renderer.onReady(()=>{paintFood();if($('inspect-dialog').open)drawInspection();});
sample('🥔','감자');resize();requestAnimationFrame(frame);
if(document.fonts?.ready)document.fonts.ready.then(()=>{if(name==='감자'&&seconds===0&&loadToken===1)sample('🥔','감자');});

if(document.modelContext?.registerTool){
  const lifecycle=new AbortController();
  const tools=[
    {name:'get_frying_state',description:'Read the currently selected ingredient and frying progress.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({ingredient:name,seconds:Number(seconds.toFixed(1)),frying,muted,exploded,crumbled,stage:currentLevel})},
    {name:'reset_frying',description:'Reset the current image to its original appearance and return it to the ingredient spot.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false},execute:()=>{reset();return{reset:true,seconds:0};}},
    {name:'select_sample_ingredient',description:'Replace the current image with a sample ingredient and reset frying progress.',inputSchema:{type:'object',properties:{ingredient:{type:'string',enum:['potato','shrimp','ice']}},required:['ingredient'],additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{const samples={potato:['🥔','감자'],shrimp:['🍤','새우'],ice:['🧊','얼음']};if(!input||!Object.hasOwn(samples,input.ingredient))throw new Error('Unknown ingredient');sample(...samples[input.ingredient]);return{ingredient:name,seconds:0};}}
  ];
  for(const tool of tools){try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
