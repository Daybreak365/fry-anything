'use strict';
// Guided, edge-aware colour segmentation. Runs locally in a Worker.
function segmentImage(data,marks,w,h){
  const n=w*h,fg=[],bg=[];
  for(let i=0;i<n;i++){const c=[data[i*4],data[i*4+1],data[i*4+2]];if(marks[i]===1)fg.push(c);else if(marks[i]===2)bg.push(c);}
  if(fg.length===0)throw Error('남길 피사체 안쪽을 초록색으로 조금 칠해주세요.');
  if(bg.length===0){for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(x===0||y===0||x===w-1||y===h-1){const i=y*w+x;if(marks[i]!==1){marks[i]=2;bg.push([data[i*4],data[i*4+1],data[i*4+2]]);}}}
  if(bg.length===0)throw Error('지울 배경을 빨간색으로 조금 칠해주세요.');
  const sq=(a,b)=>(a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2;
  function palette(values){const sample=values.filter((_,i)=>i%Math.max(1,Math.floor(values.length/2000))===0),k=Math.min(8,sample.length),centers=[sample[0].slice()];while(centers.length<k){let best=0,dist=-1;for(let i=0;i<sample.length;i++){const d=Math.min(...centers.map(c=>sq(sample[i],c)));if(d>dist){dist=d;best=i;}}centers.push(sample[best].slice());}for(let pass=0;pass<5;pass++){const sums=centers.map(()=>[0,0,0,0]);for(const c of sample){let best=0,d=Infinity;for(let j=0;j<k;j++){const v=sq(c,centers[j]);if(v<d){d=v;best=j;}}for(let q=0;q<3;q++)sums[best][q]+=c[q];sums[best][3]++;}for(let j=0;j<k;j++)if(sums[j][3])centers[j]=sums[j].slice(0,3).map(v=>v/sums[j][3]);}return centers;}
  const fp=palette(fg),bp=palette(bg),df=new Float32Array(n),db=new Float32Array(n);
  for(let i=0;i<n;i++){const c=[data[i*4],data[i*4+1],data[i*4+2]];df[i]=Math.sqrt(Math.min(...fp.map(p=>sq(c,p))));db[i]=Math.sqrt(Math.min(...bp.map(p=>sq(c,p))));}
  function geodesic(label,cost){const distances=new Float32Array(n);distances.fill(Infinity);const heap=[];function push(id,d){heap.push([id,d]);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p][1]<=d)break;heap[i]=heap[p];i=p;}heap[i]=[id,d];}function pop(){const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1][1]<heap[c][1])c++;if(heap[c][1]>=last[1])break;heap[i]=heap[c];i=c;}heap[i]=last;}return first;}for(let i=0;i<n;i++)if(marks[i]===label){distances[i]=0;push(i,0);}while(heap.length){const [i,d]=pop();if(d>distances[i])continue;const x=i%w;for(const j of [x?i-1:-1,x<w-1?i+1:-1,i>=w?i-w:-1,i<n-w?i+w:-1]){if(j<0)continue;let gradient=0;for(let c=0;c<3;c++)gradient+=(data[i*4+c]-data[j*4+c])**2;const nd=d+1+gradient*.006+cost[j]*.07;if(nd<distances[j]){distances[j]=nd;push(j,distances[j]);}}}return distances;}
  const gf=geodesic(1,df),gb=geodesic(2,db),unary=new Float32Array(n);let prob=new Float32Array(n);
  for(let i=0;i<n;i++){const score=(db[i]-df[i])/(db[i]+df[i]+15)*.6+(gb[i]-gf[i])/(gb[i]+gf[i]+30)*.4;unary[i]=prob[i]=1/(1+Math.exp(-score*9));if(marks[i])prob[i]=marks[i]===1?1:0;}
  for(let pass=0;pass<6;pass++){const next=new Float32Array(n);for(let i=0;i<n;i++){if(marks[i]){next[i]=marks[i]===1?1:0;continue;}let sum=unary[i]*1.2,weight=1.2;const x=i%w;for(const j of [x?i-1:-1,x<w-1?i+1:-1,i>=w?i-w:-1,i<n-w?i+w:-1])if(j>=0){let d=0;for(let c=0;c<3;c++)d+=(data[i*4+c]-data[j*4+c])**2;const k=Math.exp(-d/900);sum+=prob[j]*k;weight+=k;}next[i]=sum/weight;}prob=next;}
  const alpha=new Uint8ClampedArray(n);for(let i=0;i<n;i++)alpha[i]=Math.round(Math.max(0,Math.min(1,(prob[i]-.35)/.3))*255);return alpha;
}
self.onmessage=e=>{try{const {data,marks,width,height}=e.data,alpha=segmentImage(data,marks,width,height);self.postMessage({alpha},[alpha.buffer]);}catch(error){self.postMessage({error:error.message});}};
