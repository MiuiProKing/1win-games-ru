import {findGame} from './catalog-data.js';
import {createDemo, cleanDemoHistory} from './demo-core.js';

const $ = id => document.getElementById(id);
const game = findGame(document.body.dataset.game);
const THEME_KEY = 'god-games-ru:theme';
const historyKey = game ? 'god-games-ru:demo:' + game.key : '';
const read = (key, fallback) => {try {const raw = localStorage.getItem(key); return raw === null ? fallback : JSON.parse(raw);} catch {return fallback;}};
const write = (key, value) => {try {localStorage.setItem(key, JSON.stringify(value));} catch {}};

function savedTheme() {
  try {const value = localStorage.getItem(THEME_KEY); return value === 'light' || value === '"light"' ? 'light' : 'dark';} catch {return 'dark';}
}
function theme(value) {
  document.documentElement.dataset.theme = value === 'light' ? 'light' : 'dark';
  $('theme-button').textContent = value === 'light' ? '☾' : '☀';
  $('theme-button').setAttribute('aria-label', value === 'light' ? 'Включить тёмную тему' : 'Включить светлую тему');
  try {localStorage.setItem(THEME_KEY, value);} catch {}
}
theme(savedTheme());
$('theme-button').addEventListener('click', () => theme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
window.addEventListener('storage', event => {if (event.key === THEME_KEY) theme(savedTheme());});

function cell(index, selected, hazard) {
  const state = hazard ? 'is-hazard' : selected ? 'is-selected' : '';
  const symbol = hazard ? '✕' : selected ? '◆' : '·';
  return `<div class="mine-cell ${state}" role="gridcell" aria-label="Клетка ${index+1}: ${hazard ? 'учебная мина' : selected ? 'учебная отметка' : 'не отмечена'}">${symbol}</div>`;
}

function drawStage(result) {
  const stage = $('demo-stage');
  stage.className = 'demo-stage kind-' + game.kind;
  if (game.kind === 'mines') {
    const hazards = result?.hazards || [], safe = result?.safeCells || [];
    stage.innerHTML = '<div class="mine-grid" role="grid" aria-label="Демонстрационное поле из 25 клеток">' + Array.from({length:25},(_, i) => cell(i,safe.includes(i),hazards.includes(i))).join('') + '</div>';
  } else if (game.kind === 'towers') {
    stage.innerHTML = '<div class="tower-grid" role="grid" aria-label="Учебный маршрут из 8 уровней">' + Array.from({length:8},(_, row) => {
      const level = 7-row;
      return `<div class="tower-row"><span class="tower-level">${level+1}</span>${Array.from({length:3},(_, col) => `<div role="gridcell" aria-label="Уровень ${level+1}, колонка ${col+1}${result?.path[level] === col ? ', учебная отметка' : ''}" class="tower-cell ${result?.path[level] === col ? 'is-selected' : ''}">${result?.path[level] === col ? '◆' : '·'}</div>`).join('')}</div>`;
    }).join('') + '</div>';
  } else if (game.kind === 'coin') {
    stage.innerHTML = '<div class="coin-scene"><div class="demo-coin" aria-hidden="true"><span>' + (result ? result.side ? 'Р' : 'О' : '₽') + '</span></div></div><div class="stage-word">' + (result?.label || 'Орёл или решка?') + '</div>';
  } else if (game.kind === 'cups') {
    stage.innerHTML = '<div class="cups-scene" aria-label="Три демонстрационных напёрстка">' + Array.from({length:3},(_, i) => `<div class="cup-column ${result?.selected === i ? 'chosen' : ''}"><div class="cup" aria-hidden="true"></div><div class="cup-ball ${result?.selected === i ? 'visible' : ''}" aria-hidden="true"></div><span>№${i+1}</span></div>`).join('') + '</div>';
  } else if (game.kind === 'football') {
    stage.innerHTML = '<div class="goal-scene"><div class="goal-net" role="grid" aria-label="Девять учебных секторов ворот">' + Array.from({length:9},(_, i) => `<div role="gridcell" aria-label="Сектор ${i+1}${result?.selected === i ? ', учебная цель' : ''}" class="goal-cell ${result?.selected === i ? 'chosen' : ''}">${result?.selected === i ? '⚽' : i+1}</div>`).join('') + '</div></div>';
  } else {
    stage.innerHTML = '<div class="orb-scene"><div class="orb-halo"></div><div class="orb-track"></div><div class="flight-orb"><span class="orb-eyebrow">УЧЕБНОЕ ЗНАЧЕНИЕ</span><strong>' + (result ? result.coefficient.toFixed(2) + '<small>×</small>' : '—') + '</strong><span class="orb-caption">' + (result ? 'Сгенерировано локально' : 'Готов к демонстрации') + '</span></div><span class="orbit-plane" aria-hidden="true">✈</span></div><div class="stage-clouds" aria-hidden="true"><i></i><i></i><i></i></div>';
  }
}

let zone = 'Europe/Kyiv';
try {new Intl.DateTimeFormat('ru-RU',{timeZone:zone}).format(Date.now());} catch {zone='Europe/Kiev'; try {new Intl.DateTimeFormat('ru-RU',{timeZone:zone}).format(Date.now());} catch {zone='UTC';}}
const timeText = at => new Intl.DateTimeFormat('ru-RU',{timeZone:zone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(at);
let history = cleanDemoHistory(read(historyKey, []));
let result = null, running = false, timer = null;

function renderHistory() {
  const list = $('demo-history');
  list.replaceChildren();
  $('history-count').textContent = String(history.length);
  if (!history.length) {
    const empty = document.createElement('p'); empty.className='history-empty'; empty.textContent='Здесь появятся только результаты ваших демонстраций.'; list.append(empty); return;
  }
  history.forEach(entry => {
    const item = document.createElement('li');
    const text = document.createElement('span'); text.textContent=entry.label;
    const stamp = document.createElement('time'); stamp.dateTime=new Date(entry.at).toISOString(); stamp.textContent=timeText(entry.at);
    item.append(text,stamp);list.append(item);
  });
}

function runDemo() {
  if (running) return;
  running=true;
  $('run-demo').disabled=true; $('run-demo').textContent='Создаём учебный пример…';
  $('reset-demo').disabled=true;
  $('demo-stage').classList.add('is-running');
  $('demo-result').textContent='Локальная демонстрация. Связь с реальной игрой не используется.';
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  timer=setTimeout(() => {
    try {
      result=createDemo(game.kind,{hazards:Number($('hazard-count')?.value || 3)});
      drawStage(result);
      $('demo-result').textContent='Учебный результат: ' + result.label;
      history=cleanDemoHistory([{at:Date.now(),label:result.label},...history]);
      write(historyKey,history); renderHistory();
    } catch {
      $('demo-result').textContent='Не удалось создать пример. Проверьте настройки и повторите.';
    } finally {
      running=false;timer=null;$('run-demo').disabled=false;$('reset-demo').disabled=false;$('run-demo').textContent='Запустить демонстрацию';
    }
  },reduced ? 30 : 700);
}

function resetDemo() {
  if (running) return;
  result=null;history=[];write(historyKey,[]);drawStage(null);renderHistory();
  $('demo-result').textContent='Демонстрация сброшена. Это учебный режим без подключения к реальной игре.';
}

async function boot() {
  if (!game) {
    $('game-title').textContent='Игра не найдена';
    $('game-main').innerHTML='<p class="game-panel">Вернитесь в <a href="../okoknew.html">каталог игр</a>.</p>';return;
  }
  document.title=game.title+' · 1WIN GAMES · Русская версия';
  $('game-title').textContent=game.title;
  $('game-art').src='../'+game.image;
  $('game-art').alt=game.title;
  document.body.classList.add('game-'+game.key);
  $('mode-label').textContent=game.mode==='live' ? 'ИСТОЧНИК LUCKYJET' : 'ДЕМОНСТРАЦИЯ';
  if (game.mode==='live') {
    $('live-root').hidden=false;
    $('demo-root').hidden=true;
    $('full-analysis').hidden=false;
    try {
      const {startLive}=await import('./live.js');
      // The live module owns visibility/pagehide/pageshow and its poller.
      await startLive($('live-root'),game);
    } catch {
      $('live-root').innerHTML='<section class="game-panel"><h2>Не удалось загрузить подключение</h2><p>Обновите страницу или откройте <a href="analysis.html#model">полный анализ LuckyJet</a>.</p></section>';
    }
    return;
  }
  $('demo-root').hidden=false; $('live-root').hidden=true;
  $('demo-settings').hidden=game.kind!=='mines';
  $('history-zone').textContent=zone==='UTC'?'UTC':'Киев';
  drawStage(null);renderHistory();
  $('run-demo').addEventListener('click',runDemo);
  $('reset-demo').addEventListener('click',resetDemo);
}
window.addEventListener('pagehide',() => {
  if(timer!==null)clearTimeout(timer);
  timer=null;
  if(running){
    running=false;
    $('run-demo').disabled=false;$('reset-demo').disabled=false;$('run-demo').textContent='Запустить демонстрацию';
    drawStage(result);
    $('demo-result').textContent='Прерванная демонстрация не записана в историю.';
  }
});
boot();
