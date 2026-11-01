export function normalizeDegree(degree: number): number {
  return ((degree % 360) + 360) % 360;
}

export function circularDistance(a: number, b: number): number {
  const diff = Math.abs(normalizeDegree(a) - normalizeDegree(b));

  return Math.min(diff, 360 - diff);
}

export function circularMean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  let sinSum = 0;
  let cosSum = 0;

  for (const value of values) {
    const radian = (normalizeDegree(value) * Math.PI) / 180;

    sinSum += Math.sin(radian);
    cosSum += Math.cos(radian);
  }

  return normalizeDegree((Math.atan2(sinSum, cosSum) * 180) / Math.PI);
}

export function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);

  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1]! + sorted[middle]!) / 2;
  }

  return sorted[middle]!;
}

export function isValidDegree(degree: number): boolean {
  return Number.isFinite(degree);
}
