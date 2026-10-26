// Independent local demonstration mechanics. These are not game predictions.
export const DEMO_VERSION = 'local-demonstration-v1';
export const DEMO_KINDS = Object.freeze(['mines', 'towers', 'coin', 'cups', 'football', 'flight']);

function unit(rng) {
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Demo RNG must return a value from 0 inclusive to 1 exclusive.');
  return value;
}

function integer(max, rng) {return Math.floor(unit(rng) * max);}

function shuffled(count, rng) {
  const values = Array.from({length:count}, (_, index) => index);
  for (let index = count - 1; index > 0; index--) {
    const other = integer(index + 1, rng);
    [values[index], values[other]] = [values[other], values[index]];
  }
  return values;
}

export function createDemo(kind, options = {}, rng = Math.random) {
  if (!DEMO_KINDS.includes(kind)) throw new RangeError('Unknown demonstration kind.');
  if (typeof rng !== 'function') throw new TypeError('A demo RNG function is required.');
  if (kind === 'mines') {
    const count = options.hazards === undefined ? 3 : options.hazards;
    if (!Number.isInteger(count) || count < 1 || count > 10) throw new RangeError('Choose from 1 to 10 simulated mines.');
    const cells = shuffled(25, rng);
    return {kind, hazardCount:count, hazards:cells.slice(0, count).sort((a,b) => a-b), safeCells:cells.slice(count, count + 5).sort((a,b) => a-b), label:'Учебное поле · ' + count + ' мин'};
  }
  if (kind === 'towers') {
    const path = Array.from({length:8}, () => integer(3, rng));
    return {kind, path, label:'Учебный маршрут · 8 уровней'};
  }
  if (kind === 'coin') {
    const side = integer(2, rng);
    return {kind, side, label:side ? 'Решка' : 'Орёл'};
  }
  if (kind === 'cups') {
    const selected = integer(3, rng);
    return {kind, selected, label:'Шар под напёрстком №' + (selected + 1)};
  }
  if (kind === 'football') {
    const selected = integer(9, rng);
    return {kind, selected, label:'Учебная цель · сектор №' + (selected + 1)};
  }
  const coefficient = Math.round((1.01 + unit(rng) * 23.99) * 100) / 100;
  return {kind, coefficient, label:coefficient.toFixed(2) + '× · учебное значение'};
}

export function cleanDemoHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(entry => entry && typeof entry.at === 'number' && Number.isFinite(entry.at) && entry.at > 0 && typeof entry.label === 'string' && entry.label.trim().length > 0 && entry.label.length <= 120)
    .slice(0,10).map(entry => ({at:entry.at, label:entry.label}));
}
