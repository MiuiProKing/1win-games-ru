import {startLive} from './live.js';
import {sourceStatus} from './live-core.js';
import {newSourceState,requestSourceSignal,advanceSource,restoreSourceState} from './source-logic.js';

const $=id=>document.getElementById(id);
const kind=document.body.classList.contains('skin-v12')?'v12':'classic';
const storageKey='god-games-ru:source:'+kind;
const clock=at=>Number.isFinite(at)?new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Kiev',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(at):'—';
const coef=value=>Number.isFinite(value)?value.toFixed(2)+'×':'—';
const duration=ms=>{const seconds=Math.max(0,Math.ceil(ms/1000));return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;};
let engine=newSourceState(kind),feed={rows:[],active:true,error:'',lastSuccess:0},lastStored='',lastId=null,lastSignal=null,historySignature='';
try{engine=restoreSourceState(localStorage.getItem(storageKey),kind);}catch{}
const names={hit:'Зашло по правилу',miss:'Промах по истории',unknown:'Нет данных',unchecked:'Без проверки в образце'};
function save(){const json=JSON.stringify(engine);if(json!==lastStored){lastStored=json;try{localStorage.setItem(storageKey,json);}catch{}}}
function renderHistory(){
  const signature=JSON.stringify(engine.history);if(signature===historySignature)return;historySignature=signature;
  const list=$('source-history');list.replaceChildren();
  if(!engine.history.length){const p=document.createElement('p');p.textContent='Здесь появятся созданные демонстрационные сигналы.';list.append(p);return;}
  for(const item of engine.history){
    const card=document.createElement('article');card.className='source-history-card '+item.status;
    const title=document.createElement('strong');title.textContent=kind==='classic'?coef(item.low)+' — '+coef(item.high):coef(item.target);
    const status=document.createElement('span');status.textContent=names[item.status];
    const stamp=document.createElement('p');stamp.textContent=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Kiev',day:'2-digit',month:'2-digit'}).format(item.startAt)+' · '+clock(item.startAt)+' — '+clock(item.endAt)+' · Киев';
    card.append(title,status,stamp);
    if(item.coefficient!=null){const fact=document.createElement('p');fact.textContent='Факт '+coef(item.coefficient)+' · '+clock(item.roundAt)+' · запись окна №'+item.round;card.append(fact);}
    list.append(card);
  }
}
function render(){
  const now=Date.now(),status=sourceStatus(feed.rows),online=status.kind==='live'&&!feed.error&&feed.active;
  if(kind==='classic'||feed.lastSuccess||feed.error||engine.phase==='result')advanceSource(engine,now,feed.rows,Math.random,{available:!!online});
  const signal=engine.signal,analyzing=engine.phase==='analyzing';
  $('target').textContent=signal?(kind==='classic'?coef(signal.low)+' — '+coef(signal.high):coef(signal.target)):'—';
  $('estimate-time').textContent=signal?(kind==='classic'?clock(signal.startAt)+' — '+clock(signal.endAt):clock(signal.startAt)):'—';
  $('estimate-time').title=signal?new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Kiev',dateStyle:'short',timeStyle:'medium'}).format(signal.startAt):'';
  $('probability').textContent=signal?(kind==='classic'?signal.demoPercent:signal.demoPercent.toFixed(2))+'%':'—';
  $('latest').textContent=coef(feed.rows[0]?.coefficient);
  $('last-time').textContent=feed.rows[0]?clock(feed.rows[0].timestamp)+' · Киев':'Ожидание истории';
  $('source-label').textContent=(feed.error?'Нет связи':feed.active?status.label:'Пауза')+(feed.rows.length?' · '+feed.rows.length+' записей':'');
  $('source-label').parentElement.classList.toggle('is-live',!!online);
  $('previous').textContent=engine.last?names[engine.last.status]+' · '+coef(engine.last.target)+(engine.last.coefficient?' → '+coef(engine.last.coefficient):''):'Ожидание…';
  const counted=engine.stats.hit+engine.stats.miss;
  $('frequency').textContent=counted?Math.round(engine.stats.hit/counted*100)+'% ('+engine.stats.hit+'/'+counted+')':'—';
  $('source-stats').textContent=kind==='classic'?'В образце эта версия не проверяет попадания.':'Зашло: '+engine.stats.hit+' · Промах: '+engine.stats.miss+' · Нет данных: '+engine.stats.unknown;
  let remaining=0,message='',progress=0,disabled=false,label='ПОЛУЧИТЬ СИГНАЛ';
  if(kind==='classic'){
    remaining=Math.max(0,engine.nextAt-now);disabled=analyzing||remaining>0;
    progress=analyzing?Math.min(100,(now-engine.animationStart)/(engine.animationEnd-engine.animationStart)*100):signal?100:0;
    const steps=['Подготовка демонстрации…','Выбор случайного диапазона…','Выбор случайного времени…','Сохранение примера…'];
    message=analyzing?steps[Math.min(3,Math.floor(progress/25))]:signal?'Окно примера: '+clock(signal.startAt)+' — '+clock(signal.endAt)+(now>=signal.endAt?' · завершено':''):'Как в образце: диапазон 2–4× и случайное окно через 2–3 минуты.';
    if(analyzing)label='ГЕНЕРАЦИЯ ПРИМЕРА…';else if(remaining>0)label='ПОВТОР ЧЕРЕЗ '+duration(remaining);
  }else{
    disabled=engine.phase!=='observe'||!online;
    if(engine.phase==='waiting'){remaining=signal.startAt-now;message='Ожидание окна: '+clock(signal.startAt)+' — '+clock(signal.endAt);label='ОЖИДАНИЕ ОКНА';}
    else if(engine.phase==='window'){remaining=Math.max(0,signal.verifyUntil-now);message=now>signal.verifyUntil?'Дожидаемся данных для проверки…':'Проверяем результат по оценочному времени начала полёта.';label='ПРОВЕРКА СИГНАЛА';}
    else if(engine.phase==='result'){remaining=Math.max(0,engine.resultEnd-now);message=names[engine.last.status];label='РЕЗУЛЬТАТ';}
    else{message=online?'Нажмите кнопку: цель 2–2,5× и время выбираются случайно.':'Для проверки V12 нужен свежий поток коэффициентов.';if(!online)label='ОЖИДАНИЕ ДАННЫХ';}
    progress=signal?Math.max(0,Math.min(100,(now-signal.createdAt)/(signal.verifyUntil-signal.createdAt)*100)):0;
  }
  $('countdown').textContent=duration(remaining);$('window-label').textContent=message;
  $('progress').style.width=progress+'%';$('get-analysis').disabled=disabled;$('get-analysis').textContent=label;
  $('disclaimer').textContent='Логика образца: цель, время и демо-процент выбираются случайно. Процент не является точностью.'+(kind==='v12'?' Проверка использует расчёт начала полёта; полнота игровых раундов не подтверждена.':' В исходной обычной версии нет подключения к игре и проверки попаданий.');
  const banner=$('result-banner');banner.hidden=engine.phase!=='result';banner.className='result-banner '+(engine.last?.status||'');
  banner.textContent=engine.last?names[engine.last.status]+' · цель '+coef(engine.last.target)+(engine.last.coefficient?' → факт '+coef(engine.last.coefficient):''):'';
  if(feed.rows[0]&&feed.rows[0].id!==lastId){lastId=feed.rows[0].id;$('latest').classList.remove('pop');void $('latest').offsetWidth;$('latest').classList.add('pop');}
  if(signal&&signal.createdAt!==lastSignal){lastSignal=signal.createdAt;$('target').classList.remove('pop');void $('target').offsetWidth;$('target').classList.add('pop');}
  save();renderHistory();
}
startLive($('live-root'),{}, {pollMs:kind==='v12'?2000:5000,onUpdate:next=>{feed=next;render();}});
$('get-analysis').addEventListener('click',()=>{
  if(kind==='v12'&&(sourceStatus(feed.rows).kind!=='live'||feed.error||!feed.active))return;
  requestSourceSignal(engine,Date.now(),Math.random,feed.rows[0]);render();
});
let lastPaint=0;
const timer=setInterval(()=>{if(!document.hidden&&(engine.phase==='analyzing'||Date.now()-lastPaint>=1000)){lastPaint=Date.now();render();}},80);
window.addEventListener('pagehide',event=>{save();if(!event.persisted)clearInterval(timer);});
window.addEventListener('pageshow',event=>{if(event.persisted)render();});
window.addEventListener('storage',event=>{if(event.key===storageKey&&event.newValue){engine=restoreSourceState(event.newValue,kind);lastStored=event.newValue;render();}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});
