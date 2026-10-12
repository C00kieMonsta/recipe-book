export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Sums in integer cents so floating-point drift never reaches the result.
export function sumMoney(xs: number[]): number {
  let cents = 0;
  for (const x of xs) cents += Math.round(x * 100);
  return cents / 100;
}

export function splitTvac(tvac: number, rate: number): { htva: number; vatAmount: number } {
  const htva = round2(tvac / (1 + rate / 100));
  const vatAmount = round2(tvac - htva);
  return { htva, vatAmount };
}

const eurFormatter = new Intl.NumberFormat("fr-BE", { style: "currency", currency: "EUR" });

export function fmtEur(n: number): string {
  return eurFormatter.format(n);
}
