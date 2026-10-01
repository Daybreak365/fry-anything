'use strict';
// Actual closed triangle meshes, perspective projection, depth testing and lit materials.
window.Fry3D=(()=>{
  const vertexShader=`
    attribute vec3 aPosition; attribute vec3 aNormal; attribute vec2 aUV;
    attribute vec3 aCut; uniform mat4 uModel; uniform mat4 uProjection;
    varying vec3 vNormal; varying vec3 vWorld; varying vec2 vUV; varying vec3 vCut;
    void main(){vec4 p=uModel*vec4(aPosition,1.0);vWorld=p.xyz;vNormal=mat3(uModel)*aNormal;vUV=aUV;vCut=aCut;p.z-=6.6;gl_Position=uProjection*p;}
  `;
  const fragmentShader=`
    precision mediump float;
    uniform sampler2D uCrust; uniform sampler2D uFilling; uniform vec2 uTexel;
    uniform float uCutU; uniform float uRim; uniform float uSectionMode;
    varying vec3 vNormal; varying vec3 vWorld; varying vec2 vUV; varying vec3 vCut;
    float lum(vec3 c){return dot(c,vec3(.299,.587,.114));}
    void main(){
      bool cut=vCut.x>.5;
      vec2 crustUV=vUV;
      vec3 crust=texture2D(uCrust,crustUV).rgb;
      float inner=cut?(1.0-smoothstep(.73,.88,abs(vCut.y)))*smoothstep(uRim*.65,uRim,vCut.z):0.0;
      // Line mode extrudes one source column through the entire cut depth.
      vec2 fillingUV=uSectionMode<.5?vec2(uCutU,vUV.y):vUV;
      vec4 filling=texture2D(uFilling,fillingUV);if(filling.a<.2)filling=texture2D(uFilling,vec2(uCutU,vUV.y));
      vec3 colour=mix(crust,filling.rgb,inner*step(.05,filling.a));
      vec3 n=normalize(vNormal);
      float dx=lum(texture2D(uCrust,crustUV+vec2(uTexel.x*2.,0.)).rgb)-lum(texture2D(uCrust,crustUV-vec2(uTexel.x*2.,0.)).rgb);
      float dy=lum(texture2D(uCrust,crustUV+vec2(0.,uTexel.y*2.)).rgb)-lum(texture2D(uCrust,crustUV-vec2(0.,uTexel.y*2.)).rgb);
      vec3 tangent=normalize(abs(n.z)>.7?vec3(1.,0.,0.):cross(vec3(0.,0.,1.),n));
      vec3 bitangent=normalize(cross(n,tangent));n=normalize(n+(tangent*dx+bitangent*dy)*.48*(1.0-inner*.8));
      vec3 key=normalize(vec3(-.55,.8,1.2)),fill=normalize(vec3(.9,.15,.65)),back=normalize(vec3(0.,1.,-.7));
      float diffuse=max(0.,dot(n,key)),soft=max(0.,dot(n,fill)),rim=max(0.,dot(n,back));
      vec3 view=normalize(vec3(0.,0.,6.6)-vWorld),halfway=normalize(key+view);
      float spec=pow(max(dot(n,halfway),0.),mix(26.,42.,inner))*.19;
      vec3 light=vec3(.31)+vec3(1.0,.94,.81)*diffuse*.65+vec3(.77,.87,1.)*soft*.24+vec3(1.,.76,.38)*rim*.12;
      gl_FragColor=vec4(colour*light+spec*vec3(1.,.95,.78),1.);
    }
  `;
  const identity=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
  function multiply(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o;}
  const translation=(x,y,z)=>{const m=identity();m[12]=x;m[13]=y;m[14]=z;return m;};
  const rotationX=t=>{const c=Math.cos(t),s=Math.sin(t);return new Float32Array([1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1]);};
  const rotationY=t=>{const c=Math.cos(t),s=Math.sin(t);return new Float32Array([c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1]);};
  function perspective(aspect,zoom){const f=1/Math.tan(38*Math.PI/360/zoom),near=.1,far=30;return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]);}
  function distanceInside(alpha,w,h){const d=new Float32Array(w*h);for(let i=0;i<d.length;i++)d[i]=alpha[i]>100?10000:0;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(x)d[i]=Math.min(d[i],d[i-1]+1);if(y){d[i]=Math.min(d[i],d[i-w]+1);if(x)d[i]=Math.min(d[i],d[i-w-1]+1.414);}}for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){const i=y*w+x;if(x<w-1)d[i]=Math.min(d[i],d[i+1]+1);if(y<h-1){d[i]=Math.min(d[i],d[i+w]+1);if(x<w-1)d[i]=Math.min(d[i],d[i+w+1]+1.414);}}return d;}
  function buildGeometry(state,ratio){
    const {width:w,height:h,thickness}=state,scale=3.4/Math.max(w,h),cutPx=48+(w-96)*ratio,cutWorld=(cutPx-w/2)*scale;
    const rgba=state.shell.getContext('2d').getImageData(0,0,w,h).data,source=state.source.getContext('2d').getImageData(0,0,w,h).data;
    const alpha=new Uint8Array(w*h),original=new Uint8Array(w*h);for(let i=0;i<alpha.length;i++){alpha[i]=rgba[i*4+3];original[i]=source[i*4+3];}
    const distance=distanceInside(alpha,w,h),sourceDistance=distanceInside(original,w,h);
    const at=(array,x,y)=>array[Math.max(0,Math.min(h-1,Math.round(y)))*w+Math.max(0,Math.min(w-1,Math.round(x)))];
    const columns=Math.max(24,Math.round(w/Math.max(w,h)*86)),rows=Math.max(24,Math.round(h/Math.max(w,h)*86));
    let xs=Array.from({length:columns+1},(_,i)=>i*w/columns);xs=xs.filter(x=>Math.abs(x-cutPx)>.001);xs.push(cutPx);xs.sort((a,b)=>a-b);const ys=Array.from({length:rows+1},(_,i)=>i*h/rows),cols=xs.length-1;
    const active=new Uint8Array(cols*rows),parts=new Int8Array(cols*rows);
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const i=y*cols+x,cx=(xs[x]+xs[x+1])/2,cy=(ys[y]+ys[y+1])/2;active[i]=at(alpha,cx,cy)>100?1:0;parts[i]=cx<cutPx?-1:1;}
    const depth=.23+thickness*.042+(state.type==='crispy'?.06:0);
    function height(x,y){const inset=at(distance,x,y),puff=Math.sqrt(Math.min(1,inset/Math.max(12,Math.min(w,h)*.12))),noise=(Math.sin(x*.11+y*.07)+Math.cos(x*.09-y*.13))*.002;return depth*(.42+.58*puff)+noise;}
    function vertex(x,y,top,material){const z=height(x,y)*(top?1:-.83),base=height(x,y),dx=(height(x+2,y)-height(x-2,y))/(4*scale),dy=(height(x,y+2)-height(x,y-2))/(4*scale),normal=[-dx*(top?1:.83),dy*(top?1:.83),top?1:-1],length=Math.hypot(...normal)||1;return [(x-w/2)*scale,(h/2-y)*scale,z,x/w,y/h,material,z/(top?base:base*.83),at(sourceDistance,x,y)*scale,...normal.map(v=>v/length)];}
    const output={left:[],right:[]};let cutTriangles=0,outerTriangles=0;
    function quad(arr,a,b,c,d,material,smooth=false){
      for(const tri of [[a,b,c],[a,c,d]]){const u=tri[1].map((v,i)=>v-tri[0][i]),v=tri[2].map((q,i)=>q-tri[0][i]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],len=Math.hypot(...n)||1;
        for(const p of tri){const uv=material?[cutPx/w+(p[2]/depth)*.15*(w-96)/w,p[4]]:[p[3],p[4]];arr.push(p[0],p[1],p[2],smooth?p[8]:n[0]/len,smooth?p[9]:n[1]/len,smooth?p[10]:n[2]/len,uv[0],uv[1],material,p[6],p[7]);}
        if(material)cutTriangles++;else outerTriangles++;
      }
    }
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const i=y*cols+x;if(!active[i])continue;const side=parts[i],arr=side<0?output.left:output.right,L=xs[x],R=xs[x+1],T=ys[y],B=ys[y+1];const tl=vertex(L,T,true,0),tr=vertex(R,T,true,0),bl=vertex(L,B,true,0),br=vertex(R,B,true,0),tlb=vertex(L,T,false,0),trb=vertex(R,T,false,0),blb=vertex(L,B,false,0),brb=vertex(R,B,false,0);
      quad(arr,tl,bl,br,tr,0,true);quad(arr,tlb,trb,brb,blb,0,true);
      const wall=(nx,ny,a,b,c,d)=>{const j=ny*cols+nx;if(nx<0||nx>=cols||ny<0||ny>=rows||!active[j]||parts[j]!==side){const cut=nx>=0&&nx<cols&&ny>=0&&ny<rows&&active[j]&&parts[j]!==side?1:0;quad(arr,a,b,c,d,cut);}};
      wall(x-1,y,bl,tl,tlb,blb);wall(x+1,y,tr,br,brb,trb);wall(x,y-1,tl,tr,trb,tlb);wall(x,y+1,br,bl,blb,brb);
    }
    return {left:new Float32Array(output.left),right:new Float32Array(output.right),cutWorld,cutU:cutPx/w,centers:[(-w/2*scale+cutWorld)/2,(w/2*scale+cutWorld)/2],outerTriangles,cutTriangles,depth};
  }
  function transforms(geometry,split,pitch,yaw){const global=multiply(rotationX(pitch),rotationY(yaw));return[-1,1].map((side,i)=>{let local=translation(side*split*.48,0,0);local=multiply(local,translation(geometry.centers[i],0,0));local=multiply(local,rotationY(side*split*.72));local=multiply(local,translation(-geometry.centers[i],0,0));return multiply(global,local);});}
  function create(canvas){
    const gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false,preserveDrawingBuffer:false});if(!gl)throw Error('3D 화면을 열 수 없어요. 브라우저의 하드웨어 가속을 켜고 다시 시도해주세요.');
    function compile(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const err=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error(err);}return s;}
    const program=gl.createProgram(),vs=compile(gl.VERTEX_SHADER,vertexShader),fs=compile(gl.FRAGMENT_SHADER,fragmentShader);gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('3D 재질을 준비하지 못했어요.');
    const attrs={};for(const n of ['aPosition','aNormal','aUV','aCut'])attrs[n]=gl.getAttribLocation(program,n);
    const uniforms={};for(const n of ['uModel','uProjection','uCrust','uFilling','uTexel','uCutU','uRim','uSectionMode'])uniforms[n]=gl.getUniformLocation(program,n);
    const textures=[gl.createTexture(),gl.createTexture()],buffers=[gl.createBuffer(),gl.createBuffer()];let geometry=null,state=null,key='',meshKey='',split=0,ratio=.5,sectionMode='line',pitch=-.27,yaw=0,zoom=1,lost=false;
    function uploadTexture(index,image){gl.activeTexture(gl.TEXTURE0+index);gl.bindTexture(gl.TEXTURE_2D,textures[index]);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);}
    function draw(){if(!geometry||lost)return;const rect=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2),width=Math.max(1,Math.round(rect.width*dpr)),height=Math.max(1,Math.round(rect.height*dpr));if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.useProgram(program);gl.uniform1i(uniforms.uCrust,0);gl.uniform1i(uniforms.uFilling,1);gl.uniform2f(uniforms.uTexel,1/state.width,1/state.height);gl.uniform1f(uniforms.uCutU,geometry.cutU);gl.uniform1f(uniforms.uSectionMode,sectionMode==='image'?1:0);gl.uniform1f(uniforms.uRim,.055+state.thickness*.011);gl.uniformMatrix4fv(uniforms.uProjection,false,perspective(canvas.width/canvas.height,zoom));const models=transforms(geometry,split,pitch,yaw);
      for(let i=0;i<2;i++){gl.bindBuffer(gl.ARRAY_BUFFER,buffers[i]);let offset=0;for(const [name,size] of [['aPosition',3],['aNormal',3],['aUV',2],['aCut',3]]){gl.enableVertexAttribArray(attrs[name]);gl.vertexAttribPointer(attrs[name],size,gl.FLOAT,false,44,offset);offset+=size*4;}gl.uniformMatrix4fv(uniforms.uModel,false,models[i]);gl.drawArrays(gl.TRIANGLES,0,(i===0?geometry.left.length:geometry.right.length)/11);}
    }
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;canvas.dispatchEvent(new CustomEvent('fry3derror',{detail:'3D 화면 연결이 끊겼어요. 페이지를 새로고침해주세요.'}));});
    return{update(next,amount,cut,mode='line'){if(lost)return;sectionMode=mode==='image'?'image':'line';state=next;split=Math.max(0,Math.min(1,amount));ratio=Math.max(.2,Math.min(.8,cut));const textureKey=state.revision+':'+state.seconds;if(textureKey!==key){uploadTexture(0,state.crust);uploadTexture(1,state.filling);key=textureKey;}const nextMesh=state.revision+':'+ratio;if(nextMesh!==meshKey){geometry=buildGeometry(state,ratio);for(let i=0;i<2;i++){gl.bindBuffer(gl.ARRAY_BUFFER,buffers[i]);gl.bufferData(gl.ARRAY_BUFFER,i===0?geometry.left:geometry.right,gl.STATIC_DRAW);}meshKey=nextMesh;}draw();},camera(p,y,z){pitch=p;yaw=y;zoom=z;draw();},draw};
  }
  return{create,buildGeometry,transforms,perspective,vertexShader,fragmentShader};
})();
