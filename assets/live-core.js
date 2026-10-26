export const HISTORY_API = 'https://luckyjet-full-logic-v13-mpk.miuipro1993.chatgpt.site/api/rounds';
export const MAX_RECORDS = 2000;
export const STALE_MS = 180000;

export function normalizeRounds(payload, now = Date.now()) {
  if (!payload || !Array.isArray(payload.rounds)) throw new Error('Источник не вернул историю.');
  const result = [], seen = new Map();
  for (const raw of payload.rounds) {
    if (!raw || raw.id == null || !String(raw.id).trim() || typeof raw.coefficient === 'boolean') continue;
    const coefficient = Number(raw.coefficient), stamp = raw.round_timestamp;
    const timestamp = typeof stamp === 'string' && /(?:Z|[+-]\d\d:\d\d)$/i.test(stamp) ? Date.parse(stamp) : NaN;
    if (!Number.isFinite(coefficient) || coefficient < 1 || !Number.isFinite(timestamp) || timestamp <= 0 || timestamp > now) continue;
    const row = {id:String(raw.id), coefficient, timestamp, estimated:raw.estimated === true || raw.estimated === 'true', order:Number.isSafeInteger(raw.feed_order) ? raw.feed_order : 0, timeKind:'source'};
    const prior = seen.get(row.id);
    if (prior && (prior.coefficient !== row.coefficient || prior.timestamp !== row.timestamp || prior.estimated !== row.estimated || prior.order !== row.order)) throw new Error('Противоречивые результаты или метки для одного ID. Обновление остановлено.');
    if (!prior) {seen.set(row.id, row); result.push(row);}
  }
  return result;
}

export function mergeRounds(before, after, limit = MAX_RECORDS) {
  const map = new Map(before.map(row => [row.id, row]));
  for (const row of after) {
    const previous = map.get(row.id);
    if (previous && previous.coefficient !== row.coefficient) throw new Error('Источник изменил коэффициент существующей записи.');
    map.set(row.id, row);
  }
  return [...map.values()].sort((a,b) => b.timestamp-a.timestamp || b.order-a.order).slice(0,limit);
}

export function sourceStatus(rows, now = Date.now()) {
  if (!rows.length) return {kind:'empty',label:'Нет данных',age:null};
  const last = rows[0];
  if (!last || typeof last.timestamp !== 'number' || !Number.isFinite(last.timestamp)) return {kind:'stale',label:'Нет точного времени',age:null};
  const age = now - last.timestamp;
  if (last.estimated) return {kind:'estimated',label:'Время оценочное',age};
  if (age < 0 || age > STALE_MS) return {kind:'stale',label:'История устарела',age};
  return {kind:'live',label:'LIVE · наш источник',age};
}

export function historyStats(rows) {
  const n=rows.length;
  return {count:n,maximum:n?Math.max(...rows.map(r=>r.coefficient)):null,above10:n?rows.filter(r=>r.coefficient>=10).length/n:null,above100:n?rows.filter(r=>r.coefficient>=100).length/n:null};
}
