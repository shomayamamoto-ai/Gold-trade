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
// 足し引きで失われる端数も別に持っておく合計(Neumaier の方法)。
// 単純に足し引きを続けると誤差がたまり、同じ値が並んでも平均がその値と一致せず、
// 「終値 > 平均」のような比べ方の結果が変わってしまうため
function exactSum() {
  let s = 0, e = 0;
  return {
    add(x) { const t = s + x; e += Math.abs(s) >= Math.abs(x) ? (s - t) + x : (x - t) + s; s = t; },
    get() { return s + e; },
  };
}
function sma(a, n) {
  const out = nans(a.length);
  let sum = exactSum(), cnt = 0, same = 0;
  for (let i = 0; i < a.length; i++) {
    if (!isFinite(a[i])) { sum = exactSum(); cnt = 0; same = 0; continue; }
    sum.add(a[i]); cnt++;
    same = same && a[i] === a[i - 1] ? same + 1 : 1; // 同じ値が何本続いているか
    if (cnt > n) { sum.add(-a[i - n]); cnt--; }
    if (cnt === n) out[i] = same >= n ? a[i] : sum.get() / n; // 全部同じ値なら、平均はその値そのもの(割り算の丸めでずれないように)
  }
  return out;
}
// alpha を省略すると RMA(Wilder の平滑化、alpha = 1/n)。最初の値は n 本の単純平均
function rma(a, n, alpha) {
  const k = alpha || 1 / n, out = nans(a.length);
  let prev = NaN, sum = exactSum(), cnt = 0, first = NaN, same = true;
  for (let i = 0; i < a.length; i++) {
    if (!isFinite(a[i])) continue;
    if (!isFinite(prev)) {
      sum.add(a[i]); cnt++;
      if (cnt === 1) first = a[i]; else if (a[i] !== first) same = false;
      if (cnt === n) { prev = same ? first : sum.get() / n; out[i] = prev; }
    } else { prev += k * (a[i] - prev); out[i] = prev; } // この形なら、同じ値が続くとき値がまったく動かない
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
// 窓の平均。全部同じ値ならその値そのものを返す(0.1 を 20 個足して 20 で割ると 0.1 にならないことがあり、
// ばらつきが 0 ではなく小さな値になって Zスコア・%B・CCI がでたらめな値になるのを防ぐ)。そうでなければ1回補正する
function winMean(x, s, e) {
  const n = e - s + 1;
  let t = exactSum(), same = true;
  for (let k = s; k <= e; k++) { t.add(x[k]); if (x[k] !== x[s]) same = false; }
  if (same) return x[s];
  let m = t.get() / n, d = 0;
  for (let k = s; k <= e; k++) d += x[k] - m;
  return m + d / n;
}
// 標準偏差(母集団:n で割る。TradingView の ta.stdev と同じ)
const stdev = (a, n) => rolling(a, n, (x, s, e) => {
  const m = winMean(x, s, e);
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
const lead = len => (len ? [NaN] : []); // 1本目は前の足がないので NaN。足が0本なら空のまま(長さを足の数とそろえる)
function rsi(a, n) {
  const up = lead(a.length), dn = lead(a.length);
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
  desc: '平均線の上下に、ばらつき(標準偏差)の何倍かの帯。2倍なら、中で終わる足は約88%(95%ではない)',
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
  desc: '5本の線と「雲」で、流れ・支え・時間を見る。9・26・52 は週6日の取引の時代の数',
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
  desc: '流れの向きと、損切りを引き上げる位置の目安を点で示す。横ばいでは向きがよく入れ替わる',
  params: [P.num('start', '加速因子の初期値', 0.02, 0.001, 1, 0.01), P.num('step', '加速因子の増え方', 0.02, 0.001, 1, 0.01),
    P.num('max', '加速因子の上限', 0.2, 0.01, 2, 0.01), P.color('color', '点の色', '#2f80ed')],
  compute(bars, p) {
    const n = bars.length, out = nans(n), dir = nans(n); // dir:点が価格の下(上昇)なら 1、上(下降)なら -1。売買サインに使う
    if (n < 2) return { lines: [{ name: 'SAR', val: out, color: p.color, dots: true }], dir, label: `${p.start} ${p.max}` };
    // 手順は TradingView の ta.sar と同じ(公開されている Pine の手順をそのまま移したもの)。
    // 最初の向きは、最初の2本の終値で決める(上がっていれば上昇から)。
    // 向きが変わったかは、SAR を直前2本の高値・安値の内側に寄せる「前」に調べる(寄せたあとで調べると、切り替わりが1本以上遅れることがある)
    let res = NaN, ext = NaN, af = p.start, below = false;
    for (let i = 1; i < n; i++) {
      const b = bars[i];
      let first = false;
      if (i === 1) {
        below = b.c > bars[0].c; // 上がっていれば、点は価格の下(上昇)から始める
        ext = below ? b.h : b.l; res = below ? bars[0].l : bars[0].h;
        first = true; af = p.start;
      }
      res += af * (ext - res);
      if (below) {
        // 安値が SAR を割った:下降に切り替え。SAR は、それまでの最高値(とこの足の高値の高いほう)から始める
        if (res > b.l) { first = true; below = false; res = Math.max(b.h, ext); ext = b.l; af = p.start; }
      } else if (res < b.h) { first = true; below = true; res = Math.min(b.l, ext); ext = b.h; af = p.start; }
      if (!first) {
        if (below) { if (b.h > ext) { ext = b.h; af = Math.min(af + p.step, p.max); } }
        else if (b.l < ext) { ext = b.l; af = Math.min(af + p.step, p.max); }
      }
      // 上昇中の SAR は、直前2本の安値より上には置かない(下降中は、直前2本の高値より下には置かない)
      if (below) { res = Math.min(res, bars[i - 1].l); if (i > 1) res = Math.min(res, bars[i - 2].l); }
      else { res = Math.max(res, bars[i - 1].h); if (i > 1) res = Math.max(res, bars[i - 2].h); }
      out[i] = res; dir[i] = below ? 1 : -1;
    }
    return { lines: [{ name: 'SAR', val: out, color: p.color, dots: true }], dir, label: `${p.start} ${p.max}` };
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
      else dir = -1; // ATR が出た最初の足は下降から始める(TradingView の ta.supertrend と同じ)
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
/* その時刻が入る区切り(1日・1週間・1か月。どれも UTC。週は月曜 0 時から)の始まりの時刻。
 * 読み込んだ最初の足が区切りの途中からかを調べるのに使う */
function periodStart(t, per) {
  const day = Math.floor(t / 864e5) * 864e5;
  if (per === 'day') return day;
  if (per === 'week') return day - ((Math.floor(t / 864e5) + 3) % 7) * 864e5; // 1970-01-01 は木曜なので、3 を足すと月曜が 0 になる
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}
DEFS.vwap = {
  name: 'VWAP(出来高加重平均価格)', short: 'VWAP', group: 'volume', overlay: true,
  desc: '期間内の売買価格を、出来高で重みづけした平均。もとは注文の執行を測る基準で、合図ではない',
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
    // 読み込んだ最初の区切りが途中から始まっている(その日の 0 時より後の足からしかない)ときは、その区切りは描かない。
    // 区切りの初めからの売買が入っていないので、TradingView などの VWAP と違う値になるため
    const partial = n > 0 && bars[0].t > periodStart(bars[0].t, anchor);
    let key = null, pv = 0, vol = 0;
    for (let i = 0; i < n; i++) {
      const k = keyOf(bars[i].t);
      if (k !== key) { key = k; pv = 0; vol = 0; }
      pv += (bars[i].h + bars[i].l + bars[i].c) / 3 * bars[i].v; vol += bars[i].v;
      if (vol > 0 && !(partial && k === keyOf(bars[0].t))) out[i] = pv / vol;
    }
    return { lines: [{ name: 'VWAP', val: out, color: p.color, width: 1.8 }], label: { day: '1日', week: '1週間', month: '1か月' }[anchor] };
  },
};

// ===== オシレーター(勢い) =====
DEFS.stoch = {
  name: 'ストキャスティクス', short: 'Stoch', group: 'momentum',
  desc: '直近の高値〜安値の中で、終値がどこにあるか(0〜100)。80超は強さの印でもある',
  params: [P.int('kLen', '%K の期間', 14), P.int('kSmooth', '%K をならす期間', 1), P.int('dLen', '%D の期間', 3),
    P.num('upper', '上の基準線', 80, 50, 100, 1), P.num('lower', '下の基準線', 20, 0, 50, 1),
    P.color('cK', '%K の色', '#2f80ed'), P.color('cD', '%D の色', '#f5a623')],
  compute(bars, p) {
    const n = int(p.kLen, 14), hh = highest(col(bars, 'high'), n), ll = lowest(col(bars, 'low'), n);
    // 高値と安値が同じ(値動きがない)ときは位置が決まらないので空ける(TradingView と同じ。50 などの仮の値は出さない)
    const raw = bars.map((b, i) => (!isFinite(hh[i]) || hh[i] === ll[i] ? NaN : 100 * (b.c - ll[i]) / (hh[i] - ll[i])));
    const k = sma(raw, int(p.kSmooth, 1)), d = sma(k, int(p.dLen, 3));
    return { lines: [{ name: '%K', val: k, color: p.cK }, { name: '%D', val: d, color: p.cD }], bands: [+p.upper, +p.lower], fixed: [0, 100], label: `${p.kLen} ${p.kSmooth} ${p.dLen}` };
  },
};
const RSI_FLAT = 1e-9; // RSI(0〜100)の幅が、これ以下なら「動いていない」とみなす
DEFS.stochrsi = {
  name: 'ストキャスティクス RSI', short: 'StochRSI', group: 'momentum',
  desc: 'RSI に、さらにストキャスティクスの計算をかけたもの。反応が速い',
  params: [P.int('rsiLen', 'RSI の期間', 14), P.int('stLen', 'ストキャスティクスの期間', 14), P.int('kLen', '%K をならす期間', 3), P.int('dLen', '%D の期間', 3),
    P.source(), P.color('cK', '%K の色', '#2f80ed'), P.color('cD', '%D の色', '#f5a623')],
  compute(bars, p) {
    const r = rsi(col(bars, p.source), int(p.rsiLen, 14)), n = int(p.stLen, 14), hh = highest(r, n), ll = lowest(r, n);
    // 値動きがない間の RSI は、計算の誤差で 1e-13 ほど揺れるだけなので、幅がそれより小さいときは位置が決まらないとして空ける
    // (ちょうど同じかだけで調べていたときは、その誤差の揺れが 0〜100 に引き伸ばされ、16.67・83.33 などの意味のない値が出ていた)
    const raw = r.map((v, i) => (!isFinite(hh[i]) || hh[i] - ll[i] <= RSI_FLAT ? NaN : 100 * (v - ll[i]) / (hh[i] - ll[i])));
    const k = sma(raw, int(p.kLen, 3)), d = sma(k, int(p.dLen, 3));
    return { lines: [{ name: '%K', val: k, color: p.cK }, { name: '%D', val: d, color: p.cD }], bands: [80, 20], fixed: [0, 100], label: `${p.rsiLen} ${p.stLen} ${p.kLen} ${p.dLen}` };
  },
};
DEFS.cci = {
  name: 'CCI(商品チャネル指数)', short: 'CCI', group: 'momentum',
  desc: '価格が平均からどれだけ離れているか。±100 の外に出るのは、もとの想定より多い',
  params: [P.len(20), P.color('color', '線の色', '#16a085')],
  compute(bars, p) {
    const n = int(p.len, 20), tp = col(bars, 'hlc3'), ma = sma(tp, n);
    const md = rolling(tp, n, (x, s, e) => { const m = winMean(x, s, e); let t = 0; for (let k = s; k <= e; k++) t += Math.abs(x[k] - m); return t / n; });
    return { lines: [{ name: 'CCI', val: tp.map((v, i) => (isFinite(ma[i]) && md[i] > 0 ? (v - ma[i]) / (0.015 * md[i]) : NaN)), color: p.color }], bands: [100, -100], label: String(n) };
  },
};
DEFS.willr = {
  name: 'ウィリアムズ %R', short: '%R', group: 'momentum',
  desc: 'ストキャスティクスの %K から 100 を引いたもの(同じ計算。-100〜0)',
  params: [P.len(14), P.color('color', '線の色', '#8e44ad')],
  compute(bars, p) {
    const n = int(p.len, 14), hh = highest(col(bars, 'high'), n), ll = lowest(col(bars, 'low'), n);
    return { lines: [{ name: '%R', val: bars.map((b, i) => (!isFinite(hh[i]) || hh[i] === ll[i] ? NaN : -100 * (hh[i] - b.c) / (hh[i] - ll[i]))), color: p.color }], bands: [-20, -80], fixed: [-100, 0], label: String(n) };
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
    return { lines: [], hist: v, histDir: v.map((x, i) => (x > v[i - 1] ? 1 : -1)), histName: 'AO', bands: [0], label: `${p.fast} ${p.slow}` }; // 前と同じなら下げの色(TradingView と同じ)
  },
};
DEFS.trix = {
  name: 'TRIX', short: 'TRIX', group: 'momentum',
  desc: '3回ならした平均線の変化率(1万倍。TradingView と同じ目盛り)。細かい上下を取り除いた勢い',
  params: [P.len(15), P.int('signal', 'シグナルの期間', 9), P.color('color', 'TRIX の色', '#c0392b'), P.color('cSig', 'シグナルの色', '#f5a623')],
  compute(bars, p) {
    // TradingView の TRIX:終値の対数を3回 EMA でならし、1本前との差を 1万倍する(%で表す昔の式の約100倍の目盛り)
    const n = int(p.len, 15), e3 = ema(ema(ema(col(bars, 'close').map(v => (v > 0 ? Math.log(v) : NaN)), n), n), n);
    const t = e3.map((v, i) => (i && isFinite(e3[i - 1]) ? 10000 * (v - e3[i - 1]) : NaN));
    return { lines: [{ name: 'TRIX', val: t, color: p.color }, { name: 'シグナル', val: ema(t, int(p.signal, 9)), color: p.cSig }], bands: [0], label: `${n} ${p.signal}` };
  },
};
DEFS.adx = {
  name: 'ADX / DMI', short: 'ADX', group: 'trend',
  desc: '流れの強さ(ADX)と向き(+DI・-DI)。ADX は強さだけで、向きは示さない',
  params: [P.len(14), P.num('level', '基準線', 25, 0, 100, 1, 'ADX がこれより上なら、流れがはっきりしている目安。ただし暗号資産では、半分以上の足が 25 を超える'),
    P.color('cAdx', 'ADX の色', '#f5a623'), P.color('cPlus', '+DI の色', UP), P.color('cMinus', '-DI の色', DOWN)],
  compute(bars, p) {
    const n = int(p.len, 14), len = bars.length, pdm = lead(len), mdm = lead(len), tr = trueRange(bars);
    tr[0] = NaN;
    for (let i = 1; i < len; i++) {
      const up = bars[i].h - bars[i - 1].h, dn = bars[i - 1].l - bars[i].l;
      pdm.push(up > dn && up > 0 ? up : 0); mdm.push(dn > up && dn > 0 ? dn : 0);
    }
    // 値幅の平均が 0(値動きなし)のときは割れないので、直前の値を使い続ける(TradingView の fixnan と同じ)
    const fixnan = a => { let last = NaN; return a.map(v => (isFinite(v) ? (last = v) : last)); };
    const trS = rma(tr, n), di = dm => fixnan(map2(rma(dm, n), trS, (x, t) => (t ? 100 * x / t : NaN)));
    const pdi = di(pdm), mdi = di(mdm);
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
  desc: '1本の足の平均的な値幅。損切りの幅の物差し(2倍の幅でも、10本以内に約3割かかる)',
  params: [P.len(14), P.color('color', '線の色', '#c0392b')],
  compute(bars, p) { const n = int(p.len, 14); return { lines: [{ name: 'ATR', val: atr(bars, n), color: p.color }], bands: [], price: true, label: String(n) }; },
};
DEFS.bbw = {
  name: 'ボリンジャーバンド幅', short: 'BBW', group: 'volatility',
  desc: 'バンドの幅を%で示す。小さいほど値動きが縮んでいる(次に動く向きは分からない)',
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
    return { lines: [{ name: 'CMF', val: map2(a, b, (x, y) => (y ? x / y : NaN)), color: p.color }], bands: [0], label: String(n) }; // 出来高が 0 なら割合は決まらない
  },
};
DEFS.mfi = {
  name: 'MFI(マネーフロー指数)', short: 'MFI', group: 'volume',
  desc: '出来高を加味した RSI。0〜100',
  params: [P.len(14), P.num('upper', '上の基準線', 80, 50, 100, 1), P.num('lower', '下の基準線', 20, 0, 50, 1), P.color('color', '線の色', '#8e44ad')],
  compute(bars, p) {
    const n = int(p.len, 14), tp = col(bars, 'hlc3'), pos = lead(bars.length), neg = lead(bars.length);
    for (let i = 1; i < bars.length; i++) { const f = tp[i] * bars[i].v; pos.push(tp[i] > tp[i - 1] ? f : 0); neg.push(tp[i] < tp[i - 1] ? f : 0); }
    // 上げ・下げのお金の流れがどちらも 0 なら決まらないので空ける(TradingView と同じ)
    return { lines: [{ name: 'MFI', val: map2(sum(pos, n), sum(neg, n), (x, y) => (y === 0 ? (x ? 100 : NaN) : 100 - 100 / (1 + x / y))), color: p.color }], bands: [+p.upper, +p.lower], fixed: [0, 100], label: String(n) };
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
    // 窓の最初の値を引いてから計算する(価格が大きいときの桁落ちを減らし、横ばいなら傾きがちょうど 0 になる)
    const y0 = a[i - n + 1];
    let sy = 0, sxy = 0, ok = isFinite(y0);
    for (let k = 0; k < n && ok; k++) { const y = a[i - n + 1 + k] - y0; if (!isFinite(y)) { ok = false; break; } sy += y; sxy += k * y; }
    if (!ok || !den) continue;
    const b = (n * sxy - sx * sy) / den;
    slope[i] = b; val[i] = y0 + (sy - b * sx) / n + b * (n - 1);
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
    const a = col(bars, p.source), n = int(p.len, 9), up = lead(a.length), dn = lead(a.length);
    for (let i = 1; i < a.length; i++) { const d = a[i] - a[i - 1]; up.push(Math.max(d, 0)); dn.push(Math.max(-d, 0)); }
    return pane1('CMO', map2(sum(up, n), sum(dn, n), (x, y) => (x + y ? 100 * (x - y) / (x + y) : NaN)), p.color, { bands: [50, -50], fixed: [-100, 100], label: String(n) });
  },
};
DEFS.ultosc = {
  name: 'アルティメット・オシレーター', short: 'UO', group: 'momentum',
  desc: '3つの期間の買いの強さを合わせた指標(0〜100)',
  params: [P.int('a', '短期', 7), P.int('b', '中期', 14), P.int('c', '長期', 28), P.color('color', '線の色', '#c0392b')],
  compute(bars, p) {
    const bp = lead(bars.length), tr = lead(bars.length);
    for (let i = 1; i < bars.length; i++) { const pc = bars[i - 1].c, lo = Math.min(bars[i].l, pc); bp.push(bars[i].c - lo); tr.push(Math.max(bars[i].h, pc) - lo); }
    const avg = n => map2(sum(bp, n), sum(tr, n), (x, y) => (y ? x / y : NaN)); // 値動きが 0 なら決まらない(TradingView と同じ)
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
      // 期間中の値動きがないときは位置が決まらないので空け、次の足から 0 で計算し直す(TradingView と同じ)
      if (!(hh[i] > ll[i])) { v = 0; prev = 0; continue; }
      v = 0.66 * ((m[i] - ll[i]) / (hh[i] - ll[i]) - 0.5) + 0.67 * v;
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
        if (same === n) { d2 = NaN; break; } // 全部同じ値なら順位の相関は決まらない(50 などの仮の値は出さない)
        const rank = higher + (same + 1) / 2; // 同じ値は順位を平均する
        d2 += (k + 1 - rank) * (k + 1 - rank);
      }
      if (isFinite(d2)) out[i] = (1 - 6 * d2 / (n * (n * n - 1))) * 100;
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
    const n = int(p.len, 14), vp = lead(bars.length), vm = lead(bars.length), tr = trueRange(bars);
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
  compute(bars, p) {
    // 高値と安値が同じ足(値動きがない)は、割合が決まらないので空ける(TradingView と同じ。ならす期間の間は線も空く)
    const raw = bars.map(b => (b.h > b.l ? (b.c - b.o) / (b.h - b.l) : NaN));
    return pane1('BOP', sma(raw, int(p.smooth, 14)), p.color, { bands: [0], label: String(p.smooth) });
  },
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

// ================================================================ さらに追加したインジケーター(2026年11月)
// 移動平均の種類をまとめて選べるようにする
function maOf(kind, a, n, vol) {
  switch (kind) {
    case 'ema': return ema(a, n);
    case 'rma': return rma(a, n);
    case 'wma': return wma(a, n);
    case 'hma': return hma(a, n);
    case 'dema': return dema(a, n);
    case 'tema': return tema(a, n);
    case 'kama': return kama(a, n);
    case 'vwma': return vwma(a, vol, n);
    default: return sma(a, n);
  }
}
const MA_OPTIONS = [['sma', '単純 (SMA)'], ['ema', '指数 (EMA)'], ['rma', 'ならし (RMA)'], ['wma', '加重 (WMA)'], ['hma', 'ハル (HMA)'],
  ['dema', '2重指数 (DEMA)'], ['tema', '3重指数 (TEMA)'], ['kama', '適応型 (KAMA)'], ['vwma', '出来高加重 (VWMA)']];

// 複数の移動平均線:期間の違う線を最大8本、まとめて出す。日本でよく使われる 7・25・75・100・200 を最初から表示する
const MAS_SLOTS = [[7, '#e91e63', true], [25, '#f5a623', true], [75, '#27ae60', true], [100, '#2f80ed', true], [200, '#8e44ad', true],
  [5, '#00acc1', false], [20, '#8d6e63', false], [50, '#607d8b', false]];
DEFS.mas = {
  name: '移動平均線(複数の期間)', short: 'MA', group: 'trend', overlay: true,
  desc: '期間の違う移動平均線を、最大8本まとめて表示する(最初は 7・25・75・100・200)',
  params: [{ key: 'kind', label: '種類', type: 'select', def: 'sma', options: MA_OPTIONS }, P.source(),
    P.num('width', '線の太さ', 1.4, 0.5, 5, 0.5)]
    .concat(...MAS_SLOTS.map(([n, c, on], i) => [
      { key: `on${i + 1}`, label: `線${i + 1} を表示`, type: 'bool', def: on },
      { key: `len${i + 1}`, label: `線${i + 1} の期間(本)`, type: 'int', def: n, min: 1, max: 1000 },
      P.color(`c${i + 1}`, `線${i + 1} の色`, c),
    ])),
  compute(bars, p) {
    const a = col(bars, p.source), vol = bars.map(b => b.v), lines = [], used = [];
    MAS_SLOTS.forEach((_, i) => {
      if (!p[`on${i + 1}`]) return;
      const n = Math.min(1000, int(p[`len${i + 1}`], 20));
      used.push(n);
      lines.push({ name: String(n), val: maOf(p.kind, a, n, vol), color: p[`c${i + 1}`], width: +p.width || 1.4 });
    });
    return { lines, label: `${String(p.kind).toUpperCase()} ${used.join('/')}` };
  },
};

DEFS.pivot = {
  name: 'ピボットポイント', short: 'Pivot', group: 'trend', overlay: true,
  desc: '前の日(週・月)の高値・安値・終値から引く5本の目安。止まりやすさは、でたらめな線とほぼ同じ',
  params: [{ key: 'period', label: '何の区切りで計算するか', type: 'select', def: 'auto',
    options: [['auto', '自動(時間足に合わせる)'], ['D', '前の日'], ['W', '前の週'], ['M', '前の月']], hint: '自動:日足より短い足は前の日、日足は前の週、それより長い足は前の月' },
  P.color('cP', 'ピボット(P)の色', '#f5a623'), P.color('cR', '上の線(R)の色', DOWN), P.color('cS', '下の線(S)の色', UP)],
  compute(bars, p) {
    const n = bars.length, P0 = nans(n), R1 = nans(n), R2 = nans(n), S1 = nans(n), S2 = nans(n);
    let per = p.period;
    if (per === 'auto') {
      const gap = n > 2 ? bars[n - 1].t - bars[n - 2].t : 864e5;
      per = gap < 864e5 ? 'D' : gap < 6048e5 ? 'W' : 'M';
    }
    const key = t => { const d = new Date(t); return per === 'D' ? Math.floor(t / 864e5) : per === 'W' ? Math.floor((t - 4 * 864e5) / 6048e5) : d.getUTCFullYear() * 12 + d.getUTCMonth(); };
    // 読み込んだ最初の区切りが途中から始まっているときは、その区切りの高値・安値・終値は本当の値ではない
    // (例:1時間足を 23 時から読むと、「前の日」が1本だけになる)。そこから計算した次の区切りの線は描かない
    const pPer = { D: 'day', W: 'week', M: 'month' }[per], partial = n > 0 && bars[0].t > periodStart(bars[0].t, pPer);
    let cur = null, prev = null;
    for (let i = 0; i < n; i++) {
      const b = bars[i], k = key(b.t);
      if (!cur || cur.k !== k) { prev = cur; cur = { k, h: b.h, l: b.l, c: b.c, start: true, part: !cur && partial }; }
      else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.start = false; }
      if (!prev || prev.part || cur.start) continue; // 区切りの最初の足は空けて、前の区切りの線とつながらないようにする
      const pv = (prev.h + prev.l + prev.c) / 3, r = prev.h - prev.l;
      P0[i] = pv; R1[i] = 2 * pv - prev.l; S1[i] = 2 * pv - prev.h; R2[i] = pv + r; S2[i] = pv - r;
    }
    return { lines: [{ name: 'R2', val: R2, color: p.cR, width: 1 }, { name: 'R1', val: R1, color: p.cR }, { name: 'P', val: P0, color: p.cP },
      { name: 'S1', val: S1, color: p.cS }, { name: 'S2', val: S2, color: p.cS, width: 1 }], label: { D: '日', W: '週', M: '月' }[per] };
  },
};

DEFS.fractal = {
  name: 'ウィリアムズ・フラクタル', short: 'Fractal', group: 'trend', overlay: true,
  desc: '前後2本より高い山に▼、前後2本より低い谷に▲を付ける(2本あとに確定)',
  params: [],
  compute(bars) {
    const n = bars.length, top = nans(n), bot = nans(n), N = 2;
    // TradingView の Williams Fractals と同じ判定:あとの2本は必ず低い(谷なら高い)。
    // 前は、同じ高さの足が4本まで続いていてもよく、その先の2本が低ければ山とする(平らな天井も山として拾う)
    const isPeak = (i, v) => {
      for (let k = 1; k <= N; k++) if (!(v(i + k) < v(i))) return false;
      for (let e = 0; e <= 4 && i - e - N >= 0; e++) {
        let ok = true;
        for (let k = 1; k <= e && ok; k++) if (v(i - k) > v(i)) ok = false;
        for (let k = 1; k <= N && ok; k++) if (!(v(i - e - k) < v(i))) ok = false;
        if (ok) return true;
      }
      return false;
    };
    for (let i = N; i < n - N; i++) {
      top[i] = isPeak(i, j => bars[j].h) ? 1 : 0;
      bot[i] = isPeak(i, j => -bars[j].l) ? 1 : 0;
    }
    return { lines: [], marks: [{ name: '山', dir: 'down', val: top }, { name: '谷', dir: 'up', val: bot }], label: '' };
  },
};

DEFS.alma = {
  name: 'ALMA(アルノー・ルグー移動平均)', short: 'ALMA', group: 'trend', overlay: true,
  desc: '新しい足に重みを寄せた、なめらかで遅れの少ない移動平均線',
  params: [P.len(9), P.num('offset', '重みの位置(0〜1、1に近いほど新しい足)', 0.85, 0, 1, 0.01), P.num('sigma', 'なめらかさ', 6, 0.1, 50, 0.1), P.source(), P.color('color', '線の色', '#00acc1')],
  compute(bars, p) {
    const n = int(p.len, 9), a = col(bars, p.source), out = nans(a.length), m = p.offset * (n - 1), s = n / p.sigma, w = []; // m は切り捨てない(TradingView の ta.alma の既定。もとの ALMA の式も同じ)
    let ws = 0;
    for (let k = 0; k < n; k++) { const v = Math.exp(-((k - m) * (k - m)) / (2 * s * s)); w.push(v); ws += v; }
    for (let i = n - 1; i < a.length; i++) {
      let t = 0, ok = true;
      for (let k = 0; k < n; k++) { const v = a[i - n + 1 + k]; if (!isFinite(v)) { ok = false; break; } t += w[k] * v; }
      if (ok) out[i] = t / ws;
    }
    return { lines: [{ name: 'ALMA', val: out, color: p.color }], label: `${n} ${p.offset} ${p.sigma}` };
  },
};

DEFS.mcginley = {
  name: 'マクギニー・ダイナミック', short: 'McGinley', group: 'trend', overlay: true,
  desc: '値動きが速いときは速く、遅いときはゆっくり追いかける移動平均線',
  params: [P.len(14), P.source(), P.color('color', '線の色', '#795548')],
  compute(bars, p) {
    const n = int(p.len, 14), a = col(bars, p.source), out = nans(a.length), e = ema(a, n);
    let md = NaN;
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      if (!isFinite(x)) continue;
      // 最初の値は EMA(= 最初の n 本の単純平均)から始める(TradingView と同じ。1本目の価格から始めると、しばらく値がずれる)
      md = isFinite(md) && md !== 0 ? md + (x - md) / (n * Math.pow(x / md, 4)) : e[i];
      out[i] = md;
    }
    return { lines: [{ name: 'MD', val: out, color: p.color }], label: String(n) };
  },
};

DEFS.tsi = {
  name: 'TSI(トゥルー・ストレングス・インデックス)', short: 'TSI', group: 'momentum',
  desc: '値動きを2回ならした勢いの指標(−100〜100)。0より上なら上向き',
  params: [P.int('long', '1回目にならす期間', 25), P.int('short', '2回目にならす期間', 13), P.int('signal', 'シグナルの期間', 13), P.source(),
    P.color('color', 'TSI の色', '#2f80ed'), P.color('cSig', 'シグナルの色', '#f5a623')],
  compute(bars, p) {
    const a = col(bars, p.source), m = lead(a.length), am = lead(a.length);
    for (let i = 1; i < a.length; i++) { const d = a[i] - a[i - 1]; m.push(d); am.push(Math.abs(d)); }
    const L = int(p.long, 25), S = int(p.short, 13);
    const v = map2(ema(ema(m, L), S), ema(ema(am, L), S), (x, y) => (y ? 100 * x / y : NaN)), sg = ema(v, int(p.signal, 13)); // 値動きなしは決まらない
    return { lines: [{ name: 'TSI', val: v, color: p.color }, { name: 'シグナル', val: sg, color: p.cSig }], bands: [25, 0, -25], label: `${L} ${S} ${p.signal}` };
  },
};

DEFS.kst = {
  name: 'KST(ノウ・シュア・シング)', short: 'KST', group: 'momentum',
  desc: '4つの期間の変化率を重みづけして足した、長めの勢いの指標',
  params: [P.int('signal', 'シグナルの期間', 9), P.color('color', 'KST の色', '#2f80ed'), P.color('cSig', 'シグナルの色', '#f5a623')],
  compute(bars, p) {
    const c = col(bars, 'close'), roc = n => c.map((v, i) => (i >= n && c[i - n] ? (v / c[i - n] - 1) * 100 : NaN));
    const parts = [[10, 10, 1], [15, 10, 2], [20, 10, 3], [30, 15, 4]].map(([r, s, w]) => sma(roc(r), s).map(v => v * w));
    const k = parts[0].map((v, i) => v + parts[1][i] + parts[2][i] + parts[3][i]), sg = sma(k, int(p.signal, 9));
    return { lines: [{ name: 'KST', val: k, color: p.color }, { name: 'シグナル', val: sg, color: p.cSig }], bands: [0], label: `10/15/20/30 ${p.signal}` };
  },
};

DEFS.crsi = {
  name: 'コナーズRSI', short: 'CRSI', group: 'momentum',
  desc: '短い RSI・連続して上げ下げした日数・値動きの大きさの順位を平均した、短期の行きすぎの指標(0〜100)',
  params: [P.int('rsiLen', '価格の RSI の期間', 3), P.int('streakLen', '連続日数の RSI の期間', 2), P.int('rankLen', '順位を見る期間', 100), P.color('color', '線の色', '#c0392b')],
  compute(bars, p) {
    const c = col(bars, 'close'), n = c.length, streak = n ? [0] : [], roc = lead(n), rank = nans(n), R = int(p.rankLen, 100);
    for (let i = 1; i < n; i++) {
      const s = streak[i - 1];
      streak.push(c[i] > c[i - 1] ? (s > 0 ? s + 1 : 1) : c[i] < c[i - 1] ? (s < 0 ? s - 1 : -1) : 0);
      roc.push(c[i - 1] ? 100 * (c[i] - c[i - 1]) / c[i - 1] : NaN); // ta.roc と同じ式の順(同じ値どうしの比べ方を揃える)
    }
    for (let i = R + 1; i < n; i++) {
      let below = 0;
      // 過去 R 本のうち、今の変化率「以下」だった割合(TradingView の ta.percentrank と同じ。同じ値も数える)
      for (let k = i - R; k < i; k++) if (roc[k] <= roc[i]) below++;
      rank[i] = below / R * 100;
    }
    const r1 = rsi(c, int(p.rsiLen, 3)), r2 = rsi(streak, int(p.streakLen, 2));
    const v = r1.map((x, i) => (isFinite(x) && isFinite(r2[i]) && isFinite(rank[i]) ? (x + r2[i] + rank[i]) / 3 : NaN));
    return { lines: [{ name: 'CRSI', val: v, color: p.color }], bands: [90, 10], fixed: [0, 100], label: `${p.rsiLen} ${p.streakLen} ${R}` };
  },
};

DEFS.squeeze = {
  name: 'スクイーズ・モメンタム', short: 'Squeeze', group: 'volatility',
  desc: 'ボリンジャーバンドがケルトナーチャネルの内側に縮んだ「スクイーズ」(赤い点)と、勢いの棒グラフ',
  params: [P.int('bbLen', 'ボリンジャーの期間', 20), P.num('bbMult', 'ボリンジャーの幅', 2, 0.1, 10, 0.1), P.int('kcLen', 'ケルトナーの期間', 20), P.num('kcMult', 'ケルトナーの幅', 1.5, 0.1, 10, 0.1)],
  compute(bars, p) {
    const c = col(bars, 'close'), bl = int(p.bbLen, 20), kl = int(p.kcLen, 20), n = c.length;
    const mid = sma(c, bl), sd = stdev(c, bl), kmid = sma(c, kl), rng = sma(trueRange(bars), kl);
    const hh = highest(col(bars, 'high'), kl), ll = lowest(col(bars, 'low'), kl);
    const dev = c.map((v, i) => v - ((hh[i] + ll[i]) / 2 + kmid[i]) / 2);
    const mom = linreg(dev, kl).val, on = nans(n), off = nans(n);
    for (let i = 0; i < n; i++) {
      if (!isFinite(sd[i]) || !isFinite(rng[i])) continue;
      const sq = mid[i] - p.bbMult * sd[i] > kmid[i] - p.kcMult * rng[i] && mid[i] + p.bbMult * sd[i] < kmid[i] + p.kcMult * rng[i];
      if (sq) on[i] = 0; else off[i] = 0;
    }
    return { lines: [{ name: 'スクイーズ中', val: on, color: DOWN, dots: true }, { name: 'なし', val: off, color: '#9aa0b0', dots: true }],
      hist: mom, histName: '勢い', bands: [], label: `${bl} ${p.bbMult} ${kl} ${p.kcMult}` };
  },
};

DEFS.ulcer = {
  name: 'アルサー・インデックス', short: 'Ulcer', group: 'volatility',
  desc: '直近の高値からの下げの深さと長さを測る。下落のつらさ(リスク)の目安',
  params: [P.len(14), P.color('color', '線の色', '#c0392b')],
  compute(bars, p) {
    const n = int(p.len, 14), c = col(bars, 'close'), hh = highest(c, n), dd = c.map((v, i) => (hh[i] ? 100 * (v - hh[i]) / hh[i] : NaN));
    const v = sum(dd.map(x => x * x), n).map(x => Math.sqrt(x / n));
    return { lines: [{ name: 'Ulcer', val: v, color: p.color }], bands: [], floor: 0, label: String(n) };
  },
};

DEFS.chvol = {
  name: 'チャイキン・ボラティリティ', short: 'ChVol', group: 'volatility',
  desc: '高値と安値の幅のならし値が、何本前と比べて何%広がったか',
  params: [P.int('ema', 'ならす期間', 10), P.int('roc', '比べる本数', 10), P.color('color', '線の色', '#8e44ad')],
  compute(bars, p) {
    const e = ema(bars.map(b => b.h - b.l), int(p.ema, 10)), k = int(p.roc, 10);
    return { lines: [{ name: 'ChVol', val: e.map((v, i) => (i >= k && e[i - k] ? (v / e[i - k] - 1) * 100 : NaN)), color: p.color }], bands: [0], label: `${p.ema} ${p.roc}` };
  },
};

DEFS.ac = {
  name: 'アクセラレーター(AC)', short: 'AC', group: 'momentum',
  desc: 'オーサム・オシレーターの変化の速さ。勢いが加速しているか減速しているか',
  params: [],
  compute(bars) {
    const m = col(bars, 'hl2'), ao = map2(sma(m, 5), sma(m, 34), (x, y) => x - y), ac = map2(ao, sma(ao, 5), (x, y) => x - y);
    return { lines: [], hist: ac, histDir: ac.map((v, i) => (i && isFinite(ac[i - 1]) ? v - ac[i - 1] : 0)), histName: 'AC', bands: [0], label: '5 34 5' };
  },
};

DEFS.kvo = {
  name: 'クリンガー・オシレーター', short: 'KVO', group: 'volume',
  desc: '上げた足・下げた足の出来高の、短期と長期の平均の差。お金の流れの向き',
  params: [P.int('fast', '短期の期間', 34), P.int('slow', '長期の期間', 55), P.int('signal', 'シグナルの期間', 13), P.color('color', 'KVO の色', '#2f80ed'), P.color('cSig', 'シグナルの色', '#f5a623')],
  compute(bars, p) {
    const h3 = col(bars, 'hlc3'), sv = bars.map((b, i) => (i ? (h3[i] - h3[i - 1] >= 0 ? b.v : -b.v) : NaN));
    const k = map2(ema(sv, int(p.fast, 34)), ema(sv, int(p.slow, 55)), (x, y) => x - y), sg = ema(k, int(p.signal, 13));
    return { lines: [{ name: 'KVO', val: k, color: p.color }, { name: 'シグナル', val: sg, color: p.cSig }], bands: [0], label: `${p.fast} ${p.slow} ${p.signal}` };
  },
};

DEFS.pvt = {
  name: 'PVT(プライス・ボリューム・トレンド)', short: 'PVT', group: 'volume',
  desc: '値動きの割合に出来高を掛けて足し続けた線。OBV より値動きの大きさを反映する',
  params: [P.color('color', '線の色', '#16a085')],
  compute(bars, p) {
    let acc = 0;
    const v = bars.map((b, i) => (i && bars[i - 1].c ? (acc += (b.c - bars[i - 1].c) / bars[i - 1].c * b.v) : (i ? acc : 0)));
    return { lines: [{ name: 'PVT', val: v, color: p.color }], bands: [], label: '' };
  },
};

DEFS.pvo = {
  name: 'PVO(出来高オシレーター%)', short: 'PVO', group: 'volume',
  desc: '出来高の短期と長期の平均の差を%で表す。出来高が増えているかどうか',
  params: [P.int('fast', '短期の期間', 12), P.int('slow', '長期の期間', 26), P.int('signal', 'シグナルの期間', 9), P.color('color', 'PVO の色', '#2f80ed'), P.color('cSig', 'シグナルの色', '#f5a623')],
  compute(bars, p) {
    const v = bars.map(b => b.v), s = ema(v, int(p.slow, 26)), k = map2(ema(v, int(p.fast, 12)), s, (x, y) => (y ? (x - y) / y * 100 : NaN)), sg = ema(k, int(p.signal, 9));
    return { lines: [{ name: 'PVO', val: k, color: p.color }, { name: 'シグナル', val: sg, color: p.cSig }], hist: map2(k, sg, (x, y) => x - y), histName: '差', bands: [0], label: `${p.fast} ${p.slow} ${p.signal}` };
  },
};

DEFS.rvol = {
  name: '相対出来高(RVOL)', short: 'RVOL', group: 'volume',
  desc: 'いまの出来高が、ふだん(平均)の何倍か。2倍を超えると注目されているしるし',
  params: [P.len(20), P.color('color', '線の色', '#e67e22')],
  compute(bars, p) {
    const n = int(p.len, 20), v = bars.map(b => b.v), avg = sma(v, n);
    return { lines: [{ name: '倍', val: map2(v, avg, (x, y) => (y ? x / y : NaN)), color: p.color }], bands: [1, 2], floor: 0, label: String(n) };
  },
};

DEFS.qstick = {
  name: 'Qスティック', short: 'Qstick', group: 'momentum',
  desc: '終値 − 始値 の平均。陽線が優勢ならプラス、陰線が優勢ならマイナス',
  params: [P.len(14), P.color('color', '線の色', '#16a085')],
  compute(bars, p) {
    const n = int(p.len, 14);
    return { lines: [{ name: 'Q', val: sma(bars.map(b => b.c - b.o), n), color: p.color }], bands: [0], label: String(n) };
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
  valuewhen: { args: 'xx', desc: '条件が最後に成り立った足での、2つ目の値', eg: 'valuewhen(volume > sma(volume, 20), close)' },
};
class FormulaError extends Error { constructor(m) { super(m); this.name = 'FormulaError'; } }
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k); // constructor などの、もとからある名前を部品とまちがえない
function tokenize(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let j = i; while (j < text.length && /[0-9.]/.test(text[j])) j++;
      // 1e6 のような書き方(10 の何乗)も数として読む
      const ex = /^e[+-]?\d+/i.exec(text.slice(j)); if (ex) j += ex[0].length;
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
        const f = own(FUNCS, t.v) ? FUNCS[t.v] : null;
        if (!f) throw new FormulaError(`「${t.v}」という関数はありません。`);
        const args = [];
        if (!eat(')')) { do args.push(compare()); while (eat(',')); if (!eat(')')) throw new FormulaError(`「${t.v}(」のかっこが閉じていません。`); }
        const need = f.args.replace('?', '').length, most = f.args.replace('?', '').length + (f.args.includes('?') ? 0 : 0);
        const min = f.args.endsWith('?') ? need - 1 : need;
        if (args.length < min || args.length > Math.max(need, most)) throw new FormulaError(`「${t.v}」に渡す値の数が違います。例: ${f.eg}`);
        return node({ k: 'call', f: t.v, args });
      }
      if (own(SERIES, t.v) || ['hl2', 'hlc3', 'ohlc4', 'p1', 'p2', 'p3'].includes(t.v)) return node({ k: 'var', v: t.v });
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
const LEN_MAX = 500; // 式の中で使える期間(本数)の上限
function evalFormula(ast, bars, vars) {
  const n = bars.length;
  const arr = v => (Array.isArray(v) ? v : new Array(n).fill(v));
  const each2 = (a, b, fn) => {
    if (!Array.isArray(a) && !Array.isArray(b)) return fn(a, b);
    const A = arr(a), B = arr(b); // 片方が数のときも、配列は1回だけ作る(足の数が多くても遅くならないように)
    return A.map((x, i) => fn(x, B[i]));
  };
  const len = v => {
    if (Array.isArray(v)) throw new FormulaError('期間(本数)には、数を入れてください(例: 20 や p1)。');
    const k = Math.max(1, Math.round(v) || 1);
    // 500 本より長い期間は、黙って 500 に縮めると、別の線(期間 500 の線)を見せてしまうので、はっきり断る
    if (k > LEN_MAX) throw new FormulaError(`期間は ${LEN_MAX} 本までです(${k} 本が指定されています)。`);
    return k;
  };
  const cmp = f => (x, y) => (isFinite(x) && isFinite(y) ? +f(x, y) : NaN);
  const ops = {
    '+': (x, y) => x + y, '-': (x, y) => x - y, '*': (x, y) => x * y, '/': (x, y) => (y === 0 ? NaN : x / y),
    // 比べる相手にまだ値がない足(期間が足りない最初のほう)は、「成り立たない」ではなく「分からない」にする。
    // そうしないと not(...) や != が、最初の足すべてで成り立ってしまう
    '>': cmp((x, y) => x > y), '<': cmp((x, y) => x < y), '>=': cmp((x, y) => x >= y), '<=': cmp((x, y) => x <= y), '==': cmp((x, y) => x === y), '!=': cmp((x, y) => x !== y),
  };
  function ev(nd) {
    switch (nd.k) {
      case 'num': return nd.v;
      case 'neg': { const a = ev(nd.a); return Array.isArray(a) ? a.map(x => -x) : -a; }
      case 'bin': return each2(ev(nd.a), ev(nd.b), ops[nd.op]);
      case 'var':
        if (own(SERIES, nd.v)) return bars.map(b => b[SERIES[nd.v]]);
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
          // 「最後に条件が成り立った足」の値を、次に成り立つまで持ち続ける(ブレイクした線の高さを覚えておく、などに使う)
          case 'valuewhen': { const c = arr(a[0]), s = arr(a[1]); let last = NaN; return c.map((v, i) => { if (isFinite(v) && v !== 0) last = s[i]; return last; }); }
          default: throw new FormulaError(`「${nd.f}」は計算できません。`);
        }
      }
    }
  }
  return arr(ev(ast)).map(v => (isFinite(v) ? v : NaN));
}
// 式を確かめる。問題なければ null、あれば説明の文を返す
// nInputs を渡すと、用意していない p2・p3 を式で使っている場合も間違いとして知らせる
function checkFormula(text, nInputs) {
  try {
    const ast = parseFormula(text);
    if (nInputs !== undefined) {
      const walk = nd => {
        if (!nd || typeof nd !== 'object') return;
        if (nd.k === 'var' && /^p[123]$/.test(nd.v) && +nd.v[1] > nInputs) throw new FormulaError(`式の中の ${nd.v} が「調整できる数値」にありません。数値を追加するか、式から ${nd.v} を消してください。`);
        walk(nd.a); walk(nd.b); (nd.args || []).forEach(walk);
      };
      walk(ast);
    }
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

// ===== 研究(論文)で使われた形のもの =====
// 1本の足の長さ(ミリ秒)。足の時刻の間隔のうち、いちばん多いもの(抜けた足があってもずれないように)
function barMs(bars) {
  const n = bars.length, cnt = new Map();
  for (let i = Math.max(1, n - 200); i < n; i++) { const d = bars[i].t - bars[i - 1].t; if (d > 0) cnt.set(d, (cnt.get(d) || 0) + 1); }
  let best = NaN, k = 0;
  cnt.forEach((c, d) => { if (c > k) { k = c; best = d; } });
  return best;
}
// 1年に何本の足があるか。暗号資産は土日も休まず動くので、365日 × 24時間で数える(1時間足 8760、4時間足 2190、日足 365)
const YEAR_MS = 365 * 864e5;
const barsPerYear = ms => (ms > 0 ? YEAR_MS / ms : NaN);
// n 本前からの変化率(%)。足りない足は NaN
const pastRet = (c, n) => c.map((v, i) => (i >= n && c[i - n] > 0 ? (v / c[i - n] - 1) * 100 : NaN));
DEFS.tsmom = {
  name: '時系列モメンタム(TSMOM)', short: 'TSMOM', group: 'momentum',
  desc: '過去 n 本の値上がり率と、その符号(+ なら上昇の流れ)。Moskowitz・Ooi・Pedersen(2012)と Hurst ら(2017)が使った「過去12か月・3か月・1か月」の形。日足では 252・63・21 本',
  params: [P.int('len1', '長い期間(棒と色。符号を見る)', 252), P.int('len2', '中くらいの期間', 63), P.int('len3', '短い期間', 21),
    P.color('c2', '中くらいの線の色', '#2f80ed'), P.color('c3', '短い線の色', '#f5a623')],
  compute(bars, p) {
    const c = col(bars, 'close'), a = int(p.len1, 252), b = int(p.len2, 63), d = int(p.len3, 21), r = pastRet(c, a);
    return {
      lines: [{ name: `${b}本`, val: pastRet(c, b), color: p.c2 }, { name: `${d}本`, val: pastRet(c, d), color: p.c3 }],
      hist: r, histDir: r.map(v => (v > 0 ? 1 : -1)), histName: `${a}本`, bands: [0], label: `${a} ${b} ${d}`,
    };
  },
};
DEFS.cmom = {
  name: '暗号資産の短期モメンタム(1〜4週)', short: '週モメ', group: 'momentum',
  desc: '過去 1・2・3・4 週間の値上がり率(%)。Liu・Tsyvinski(2021)と Dobrynskaya(2023)は、暗号資産では2〜4週の流れが続きやすく、1か月を超えると反転しやすいと報告。足の長さから週の本数を求める(1時間足なら1週 = 168本)',
  params: [P.color('c1', '1週の色', '#e91e63'), P.color('c2', '2週の色', '#f5a623'), P.color('c3', '3週の色', '#27ae60'), P.color('c4', '4週の色', '#2f80ed')],
  compute(bars, p) {
    const c = col(bars, 'close'), ms = barMs(bars), wk = ms > 0 ? Math.max(1, Math.round(7 * 864e5 / ms)) : NaN;
    const ln = (k, color) => ({ name: `${k}週`, val: isFinite(wk) ? pastRet(c, k * wk) : nans(c.length), color });
    return { lines: [ln(1, p.c1), ln(2, p.c2), ln(3, p.c3), ln(4, p.c4)], bands: [0], label: isFinite(wk) ? `1週=${wk}本` : '' };
  },
};
/* 実現ボラティリティ(年率)。i 本目の値は「i−1 本目の終値まで」の値動きだけで計算する(その足の値動きは使わない。先読みをしない)。
 * kind 'sd': 直前 n 本の変化率の標準偏差。'ewma': 変化率の2乗を、λ の重みでならしたもの(RiskMetrics の形。平均は 0 とみる) */
function realizedVol(bars, n, kind, lambda) {
  const c = col(bars, 'close'), N = c.length, r = c.map((v, i) => (i && c[i - 1] > 0 ? v / c[i - 1] - 1 : NaN));
  const k = Math.sqrt(barsPerYear(barMs(bars))), out = nans(N);
  if (kind === 'ewma') {
    let v = NaN, m = 0;
    for (let i = 1; i < N; i++) {
      // out[i] には、r[i−1] までをならした値を入れる
      if (isFinite(v) && m >= n) out[i] = Math.sqrt(v) * k;
      if (!isFinite(r[i])) continue;
      v = isFinite(v) ? lambda * v + (1 - lambda) * r[i] * r[i] : r[i] * r[i];
      m++;
    }
  } else {
    const sd = stdev(r, n);
    for (let i = 1; i < N; i++) out[i] = sd[i - 1] * k;
  }
  return out;
}
DEFS.voltarget = {
  name: 'ボラティリティ目標の持ち高', short: '持ち高', group: 'volatility',
  desc: '目標の値動き(年率)÷ 実際の値動き(年率)で、資金の何割を持つかの目安(上限 1 = 全額)。値動きが大きいときほど小さくなる。Moreira・Muir(2017)、Barroso・Santa-Clara(2015)、Harvey ら(2018)の方法。前の足までのデータだけで計算',
  params: [P.num('target', '目標の値動き(年率 %)', 20, 1, 200, 1), P.int('len', '期間(本)', 20),
    { key: 'kind', label: '計算のしかた', type: 'select', def: 'sd', options: [['sd', '直近 n 本の標準偏差'], ['ewma', 'ならした値(EWMA、λ=0.94)']] },
    P.color('color', '線の色', '#16a085')],
  compute(bars, p) {
    const vol = realizedVol(bars, int(p.len, 20), p.kind, 0.94), tg = (+p.target || 20) / 100;
    return pane1('持ち高', vol.map(v => (v > 0 ? Math.min(1, tg / v) : NaN)), p.color, { bands: [1, 0.5], fixed: [0, 1.05], label: `${p.target}% ${p.len}${p.kind === 'ewma' ? ' EWMA' : ''}` });
  },
};
DEFS.volshock = {
  name: '出来高ショック(注目度)', short: '出来高Z', group: 'volume',
  desc: 'その足の出来高が、直前 n 本の平均から、ばらつきの何倍離れているか(その足自身は平均に入れない)。Liu・Tsyvinski(2021)は注目度(検索数)の急増が翌週の値動きを予想すると報告。Barber・Odean(2008)は、個人は注目を集めた銘柄を買いがちだと報告',
  params: [P.len(52), P.color('color', '線の色', '#8e44ad')],
  compute(bars, p) {
    const n = int(p.len, 52), v = bars.map(b => b.v), m = sma(v, n), sd = stdev(v, n);
    return pane1('Z', v.map((x, i) => (i >= 1 && sd[i - 1] > 0 ? (x - m[i - 1]) / sd[i - 1] : NaN)), p.color, { bands: [2, 0], label: String(n) });
  },
};

// ================================================================ 売買サイン(定番インジケーターの、よく知られた合図)
/* インジケーターの線から「買」「売」の合図を出す決まり。どれも、よく使われる定義をそのまま機械的に当てはめたもので、おすすめではない。
 * 共通の決まり:
 *   ・合図は、条件が「成り立っていない → 成り立った」に変わった足にだけ付ける(成り立っている間ずっとではない)。
 *     交差は「i 本目で a > b、1本前は a <= b」(このサイトの式の crossover と同じ。下抜けは逆)。前の足の値がないときは付けない
 *   ・使うのは、その足とそれより前の足の値だけ(先読みをしない)。いちばん右の、まだ確定していない足の合図は、画面の側で消す
 *     (足が確定するまで値が変わり、合図が出たり消えたりするため。確定した足の合図は、あとから変わらない)
 *   ・TradingView の組み込みの「ストラテジー」と同じ考え方にしたものは、kinds の tv に名前を書いた。
 *     ただし TradingView のストラテジーの多くは「次の足で、合図の価格に逆指値を置く」形で、このサイトは「確定した足の合図で、次の足の始値で売買」
 * kinds の各項目:
 *   id: 保存に使う名前 / label: 選ぶ欄の文字 / rule: 決まり(やさしい言葉) / note: 調べた結果の1行 / guide: 教科書の節 / tv: 参考にした TradingView の形
 * compute(bars, p, out, kind) は { up, down, upName, downName, upText, downText } を返す(up・down は足ごとの 0 / 1) */
const SIGNALS = {};
const sigAt = (x, i) => (typeof x === 'number' ? x : x[i]);
// a が b を下から上に抜けた足で 1(up = false なら、上から下に抜けた足)。b は数でもよい
function crossSig(a, b, up) {
  return a.map((v, i) => {
    if (!i) return 0;
    const q = sigAt(b, i), pv = a[i - 1], pq = sigAt(b, i - 1);
    if (!(isFinite(v) && isFinite(q) && isFinite(pv) && isFinite(pq))) return 0;
    return +(up ? v > q && pv <= pq : v < q && pv >= pq);
  });
}
// 状態(1 = 成り立つ / 0 = 成り立たない / NaN = まだ分からない)が 0 から 1 に変わった足で 1
const turnOn = s => s.map((v, i) => +(i > 0 && v === 1 && s[i - 1] === 0));
const both = (a, b) => a.map((v, i) => +(v === 1 && b[i] === 1));
const lineOf = (out, k) => (out.lines[k] ? out.lines[k].val : []);

const MAS_SIG_SLOTS = MAS_SLOTS.map((s, i) => [String(i + 1), `線${i + 1}`]);
SIGNALS.mas = {
  extra: [{ key: 'sigA', def: '2' }, { key: 'sigB', def: '3' }], // 最初は 25本 と 75本(日本でよく使われる組み合わせ)
  kinds: [
    { id: 'cross', label: '2本の線の交差', guide: 'ytcheck', tv: 'MovingAvg2Line Cross',
      rule: '選んだ2本のうち、期間の短い線が長い線を下から上に抜けた足で「買」(ゴールデンクロス)、上から下に抜けた足で「売」(デッドクロス)',
      note: '教科書の検証では、ゴールデンクロス(50本・200本)は12通りすべてでプラスでしたが、持ち続けるより良かったのは5通りだけ。主な効き目は「下落を浅くする」ことでした' },
    { id: 'price', label: '終値と線の交差', guide: 'ma', tv: 'MovingAvg Cross',
      rule: '終値が、選んだ線(1本目)を下から上に抜けた足で「買」、上から下に抜けた足で「売」',
      note: '教科書の検証では、終値が200日線の上か下かだけでは、そのあとの値動きに偶然と区別できる差はありませんでした(BTC・ETH)。横ばいでは交差が続きます' },
  ],
  compute(bars, p, out, kind) {
    const a = col(bars, p.source), vol = bars.map(b => b.v);
    const lenOf = k => Math.min(1000, int(p[`len${Math.min(8, Math.max(1, int(k, 1)))}`], 20));
    const close = col(bars, 'close');
    if (kind === 'price') {
      const n = lenOf(p.sigA), m = maOf(p.kind, a, n, vol);
      return { up: crossSig(close, m, true), down: crossSig(close, m, false), upName: `${n}本線を上抜け`, downName: `${n}本線を下抜け`,
        upText: `終値が ${n}本の平均線を下から上に抜けた`, downText: `終値が ${n}本の平均線を上から下に抜けた` };
    }
    let s = lenOf(p.sigA), l = lenOf(p.sigB);
    if (s > l) [s, l] = [l, s];
    if (s === l) { const z = close.map(() => 0); return { up: z, down: z, upName: 'ゴールデンクロス', downName: 'デッドクロス', upText: '', downText: '' }; }
    const f = maOf(p.kind, a, s, vol), g = maOf(p.kind, a, l, vol);
    return { up: crossSig(f, g, true), down: crossSig(f, g, false), upName: 'ゴールデンクロス', downName: 'デッドクロス',
      upText: `${s}本の平均線が ${l}本の線を下から上に抜けた(ゴールデンクロス)`, downText: `${s}本の平均線が ${l}本の線を上から下に抜けた(デッドクロス)` };
  },
};
// 移動平均線(1本):app.js で計算した線(out.val)を使う
SIGNALS.ma = {
  kinds: [{ id: 'price', label: '終値と線の交差', guide: 'ma', tv: 'MovingAvg Cross',
    rule: '終値が線を下から上に抜けた足で「買」、上から下に抜けた足で「売」',
    note: SIGNALS.mas.kinds[1].note }],
  compute(bars, p, out) {
    const c = col(bars, 'close'), n = int(p.len, 20);
    return { up: crossSig(c, out.val, true), down: crossSig(c, out.val, false), upName: '線を上抜け', downName: '線を下抜け',
      upText: `終値が ${n}本の平均線を下から上に抜けた`, downText: `終値が ${n}本の平均線を上から下に抜けた` };
  },
};
SIGNALS.macd = {
  kinds: [
    { id: 'signal', label: 'シグナルとの交差', guide: 'ytcheck', tv: 'MACD Strategy',
      rule: 'MACD の線がシグナルの線を下から上に抜けた足で「買」、上から下に抜けた足で「売」(棒グラフが 0 をまたいだ足と同じ)',
      note: '教科書の検証では、交差のたびに売買を入れかえると、プラスは12通り中2通りだけ。BTC の1時間足は約6,200回の売買で、手数料などを入れると年率 -88% でした' },
    { id: 'zero', label: '0 の線との交差', guide: 'macd', tv: '',
      rule: 'MACD の線が 0 を下から上に抜けた足で「買」、上から下に抜けた足で「売」',
      note: 'MACD が 0 をまたぐ足は、短期と長期の指数平均線(最初は12本と26本)のゴールデンクロス・デッドクロスと同じ足です。この形そのものは検証していません' },
  ],
  compute(bars, p, out, kind) {
    const m = lineOf(out, 0), s = lineOf(out, 1);
    if (kind === 'zero') return { up: crossSig(m, 0, true), down: crossSig(m, 0, false), upName: '0 を上抜け', downName: '0 を下抜け',
      upText: 'MACD が 0 を下から上に抜けた(短期の平均線が長期の線を上抜け)', downText: 'MACD が 0 を上から下に抜けた(短期の平均線が長期の線を下抜け)' };
    return { up: crossSig(m, s, true), down: crossSig(m, s, false), upName: 'シグナルを上抜け', downName: 'シグナルを下抜け',
      upText: 'MACD がシグナルを下から上に抜けた', downText: 'MACD がシグナルを上から下に抜けた' };
  },
};
const RSI_REVERT_NOTE = '教科書の検証では、RSI 30/70 の逆張りは12通りすべてでマイナスでした。勝率は5〜6割あったのに、平均の勝ちが平均の負けの0.37〜0.71倍しかなかったためです';
SIGNALS.rsi = {
  kinds: [
    { id: 'revert', label: '30・70 から戻る', guide: 'ytcheck', tv: 'RSI Strategy',
      rule: 'RSI が下の基準線(最初は30)を下から上に抜けた足で「買」、上の基準線(最初は70)を上から下に抜けた足で「売」',
      note: RSI_REVERT_NOTE },
    { id: 'mid', label: '50 の線の交差', guide: 'rsi', tv: '',
      rule: 'RSI が 50 を下から上に抜けた足で「買」、上から下に抜けた足で「売」',
      note: 'この形は検証していません。教科書の実測では、RSI が70を超えたあとは、むしろ上がりやすい結果でした(BTC の日足)。横ばいでは交差が続きます' },
  ],
  compute(bars, p, out, kind) {
    const r = lineOf(out, 0);
    if (kind === 'mid') return { up: crossSig(r, 50, true), down: crossSig(r, 50, false), upName: '50 を上抜け', downName: '50 を下抜け',
      upText: 'RSI が 50 を下から上に抜けた', downText: 'RSI が 50 を上から下に抜けた' };
    const lo = +p.lower, hi = +p.upper;
    return { up: crossSig(r, lo, true), down: crossSig(r, hi, false), upName: `${lo} から戻る`, downName: `${hi} から戻る`,
      upText: `RSI が ${lo} を下から上に抜けた(売られすぎと呼ばれる範囲から戻った)`, downText: `RSI が ${hi} を上から下に抜けた(買われすぎと呼ばれる範囲から戻った)` };
  },
};
// ストキャスティクス:TradingView の「Stochastic Slow Strategy」と同じく、%K が %D を抜けた足のうち、%K が下の線より下(上の線より上)のものだけ
function stochSig(out, lo, hi, kind, name) {
  const k = lineOf(out, 0), d = lineOf(out, 1), cu = crossSig(k, d, true), cd = crossSig(k, d, false);
  if (kind === 'cross') return { up: cu, down: cd, upName: '%K が %D を上抜け', downName: '%K が %D を下抜け', upText: `${name}の %K が %D を下から上に抜けた`, downText: `${name}の %K が %D を上から下に抜けた` };
  return { up: cu.map((v, i) => +(v === 1 && k[i] < lo)), down: cd.map((v, i) => +(v === 1 && k[i] > hi)), upName: `${lo} より下で上抜け`, downName: `${hi} より上で下抜け`,
    upText: `${name}の %K が、${lo} より下で %D を下から上に抜けた`, downText: `${name}の %K が、${hi} より上で %D を上から下に抜けた` };
}
const STOCH_KINDS = [
  { id: 'zone', label: '基準線の外の交差', guide: 'others', tv: 'Stochastic Slow Strategy',
    rule: '%K が下の基準線(最初は20)より下で %D を下から上に抜けた足で「買」、上の基準線(最初は80)より上で %D を上から下に抜けた足で「売」',
    note: 'この形は検証していません。RSI と同じ逆張りの使い方で、反応が速いぶん、だましも多くなります。RSI の逆張りは、教科書の検証で12通りすべてマイナスでした' },
  { id: 'cross', label: 'すべての交差', guide: 'others', tv: '',
    rule: '%K が %D を下から上に抜けた足で「買」、上から下に抜けた足で「売」(場所を問わない)',
    note: 'この形は検証していません。合図の数がとても多く、そのぶん手数料がかさみます' },
];
SIGNALS.stoch = { kinds: STOCH_KINDS, compute: (bars, p, out, kind) => stochSig(out, +p.lower, +p.upper, kind, 'ストキャスティクス') };
SIGNALS.stochrsi = { kinds: STOCH_KINDS, compute: (bars, p, out, kind) => stochSig(out, 20, 80, kind, 'ストキャスティクス RSI') };
SIGNALS.willr = {
  kinds: [{ id: 'revert', label: '-80 から戻る・-20 から戻る(逆張り)', guide: 'others', tv: '',
    rule: '%R が -80 を下から上に抜けた足で「買」、-20 を上から下に抜けた足で「売」',
    note: 'この形は検証していません。%R はストキャスティクスの %K と同じ計算で、使い方は RSI と同じ逆張りです' }],
  compute(bars, p, out) {
    const r = lineOf(out, 0);
    return { up: crossSig(r, -80, true), down: crossSig(r, -20, false), upName: '-80 から戻る', downName: '-20 から戻る',
      upText: '%R が -80 を下から上に抜けた', downText: '%R が -20 を上から下に抜けた' };
  },
};
SIGNALS.cci = {
  kinds: [
    { id: 'revert', label: '±100 から戻る', guide: 'others', tv: '',
      rule: 'CCI が -100 を下から上に抜けた足で「買」、+100 を上から下に抜けた足で「売」',
      note: 'この形は検証していません。教科書の実測では、±100 の中に入ったのは57〜62%だけで、外に出ることは想定よりずっと多くありました' },
    { id: 'break', label: '±100 を抜ける', guide: 'others', tv: '',
      rule: 'CCI が +100 を下から上に抜けた足で「買」、-100 を上から下に抜けた足で「売」(考案者のランバート氏の、もとの使い方に近い形)',
      note: 'この形は検証していません。±100 の外に出ることが多いので、合図も多めです' },
  ],
  compute(bars, p, out, kind) {
    const c = lineOf(out, 0);
    if (kind === 'break') return { up: crossSig(c, 100, true), down: crossSig(c, -100, false), upName: '+100 を上抜け', downName: '-100 を下抜け',
      upText: 'CCI が +100 を下から上に抜けた', downText: 'CCI が -100 を上から下に抜けた' };
    return { up: crossSig(c, -100, true), down: crossSig(c, 100, false), upName: '-100 から戻る', downName: '+100 から戻る',
      upText: 'CCI が -100 を下から上に抜けた', downText: 'CCI が +100 を上から下に抜けた' };
  },
};
SIGNALS.bb = {
  kinds: [
    { id: 'revert', label: '帯の外から戻る', guide: 'ytcheck', tv: 'Bollinger Bands Strategy',
      rule: '終値が下の線を下から上に抜けた(帯の外から中に戻った)足で「買」、上の線を上から下に抜けた足で「売」',
      note: '教科書の検証では、帯を使った逆張りは12通りすべてでマイナスでした(勝率53〜62%)。強い流れが出ると負け続けます' },
    { id: 'break', label: '帯の外で終わる', guide: 'bb', tv: '',
      rule: '終値が上の線を下から上に抜けた(帯の上の外で終わった)足で「買」、下の線を上から下に抜けた足で「売」',
      note: '教科書の実測では、BTC の日足で上の線の外で終わった日のあとの10日間は平均 +3.43%(すべての日は +0.80%)。この形で売買した成績は検証していません' },
  ],
  compute(bars, p, out, kind) {
    const s = col(bars, p.source), u = lineOf(out, 0), l = lineOf(out, 2);
    if (kind === 'break') return { up: crossSig(s, u, true), down: crossSig(s, l, false), upName: '上の線の外へ', downName: '下の線の外へ',
      upText: '終値が上の線を超えて、帯の外で終わった', downText: '終値が下の線を割って、帯の外で終わった' };
    return { up: crossSig(s, l, true), down: crossSig(s, u, false), upName: '下の外から戻る', downName: '上の外から戻る',
      upText: '終値が下の線の外から、帯の中に戻った', downText: '終値が上の線の外から、帯の中に戻った' };
  },
};
SIGNALS.ichimoku = {
  kinds: [
    { id: 'sanyaku', label: '三役好転・逆転', guide: 'ytcheck', tv: '',
      rule: '「転換線が基準線の上」「終値が雲の上」「終値が26本前の終値の上(遅行スパンが価格の上)」の3つがそろった足で「買」(三役好転)。3つとも逆になった足で「売」(三役逆転)。雲は、26本前に計算した先行スパンA・B',
      note: '教科書の検証では、三役好転で買い・三役逆転で売る形は、日足では4銘柄すべてでプラス、1時間足ではすべてマイナスでした' },
    { id: 'tk', label: '転換線と基準線', guide: 'ichimoku', tv: '',
      rule: '転換線が基準線を下から上に抜けた足で「買」、上から下に抜けた足で「売」',
      note: 'この形は検証していません。三役好転よりずっと多く出ます。研究では、標準の設定の一目均衡表の規則は、後半の期間で一貫した成果が出なかったと報告されています' },
  ],
  compute(bars, p, out, kind) {
    const conv = lineOf(out, 0), base = lineOf(out, 1), sa = lineOf(out, 2), sb = lineOf(out, 3), sh = int(p.shift, 26), c = col(bars, 'close');
    if (kind === 'tk') return { up: crossSig(conv, base, true), down: crossSig(conv, base, false), upName: '転換線が基準線を上抜け', downName: '転換線が基準線を下抜け',
      upText: '転換線が基準線を下から上に抜けた', downText: '転換線が基準線を上から下に抜けた' };
    // 3つの条件がそろっているか(どれかの値がまだないときは NaN)
    const state = sign => c.map((v, i) => {
      const a = sa[i - sh], b = sb[i - sh], pc = c[i - sh];
      if (i < sh || !(isFinite(conv[i]) && isFinite(base[i]) && isFinite(a) && isFinite(b) && isFinite(pc))) return NaN;
      return sign > 0 ? +(conv[i] > base[i] && v > Math.max(a, b) && v > pc) : +(conv[i] < base[i] && v < Math.min(a, b) && v < pc);
    });
    return { up: turnOn(state(1)), down: turnOn(state(-1)), upName: '三役好転', downName: '三役逆転',
      upText: `転換線が基準線の上・終値が雲の上・終値が${sh}本前より上の3つがそろった(三役好転)`, downText: `転換線が基準線の下・終値が雲の下・終値が${sh}本前より下の3つがそろった(三役逆転)` };
  },
};
// 向き(+1 / -1)が入れ替わった足。前の足の向きが分からないときは付けない
const flipSig = dir => [dir.map((v, i) => +(i > 0 && v === 1 && dir[i - 1] === -1)), dir.map((v, i) => +(i > 0 && v === -1 && dir[i - 1] === 1))];
SIGNALS.psar = {
  kinds: [{ id: 'flip', label: '点の向きの入れ替わり', guide: 'flips', tv: 'Parabolic SAR Strategy',
    rule: '点が価格の上から下に移った(上昇に変わった)足で「買」、下から上に移った(下降に変わった)足で「売」。向きは足の高値・安値で決まり、その足が確定した時点で判断します',
    note: 'この形は検証していません。BTC の日足では、向きが1年に約29回入れ替わりました。横ばいでは、だましが続きます' }],
  compute(bars, p, out) {
    const [up, down] = flipSig(out.dir || []);
    return { up, down, upName: '上昇に転換', downName: '下降に転換', upText: 'パラボリック SAR の点が、価格の下に移った(上昇に転換)', downText: 'パラボリック SAR の点が、価格の上に移った(下降に転換)' };
  },
};
SIGNALS.supertrend = {
  kinds: [{ id: 'flip', label: '線の向きの入れ替わり', guide: 'flips', tv: 'Supertrend Strategy',
    rule: '終値が上の線を超えて、線が上昇(緑)に変わった足で「買」、下の線を割って下降(赤)に変わった足で「売」',
    note: 'この形は検証していません。BTC の日足(10・3)では、向きの入れ替わりは1年に約9回、1時間足では約200回でした' }],
  compute(bars, p, out) {
    const u = lineOf(out, 0), d = lineOf(out, 1), dir = u.map((v, i) => (isFinite(v) ? 1 : isFinite(d[i]) ? -1 : NaN));
    const [up, down] = flipSig(dir);
    return { up, down, upName: '上昇に転換', downName: '下降に転換', upText: 'スーパートレンドが上昇(緑)に変わった', downText: 'スーパートレンドが下降(赤)に変わった' };
  },
};
SIGNALS.donchian = {
  kinds: [{ id: 'break', label: '前の足までの高値・安値の更新', guide: 'ytcheck', tv: 'ChannelBreakOutStrategy',
    rule: '終値が、1本前までの n 本の高値(上の線)を超えた足で「買」、1本前までの n 本の安値(下の線)を割った足で「売」。超えた状態が続いても、最初の足だけ',
    note: '教科書の検証では、よく似た形(20本の高値抜けで買い、10本の安値割れで売り)は、12通り中4通りでプラス(日足と4時間足だけ)。短い足では負けました' }],
  compute(bars, p, out) {
    const c = col(bars, 'close'), u = lineOf(out, 0), l = lineOf(out, 2), n = int(p.len, 20);
    const pu = u.map((_, i) => (i ? u[i - 1] : NaN)), pl = l.map((_, i) => (i ? l[i - 1] : NaN));
    return { up: crossSig(c, pu, true), down: crossSig(c, pl, false), upName: `${n}本の高値を更新`, downName: `${n}本の安値を更新`,
      upText: `終値が、前の足までの ${n}本の高値を超えた`, downText: `終値が、前の足までの ${n}本の安値を割った` };
  },
};
SIGNALS.keltner = {
  kinds: [{ id: 'break', label: '帯の外に抜ける(流れに乗る)', guide: '', tv: 'Keltner Channels Strategy',
    rule: '終値が上の線を下から上に抜けた足で「買」、下の線を上から下に抜けた足で「売」',
    note: 'この形は検証していません。ボリンジャーバンドの「帯の外で終わる」と同じ考え方で、幅に ATR を使います' }],
  compute(bars, p, out) {
    const s = col(bars, p.source), u = lineOf(out, 0), l = lineOf(out, 2);
    return { up: crossSig(s, u, true), down: crossSig(s, l, false), upName: '上の線を上抜け', downName: '下の線を下抜け',
      upText: '終値がケルトナーチャネルの上の線を上に抜けた', downText: '終値がケルトナーチャネルの下の線を下に抜けた' };
  },
};
SIGNALS.adx = {
  kinds: [
    { id: 'filter', label: 'ADX で絞った交差', guide: 'others', tv: '',
      rule: '+DI が -DI を下から上に抜けた足で「買」、-DI が +DI を下から上に抜けた足で「売」。どちらも、その足の ADX が基準線(最初は25)以上のときだけ',
      note: 'この形は検証していません。暗号資産では ADX が25を超える足が5〜6割あり、基準線のふるい分けの効き目は小さめです' },
    { id: 'cross', label: 'ADX を見ない交差', guide: 'others', tv: '',
      rule: '+DI が -DI を下から上に抜けた足で「買」、上から下に抜けた足で「売」',
      note: 'この形は検証していません。流れのない時期にも交差が多く出ます' },
  ],
  compute(bars, p, out, kind) {
    const adx = lineOf(out, 0), pdi = lineOf(out, 1), mdi = lineOf(out, 2), lv = +p.level;
    let up = crossSig(pdi, mdi, true), down = crossSig(pdi, mdi, false);
    if (kind !== 'cross') { up = up.map((v, i) => +(v === 1 && adx[i] >= lv)); down = down.map((v, i) => +(v === 1 && adx[i] >= lv)); }
    const f = kind !== 'cross' ? `(ADX ${lv} 以上)` : '';
    return { up, down, upName: '+DI が上抜け', downName: '-DI が上抜け', upText: `+DI が -DI を下から上に抜けた${f}`, downText: `-DI が +DI を下から上に抜けた${f}` };
  },
};
SIGNALS.tsmom = {
  kinds: [{ id: 'sign', label: '長い期間の値上がり率の符号が変わる', guide: 'evidence2', tv: '',
    rule: '過去 n 本(最初は252本)の値上がり率が、マイナスからプラスに変わった足で「買」、プラスからマイナスに変わった足で「売」',
    note: '論文は、58種類の先物をまとめて持つ形で効き目を報告しました。銘柄を1つずつ調べると予測の証拠はほとんどなかった、という反論もあります。この形は検証していません' }],
  compute(bars, p, out) {
    const r = out.hist || [], n = int(p.len1, 252);
    return { up: crossSig(r, 0, true), down: crossSig(r, 0, false), upName: 'プラスに変わる', downName: 'マイナスに変わる',
      upText: `過去 ${n}本の値上がり率がプラスに変わった`, downText: `過去 ${n}本の値上がり率がマイナスに変わった` };
  },
};
// 売買サインの設定の初期値:sig(表示する)、sigKind(種類)と、種類ごとの追加の設定
function sigDefaults(type) {
  const S = SIGNALS[type];
  if (!S) return {};
  const o = { sig: true, sigKind: S.kinds[0].id };
  (S.extra || []).forEach(x => { o[x.key] = x.def; });
  return o;
}
const sigKindOf = (type, p) => { const S = SIGNALS[type]; return S.kinds.find(k => k.id === p.sigKind) || S.kinds[0]; };
/* 合図を計算する。out は、そのインジケーターの計算結果(線の値を使う)。
 * 返り値の marks は、自作インジケーターの合図と同じ形 [{ name, dir, val }](過去データで試す・お知らせでそのまま使える)。
 * 合図の足は val が 1、それ以外は 0。text は、その合図の説明(画面の吹き出しに出す) */
function signals(type, bars, p, out) {
  const S = SIGNALS[type];
  if (!S || !out) return null;
  const k = sigKindOf(type, p), r = S.compute(bars, p, out, k.id), n = bars.length;
  const fit = a => { const v = new Array(n).fill(0); for (let i = 0; i < n; i++) if (a[i] === 1) v[i] = 1; return v; };
  return {
    kind: k,
    marks: [{ name: r.upName, dir: 'up', val: fit(r.up), text: r.upText, sig: true }, { name: r.downName, dir: 'down', val: fit(r.down), text: r.downText, sig: true }],
  };
}

// ================================================================ 合図どおりに売買した場合の成績(過去データでの試算)
/* 決まり:
 *   ・合図は、足が確定してから分かるものとして扱う。売買は「次の足の始値」で行う(先読みをしない)
 *   ・いちばん新しい足はまだ確定していないので、その足の合図では売買しない
 *   ・毎回、手持ちの全額で売買する(複利)。手数料は売買のたびに fee の割合を引く
 *   ・すべり(slip。片道の割合)は、入るときも出るときも、いつも不利な向きに価格をずらす
 *     (買うときは高く、売るときは安く約定したものとする)
 * marks: [{ dir: 'up' | 'down', val: [...] }]
 *   ・損切り・利確(sl / tp。実際に入った価格からの割合)を指定すると、足の高値・安値がそこに届いた時点で手じまう。
 *     同じ足の中で両方に届いた場合は、どちらが先か分からないので、不利なほう(損切り)が先だったとみなす。
 *     損切りは、窓を開けて飛びこえた場合は、その足の始値で手じまう(損切りの価格より悪くなる)。
 *     利確は指値と同じで、届いても利確の価格より良い価格にはしない
 *   ・売りから入って価格が2倍になると、資金がすべてなくなる(強制決済)。利確より先に判定する
 *   ・最後に手じまっていないポジションは、最後の足の終値で手じまったものとして(手数料とすべりも引いて)成績に入れる。
 *     「何もせず持ち続けた場合」も、同じ最初の足の始値で買い、同じ最後の足の終値で売り、同じ手数料とすべりを引く
 * opts: { side: 'long' | 'short' | 'both', exit: 'signal' | 'bars', hold: 本数, fee: 割合, slip: 割合, sl: 割合, tp: 割合 } */
function backtest(bars, marks, opts) {
  const n = bars.length, o = opts || {}, fee = o.fee >= 0 ? o.fee : 0.001, slip = o.slip >= 0 && o.slip < 0.5 ? o.slip : 0;
  const side = ['long', 'short', 'both'].includes(o.side) ? o.side : 'long';
  const hold = Math.max(1, Math.min(1000, Math.round(o.hold) || 10));
  const sl = o.sl > 0 && o.sl < 1 ? o.sl : 0, tp = o.tp > 0 && o.tp <= 100 ? o.tp : 0;
  const sig = dir => { const ms = marks.filter(m => m.dir === dir); return i => ms.some(m => m.val[i] > 0 || m.val[i] < 0); };
  const up = sig('up'), down = sig('down');
  const hasOpp = side === 'long' ? marks.some(m => m.dir === 'down') : side === 'short' ? marks.some(m => m.dir === 'up') : true;
  const exitMode = o.exit === 'bars' || !hasOpp ? 'bars' : 'signal';
  let eq = 1, pos = 0, entry = 0, entryI = 0, eqAtEntry = 1, inBars = 0;
  const trades = [], curve = [];
  // 手じまったときの資金(px は手じまう価格。すべりは、ここで不利な向きに足す)
  const valueAt = px => { const fill = px * (1 - pos * slip); return { fill, v: eqAtEntry * Math.max(0, pos > 0 ? fill / entry : 2 - fill / entry) * (1 - fee) }; };
  const closeAt = (i, px, why) => {
    const x = valueAt(px);
    eq = why === 'liq' ? 0 : x.v;
    if (eq <= 0) why = 'liq'; // 窓を開けて2倍を超えた場合も、資金がなくなる
    trades.push({ dir: pos, t0: bars[entryI].t, t1: bars[i].t, p0: entry, p1: x.fill, ret: eq / (eqAtEntry / (1 - fee)) - 1, bars: i - entryI, i0: entryI, i1: i, why: why || 'rule' });
    pos = 0;
  };
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const u = up(i - 1), d = down(i - 1), px = bars[i].o;
      if (pos && (exitMode === 'signal' ? (pos > 0 ? d : u) : i - entryI >= hold)) closeAt(i, px);
      if (!pos && px > 0 && eq > 0) {
        const want = u && side !== 'short' ? 1 : d && side !== 'long' ? -1 : 0;
        if (want) { pos = want; entry = px * (1 + want * slip); entryI = i; eq *= 1 - fee; eqAtEntry = eq; }
      }
    }
    if (pos) {
      // 損切り・強制決済・利確:入った足も含めて、足の中の高値・安値で届いたかを見る。不利なものから先に判定する
      const b = bars[i], later = i > entryI;
      const slPx = entry * (1 - pos * sl), tpPx = entry * (1 + pos * tp), liqPx = entry * 2;
      const hitSl = sl && (pos > 0 ? b.l <= slPx : b.h >= slPx), hitTp = tp && (pos > 0 ? b.h >= tpPx : b.l <= tpPx);
      const hitLiq = pos < 0 && b.h >= liqPx;
      if (hitSl) closeAt(i, later && (pos > 0 ? b.o < slPx : b.o > slPx) ? b.o : slPx, 'sl');
      else if (hitLiq) closeAt(i, later && b.o > liqPx ? b.o : liqPx, 'liq'); // 資金がゼロになる。以後は売買しない
      else if (hitTp) closeAt(i, tpPx, 'tp');
    }
    if (pos) inBars++;
    const c = bars[i].c; // その足の終値で評価した資金
    curve.push(pos ? eqAtEntry * Math.max(0, pos > 0 ? c / entry : 2 - c / entry) : eq);
  }
  // 手じまっていないポジションは、最後の足の終値で手じまったものとして数える(手数料・すべりも引く)
  const open = pos ? { dir: pos, t0: bars[entryI].t, p0: entry, i0: entryI, ret: valueAt(bars[n - 1].c).v / (eqAtEntry / (1 - fee)) - 1 } : null;
  if (pos) curve[n - 1] = valueAt(bars[n - 1].c).v;
  let peak = 1, maxDD = 0;
  curve.forEach(v => { peak = Math.max(peak, v); maxDD = Math.max(maxDD, 1 - v / peak); });
  const wins = trades.filter(t => t.ret > 0), losses = trades.filter(t => t.ret <= 0);
  const sumW = wins.reduce((a, t) => a + t.ret, 0), sumL = losses.reduce((a, t) => a - t.ret, 0);
  // 持ち続けた場合:最初の足の始値で買い、最後の足の終値で売る。手数料もすべりも、合図どおりの場合と同じだけ引く
  const hold0 = n ? bars[0].o * (1 + slip) : NaN;
  const holdCurve = bars.map((b, i) => (hold0 > 0 ? b.c / hold0 * (1 - fee) * (i === n - 1 ? (1 - slip) * (1 - fee) : 1) : 1));
  const holdRet = n && hold0 > 0 ? holdCurve[n - 1] - 1 : NaN;
  return {
    trades, open, curve, exitMode, n: trades.length, wins: wins.length, losses: losses.length,
    total: (n ? curve[n - 1] : 1) - 1, holdRet, holdCurve, maxDD, fee, slip,
    pf: sumL > 0 ? sumW / sumL : NaN, avgWin: wins.length ? sumW / wins.length : NaN, avgLoss: losses.length ? -sumL / losses.length : NaN,
    avgRet: trades.length ? trades.reduce((a, t) => a + t.ret, 0) / trades.length : NaN,
    exposure: n ? inBars / n : 0, nSl: trades.filter(t => t.why === 'sl').length, nTp: trades.filter(t => t.why === 'tp').length,
  };
}


// ================================================================ 成績の読み方(統計の目安)
/* 試算の成績が「偶然でも出るものか」を見るための計算。どれも、毎回の損益が互いに無関係で、性質が時間で変わらないことを前提にした
 * 条件つきの目安で、もうかる確率ではない。式は次のとおり(SR は1本あたりのシャープレシオ = 平均 ÷ 標準偏差)。
 *   Sortino = 平均 ÷ √(Σ min(r,0)² ÷ n)                       (目標は 0)
 *   PSR(SR*) = Φ[(SR − SR*)·√(n−1) / √(1 − γ3·SR + (γ4−1)/4·SR²)]   Bailey・López de Prado(2012)。γ3 = ゆがみ、γ4 = とがり(正規分布で 3)
 *   MinTRL = 1 + (1 − γ3·SR + (γ4−1)/4·SR²)·(z_p ÷ (SR − SR*))²       同上。この本数より少ないと、95% の確かさで SR* を上回るとは言えない
 *   E[max_N] = (1−γ)·Φ⁻¹(1−1/N) + γ·Φ⁻¹(1−1/(N·e))、γ = 0.5772…    N 回試したときに、偶然で出る最大の値の目安
 *   DSR = PSR(SR0)、SR0 = √V·E[max_N]                                   Bailey・López de Prado(2014)。V = 試した結果の SR のばらつき
 *   MinBTL(年) = (E[max_N] ÷ 年率の目標 SR)²                            Bailey ら(2014) */
const EULER = 0.5772156649015329;
// 標準正規分布の累積確率 Φ(x)。誤差関数の近似(相対誤差 1.2e-7 以下)
function normCdf(x) {
  const z = Math.abs(x) / Math.SQRT2, t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? 1 - r / 2 : r / 2;
}
// Φ の逆(確率 p になる x)。Acklam の近似のあと、1回だけ補正する
function normInv(p) {
  if (!(p > 0 && p < 1)) return p === 0 ? -Infinity : p === 1 ? Infinity : NaN;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  let x;
  if (p < 0.02425) { const q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else if (p > 1 - 0.02425) { const q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else { const q = p - 0.5, r = q * q; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  const e = normCdf(x) - p, u = e * Math.sqrt(2 * Math.PI) * Math.exp(x * x / 2);
  return x - u / (1 + x * u / 2);
}
// 平均・標準偏差(n−1 で割る)・ゆがみ γ3・とがり γ4(どちらも n で割る積率。正規分布なら 0 と 3)
function moments(r) {
  const n = r.length;
  if (n < 2) return { n, mean: NaN, sd: NaN, skew: NaN, kurt: NaN };
  const m = r.reduce((a, x) => a + x, 0) / n;
  let s2 = 0, s3 = 0, s4 = 0;
  r.forEach(x => { const d = x - m; s2 += d * d; s3 += d * d * d; s4 += d * d * d * d; });
  const m2 = s2 / n;
  return { n, mean: m, sd: Math.sqrt(s2 / (n - 1)), skew: m2 > 0 ? (s3 / n) / Math.pow(m2, 1.5) : 0, kurt: m2 > 0 ? (s4 / n) / (m2 * m2) : 3 };
}
function sortino(r) {
  const n = r.length;
  if (!n) return NaN;
  const m = r.reduce((a, x) => a + x, 0) / n, dd = Math.sqrt(r.reduce((a, x) => a + Math.min(x, 0) * Math.min(x, 0), 0) / n);
  return dd > 0 ? m / dd : NaN;
}
const srDen = (sr, skew, kurt) => 1 - skew * sr + (kurt - 1) / 4 * sr * sr;
function psr(sr, n, skew, kurt, srStar) {
  const den = srDen(sr, skew, kurt);
  if (!(n > 1) || !(den > 0)) return NaN;
  return normCdf((sr - (srStar || 0)) * Math.sqrt(n - 1) / Math.sqrt(den));
}
function minTRL(sr, skew, kurt, srStar, p) {
  const d = sr - (srStar || 0);
  if (!isFinite(sr)) return NaN; // 損益がまったく動かない(ばらつき 0)ときは、SR そのものが決まらない
  if (!(d > 0)) return Infinity; // SR* を上回っていなければ、何本あっても言えない
  return 1 + srDen(sr, skew, kurt) * Math.pow(normInv(p || 0.95) / d, 2);
}
function expMaxSR(N) {
  if (!(N > 1)) return 0;
  return (1 - EULER) * normInv(1 - 1 / N) + EULER * normInv(1 - 1 / (N * Math.E));
}
function dsr(sr, n, skew, kurt, N, V) {
  const sr0 = Math.sqrt(V) * expMaxSR(N);
  return { sr0, dsr: psr(sr, n, skew, kurt, sr0) };
}
/* DSR の V(試した結果の SR のばらつき)。srs: 実質の1通りごとに1つずつの SR(ほぼ同じ試しのまとまりからは、代表の1つだけ)。
 * ほぼ同じ試しを何十個も入れると、ばらつきが小さく出て、割り引きが足りなくなる(回数 N は実質の回数なのに、V だけ生の回数で数えることになる)。
 * また、本当は差がないときでも、SR の推定値は 1/(n−1) くらいはばらつく。それより小さい V は使わない(割り引きすぎないより、足りないほうが危ない)。
 * 戻り値 { V, fromTrials }: fromTrials は、試した結果のばらつきを使ったとき true */
function dsrVar(srs, n) {
  const floor = n > 1 ? 1 / (n - 1) : NaN, k = srs.length;
  if (k < 2) return { V: floor, fromTrials: false };
  const m = srs.reduce((a, x) => a + x, 0) / k, v = srs.reduce((a, x) => a + (x - m) * (x - m), 0) / (k - 1);
  return v > floor ? { V: v, fromTrials: true } : { V: floor, fromTrials: false };
}
const minBTL = (N, srAnnual) => Math.pow(expMaxSR(N) / srAnnual, 2);
/* 損益が 0 になる片道のコスト。手数料もすべりも 0 にしたときの資金の倍率 G と、往復の回数 K から、
 * G·(1−c)^(2K) = 1 を解く(片道ごとに c の割合を引くと、往復で (1−c)² になるため) */
const breakEvenCost = (G, K) => (G > 1 && K > 0 ? 1 - Math.pow(G, -1 / (2 * K)) : 0);
/* backtest() の結果から、成績の読み方の数字をまとめて出す。
 * bpy: 1年の足の本数。gross: 手数料・すべりを 0 にしたときの backtest() の結果(損益が 0 になるコストと、コストの割合に使う) */
function btStats(r, bpy, gross) {
  const c = r.curve, rets = [];
  for (let i = 1; i < c.length; i++) if (c[i - 1] > 0) rets.push(c[i] / c[i - 1] - 1);
  const mo = moments(rets), sr = mo.sd > 0 ? mo.mean / mo.sd : NaN, k = Math.sqrt(bpy);
  const years = c.length / bpy, K = r.n + (r.open ? 1 : 0);
  const G = gross ? 1 + gross.total : NaN;
  return {
    n: mo.n, sr, skew: mo.skew, kurt: mo.kurt, srAnn: sr * k, sortinoAnn: sortino(rets) * k, years,
    psr0: psr(sr, mo.n, mo.skew, mo.kurt, 0), minTRL: minTRL(sr, mo.skew, mo.kurt, 0, 0.95),
    tstat: sr * Math.sqrt(mo.n), tradesPerYear: years > 0 ? r.n / years : NaN,
    breakEven: isFinite(G) ? breakEvenCost(G, K) : NaN,
    costShare: isFinite(G) && G > 1 ? (G - (1 + r.total)) / (G - 1) : NaN, grossTotal: isFinite(G) ? G - 1 : NaN,
    // 1年の手数料の目安:1年の売買の回数 × 往復のコスト(手数料 + すべり、片道ずつ2回)。毎回、資金の全額で売買したときの、資金に対する割合
    costPerYear: years > 0 ? r.n / years * 2 * ((r.fee || 0) + (r.slip || 0)) : NaN,
  };
}
/* 勝ちと負けの大きさ(手じまった売買の、手数料・すべりを引いたあとの損益から)。
 *   ペイオフレシオ payoff = 平均の勝ち ÷ 平均の負け(負けは大きさで見る)
 *   損益分岐の勝率 beWin = 1 ÷ (1 + payoff)。勝率がこれより低いと、1回あたりの平均の損益がマイナスになる
 *   期待値 expect = 勝率 × 平均の勝ち − 負ける割合 × 平均の負け(= 1回あたりの平均の損益)
 * 負けがない(または負けがすべて 0)なら payoff は ∞ で beWin は 0、勝ちがなければ payoff は 0 で beWin は 1 */
function payoff(r) {
  const n = r.n || 0;
  if (!n) return { winRate: NaN, payoff: NaN, beWin: NaN, expect: NaN };
  const aw = r.wins ? r.avgWin : 0, al = r.losses ? -r.avgLoss : 0;
  const po = al > 0 ? aw / al : aw > 0 ? Infinity : NaN;
  const be = al > 0 ? 1 / (1 + po) : aw > 0 ? 0 : NaN;
  return { winRate: r.wins / n, payoff: po, beWin: be, expect: r.wins / n * aw - r.losses / n * al };
}
/* 決まった種から作る乱数(mulberry32)。同じ種なら、いつ・どの端末で計算しても同じ結果になる(試算の数字が開くたびに変わらないように) */
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// 並んだ数の、下から q の位置の値(q = 0.5 で真ん中の値)。間は直線でつなぐ
function quantile(sorted, q) {
  const n = sorted.length;
  if (!n) return NaN;
  const x = (n - 1) * q, i = Math.floor(x), f = x - i;
  return i + 1 < n ? sorted[i] * (1 - f) + sorted[i + 1] * f : sorted[i];
}
// 1回ごとの損益の割合を順に重ねたときの、資金のいちばん多かった時点からの最大の落ち込み(0〜1)
function maxDrawdownOf(rets) {
  let eq = 1, peak = 1, dd = 0;
  for (const r of rets) { eq *= Math.max(0, 1 + r); if (eq > peak) peak = eq; else if (peak > 0) dd = Math.max(dd, 1 - eq / peak); }
  return dd;
}
/* これから先の最大の落ち込みの試算(ブートストラップ)。
 * 試算で出た1回ごとの損益(手じまった売買)の中から、でたらめに選び直して(同じものを何度選んでもよい)、
 * 「同じ回数」と「2倍の回数」の売買の列を runs 通り作り、それぞれの最大の落ち込みを数える。
 * 真ん中の値(中央値)と、20回に1回はこれより深い値(95% の位置)を返す。
 * 前提:1回ごとの損益は互いに無関係で、これからも同じ散らばり方をする。決済の時点の資金だけで数えるので、
 * 売買の途中の落ち込み(含み損)は入らない。つまり、実際はこれより深くなりうる「下限寄り」の目安 */
function ddBootstrap(rets, opts) {
  const o = opts || {}, runs = o.runs || 1000, mult = o.mult || [1, 2], n = rets.length;
  if (n < 1) return null;
  const rnd = seededRandom(o.seed === undefined ? 20240601 : o.seed);
  return mult.map(k => {
    const len = Math.max(1, Math.round(n * k)), dds = new Float64Array(runs), buf = new Float64Array(len);
    for (let j = 0; j < runs; j++) {
      for (let i = 0; i < len; i++) buf[i] = rets[Math.floor(rnd() * n)];
      dds[j] = maxDrawdownOf(buf);
    }
    const s = Array.from(dds).sort((a, b) => a - b);
    return { mult: k, trades: len, median: quantile(s, 0.5), p95: quantile(s, 0.95) };
  });
}
// 2つの列の相関係数(長さは短いほうに、後ろをそろえる)。どちらかが動かない(ばらつき 0)なら NaN
function corr(a, b) {
  const n = Math.min(a.length, b.length), oa = a.length - n, ob = b.length - n;
  if (n < 3) return NaN;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[oa + i]; mb += b[ob + i]; }
  ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const x = a[oa + i] - ma, y = b[ob + i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : NaN;
}
/* 実質の試した回数(effective N)。DSR の式は「N 回の試しが互いに無関係」としているが、期間を 20 → 21 に変えただけの試しは、
 * ほとんど同じ売買になるので、別々に数えると割り引きすぎる。そこで、足1本ごとの資金の増減の列が、
 * すでに数えた試しのどれかと相関 thr(0.9)以上なら、同じ1通りとして数える(先に試したものから順に、まとめる)。
 * 0.9 は高めの線にしてある:少し似ているだけ(0.5 など)のものは別々に数えるので、割り引きを減らしすぎない(慎重な側)。
 * 返すのは、まとまりの数と、各試しがどのまとまりに入ったか */
function effectiveN(series, thr) {
  const t = thr === undefined ? 0.9 : thr, reps = [], group = [];
  series.forEach((s, i) => {
    let g = -1;
    for (let k = 0; k < reps.length && g < 0; k++) { const c = corr(series[reps[k]], s); if (c >= t) g = k; }
    if (g < 0) { g = reps.length; reps.push(i); }
    group.push(g);
  });
  return { n: reps.length, group, reps };
}
const stats = { normCdf, normInv, moments, sortino, psr, minTRL, expMaxSR, dsr, dsrVar, minBTL, breakEvenCost, btStats, payoff, barsPerYear, barMs, realizedVol, seededRandom, quantile, maxDrawdownOf, ddBootstrap, corr, effectiveN };

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

return { DEFS, GROUPS, FUNCS, defaults, SIGNALS, signals, sigDefaults, backtest, stats, makeCustom, checkFormula, parseFormula, evalFormula, MA_OPTIONS, helpers: { maOf, sma, ema, rma, wma, hma, dema, tema, kama, vwma, linreg, stdev, highest, lowest, sum, atr, rsi, trueRange, src } };
});
