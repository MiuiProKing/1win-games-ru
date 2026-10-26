import {HISTORY_API, normalizeRounds, mergeRounds, sourceStatus, historyStats} from './live-core.js';
import './marked-core.js';

const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct = value => Number.isFinite(value)?(value*100).toFixed(1)+'%':'—';
const number = value => Number.isFinite(value)?value.toFixed(2):'—';
const clock = value => Number.isFinite(value)?new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Kiev',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(value):'—';
const span = value => Number.isFinite(value)?Math.round(value/60000)+' мин':'—';

export function startLive(container, game) {
  container.innerHTML=`<div class="live-source-line"><span class="mode-pill live" id="live-status">Подключение…</span><span id="live-updated">Источник: наш архив LuckyJet</span></div>
    <section class="live-hero game-panel"><div class="live-orbit" aria-hidden="true"></div><span class="micro-label">Последний завершённый результат</span><strong class="live-value" id="live-value">—</strong><span id="live-time">Ожидание данных</span></section>
    <p class="live-note" id="live-message" role="status">Загружаем завершённые результаты из нашего источника.</p>
    <div class="live-controls"><button class="main-action" id="live-refresh" type="button">Обновить анализ</button><button class="secondary-action" id="live-pause" type="button">Пауза</button><a class="secondary-action" href="luckyjetv12.html#model">Полный анализ V12</a></div>
    <section class="game-panel live-model"><span class="micro-label">Экспериментальная модель · 10×+</span><h2>Событие и возможная величина</h2><div id="live-model-state" class="live-note">Нужны минимум 200 записей и 15 событий 10×+.</div><div id="live-horizons" class="live-metric-grid"></div><div id="live-mark-probs" class="live-metric-grid"></div><p id="live-model-time" class="live-note"></p><p id="live-quality-verdict" class="live-note"></p><p class="live-note">Горизонты относятся к доступным записям источника. Полнота и официальный порядок игровых раундов не подтверждены. Примерный срок результата не является временем ставки.</p></section>
    <section class="game-panel"><div class="section-row"><h2>История коэффициентов</h2><span id="live-count">0 записей</span></div><div id="live-statistics" class="live-metric-grid"></div><div id="live-history" class="live-history"></div><p class="live-note">Отображаются последние 60 результатов; модель видит до 2000 загруженных записей. Время — по Киеву.</p></section>`;
  const $ = id => container.querySelector('#'+id);
  let rows=[],cursor=null,controller=null,timer=null,active=true,disposed=false,inflight=false,failures=0,report=null,revision='',lastSuccess=0,error='';

  function render() {
    const status=sourceStatus(rows),current=status.kind==='live'&&!error&&active;
    $('live-status').textContent=error?'Нет связи':!active?'Пауза':status.label;
    $('live-status').className='mode-pill '+(current?'live':'demo');
    $('live-value').textContent=rows.length?number(rows[0].coefficient)+'×':'—';
    $('live-time').textContent=rows.length?clock(rows[0].timestamp)+' · Киев'+(rows[0].estimated?' · оценочная метка':''):'Ожидание данных';
    $('live-updated').textContent=lastSuccess?'Обновлено '+clock(lastSuccess)+' · Киев':'Источник: наш архив LuckyJet';
    $('live-message').textContent=error||(!active?'Обновление приостановлено. История остаётся доступной.':status.kind==='live'?'Завершённые результаты из нашего Supabase. Одинаковые коэффициенты разных ID сохраняются.':status.kind==='empty'?'Ожидание первого ответа API.':'Текущие данные не подтверждают свежий поток; действующая оценка скрыта.');
    const stats=historyStats(rows);
    $('live-count').textContent=stats.count+' записей';
    $('live-statistics').innerHTML=`<div><span>Максимум истории</span><strong>${number(stats.maximum)}×</strong></div><div><span>Частота 10×+</span><strong>${pct(stats.above10)}</strong></div><div><span>Частота 100×+</span><strong>${pct(stats.above100)}</strong></div>`;
    $('live-history').innerHTML=rows.length?rows.slice(0,60).map(row=>`<article class="live-chip ${row.coefficient>=10?'high':row.coefficient>=2?'mid':'low'}" title="ID: ${escape(row.id)}"><b>${number(row.coefficient)}×</b><time>${clock(row.timestamp)}</time></article>`).join(''):'<p class="live-note">История появится после загрузки.</p>';
    const model=current&&report?.status==='ready'?report:null;
    $('live-model-state').textContent=model?`Модель по ${report.quality.records} записям; событий 10×+: ${report.quality.events}. Это экспериментальная оценка.`:report?.status==='insufficient'?'Для модели пока недостаточно записей или событий 10×+.':'Действующая модель скрыта до восстановления свежего потока.';
    $('live-horizons').innerHTML=[1,3,5,10].map(n=>{const h=model?.event.horizons.find(item=>item.rounds===n);return `<div><span>10×+ · ${n} ${n===1?'запись':'записей'}</span><strong>${pct(h?.probability)}</strong><small>База ${pct(h?.baselineProbability)}</small></div>`;}).join('');
    $('live-mark-probs').innerHTML=[20,50,100].map(target=>{const mark=model?.marks.thresholds.find(item=>item.target===target);return `<div><span>≥${target}× среди 10×+</span><strong>${pct(mark?.conditionalProbability)}</strong><small>На следующую запись ${pct(mark?.nextProbability)}</small></div>`;}).join('');
    const wait=model?.timing?.eventWait;
    $('live-model-time').textContent=wait?`До события 10×+: модельная медиана ${wait.medianRounds} записей (около ${span(wait.medianMs)}); грубый диапазон ${span(wait.lowerMs)} — ${span(wait.upperMs)}. Покрытие диапазона не откалибровано.`:'Для временного диапазона нужны свежие точные соседние метки.';
    const validation=report?.validation;
    $('live-quality-verdict').textContent=validation?`Хронологический тест: ${validation.testRecords} записей, ${validation.testEvents} событий 10×+. ${validation.advantage?'Ошибки ниже базы в этом тесте; преимущество на будущих данных не подтверждено.':'Преимущество перед базовой частотой не подтверждено.'}`:'Историческая проверка появится после загрузки.';
    $('live-pause').textContent=active?'Пауза':'Продолжить';
  }

  async function poll() {
    if(disposed||inflight||!active||document.hidden)return;
    inflight=true;controller=new AbortController();const currentController=controller;
    const timeout=setTimeout(()=>currentController.abort(),15000);
    try {
      const url=new URL(HISTORY_API);url.searchParams.set('limit','2000');if(cursor!==null)url.searchParams.set('after',String(cursor));
      const response=await fetch(url,{headers:{Accept:'application/json'},credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:currentController.signal});
      if(!response.ok)throw new Error('Источник временно недоступен: HTTP '+response.status+'. Повторим запрос автоматически.');
      const payload=await response.json(),incoming=normalizeRounds(payload);
      if(disposed||!active)return;
      rows=mergeRounds(rows,incoming);
      // Retry a full snapshot if any row was dropped: a later valid feed order
      // must not move the cursor past a temporarily future/invalid earlier row.
      const orders=incoming.map(row=>row.order).filter(order=>Number.isSafeInteger(order)&&order>0);
      if(incoming.length!==payload.rounds.length)cursor=null;
      else if(orders.length)cursor=Math.max(cursor??0,...orders);
      const nextRevision=JSON.stringify(rows.map(row=>[row.id,row.coefficient,row.timestamp,row.estimated,row.order]));
      if(nextRevision!==revision){report=globalThis.LuckyJetMarked.analyze(rows,{now:Date.now(),gameOrderVerified:false});revision=nextRevision;}
      error='';failures=0;lastSuccess=Date.now();render();
    }catch(err){if(!disposed&&active&&!document.hidden){failures++;error=err?.name==='AbortError'?'Источник не ответил за 15 секунд. Повторим запрос.':err instanceof TypeError?'Не удалось прочитать API. Проверьте интернет-соединение.':err.message;render();}}
    finally{clearTimeout(timeout);inflight=false;if(!disposed&&active&&!document.hidden)timer=setTimeout(poll,failures?Math.min(60000,5000*2**Math.min(failures,4)):5000);}
  }
  const refresh=()=>{clearTimeout(timer);if(!active)active=true;if(!inflight)poll();render();};
  const pause=()=>{active=!active;clearTimeout(timer);if(!active)controller?.abort();else if(!inflight)poll();render();};
  $('live-refresh').addEventListener('click',refresh);$('live-pause').addEventListener('click',pause);
  const visibility=()=>{clearTimeout(timer);if(document.hidden)controller?.abort();else if(active&&!inflight)poll();};
  document.addEventListener('visibilitychange',visibility);
  const interval=setInterval(()=>{if(!disposed&&!document.hidden)render();},10000);
  const leave=event=>{if(event.persisted){clearTimeout(timer);controller?.abort();}else stop();};
  const restored=event=>{if(event.persisted&&!disposed&&active&&!inflight){render();poll();}};
  const stop=()=>{disposed=true;clearTimeout(timer);clearInterval(interval);controller?.abort();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',leave);window.removeEventListener('pageshow',restored);};
  window.addEventListener('pagehide',leave);window.addEventListener('pageshow',restored);
  render();poll();return stop;
}
