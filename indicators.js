/* Gold Trade Chart — インジケーターの計算
 *
 * 画面とは切り離してあり、ブラウザでも Node.js でも動く(検証用)。
 * 各インジケーターは { name, group, overlay, params, compute } で定義する。
 *   overlay: true  → ローソク足の上に重ねる
 *   overlay: false → 専用のペインに描く
 * compute(bars, p) の返り値:
 *   lines: [{ name, val, color, width?, dash?, dots?, offset? }]
 *          offset は足何本ぶん左右にずらして描くか(一目均衡表の先行・遅行スパン用)
 *   fill:  { a, b, color, color2? }  lines[a] と lines[b] の間を塗る
 *   hist:  棒グラフの値 / histDir: 棒ごとの色の向き(+1 = 上げの色、-1 = 下げの色)
 *   bands: 水平の基準線 / fixed: 縦軸の範囲を固定する [下, 上]
 *   label: 凡例に出す設定値
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GTIndicators = api;
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const UP = '#26a69a', DOWN = '#ef5350';
const nans = n => new Array(n).fill(NaN);
const int = (v, d) => Math.max(1, Math.round(+v) || d || 1);

// ---------------------------------------------------------------- 基本の計算
function sma(a, n) {
  const out = nans(a.length);
  let sum = 0, cnt = 0;
  for (let i = 0; i < a.length; i++) {
    if (!isFinite(a[i])) { sum = 0; cnt = 0; continue; }
    sum += a[i]; cnt++;
    if (cnt > n) { sum -= a[i - n]; cnt--; }
    if (cnt === n) out[i] = sum / n;
  }
  return out;
}
// alpha を省略すると RMA(Wilder の平滑化、alpha = 1/n)。最初の値は n 本の単純平均
function rma(a, n, alpha) {
  const k = alpha || 1 / n, out = nans(a.length);
  let prev = NaN, sum = 0, cnt = 0;
  for (let i = 0; i < a.length; i++) {
    if (!isFinite(a[i])) continue;
    if (!isFinite(prev)) {
      sum += a[i]; cnt++;
      if (cnt === n) { prev = sum / n; out[i] = prev; }
    } else { prev = k * a[i] + (1 - k) * prev; out[i] = prev; }
  }
  return out;
}
const ema = (a, n) => rma(a, n, 2 / (n + 1));
function wma(a, n) {
  const out = nans(a.length), den = n * (n + 1) / 2;
  for (let i = n - 1; i < a.length; i++) {
    let s = 0, ok = true;
    for (let k = 0; k < n; k++) { const v = a[i - k]; if (!isFinite(v)) { ok = false; break; } s += v * (n - k); }
    if (ok) out[i] = s / den;
  }
  return out;
}
// 窓の中に欠けた値があれば NaN を返す、移動する集計
function rolling(a, n, fn) {
  const out = nans(a.length);
  for (let i = n - 1; i < a.length; i++) {
    let ok = true;
    for (let k = i - n + 1; k <= i; k++) if (!isFinite(a[k])) { ok = false; break; }
    if (ok) out[i] = fn(a, i - n + 1, i);
  }
  return out;
}
const highest = (a, n) => rolling(a, n, (x, s, e) => { let m = -Infinity; for (let k = s; k <= e; k++) if (x[k] > m) m = x[k]; return m; });
const lowest = (a, n) => rolling(a, n, (x, s, e) => { let m = Infinity; for (let k = s; k <= e; k++) if (x[k] < m) m = x[k]; return m; });
const sum = (a, n) => rolling(a, n, (x, s, e) => { let t = 0; for (let k = s; k <= e; k++) t += x[k]; return t; });
// 標準偏差(母集団:n で割る)
const stdev = (a, n) => rolling(a, n, (x, s, e) => {
  let m = 0; for (let k = s; k <= e; k++) m += x[k]; m /= n;
  let v = 0; for (let k = s; k <= e; k++) v += (x[k] - m) * (x[k] - m);
  return Math.sqrt(v / n);
});
function src(b, s) {
  switch (s) {
    case 'open': return b.o;
    case 'high': return b.h;
    case 'low': return b.l;
    case 'hl2': return (b.h + b.l) / 2;
    case 'hlc3': return (b.h + b.l + b.c) / 3;
    case 'ohlc4': return (b.o + b.h + b.l + b.c) / 4;
    default: return b.c;
  }
}
const col = (bars, s) => bars.map(b => src(b, s));
// 真の値幅。足と足の間の飛び(窓)も値動きとして数える
function trueRange(bars) {
  return bars.map((b, i) => {
    if (!i) return b.h - b.l;
    const pc = bars[i - 1].c;
    return Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc));
  });
}
const atr = (bars, n) => rma(trueRange(bars), n);
function rsi(a, n) {
  const up = [NaN], dn = [NaN];
  for (let i = 1; i < a.length; i++) { const d = a[i] - a[i - 1]; up.push(Math.max(d, 0)); dn.push(Math.max(-d, 0)); }
  const au = rma(up, n), ad = rma(dn, n);
  return au.map((u, i) => (!isFinite(u) ? NaN : ad[i] === 0 ? 100 : 100 - 100 / (1 + u / ad[i])));
}
const map2 = (a, b, fn) => a.map((v, i) => (isFinite(v) && isFinite(b[i]) ? fn(v, b[i], i) : NaN));

// 設定項目の共通部品
const P = {
  len: (def, label) => ({ key: 'len', label: label || '期間', type: 'int', def, min: 1, max: 500 }),
  source: () => ({ key: 'source', label: 'ソース', type: 'source', def: 'close' }),
  color: (key, label, def) => ({ key, label, type: 'color', def }),
  num: (key, label, def, min, max, step, hint) => ({ key, label, type: 'num', def, min, max, step, hint }),
  int: (key, label, def, hint) => ({ key, label, type: 'int', def, min: 1, max: 500, hint }),
};

// ---------------------------------------------------------------- 定義
const DEFS = {};

// ===== トレンド(重ねて表示) =====
DEFS.bb = {
  name: 'ボリンジャーバンド', short: 'BB', group: 'volatility', overlay: true,
  desc: '移動平均線の上下に、値動きのばらつきの幅で線を引く',
  params: [P.len(20), P.num('mult', '幅(標準偏差の何倍か)', 2, 0.1, 10, 0.1), P.source(),
    P.color('cMid', '中心線の色', '#f5a623'), P.color('cBand', '上下の線の色', '#2f80ed')],
  compute(bars, p) {
    const n = int(p.len, 20), a = col(bars, p.source), mid = sma(a, n), sd = stdev(a, n);
    return {
      lines: [
        { name: '上', val: map2(mid, sd, (m, s) => m + p.mult * s), color: p.cBand },
        { name: '中', val: mid, color: p.cMid },
        { name: '下', val: map2(mid, sd, (m, s) => m - p.mult * s), color: p.cBand },
      ],
      fill: { a: 0, b: 2, color: p.cBand }, label: `${n} ${p.mult}`,
    };
  },
};
DEFS.ichimoku = {
  name: '一目均衡表', short: '一目', group: 'trend', overlay: true,
  desc: '5本の線と「雲」で、流れ・支え・時間を見る',
  params: [P.int('conv', '転換線の期間', 9), P.int('base', '基準線の期間', 26), P.int('spanB', '先行スパンB の期間', 52),
    P.int('shift', 'ずらす本数', 26, '先行スパンを右へ、遅行スパンを左へずらす本数'),
    P.color('cConv', '転換線の色', '#2f80ed'), P.color('cBase', '基準線の色', '#c0392b'),
    P.color('cA', '先行スパンA(雲が上向き)の色', '#26a69a'), P.color('cB', '先行スパンB(雲が下向き)の色', '#ef5350'),
    P.color('cLag', '遅行スパンの色', '#8e44ad')],
  compute(bars, p) {
    const h = col(bars, 'high'), l = col(bars, 'low'), c = col(bars, 'close');
    const mid = n => map2(highest(h, n), lowest(l, n), (x, y) => (x + y) / 2);
    const conv = mid(int(p.conv, 9)), base = mid(int(p.base, 26)), sh = int(p.shift, 26);
    return {
      lines: [
        { name: '転換', val: conv, color: p.cConv },
        { name: '基準', val: base, color: p.cBase },
        { name: '先行A', val: map2(conv, base, (x, y) => (x + y) / 2), color: p.cA, offset: sh, width: 1 },
        { name: '先行B', val: mid(int(p.spanB, 52)), color: p.cB, offset: sh, width: 1 },
        { name: '遅行', val: c, color: p.cLag, offset: -sh, width: 1 },
      ],
      fill: { a: 2, b: 3, color: p.cA, color2: p.cB }, label: `${p.conv} ${p.base} ${p.spanB}`,
    };
  },
};
DEFS.psar = {
  name: 'パラボリック SAR', short: 'SAR', group: 'trend', overlay: true,
  desc: '流れの向きと、損切りを引き上げる位置の目安を点で示す',
  params: [P.num('start', '加速因子の初期値', 0.02, 0.001, 1, 0.01), P.num('step', '加速因子の増え方', 0.02, 0.001, 1, 0.01),
    P.num('max', '加速因子の上限', 0.2, 0.01, 2, 0.01), P.color('color', '点の色', '#2f80ed')],
  compute(bars, p) {
    const n = bars.length, out = nans(n);
    if (n < 3) return { lines: [{ name: 'SAR', val: out, color: p.color, dots: true }], label: `${p.start} ${p.max}` };
    // 手順は TA-Lib の SAR と同じ。最初の向きは、最初の2本の高値・安値の動きで決める
    const upMove = bars[1].h - bars[0].h, downMove = bars[0].l - bars[1].l;
    let long = !(downMove > upMove && downMove > 0);
    let ep = long ? bars[1].h : bars[1].l, sar = long ? bars[0].l : bars[0].h, af = p.start;
    let newLow = bars[1].l, newHigh = bars[1].h;
    for (let i = 1; i < n; i++) {
      const prevLow = newLow, prevHigh = newHigh;
      newLow = bars[i].l; newHigh = bars[i].h;
      if (long) {
        if (newLow <= sar) {
          // 安値が SAR に届いた:下降に切り替え。新しい SAR は、それまでの最高値から始める
          long = false; sar = Math.max(ep, prevHigh, newHigh);
          out[i] = sar; af = p.start; ep = newLow;
          sar = Math.max(sar + af * (ep - sar), prevHigh, newHigh);
        } else {
          out[i] = sar;
          if (newHigh > ep) { ep = newHigh; af = Math.min(af + p.step, p.max); }
          // 上昇中の SAR は、直前2本の安値より上には置かない
          sar = Math.min(sar + af * (ep - sar), prevLow, newLow);
        }
      } else if (newHigh >= sar) {
        long = true; sar = Math.min(ep, prevLow, newLow);
        out[i] = sar; af = p.start; ep = newHigh;
        sar = Math.min(sar + af * (ep - sar), prevLow, newLow);
      } else {
        out[i] = sar;
        if (newLow < ep) { ep = newLow; af = Math.min(af + p.step, p.max); }
        sar = Math.max(sar + af * (ep - sar), prevHigh, newHigh);
      }
    }
    return { lines: [{ name: 'SAR', val: out, color: p.color, dots: true }], label: `${p.start} ${p.max}` };
  },
};
DEFS.supertrend = {
  name: 'スーパートレンド', short: 'ST', group: 'trend', overlay: true,
  desc: 'ATR を使って、流れの向きと切り替わりを1本の線で示す',
  params: [P.int('atrLen', 'ATR の期間', 10), P.num('mult', 'ATR の何倍離すか', 3, 0.1, 20, 0.1),
    P.color('cUp', '上昇中の色', UP), P.color('cDown', '下降中の色', DOWN)],
  compute(bars, p) {
    const n = bars.length, a = atr(bars, int(p.atrLen, 10)), upL = nans(n), dnL = nans(n);
    let fu = NaN, fl = NaN, dir = 1;
    for (let i = 0; i < n; i++) {
      if (!isFinite(a[i])) continue;
      const hl2 = (bars[i].h + bars[i].l) / 2, bu = hl2 + p.mult * a[i], bl = hl2 - p.mult * a[i];
      const pc = i ? bars[i - 1].c : bars[i].c;
      // 帯は、流れが続くかぎり価格に近づく方向にしか動かさない
      const nfu = !isFinite(fu) || bu < fu || pc > fu ? bu : fu;
      const nfl = !isFinite(fl) || bl > fl || pc < fl ? bl : fl;
      if (isFinite(fu)) dir = dir < 0 ? (bars[i].c > nfu ? 1 : -1) : (bars[i].c < nfl ? -1 : 1);
      else dir = bars[i].c >= hl2 ? 1 : -1;
      fu = nfu; fl = nfl;
      if (dir > 0) upL[i] = fl; else dnL[i] = fu;
    }
    return {
      lines: [{ name: '上昇', val: upL, color: p.cUp, width: 2 }, { name: '下降', val: dnL, color: p.cDown, width: 2 }],
      label: `${p.atrLen} ${p.mult}`,
    };
  },
};
DEFS.donchian = {
  name: 'ドンチャンチャネル', short: 'DC', group: 'trend', overlay: true,
  desc: '過去の高値と安値を結んだ帯。高値・安値の更新が一目で分かる',
  params: [P.len(20), P.color('color', '線の色', '#2f80ed')],
  compute(bars, p) {
    const n = int(p.len, 20), u = highest(col(bars, 'high'), n), l = lowest(col(bars, 'low'), n);
    return {
      lines: [{ name: '上', val: u, color: p.color }, { name: '中', val: map2(u, l, (x, y) => (x + y) / 2), color: p.color, dash: [4, 4], width: 1 },
        { name: '下', val: l, color: p.color }],
      fill: { a: 0, b: 2, color: p.color }, label: String(n),
    };
  },
};
DEFS.keltner = {
  name: 'ケルトナーチャネル', short: 'KC', group: 'volatility', overlay: true,
  desc: '指数移動平均線の上下に、ATR の幅で線を引く',
  params: [P.len(20, 'EMA の期間'), P.int('atrLen', 'ATR の期間', 10), P.num('mult', 'ATR の何倍離すか', 2, 0.1, 20, 0.1), P.source(),
    P.color('color', '線の色', '#8e44ad')],
  compute(bars, p) {
    const mid = ema(col(bars, p.source), int(p.len, 20)), a = atr(bars, int(p.atrLen, 10));
    return {
      lines: [{ name: '上', val: map2(mid, a, (m, x) => m + p.mult * x), color: p.color }, { name: '中', val: mid, color: p.color, width: 1 },
        { name: '下', val: map2(mid, a, (m, x) => m - p.mult * x), color: p.color }],
      fill: { a: 0, b: 2, color: p.color }, label: `${p.len} ${p.atrLen} ${p.mult}`,
    };
  },
};
DEFS.vwap = {
  name: 'VWAP(出来高加重平均価格)', short: 'VWAP', group: 'volume', overlay: true,
  desc: '期間内に売買された価格を、出来高で重みづけした平均',
  params: [{ key: 'anchor', label: '計算をやり直す区切り', type: 'select', def: 'auto',
    options: [['auto', '自動(時間足に合わせる)'], ['day', '1日ごと'], ['week', '1週間ごと'], ['month', '1か月ごと']] },
    P.color('color', '線の色', '#e67e22')],
  compute(bars, p) {
    const n = bars.length, out = nans(n);
    let anchor = p.anchor;
    if (anchor === 'auto') {
      const step = n > 1 ? bars[1].t - bars[0].t : 864e5;
      anchor = step < 864e5 ? 'day' : step < 6048e5 ? 'week' : 'month';
    }
    const keyOf = t => {
      const d = new Date(t);
      if (anchor === 'month') return d.getUTCFullYear() * 12 + d.getUTCMonth();
      const day = Math.floor(t / 864e5);
      return anchor === 'week' ? Math.floor((day + 3) / 7) : day; // 週は月曜始まり
    };
    let key = null, pv = 0, vol = 0;
    for (let i = 0; i < n; i++) {
      const k = keyOf(bars[i].t);
      if (k !== key) { key = k; pv = 0; vol = 0; }
      pv += (bars[i].h + bars[i].l + bars[i].c) / 3 * bars[i].v; vol += bars[i].v;
      if (vol > 0) out[i] = pv / vol;
    }
    return { lines: [{ name: 'VWAP', val: out, color: p.color, width: 1.8 }], label: { day: '1日', week: '1週間', month: '1か月' }[anchor] };
  },
};

// ===== オシレーター(勢い) =====
DEFS.stoch = {
  name: 'ストキャスティクス', short: 'Stoch', group: 'momentum',
  desc: '直近の高値と安値の幅の中で、終値がどの位置にあるか',
  params: [P.int('kLen', '%K の期間', 14), P.int('kSmooth', '%K をならす期間', 1), P.int('dLen', '%D の期間', 3),
    P.num('upper', '上の基準線', 80, 50, 100, 1), P.num('lower', '下の基準線', 20, 0, 50, 1),
    P.color('cK', '%K の色', '#2f80ed'), P.color('cD', '%D の色', '#f5a623')],
  compute(bars, p) {
    const n = int(p.kLen, 14), hh = highest(col(bars, 'high'), n), ll = lowest(col(bars, 'low'), n);
    const raw = bars.map((b, i) => (!isFinite(hh[i]) ? NaN : hh[i] === ll[i] ? 50 : 100 * (b.c - ll[i]) / (hh[i] - ll[i])));
    const k = sma(raw, int(p.kSmooth, 1)), d = sma(k, int(p.dLen, 3));
    return { lines: [{ name: '%K', val: k, color: p.cK }, { name: '%D', val: d, color: p.cD }], bands: [+p.upper, +p.lower], fixed: [0, 100], label: `${p.kLen} ${p.kSmooth} ${p.dLen}` };
  },
};
DEFS.stochrsi = {
  name: 'ストキャスティクス RSI', short: 'StochRSI', group: 'momentum',
  desc: 'RSI に、さらにストキャスティクスの計算をかけたもの。反応が速い',
  params: [P.int('rsiLen', 'RSI の期間', 14), P.int('stLen', 'ストキャスティクスの期間', 14), P.int('kLen', '%K をならす期間', 3), P.int('dLen', '%D の期間', 3),
    P.source(), P.color('cK', '%K の色', '#2f80ed'), P.color('cD', '%D の色', '#f5a623')],
  compute(bars, p) {
    const r = rsi(col(bars, p.source), int(p.rsiLen, 14)), n = int(p.stLen, 14), hh = highest(r, n), ll = lowest(r, n);
    const raw = r.map((v, i) => (!isFinite(hh[i]) ? NaN : hh[i] === ll[i] ? 50 : 100 * (v - ll[i]) / (hh[i] - ll[i])));
    const k = sma(raw, int(p.kLen, 3)), d = sma(k, int(p.dLen, 3));
    return { lines: [{ name: '%K', val: k, color: p.cK }, { name: '%D', val: d, color: p.cD }], bands: [80, 20], fixed: [0, 100], label: `${p.rsiLen} ${p.stLen} ${p.kLen} ${p.dLen}` };
  },
};
DEFS.cci = {
  name: 'CCI(商品チャネル指数)', short: 'CCI', group: 'momentum',
  desc: '価格が、平均からどれだけ離れているか',
  params: [P.len(20), P.color('color', '線の色', '#16a085')],
  compute(bars, p) {
    const n = int(p.len, 20), tp = col(bars, 'hlc3'), ma = sma(tp, n);
    const md = rolling(tp, n, (x, s, e) => { let m = 0; for (let k = s; k <= e; k++) m += x[k]; m /= n; let t = 0; for (let k = s; k <= e; k++) t += Math.abs(x[k] - m); return t / n; });
    return { lines: [{ name: 'CCI', val: tp.map((v, i) => (isFinite(ma[i]) && md[i] > 0 ? (v - ma[i]) / (0.015 * md[i]) : NaN)), color: p.color }], bands: [100, -100], label: String(n) };
  },
};
DEFS.willr = {
  name: 'ウィリアムズ %R', short: '%R', group: 'momentum',
  desc: '直近の高値から、終値がどれだけ下にあるか(-100〜0)',
  params: [P.len(14), P.color('color', '線の色', '#8e44ad')],
  compute(bars, p) {
    const n = int(p.len, 14), hh = highest(col(bars, 'high'), n), ll = lowest(col(bars, 'low'), n);
    return { lines: [{ name: '%R', val: bars.map((b, i) => (!isFinite(hh[i]) ? NaN : hh[i] === ll[i] ? -50 : -100 * (hh[i] - b.c) / (hh[i] - ll[i]))), color: p.color }], bands: [-20, -80], fixed: [-100, 0], label: String(n) };
  },
};
DEFS.roc = {
  name: 'ROC(変化率)', short: 'ROC', group: 'momentum',
  desc: '何本か前の価格から、何%変わったか',
  params: [P.len(9), P.source(), P.color('color', '線の色', '#2f80ed')],
  compute(bars, p) {
    const n = int(p.len, 9), a = col(bars, p.source);
    return { lines: [{ name: 'ROC', val: a.map((v, i) => (i >= n && a[i - n] ? (v - a[i - n]) / a[i - n] * 100 : NaN)), color: p.color }], bands: [0], label: String(n) };
  },
};
DEFS.mom = {
  name: 'モメンタム', short: 'Mom', group: 'momentum',
  desc: '何本か前の価格との差',
  params: [P.len(10), P.source(), P.color('color', '線の色', '#2f80ed')],
  compute(bars, p) {
    const n = int(p.len, 10), a = col(bars, p.source);
    return { lines: [{ name: 'Mom', val: a.map((v, i) => (i >= n ? v - a[i - n] : NaN)), color: p.color }], bands: [0], label: String(n) };
  },
};
DEFS.ao = {
  name: 'オーサム・オシレーター', short: 'AO', group: 'momentum',
  desc: '短期と長期の平均の差を棒グラフで示す',
  params: [P.int('fast', '短期の期間', 5), P.int('slow', '長期の期間', 34)],
  compute(bars, p) {
    const m = col(bars, 'hl2'), v = map2(sma(m, int(p.fast, 5)), sma(m, int(p.slow, 34)), (x, y) => x - y);
    return { lines: [], hist: v, histDir: v.map((x, i) => (x >= v[i - 1] ? 1 : -1)), histName: 'AO', bands: [0], label: `${p.fast} ${p.slow}` };
  },
};
DEFS.trix = {
  name: 'TRIX', short: 'TRIX', group: 'momentum',
  desc: '3回ならした平均線の変化率。細かい上下を取り除いた勢い',
  params: [P.len(15), P.int('signal', 'シグナルの期間', 9), P.color('color', 'TRIX の色', '#c0392b'), P.color('cSig', 'シグナルの色', '#f5a623')],
  compute(bars, p) {
    const n = int(p.len, 15), e3 = ema(ema(ema(col(bars, 'close'), n), n), n);
    const t = e3.map((v, i) => (i && isFinite(e3[i - 1]) && e3[i - 1] ? (v - e3[i - 1]) / e3[i - 1] * 100 : NaN));
    return { lines: [{ name: 'TRIX', val: t, color: p.color }, { name: 'シグナル', val: ema(t, int(p.signal, 9)), color: p.cSig }], bands: [0], label: `${n} ${p.signal}` };
  },
};
DEFS.adx = {
  name: 'ADX / DMI', short: 'ADX', group: 'trend',
  desc: '流れの強さ(ADX)と、上向き・下向きの勢い(+DI・-DI)',
  params: [P.len(14), P.num('level', '基準線', 25, 0, 100, 1, 'ADX がこれより上なら、流れがはっきりしている目安'),
    P.color('cAdx', 'ADX の色', '#f5a623'), P.color('cPlus', '+DI の色', UP), P.color('cMinus', '-DI の色', DOWN)],
  compute(bars, p) {
    const n = int(p.len, 14), len = bars.length, pdm = [NaN], mdm = [NaN], tr = trueRange(bars);
    tr[0] = NaN;
    for (let i = 1; i < len; i++) {
      const up = bars[i].h - bars[i - 1].h, dn = bars[i - 1].l - bars[i].l;
      pdm.push(up > dn && up > 0 ? up : 0); mdm.push(dn > up && dn > 0 ? dn : 0);
    }
    const trS = rma(tr, n), pdi = map2(rma(pdm, n), trS, (x, t) => (t ? 100 * x / t : 0)), mdi = map2(rma(mdm, n), trS, (x, t) => (t ? 100 * x / t : 0));
    const dx = map2(pdi, mdi, (x, y) => (x + y ? 100 * Math.abs(x - y) / (x + y) : 0));
    return {
      lines: [{ name: 'ADX', val: rma(dx, n), color: p.cAdx, width: 2 }, { name: '+DI', val: pdi, color: p.cPlus, width: 1.2 }, { name: '-DI', val: mdi, color: p.cMinus, width: 1.2 }],
      bands: [+p.level], label: String(n),
    };
  },
};
DEFS.aroon = {
  name: 'アルーン', short: 'Aroon', group: 'trend',
  desc: '直近の高値・安値から、何本たったかで流れの新しさを見る',
  params: [P.len(14), P.color('cUp', 'アルーン・アップの色', UP), P.color('cDown', 'アルーン・ダウンの色', DOWN)],
  compute(bars, p) {
    const n = int(p.len, 14), len = bars.length, up = nans(len), dn = nans(len);
    for (let i = n; i < len; i++) {
      let hi = i - n, lo = i - n;
      for (let k = i - n; k <= i; k++) { if (bars[k].h >= bars[hi].h) hi = k; if (bars[k].l <= bars[lo].l) lo = k; }
      up[i] = 100 * (n - (i - hi)) / n; dn[i] = 100 * (n - (i - lo)) / n;
    }
    return { lines: [{ name: 'アップ', val: up, color: p.cUp }, { name: 'ダウン', val: dn, color: p.cDown }], bands: [70, 30], fixed: [0, 100], label: String(n) };
  },
};

// ===== ボラティリティ(値動きの大きさ) =====
DEFS.atr = {
  name: 'ATR(平均的な値幅)', short: 'ATR', group: 'volatility',
  desc: '1本の足が平均してどれだけ動くか。損切りの幅の目安に使う',
  params: [P.len(14), P.color('color', '線の色', '#c0392b')],
  compute(bars, p) { const n = int(p.len, 14); return { lines: [{ name: 'ATR', val: atr(bars, n), color: p.color }], bands: [], price: true, label: String(n) }; },
};
DEFS.bbw = {
  name: 'ボリンジャーバンド幅', short: 'BBW', group: 'volatility',
  desc: 'バンドの幅を%で示す。小さいほど値動きが縮んでいる',
  params: [P.len(20), P.num('mult', '幅(標準偏差の何倍か)', 2, 0.1, 10, 0.1), P.source(), P.color('color', '線の色', '#2f80ed')],
  compute(bars, p) {
    const n = int(p.len, 20), a = col(bars, p.source), mid = sma(a, n), sd = stdev(a, n);
    return { lines: [{ name: '幅%', val: map2(mid, sd, (m, s) => (m ? 2 * p.mult * s / m * 100 : NaN)), color: p.color }], bands: [], label: `${n} ${p.mult}` };
  },
};
DEFS.hv = {
  name: 'ヒストリカル・ボラティリティ', short: 'HV', group: 'volatility',
  desc: '日々の変化率のばらつきを、1年あたりの%に直したもの',
  params: [P.len(20), P.int('year', '1年の足の本数', 365, '暗号資産の日足は 365。足の種類に合わせて変える'), P.color('color', '線の色', '#16a085')],
  compute(bars, p) {
    const n = int(p.len, 20), r = bars.map((b, i) => (i && bars[i - 1].c > 0 && b.c > 0 ? Math.log(b.c / bars[i - 1].c) : NaN));
    return { lines: [{ name: 'HV%', val: stdev(r, n).map(v => v * Math.sqrt(int(p.year, 365)) * 100), color: p.color }], bands: [], label: String(n) };
  },
};

// ===== 出来高 =====
DEFS.volma = {
  name: '出来高と移動平均', short: 'Vol', group: 'volume',
  desc: '出来高の棒グラフと、その平均線。出来高が普段より多いかが分かる',
  params: [P.len(20, '平均線の期間'), P.color('color', '平均線の色', '#f5a623')],
  compute(bars, p) {
    const v = bars.map(b => b.v), n = int(p.len, 20);
    return { lines: [{ name: '平均', val: sma(v, n), color: p.color }], hist: v, histDir: bars.map(b => (b.c >= b.o ? 1 : -1)), histName: '出来高', bands: [], floor: 0, label: String(n) };
  },
};
DEFS.obv = {
  name: 'OBV(オンバランス・ボリューム)', short: 'OBV', group: 'volume',
  desc: '上げた足の出来高を足し、下げた足の出来高を引いて積み上げたもの',
  params: [P.color('color', '線の色', '#2f80ed')],
  compute(bars, p) {
    let acc = 0;
    return { lines: [{ name: 'OBV', val: bars.map((b, i) => { if (i) acc += b.c > bars[i - 1].c ? b.v : b.c < bars[i - 1].c ? -b.v : 0; return acc; }), color: p.color }], bands: [], label: '' };
  },
};
const mfv = bars => bars.map(b => (b.h > b.l ? ((b.c - b.l) - (b.h - b.c)) / (b.h - b.l) * b.v : 0));
DEFS.ad = {
  name: 'A/D ライン(集積・分配)', short: 'A/D', group: 'volume',
  desc: '足の中で終値が高い位置にあるほど、出来高を多く足して積み上げたもの',
  params: [P.color('color', '線の色', '#16a085')],
  compute(bars, p) { let acc = 0; return { lines: [{ name: 'A/D', val: mfv(bars).map(v => (acc += v)), color: p.color }], bands: [], label: '' }; },
};
DEFS.cmf = {
  name: 'CMF(チャイキン・マネーフロー)', short: 'CMF', group: 'volume',
  desc: '一定期間の、買い寄りの出来高の割合(-1〜+1)',
  params: [P.len(20), P.color('color', '線の色', '#16a085')],
  compute(bars, p) {
    const n = int(p.len, 20), a = sum(mfv(bars), n), b = sum(bars.map(x => x.v), n);
    return { lines: [{ name: 'CMF', val: map2(a, b, (x, y) => (y ? x / y : 0)), color: p.color }], bands: [0], label: String(n) };
  },
};
DEFS.mfi = {
  name: 'MFI(マネーフロー指数)', short: 'MFI', group: 'volume',
  desc: '出来高を加味した RSI。0〜100',
  params: [P.len(14), P.num('upper', '上の基準線', 80, 50, 100, 1), P.num('lower', '下の基準線', 20, 0, 50, 1), P.color('color', '線の色', '#8e44ad')],
  compute(bars, p) {
    const n = int(p.len, 14), tp = col(bars, 'hlc3'), pos = [NaN], neg = [NaN];
    for (let i = 1; i < bars.length; i++) { const f = tp[i] * bars[i].v; pos.push(tp[i] > tp[i - 1] ? f : 0); neg.push(tp[i] < tp[i - 1] ? f : 0); }
    return { lines: [{ name: 'MFI', val: map2(sum(pos, n), sum(neg, n), (x, y) => (y === 0 ? 100 : 100 - 100 / (1 + x / y))), color: p.color }], bands: [+p.upper, +p.lower], fixed: [0, 100], label: String(n) };
  },
};

// ================================================================ 追加のインジケーター
// ---- 移動平均の仲間(移動平均線の「種類」からも選べる)
function hma(a, n) {
  const half = wma(a, Math.max(1, Math.floor(n / 2))), full = wma(a, n);
  return wma(map2(half, full, (x, y) => 2 * x - y), Math.max(1, Math.round(Math.sqrt(n))));
}
function dema(a, n) { const e1 = ema(a, n), e2 = ema(e1, n); return map2(e1, e2, (x, y) => 2 * x - y); }
function tema(a, n) { const e1 = ema(a, n), e2 = ema(e1, n), e3 = ema(e2, n); return e1.map((x, i) => (isFinite(e3[i]) ? 3 * x - 3 * e2[i] + e3[i] : NaN)); }
// カウフマンの適応移動平均:値動きがまっすぐなときは速く、ジグザグのときは遅く追いかける
function kama(a, n) {
  const out = nans(a.length), fast = 2 / 3, slow = 2 / 31;
  let prev = NaN;
  for (let i = n; i < a.length; i++) {
    if (!isFinite(prev)) prev = a[i - 1];
    let noise = 0;
    for (let k = i - n + 1; k <= i; k++) noise += Math.abs(a[k] - a[k - 1]);
    const er = noise ? Math.abs(a[i] - a[i - n]) / noise : 0, sc = Math.pow(er * (fast - slow) + slow, 2);
    prev += sc * (a[i] - prev);
    out[i] = prev;
  }
  return out;
}
function vwma(a, vol, n) { return map2(sum(a.map((x, i) => x * vol[i]), n), sum(vol, n), (x, y) => (y ? x / y : NaN)); }
// 線形回帰:直近 n 本にいちばんよく合う直線の、いちばん新しい点の値と、傾き
function linreg(a, n) {
  const val = nans(a.length), slope = nans(a.length);
  const sx = n * (n - 1) / 2, sxx = (n - 1) * n * (2 * n - 1) / 6, den = n * sxx - sx * sx;
  for (let i = n - 1; i < a.length; i++) {
    let sy = 0, sxy = 0, ok = true;
    for (let k = 0; k < n; k++) { const y = a[i - n + 1 + k]; if (!isFinite(y)) { ok = false; break; } sy += y; sxy += k * y; }
    if (!ok || !den) continue;
    const b = (n * sxy - sx * sy) / den;
    slope[i] = b; val[i] = (sy - b * sx) / n + b * (n - 1);
  }
  return { val, slope };
}
const shiftBack = (a, k) => a.map((_, i) => (i - k >= 0 ? a[i - k] : NaN)); // k 本前の値

DEFS.env = {
  name: 'エンベロープ', short: 'ENV', group: 'trend', overlay: true,
  desc: '移動平均線の上下に、一定の割合で離した線を引く',
  params: [P.len(20), P.num('pct', '離す割合(%)', 2.5, 0.1, 50, 0.1), P.source(), P.color('color', '線の色', '#16a085')],
  compute(bars, p) {
    const mid = sma(col(bars, p.source), int(p.len, 20)), k = p.pct / 100;
    return { lines: [{ name: '上', val: mid.map(v => v * (1 + k)), color: p.color }, { name: '中', val: mid, color: p.color, width: 1 }, { name: '下', val: mid.map(v => v * (1 - k)), color: p.color }],
      fill: { a: 0, b: 2, color: p.color }, label: `${p.len} ${p.pct}%` };
  },
};
DEFS.linreg = {
  name: '線形回帰線', short: 'LR', group: 'trend', overlay: true,
  desc: '直近の値動きにいちばんよく合う直線の先端をつないだ線',
  params: [P.len(14), P.source(), P.color('color', '線の色', '#8e44ad')],
  compute(bars, p) { const n = int(p.len, 14); return { lines: [{ name: 'LR', val: linreg(col(bars, p.source), n).val, color: p.color }], label: String(n) }; },
};
DEFS.alligator = {
  name: 'アリゲーター', short: 'Allig', group: 'trend', overlay: true,
  desc: '期間の違う3本のならした線を、先にずらして描く。3本が開くと流れが出ている',
  params: [P.color('cJaw', '顎(13本・8本先)の色', '#2f80ed'), P.color('cTeeth', '歯(8本・5本先)の色', '#e74c3c'), P.color('cLips', '唇(5本・3本先)の色', '#27ae60')],
  compute(bars, p) {
    const m = col(bars, 'hl2');
    return { lines: [{ name: '顎', val: rma(m, 13), color: p.cJaw, offset: 8 }, { name: '歯', val: rma(m, 8), color: p.cTeeth, offset: 5 }, { name: '唇', val: rma(m, 5), color: p.cLips, offset: 3 }], label: '13 8 5' };
  },
};
DEFS.chandelier = {
  name: 'シャンデリア・エグジット', short: 'CE', group: 'volatility', overlay: true,
  desc: '直近の高値(安値)から ATR の何倍か離した、損切りの目安の線',
  params: [P.len(22), P.num('mult', 'ATR の何倍離すか', 3, 0.1, 20, 0.1), P.color('cLong', '買い持ち用(下の線)の色', UP), P.color('cShort', '売り持ち用(上の線)の色', DOWN)],
  compute(bars, p) {
    const n = int(p.len, 22), a = atr(bars, n);
    return { lines: [{ name: '買い用', val: map2(highest(col(bars, 'high'), n), a, (x, y) => x - p.mult * y), color: p.cLong },
      { name: '売り用', val: map2(lowest(col(bars, 'low'), n), a, (x, y) => x + p.mult * y), color: p.cShort }], label: `${n} ${p.mult}` };
  },
};

const pane1 = (name, val, color, extra) => Object.assign({ lines: [{ name, val, color }], bands: [] }, extra);
DEFS.ppo = {
  name: 'PPO(価格オシレーター%)', short: 'PPO', group: 'momentum',
  desc: 'MACD を割合(%)で表したもの。価格の違う銘柄どうしで比べられる',
  params: [P.int('fast', '短期の期間', 12), P.int('slow', '長期の期間', 26), P.int('signal', 'シグナルの期間', 9), P.source(), P.color('color', 'PPO の色', '#2f80ed'), P.color('cSig', 'シグナルの色', '#f5a623')],
  compute(bars, p) {
    const a = col(bars, p.source), v = map2(ema(a, int(p.fast, 12)), ema(a, int(p.slow, 26)), (x, y) => (y ? (x - y) / y * 100 : NaN)), sg = ema(v, int(p.signal, 9));
    return { lines: [{ name: 'PPO', val: v, color: p.color }, { name: 'シグナル', val: sg, color: p.cSig }], hist: map2(v, sg, (x, y) => x - y), bands: [0], label: `${p.fast} ${p.slow} ${p.signal}` };
  },
};
DEFS.cmo = {
  name: 'CMO(シャンデ・モメンタム)', short: 'CMO', group: 'momentum',
  desc: '上げ幅の合計と下げ幅の合計の差を、-100〜100 で表す',
  params: [P.len(9), P.source(), P.color('color', '線の色', '#2f80ed')],
  compute(bars, p) {
    const a = col(bars, p.source), n = int(p.len, 9), up = [NaN], dn = [NaN];
    for (let i = 1; i < a.length; i++) { const d = a[i] - a[i - 1]; up.push(Math.max(d, 0)); dn.push(Math.max(-d, 0)); }
    return pane1('CMO', map2(sum(up, n), sum(dn, n), (x, y) => (x + y ? 100 * (x - y) / (x + y) : 0)), p.color, { bands: [50, -50], fixed: [-100, 100], label: String(n) });
  },
};
DEFS.ultosc = {
  name: 'アルティメット・オシレーター', short: 'UO', group: 'momentum',
  desc: '3つの期間の買いの強さを合わせた指標(0〜100)',
  params: [P.int('a', '短期', 7), P.int('b', '中期', 14), P.int('c', '長期', 28), P.color('color', '線の色', '#c0392b')],
  compute(bars, p) {
    const bp = [NaN], tr = [NaN];
    for (let i = 1; i < bars.length; i++) { const pc = bars[i - 1].c, lo = Math.min(bars[i].l, pc); bp.push(bars[i].c - lo); tr.push(Math.max(bars[i].h, pc) - lo); }
    const avg = n => map2(sum(bp, n), sum(tr, n), (x, y) => (y ? x / y : 0));
    const A = avg(int(p.a, 7)), B = avg(int(p.b, 14)), C = avg(int(p.c, 28));
    return pane1('UO', A.map((x, i) => (isFinite(C[i]) ? 100 * (4 * x + 2 * B[i] + C[i]) / 7 : NaN)), p.color, { bands: [70, 30], fixed: [0, 100], label: `${p.a} ${p.b} ${p.c}` });
  },
};
DEFS.dpo = {
  name: 'DPO(トレンド除去オシレーター)', short: 'DPO', group: 'momentum',
  desc: '大きな流れを取り除いて、短い周期の波だけを見る',
  params: [P.len(21), P.color('color', '線の色', '#16a085')],
  compute(bars, p) { const n = int(p.len, 21), c = col(bars, 'close'); return pane1('DPO', map2(c, shiftBack(sma(c, n), Math.floor(n / 2) + 1), (x, y) => x - y), p.color, { bands: [0], label: String(n) }); },
};
DEFS.fisher = {
  name: 'フィッシャー変換', short: 'Fisher', group: 'momentum',
  desc: '価格の位置を変換して、転換点をはっきり見せる',
  params: [P.len(9), P.color('color', 'フィッシャーの色', '#2f80ed'), P.color('cTrig', '1本前の値の色', '#f5a623')],
  compute(bars, p) {
    const n = int(p.len, 9), m = col(bars, 'hl2'), hh = highest(m, n), ll = lowest(m, n), f = nans(bars.length);
    let v = 0, prev = 0;
    for (let i = 0; i < bars.length; i++) {
      if (!isFinite(hh[i])) continue;
      v = 0.66 * ((hh[i] > ll[i] ? (m[i] - ll[i]) / (hh[i] - ll[i]) : 0.5) - 0.5) + 0.67 * v;
      if (v > 0.99) v = 0.999; else if (v < -0.99) v = -0.999; // 対数が発散しないよう、端は 0.999 に丸める(TradingView と同じ扱い)
      prev = 0.5 * Math.log((1 + v) / (1 - v)) + 0.5 * prev;
      f[i] = prev;
    }
    return { lines: [{ name: 'Fisher', val: f, color: p.color }, { name: '1本前', val: shiftBack(f, 1), color: p.cTrig }], bands: [0], label: String(n) };
  },
};
DEFS.coppock = {
  name: 'コポック曲線', short: 'Coppock', group: 'momentum',
  desc: '2つの変化率を足してならしたもの。長い流れの転換を見る',
  params: [P.int('wma', '加重平均の期間', 10), P.int('long', '長い変化率の期間', 14), P.int('short', '短い変化率の期間', 11), P.color('color', '線の色', '#8e44ad')],
  compute(bars, p) {
    const c = col(bars, 'close'), roc = n => c.map((v, i) => (i >= n && c[i - n] ? (v - c[i - n]) / c[i - n] * 100 : NaN));
    return pane1('Coppock', wma(map2(roc(int(p.long, 14)), roc(int(p.short, 11)), (x, y) => x + y), int(p.wma, 10)), p.color, { bands: [0], label: `${p.wma} ${p.long} ${p.short}` });
  },
};
DEFS.dev = {
  name: '移動平均乖離率', short: '乖離率', group: 'momentum',
  desc: '価格が移動平均線から何%離れているか。離れすぎは行きすぎの目安',
  params: [P.len(25), P.source(), P.color('color', '線の色', '#2f80ed')],
  compute(bars, p) { const a = col(bars, p.source), n = int(p.len, 25); return pane1('乖離率%', map2(a, sma(a, n), (x, y) => (y ? (x - y) / y * 100 : NaN)), p.color, { bands: [0], label: String(n) }); },
};
DEFS.psy = {
  name: 'サイコロジカルライン', short: 'サイコロ', group: 'momentum',
  desc: '直近の何本のうち、上げた足が何%あったか',
  params: [P.len(12), P.color('color', '線の色', '#e67e22')],
  compute(bars, p) { const n = int(p.len, 12); return pane1('%', sum(bars.map((b, i) => (i ? (b.c > bars[i - 1].c ? 1 : 0) : NaN)), n).map(v => v / n * 100), p.color, { bands: [75, 25], fixed: [0, 100], label: String(n) }); },
};
DEFS.rci = {
  name: 'RCI(順位相関指数)', short: 'RCI', group: 'momentum',
  desc: '「新しい足ほど高い」になっているほど +100、逆なら -100',
  params: [P.len(9), P.color('color', '線の色', '#c0392b')],
  compute(bars, p) {
    const n = int(p.len, 9), c = col(bars, 'close'), out = nans(c.length);
    for (let i = n - 1; i < c.length; i++) {
      let d2 = 0;
      for (let k = 0; k < n; k++) {
        const v = c[i - k]; // k = 0 がいちばん新しい(日付の順位 1)
        let higher = 0, same = 0;
        for (let j = 0; j < n; j++) { const w = c[i - j]; if (w > v) higher++; else if (w === v) same++; }
        const rank = higher + (same + 1) / 2; // 同じ値は順位を平均する
        d2 += (k + 1 - rank) * (k + 1 - rank);
      }
      out[i] = (1 - 6 * d2 / (n * (n * n - 1))) * 100;
    }
    return pane1('RCI', out, p.color, { bands: [80, -80], fixed: [-100, 100], label: String(n) });
  },
};
DEFS.zscore = {
  name: 'Zスコア', short: 'Z', group: 'momentum',
  desc: '価格が平均から、ばらつきの何倍離れているか',
  params: [P.len(20), P.source(), P.color('color', '線の色', '#16a085')],
  compute(bars, p) { const a = col(bars, p.source), n = int(p.len, 20), m = sma(a, n), sd = stdev(a, n); return pane1('Z', a.map((x, i) => (sd[i] > 0 ? (x - m[i]) / sd[i] : NaN)), p.color, { bands: [2, 0, -2], label: String(n) }); },
};
DEFS.bbp = {
  name: 'ボリンジャー %B', short: '%B', group: 'volatility',
  desc: 'バンドの中で価格がどの位置にあるか(下の線 = 0、上の線 = 1)',
  params: [P.len(20), P.num('mult', '幅(標準偏差の何倍か)', 2, 0.1, 10, 0.1), P.source(), P.color('color', '線の色', '#2f80ed')],
  compute(bars, p) { const a = col(bars, p.source), n = int(p.len, 20), m = sma(a, n), sd = stdev(a, n); return pane1('%B', a.map((x, i) => (sd[i] > 0 ? (x - (m[i] - p.mult * sd[i])) / (2 * p.mult * sd[i]) : NaN)), p.color, { bands: [1, 0], label: `${n} ${p.mult}` }); },
};
DEFS.natr = {
  name: 'ATR%(値幅の割合)', short: 'ATR%', group: 'volatility',
  desc: 'ATR を価格で割って%にしたもの。銘柄どうしの値動きの大きさを比べられる',
  params: [P.len(14), P.color('color', '線の色', '#c0392b')],
  compute(bars, p) { const n = int(p.len, 14); return pane1('ATR%', map2(atr(bars, n), col(bars, 'close'), (x, y) => (y ? x / y * 100 : NaN)), p.color, { label: String(n) }); },
};
DEFS.stddev = {
  name: '標準偏差', short: 'σ', group: 'volatility',
  desc: '価格のばらつきの大きさ',
  params: [P.len(20), P.source(), P.color('color', '線の色', '#8e44ad')],
  compute(bars, p) { const n = int(p.len, 20); return pane1('σ', stdev(col(bars, p.source), n), p.color, { label: String(n) }); },
};
DEFS.chop = {
  name: 'チョピネス指数', short: 'CHOP', group: 'volatility',
  desc: '相場が方向なく揺れている(高い)か、まっすぐ進んでいる(低い)か',
  params: [P.len(14), P.color('color', '線の色', '#16a085')],
  compute(bars, p) {
    const n = int(p.len, 14), tr = trueRange(bars), s = sum(tr, n), hh = highest(col(bars, 'high'), n), ll = lowest(col(bars, 'low'), n);
    return pane1('CHOP', s.map((x, i) => (hh[i] > ll[i] && n > 1 ? 100 * Math.log10(x / (hh[i] - ll[i])) / Math.log10(n) : NaN)), p.color, { bands: [61.8, 38.2], label: String(n) });
  },
};
DEFS.mass = {
  name: 'マス・インデックス', short: 'Mass', group: 'volatility',
  desc: '値幅の広がり方から、流れの転換を探る',
  params: [P.int('ema', 'ならす期間', 9), P.len(25, '合計する期間'), P.color('color', '線の色', '#e67e22')],
  compute(bars, p) { const r = bars.map(b => b.h - b.l), e1 = ema(r, int(p.ema, 9)), e2 = ema(e1, int(p.ema, 9)); return pane1('Mass', sum(map2(e1, e2, (x, y) => (y ? x / y : NaN)), int(p.len, 25)), p.color, { bands: [27, 26.5], label: `${p.ema} ${p.len}` }); },
};
DEFS.aroonosc = {
  name: 'アルーン・オシレーター', short: 'AroonOsc', group: 'trend',
  desc: 'アルーン・アップとダウンの差。プラスなら上向き',
  params: [P.len(14), P.color('color', '線の色', '#2f80ed')],
  compute(bars, p) { const r = DEFS.aroon.compute(bars, { len: p.len, cUp: UP, cDown: DOWN }); return pane1('差', map2(r.lines[0].val, r.lines[1].val, (x, y) => x - y), p.color, { bands: [0], fixed: [-100, 100], label: String(int(p.len, 14)) }); },
};
DEFS.vortex = {
  name: 'ボルテックス', short: 'VI', group: 'trend',
  desc: '上向きの動き(+VI)と下向きの動き(-VI)の強さを比べる',
  params: [P.len(14), P.color('cPlus', '+VI の色', UP), P.color('cMinus', '-VI の色', DOWN)],
  compute(bars, p) {
    const n = int(p.len, 14), vp = [NaN], vm = [NaN], tr = trueRange(bars);
    tr[0] = NaN;
    for (let i = 1; i < bars.length; i++) { vp.push(Math.abs(bars[i].h - bars[i - 1].l)); vm.push(Math.abs(bars[i].l - bars[i - 1].h)); }
    const st = sum(tr, n);
    return { lines: [{ name: '+VI', val: map2(sum(vp, n), st, (x, y) => (y ? x / y : NaN)), color: p.cPlus }, { name: '-VI', val: map2(sum(vm, n), st, (x, y) => (y ? x / y : NaN)), color: p.cMinus }], bands: [1], label: String(n) };
  },
};
DEFS.lrslope = {
  name: '線形回帰の傾き', short: '傾き', group: 'trend',
  desc: '直近の値動きに合う直線の傾き。プラスなら上向き',
  params: [P.len(14), P.source(), P.color('color', '線の色', '#8e44ad')],
  compute(bars, p) { const n = int(p.len, 14); return pane1('傾き', linreg(col(bars, p.source), n).slope, p.color, { bands: [0], label: String(n) }); },
};
DEFS.elder = {
  name: 'エルダーレイ(ブル・ベア)', short: 'Elder', group: 'trend',
  desc: '高値・安値が平均線からどれだけ離れているかで、買い手と売り手の力を見る',
  params: [P.len(13), P.color('cBull', 'ブルパワーの色', UP), P.color('cBear', 'ベアパワーの色', DOWN)],
  compute(bars, p) { const e = ema(col(bars, 'close'), int(p.len, 13)); return { lines: [{ name: 'ブル', val: bars.map((b, i) => b.h - e[i]), color: p.cBull }, { name: 'ベア', val: bars.map((b, i) => b.l - e[i]), color: p.cBear }], bands: [0], label: String(p.len) }; },
};
DEFS.bop = {
  name: 'BOP(バランス・オブ・パワー)', short: 'BOP', group: 'volume',
  desc: '足の値幅のうち、始値から終値への動きが占める割合(-1〜+1)',
  params: [P.int('smooth', 'ならす期間', 14), P.color('color', '線の色', '#16a085')],
  compute(bars, p) { const raw = bars.map(b => (b.h > b.l ? (b.c - b.o) / (b.h - b.l) : 0)); return pane1('BOP', sma(raw, int(p.smooth, 14)), p.color, { bands: [0], label: String(p.smooth) }); },
};
DEFS.adosc = {
  name: 'チャイキン・オシレーター', short: 'ChaikinOsc', group: 'volume',
  desc: 'A/D ラインの短期と長期の平均の差。出来高の流れの勢いを見る',
  params: [P.int('fast', '短期の期間', 3), P.int('slow', '長期の期間', 10), P.color('color', '線の色', '#2f80ed')],
  compute(bars, p) { let acc = 0; const ad = mfv(bars).map(v => (acc += v)); return pane1('Osc', map2(ema(ad, int(p.fast, 3)), ema(ad, int(p.slow, 10)), (x, y) => x - y), p.color, { bands: [0], label: `${p.fast} ${p.slow}` }); },
};
DEFS.force = {
  name: 'フォース・インデックス', short: 'Force', group: 'volume',
  desc: '値動きの幅に出来高を掛けたもの。動きの「力」を見る',
  params: [P.len(13), P.color('color', '線の色', '#c0392b')],
  compute(bars, p) { return pane1('Force', ema(bars.map((b, i) => (i ? (b.c - bars[i - 1].c) * b.v : NaN)), int(p.len, 13)), p.color, { bands: [0], label: String(p.len) }); },
};
DEFS.eom = {
  name: 'EOM(動きやすさ)', short: 'EOM', group: 'volume',
  desc: '少ない出来高で大きく動いたかどうか',
  params: [P.len(14), P.color('color', '線の色', '#e67e22')],
  compute(bars, p) {
    const raw = bars.map((b, i) => (i && b.v > 0 ? 10000 * ((b.h + b.l) / 2 - (bars[i - 1].h + bars[i - 1].l) / 2) * (b.h - b.l) / b.v : NaN));
    return pane1('EOM', sma(raw, int(p.len, 14)), p.color, { bands: [0], label: String(p.len) });
  },
};

// ================================================================ 自分で作るインジケーター(式の計算)
/* 式は eval を使わず、ここで自前で読み取って計算する(安全のため、決めた部品しか使えない)。
 * 使えるもの:
 *   数値、価格(open high low close volume hl2 hlc3 ohlc4)、調整できる数値(p1 p2 p3)
 *   + - * / と かっこ、比べる記号(> < >= <= == !=)は 1 か 0 になる
 *   関数は FUNCS を参照 */
const SERIES = { open: 'o', high: 'h', low: 'l', close: 'c', volume: 'v' };
const FUNCS = {
  sma: { args: 'xn', desc: '単純移動平均', eg: 'sma(close, 20)' },
  ema: { args: 'xn', desc: '指数移動平均', eg: 'ema(close, 20)' },
  rma: { args: 'xn', desc: 'ならした平均(RSI・ATR と同じ方式)', eg: 'rma(close, 14)' },
  wma: { args: 'xn', desc: '加重移動平均', eg: 'wma(close, 20)' },
  stdev: { args: 'xn', desc: '標準偏差(ばらつき)', eg: 'stdev(close, 20)' },
  highest: { args: 'xn', desc: '直近 n 本の最大', eg: 'highest(high, 20)' },
  lowest: { args: 'xn', desc: '直近 n 本の最小', eg: 'lowest(low, 20)' },
  sum: { args: 'xn', desc: '直近 n 本の合計', eg: 'sum(volume, 10)' },
  rsi: { args: 'xn', desc: 'RSI', eg: 'rsi(close, 14)' },
  roc: { args: 'xn', desc: 'n 本前からの変化率(%)', eg: 'roc(close, 10)' },
  change: { args: 'xn?', desc: 'n 本前との差(n を省くと 1)', eg: 'change(close)' },
  prev: { args: 'xn?', desc: 'n 本前の値(n を省くと 1)', eg: 'prev(close, 5)' },
  cum: { args: 'x', desc: '最初からの合計', eg: 'cum(volume)' },
  atr: { args: 'n', desc: '平均的な値幅', eg: 'atr(14)' },
  tr: { args: '', desc: 'その足の値幅(窓も含む)', eg: 'tr()' },
  abs: { args: 'x', desc: '絶対値(マイナスをプラスに)', eg: 'abs(change(close))' },
  sqrt: { args: 'x', desc: '平方根', eg: 'sqrt(close)' },
  log: { args: 'x', desc: '自然対数', eg: 'log(close)' },
  max: { args: 'xx', desc: '大きいほう', eg: 'max(open, close)' },
  min: { args: 'xx', desc: '小さいほう', eg: 'min(open, close)' },
  pow: { args: 'xx', desc: 'べき乗', eg: 'pow(close, 2)' },
  crossover: { args: 'xx', desc: '1つ目が2つ目を下から上に抜けた足で 1', eg: 'crossover(close, sma(close, 20))' },
  crossunder: { args: 'xx', desc: '1つ目が2つ目を上から下に抜けた足で 1', eg: 'crossunder(close, sma(close, 20))' },
  and: { args: 'xx', desc: '両方が成り立てば 1', eg: 'and(close > open, volume > sma(volume, 20))' },
  or: { args: 'xx', desc: 'どちらかが成り立てば 1', eg: 'or(rsi(close, 14) < 30, rsi(close, 14) > 70)' },
  not: { args: 'x', desc: '成り立たなければ 1', eg: 'not(close > open)' },
  if: { args: 'xxx', desc: '条件が成り立てば2つ目、そうでなければ3つ目', eg: 'if(close > open, volume, 0)' },
};
class FormulaError extends Error {}
function tokenize(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let j = i; while (j < text.length && /[0-9.]/.test(text[j])) j++;
      const v = Number(text.slice(i, j));
      if (!isFinite(v)) throw new FormulaError(`「${text.slice(i, j)}」は数として読めません。`);
      out.push({ t: 'num', v }); i = j; continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i; while (j < text.length && /[A-Za-z0-9_]/.test(text[j])) j++;
      out.push({ t: 'id', v: text.slice(i, j).toLowerCase() }); i = j; continue;
    }
    const two = text.slice(i, i + 2);
    if (['>=', '<=', '==', '!='].includes(two)) { out.push({ t: 'op', v: two }); i += 2; continue; }
    if ('+-*/(),<>'.includes(ch)) { out.push({ t: 'op', v: ch }); i++; continue; }
    throw new FormulaError(`「${ch}」は使えない文字です。全角の記号や文字が混ざっていないか確かめてください。`);
  }
  return out;
}
function parseFormula(text) {
  if (typeof text !== 'string' || !text.trim()) throw new FormulaError('式を入力してください。');
  if (text.length > 300) throw new FormulaError('式が長すぎます(300文字まで)。');
  const tk = tokenize(text);
  let pos = 0, nodes = 0;
  const peek = () => tk[pos], eat = v => { if (peek() && peek().t === 'op' && peek().v === v) { pos++; return true; } return false; };
  const node = n => { if (++nodes > 80) throw new FormulaError('式が複雑すぎます。'); return n; };
  function primary() {
    const t = tk[pos++];
    if (!t) throw new FormulaError('式が途中で終わっています。');
    if (t.t === 'num') return node({ k: 'num', v: t.v });
    if (t.t === 'op' && t.v === '(') { const e = compare(); if (!eat(')')) throw new FormulaError('かっこ「(」が閉じていません。'); return e; }
    if (t.t === 'op' && t.v === '-') return node({ k: 'neg', a: primary() });
    if (t.t === 'id') {
      if (eat('(')) {
        const f = FUNCS[t.v];
        if (!f) throw new FormulaError(`「${t.v}」という関数はありません。`);
        const args = [];
        if (!eat(')')) { do args.push(compare()); while (eat(',')); if (!eat(')')) throw new FormulaError(`「${t.v}(」のかっこが閉じていません。`); }
        const need = f.args.replace('?', '').length, most = f.args.replace('?', '').length + (f.args.includes('?') ? 0 : 0);
        const min = f.args.endsWith('?') ? need - 1 : need;
        if (args.length < min || args.length > Math.max(need, most)) throw new FormulaError(`「${t.v}」に渡す値の数が違います。例: ${f.eg}`);
        return node({ k: 'call', f: t.v, args });
      }
      if (SERIES[t.v] || ['hl2', 'hlc3', 'ohlc4', 'p1', 'p2', 'p3'].includes(t.v)) return node({ k: 'var', v: t.v });
      throw new FormulaError(`「${t.v}」は使えない名前です。使えるのは close, open, high, low, volume, hl2, hlc3, ohlc4, p1〜p3 と関数です。`);
    }
    throw new FormulaError(`「${t.v}」の位置がおかしいようです。`);
  }
  function binary(next, ops) {
    return function level() {
      let a = next();
      while (peek() && peek().t === 'op' && ops.includes(peek().v)) { const op = tk[pos++].v; a = node({ k: 'bin', op, a, b: next() }); }
      return a;
    };
  }
  const term = binary(primary, ['*', '/']), addsub = binary(term, ['+', '-']);
  const compare = binary(addsub, ['>', '<', '>=', '<=', '==', '!=']);
  const ast = compare();
  if (pos < tk.length) throw new FormulaError(`「${tk[pos].v}」の前後がつながっていません。`);
  return ast;
}
function evalFormula(ast, bars, vars) {
  const n = bars.length;
  const arr = v => (Array.isArray(v) ? v : new Array(n).fill(v));
  const each2 = (a, b, fn) => (Array.isArray(a) || Array.isArray(b) ? arr(a).map((x, i) => fn(x, arr(b)[i])) : fn(a, b));
  const len = v => {
    if (Array.isArray(v)) throw new FormulaError('期間(本数)には、数を入れてください(例: 20 や p1)。');
    return Math.max(1, Math.min(500, Math.round(v) || 1));
  };
  const ops = {
    '+': (x, y) => x + y, '-': (x, y) => x - y, '*': (x, y) => x * y, '/': (x, y) => (y === 0 ? NaN : x / y),
    '>': (x, y) => +(x > y), '<': (x, y) => +(x < y), '>=': (x, y) => +(x >= y), '<=': (x, y) => +(x <= y), '==': (x, y) => +(x === y), '!=': (x, y) => +(x !== y),
  };
  function ev(nd) {
    switch (nd.k) {
      case 'num': return nd.v;
      case 'neg': { const a = ev(nd.a); return Array.isArray(a) ? a.map(x => -x) : -a; }
      case 'bin': return each2(ev(nd.a), ev(nd.b), ops[nd.op]);
      case 'var':
        if (SERIES[nd.v]) return bars.map(b => b[SERIES[nd.v]]);
        if (nd.v[0] === 'p') return +vars[nd.v] || 0;
        return bars.map(b => src(b, nd.v));
      default: {
        const a = nd.args.map(ev), x = () => arr(a[0]);
        switch (nd.f) {
          case 'sma': return sma(x(), len(a[1]));
          case 'ema': return ema(x(), len(a[1]));
          case 'rma': return rma(x(), len(a[1]));
          case 'wma': return wma(x(), len(a[1]));
          case 'stdev': return stdev(x(), len(a[1]));
          case 'highest': return highest(x(), len(a[1]));
          case 'lowest': return lowest(x(), len(a[1]));
          case 'sum': return sum(x(), len(a[1]));
          case 'rsi': return rsi(x(), len(a[1]));
          case 'roc': { const k = len(a[1]), s = x(); return s.map((v, i) => (i >= k && s[i - k] ? (v - s[i - k]) / s[i - k] * 100 : NaN)); }
          case 'change': { const k = a.length > 1 ? len(a[1]) : 1, s = x(); return s.map((v, i) => (i >= k ? v - s[i - k] : NaN)); }
          case 'prev': { const k = a.length > 1 ? len(a[1]) : 1; return shiftBack(x(), k); }
          case 'cum': { let acc = 0; return x().map(v => (isFinite(v) ? (acc += v) : NaN)); }
          case 'atr': return atr(bars, len(a[0]));
          case 'tr': return trueRange(bars);
          case 'abs': return Array.isArray(a[0]) ? a[0].map(Math.abs) : Math.abs(a[0]);
          case 'sqrt': return Array.isArray(a[0]) ? a[0].map(v => Math.sqrt(v)) : Math.sqrt(a[0]);
          case 'log': return Array.isArray(a[0]) ? a[0].map(v => (v > 0 ? Math.log(v) : NaN)) : (a[0] > 0 ? Math.log(a[0]) : NaN);
          case 'max': return each2(a[0], a[1], Math.max);
          case 'min': return each2(a[0], a[1], Math.min);
          case 'pow': return each2(a[0], a[1], Math.pow);
          case 'crossover': case 'crossunder': {
            const p = arr(a[0]), q = arr(a[1]), up = nd.f === 'crossover';
            return p.map((v, i) => (i && isFinite(v) && isFinite(q[i]) && isFinite(p[i - 1]) && isFinite(q[i - 1])
              ? +(up ? v > q[i] && p[i - 1] <= q[i - 1] : v < q[i] && p[i - 1] >= q[i - 1]) : NaN));
          }
          case 'and': return each2(a[0], a[1], (x, y) => (isFinite(x) && isFinite(y) ? +(x !== 0 && y !== 0) : NaN));
          case 'or': return each2(a[0], a[1], (x, y) => (isFinite(x) && isFinite(y) ? +(x !== 0 || y !== 0) : NaN));
          case 'not': return Array.isArray(a[0]) ? a[0].map(v => (isFinite(v) ? +(v === 0) : NaN)) : +(a[0] === 0);
          case 'if': { const c = arr(a[0]), t = arr(a[1]), f = arr(a[2]); return c.map((v, i) => (isFinite(v) ? (v ? t[i] : f[i]) : NaN)); }
          default: throw new FormulaError(`「${nd.f}」は計算できません。`);
        }
      }
    }
  }
  return arr(ev(ast)).map(v => (isFinite(v) ? v : NaN));
}
// 式を確かめる。問題なければ null、あれば説明の文を返す
function checkFormula(text) {
  try {
    const ast = parseFormula(text);
    // 小さな見本データで一度計算してみて、計算の途中で分かる間違い(期間に価格を入れた等)も見つける
    const demo = [1, 2, 3, 4, 5].map(i => ({ t: i, o: i, h: i + 1, l: i - 0.5, c: i + 0.5, v: 10 * i }));
    evalFormula(ast, demo, { p1: 2, p2: 2, p3: 2 });
    return null;
  } catch (e) { return e instanceof FormulaError ? e.message : '式を読み取れませんでした。'; }
}
/* 利用者が作った定義から、ほかのインジケーターと同じ形の定義を作る。
 * def: { name, overlay, lines: [{ name, expr, color }], hist, bands: [数], inputs: [{ label, def }],
 *        marks: [{ name, expr, dir: 'up' | 'down' }] }  marks は、式が 0 以外になった足に付ける合図(▲▼) */
function makeCustom(def) {
  const lines = def.lines.map(l => ({ name: l.name, color: l.color, ast: parseFormula(l.expr) }));
  const hist = def.hist ? parseFormula(def.hist) : null;
  const marks = (def.marks || []).map(m => ({ name: m.name, dir: m.dir === 'down' ? 'down' : 'up', ast: parseFormula(m.expr) }));
  const params = def.inputs.map((q, i) => ({ key: `p${i + 1}`, label: q.label || `数値 ${i + 1}`, type: 'num', def: q.def, min: -1e9, max: 1e9, step: 'any' }));
  lines.forEach((l, i) => params.push({ key: `c${i}`, label: `「${l.name || `線 ${i + 1}`}」の色`, type: 'color', def: l.color }));
  return {
    name: def.name, short: def.name.slice(0, 10), group: 'custom', overlay: !!def.overlay, desc: '自分で作ったインジケーター', custom: true, params,
    compute(bars, p) {
      const vars = { p1: +p.p1 || 0, p2: +p.p2 || 0, p3: +p.p3 || 0 };
      const useHist = hist && !def.overlay; // 棒グラフは、下の枠に出すときだけ
      return {
        lines: lines.map((l, i) => ({ name: l.name || `線${i + 1}`, val: evalFormula(l.ast, bars, vars), color: p[`c${i}`] || l.color })),
        hist: useHist ? evalFormula(hist, bars, vars) : undefined, histName: useHist ? '棒' : undefined,
        marks: marks.map(m => ({ name: m.name, dir: m.dir, val: evalFormula(m.ast, bars, vars) })),
        bands: def.overlay ? [] : def.bands.slice(0, 4), label: def.inputs.map((q, i) => p[`p${i + 1}`]).join(' '),
      };
    },
  };
}

const GROUPS = [
  ['trend', 'トレンド(流れの向き)'],
  ['momentum', 'オシレーター(勢い・行きすぎ)'],
  ['volatility', 'ボラティリティ(値動きの大きさ)'],
  ['volume', '出来高'],
  ['custom', '自分で作ったもの'],
];

function defaults(id) {
  const out = {};
  DEFS[id].params.forEach(q => { out[q.key] = q.def; });
  return out;
}

return { DEFS, GROUPS, FUNCS, defaults, makeCustom, checkFormula, parseFormula, evalFormula, helpers: { sma, ema, rma, wma, hma, dema, tema, kama, vwma, linreg, stdev, highest, lowest, sum, atr, rsi, trueRange, src } };
});
