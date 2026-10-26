import {startLive} from './live.js';
import {referenceView} from './lucky-reference-core.js';

const $=id=>document.getElementById(id);
const clock=value=>Number.isFinite(value)?new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Kiev',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(value):'—';
const coef=value=>Number.isFinite(value)?value.toFixed(2)+'×':'—';
const pct=value=>Number.isFinite(value)?(value*100).toFixed(1)+'%':'—';
const duration=ms=>{const seconds=Math.max(0,Math.ceil(ms/1000));return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;};
let state={rows:[],active:true},requested=false,busy=false,lastSuccess=0,lastId=null;

function render(){
  const v=referenceView(state), show=requested&&v.fresh;
  $('latest').textContent=coef(v.latest?.coefficient);
  $('target').textContent=show?'≥'+v.threshold+'×':'—';
  $('estimate-time').textContent=show?clock(v.estimateAt):'—';
  $('estimate-time').title=show&&v.estimateAt?new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Kiev',dateStyle:'short',timeStyle:'medium'}).format(v.estimateAt):'';
  $('probability').textContent=show?pct(v.probability):'—';
  $('countdown').textContent=show&&v.remaining!==null?duration(v.remaining):'—';
  $('previous').textContent=coef(v.previous?.coefficient);
  $('frequency').textContent=pct(v.frequency);
  $('source-label').textContent=v.status+(v.count?' · '+v.count+' записей':'');
  $('source-label').parentElement.classList.toggle('is-live',v.fresh);
  $('last-time').textContent=v.latest?clock(v.latest.timestamp)+' · Киев':'Ожидание истории';
  $('window-label').textContent=show&&v.fromAt?'Окно: '+clock(v.fromAt)+' — '+clock(v.toAt)+' · Киев':requested?v.explanation:'Нажмите кнопку, чтобы открыть оценку нашей модели.';
  $('disclaimer').textContent=v.explanation;
  $('progress').style.width=(show?v.progress:0)+'%';
  $('get-analysis').disabled=busy;
  $('get-analysis').textContent=busy?'ЗАГРУЖАЕМ ДАННЫЕ…':requested?'ОБНОВИТЬ АНАЛИЗ':'ПОЛУЧИТЬ АНАЛИЗ';
  document.body.classList.toggle('is-loading',busy);
  if(v.latest&&v.latest.id!==lastId){lastId=v.latest.id;$('latest').classList.remove('pop');void $('latest').offsetWidth;$('latest').classList.add('pop');}
}

startLive($('live-root'),{}, {onUpdate:next=>{
  state=next;
  if(next.error||next.lastSuccess!==lastSuccess){busy=false;lastSuccess=next.lastSuccess;}
  render();
}});
$('get-analysis').addEventListener('click',()=>{
  if(busy)return;requested=true;busy=true;render();
  $('live-root').querySelector('#live-refresh').click();
});
const timer=setInterval(()=>{if(!document.hidden)render();},1000);
window.addEventListener('pagehide',event=>{if(!event.persisted)clearInterval(timer);});
window.addEventListener('pageshow',event=>{if(event.persisted){busy=false;render();}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){busy=false;render();}});
