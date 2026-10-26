import {sourceStatus, historyStats} from './live-core.js';

// Presentation only: the same model, history and time estimate as the detailed view.
// No random coefficients, invented accuracy, or rescheduling expired estimates.
export function referenceView(state, now=Date.now()) {
  const rows=state.rows||[], status=sourceStatus(rows,now), stats=historyStats(rows);
  const ready=status.kind==='live'&&!state.error&&state.active!==false&&state.report?.status==='ready';
  const report=ready?state.report:null, wait=report?.timing?.eventWait;
  const at=wait&&Number.isFinite(state.analyzedAt)&&state.analyzedAt>0&&Number.isFinite(wait.medianMs)?state.analyzedAt+wait.medianMs:null;
  const future=at!==null&&at>now&&Number.isFinite(wait.fromAt)&&Number.isFinite(wait.toAt)&&wait.toAt>now;
  const horizon=report?.event?.horizons?.find(h=>h.rounds===5);
  return {
    latest:rows[0]||null, previous:rows[1]||null, count:rows.length,
    status:state.error?'Нет связи':state.active===false?'Пауза':status.label,
    fresh:ready, threshold:report?.event?.threshold??null,
    probability:horizon?.probability??null, frequency:stats.above10,
    estimateAt:future?at:null, fromAt:future?wait.fromAt:null, toAt:future?wait.toAt:null,
    remaining:future?at-now:null,
    progress:future?Math.max(0,Math.min(100,(now-state.analyzedAt)/wait.medianMs*100)):0,
    explanation:state.error||(!ready?'Ожидаем свежие данные для анализа.':!future?'Для временного окна пока недостаточно свежих точных меток.':'Ориентир по истории. Точное время ставки и будущий краш неизвестны.')
  };
}
