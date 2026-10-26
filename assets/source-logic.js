// Reimplementation of the two publicly readable client algorithms.
// Random targets, delays and percentages are simulations, not measured accuracy.
export const SOURCE_CONFIG=Object.freeze({threshold:1.5,series:3,targetMin:2,targetMax:2.5,delayMinSeconds:120,delayMaxSeconds:180,windowSeconds:60,flightMarginSeconds:45,resultSeconds:10,flightK:.11,cooldownMs:180000});
const r2=n=>Math.round(n*100)/100;
const random=rng=>{const n=rng();if(!Number.isFinite(n)||n<0||n>=1)throw new RangeError('Random value must be in [0, 1).');return n;};
export function flightDuration(coefficient){return Math.min(60000,Math.max(0,Math.log(Math.max(coefficient,1))/.11*1000));}
export function newSourceState(kind){if(!['classic','v12'].includes(kind))throw new RangeError('Unknown source variant');return {version:1,kind,phase:'observe',signal:null,nextAt:0,animationStart:0,animationEnd:0,resultEnd:0,last:null,history:[],stats:{hit:0,miss:0,unknown:0},streak:0};}
export function requestSourceSignal(s,now,rng=Math.random,baseline=null){
  if(s.phase==='analyzing'||(s.kind==='classic'?now<s.nextAt:s.phase!=='observe'))return false;
  if(s.kind==='classic'){
    s.phase='analyzing';s.animationStart=now;s.animationEnd=now+7000+Math.floor(random(rng)*5001);return true;
  }
  const target=r2(2+random(rng)*.5),delay=120+random(rng)*60;
  const startAt=Math.floor((now+delay*1000)/60000)*60000;
  s.signal={target,startAt,endAt:startAt+60000,verifyUntil:startAt+105000,createdAt:now,demoPercent:r2(96+random(rng)*2),baseline:baseline?{id:baseline.id,order:baseline.order,timestamp:baseline.timestamp}:null};
  s.phase='waiting';s.streak=0;return true;
}
function finish(s,status,row,now,round=null){
  const result={status,target:s.signal.target,startAt:s.signal.startAt,endAt:s.signal.endAt,createdAt:s.signal.createdAt,resolvedAt:now,coefficient:row?.coefficient??null,roundId:row?.id??null,roundAt:row?.timestamp??null,round};
  s.last=result;s.history.unshift(result);s.history.length=Math.min(s.history.length,50);s.stats[status]++;
  s.phase='result';s.resultEnd=now+10000;
}
function completeRecordedWindow(signal,rows){
  const b=signal.baseline;if(!b||!Number.isSafeInteger(b.order)||b.order<=0)return false;
  const ordered=rows.filter(r=>r.order>=b.order).sort((a,b)=>a.order-b.order);
  const end=ordered.findIndex(r=>r.timestamp>=signal.verifyUntil);if(end<0)return false;
  const relevant=ordered.slice(0,end+1);
  return relevant[0]?.id===b.id&&relevant.every((r,i)=>!r.estimated&&r.order===b.order+i&&Number.isFinite(r.timestamp)&&(!i||r.timestamp>=relevant[i-1].timestamp));
}
export function advanceSource(s,now,rows=[],rng=Math.random,{available=true}={}){
  if(s.kind==='classic'){
    if(s.phase==='analyzing'&&now>=s.animationEnd){
      // Like the source, the reveal establishes the new three-minute cooldown.
      const low=r2(2+random(rng)*.35),high=r2(3+random(rng)),demoPercent=96+Math.floor(random(rng)*3),startAt=now+(random(rng)>.5?180000:120000);
      s.signal={low,high,demoPercent,startAt,endAt:startAt+60000,createdAt:now};s.nextAt=now+180000;s.phase='ready';
      s.history.unshift({...s.signal,status:'unchecked'});s.history.length=Math.min(s.history.length,50);
    }
    return s;
  }
  if(s.phase==='result'){
    if(now>=s.resultEnd){s.signal=null;s.phase='observe';s.streak=0;}
    return s;
  }
  if(s.phase==='observe'){
    let count=0;for(const row of rows){if(row.coefficient<1.5)break;count++;}s.streak=count;return s;
  }
  const signal=s.signal;if(!signal)return s;
  if(now>=signal.startAt)s.phase='window';
  const eligible=rows.filter(r=>!r.estimated&&r.timestamp>=signal.createdAt&&r.timestamp<=Math.min(now,signal.verifyUntil)).sort((a,b)=>a.timestamp-b.timestamp||a.order-b.order).filter(r=>{const start=r.timestamp-flightDuration(r.coefficient);return start>=signal.startAt&&start<signal.endAt;});
  const hit=eligible.findIndex(r=>r.coefficient>=signal.target);
  if(hit>=0){finish(s,'hit',eligible[hit],now,hit+1);return s;}
  if(now>signal.verifyUntil){
    if(available&&completeRecordedWindow(signal,rows))finish(s,'miss',null,now);
    else if(now>signal.verifyUntil+60000)finish(s,'unknown',null,now);
  }
  return s;
}

export function restoreSourceState(raw,kind,now=Date.now()){
  const empty=()=>newSourceState(kind);
  try{
    const s=typeof raw==='string'?JSON.parse(raw):raw;
    if(!s||s.version!==1||s.kind!==kind||!['observe','analyzing','ready','waiting','window','result'].includes(s.phase))return empty();
    if(kind==='classic'&&!['observe','analyzing','ready'].includes(s.phase)||kind==='v12'&&['analyzing','ready'].includes(s.phase))return empty();
    for(const k of ['nextAt','animationStart','animationEnd','resultEnd'])if(!Number.isFinite(s[k])||s[k]<0||s[k]>now+86400000)return empty();
    if(!Array.isArray(s.history)||s.history.length>50||!s.stats)return empty();
    for(const k of ['hit','miss','unknown'])if(!Number.isSafeInteger(s.stats[k])||s.stats[k]<0)return empty();
    const valid=x=>x&&Number.isFinite(x.startAt)&&Number.isFinite(x.endAt)&&Number.isFinite(x.createdAt)&&x.createdAt>0&&x.createdAt<=now&&x.endAt===x.startAt+60000&&x.startAt>=x.createdAt;
    if(s.signal){
      if(!valid(s.signal)||!Number.isFinite(s.signal.demoPercent)||s.signal.demoPercent<96||s.signal.demoPercent>98)return empty();
      if(kind==='v12'&&(!Number.isFinite(s.signal.target)||s.signal.target<2||s.signal.target>2.5||s.signal.verifyUntil!==s.signal.startAt+105000))return empty();
      if(kind==='classic'&&(!Number.isFinite(s.signal.low)||s.signal.low<2||s.signal.low>2.35||!Number.isFinite(s.signal.high)||s.signal.high<3||s.signal.high>4))return empty();
    }else if(['ready','waiting','window','result'].includes(s.phase))return empty();
    for(const result of s.history)if(!valid(result)||!['hit','miss','unknown','unchecked'].includes(result.status))return empty();
    s.last=s.history.find(x=>x.status!=='unchecked')||null;
    return s;
  }catch{return empty();}
}
