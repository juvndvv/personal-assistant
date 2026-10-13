export interface Domain {
  min: number;
  max: number;
}

export interface NiceDomain extends Domain {
  ticks: number[];
}

const NICE_FACTORS = [1, 2, 2.5, 5, 10];

export function niceDomain(values: readonly (number | null)[], targetTicks = 4): NiceDomain {
  const present = values.filter((value): value is number => value !== null);
  const low = Math.min(0, ...present);
  const high = Math.max(0, ...present);
  if (low === high) {
    return { min: 0, max: 1, ticks: [0, 1] };
  }
  const { step, min, max } = bestStep(low, high, targetTicks);
  const ticks: number[] = [];
  for (let tick = min; tick <= max + step / 2; tick += step) {
    ticks.push(Math.round(tick));
  }
  return { min, max, ticks };
}

export function linearScale(
  domain: Domain,
  rangeStart: number,
  rangeEnd: number,
): (value: number) => number {
  const span = domain.max - domain.min || 1;
  return (value) => rangeStart + ((value - domain.min) / span) * (rangeEnd - rangeStart);
}

function bestStep(
  low: number,
  high: number,
  targetTicks: number,
): { step: number; min: number; max: number } {
  const magnitude = 10 ** Math.floor(Math.log10((high - low) / targetTicks));
  const candidates = NICE_FACTORS.map((factor) => {
    const step = factor * magnitude;
    const min = Math.floor(low / step) * step;
    const max = Math.ceil(high / step) * step;
    const intervals = Math.round((max - min) / step);
    return { step, min, max, misfit: Math.max(0, Math.abs(intervals - targetTicks) - 1) };
  });
  return candidates.reduce((best, candidate) =>
    candidate.misfit < best.misfit ||
    (candidate.misfit === best.misfit && candidate.max - candidate.min < best.max - best.min)
      ? candidate
      : best,
  );
}
