(function (root) {
  'use strict';

  // A discrete marked process: the event is a completed result >=10x; its
  // mark is that completed result. It does not inspect an in-flight game.
  const VERSION = 'recorded-marked-process-1';
  const CONTEXT = 20, MIN_RECORDS = 200, MIN_EVENTS = 15;
  const STALE_MS = 180000, MAX_DURATION_MS = 600000;
  const HORIZONS = Object.freeze([1, 3, 5, 10]);
  const TARGETS = Object.freeze([20, 50, 100]);
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const probability = p => clamp(p, 0.000001, 0.999999);
  const sigmoid = z => z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z));
  const anyProbability = (p, n) => -Math.expm1(n * Math.log1p(-clamp(p, 0, 1)));
  const exactTime = row => Number.isFinite(row.timestamp) && row.timestamp > 0 && !row.estimated && row.timeKind !== 'observed';

  function quantile(values, q) {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b), pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos), weight = pos - lo;
    return sorted[lo] * (1 - weight) + sorted[Math.min(lo + 1, sorted.length - 1)] * weight;
  }

  function prepare(rows, now) {
    if (!Array.isArray(rows)) throw new TypeError('History must be an array.');
    const seen = new Map(), tokens = [];
    let skipped = 0, duplicates = 0, excludedFuture = 0, conflicts = 0;
    for (let inputIndex = 0; inputIndex < rows.length; inputIndex++) {
      const row = rows[inputIndex];
      // Cut off known-future rows before validation, deduplication, ordering or
      // conflict decisions. Even a malformed future row cannot affect the past.
      if (row && typeof row.timestamp === 'number' && Number.isFinite(row.timestamp) && row.timestamp > now) {excludedFuture++; continue;}
      const idValid = row && (typeof row.id === 'string' && row.id.trim().length > 0 || typeof row.id === 'number' && Number.isFinite(row.id));
      const coefficientValid = row && typeof row.coefficient === 'number' && Number.isFinite(row.coefficient) && row.coefficient >= 1;
      if (!idValid || !coefficientValid) {tokens.push({valid:false, inputIndex}); skipped++; continue;}
      const id = String(row.id);
      const timestamp = typeof row.timestamp === 'number' && Number.isFinite(row.timestamp) && row.timestamp > 0 && row.timestamp <= 8640000000000000 ? row.timestamp : null;
      const estimated = row.estimated === true || row.estimated === 'true', timeKind = row.timeKind ?? 'source';
      if (seen.has(id)) {
        duplicates++;
        const previous = seen.get(id);
        if (previous.coefficient !== row.coefficient || previous.timestamp !== timestamp || previous.estimated !== estimated || previous.timeKind !== timeKind) conflicts++;
        continue;
      }
      const item = {valid:true, id, coefficient:row.coefficient, timestamp, estimated, order:Number.isSafeInteger(row.order) ? row.order : null, timeKind,inputIndex};
      seen.set(id, item); tokens.push(item);
    }
    const valid = tokens.filter(row => row.valid);
    // Input from the app is newest first. Explicit chronological source times
    // override that fallback; untimed histories may use their recorded order.
    const allTimed = valid.length > 0 && valid.every(row => row.timestamp !== null);
    const allOrdered = valid.length > 0 && valid.every(row => row.order !== null && row.order > 0) && new Set(valid.map(row => row.order)).size === valid.length;
    let ordering = allTimed ? 'source-time' : allOrdered ? 'ingestion-order' : 'input-newest-first';
    // Invalid tokens stay as barriers. Their unknown position means that no
    // duration or similar-sequence sample is certified to cross them.
    const hadInvalid = skipped > 0;
    const ordered = valid.slice().sort(allTimed
      ? (a, b) => a.timestamp - b.timestamp || (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id)
      : allOrdered ? (a, b) => a.order - b.order : (a, b) => b.inputIndex - a.inputIndex);
    const retained = [];
    for (let i = 0; i < ordered.length; i++) {
      const row = ordered[i];
      retained.push({...row, ordinal:i});
    }
    const events = retained.filter(row => row.coefficient >= 10).length;
    const exact = retained.filter(exactTime), lastAt = exact.length ? Math.max(...exact.map(row => row.timestamp)) : null;
    return {rows:retained, events, ordering, hadInvalid, skipped, duplicates, excludedFuture, conflicts, lastAt};
  }

  // All features are bounded, use only the preceding20 observed coefficients,
  // and have fixed scales. No full-sample standardization or tuning is used.
  function features(rows, end) {
    const start = Math.max(0, end - CONTEXT), n = end - start;
    if (!n) return [1, 0, 0, 0, 0, 0];
    let logSum = 0, big = 0, low = 0, lastBig = -1;
    for (let i = start; i < end; i++) {
      const c = rows[i].coefficient;
      logSum += Math.log(Math.min(c, 1000)) / Math.log(1000);
      if (c >= 10) {big++; lastBig = i;}
      if (i >= end - 5 && c < 2) low++;
    }
    const since = lastBig < 0 ? CONTEXT : end - lastBig - 1;
    return [1, Math.log(Math.min(rows[end - 1].coefficient, 1000)) / Math.log(1000), logSum / n, big / n, Math.log1p(since) / Math.log1p(CONTEXT), low / Math.min(5, n)];
  }

  function model() {return {weights:[Math.log(1 / 9),0,0,0,0,0], updates:0, count:0, events:0, bins:[0,0,0,0], marked:[]};}
  function predict(m, x) {return probability(sigmoid(m.weights.reduce((sum, weight, i) => sum + weight * x[i], 0)));}
  function baseline(m) {return (m.events + 1) / (m.count + 10);}
  function update(m, x, y, row) {
    const p = predict(m, x), learningRate = 0.12 / Math.sqrt(1 + m.updates / 400);
    for (let j = 0; j < m.weights.length; j++) m.weights[j] = clamp(m.weights[j] + learningRate * ((y - p) * x[j] - (j ? 0.02 * m.weights[j] : 0)), -8, 8);
    m.updates++; m.count++;
    if (y) {
      m.events++;
      const bin = row.coefficient < 20 ? 0 : row.coefficient < 50 ? 1 : row.coefficient < 100 ? 2 : 3;
      m.bins[bin]++; m.marked.push({coefficient:row.coefficient, features:x.slice()});
    }
  }

  function markDistribution(m, x) {
    const total = m.events + 2, baseBins = m.bins.map(n => (n + 0.5) / total);
    // Fixed kernel bandwidth and20-event shrinkage prevent a tiny context from
    // producing unsupported100% tails. Every bin is nonnegative, so tails are
    // monotone by construction. Hyperparameters are never selected on test.
    const bins = baseBins.map(p => 20 * p), samples = [];
    let sum = 0, sumSq = 0;
    for (const item of m.marked) {
      let distance = 0;
      for (let j = 1; j < x.length; j++) distance += (item.features[j] - x[j]) ** 2;
      const weight = Math.exp(-distance / (2 * 0.35 ** 2));
      const bin = item.coefficient < 20 ? 0 : item.coefficient < 50 ? 1 : item.coefficient < 100 ? 2 : 3;
      bins[bin] += weight; sum += weight; sumSq += weight * weight;
      // The shrinkage distribution is also represented in quantile weights.
      samples.push({value:item.coefficient, weight:weight + (m.events ? 20 / m.events : 0)});
    }
    const denominator = 20 + sum, probabilities = bins.map(n => n / denominator);
    function tail(b) {return [b[1] + b[2] + b[3], b[2] + b[3], b[3]];}
    const tails = tail(probabilities), baselineTails = tail(baseBins);
    function weightedQuantile(q) {
      if (!samples.length) return null;
      const sorted = samples.slice().sort((a, b) => a.value - b.value), target = samples.reduce((sum, item) => sum + item.weight, 0) * q;
      let cumulative = 0;
      for (const item of sorted) {cumulative += item.weight; if (cumulative >= target) return item.value;}
      return sorted[sorted.length - 1].value;
    }
    return {tails, baselineTails, effective:sumSq ? sum * sum / sumSq : 0, lower:weightedQuantile(.1), median:weightedQuantile(.5), upper:weightedQuantile(.9)};
  }

  function scoreAccumulator() {return {count:0, positives:0, brier:0, logLoss:0, baselineBrier:0, baselineLogLoss:0};}
  function score(s, p, b, y) {
    p = probability(p); b = probability(b);
    s.count++; s.positives += y;
    s.brier += (p - y) ** 2; s.baselineBrier += (b - y) ** 2;
    s.logLoss -= y ? Math.log(p) : Math.log1p(-p);
    s.baselineLogLoss -= y ? Math.log(b) : Math.log1p(-b);
  }
  function finishScore(s) {
    return {count:s.count, positives:s.positives, negatives:s.count-s.positives, candidateBrier:s.count ? s.brier/s.count : null, baselineBrier:s.count ? s.baselineBrier/s.count : null, candidateLogLoss:s.count ? s.logLoss/s.count : null, baselineLogLoss:s.count ? s.baselineLogLoss/s.count : null, brierGain:s.count ? (s.baselineBrier-s.brier)/s.count : null, logLossGain:s.count ? (s.baselineLogLoss-s.logLoss)/s.count : null};
  }

  function fitAndValidate(rows) {
    const n = rows.length, m = model(), split = Math.max(CONTEXT + 1, Math.floor(n * .7));
    const eventScore = scoreAccumulator(), markScores = TARGETS.map(scoreAccumulator);
    const horizons = HORIZONS.map(rounds => ({rounds, accumulator:scoreAccumulator()}));
    // The warmup is history, not a scored prediction or optimized weight fit.
    for (let i = 0; i < Math.min(CONTEXT, n); i++) {
      m.count++;
      if (rows[i].coefficient >= 10) {m.events++; m.bins[rows[i].coefficient < 20 ? 0 : rows[i].coefficient < 50 ? 1 : rows[i].coefficient < 100 ? 2 : 3]++;m.marked.push({coefficient:rows[i].coefficient,features:features(rows,i)});}
    }
    for (let i = CONTEXT; i < n; i++) {
      const x = features(rows, i), p = predict(m, x), b = baseline(m), y = rows[i].coefficient >= 10 ? 1 : 0;
      if (i >= split) {
        score(eventScore, p, b, y);
        for (const h of horizons) {
          if ((i-split) % h.rounds === 0 && i + h.rounds <= n) {
            const hit = rows.slice(i, i+h.rounds).some(row => row.coefficient >= 10) ? 1 : 0;
            score(h.accumulator, anyProbability(p,h.rounds), anyProbability(b,h.rounds), hit);
          }
        }
        // Condition only for evaluation. The row is scored BEFORE it is fed to
        // either the candidate or expanding baseline mark distribution.
        if (y) {
          const marks = markDistribution(m, x);
          TARGETS.forEach((target,j) => score(markScores[j], marks.tails[j], marks.baselineTails[j], rows[i].coefficient >= target ? 1 : 0));
        }
      }
      update(m, x, y, rows[i]);
    }
    const event = finishScore(eventScore), marks = markScores.map((s,i) => ({target:TARGETS[i],...finishScore(s)}));
    event.horizons = horizons.map(h => ({rounds:h.rounds,...finishScore(h.accumulator)}));
    const sufficient = event.count >= 300 && event.positives >= 30 && event.negatives >= 30;
    const advantage = sufficient && event.brierGain > 0 && event.logLossGain > 0;
    const markedCount = marks[0].count;
    return {model:m, validation:{method:'chronological-prequential-last-30-percent', trainingRecords:Math.min(split,n), testRecords:event.count, testEvents:event.positives, fromAt:rows[split]?.timestamp ?? null, toAt:rows[n-1]?.timestamp ?? null, event, marks:{count:markedCount, thresholds:marks, candidateBrier:markedCount ? marks.reduce((sum,s) => sum+s.candidateBrier,0)/marks.length : null, baselineBrier:markedCount ? marks.reduce((sum,s) => sum+s.baselineBrier,0)/marks.length : null, evidence:markedCount >= 30 && marks.every(s => s.positives >= 5 && s.negatives >= 5) ? 'preliminary' : 'insufficient'}, evidence:sufficient ? (advantage ? 'preliminary-improvement' : 'no-improvement') : 'insufficient', advantage, assumption:'Последние30% проверены по времени: прогноз до раскрытия результата, затем обновление. Сравнение с растущей частотой; параметры заранее фиксированы. Улучшение оценок на этой выборке не подтверждает точность будущих ставок. Горизонты проверяются без перекрытия внутри каждого горизонта.'}};
  }

  function durationData(rows, forbidPairs) {
    const segments = [], intervals = []; let segment = [], excluded = 0;
    for (let i = 1; i < rows.length; i++) {
      const previous = rows[i-1], current = rows[i], gap = current.timestamp - previous.timestamp;
      const usable = !forbidPairs && current.ordinal === previous.ordinal+1 && exactTime(previous) && exactTime(current) && gap > 0 && gap <= MAX_DURATION_MS;
      if (usable) {intervals.push(gap); segment.push(gap);}
      else {if (segment.length) segments.push(segment); segment=[]; excluded++;}
    }
    if (segment.length) segments.push(segment);
    return {segments, intervals, excluded};
  }

  function timingEstimate(data, p, now, lastAt) {
    if (data.intervals.length < 30 || lastAt === null) return {status:'insufficient',pairs:data.intervals.length,horizons:[],eventWait:null,assumption:'Для времени нужны30 соседних точных меток; оцениваются интервалы завершённых результатов, а не время входа.'};
    const elapsedMs = Math.max(0, now-lastAt), remaining = data.intervals.filter(ms=>ms>elapsedMs).map(ms=>ms-elapsedMs);
    if (remaining.length < 10) return {status:'insufficient',pairs:data.intervals.length,elapsedMs,residualSamples:remaining.length,horizons:[],eventWait:null,assumption:'С последнего завершённого результата прошло больше времени, чем поддерживает достаточная часть выборки. Окно не переносится автоматически вперёд; для условной оставшейся длительности нужны10 исторических интервалов длиннее уже прошедшего времени.'};
    const median = quantile(data.intervals,.5), lower = quantile(data.intervals,.1), upper = quantile(data.intervals,.9);
    const residualMedian=quantile(remaining,.5),residualLower=quantile(remaining,.1),residualUpper=quantile(remaining,.9);
    const horizons = HORIZONS.map(rounds => {
      const sums = [];
      for (const segment of data.segments) {
        // Condition the first completion on surviving the already elapsed time,
        // then subtract that time. Never restart the clock from now+full gap.
        for (let start=0;start+rounds<=segment.length;start++) {if(segment[start]<=elapsedMs)continue;let sum=-elapsedMs;for(let j=0;j<rounds;j++)sum+=segment[start+j];sums.push(sum);}
      }
      const enough=sums.length>=10;
      return {rounds, samples:sums.length, medianMs:enough ? quantile(sums,.5) : null,lowerMs:enough ? quantile(sums,.1) : null,upperMs:enough ? quantile(sums,.9) : null,fromAt:enough ? now+quantile(sums,.1) : null,toAt:enough ? now+quantile(sums,.9) : null};
    });
    function waits(q) {return Math.max(1,Math.ceil(Math.log1p(-q)/Math.log1p(-p)));}
    const lowerRounds=waits(.1),medianRounds=waits(.5),upperRounds=waits(.9);
    const lowerMs=residualLower+(lowerRounds-1)*lower,medianMs=residualMedian+(medianRounds-1)*median,upperMs=residualUpper+(upperRounds-1)*upper;
    return {status:'ready',pairs:data.intervals.length,elapsedMs,residualSamples:remaining.length,durationMedianMs:median,durationLowerMs:lower,durationUpperMs:upper,horizons,eventWait:{lowerRounds,medianRounds,upperRounds,medianMs,lowerMs,upperMs,fromAt:now+lowerMs,toAt:now+upperMs},assumption:'Примерное окно завершения результата по соседним точным меткам. Уже прошедшее время вычтено; первая длительность условна на отсутствие нового завершения. Для1/3/5/10 записей:10–90% исторических сумм. До10×+: геометрическое ожидание с неизменной текущей вероятностью и грубый перевод по длительностям; покрытие не откалибровано. Интервалы>10мин исключены. Текущий раунд и точный момент входа неизвестны.'};
  }

  function similarSequences(rows, forbidSegments) {
    const context=8, continuation=10, n=rows.length, currentStart=n-context;
    if (n < context*2+continuation || forbidSegments) return {context,continuation,matches:[],count:0,bigShare:null,assumption:'Недостаточно непрерывных доступных записей для похожих участков.'};
    const current=rows.slice(currentStart).map(row=>Math.log(Math.min(row.coefficient,1000))/Math.log(1000));
    const candidates=[];
    for (let end=context-1;end+continuation<currentStart;end++) {
      const start=end-context+1,last=end+continuation;
      let contiguous=true;
      for(let i=start+1;i<=last;i++)if(rows[i].ordinal!==rows[i-1].ordinal+1)contiguous=false;
      if(!contiguous)continue;
      let distance=0;for(let j=0;j<context;j++)distance+=(Math.log(Math.min(rows[start+j].coefficient,1000))/Math.log(1000)-current[j])**2;
      const following=rows.slice(end+1,last+1), maximum=following.reduce((a,b)=>b.coefficient>a.coefficient?b:a,following[0]);
      const first=following.findIndex(row=>row.coefficient>=10);
      candidates.push({start,last,endId:rows[end].id,endAt:rows[end].timestamp,distance:Math.sqrt(distance/context),outcomeId:maximum.id,outcomeAt:maximum.timestamp,maxCoefficient:maximum.coefficient,firstBigRound:first<0?null:first+1});
    }
    candidates.sort((a,b)=>a.distance-b.distance||a.start-b.start);
    const picked=[];
    for(const candidate of candidates){if(picked.every(other=>candidate.last<other.start||candidate.start>other.last))picked.push(candidate);if(picked.length===6)break;}
    return {context,continuation,matches:picked,count:picked.length,bigShare:picked.length?picked.filter(item=>item.firstBigRound!==null).length/picked.length:null,assumption:'6 ближайших неперекрывающихся прошлых участков по8 коэффициентам и их следующие10 доступных записей. Продолжения полностью раньше текущего контекста. Сходство не является проверенной вероятностью.'};
  }

  function analyze(input, options={}) {
    const now = options.now === undefined ? Date.now() : options.now;
    if (!Number.isFinite(now) || now<=0) throw new RangeError('now must be a positive timestamp.');
    const prepared=prepare(input,now), rows=prepared.rows, gameOrderVerified=options.gameOrderVerified===true;
    const data=durationData(rows,prepared.hadInvalid), exact=rows.filter(exactTime), estimatedRecords=rows.filter(row=>!exactTime(row)).length;
    const ageMs=prepared.lastAt===null?null:Math.max(0,now-prepared.lastAt);
    const warnings=[];
    if(!gameOrderVerified)warnings.push('Порядок и полнота игровых раундов не подтверждены; далее используются позиции доступных записей.');
    if(prepared.skipped)warnings.push('Некорректные записи исключены; время и похожие участки не рассчитываются через неизвестные разрывы.');
    if(estimatedRecords)warnings.push('Оценочные/наблюдённые метки исключены из расчёта длительности.');
    if(prepared.excludedFuture)warnings.push('Записи позже момента расчёта исключены.');
    if(prepared.conflicts)warnings.push('Противоречивые коэффициент или время одногоID: модель остановлена.');
    if(ageMs===null||ageMs>STALE_MS)warnings.push('Нет свежей точной метки: текущий прогноз скрыт.');
    const quality={records:rows.length,events:prepared.events,timedRecords:exact.length,estimatedRecords,skipped:prepared.skipped,excludedFuture:prepared.excludedFuture,duplicates:prepared.duplicates,durationPairs:data.intervals.length,excludedDurationPairs:data.excluded,lastAt:prepared.lastAt,ageMs,gameOrderVerified,ordering:prepared.ordering,scope:gameOrderVerified?'verified-game-rounds':'available-recorded-positions',warnings};
    const fit=fitAndValidate(rows), validation=fit.validation, similar=similarSequences(rows,prepared.hadInvalid);
    const enough=rows.length>=MIN_RECORDS&&prepared.events>=MIN_EVENTS;
    const status=prepared.conflicts?'invalid':!enough?'insufficient':ageMs===null||ageMs>STALE_MS?'stale':'ready';
    let event=null,marks=null,timing=null;
    if(status==='ready') {
      const x=features(rows,rows.length),p=predict(fit.model,x),base=baseline(fit.model),distribution=markDistribution(fit.model,x);
      event={threshold:10,nextProbability:p,baselineProbability:base,horizons:HORIZONS.map(rounds=>({rounds,probability:anyProbability(p,rounds),baselineProbability:anyProbability(base,rounds)})),assumption:'Дискретный экспериментальный процесс по доступным записям. Для нескольких записей текущая вероятность10×+ считается неизменной:1−(1−p)^n. Это модельное допущение, не точная вероятность игрового раунда.'};
      marks={events:prepared.events,effectiveEvents:distribution.effective,thresholds:TARGETS.map((target,j)=>({target,conditionalProbability:distribution.tails[j],baselineConditionalProbability:distribution.baselineTails[j],baselineProbability:distribution.baselineTails[j],baselineNextProbability:base*distribution.baselineTails[j],nextProbability:p*distribution.tails[j]})),median:distribution.median,lower:distribution.lower,upper:distribution.upper,assumption:'Условно на10×+: сглаженное распределение прошлых крупных результатов с весами похожести предыдущего контекста.10–90% взвешенной истории не являются гарантированным диапазоном следующего коэффициента.'};
      timing=timingEstimate(data,p,now,prepared.lastAt);
    }
    return {version:VERSION,status,minimums:{records:MIN_RECORDS,events:MIN_EVENTS,validationRecords:300,validationEvents:30,validationNonEvents:30,durationPairs:30},quality,event,marks,timing,similar,validation};
  }

  root.LuckyJetMarked=Object.freeze({analyze,version:VERSION});
})(typeof window==='undefined'?globalThis:window);
