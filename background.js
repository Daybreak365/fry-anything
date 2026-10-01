'use strict';
// Edge-connected colour removal, with manual correction. No network requests.
function removeConnectedBackground(data,width,height,tolerance,point){
  if(point&&data[(point.y*width+point.x)*4+3]<=10)return 0;
  const mask=new Uint8Array(width*height),queue=new Int32Array(width*height),colors=[];
  const distance=(i,c)=>Math.sqrt(((data[i]-c[0])**2+(data[i+1]-c[1])**2+(data[i+2]-c[2])**2)/3);
  const colorAt=p=>[data[p*4],data[p*4+1],data[p*4+2]];
  let head=0,tail=0;
  if(point){colors.push(colorAt(point.y*width+point.x));}
  else{for(const p of [0,width-1,(height-1)*width,width*height-1])if(data[p*4+3]>10)colors.push(colorAt(p));}
  function enqueue(p){if(mask[p])return;const i=p*4;if(data[i+3]>10&&!colors.some(c=>distance(i,c)<=tolerance))return;mask[p]=1;queue[tail++]=p;}
  if(point)enqueue(point.y*width+point.x);
  else{for(let x=0;x<width;x++){enqueue(x);enqueue((height-1)*width+x);}for(let y=1;y<height-1;y++){enqueue(y*width);enqueue(y*width+width-1);}}
  while(head<tail){const p=queue[head++],x=p%width;if(x>0)enqueue(p-1);if(x<width-1)enqueue(p+1);if(p>=width)enqueue(p-width);if(p<width*(height-1))enqueue(p+width);}
  let changed=0;for(let p=0;p<mask.length;p++)if(mask[p]){if(data[p*4+3])changed++;data[p*4+3]=0;}
  return changed;
}
window.BackgroundEditor=(()=>{
  const $=id=>document.getElementById(id),dialog=$('bg-dialog'),canvas=$('bg-preview'),ctx=canvas.getContext('2d');
  const make=()=>document.createElement('canvas'),source=make(),edited=make(),marks=make();
  let history=[],mode='click',resolve=null,brushDown=false,lastPoint=null,showSource=false,worker=null,busy=false;
  const ec=edited.getContext('2d',{willReadFrequently:true}),mc=marks.getContext('2d',{willReadFrequently:true});
  function status(text){$('bg-status').textContent=text;}
  function result(){const c=make();c.width=source.width;c.height=source.height;const cx=c.getContext('2d');cx.drawImage(source,0,0);cx.globalCompositeOperation='destination-in';cx.filter='blur('+Number($('bg-feather').value)+'px)';cx.drawImage(edited,0,0);cx.filter='none';return c;}
  function render(){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(showSource||mode==='keep'||mode==='removeMark'?source:result(),0,0);if(mode==='keep'||mode==='removeMark'){ctx.globalAlpha=.55;ctx.drawImage(marks,0,0);ctx.globalAlpha=1;}}
  function pushHistory(){history.push({image:ec.getImageData(0,0,edited.width,edited.height),marks:mc.getImageData(0,0,marks.width,marks.height)});if(history.length>6)history.shift();$('bg-undo').disabled=false;}
  function setMode(value){mode=value;showSource=false;$('bg-before').setAttribute('aria-pressed','false');for(const [id,m] of [['bg-click','click'],['bg-brush','brush'],['bg-recover','recover'],['bg-keep','keep'],['bg-remove-mark','removeMark']])$(id).setAttribute('aria-pressed',String(value===m));$('bg-tolerance-label').hidden=value!=='click';$('bg-brush-label').hidden=value==='click';canvas.style.cursor=value==='click'?'pointer':'crosshair';render();}
  function setBusy(value){busy=value;for(const el of dialog.querySelectorAll('button,input'))if(!['bg-close','bg-cancel'].includes(el.id))el.disabled=value;$('bg-undo').disabled=value||history.length===0;}
  function erase(point){if(busy)return;pushHistory();const img=ec.getImageData(0,0,edited.width,edited.height),changed=removeConnectedBackground(img.data,edited.width,edited.height,Number($('bg-tolerance').value),point);ec.putImageData(img,0,0);setMode('click');status(changed?'배경을 지웠어요. 가장자리와 남겨진 부분을 확인하세요.':'허용 범위를 조절하거나 스마트 분리를 사용해보세요.');}
  function finish(apply){if(!resolve)return;const cb=resolve;resolve=null;brushDown=false;lastPoint=null;if(worker){worker.terminate();worker=null;}setBusy(false);const output=apply?result():null;dialog.close();history=[];cb(output);}
  function point(e){const r=canvas.getBoundingClientRect();return{x:Math.min(canvas.width-1,Math.max(0,Math.floor((e.clientX-r.left)*canvas.width/r.width))),y:Math.min(canvas.height-1,Math.max(0,Math.floor((e.clientY-r.top)*canvas.height/r.height)))};}
  function stroke(p){const line=Number($('bg-brush-size').value)*canvas.width/canvas.getBoundingClientRect().width,from=lastPoint||p;let target=mode==='keep'||mode==='removeMark'?mc:ec;target.save();target.lineWidth=line;target.lineCap='round';target.lineJoin='round';target.strokeStyle=mode==='keep'?'#20eb66':'#ff3434';if(mode==='brush')target.globalCompositeOperation='destination-out';
    if(mode==='recover'){const temp=make();temp.width=source.width;temp.height=source.height;const t=temp.getContext('2d');t.lineWidth=line;t.lineCap='round';t.beginPath();t.moveTo(from.x,from.y);t.lineTo(p.x+.01,p.y+.01);t.stroke();t.globalCompositeOperation='source-in';t.drawImage(source,0,0);target.drawImage(temp,0,0);}else{target.beginPath();target.moveTo(from.x,from.y);target.lineTo(p.x+.01,p.y+.01);target.stroke();}target.restore();lastPoint=p;render();}
  function smart(){if(busy)return;const w=Math.max(1,Math.round(source.width*Math.min(1,224/Math.max(source.width,source.height)))),h=Math.max(1,Math.round(source.height*w/source.width)),c=make();c.width=w;c.height=h;const sc=c.getContext('2d');sc.drawImage(source,0,0,w,h);const data=sc.getImageData(0,0,w,h).data;sc.clearRect(0,0,w,h);sc.imageSmoothingEnabled=false;sc.drawImage(marks,0,0,w,h);const rgba=sc.getImageData(0,0,w,h).data,labels=new Uint8Array(w*h);for(let i=0;i<labels.length;i++)if(rgba[i*4+3]>32)labels[i]=rgba[i*4+1]>rgba[i*4]?1:2;
    if(!labels.includes(1)){setMode('keep');status('남길 피사체 안쪽을 초록색으로 조금 칠해주세요. 여러 색이 있다면 각각 표시하면 더 좋아요.');return;}
    setBusy(true);status('피사체의 색과 경계를 따라 배경을 분리하고 있어요…');
    try{worker=new Worker('segment-worker.js');worker.onmessage=e=>{if(!resolve)return;worker.terminate();worker=null;setBusy(false);if(e.data.error){status(e.data.error);return;}pushHistory();const mask=make();mask.width=w;mask.height=h;const mx=mask.getContext('2d'),im=mx.createImageData(w,h);for(let i=0;i<w*h;i++){im.data[i*4]=im.data[i*4+1]=im.data[i*4+2]=255;im.data[i*4+3]=e.data.alpha[i];}mx.putImageData(im,0,0);ec.clearRect(0,0,edited.width,edited.height);ec.drawImage(source,0,0);ec.globalCompositeOperation='destination-in';ec.drawImage(mask,0,0,edited.width,edited.height);ec.globalCompositeOperation='source-over';setMode('click');status('분리했어요! 덜 지워진 곳은 빨간색, 사라진 재료는 초록색으로 추가 표시하고 다시 분리할 수 있어요.');};worker.onerror=()=>{worker?.terminate();worker=null;setBusy(false);status('스마트 분리를 실행하지 못했어요. 클릭 지우기나 지우개로 정리해주세요.');};worker.postMessage({data,marks:labels,width:w,height:h});}catch{setBusy(false);status('이 브라우저에서는 스마트 분리를 사용할 수 없어요. 클릭 지우기와 복구 붓은 사용할 수 있어요.');}}
  $('bg-auto').addEventListener('click',()=>erase(null));$('bg-smart').addEventListener('click',smart);
  for(const [id,m] of [['bg-click','click'],['bg-brush','brush'],['bg-recover','recover'],['bg-keep','keep'],['bg-remove-mark','removeMark']])$(id).addEventListener('click',()=>{setMode(m);if(m==='keep')status('남길 피사체의 여러 색을 초록색으로 표시하세요.');if(m==='removeMark')status('지울 배경의 여러 색을 빨간색으로 표시하세요.');});
  $('bg-clear-marks').addEventListener('click',()=>{pushHistory();mc.clearRect(0,0,marks.width,marks.height);render();status('초록색·빨간색 표시를 지웠어요.');});
  $('bg-tolerance').addEventListener('input',()=>{$('bg-tolerance-value').textContent=$('bg-tolerance').value;});$('bg-brush-size').addEventListener('input',()=>{$('bg-brush-value').textContent=$('bg-brush-size').value;});
  $('bg-feather').addEventListener('input',()=>{$('bg-feather-value').textContent=$('bg-feather').value+'px';render();});$('bg-before').addEventListener('click',()=>{showSource=!showSource;$('bg-before').setAttribute('aria-pressed',String(showSource));render();});
  $('bg-undo').addEventListener('click',()=>{const prev=history.pop();if(prev){ec.putImageData(prev.image,0,0);mc.putImageData(prev.marks,0,0);}$('bg-undo').disabled=history.length===0;render();status('한 단계 되돌렸어요.');});
  $('bg-restore').addEventListener('click',()=>{pushHistory();ec.clearRect(0,0,edited.width,edited.height);ec.drawImage(source,0,0);mc.clearRect(0,0,marks.width,marks.height);setMode('click');status('원본으로 돌아왔어요.');});
  $('bg-apply').addEventListener('click',()=>{const data=ec.getImageData(0,0,edited.width,edited.height).data;if(!data.some((v,i)=>i%4===3&&v>0)){status('이미지가 전부 지워졌어요. 되돌리기를 눌러 재료를 남겨주세요.');return;}finish(true);});
  for(const id of ['bg-cancel','bg-close'])$(id).addEventListener('click',()=>finish(false));dialog.addEventListener('cancel',e=>{e.preventDefault();finish(false);});
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0||busy)return;e.preventDefault();if(mode==='click'){erase(point(e));return;}pushHistory();brushDown=true;lastPoint=null;canvas.setPointerCapture(e.pointerId);stroke(point(e));});canvas.addEventListener('pointermove',e=>{if(brushDown&&!busy)stroke(point(e));});for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>{brushDown=false;lastPoint=null;});
  return{open(image,initial){if(resolve)finish(false);const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height,scale=Math.min(1,1024/Math.max(width,height));for(const c of [canvas,source,edited,marks]){c.width=Math.max(1,Math.round(width*scale));c.height=Math.max(1,Math.round(height*scale));}source.getContext('2d').drawImage(image,0,0,source.width,source.height);ec.drawImage(initial||source,0,0,edited.width,edited.height);history=[];setBusy(false);setMode('click');status('단색 배경은 자동 제거, 복잡한 사진은 초록색·빨간색 표시 후 스마트 분리를 사용하세요.');dialog.showModal();return new Promise(r=>{resolve=r;});},removeConnected:removeConnectedBackground};
})();
