/**
 * ベイズ的なCVR有意差判定(Beta-Binomialモデル + モンテカルロ)
 *
 * 各variantのCVR(view→cv)をBeta(1+cv, 1+(view-cv))の事後分布とみなし、
 * サンプリングして「そのvariantが最良である確率」(probabilityBest)を求める。
 * 頻度論的なp値検定と違い、データが増えるたびに覗き見しても誤判定率が
 * 上がりにくいため、配信を止めずに随時判定できる。
 */

// Workers無料枠のCPU時間制限(10ms/リクエスト)内に収める想定の反復回数。
// N=4000程度で各variantの勝率推定の標準誤差はおよそ1%前後。
const MONTE_CARLO_ITERATIONS = 4000;

// 「勝者」を確定と見なす最低条件。Bayesian手法でも極端に少ないサンプルでの
// 誤判定を避けるため、件数の下限とprobabilityBestの閾値の両方を課す。
const MIN_VIEWS_PER_VARIANT = 100;
const WINNER_PROBABILITY_THRESHOLD = 0.95;

export interface VariantCounts {
  variant: string;
  views: number;
  cv: number;
}

export interface VariantStats extends VariantCounts {
  cvr: number;
  probabilityBest: number;
  credibleInterval: [number, number];
}

export interface StatsResult {
  variants: VariantStats[];
  winner: string | null;
  minSampleReached: boolean;
}

// Marsaglia-Tsang法によるGamma(shape, 1)サンプリング。shape>=1が前提
// (alpha=1+cv、beta=1+(views-cv)は常に1以上になるためこの条件を満たす)。
function sampleGamma(shape: number): number {
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      // Box-Muller法で標準正規乱数を1つ生成
      const u1 = Math.random();
      const u2 = Math.random();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function sampleBeta(alpha: number, beta: number): number {
  const x = sampleGamma(alpha);
  const y = sampleGamma(beta);
  return x / (x + y);
}

function quantile(sortedValues: number[], q: number): number {
  const idx = Math.min(sortedValues.length - 1, Math.max(0, Math.floor(q * sortedValues.length)));
  return sortedValues[idx];
}

export function computeStats(counts: VariantCounts[]): StatsResult {
  const n = counts.length;
  const winCounts = new Array(n).fill(0);
  const samplesByVariant: number[][] = counts.map(() => []);

  for (let i = 0; i < MONTE_CARLO_ITERATIONS; i++) {
    let bestIdx = 0;
    let bestValue = -Infinity;
    for (let v = 0; v < n; v++) {
      const { views, cv } = counts[v];
      const sample = sampleBeta(1 + cv, 1 + Math.max(0, views - cv));
      samplesByVariant[v].push(sample);
      if (sample > bestValue) {
        bestValue = sample;
        bestIdx = v;
      }
    }
    winCounts[bestIdx]++;
  }

  const minSampleReached = counts.every((c) => c.views >= MIN_VIEWS_PER_VARIANT);

  const variants: VariantStats[] = counts.map((c, i) => {
    const sorted = samplesByVariant[i].slice().sort((a, b) => a - b);
    return {
      ...c,
      cvr: c.views > 0 ? c.cv / c.views : 0,
      probabilityBest: winCounts[i] / MONTE_CARLO_ITERATIONS,
      credibleInterval: [quantile(sorted, 0.025), quantile(sorted, 0.975)],
    };
  });

  let winner: string | null = null;
  if (minSampleReached) {
    const top = variants.reduce((a, b) => (b.probabilityBest > a.probabilityBest ? b : a));
    if (top.probabilityBest >= WINNER_PROBABILITY_THRESHOLD) winner = top.variant;
  }

  return { variants, winner, minSampleReached };
}
