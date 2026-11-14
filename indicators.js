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

const GROUPS = [
  ['trend', 'トレンド(流れの向き)'],
  ['momentum', 'オシレーター(勢い・行きすぎ)'],
  ['volatility', 'ボラティリティ(値動きの大きさ)'],
  ['volume', '出来高'],
];

function defaults(id) {
  const out = {};
  DEFS[id].params.forEach(q => { out[q.key] = q.def; });
  return out;
}

return { DEFS, GROUPS, defaults, helpers: { sma, ema, rma, wma, stdev, highest, lowest, sum, atr, rsi, trueRange, src } };
});
