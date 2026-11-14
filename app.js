/* Gold Trade Chart
 * ローソク足+出来高+Volume (c-c) 系インジケーターを
 * canvas に描く、外部ライブラリなしのチャート。
 */
(() => {
'use strict';
// 公開ページが他のサイトの中に埋め込まれて、操作を誘導されるのを防ぐ
if (window.top !== window.self && /\.github\.io$/.test(location.hostname)) {
  document.documentElement.hidden = true;
  return;
}

// ---------------------------------------------------------------- 定数
const SYMBOLS = [
  { id: 'PAXGUSDT', label: '金 PAXG/USDT', base: 4000 },
  { id: 'BTCUSDT', label: 'BTC/USDT', base: 77000 },
  { id: 'ETHUSDT', label: 'ETH/USDT', base: 3000 },
  { id: 'XRPUSDT', label: 'XRP/USDT', base: 1.4 },
  { id: 'SOLUSDT', label: 'SOL/USDT', base: 150 },
  { id: 'XRPJPY', label: 'XRP/JPY', base: 165 },
  { id: 'PEPEUSDT', label: 'PEPE/USDT', base: 0.0000045 },
];
const BUILTIN = SYMBOLS.length; // これより後ろは、利用者が追加した銘柄
// 'DOGEUSDT' → 'DOGE/USDT' のように、読みやすい名前にする
function prettySymbol(id) {
  const q = ['FDUSD', 'USDT', 'USDC', 'JPY', 'BTC', 'ETH', 'BNB', 'EUR', 'TRY', 'BRL', 'IDR'].find(x => id.endsWith(x) && id.length > x.length);
  return q ? `${id.slice(0, -q.length)}/${q}` : id;
}
// api: 取引所に問い合わせる足 / group: 何本まとめて1本にするか
const INTERVALS = [
  { id: '15m', label: '15分', api: '15m', ms: 9e5, group: 1 },
  { id: '1h', label: '1時間', api: '1h', ms: 36e5, group: 1 },
  { id: '4h', label: '4時間', api: '4h', ms: 144e5, group: 1 },
  { id: '1d', label: '日', api: '1d', ms: 864e5, group: 1 },
  { id: '2d', label: '2日', api: '1d', ms: 864e5, group: 2 },
  { id: '1w', label: '週', api: '1w', ms: 6048e5, group: 1 },
];
const HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com'];
const STORE_KEY = 'gold-trade-chart-v1';
const UP = '#26a69a';
const DOWN = '#ef5350';

const THEMES = {
  light: { bg: '#ffffff', grid: '#eef0f4', text: '#4a4f5c', axis: '#d9dde5', cross: '#8a90a0', tagBg: '#131722', tagText: '#ffffff' },
  dark: { bg: '#12151c', grid: '#1e222c', text: '#9aa0b0', axis: '#2a2f3b', cross: '#6d7486', tagBg: '#d5d9e2', tagText: '#12151c' },
};

const AGGS = [
  ['simple', '単純 (SMA)'],
  ['smoothed', 'Smoothed (RMA)'],
  ['ema', '指数 (EMA)'],
  ['cumulative', '累積 (A/D)'],
  ['none', 'なし'],
];
const SOURCES = [
  ['close', '終値'], ['open', '始値'], ['high', '高値'], ['low', '安値'],
  ['hl2', '(高値+安値)/2'], ['hlc3', '(高値+安値+終値)/3'], ['ohlc4', '4本値の平均'],
];
const NORMS = [
  ['spread', 'Spread'],
  ['atr', 'ATR'],
  ['percent', '変化率 (%)'],
  ['none', 'なし (方向のみ)'],
];

// インジケーターの種類ごとの名前・ラベル・初期値
const IND_TYPES = {
  ccOnly: {
    name: 'Volume (c-c) Only',
    plotName: 'Volume(c-c)',
    maName: 'SMA of Volume(c-c)',
    labels: {
      volMaLen: 'SMA Length for Volume Moving Average',
      colAbove: 'Volume(c-c) Above SMA Color',
      colBelow: 'Volume(c-c) Below SMA Color',
      colMa: 'SMA of Volume(c-c) Color',
    },
    defaults: { agg: 'smoothed', showMa: false, signMa: false, colAbove: '#4db6ac', colBelow: '#1f8a70', opAbove: 0.75 },
  },
  enhanced: {
    name: 'Volume/MA with Enhanced Histogram',
    plotName: 'Histogram',
    maName: 'SMA',
    labels: {
      volMaLen: 'Smoothing Length for Volume Moving Average (Simple)',
      colAbove: 'Histogram Above SMA',
      colBelow: 'Histogram Below SMA',
      colMa: 'SMA Above Zero',
      colMaNeg: 'SMA Below Zero',
    },
    defaults: { agg: 'simple', showMa: true, signMa: true },
  },
  // overlay: 専用のペインを持たず、ローソク足の上に重ねて描く
  ma: { name: '移動平均線 (MA)', overlay: true },
  // simple: 線と棒だけで描く、定番の指標
  rsi: { name: 'RSI', simple: true },
  macd: { name: 'MACD', simple: true },
};
const DRAW_COLOR = '#2f80ed';
const MA_KINDS = [['sma', '単純 (SMA)'], ['ema', '指数 (EMA)'], ['rma', 'Smoothed (RMA)'], ['wma', '加重 (WMA)'],
  ['hma', 'ハル (HMA)'], ['dema', '2重指数 (DEMA)'], ['tema', '3重指数 (TEMA)'], ['kama', '適応型 (KAMA)'], ['vwma', '出来高加重 (VWMA)']];
// indicators.js で定義した定番インジケーターを、種類の一覧に加える
const GT = window.GTIndicators;
Object.assign(IND_TYPES.ccOnly, { group: 'volume' }); Object.assign(IND_TYPES.enhanced, { group: 'volume' });
Object.assign(IND_TYPES.ma, { group: 'trend' }); Object.assign(IND_TYPES.rsi, { group: 'momentum' }); Object.assign(IND_TYPES.macd, { group: 'momentum' });
Object.keys(GT.DEFS).forEach(id => {
  const d = GT.DEFS[id];
  IND_TYPES[id] = { name: d.name, short: d.short, overlay: !!d.overlay, simple: !d.overlay, generic: true, group: d.group, desc: d.desc };
});

// ---- 自分で作ったインジケーター
/* 保存されていたもの・ほかの人からもらったものは、そのまま信用しない。
 * 決めた形に合うものだけを取り出し、式は indicators.js の読み取り器で確かめる(式は「計算」しかできない) */
const customDefs = [];
const favs = []; // メニューで ★ を付けた種類
const CUSTOM_MAX = 30, CUSTOM_ID = /^u_[a-z0-9]{6,12}$/;
const plain = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, '').trim().slice(0, max) : '');
function cleanCustom(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = plain(raw.name, 30);
  if (!name) return null;
  const overlay = !!raw.overlay;
  const lines = (Array.isArray(raw.lines) ? raw.lines : []).slice(0, 4).map((l, i) => {
    if (!l || typeof l.expr !== 'string' || GT.checkFormula(l.expr)) return null;
    return { name: plain(l.name, 12) || `線${i + 1}`, expr: l.expr.trim(), color: /^#[0-9a-f]{6}$/i.test(l.color) ? l.color : '#2f80ed' };
  });
  if (lines.includes(null)) return null;
  const hist = !overlay && typeof raw.hist === 'string' && raw.hist.trim() ? raw.hist.trim() : '';
  if (hist && GT.checkFormula(hist)) return null;
  const marks = (Array.isArray(raw.marks) ? raw.marks : []).slice(0, 2).map((m, i) => {
    if (!m || typeof m.expr !== 'string' || GT.checkFormula(m.expr)) return null;
    return { name: plain(m.name, 12) || `合図${i + 1}`, expr: m.expr.trim(), dir: m.dir === 'down' ? 'down' : 'up' };
  });
  if (marks.includes(null)) return null;
  if (!lines.length && !hist && !marks.length) return null;
  const bands = (Array.isArray(raw.bands) ? raw.bands : []).filter(v => typeof v === 'number' && isFinite(v) && Math.abs(v) <= 1e12).slice(0, 4);
  const inputs = (Array.isArray(raw.inputs) ? raw.inputs : []).slice(0, 3).map((q, i) => ({
    label: plain(q && q.label, 20) || `数値 ${i + 1}`,
    def: q && typeof q.def === 'number' && isFinite(q.def) && Math.abs(q.def) <= 1e9 ? q.def : 1,
  }));
  // 線も棒もなく合図だけのものは、空の枠ができないよう、チャートに重ねる扱いにする
  return { id: typeof raw.id === 'string' && CUSTOM_ID.test(raw.id) ? raw.id : '', name, overlay: overlay || (!lines.length && !hist), lines, hist, bands, inputs, marks };
}
function newCustomId() {
  let id;
  do id = 'u_' + Math.random().toString(36).slice(2, 10).padEnd(8, '0'); while (IND_TYPES[id]);
  return id;
}
// 登録する(同じ id があれば置きかえる)。登録できたら定義を返す
function registerCustom(raw) {
  const def = cleanCustom(raw);
  if (!def) return null;
  if (!def.id || (IND_TYPES[def.id] && !IND_TYPES[def.id].custom)) def.id = newCustomId();
  const at = customDefs.findIndex(d => d.id === def.id);
  if (at < 0 && customDefs.length >= CUSTOM_MAX) return null;
  let made;
  try { made = GT.makeCustom(def); } catch (e) { return null; }
  GT.DEFS[def.id] = made;
  IND_TYPES[def.id] = { name: def.name, short: made.short, overlay: def.overlay, simple: !def.overlay, generic: true, group: 'custom', desc: describeCustom(def), custom: true };
  if (at < 0) customDefs.push(def); else customDefs[at] = def;
  return def;
}
function describeCustom(def) {
  const text = def.lines.map(l => l.expr).concat(def.hist ? [def.hist] : [], def.marks.map(m => m.expr)).join(' / ');
  return text.length > 60 ? text.slice(0, 59) + '…' : text;
}
// 共有用の文字にする・文字から読み取る(読み取ったものも cleanCustom で確かめる)
const SHARE_HEAD = 'GTI1:';
function customToText(def) {
  return SHARE_HEAD + JSON.stringify({ name: def.name, overlay: def.overlay, lines: def.lines, hist: def.hist, bands: def.bands, inputs: def.inputs, marks: def.marks });
}
function customFromText(text) {
  const t = String(text || '').trim();
  if (!t.startsWith(SHARE_HEAD) || t.length > 4000) return null;
  let raw = null;
  try { raw = JSON.parse(t.slice(SHARE_HEAD.length)); } catch (e) { return null; }
  const def = cleanCustom(raw);
  if (def) def.id = ''; // もらったものは、必ず新しいものとして登録する
  return def;
}

function defaultParams(type) {
  const vis = {};
  INTERVALS.forEach(iv => { vis[iv.id] = true; });
  if (GT.DEFS[type]) return Object.assign(GT.defaults(type), GT.DEFS[type].overlay ? {} : { weight: 1 }, GT.DEFS[type].custom ? { alert: false } : {}, { vis });
  if (type === 'ma') return { kind: 'sma', len: 20, source: 'close', color: '#f5a623', width: 1.5, vis };
  if (type === 'rsi') return { len: 14, source: 'close', upper: 70, lower: 30, color: '#7e57c2', weight: 1, vis };
  if (type === 'macd') {
    return { fast: 12, slow: 26, signal: 9, source: 'close', colMacd: '#2f80ed', colSignal: '#f5a623', weight: 1, vis };
  }
  return Object.assign({
    baseline: true,
    agg: 'smoothed',
    maLen: 14,
    money: false,
    source: 'close',
    norm: 'spread',
    wick: 0,
    adLen: 14,
    volMaLen: 14,
    colAbove: '#66bb6a',
    colBelow: '#2e7d32',
    colMa: '#2ecc40',
    colMaNeg: '#e53935',
    opAbove: 0.6,
    opBelow: 1,
    showPlot: true,
    showMa: false,
    signMa: false,
    maWidth: 1.5,
    showZero: true,
    zeroColor: '#6a6f7c',
    zeroValue: 0,
    axisLabel: true,
    statusValues: true,
    statusParams: true,
    pivots: true,       // 山と谷に丸印を付ける
    pivotLen: 8,        // 前後この本数の中で最大・最小なら山・谷とみなす
    weight: 1,          // ペインの高さの比率
    vis,
  }, IND_TYPES[type].defaults);
}

// ---------------------------------------------------------------- 状態
const state = {
  symbol: 'PAXGUSDT',
  interval: '1d',
  theme: 'light',
  indicators: [],     // {id, type, hidden, p, out}
  raw: [],            // 取引所から受け取ったままの足
  bars: [],           // 表示用(必要ならまとめた)足
  live: false,
  barW: 8,
  end: 0,             // 画面右端にあたる足の位置(小数)
  hover: null,        // {x, y}
  mainWeight: 2.6,    // メインペインの高さの比率
  loading: false,
  tradeOpen: false,   // デモトレードのパネルを開いているか
  dragLine: null,     // ドラッグ中の取引の線 {kind:'tp'|'sl'|'order'|'entry', id, price}
  drawings: {},       // 銘柄ごとの線 {type:'h'|'t', p1:{t,price}, p2}
  tool: null,         // 'h' = 水平線 / 't' = トレンドライン
  pending: null,      // トレンドラインの1点目
  sel: null,          // 選択中の線
  loadToken: 0,
};
let nextId = 1;

const $ = id => document.getElementById(id);
const canvas = $('chart');
const ctx = canvas.getContext('2d');
const wrap = $('chartWrap');
const legendsEl = $('legends');

// ---------------------------------------------------------------- 保存
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      symbol: state.symbol, interval: state.interval, theme: state.theme, mainWeight: state.mainWeight, drawings: state.drawings,
      tradeOpen: state.tradeOpen,
      custom: SYMBOLS.slice(BUILTIN).map(x => ({ id: x.id, label: x.label, quote: x.quote || null })),
      customInds: customDefs, favs: favs.filter(t => IND_TYPES[t]),
      indicators: state.indicators.map(i => ({ type: i.type, hidden: i.hidden, p: i.p })),
    }));
  } catch (e) { /* 保存できなくても表示は続ける */ }
}
function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { s = null; }
  if (s && Array.isArray(s.custom)) {
    s.custom.forEach(c => {
      const o = typeof c === 'string' ? { id: c } : c || {}; // 以前は名前だけを保存していた
      if (typeof o.id !== 'string' || !/^[A-Z0-9]{5,20}$/.test(o.id) || SYMBOLS.some(x => x.id === o.id)) return;
      const quote = typeof o.quote === 'string' && /^[A-Z0-9]{1,8}$/.test(o.quote) ? o.quote : null;
      SYMBOLS.push({ id: o.id, label: quote ? `${o.id.slice(0, -quote.length)}/${quote}` : prettySymbol(o.id), base: 100, quote });
    });
  }
  if (s && SYMBOLS.some(x => x.id === s.symbol)) state.symbol = s.symbol;
  if (s && INTERVALS.some(x => x.id === s.interval)) state.interval = s.interval;
  // 教科書などからのリンク(?symbol=BTCUSDT&interval=1d)で、開く銘柄と時間足を指定できる
  const qs = new URLSearchParams(location.search), qSym = qs.get('symbol'), qIv = qs.get('interval');
  if (qSym && SYMBOLS.some(x => x.id === qSym)) state.symbol = qSym;
  if (INTERVALS.some(x => x.id === qIv)) state.interval = qIv;
  if (s && THEMES[s.theme]) state.theme = s.theme;
  else if (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) state.theme = 'dark';
  if (s && s.mainWeight > 0) state.mainWeight = s.mainWeight;
  state.tradeOpen = s && typeof s.tradeOpen === 'boolean' ? s.tradeOpen : window.innerWidth > 1000;
  if (s && s.drawings && typeof s.drawings === 'object') {
    const pt = q => q && typeof q === 'object' && isFinite(q.t) && isFinite(q.price) ? { t: +q.t, price: +q.price } : null;
    Object.keys(s.drawings).forEach(sym => {
      if (!/^[A-Z0-9]{5,20}$/.test(sym) || !Array.isArray(s.drawings[sym])) return;
      state.drawings[sym] = s.drawings[sym].slice(0, 200).map(d => {
        const p1 = pt(d && d.p1), p2 = pt(d && d.p2);
        if (d && d.type === 'h' && p1) return { type: 'h', p1 };
        if (d && d.type === 't' && p1 && p2) return { type: 't', p1, p2 };
        return null;
      }).filter(Boolean);
    });
  }
  if (s && Array.isArray(s.customInds)) s.customInds.slice(0, CUSTOM_MAX).forEach(d => { if (d && CUSTOM_ID.test(d.id)) registerCustom(d); });
  if (s && Array.isArray(s.favs)) s.favs.slice(0, 60).forEach(t => { if (typeof t === 'string' && Object.prototype.hasOwnProperty.call(IND_TYPES, t) && !favs.includes(t)) favs.push(t); });
  const list = s && Array.isArray(s.indicators)
    ? s.indicators.filter(i => i && IND_TYPES[i.type])
    : [{ type: 'ma' }, { type: 'ccOnly' }, { type: 'enhanced' }];
  list.length = Math.min(list.length, 40); // 極端な数の読み込みで固まらないようにする
  list.forEach(i => addIndicator(i.type, i.p, i.hidden, true));
}

// ---------------------------------------------------------------- 計算
function sma(a, n) { return window.GTIndicators.helpers.sma(a, n); } // 計算は indicators.js と共通
// alpha を渡すと EMA、省略すると RMA(Wilder の平滑化)
function rma(a, n, alpha) { return window.GTIndicators.helpers.rma(a, n, alpha); } // 計算は indicators.js と共通
function srcOf(b, s) {
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
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* Volume (c-c):
 * 前の足から今の足への値動き(close-to-close)の強さを -1〜+1 にならし、
 * それを出来高に掛けて「買い寄り/売り寄りの出来高」を作る。 */
function computeCC(bars, p) {
  const n = bars.length;
  const tr = new Array(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    const ps = bars[i - 1].c;
    tr[i] = Math.max(bars[i].h, ps) - Math.min(bars[i].l, ps);
  }
  const atr = p.norm === 'atr' ? rma(tr, 14) : null;
  const raw = new Array(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    const b = bars[i];
    const s = srcOf(b, p.source), ps = srcOf(bars[i - 1], p.source);
    const d = s - ps;
    let r;
    if (p.norm === 'spread') {
      const span = Math.max(b.h, ps) - Math.min(b.l, ps);
      r = span > 0 ? clamp(d / span, -1, 1) : 0;
    } else if (p.norm === 'atr') {
      r = atr[i] > 0 ? clamp(d / atr[i], -3, 3) : NaN;
    } else if (p.norm === 'percent') {
      r = ps ? d / ps * 100 : 0;
    } else {
      r = Math.sign(d);
    }
    const range = b.h - b.l;
    const clv = range > 0 ? (2 * b.c - b.h - b.l) / range : 0; // 足の中で終値がどこにあるか
    const w = clamp(+p.wick || 0, 0, 1);
    const vol = b.v * (p.money ? (b.h + b.l + b.c) / 3 : 1);
    raw[i] = vol * ((1 - w) * r + w * clv);
  }
  const len = Math.max(1, Math.round(p.maLen) || 1);
  let val;
  if (p.agg === 'simple') val = sma(raw, len);
  else if (p.agg === 'smoothed') val = rma(raw, len);
  else if (p.agg === 'ema') val = rma(raw, len, 2 / (len + 1));
  else if (p.agg === 'cumulative') {
    const cum = new Array(n).fill(NaN);
    let acc = 0;
    for (let i = 0; i < n; i++) if (isFinite(raw[i])) { acc += raw[i]; cum[i] = acc; }
    const base = sma(cum, Math.max(1, Math.round(p.adLen) || 1));
    val = cum.map((v, i) => v - base[i]);
  } else val = raw;
  const ma = sma(val, Math.max(1, Math.round(p.volMaLen) || 1));
  return { val, ma };
}
function computeMA(bars, p) {
  const src = bars.map(b => srcOf(b, p.source));
  const n = Math.max(1, Math.round(p.len) || 1);
  const H = GT.helpers;
  const val = p.kind === 'ema' ? rma(src, n, 2 / (n + 1)) : p.kind === 'rma' ? rma(src, n) : p.kind === 'vwma' ? H.vwma(src, bars.map(b => b.v), n)
    : ['wma', 'hma', 'dema', 'tema', 'kama'].includes(p.kind) ? H[p.kind](src, n) : sma(src, n);
  return { val };
}
const lenOf = v => Math.max(1, Math.round(v) || 1);
/* RSI: 直近の「上げ幅の平均」と「下げ幅の平均」の比を 0〜100 にしたもの */
function computeRSI(bars, p) {
  const n = lenOf(p.len), up = [NaN], dn = [NaN];
  for (let i = 1; i < bars.length; i++) {
    const d = srcOf(bars[i], p.source) - srcOf(bars[i - 1], p.source);
    up.push(Math.max(d, 0)); dn.push(Math.max(-d, 0));
  }
  const au = rma(up, n), ad = rma(dn, n);
  const val = au.map((u, i) => !isFinite(u) ? NaN : ad[i] === 0 ? 100 : 100 - 100 / (1 + u / ad[i]));
  return {
    lines: [{ name: 'RSI', val, color: p.color }], hist: null,
    bands: [+p.upper, +p.lower], fixed: [0, 100], label: String(n),
  };
}
/* MACD: 短期EMA − 長期EMA。シグナルはその EMA、棒は両者の差 */
function computeMACD(bars, p) {
  const src = bars.map(b => srcOf(b, p.source));
  const f = lenOf(p.fast), s = lenOf(p.slow), g = lenOf(p.signal);
  const ef = rma(src, f, 2 / (f + 1)), es = rma(src, s, 2 / (s + 1));
  const macd = ef.map((v, i) => v - es[i]);
  const sig = rma(macd, g, 2 / (g + 1));
  return {
    lines: [{ name: 'MACD', val: macd, color: p.colMacd }, { name: 'シグナル', val: sig, color: p.colSignal }],
    hist: macd.map((v, i) => v - sig[i]), bands: [0], fixed: null, label: `${f} ${s} ${g}`,
  };
}
function recompute() {
  const fns = { ma: computeMA, rsi: computeRSI, macd: computeMACD };
  state.indicators.forEach(ind => {
    try {
      ind.out = IND_TYPES[ind.type].generic ? GT.DEFS[ind.type].compute(state.bars, ind.p) : (fns[ind.type] || computeCC)(state.bars, ind.p);
    } catch (e) { ind.out = null; } // 1つの計算が失敗しても、ほかの表示は続ける
  });
  checkAlerts();
}
/* 「合図が出たら知らせる」をオンにした自作インジケーターについて、足が確定したときに合図を調べる。
 * 知らせるのは、見ている間に新しく確定した足だけ(開いた直後や、銘柄・時間足を変えた直後には出さない) */
function checkAlerts() {
  const n = state.bars.length;
  if (n < 3) return;
  const closed = state.bars[n - 2], key = `${state.symbol}|${state.interval}`;
  state.indicators.forEach(ind => {
    if (!ind.p.alert || !ind.out || !ind.out.marks || !ind.out.marks.length) { ind.alertKey = null; return; }
    const fresh = ind.alertKey === key && ind.alertT === state.bars[n - 3].t; // 直前に見ていた足の、ちょうど次の足が確定した
    ind.alertKey = key;
    if (ind.alertT === closed.t) return;
    ind.alertT = closed.t;
    if (!fresh) return;
    ind.out.marks.forEach(m => {
      if (!(m.val[n - 2] > 0 || m.val[n - 2] < 0)) return;
      const iv = INTERVALS.find(x => x.id === state.interval);
      const text = `${m.dir === 'up' ? '▲' : '▼'} ${labelOf(state.symbol)}(${iv ? iv.label : ''})で「${IND_TYPES[ind.type].name}」の合図:${m.name}`;
      toast(text);
      try { if (window.Notification && Notification.permission === 'granted' && document.hidden) new Notification('Gold Trade Chart', { body: text }); } catch (e) { /* 通知を出せなくても、画面の表示は出ている */ }
    });
  });
}

// ---------------------------------------------------------------- データ
function groupBars(raw, group, ms) {
  if (group <= 1) return raw.slice();
  const out = [];
  let cur = null, key = null;
  for (const b of raw) {
    // 区切りは TradingView の2日足に合わせてある(例: 2025-03-08 が足の始まり)
    const k = Math.floor((b.t / ms + group - 1) / group);
    if (k !== key) {
      cur = { t: (k * group - (group - 1)) * ms, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v };
      out.push(cur); key = k;
    } else {
      cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l);
      cur.c = b.c; cur.v += b.v;
    }
  }
  return out;
}
async function fetchKlines(symbol, api, limit, endTime, startTime) {
  let lastErr;
  for (const host of HOSTS) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    try {
      const res = await fetch(`${host}/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${api}&limit=${limit}${endTime ? '&endTime=' + endTime : ''}${startTime ? '&startTime=' + startTime : ''}`, { signal: ac.signal });
      // 400 は「その銘柄は存在しない」という取引所の答え。ほかの接続先を試しても同じなので、ここで確定させる
      if (res.status === 400) { const err = new Error('HTTP 400'); err.final = true; throw err; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const rows = await res.json();
      if (!Array.isArray(rows) || !rows.length) throw new Error('empty');
      return rows.map(r => ({ t: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] }));
    } catch (e) { lastErr = e; if (e && e.final) break; } finally { clearTimeout(timer); }
  }
  throw lastErr;
}
// Binance で取引中の全通貨ペア。大きな一覧なので、取得したら1日はブラウザに覚えておく
const UNIVERSE_KEY = 'gold-trade-symbols-v1';
let universe = null; // [{ id, base, quote }]
async function loadUniverse() {
  if (universe) return universe;
  try {
    const c = JSON.parse(localStorage.getItem(UNIVERSE_KEY));
    if (c && Date.now() - c.t < 864e5 && Array.isArray(c.list) && c.list.length > 100) {
      // 保存しておいた一覧も、形を確かめてから使う
      const ok = c.list.filter(x => typeof x === 'string' && /^[A-Z0-9]{1,12}\/[A-Z0-9]{1,8}$/.test(x));
      if (ok.length > 100) {
        universe = ok.map(x => { const [base, quote] = x.split('/'); return { id: base + quote, base, quote }; });
        return universe;
      }
    }
  } catch (e) { /* 取り直す */ }
  let lastErr;
  for (const host of HOSTS) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 25000);
    try {
      const res = await fetch(`${host}/api/v3/exchangeInfo?symbolStatus=TRADING&showPermissionSets=false`, { signal: ac.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const list = (data.symbols || [])
        .filter(x => x.status === 'TRADING' && /^[A-Z0-9]+$/.test(x.baseAsset + x.quoteAsset) && x.symbol === x.baseAsset + x.quoteAsset)
        .map(x => ({ id: x.symbol, base: x.baseAsset, quote: x.quoteAsset }));
      if (list.length < 10) throw new Error('empty');
      universe = list;
      try {
        localStorage.setItem(UNIVERSE_KEY, JSON.stringify({ t: Date.now(), list: list.map(x => `${x.base}/${x.quote}`) }));
      } catch (e) { /* 保存できなくても使える */ }
      return universe;
    } catch (e) { lastErr = e; } finally { clearTimeout(timer); }
  }
  throw lastErr;
}
// 通信できないとき用の、乱数で作った見本データ
function demoBars(sym, iv, count) {
  let seed = 7;
  for (const ch of sym.id + iv.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const vol = 0.02 * Math.sqrt(iv.ms / 864e5);
  const endT = Math.floor(Date.now() / iv.ms) * iv.ms;
  const out = [];
  let c = sym.base * (0.7 + rnd() * 0.3), drift = 0;
  for (let i = count - 1; i >= 0; i--) {
    if (rnd() < 0.03) drift = (rnd() - 0.5) * vol * 0.6;
    const o = c;
    const move = (rnd() + rnd() + rnd() - 1.5) * vol * 1.4 + drift;
    c = Math.max(o * (1 + move), sym.base * 0.05);
    const h = Math.max(o, c) * (1 + rnd() * vol * 0.6);
    const l = Math.min(o, c) * (1 - rnd() * vol * 0.6);
    const v = (1e6 / sym.base) * (0.5 + rnd() + Math.abs(move) / vol * 2.5);
    out.push({ t: endT - i * iv.ms, o, h, l, c, v });
  }
  return out;
}
const curInterval = () => INTERVALS.find(i => i.id === state.interval);
const curSymbol = () => SYMBOLS.find(s => s.id === state.symbol);

function setBars(raw, resetView) {
  const iv = curInterval();
  state.raw = raw;
  state.bars = groupBars(raw, iv.group, iv.ms);
  recompute();
  tradeTick();
  if (resetView) resetViewport();
  draw();
}
async function loadData() {
  const token = ++state.loadToken;
  const iv = curInterval(), sym = curSymbol();
  setStatus('', '読み込み中');
  setLoading(true);
  closeStream();
  feed.lastTick = 0;
  more.busy = false; more.done = false; more.retryAt = 0;
  try {
    const raw = await fetchKlines(sym.id, iv.api, 1000);
    if (token !== state.loadToken) return;
    state.live = true;
    feed.okAt = mono();
    setStatus('live', 'ライブ');
    $('banner').hidden = true;
    delete dead[sym.id];
    setLoading(false);
    setBars(raw, true);
    openStream();
    if (!clockReady) syncClock();
    pollPositions(); // ほかの銘柄のポジションも、すぐに最新の価格で評価し直す
  } catch (e) {
    if (token !== state.loadToken) return;
    state.live = false;
    markDeadIfUnlisted(sym.id);
    setStatus('demo', 'デモ');
    renderTrade();
    $('banner').hidden = false;
    setLoading(false);
    setBars(demoBars(sym, iv, 600), true);
  }
}
// 新しく届いた足を末尾に反映する
function mergeTail(tail) {
  const raw = state.raw.slice();
  if (!raw.length) return;
  const atEnd = state.end >= state.bars.length - 0.01;
  const before = state.bars.length;
  for (const b of tail) {
    const last = raw[raw.length - 1];
    if (b.t === last.t) raw[raw.length - 1] = b;
    else if (b.t > last.t) raw.push(b);
    else if (raw.length > 1 && b.t === raw[raw.length - 2].t) raw[raw.length - 2] = b;
  }
  setBars(raw, false);
  if (atEnd) state.end += state.bars.length - before; // 最新を見ているときは追従する
}
// リアルタイム配信。つながらないときは下の poll が代わりを務める
let ws = null;
const STREAMS = ['wss://data-stream.binance.vision/stream?streams=', 'wss://stream.binance.com:9443/stream?streams='];
const mono = () => performance.now(); // 端末の時計を変えても巻き戻らない経過時間。価格の鮮度はこれで測る
let clockOffset = 0, clockReady = false; // 取引所の時計 − 端末の時計
const tnow = () => Date.now() + clockOffset; // 取引所の時計での現在時刻(取引の記録に使う)
const feed = { lo: Infinity, hi: -Infinity, okAt: -1e9, lastMsg: -1e9, lastTick: 0, tick: null, timer: 0, bid: NaN, ask: NaN, quoteAt: 0, quoteSym: '' }; // 配信の状態
function closeStream() {
  const s = ws;
  ws = null;
  clearTimeout(feed.timer); feed.timer = 0; feed.tick = null;
  feed.bid = feed.ask = NaN; feed.quoteAt = -1e9; feed.lo = Infinity; feed.hi = -Infinity;
  renderQuote();
  if (s) { try { s.close(); } catch (e) { /* 何もしない */ } }
}
// 約定(1件ごとの売買)を、いちばん新しい足に反映する。件数が多いので、描き直しは 0.2 秒に1回までにする
function applyTick() {
  feed.timer = 0;
  const tk = feed.tick, raw = state.raw;
  feed.tick = null;
  if (!tk || !raw.length) return;
  const last = raw[raw.length - 1];
  if (tk.t < last.t || tk.p === last.c) return;
  noteTick(tk.p > last.c ? 1 : -1);
  mergeTail([{ t: last.t, o: last.o, h: Math.max(last.h, tk.p), l: Math.min(last.l, tk.p), c: tk.p, v: last.v }]);
}
// 値が動いたことを、目で分かるようにする
let flashTimer = 0;
function noteTick(dir) {
  feed.lastTick = Date.now();
  const el = $('trPrice');
  el.classList.remove('tick-up', 'tick-down');
  if (dir) { void el.offsetWidth; el.classList.add(dir > 0 ? 'tick-up' : 'tick-down'); }
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => el.classList.remove('tick-up', 'tick-down'), 700);
}
// いま有効な気配値(売れる価格 bid と、買える価格 ask)。古いものや別の銘柄のものは使わない
function liveQuote(sym) {
  if (feed.quoteSym !== sym || mono() - feed.quoteAt > 5000 || !(feed.bid > 0) || !(feed.ask > 0)) return null;
  return { bid: feed.bid, ask: feed.ask };
}
let lastQuoteText = '';
function renderQuote() {
  const q = liveQuote(state.symbol), box = $('trQuoteLine');
  if (!q) { if (!box.hidden) box.hidden = true; lastQuoteText = ''; setTxt('trSellPx', ''); setTxt('trBuyPx', ''); return; }
  const text = `${q.bid}|${q.ask}`;
  if (text === lastQuoteText) return;
  if (lastQuoteText) {
    // 気配値が動いたら、動いた側を一瞬光らせる
    const [pb, pa] = lastQuoteText.split('|').map(Number);
    [['trBid', q.bid, pb], ['trAsk', q.ask, pa]].forEach(([id, now, was]) => {
      if (now === was) return;
      const n = $(id);
      n.classList.remove('tick-up', 'tick-down'); void n.offsetWidth;
      n.classList.add(now > was ? 'tick-up' : 'tick-down');
    });
  }
  lastQuoteText = text;
  box.hidden = false;
  setTxt('trBid', fmtPrice(q.bid, q.ask)); setTxt('trAsk', fmtPrice(q.ask));
  setTxt('trSpread', `差 ${fmtPrice(q.ask - q.bid, q.ask)}`);
  setTxt('trSellPx', fmtPrice(q.bid, q.ask)); setTxt('trBuyPx', fmtPrice(q.ask));
}
function openStream() {
  closeStream();
  if (!state.live || !window.WebSocket) return;
  const token = state.loadToken;
  const sym = state.symbol.toLowerCase();
  // 足の更新(kline)に加えて、約定(aggTrade)も受け取り、1件ごとの値動きを表示する
  // depth5 は板(買い注文・売り注文)の上位。取引がない間も、気配値の動きが分かる
  const name = `${sym}@kline_${curInterval().api}/${sym}@aggTrade/${sym}@depth5@1000ms`;
  const streamSym = state.symbol;
  let k = 0;
  const connect = () => {
    if (token !== state.loadToken || k >= STREAMS.length) return;
    let opened = false, s;
    try { s = new WebSocket(STREAMS[k] + name); } catch (e) { k++; connect(); return; }
    ws = s;
    feed.lastMsg = mono();
    s.onopen = () => { opened = true; feed.lastMsg = mono(); };
    s.onmessage = ev => {
      if (token !== state.loadToken) return;
      feed.lastMsg = feed.okAt = mono();
      try {
        const d = JSON.parse(ev.data).data;
        if (!d) return;
        // 取引所の時計とのずれを覚えておく(端末の時計を変えても、記録の時刻が狂わないようにする)
        if (typeof d.E === 'number' && isFinite(d.E)) { clockOffset = d.E - Date.now(); clockReady = true; }
        if (d.e === 'kline' && d.k) {
          const m = d.k, prev = state.raw[state.raw.length - 1];
          if (prev && +m.c !== prev.c) noteTick(+m.c > prev.c ? 1 : -1);
          mergeTail([{ t: +m.t, o: +m.o, h: +m.h, l: +m.l, c: +m.c, v: +m.v }]);
        } else if (d.e === 'aggTrade') {
          feed.tick = { t: +d.T, p: +d.p };
          feed.lo = Math.min(feed.lo, +d.p); feed.hi = Math.max(feed.hi, +d.p); // 間引いている間の高値・安値も覚えておく
          if (!feed.timer) feed.timer = setTimeout(applyTick, 200);
        } else if (d.bids && d.asks && d.bids[0] && d.asks[0]) {
          feed.bid = +d.bids[0][0]; feed.ask = +d.asks[0][0];
          feed.quoteAt = mono(); feed.quoteSym = streamSym;
          renderQuote();
        }
      } catch (e) { /* 壊れたメッセージは読み飛ばす */ }
    };
    s.onclose = () => {
      if (ws !== s) return;
      ws = null;
      if (!opened) { k++; connect(); }
    };
  };
  connect();
}
let probeAt = -1e9;
async function poll() {
  if (document.hidden) return;
  if (!state.live) {
    // デモ表示のまま止まらないよう、ときどき取得を試し、取れたら読み込み直す
    if (state.loading || mono() - probeAt < 30000) return;
    probeAt = mono();
    const token = state.loadToken;
    try { await fetchKlines(state.symbol, curInterval().api, 1); if (token === state.loadToken && !state.live) loadData(); } catch (e) { /* まだつながらない */ }
    return;
  }
  const quiet = mono() - feed.lastMsg;
  // 配信が届いている間は任せる。黙ったままなら、こちらから取りにいく
  if (ws && ws.readyState <= 1 && quiet < 4000) return;
  // 1分以上なにも届かなければ、つなぎ直す
  if (ws && quiet > 60000) closeStream();
  const token = state.loadToken, iv = curInterval();
  try {
    const tail = await fetchKlines(state.symbol, iv.api, 3);
    if (token !== state.loadToken) return;
    feed.okAt = mono();
    const prev = state.raw[state.raw.length - 1], now = tail[tail.length - 1];
    if (prev && now && now.c !== prev.c) noteTick(now.c > prev.c ? 1 : -1);
    mergeTail(tail);
    if (!ws) openStream();
  } catch (e) { /* 次の周期でやり直す */ }
}
// 取引所の時計を取り寄せる
async function syncClock() {
  for (const host of HOSTS) {
    const ac = new AbortController(), timer = setTimeout(() => ac.abort(), 5000);
    try {
      const res = await fetch(`${host}/api/v3/time`, { signal: ac.signal });
      const d = await res.json();
      if (res.ok && typeof d.serverTime === 'number' && isFinite(d.serverTime)) { clockOffset = d.serverTime - Date.now(); clockReady = true; return; }
    } catch (e) { /* 次の接続先を試す */ } finally { clearTimeout(timer); }
  }
}
// 左端に近づいたら、さらに古い足を読み足す
const more = { busy: false, done: false, retryAt: 0 };
function maybeLoadMore() {
  if (!state.live || more.busy || more.done || !state.raw.length) return;
  if (startIdx() > 30 || Date.now() < more.retryAt) return;
  if (state.raw.length >= 20000) { more.done = true; return; }
  more.busy = true;
  const token = state.loadToken, first = state.raw[0].t;
  fetchKlines(state.symbol, curInterval().api, 1000, first - 1).then(rows => {
    if (token !== state.loadToken) return;
    const older = rows.filter(b => b.t < first);
    if (older.length < 2) { more.done = true; return; }
    const before = state.bars.length;
    setBars(older.concat(state.raw), false);
    state.end += state.bars.length - before; // 見ている場所がずれないようにする
  }).catch(e => {
    if (token !== state.loadToken) return;
    if (e && e.message === 'empty') more.done = true; else more.retryAt = Date.now() + 10000;
  }).finally(() => { if (token === state.loadToken) more.busy = false; });
}
function setStatus(cls, text) {
  const el = $('status');
  el.className = 'badge' + (cls ? ' ' + cls : '');
  el.innerHTML = '<span class="txt"></span>';
  el.firstChild.textContent = text;
  el.setAttribute('aria-label', 'データの状態: ' + text);
}
function setLoading(on) {
  state.loading = on;
  $('loading').hidden = !on;
}

// ---------------------------------------------------------------- 書式
function priceDigits(v) {
  const a = Math.abs(v);
  if (a >= 1000) return 2;
  if (a >= 1) return a >= 100 ? 2 : 4;
  if (a >= 0.01) return 5;
  return 8;
}
// ref を渡すと、その価格と同じ小数桁でそろえる(前日比などの小さな値用)
const fmtPrice = (v, ref) => {
  if (!isFinite(v)) return '—';
  const dg = priceDigits(ref === undefined ? v : ref);
  return v.toLocaleString('en-US', { minimumFractionDigits: dg, maximumFractionDigits: dg });
};
function fmtCompact(v) {
  if (!isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a < 1e-9) return '0';
  const units = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (const [n, u] of units) if (a >= n) return (v / n).toFixed(2) + u;
  return a >= 10 ? v.toFixed(1) : a >= 0.1 ? v.toFixed(2) : v.toFixed(4);
}
const pad2 = n => String(n).padStart(2, '0');
function fmtRemain(ms) {
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600);
  const m = Math.floor(s % 3600 / 60);
  if (d > 0) return `${d}日 ${h}時間`;
  return h > 0 ? `${pad2(h)}:${pad2(m)}:${pad2(s % 60)}` : `${pad2(m)}:${pad2(s % 60)}`;
}
function fmtDate(t, withTime) {
  const d = new Date(t);
  const ymd = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  return withTime ? `${ymd} ${pad2(d.getHours())}:${pad2(d.getMinutes())}` : ymd;
}
function rgba(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

// ---------------------------------------------------------------- レイアウト
let W = 0, H = 0, axisW = 64, compact = false;
const TIME_H = 24;
let panes = [];

const shownHere = i => i.p.vis[state.interval] !== false;
const isOverlay = i => !!IND_TYPES[i.type].overlay;
function visibleIndicators() {
  return state.indicators.filter(i => shownHere(i) && !isOverlay(i));
}
const visibleOverlays = () => state.indicators.filter(i => shownHere(i) && isOverlay(i));
function layout() {
  compact = W < 520;
  axisW = compact ? 54 : 66;
  // 小数の桁が多い銘柄(PEPE など)でも数字が切れないよう、軸の幅を広げる
  const lastBar = state.bars[state.bars.length - 1];
  if (lastBar) {
    ctx.font = '11px -apple-system, "Segoe UI", "Hiragino Sans", sans-serif';
    axisW = Math.max(axisW, Math.ceil(ctx.measureText(fmtPrice(lastBar.h)).width) + 12);
  }
  const inds = visibleIndicators();
  const total = H - TIME_H;
  const weights = [state.mainWeight].concat(inds.map(i => i.p.weight || 1));
  const sum = weights.reduce((a, b) => a + b, 0);
  panes = [];
  let y = 0;
  weights.forEach((w, k) => {
    const h = k === weights.length - 1 ? total - y : Math.round(total * w / sum);
    panes.push({ y, h, ind: k ? inds[k - 1] : null });
    y += h;
  });
}
const plotW = () => Math.max(50, W - axisW);
const startIdx = () => state.end - plotW() / state.barW;
const xOf = i => (i - startIdx()) * state.barW + state.barW / 2;
function resetViewport() {
  state.barW = W < 520 ? 6 : 8;
  // 一目均衡表のように先の足まで描くものがあれば、そのぶん右を空ける
  let ahead = 0;
  state.indicators.forEach(i => { if (shownHere(i) && i.out && i.out.lines) i.out.lines.forEach(l => { ahead = Math.max(ahead, l.offset || 0); }); });
  state.end = state.bars.length + 5 + ahead;
}
function clampView() {
  const span = plotW() / state.barW;
  state.end = clamp(state.end, Math.min(10, state.bars.length), state.bars.length + span - 5);
}
function resize() {
  const r = wrap.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const keep = state.end;
  W = Math.max(120, Math.floor(r.width));
  H = Math.max(120, Math.floor(r.height));
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  state.end = keep;
  draw();
}

// ---------------------------------------------------------------- 描画
// 凡例が載る上端のぶんだけ、目盛りの上側に余白を足す
function headroom(lo, hi, pane, px) {
  const t = Math.min(px, pane.h * 0.35);
  return (hi - lo) * t / (pane.h - t);
}
function niceTicks(min, max, count) {
  const span = max - min;
  if (!(span > 0)) return [];
  const rawStep = span / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out = [];
  // 値が極端に大きいと v + step が v のまま進まなくなるので、回数に上限を置く
  for (let v = Math.ceil(min / step) * step, k = 0; v <= max && k < 200; v += step, k++) out.push(v);
  return out;
}
let tickLabels = [];  // 目盛りの数字。ラベルと重なるものは最後に省く
let placedTags = []; // この描画で置いたラベルの位置(重なり防止用)
function axisTag(y, text, bg, fg, pane, free) {
  const h = 18;
  let yy = clamp(y, pane.y + h / 2, pane.y + pane.h - h / 2);
  if (!free) {
    // すでにあるラベルと重なるときは、すぐ下にずらす
    for (let k = 0; k < 6; k++) {
      const hit = placedTags.find(p => Math.abs(p - yy) < h);
      if (hit === undefined) break;
      yy = hit + h;
    }
    yy = clamp(yy, pane.y + h / 2, pane.y + pane.h - h / 2);
    placedTags.push(yy);
  }
  ctx.fillStyle = bg;
  ctx.fillRect(plotW(), yy - h / 2, axisW, h);
  ctx.fillStyle = fg;
  ctx.textAlign = 'left';
  ctx.fillText(text, plotW() + 5, yy);
}
let drawQueued = false;
function draw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; render(); });
}
function render() {
  if (!W) return;
  const th = THEMES[state.theme];
  placedTags = []; tickLabels = [];
  layout();
  clampView();
  const pw = plotW();
  const bars = state.bars, n = bars.length;
  const s = startIdx();
  const i0 = Math.max(0, Math.floor(s)), i1 = Math.min(n - 1, Math.ceil(state.end));

  ctx.fillStyle = th.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.font = '11px -apple-system, "Segoe UI", "Hiragino Sans", sans-serif';
  ctx.textBaseline = 'middle';

  // 時間軸の目盛り
  const timeTicks = [];
  if (n) {
    const step = Math.max(1, Math.ceil(78 / state.barW));
    const intraday = curInterval().ms < 864e5;
    // 分足・時間足は、きりのよい時刻(毎時0分、0時など)に目盛りを置く
    const need = step * barSpan();
    const period = [9e5, 18e5, 36e5, 72e5, 144e5, 216e5, 432e5, 864e5, 1728e5, 6048e5].find(v => v >= need) || 6048e5;
    let prev = null;
    for (let i = intraday ? i0 : Math.ceil(i0 / step) * step; i <= i1; i += intraday ? 1 : step) {
      const d = new Date(bars[i].t);
      let text;
      if (intraday) {
        const local = bars[i].t - d.getTimezoneOffset() * 6e4;
        if (local % period) continue;
        text = d.getHours() === 0 && d.getMinutes() === 0
          ? `${d.getMonth() + 1}/${d.getDate()}` : `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
      } else if (!prev || prev.getFullYear() !== d.getFullYear()) text = String(d.getFullYear());
      else if (prev.getMonth() !== d.getMonth()) text = `${d.getMonth() + 1}月`;
      else text = String(d.getDate());
      timeTicks.push({ x: xOf(i), text });
      prev = d;
    }
  }

  panes.forEach(pane => {
    ctx.save();
    ctx.beginPath(); ctx.rect(0, pane.y, pw, pane.h); ctx.clip();
    ctx.strokeStyle = th.grid; ctx.lineWidth = 1;
    ctx.beginPath();
    timeTicks.forEach(t => { const x = Math.round(t.x) + 0.5; ctx.moveTo(x, pane.y); ctx.lineTo(x, pane.y + pane.h); });
    ctx.stroke();
    ctx.restore();
    if (n && !pane.ind) { drawMain(pane, i0, i1, th); drawDrawings(pane); drawTrade(pane, i0, i1); }
    else if (n) (IND_TYPES[pane.ind.type].simple ? drawSimple : drawIndicator)(pane, i0, i1, th);
    // 区切り線
    ctx.strokeStyle = th.axis;
    ctx.beginPath();
    ctx.moveTo(0, pane.y + pane.h + 0.5); ctx.lineTo(W, pane.y + pane.h + 0.5);
    ctx.stroke();
  });

  // 軸の枠と時間ラベル
  ctx.strokeStyle = th.axis;
  ctx.beginPath(); ctx.moveTo(pw + 0.5, 0); ctx.lineTo(pw + 0.5, H); ctx.stroke();
  ctx.fillStyle = th.text; ctx.textAlign = 'center';
  timeTicks.forEach(t => { if (t.x > 16 && t.x < pw - 16) ctx.fillText(t.text, t.x, H - TIME_H / 2); });

  ctx.fillStyle = th.text; ctx.textAlign = 'left';
  tickLabels.forEach(t => { if (!placedTags.some(p => Math.abs(p - t.y) < 15)) ctx.fillText(t.text, pw + 5, t.y); });

  drawCrosshair(th);
  updateLegends();
  maybeLoadMore();
  $('toLatest').hidden = state.loading || !n || state.end >= n - 0.5;
  const title = n ? `${fmtPrice(bars[n - 1].c)} ${curSymbol().label}${state.live ? '' : '(デモ)'} | Gold Trade Chart` : 'Gold Trade Chart';
  if (document.title !== title) document.title = title;
}

function gridAndAxis(pane, min, max, yOf, th, fmt) {
  const pw = plotW();
  const ticks = niceTicks(min, max, Math.max(2, Math.floor(pane.h / 46)));
  ctx.strokeStyle = th.grid; ctx.lineWidth = 1;
  ctx.beginPath();
  ticks.forEach(v => { const y = Math.round(yOf(v)) + 0.5; ctx.moveTo(0, y); ctx.lineTo(pw, y); });
  ctx.stroke();
  ctx.fillStyle = th.text; ctx.textAlign = 'left';
  ticks.forEach(v => {
    const y = yOf(v);
    if (y > pane.y + 8 && y < pane.y + pane.h - 8) tickLabels.push({ y, text: fmt(v) });
  });
}

function drawMain(pane, i0, i1, th) {
  const bars = state.bars, pw = plotW(), bw = state.barW;
  let lo = Infinity, hi = -Infinity, vmax = 0;
  for (let i = i0; i <= i1; i++) {
    lo = Math.min(lo, bars[i].l); hi = Math.max(hi, bars[i].h); vmax = Math.max(vmax, bars[i].v);
  }
  if (!isFinite(lo)) return;
  if (hi === lo) { hi += 1; lo -= 1; }
  const padV = (hi - lo) * 0.1;
  const min = lo - padV * 1.6, max = hi + padV * 0.5 + headroom(lo - padV * 1.6, hi, pane, compact ? 78 : 44);
  const yOf = v => pane.y + pane.h - (v - min) / (max - min) * pane.h;
  pane.yOf = yOf; pane.vOf = y => min + (pane.y + pane.h - y) / pane.h * (max - min); pane.fmt = fmtPrice;

  gridAndAxis(pane, min, max, yOf, th, fmtPrice);

  ctx.save();
  ctx.beginPath(); ctx.rect(0, pane.y, pw, pane.h); ctx.clip();
  const body = Math.max(1, Math.floor(bw * 0.72));
  const volH = pane.h * 0.2;
  for (let i = i0; i <= i1; i++) {
    const b = bars[i], x = xOf(i), up = b.c >= b.o;
    const left = Math.round(x - body / 2);
    // 出来高(下に重ねて表示)
    const vh = vmax ? b.v / vmax * volH : 0;
    ctx.fillStyle = rgba(up ? UP : DOWN, 0.45);
    ctx.fillRect(left, pane.y + pane.h - vh, body, vh);
  }
  for (let i = i0; i <= i1; i++) {
    const b = bars[i], x = xOf(i), up = b.c >= b.o;
    const left = Math.round(x - body / 2);
    ctx.fillStyle = up ? UP : DOWN;
    const cx = left + Math.floor(body / 2);
    const yh = Math.round(yOf(b.h)), yl = Math.round(yOf(b.l));
    ctx.fillRect(cx, yh, 1, Math.max(1, yl - yh));
    const yo = Math.round(yOf(b.o)), yc = Math.round(yOf(b.c));
    ctx.fillRect(left, Math.min(yo, yc), body, Math.max(1, Math.abs(yc - yo)));
  }
  // 重ねて描くインジケーター(移動平均線、ボリンジャーバンド、一目均衡表など)
  visibleOverlays().forEach(ind => {
    if (ind.hidden || !ind.out) return;
    const lines = ind.out.lines || [{ val: ind.out.val, color: ind.p.color, width: +ind.p.width || 1.5 }];
    const f = ind.out.fill;
    if (f) fillBetween(lines[f.a], lines[f.b], f, yOf, i0, i1);
    lines.forEach(l => strokeSeries(l, yOf, i0, i1));
  });
  // 自分で作ったインジケーターの合図(▲ は足の下、▼ は足の上)。下の枠に出しているものの合図も、ここに出す
  let slot = 0;
  state.indicators.forEach(ind => {
    if (ind.hidden || !ind.out || !ind.out.marks || !ind.out.marks.length || !shownHere(ind)) return;
    const size = clamp(bw * 0.45, 4.5, 7);
    ind.out.marks.forEach(m => {
      const up = m.dir === 'up', gap = 5 + slot * (size * 2 + 3);
      ctx.fillStyle = up ? UP : DOWN;
      ctx.beginPath();
      for (let i = i0; i <= i1; i++) {
        if (!(m.val[i] > 0 || m.val[i] < 0)) continue;
        const x = xOf(i), y = up ? yOf(bars[i].l) + gap : yOf(bars[i].h) - gap;
        ctx.moveTo(x, y); ctx.lineTo(x - size, y + (up ? 1 : -1) * size * 1.6); ctx.lineTo(x + size, y + (up ? 1 : -1) * size * 1.6); ctx.closePath();
      }
      ctx.fill();
    });
    slot++;
  });
  // 最新の価格ライン
  const last = bars[bars.length - 1];
  const col = last.c >= last.o ? UP : DOWN;
  const ly = Math.round(yOf(last.c)) + 0.5;
  ctx.strokeStyle = col; ctx.setLineDash([2, 3]);
  ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(pw, ly); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  if (ly > pane.y && ly < pane.y + pane.h) {
    // 価格の下に、この足が確定するまでの残り時間を出す
    const iv = curInterval();
    const left = last.t + iv.ms * iv.group - Date.now();
    const y = clamp(ly, pane.y + 9, pane.y + pane.h - (left > 0 ? 27 : 9));
    axisTag(y, fmtPrice(last.c), col, '#ffffff', pane);
    if (left > 0) axisTag(y + 18, fmtRemain(left), col, '#ffffff', pane);
  }
}

function drawIndicator(pane, i0, i1, th) {
  const ind = pane.ind, p = ind.p, out = ind.out, pw = plotW(), bw = state.barW;
  if (!out) return;
  const zero = +p.zeroValue || 0;
  let lo = zero, hi = zero;
  for (let i = i0; i <= i1; i++) {
    const v = out.val[i], m = out.ma[i];
    if (isFinite(v) && p.showPlot) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (isFinite(m) && p.showMa) { lo = Math.min(lo, m); hi = Math.max(hi, m); }
  }
  if (hi === lo) { hi += 1; lo -= 1; }
  const padV = (hi - lo) * 0.12;
  const min = lo - padV, max = hi + padV * 0.5 + headroom(lo - padV, hi, pane, compact ? 50 : 24);
  const yOf = v => pane.y + pane.h - (v - min) / (max - min) * pane.h;
  pane.yOf = yOf; pane.vOf = y => min + (pane.y + pane.h - y) / pane.h * (max - min); pane.fmt = fmtCompact;

  gridAndAxis(pane, min, max, yOf, th, fmtCompact);
  if (ind.hidden) return;

  ctx.save();
  ctx.beginPath(); ctx.rect(0, pane.y, pw, pane.h); ctx.clip();
  const y0 = yOf(zero);
  const colorAt = i => out.val[i] >= out.ma[i] || !isFinite(out.ma[i])
    ? rgba(p.colAbove, p.opAbove) : rgba(p.colBelow, p.opBelow);

  if (p.showPlot && p.baseline) {
    // ゼロラインとの間を塗る。同じ色が続く区間は1つの図形にまとめる
    const a = Math.max(0, i0 - 1), b = Math.min(state.bars.length - 1, i1 + 1);
    let i = a;
    while (i < b) {
      if (!isFinite(out.val[i]) || !isFinite(out.val[i + 1])) { i++; continue; }
      const col = colorAt(i + 1);
      let j = i + 1;
      while (j < b && isFinite(out.val[j + 1]) && colorAt(j + 1) === col) j++;
      ctx.beginPath();
      ctx.moveTo(xOf(i), y0);
      for (let k = i; k <= j; k++) ctx.lineTo(xOf(k), yOf(out.val[k]));
      ctx.lineTo(xOf(j), y0);
      ctx.closePath();
      ctx.fillStyle = col;
      ctx.fill();
      i = j;
    }
  } else if (p.showPlot) {
    const body = Math.max(1, Math.floor(bw * 0.72));
    for (let i = i0; i <= i1; i++) {
      const v = out.val[i];
      if (!isFinite(v)) continue;
      const y = yOf(v);
      ctx.fillStyle = colorAt(i);
      ctx.fillRect(Math.round(xOf(i) - body / 2), Math.min(y, y0), body, Math.max(1, Math.abs(y - y0)));
    }
  }
  if (p.showMa) {
    ctx.lineWidth = +p.maWidth || 1.5; ctx.lineJoin = 'round';
    const a = Math.max(0, i0 - 1), b = Math.min(state.bars.length - 1, i1 + 1);
    for (let i = a; i < b; i++) {
      const m0 = out.ma[i], m1 = out.ma[i + 1];
      if (!isFinite(m0) || !isFinite(m1)) continue;
      ctx.strokeStyle = p.signMa && m1 < zero ? p.colMaNeg : p.colMa;
      ctx.beginPath(); ctx.moveTo(xOf(i), yOf(m0)); ctx.lineTo(xOf(i + 1), yOf(m1)); ctx.stroke();
    }
    ctx.lineWidth = 1;
  }
  if (p.pivots && p.showPlot && bw >= 3) { // 縮小しすぎると印だらけになるので出さない
    const N = Math.max(1, Math.round(p.pivotLen) || 1), v = out.val, last = state.bars.length - 1;
    ctx.strokeStyle = '#5b7fd6'; ctx.fillStyle = th.bg; ctx.lineWidth = 1.3;
    for (let i = Math.max(N, i0); i <= Math.min(last - N, i1); i++) {
      if (!isFinite(v[i]) || !isFinite(v[i - N])) continue;
      let hi2 = true, lo2 = true;
      for (let k = i - N; k <= i + N && (hi2 || lo2); k++) {
        if (k === i) continue;
        if (v[k] >= v[i]) hi2 = false;
        if (v[k] <= v[i]) lo2 = false;
      }
      if (!hi2 && !lo2) continue;
      ctx.beginPath(); ctx.arc(xOf(i), yOf(v[i]), 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.lineWidth = 1;
  }
  if (p.showZero) {
    ctx.strokeStyle = p.zeroColor; ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(0, Math.round(y0) + 0.5); ctx.lineTo(pw, Math.round(y0) + 0.5); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();

  if (p.axisLabel && p.showPlot) {
    const li = state.bars.length - 1, v = out.val[li];
    if (isFinite(v)) {
      const y = yOf(v);
      if (y > pane.y && y < pane.y + pane.h) {
        axisTag(y, fmtCompact(v), v >= out.ma[li] || !isFinite(out.ma[li]) ? p.colAbove : p.colBelow, '#ffffff', pane);
      }
    }
  }
}

// 1本の系列を描く。offset は足何本ぶん右(+)・左(-)にずらすか
function strokeSeries(l, yOf, i0, i1) {
  const off = l.offset || 0, val = l.val, n = val.length;
  const a = Math.max(0, i0 - 1 - off), b = Math.min(n - 1, i1 + 1 - off);
  ctx.strokeStyle = l.color; ctx.fillStyle = l.color;
  if (l.dots) {
    const r = clamp(state.barW * 0.2, 1.1, 2.6);
    for (let i = a; i <= b; i++) {
      if (!isFinite(val[i])) continue;
      ctx.beginPath(); ctx.arc(xOf(i + off), yOf(val[i]), r, 0, Math.PI * 2); ctx.fill();
    }
    return;
  }
  ctx.lineWidth = l.width || 1.5; ctx.lineJoin = 'round';
  if (l.dash) ctx.setLineDash(l.dash);
  ctx.beginPath();
  let pen = false;
  for (let i = a; i <= b; i++) {
    if (!isFinite(val[i])) { pen = false; continue; }
    if (pen) ctx.lineTo(xOf(i + off), yOf(val[i])); else ctx.moveTo(xOf(i + off), yOf(val[i]));
    pen = true;
  }
  ctx.stroke();
  ctx.setLineDash([]); ctx.lineWidth = 1;
}
// 2本の系列の間を塗る。color2 があれば、上下が入れ替わったところで色を変える(一目均衡表の雲)
function fillBetween(la, lb, f, yOf, i0, i1) {
  const off = la.offset || 0, A = la.val, B = lb.val, n = A.length;
  const s = Math.max(0, i0 - 1 - off), e = Math.min(n - 1, i1 + 1 - off);
  const ok = i => isFinite(A[i]) && isFinite(B[i]);
  const colorAt = i => (f.color2 && A[i] + A[i + 1] < B[i] + B[i + 1] ? f.color2 : f.color);
  let i = s;
  while (i < e) {
    if (!ok(i) || !ok(i + 1)) { i++; continue; }
    const c = colorAt(i);
    let j = i + 1;
    while (j < e && ok(j + 1) && colorAt(j) === c) j++;
    ctx.beginPath();
    for (let k = i; k <= j; k++) ctx.lineTo(xOf(k + off), yOf(A[k]));
    for (let k = j; k >= i; k--) ctx.lineTo(xOf(k + off), yOf(B[k]));
    ctx.closePath();
    ctx.fillStyle = rgba(c, f.color2 ? 0.16 : 0.08);
    ctx.fill();
    i = j;
  }
}
function drawSimple(pane, i0, i1, th) {
  const ind = pane.ind, out = ind.out, pw = plotW(), bw = state.barW;
  if (!out) return;
  let lo = Infinity, hi = -Infinity;
  if (out.fixed) [lo, hi] = out.fixed;
  else {
    const all = out.lines.map(l => l.val).concat(out.hist ? [out.hist] : []);
    for (let i = i0; i <= i1; i++) all.forEach(arr => { if (isFinite(arr[i])) { lo = Math.min(lo, arr[i]); hi = Math.max(hi, arr[i]); } });
    out.bands.forEach(v => { lo = Math.min(lo, v); hi = Math.max(hi, v); });
    if (out.floor !== undefined) lo = Math.min(out.floor, lo);
  }
  if (!isFinite(lo) || !isFinite(hi)) { lo = -1; hi = 1; }
  if (hi === lo) { hi += 1; lo -= 1; }
  const padV = out.fixed ? 0 : (hi - lo) * 0.12;
  const min = out.floor !== undefined && lo >= out.floor ? out.floor : lo - padV;
  const max = hi + padV * 0.5 + (out.fixed ? 0 : headroom(min, hi, pane, compact ? 30 : 24));
  const yOf = v => pane.y + pane.h - (v - min) / (max - min) * pane.h;
  pane.yOf = yOf; pane.vOf = y => min + (pane.y + pane.h - y) / pane.h * (max - min); pane.fmt = fmtCompact;
  gridAndAxis(pane, min, max, yOf, th, fmtCompact);
  if (ind.hidden) return;

  ctx.save();
  ctx.beginPath(); ctx.rect(0, pane.y, pw, pane.h); ctx.clip();
  if (out.bands.length === 2) {
    ctx.fillStyle = rgba(out.lines.length ? out.lines[0].color : '#888888', 0.08);
    ctx.fillRect(0, yOf(out.bands[0]), pw, yOf(out.bands[1]) - yOf(out.bands[0]));
  }
  ctx.strokeStyle = th.cross; ctx.setLineDash([2, 3]);
  ctx.beginPath();
  out.bands.forEach(v => { const y = Math.round(yOf(v)) + 0.5; ctx.moveTo(0, y); ctx.lineTo(pw, y); });
  ctx.stroke(); ctx.setLineDash([]);
  if (out.hist) {
    const body = Math.max(1, Math.floor(bw * 0.72)), y0 = yOf(0);
    for (let i = i0; i <= i1; i++) {
      const v = out.hist[i];
      if (!isFinite(v)) continue;
      if (out.histDir) ctx.fillStyle = rgba(out.histDir[i] > 0 ? UP : DOWN, 0.6); // 棒ごとに向きの色が決まっているもの
      else {
        const growing = Math.abs(v) >= Math.abs(out.hist[i - 1]); // 勢いが増している棒は濃く
        ctx.fillStyle = rgba(v >= 0 ? UP : DOWN, growing ? 0.85 : 0.4);
      }
      const y = yOf(v);
      ctx.fillRect(Math.round(xOf(i) - body / 2), Math.min(y, y0), body, Math.max(1, Math.abs(y - y0)));
    }
  }
  out.lines.forEach(l => strokeSeries(l, yOf, i0, i1));
  ctx.restore();
  const last = state.bars.length - 1;
  const tagVal = out.lines.length ? out.lines[0].val[last] : out.hist ? out.hist[last] : NaN;
  if (isFinite(tagVal)) {
    const y = yOf(tagVal);
    const color = out.lines.length ? out.lines[0].color : tagVal >= 0 ? UP : DOWN;
    if (y > pane.y && y < pane.y + pane.h) axisTag(y, fmtCompact(tagVal), color, '#ffffff', pane);
  }
}

// ---------------------------------------------------------------- 線を引く
const barSpan = () => { const iv = curInterval(); return iv.ms * iv.group; };
// 時刻 → 足の位置(小数)。最新の足より先は、足の間隔で延長する
function idxOfTime(t) {
  const bars = state.bars, n = bars.length;
  if (!n) return 0;
  if (t >= bars[n - 1].t) return n - 1 + (t - bars[n - 1].t) / barSpan();
  if (t <= bars[0].t) return (t - bars[0].t) / barSpan();
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (bars[m].t <= t) lo = m; else hi = m; }
  return lo + (t - bars[lo].t) / (bars[hi].t - bars[lo].t);
}
function timeOfIdx(i) {
  const bars = state.bars, n = bars.length;
  const k = Math.round(i);
  if (k >= n) return bars[n - 1].t + (k - n + 1) * barSpan();
  if (k < 0) return bars[0].t + k * barSpan();
  return bars[k].t;
}
const idxAtX = x => startIdx() + (x - state.barW / 2) / state.barW;
const curDrawings = () => state.drawings[state.symbol] || (state.drawings[state.symbol] = []);
function drawingPoints(d, pane) {
  return [d.p1, d.p2].filter(Boolean).map(p => ({ x: xOf(idxOfTime(p.t)), y: pane.yOf(p.price) }));
}
function hitDrawing(pos, tol) {
  const pane = panes[0];
  if (!pane || !pane.yOf || pos.x > plotW() || pos.y > pane.y + pane.h) return null;
  const list = curDrawings();
  for (let k = list.length - 1; k >= 0; k--) {
    const d = list[k];
    if (d.type === 'h') { if (Math.abs(pos.y - pane.yOf(d.p1.price)) <= tol) return d; continue; }
    const [a, b] = drawingPoints(d, pane);
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    const u = len2 ? clamp(((pos.x - a.x) * dx + (pos.y - a.y) * dy) / len2, 0, 1) : 0;
    if (Math.hypot(pos.x - (a.x + u * dx), pos.y - (a.y + u * dy)) <= tol) return d;
  }
  return null;
}
function drawDrawings(pane) {
  const pw = plotW(), tags = [];
  ctx.save();
  ctx.beginPath(); ctx.rect(0, pane.y, pw, pane.h); ctx.clip();
  ctx.strokeStyle = DRAW_COLOR; ctx.fillStyle = DRAW_COLOR;
  curDrawings().forEach(d => {
    const on = d === state.sel;
    ctx.lineWidth = on ? 2.5 : 1.4;
    ctx.beginPath();
    if (d.type === 'h') {
      const y = Math.round(pane.yOf(d.p1.price)) + 0.5;
      ctx.moveTo(0, y); ctx.lineTo(pw, y); ctx.stroke();
      tags.push([y, d.p1.price]);
    } else {
      const [a, b] = drawingPoints(d, pane);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      if (on) [a, b].forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); });
    }
  });
  // トレンドラインの2点目を選んでいる間の下書き
  if (state.tool === 't' && state.pending && state.hover) {
    const a = { x: xOf(idxOfTime(state.pending.t)), y: pane.yOf(state.pending.price) };
    ctx.lineWidth = 1.4; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(state.hover.x, state.hover.y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(a.x, a.y, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.lineWidth = 1;
  ctx.restore();
  tags.forEach(([y, price]) => {
    if (y > pane.y && y < pane.y + pane.h) axisTag(y, fmtPrice(price), DRAW_COLOR, '#ffffff', pane);
  });
}
function saveImage() {
  const dpr = canvas.width / W, pad = 8 * dpr;
  const out = document.createElement('canvas');
  out.width = canvas.width; out.height = canvas.height;
  const c = out.getContext('2d');
  c.drawImage(canvas, 0, 0);
  // 凡例は画像に入らないので、銘柄・時間足・日時を左上に書き込む
  const th = THEMES[state.theme];
  const text = `${curSymbol().label} · ${curInterval().label} · ${fmtDate(Date.now(), true)}${state.live ? '' : ' · デモデータ'}`;
  c.font = `${12 * dpr}px -apple-system, "Segoe UI", "Hiragino Sans", sans-serif`;
  c.textBaseline = 'middle';
  c.fillStyle = th.bg;
  c.fillRect(pad / 2, pad / 2, c.measureText(text).width + pad * 2, 22 * dpr);
  c.fillStyle = th.text;
  c.fillText(text, pad * 1.5, pad / 2 + 11 * dpr);
  out.toBlob(blob => {
    if (!blob) return;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${state.symbol}_${state.interval}_${fmtDate(Date.now())}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }, 'image/png');
}
function setTool(tool) {
  state.tool = tool; state.pending = null;
  if (tool) state.sel = null;
  updateHint(); draw();
}
function updateHint() {
  const box = $('hint'), btn = $('hintBtn');
  let text = '';
  if (state.tool === 'h') text = '線を置きたい価格をタップ';
  else if (state.tool === 't') text = state.pending ? '終点をタップ' : '始点をタップ';
  else if (state.sel) text = state.sel.type === 't' ? 'ドラッグで移動(端の点で向きを変更)' : 'ドラッグで移動できます';
  box.hidden = !text;
  $('hintText').textContent = text;
  btn.textContent = state.tool ? '中止' : '削除';
  canvas.classList.toggle('placing', !!state.tool);
}
function removeSelected() {
  if (!state.sel) return;
  state.drawings[state.symbol] = curDrawings().filter(d => d !== state.sel);
  state.sel = null;
  save(); updateHint(); draw();
}
// 動かさずに離した(タップ)ときの処理
function handleTap(pos, tol) {
  const pane = panes[0];
  const inMain = pane && pane.vOf && pos.x <= plotW() && pos.y < pane.y + pane.h && state.bars.length;
  if (!state.tool) {
    state.sel = inMain ? hitDrawing(pos, tol) : null;
    updateHint();
    return;
  }
  if (!inMain) return;
  const pt = { t: timeOfIdx(idxAtX(pos.x)), price: pane.vOf(pos.y) };
  // 近くに4本値(始値・高値・安値・終値)があれば、そこにぴったり合わせる
  const bar = state.bars[Math.round(idxAtX(pos.x))];
  if (bar) {
    let best = 8;
    [bar.o, bar.h, bar.l, bar.c].forEach(v => {
      const d = Math.abs(pane.yOf(v) - pos.y);
      if (d < best) { best = d; pt.price = v; }
    });
  }
  if (curDrawings().length >= 200) { toast('線は1銘柄につき200本までです。'); setTool(null); return; }
  if (state.tool === 'h') { curDrawings().push({ type: 'h', p1: pt }); setTool(null); }
  else if (!state.pending) { state.pending = pt; updateHint(); }
  else { curDrawings().push({ type: 't', p1: state.pending, p2: pt }); setTool(null); }
  save();
}

function hoverIndex() {
  const n = state.bars.length;
  if (!n) return -1;
  if (!state.hover) return n - 1;
  return clamp(Math.round(startIdx() + (state.hover.x - state.barW / 2) / state.barW), 0, n - 1);
}
function drawCrosshair(th) {
  const hv = state.hover, pw = plotW();
  if (!hv || !state.bars.length || hv.x > pw || hv.y > H - TIME_H) return;
  const i = hoverIndex(), x = Math.round(xOf(i)) + 0.5;
  ctx.strokeStyle = th.cross; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, 0); ctx.lineTo(x, H - TIME_H);
  ctx.moveTo(0, Math.round(hv.y) + 0.5); ctx.lineTo(pw, Math.round(hv.y) + 0.5);
  ctx.stroke(); ctx.setLineDash([]);

  const pane = panes.find(p => hv.y >= p.y && hv.y < p.y + p.h);
  if (pane && pane.vOf) axisTag(hv.y, pane.fmt(pane.vOf(hv.y)), th.tagBg, th.tagText, pane, true);

  const text = fmtDate(state.bars[i].t, curInterval().ms < 864e5);
  const tw = ctx.measureText(text).width + 12;
  const tx = clamp(x - tw / 2, 0, pw - tw);
  ctx.fillStyle = th.tagBg; ctx.fillRect(tx, H - TIME_H + 2, tw, TIME_H - 4);
  ctx.fillStyle = th.tagText; ctx.textAlign = 'center';
  ctx.fillText(text, tx + tw / 2, H - TIME_H / 2);
}

// ---------------------------------------------------------------- 凡例
const svg = d => `<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  eye: svg('<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>'),
  gear: svg('<circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/>'),
  trash: svg('<path d="M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.7 8.5h6.6l.7-8.5M6.7 7v3.5M9.3 7v3.5"/>'),
  sun: svg('<circle cx="8" cy="8" r="3"/><path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.2 1.2M11.8 11.8L13 13M3 13l1.2-1.2M11.8 4.2L13 3"/>'),
  moon: svg('<path d="M13.5 9.5A6 6 0 0 1 6.5 2.5a6 6 0 1 0 7 7z"/>'),
};
const legendEls = new Map();
let stackEl = null;
function mainStack() {
  if (!stackEl) {
    stackEl = document.createElement('div');
    stackEl.className = 'stack';
    legendsEl.appendChild(stackEl);
  }
  return stackEl;
}
function legendFor(key, ind, parent) {
  let el = legendEls.get(key);
  if (el) return el;
  el = document.createElement('div');
  el.className = 'legend';
  el.innerHTML = '<span class="name"></span><span class="dim params"></span><span class="vals"></span>';
  if (ind) {
    const tools = document.createElement('span');
    tools.className = 'tools';
    [[ICONS.eye, '表示/非表示', () => { ind.hidden = !ind.hidden; save(); draw(); }],
     [ICONS.gear, '設定', () => openDialog(ind)],
     [ICONS.trash, '削除', () => removeIndicator(ind)]].forEach(([icon, label, fn]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.innerHTML = icon; b.title = label; b.setAttribute('aria-label', label);
      b.addEventListener('click', fn);
      tools.appendChild(b);
    });
    el.appendChild(tools);
    el.addEventListener('dblclick', () => openDialog(ind));
    // スマホでは操作ボタンをたたんでおき、「…」で開く
    const moreBtn = document.createElement('button');
    moreBtn.type = 'button'; moreBtn.className = 'more'; moreBtn.textContent = '⋯';
    moreBtn.setAttribute('aria-label', '操作ボタンを表示');
    moreBtn.addEventListener('click', e => {
      e.stopPropagation();
      const open = !el.classList.contains('open');
      legendEls.forEach(x => x.classList.remove('open'));
      el.classList.toggle('open', open);
    });
    el.insertBefore(moreBtn, tools);
  }
  (parent || legendsEl).appendChild(el);
  legendEls.set(key, el);
  return el;
}
function setText(el, sel, text) {
  const t = el.querySelector(sel);
  if (t.textContent !== text) t.textContent = text;
}
function setVals(el, items) {
  const html = items.map(([label, value, color]) =>
    `<span>${label ? `<span class="dim">${esc(label)}</span> ` : ''}<span style="color:${COLOR_RE.test(color) ? color : 'inherit'}">${esc(value)}</span></span>`).join('');
  const t = el.querySelector('.vals');
  if (t.innerHTML !== html) t.innerHTML = html;
}
function updateLegends() {
  const i = hoverIndex(), used = new Set();
  panes.forEach(pane => {
    const key = pane.ind ? 'ind' + pane.ind.id : 'main';
    used.add(key);
    const el = legendFor(key, pane.ind, pane.ind ? null : mainStack());
    if (pane.ind) { el.style.top = (pane.y + 4) + 'px'; el.style.maxWidth = (plotW() - 10) + 'px'; }
    if (!pane.ind) {
      mainStack().style.top = (pane.y + 4) + 'px';
      mainStack().style.maxWidth = (plotW() - 10) + 'px';
      visibleOverlays().forEach(ov => {
        const k = 'ind' + ov.id, le = legendFor(k, ov, mainStack());
        used.add(k);
        le.classList.toggle('off', !!ov.hidden);
        if (IND_TYPES[ov.type].generic) {
          setText(le, '.name', IND_TYPES[ov.type].short);
          setText(le, '.params', ov.out ? ov.out.label : '');
          // ずらして描いている線は、十字線の位置に見えている値を出す
          setVals(le, ov.out && i >= 0 ? ov.out.lines.filter(l => isFinite(l.val[i - (l.offset || 0)]))
            .map(l => [ov.out.lines.length > 1 ? l.name : '', fmtPrice(l.val[i - (l.offset || 0)]), l.color]) : []);
          return;
        }
        setText(le, '.name', 'MA');
        setText(le, '.params', `${ov.p.kind.toUpperCase()} ${ov.p.len}`);
        setVals(le, ov.out && i >= 0 ? [['', fmtPrice(ov.out.val[i]), ov.p.color]] : []);
      });
      setText(el, '.name', `${curSymbol().label} · ${curInterval().label}`);
      const lt = feed.lastTick ? new Date(feed.lastTick) : null;
      setText(el, '.params', state.live
        ? `Binance · ${lt ? `${pad2(lt.getHours())}:${pad2(lt.getMinutes())}:${pad2(lt.getSeconds())} に値動き` : '取引待ち'}`
        : 'デモ');
      el.classList.add('main');
      const b = state.bars[i];
      if (!b) { setVals(el, []); return; }
      const prev = state.bars[i - 1], col = b.c >= b.o ? UP : DOWN;
      const names = compact ? ['始', '高', '安', '終'] : ['始値', '高値', '安値', '終値'];
      // スマホでは、ふだんは終値だけにしてチャートを隠さない。タップして十字線を出したときだけ4本値を出す
      const brief = compact && !state.hover;
      const items = brief ? [['', fmtPrice(b.c), col]] : [b.o, b.h, b.l, b.c].map((v, k) => [names[k], fmtPrice(v), col]);
      if (prev) {
        const d = b.c - prev.c;
        items.push(['', `${d >= 0 ? '+' : ''}${fmtPrice(d, b.c)} (${d >= 0 ? '+' : ''}${(d / prev.c * 100).toFixed(2)}%)`, d >= 0 ? UP : DOWN]);
      }
      if (!brief) items.push(['出来高', fmtCompact(b.v), col]);
      setVals(el, items);
      return;
    }
    const ind = pane.ind, p = ind.p, T = IND_TYPES[ind.type];
    el.classList.toggle('off', !!ind.hidden);
    setText(el, '.name', T.name);
    if (T.simple) {
      setText(el, '.params', ind.out ? ind.out.label : '');
      const one = ind.out && ind.out.lines.length === 1 && !ind.out.hist;
      const items = ind.out && i >= 0 ? ind.out.lines.map(l => [one || l.name === T.name ? '' : l.name, fmtCompact(l.val[i]), l.color]) : [];
      if (ind.out && ind.out.hist && ind.out.histName && i >= 0) {
        const hv = ind.out.hist[i], dir = ind.out.histDir ? ind.out.histDir[i] : hv;
        items.unshift([ind.out.lines.length ? ind.out.histName : '', fmtCompact(hv), dir >= 0 ? UP : DOWN]);
      }
      setVals(el, items);
      return;
    }
    const aggLabel = (AGGS.find(a => a[0] === p.agg) || ['', ''])[1];
    setText(el, '.params', p.statusParams ? `${aggLabel} ${p.maLen} / ${p.volMaLen}` : '');
    const items = [];
    if (p.statusValues && ind.out && i >= 0) {
      const v = ind.out.val[i], m = ind.out.ma[i];
      if (p.showPlot) items.push([T.plotName, fmtCompact(v), v >= m || !isFinite(m) ? p.colAbove : p.colBelow]);
      if (p.showMa) items.push([T.maName, fmtCompact(m), p.signMa && m < (+p.zeroValue || 0) ? p.colMaNeg : p.colMa]);
    }
    setVals(el, items);
  });
  legendEls.forEach((el, key) => {
    if (!used.has(key)) { el.remove(); legendEls.delete(key); }
  });
}

// ---------------------------------------------------------------- インジケーター管理
// 保存されていた設定を、そのまま信用しない。初期値と同じ種類・形の値だけを受け入れる
const COLOR_RE = /^#[0-9a-f]{6}$/i, WORD_RE = /^[A-Za-z0-9_-]{1,24}$/;
const PARAM_RANGE = {
  len: [1, 500], maLen: [1, 500], adLen: [1, 500], volMaLen: [1, 500], fast: [1, 500], slow: [1, 500], signal: [1, 500], pivotLen: [1, 100],
  wick: [0, 1], opAbove: [0.1, 1], opBelow: [0.1, 1], maWidth: [0.5, 5], width: [0.5, 5], weight: [1e-3, 1e5], upper: [0, 100], lower: [0, 100],
};
function cleanParams(base, p, ranges) {
  const out = Object.assign({}, base);
  if (!p || typeof p !== 'object') return out;
  Object.keys(base).forEach(k => {
    const d = base[k], v = p[k];
    if (k === 'vis') return;
    if (typeof d === 'number') {
      if (typeof v !== 'number' || !isFinite(v)) return;
      const r = (ranges && ranges[k]) || PARAM_RANGE[k] || [-1e12, 1e12]; // 極端な値で計算が固まらないよう、範囲に収める
      out[k] = Math.min(r[1], Math.max(r[0], v));
    }
    else if (typeof d === 'boolean') { if (typeof v === 'boolean') out[k] = v; }
    else if (typeof d === 'string') { if (typeof v === 'string' && (COLOR_RE.test(d) ? COLOR_RE : WORD_RE).test(v)) out[k] = v; }
  });
  return out;
}
function addIndicator(type, p, hidden, silent) {
  const base = defaultParams(type);
  const ranges = {};
  if (GT.DEFS[type]) GT.DEFS[type].params.forEach(q => { if (q.min !== undefined) ranges[q.key] = [q.min, q.max]; });
  const merged = cleanParams(base, p, ranges);
  merged.vis = Object.assign({}, base.vis);
  if (p && p.vis && typeof p.vis === 'object') INTERVALS.forEach(iv => { if (typeof p.vis[iv.id] === 'boolean') merged.vis[iv.id] = p.vis[iv.id]; });
  const ind = { id: nextId++, type, hidden: !!hidden, p: merged, out: null };
  state.indicators.push(ind);
  if (!silent) { recompute(); save(); draw(); }
  return ind;
}
function removeIndicator(ind) {
  state.indicators = state.indicators.filter(i => i !== ind);
  save(); draw();
}

// ---------------------------------------------------------------- 設定ダイアログ
const dlg = { ind: null, backup: null, tab: 'params', opener: null };

function openDialog(ind) {
  dlg.ind = ind;
  dlg.backup = JSON.parse(JSON.stringify(ind.p));
  dlg.tab = 'params';
  dlg.opener = document.activeElement;
  $('dlgTitle').textContent = IND_TYPES[ind.type].name;
  document.querySelector('.tab[data-tab="style"]').hidden = !IND_TYPES[ind.type].labels;
  $('overlay').hidden = false;
  renderDialog();
  $('dlgOk').focus();
}
function closeDialog(keep) {
  if (!dlg.ind) return;
  if (!keep) dlg.ind.p = dlg.backup;
  dlg.ind = null;
  $('overlay').hidden = true;
  if (dlg.opener && dlg.opener.isConnected) dlg.opener.focus();
  recompute(); save(); draw();
}
function applyLive() { recompute(); draw(); }

function el(tag, attrs, children) {
  const e = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([k, v]) => {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v);
  });
  (children || []).forEach(c => e.appendChild(c));
  return e;
}
function labelCell(text, hint) {
  const l = el('span', { class: 'lbl', text });
  if (hint) l.appendChild(el('small', { text: hint }));
  return l;
}
function fCheck(key, text, hint, obj) {
  const target = obj || dlg.ind.p;
  const input = el('input', { type: 'checkbox' });
  input.checked = !!target[key];
  input.addEventListener('change', () => { target[key] = input.checked; applyLive(); });
  return el('label', { class: 'check' }, [input, labelCell(text, hint)]);
}
function fSelect(key, text, options, hint) {
  const p = dlg.ind.p;
  const sel = el('select', { class: 'ctl' }, options.map(([v, t]) => el('option', { value: v, text: t })));
  sel.value = p[key];
  sel.addEventListener('change', () => { p[key] = sel.value; applyLive(); });
  return el('label', { class: 'row' }, [labelCell(text, hint), sel]);
}
function fNumber(key, text, min, max, step, hint) {
  const p = dlg.ind.p;
  const input = el('input', { class: 'ctl', type: 'number', min, max, step, inputmode: 'decimal' });
  input.value = p[key];
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    if (!isFinite(v)) return;
    p[key] = clamp(v, min, max); applyLive();
  });
  input.addEventListener('blur', () => { input.value = p[key]; });
  return el('label', { class: 'row' }, [labelCell(text, hint), input]);
}
function fColor(key, text) {
  const p = dlg.ind.p;
  const input = el('input', { type: 'color' });
  input.value = p[key];
  input.addEventListener('input', () => { p[key] = input.value; applyLive(); });
  return el('label', { class: 'row' }, [labelCell(text), input]);
}
function fRange(key, text, min, max, step) {
  const p = dlg.ind.p;
  const input = el('input', { type: 'range', min, max, step });
  input.value = p[key];
  input.addEventListener('input', () => { p[key] = parseFloat(input.value); applyLive(); });
  return el('label', { class: 'row' }, [labelCell(text), input]);
}
function renderDialog() {
  const ind = dlg.ind, T = IND_TYPES[ind.type], L = T.labels || {};
  const body = $('dlgBody');
  body.textContent = '';
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('on', t.dataset.tab === dlg.tab);
    t.setAttribute('aria-selected', String(t.dataset.tab === dlg.tab));
  });
  body.scrollTop = 0;
  const add = (...nodes) => nodes.forEach(nd => body.appendChild(nd));

  if (T.generic && dlg.tab === 'params') {
    if (T.desc) add(el('p', { class: 'msg', text: T.custom ? `式: ${T.desc}` : T.desc }));
    if (T.custom) {
      const edit = el('button', { class: 'ctl btn', type: 'button', text: '式を編集する' });
      edit.addEventListener('click', () => { const id = ind.type; closeDialog(true); openMaker(id); });
      const acts = [edit];
      if (ind.out && ind.out.marks && ind.out.marks.length) {
        const bt = el('button', { class: 'ctl btn', type: 'button', text: '過去データで試す' });
        bt.addEventListener('click', () => { closeDialog(true); openBacktest(ind); });
        acts.push(bt);
      }
      add(el('div', { class: 'mk-actions' }, acts));
      if (ind.out && ind.out.marks && ind.out.marks.length) {
        const chk = fCheck('alert', '合図が出たら知らせる', 'このページを開いている間、足が確定して合図が出たら画面に表示します');
        chk.querySelector('input').addEventListener('change', e => {
          // 別のタブを見ているときにも気づけるよう、ブラウザの通知を使ってよいか尋ねる(断っても画面には出ます)
          try { if (e.target.checked && window.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch (err) { /* 通知が使えない環境 */ }
        });
        add(chk);
      }
    }
    GT.DEFS[ind.type].params.forEach(q => {
      if (q.type === 'color') add(fColor(q.key, q.label));
      else if (q.type === 'source') add(fSelect(q.key, q.label, SOURCES));
      else if (q.type === 'select') add(fSelect(q.key, q.label, q.options, q.hint));
      else add(fNumber(q.key, q.label, q.min, q.max, q.type === 'int' ? 1 : q.step, q.hint));
    });
  } else if (ind.type === 'ma' && dlg.tab === 'params') {
    add(
      fSelect('kind', '種類', MA_KINDS),
      fNumber('len', '期間', 1, 500, 1, '何本分の足を平均するか'),
      fSelect('source', 'ソース', SOURCES),
      fColor('color', '線の色'),
      fNumber('width', '線の太さ', 0.5, 5, 0.5)
    );
  } else if (ind.type === 'rsi' && dlg.tab === 'params') {
    add(
      fNumber('len', '期間', 1, 500, 1),
      fSelect('source', 'ソース', SOURCES),
      fNumber('upper', '上の基準線', 50, 100, 1, 'これより上は「買われすぎ」の目安'),
      fNumber('lower', '下の基準線', 0, 50, 1, 'これより下は「売られすぎ」の目安'),
      fColor('color', '線の色')
    );
  } else if (ind.type === 'macd' && dlg.tab === 'params') {
    add(
      fNumber('fast', '短期の期間', 1, 500, 1),
      fNumber('slow', '長期の期間', 1, 500, 1),
      fNumber('signal', 'シグナルの期間', 1, 500, 1),
      fSelect('source', 'ソース', SOURCES),
      fColor('colMacd', 'MACD の色'),
      fColor('colSignal', 'シグナルの色')
    );
  } else if (dlg.tab === 'params') {
    add(
      fCheck('baseline', 'Baseline Chart', 'オン:ゼロラインからの面グラフ/オフ:棒グラフ'),
      fSelect('agg', 'Aggregation', AGGS, '足ごとの値をどうならすか'),
      fNumber('maLen', 'Moving Average Length', 1, 500, 1),
      fCheck('money', 'Show Money Volume (Price x Volume)', '出来高に価格を掛けて金額ベースにする'),
      fSelect('source', 'ソース', SOURCES),
      fSelect('norm', 'Normalize by', NORMS, '値動きの強さを何で割ってそろえるか'),
      fNumber('wick', 'Wick Weight', 0, 1, 0.1, '0〜1。大きいほどヒゲ(足の中の終値の位置)を重視'),
      fNumber('adLen', 'SMA Length for A/D Moving Average', 1, 500, 1, 'Aggregation が「累積 (A/D)」のときに使用'),
      fNumber('volMaLen', L.volMaLen, 1, 500, 1),
      fColor('colAbove', L.colAbove),
      fColor('colBelow', L.colBelow),
      fColor('colMa', L.colMa)
    );
    if (L.colMaNeg) add(fColor('colMaNeg', L.colMaNeg));
  } else if (dlg.tab === 'style') {
    add(
      fCheck('showPlot', T.plotName),
      fRange('opAbove', '色 0 の濃さ(SMA より上)', 0.1, 1, 0.05),
      fRange('opBelow', '色 1 の濃さ(SMA より下)', 0.1, 1, 0.05),
      fCheck('pivots', '山と谷の丸印'),
      fNumber('pivotLen', '山・谷の判定に使う前後の本数', 1, 100, 1),
      fCheck('showMa', T.maName),
      fNumber('maWidth', '線の太さ', 0.5, 5, 0.5),
      fCheck('showZero', 'ゼロライン'),
      fColor('zeroColor', 'ゼロラインの色'),
      fNumber('zeroValue', 'ゼロラインの値', -1e12, 1e12, 'any'),
      el('div', { class: 'sect', text: 'アウトプット値' }),
      fCheck('axisLabel', '価格スケールのラベル'),
      fCheck('statusValues', 'ステータスラインの値'),
      el('div', { class: 'sect', text: 'パラメーター値' }),
      fCheck('statusParams', 'ステータスラインのパラメーター値')
    );
  } else {
    add(el('div', { class: 'sect', text: 'このインジケーターを表示する時間足' }));
    add(el('div', { class: 'grid2' }, INTERVALS.map(iv => fCheck(iv.id, iv.label, '', ind.p.vis))));
  }
}

// ---------------------------------------------------------------- 上部バー
function buildTopbar() {
  const sel = $('symbol');
  const fillSymbols = () => {
    sel.textContent = '';
    SYMBOLS.forEach(s => sel.appendChild(el('option', { value: s.id, text: s.label })));
    sel.appendChild(el('option', { value: '__add', text: '🔍 すべての銘柄から探す…' }));
    sel.value = state.symbol;
  };
  fillSymbols();
  // 銘柄の追加:実際にデータが取れるか確かめてから一覧に入れる
  const symOv = $('symOverlay'), symIn = $('symInput'), symMsg = $('symMsg'), symOk = $('symOk');
  const closeSym = () => { symOv.hidden = true; sel.focus(); };
  const fillCustom = () => {
    const box = $('symList');
    box.textContent = '';
    const mine = SYMBOLS.slice(BUILTIN);
    if (mine.length) box.appendChild(el('div', { class: 'sect', text: '追加した銘柄' }));
    mine.forEach(s => {
      const del = el('button', { type: 'button', class: 'ctl btn small', text: '削除' });
      del.setAttribute('aria-label', `${s.label} を一覧から削除`);
      del.addEventListener('click', () => {
        SYMBOLS.splice(SYMBOLS.indexOf(s), 1);
        delete state.drawings[s.id];
        const wasCurrent = state.symbol === s.id;
        if (wasCurrent) state.symbol = SYMBOLS[0].id;
        fillSymbols(); fillCustom(); save();
        if (wasCurrent) { state.sel = null; setTool(null); loadData(); }
      });
      box.appendChild(el('div', { class: 'row' }, [el('span', { class: 'lbl', text: s.label }), del]));
    });
  };
  const addSymbol = async () => {
    const id = symIn.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (id.length < 5) { symMsg.textContent = '「DOGEUSDT」のように、通貨ペアを続けて入力してください。'; return; }
    if (!SYMBOLS.some(x => x.id === id)) {
      symOk.disabled = true; symMsg.textContent = '確認中…';
      try { await fetchKlines(id, '1d', 1); } catch (e) {
        symMsg.textContent = `「${id}」のデータを取得できませんでした。つづりを確認してください(通信できないときも追加できません)。`;
        symOk.disabled = false;
        return;
      }
      symOk.disabled = false;
      // 決済通貨が分からないと、どの口座で取引するか決められない
      if (!prettySymbol(id).includes('/')) { symMsg.textContent = `「${id}」の決済通貨を判別できませんでした。一覧が読み込めるときに、一覧から選んでください。`; return; }
      if (SYMBOLS.length - BUILTIN >= 100) { symMsg.textContent = '追加できる銘柄は100個までです。'; return; }
      SYMBOLS.push({ id, label: prettySymbol(id), base: 100, quote: prettySymbol(id).split('/')[1] });
    }
    state.symbol = id; state.sel = null;
    fillSymbols(); closeSym(); setTool(null); save(); loadData();
  };
  // 全銘柄からの検索
  const QUOTE_ORDER = ['USDT', 'JPY', 'USDC', 'FDUSD', 'BTC', 'ETH', 'EUR'];
  const rank = q => { const k = QUOTE_ORDER.indexOf(q); return k < 0 ? 99 : k; };
  let chip = '';
  const pick = u => {
    if (!SYMBOLS.some(x => x.id === u.id)) {
      if (SYMBOLS.length - BUILTIN >= 100) { symMsg.textContent = '追加できる銘柄は100個までです。使っていないものを削除してください。'; return; }
      SYMBOLS.push({ id: u.id, label: `${u.base}/${u.quote}`, base: 100, quote: u.quote });
    }
    state.symbol = u.id; state.sel = null;
    fillSymbols(); closeSym(); setTool(null); save(); loadData();
    sel.dispatchEvent(new Event('symbolpicked'));
  };
  const searchUniverse = () => {
    if (!universe) return [];
    const text = symIn.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const score = u => (u.base === text ? 0 : u.base.startsWith(text) ? 1 : u.id.startsWith(text) ? 2 : u.id.includes(text) ? 3 : 9);
    return universe
      .filter(u => (!chip || u.quote === chip) && (!text || score(u) < 9))
      .sort((x, y) => (text ? score(x) - score(y) : 0) || rank(x.quote) - rank(y.quote) || x.base.localeCompare(y.base));
  };
  const fillResults = () => {
    const box = $('symResults'), chips = $('symChips');
    box.textContent = ''; chips.textContent = '';
    if (!universe) return;
    [['', 'すべて']].concat(QUOTE_ORDER.map(q => [q, q])).forEach(([q, label]) => {
      const b = el('button', { type: 'button', text: label });
      b.classList.toggle('on', chip === q);
      b.setAttribute('aria-pressed', String(chip === q));
      b.addEventListener('click', () => { chip = q; fillResults(); });
      chips.appendChild(b);
    });
    const found = searchUniverse();
    symMsg.textContent = found.length
      ? `${found.length.toLocaleString()} 件(全 ${universe.length.toLocaleString()} 銘柄)${found.length > 80 ? '。上位 80 件を表示中 — 名前を入力して絞り込めます' : ''}`
      : '見つかりませんでした。別の名前を試してください。';
    found.slice(0, 80).forEach(u => {
      const b = el('button', { type: 'button' }, [
        el('span', { text: `${u.base}/${u.quote}` }),
        el('small', { text: SYMBOLS.some(x => x.id === u.id) ? '一覧にあります' : '' }),
      ]);
      b.addEventListener('click', () => pick(u));
      box.appendChild(b);
    });
  };
  const openPicker = () => {
    symIn.value = ''; symMsg.textContent = ''; chip = '';
    fillCustom(); fillResults();
    symOk.hidden = !!universe;
    symOv.hidden = false; symIn.focus();
    if (universe) return;
    symMsg.textContent = '銘柄の一覧を読み込み中…';
    loadUniverse().then(() => {
      if (symOv.hidden) return;
      symOk.hidden = true; fillResults();
    }).catch(() => {
      if (!symOv.hidden) symMsg.textContent = '一覧を取得できませんでした。「DOGEUSDT」のように名前を入力して「追加」を押すと、直接追加できます。';
    });
  };
  symIn.addEventListener('input', () => { if (universe) fillResults(); });
  symOk.addEventListener('click', addSymbol);
  symIn.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const first = universe && searchUniverse()[0];
    if (first) pick(first); else if (!universe) addSymbol();
  });
  $('symCancel').addEventListener('click', closeSym);
  symOv.addEventListener('pointerdown', e => { if (e.target === symOv) closeSym(); });
  sel.addEventListener('change', () => {
    if (sel.value === '__add') {
      sel.value = state.symbol;
      openPicker();
      return;
    }
    state.symbol = sel.value; save(); loadData();
  });

  const seg = $('intervals');
  INTERVALS.forEach(iv => {
    const b = el('button', { type: 'button', text: iv.label });
    b.classList.toggle('on', iv.id === state.interval);
    b.setAttribute('aria-pressed', String(iv.id === state.interval));
    b.addEventListener('click', () => {
      if (state.interval === iv.id) return;
      state.interval = iv.id;
      [...seg.children].forEach(c => { c.classList.toggle('on', c === b); c.setAttribute('aria-pressed', String(c === b)); });
      save(); loadData();
    });
    seg.appendChild(b);
  });

  const menu = $('indMenu'), btn = $('indBtn');
  const hints = {
    ccOnly: '値動きの向きと強さで重みづけした出来高',
    enhanced: '上の値に、ゼロ上下で色が変わる SMA 線を追加',
    ma: 'ローソク足に重ねる平均線。何本でも追加できます',
    rsi: '買われすぎ・売られすぎの目安(0〜100)',
    macd: '2本の平均線の差で、流れの強さと向きを見る',
  };
  let menuQuery = '';
  const fillIndMenu = () => {
    menu.textContent = '';
    const search = el('input', { class: 'ctl menu-search', type: 'search', placeholder: '名前で探す(例: RSI)', 'aria-label': 'インジケーターを探す' });
    search.value = menuQuery;
    const list = el('div', { class: 'menu-list' });
    menu.appendChild(search); menu.appendChild(list);
    const fillList = () => {
      list.textContent = '';
      const q = menuQuery.trim().toLowerCase();
      let shown = 0;
      const row = (type, T) => {
        const b = el('button', { type: 'button', class: 'menu-main', text: T.name }, []);
        b.appendChild(el('small', { text: `${T.overlay ? 'チャートに重ねる' : '下に表示'} ・ ${T.desc || hints[type]}` }));
        b.addEventListener('click', () => {
          toggleMenu(false);
          if (state.indicators.length >= 30) { toast('インジケーターは30個までです。使っていないものを削除してから追加してください。'); return; }
          addIndicator(type);
        });
        const on = favs.includes(type);
        const star = el('button', { type: 'button', class: 'menu-side' + (on ? ' on' : ''), text: on ? '★' : '☆', 'aria-label': `${T.name} を「よく使う」${on ? 'から外す' : 'に入れる'}`, 'aria-pressed': String(on) });
        star.addEventListener('click', e => {
          e.stopPropagation();
          const at = favs.indexOf(type);
          if (at >= 0) favs.splice(at, 1); else favs.push(type);
          save();
          const top = list.scrollTop, before = list.scrollHeight;
          fillList();
          list.scrollTop = top + (list.scrollHeight - before); // 上に行が増減しても、見ている位置を動かさない
        });
        const kids = [b];
        if (T.custom) {
          const edit = el('button', { type: 'button', class: 'menu-side', text: '✎', 'aria-label': `${T.name} を編集` });
          edit.addEventListener('click', e => { e.stopPropagation(); toggleMenu(false); openMaker(type); });
          kids.push(edit);
        }
        kids.push(star);
        return el('div', { class: 'menu-row' }, kids);
      };
      if (!q) {
        const mine = favs.filter(t => IND_TYPES[t]);
        if (mine.length) list.appendChild(el('div', { class: 'sect', text: 'よく使う(★)' }));
        mine.forEach(t => list.appendChild(row(t, IND_TYPES[t])));
      }
      GT.GROUPS.forEach(([gid, gname]) => {
        const types = Object.entries(IND_TYPES).filter(([type, T]) => T.group === gid &&
          (!q || `${T.name} ${T.short || ''} ${type} ${T.desc || hints[type] || ''}`.toLowerCase().includes(q)));
        if (!types.length) return;
        list.appendChild(el('div', { class: 'sect', text: gname }));
        types.forEach(([type, T]) => { list.appendChild(row(type, T)); shown++; });
      });
      if (!shown) list.appendChild(el('div', { class: 'sect', text: '見つかりませんでした。別の言葉で探してください。' }));
      if (q) return;
      list.appendChild(el('div', { class: 'sect', text: '新しく作る' }));
      const mkBtn = el('button', { type: 'button', class: 'mk-new', text: '＋ 自分で作る' }, []);
      mkBtn.appendChild(el('small', { text: '式を書くだけで、オリジナルのインジケーターを作れます(見本つき)' }));
      mkBtn.addEventListener('click', () => { toggleMenu(false); openMaker(null); });
      list.appendChild(mkBtn);
      // この時間足で非表示にしているものは凡例が出ないので、ここから設定を開けるようにする
      const off = state.indicators.filter(i => !shownHere(i));
      if (off.length) list.appendChild(el('div', { class: 'sect', text: 'この時間足では非表示のもの' }));
      off.forEach(ind => {
        const b = el('button', { type: 'button', text: IND_TYPES[ind.type].name }, []);
        b.appendChild(el('small', { text: '設定を開いて「可視性」で表示に戻せます' }));
        b.addEventListener('click', () => { toggleMenu(false); openDialog(ind); dlg.tab = 'vis'; renderDialog(); });
        list.appendChild(b);
      });
    };
    search.addEventListener('input', () => { menuQuery = search.value; fillList(); });
    fillList();
  };
  const toggleMenu = on => {
    if (on) fillIndMenu();
    menu.hidden = !on; btn.setAttribute('aria-expanded', String(on));
  };
  btn.addEventListener('click', e => { e.stopPropagation(); toggleMenu(menu.hidden); });
  document.addEventListener('click', e => {
    if (!menu.contains(e.target)) toggleMenu(false);
    if (!e.target.closest('.legend')) legendEls.forEach(x => x.classList.remove('open'));
  });

  const dMenu = $('drawMenu'), dBtn = $('drawBtn');
  const toggleDraw = on => { dMenu.hidden = !on; dBtn.setAttribute('aria-expanded', String(on)); };
  [['水平線', '決めた価格に横線を引く', () => setTool('h')],
   ['トレンドライン', '2点を結ぶ線を引く', () => setTool('t')],
   ['線をすべて削除', 'この銘柄に引いた線を全部消す', () => { state.drawings[state.symbol] = []; state.sel = null; save(); setTool(null); }],
   ['画像として保存', 'いまのチャートを PNG 画像でダウンロード', () => { state.hover = null; render(); saveImage(); }],
   ['使い方', '画面の動かし方と、主な機能の場所', () => openHelp()],
   ['教科書を読む', '銘柄・インジケーター・手法・資金管理の解説', () => { location.href = 'guide.html'; }],
  ].forEach(([name, hint, fn]) => {
    const b = el('button', { type: 'button', text: name });
    b.appendChild(el('small', { text: hint }));
    b.addEventListener('click', () => { toggleDraw(false); fn(); });
    dMenu.appendChild(b);
  });
  dBtn.addEventListener('click', e => { e.stopPropagation(); toggleMenu(false); toggleDraw(dMenu.hidden); });
  btn.addEventListener('click', () => toggleDraw(false));
  document.addEventListener('click', e => { if (!dMenu.contains(e.target)) toggleDraw(false); });
  $('hintBtn').addEventListener('click', () => { if (state.tool) setTool(null); else removeSelected(); });
  sel.addEventListener('change', () => { state.sel = null; setTool(null); });

  const paintTheme = () => {
    document.documentElement.dataset.theme = state.theme;
    $('themeBtn').innerHTML = state.theme === 'light' ? ICONS.moon : ICONS.sun;
  };
  paintTheme();
  $('themeBtn').addEventListener('click', () => {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    paintTheme(); save(); draw();
  });
  $('retryBtn').addEventListener('click', loadData);
  $('toLatest').addEventListener('click', () => { state.end = state.bars.length + 5; draw(); });

  document.querySelectorAll('.tab').forEach(t =>
    t.addEventListener('click', () => { dlg.tab = t.dataset.tab; renderDialog(); }));
  $('dlgOk').addEventListener('click', () => closeDialog(true));
  $('dlgCancel').addEventListener('click', () => closeDialog(false));
  $('dlgClose').addEventListener('click', () => closeDialog(false));
  $('dlgReset').addEventListener('click', () => {
    const w = dlg.ind.p.weight;
    dlg.ind.p = defaultParams(dlg.ind.type);
    if (w) dlg.ind.p.weight = w;
    renderDialog(); applyLive();
  });
  $('overlay').addEventListener('pointerdown', e => { if (e.target === $('overlay')) closeDialog(false); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!$('btOverlay').hidden) { $('btOverlay').hidden = true; return; }
    if (!$('mkOverlay').hidden) { closeMaker(); return; }
    closeDialog(false); toggleMenu(false); toggleDraw(false);
    if (!symOv.hidden) closeSym();
    if (state.tool || state.sel) { state.sel = null; setTool(null); }
  });
}

// ---------------------------------------------------------------- 操作
function zoomAt(x, factor) {
  const idx = startIdx() + x / state.barW;
  const bw = clamp(state.barW * factor, 1.5, 60);
  state.end = idx - x / bw + plotW() / bw;
  state.barW = bw;
}
// ペインの境目(上のペインの番号)を返す。なければ -1
function dividerAt(y, tol) {
  for (let k = 0; k < panes.length - 1; k++) {
    if (Math.abs(y - (panes[k].y + panes[k].h)) <= tol) return k;
  }
  return -1;
}
function paneWeight(k, v) {
  const ind = panes[k].ind;
  if (v === undefined) return ind ? ind.p.weight || 1 : state.mainWeight;
  if (ind) ind.p.weight = v; else state.mainWeight = v;
}
function bindPointer() {
  const pts = new Map();
  let pinch = 0, resizing = null, moved = 0, dragD = null, dragT = null;
  const pos = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    const p = pos(e);
    pts.set(e.pointerId, p);
    moved = 0;
    const k = pts.size === 1 ? dividerAt(p.y, e.pointerType === 'mouse' ? 4 : 12) : -1;
    if (k >= 0) {
      // 高さの比率をいったんピクセルにそろえてから、境目の上下だけ動かす
      panes.forEach((pn, j) => paneWeight(j, pn.h));
      resizing = { k, y: p.y, a: panes[k].h, b: panes[k + 1].h };
      state.hover = null;
    } else if (pts.size === 1 && !state.tool && (dragT = tradeLineAt(p, e.pointerType === 'mouse' ? 5 : 14))) {
      // 利確・損切り・指値の線をつかんだ:チャートは動かさず、線だけ動かす
      resizing = null;
      state.dragLine = Object.assign({}, dragT);
      state.hover = null;
    } else if (pts.size === 1 && !state.tool && state.sel && hitDrawing(p, e.pointerType === 'mouse' ? 6 : 16) === state.sel) {
      // 選択中の線をつかんだ:チャートは動かさず、線だけ動かす
      resizing = null;
      const tol = e.pointerType === 'mouse' ? 8 : 18;
      let keys = ['p1', 'p2'];
      if (state.sel.type === 't') {
        // 端の点をつかんだときは、その点だけ動かす(向きや長さを変えられる)
        const ends = drawingPoints(state.sel, panes[0]);
        const k = ends.findIndex(q => Math.hypot(q.x - p.x, q.y - p.y) <= tol);
        if (k >= 0) keys = [k ? 'p2' : 'p1'];
      }
      dragD = { start: p, keys, orig: JSON.parse(JSON.stringify(state.sel)) };
    } else {
      resizing = null;
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
      state.hover = p;
      canvas.classList.add('grabbing');
    }
    draw();
  });
  canvas.addEventListener('pointermove', e => {
    const p = pos(e), prev = pts.get(e.pointerId);
    if (resizing && prev) {
      const d = clamp(p.y - resizing.y, 48 - resizing.a, resizing.b - 48);
      paneWeight(resizing.k, resizing.a + d);
      paneWeight(resizing.k + 1, resizing.b - d);
      draw();
      return;
    }
    if (dragT && prev) {
      const pane = panes[0];
      moved += Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y);
      pts.set(e.pointerId, p);
      state.dragLine.price = pane.vOf(clamp(p.y, pane.y + 2, pane.y + pane.h - 2));
      draw();
      return;
    }
    if (dragD && prev) {
      const pane = panes[0], d = state.sel, o = dragD.orig;
      moved += Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y);
      pts.set(e.pointerId, p);
      const dv = pane.vOf(p.y) - pane.vOf(dragD.start.y);
      const di = Math.round((p.x - dragD.start.x) / state.barW);
      dragD.keys.forEach(k => {
        if (!o[k]) return;
        d[k].price = o[k].price + dv;
        if (d.type === 't') d[k].t = timeOfIdx(Math.round(idxOfTime(o[k].t)) + di);
      });
      draw();
      return;
    }
    if (prev && pts.size === 1) {
      moved += Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y);
      state.end -= (p.x - prev.x) / state.barW;
      pts.set(e.pointerId, p);
    } else if (prev && pts.size === 2) {
      moved += 10;
      pts.set(e.pointerId, p);
      const [a, b] = [...pts.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0 && dist > 0) zoomAt((a.x + b.x) / 2, dist / pinch);
      pinch = dist;
    } else if (!prev && e.pointerType === 'mouse') {
      canvas.style.cursor = dividerAt(p.y, 4) >= 0 || tradeLineAt(p, 5) ? 'ns-resize' : '';
    }
    state.hover = p; draw();
  });
  const up = e => {
    pts.delete(e.pointerId); pinch = 0;
    const special = !!resizing || (dragD && moved > 8) || !!dragT;
    if (dragT) {
      if (moved > 4 && e.type === 'pointerup') commitLine(state.dragLine);
      dragT = null; state.dragLine = null;
    }
    if (resizing) { resizing = null; save(); }
    if (dragD) { dragD = null; save(); }
    if (!special && moved <= 8 && e.type === 'pointerup' && !pts.size) {
      handleTap(pos(e), e.pointerType === 'mouse' ? 6 : 16);
    }
    if (!pts.size) canvas.classList.remove('grabbing');
    // タッチ操作:タップなら十字線を残し、スワイプ後は消す
    if (e.pointerType !== 'mouse' && (e.type !== 'pointerup' || moved > 8)) state.hover = null;
    draw();
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', e => { if (!pts.size && e.pointerType === 'mouse') { state.hover = null; draw(); } });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const p = pos(e);
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) state.end += e.deltaX / state.barW;
    else zoomAt(Math.min(p.x, plotW()), Math.exp(-e.deltaY * 0.0015));
    draw();
  }, { passive: false });
  canvas.addEventListener('dblclick', e => {
    const k = dividerAt(pos(e).y, 4);
    if (k >= 0) { state.mainWeight = 2.6; state.indicators.forEach(i => { i.p.weight = 1; }); save(); }
    else resetViewport();
    draw();
  });
  canvas.addEventListener('keydown', e => {
    const span = plotW() / state.barW;
    if (e.key === 'ArrowLeft') state.end -= Math.max(1, span * 0.1);
    else if (e.key === 'ArrowRight') state.end += Math.max(1, span * 0.1);
    else if (e.key === 'ArrowUp' || e.key === '+') zoomAt(plotW(), 1.2);
    else if (e.key === 'ArrowDown' || e.key === '-') zoomAt(plotW(), 1 / 1.2);
    else if (e.key === 'End') state.end = state.bars.length + 5;
    else if (e.key === 'Home') state.end = 0;
    else if ((e.key === 'Delete' || e.key === 'Backspace') && state.sel) removeSelected();
    else return;
    e.preventDefault(); draw();
  });
}

// ---------------------------------------------------------------- デモトレード
/* 仮想資金での売買の練習。口座は決済通貨(USDT、JPY など)ごとに持つ。
 * レバレッジなし:建てられる金額は「使える金額」まで。 */
const TRADE_KEY = 'gold-trade-paper-v1';
const FEE = 0.001; // 売買金額に対する手数料の割合(0.1%)
const START_CASH = { JPY: 1000000, BTC: 1, ETH: 10, BNB: 20, TRY: 300000, IDR: 150000000, BRL: 50000 };
const freshTrade = () => ({ rev: 0, accounts: {}, positions: {}, history: [], orders: [], last: {}, quotes: {}, seen: {} });
const cleanNote = v => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120) : '');
const SYM_RE = /^[A-Z0-9]{5,20}$/, CUR_RE = /^[A-Z0-9]{1,8}$/;
const fin = v => typeof v === 'number' && isFinite(v);
// 保存されていた取引データを読み込む。形のおかしい項目は捨てる(画面に埋め込む文字列もここで絞る)
function loadTradeState() {
  const out = freshTrade();
  let t = null;
  try { t = JSON.parse(localStorage.getItem(TRADE_KEY)); } catch (e) { t = null; }
  if (!t || typeof t !== 'object') return out;
  const each = (obj, fn) => { if (obj && typeof obj === 'object') Object.keys(obj).forEach(k => fn(k, obj[k])); };
  if (fin(t.rev) && t.rev >= 0) out.rev = t.rev;
  each(t.accounts, (q, v) => { if (CUR_RE.test(q) && v && fin(v.cash) && fin(v.start) && v.start > 0) out.accounts[q] = { cash: v.cash, start: v.start }; });
  each(t.quotes, (s, q) => { if (SYM_RE.test(s) && typeof q === 'string' && CUR_RE.test(q)) out.quotes[s] = q; });
  each(t.last, (s, v) => { if (SYM_RE.test(s) && fin(v) && v > 0) out.last[s] = v; });
  each(t.seen, (s, v) => { if (SYM_RE.test(s) && fin(v)) out.seen[s] = v; });
  const level = v => (fin(v) && v > 0 ? v : null);
  each(t.positions, (s, v) => {
    if (!SYM_RE.test(s) || !v || !fin(v.qty) || v.qty === 0 || !fin(v.avg) || !(v.avg > 0)) return;
    const opened = fin(v.opened) ? v.opened : Date.now();
    out.positions[s] = {
      qty: v.qty, avg: v.avg, tp: level(v.tp), sl: level(v.sl), opened,
      id: fin(v.id) ? v.id : opened, levelsAt: fin(v.levelsAt) ? v.levelsAt : opened, feeOpen: fin(v.feeOpen) && v.feeOpen >= 0 ? v.feeOpen : 0,
    };
  });
  if (Array.isArray(t.orders)) {
    t.orders.slice(0, 20).forEach(o => {
      if (!o || !SYM_RE.test(o.sym) || !fin(o.price) || !(o.price > 0) || !fin(o.notional) || !(o.notional > 0) || !fin(o.id)) return;
      out.orders.push({ id: o.id, sym: o.sym, side: o.side === 'sell' ? 'sell' : 'buy', price: o.price, notional: o.notional, tp: level(o.tp), sl: level(o.sl), t: fin(o.t) ? o.t : 0, note: cleanNote(o.note) });
    });
  }
  if (Array.isArray(t.history)) {
    t.history.slice(0, 3000).forEach(h => {
      if (!h || !SYM_RE.test(h.sym) || !fin(h.t) || !fin(h.qty) || !fin(h.price) || !fin(h.fee)) return;
      out.history.push({
        t: h.t, sym: h.sym, side: h.side === 'sell' ? 'sell' : 'buy', qty: h.qty, price: h.price, fee: h.fee,
        pnl: fin(h.pnl) ? h.pnl : null, reason: ['tp', 'sl', 'liq', 'limit'].includes(h.reason) ? h.reason : 'manual', away: !!h.away, note: cleanNote(h.note),
        feeIn: fin(h.feeIn) && h.feeIn >= 0 ? h.feeIn : 0, pid: fin(h.pid) ? h.pid : null,
      });
    });
  }
  return out;
}
let T = loadTradeState();
// 保存されている内容を取り込む。いま見ている銘柄の価格と確認時刻は、このタブのほうが新しいので残す
function adoptStored() {
  const mine = T, sym = state.symbol;
  T = loadTradeState();
  if (mine.last[sym] > 0) T.last[sym] = mine.last[sym];
  if (fin(mine.seen[sym])) T.seen[sym] = Math.max(mine.seen[sym], T.seen[sym] || 0);
}
const storedRev = () => {
  try { const t = JSON.parse(localStorage.getItem(TRADE_KEY)); return t && fin(t.rev) ? t.rev : -1; } catch (e) { return -1; }
};
// ほかのタブのほうが新しい内容を持っていたら、先にそれを取り込む
function syncIfStale() {
  if (storedRev() > T.rev) { adoptStored(); return true; }
  return false;
}
// 別のタブで取引したら、こちらのタブも同じ内容に合わせる(古い内容で上書きして、決済済みのポジションが復活するのを防ぐ)
window.addEventListener('storage', e => {
  if (e.key !== TRADE_KEY) return;
  adoptStored();
  renderTrade(); draw();
});
// 「戻る」で復元されたページは、その間のほかのタブの変更を知らないので、取り込み直す
window.addEventListener('pageshow', e => { if (e.persisted) { adoptStored(); renderTrade(); draw(); } });
function saveTrade() {
  // 自分より新しい内容が保存されていたら、上書きせずに取り込む
  if (syncIfStale()) { renderTrade(); return false; }
  T.rev++;
  try { localStorage.setItem(TRADE_KEY, JSON.stringify(T)); } catch (e) { /* 保存できなくても続ける */ }
  return true;
}
function quoteOf(id) {
  if (T.quotes[id]) return T.quotes[id];           // 取引したときに記録した決済通貨
  const s = SYMBOLS.find(x => x.id === id);
  if (s && s.quote) return s.quote;                // 全銘柄の一覧から選んだもの
  const l = prettySymbol(id);
  return l.includes('/') ? l.split('/')[1] : 'USDT';
}
const labelOf = id => {
  const s = SYMBOLS.find(x => x.id === id);
  if (s) return s.label;
  const q = T.quotes[id];
  return q && id.endsWith(q) ? `${id.slice(0, -q.length)}/${q}` : prettySymbol(id);
};
function acct(q) {
  if (!T.accounts[q]) { const c = START_CASH[q] || 10000; T.accounts[q] = { cash: c, start: c }; }
  return T.accounts[q];
}
function unrealized(sym) {
  const p = T.positions[sym], px = T.last[sym];
  return p && px > 0 ? p.qty * (px - p.avg) : 0;
}
/* 口座の状態。
 * 使える金額 = 評価額 − 保有分の時価。含み益を元手に買い増して、実質的にレバレッジをかけることはできない。
 * 価格を最新にできていない銘柄は、含み益を数えない(含み損だけ数える)。古い価格の含み益で余力が水増しされるのを防ぐ。 */
function acctStats(q) {
  let u = 0, uSafe = 0, margin = 0;
  Object.keys(T.positions).forEach(sym => {
    if (quoteOf(sym) !== q) return;
    const p = T.positions[sym], ui = unrealized(sym), last = T.last[sym] > 0 ? T.last[sym] : p.avg;
    u += ui;
    uSafe += priceOk(sym) ? ui : Math.min(ui, 0);
    margin += Math.abs(p.qty) * Math.max(p.avg, last);
  });
  const a = acct(q);
  return { cash: a.cash, equity: a.cash + u, avail: Math.max(0, a.cash + uSafe - margin), start: a.start };
}
function fmtMoney(v, q, signed) {
  if (!isFinite(v)) return '—';
  const dg = q === 'JPY' ? 0 : q === 'BTC' || q === 'ETH' ? 6 : 2;
  const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: dg, maximumFractionDigits: dg });
  return (v < 0 ? '-' : signed ? '+' : '') + s;
}
const fmtQty = v => {
  const a = Math.abs(v);
  return a >= 1000 ? fmtCompact(a) : a.toLocaleString('en-US', { maximumSignificantDigits: 6 });
};
const pnlClass = v => (v > 0 ? 'up' : v < 0 ? 'down' : '');
// 1回の決済の損益。決済時の手数料に加えて、買ったとき(建てたとき)の手数料の按分も引く
const netOf = h => h.pnl - h.fee - (h.feeIn || 0);

// その銘柄の価格が「いまの価格」だと言えるか。古い価格での売買(後出し)を防ぐ
const otherFresh = {}; // 表示していない銘柄の価格を、最後に取りにいった時刻(経過時間)
const dead = {};       // 取引所から「存在しない」と返ってきた銘柄(上場廃止など)
// 価格が取れなかった銘柄が、取引所の「取引中の一覧」に載っていなければ、上場廃止などで消えたものとみなす
// (通信が切れているだけの場合は、一覧に載っているので、消えた扱いにはならない)
function markDeadIfUnlisted(sym) {
  loadUniverse().then(list => {
    if (list.some(x => x.id === sym)) return;
    dead[sym] = true;
    renderTrade();
  }).catch(() => { /* 一覧が取れないときは判断しない */ });
}
function priceOk(sym) {
  if (sym !== state.symbol) return mono() - (otherFresh[sym] === undefined ? -1e9 : otherFresh[sym]) < 60000;
  return state.live && !state.loading && state.bars.length > 0 && mono() - feed.okAt < 8000;
}
/* 注文を約定させる。成功なら null、できないときは理由の文を返す。
 * qty を渡すと、その数量ちょうどで約定する(決済用)。
 * opts.price / opts.t: 過去に利確・損切りに届いていた場合などの、決まった約定価格と時刻。
 * opts.away === false: 「不在中の決済」の印を付けない。 */
function execute(sym, side, notional, reason, qty, opts) {
  const fixed = !!(opts && opts.price > 0);
  if (!fixed) {
    syncIfStale();
    if (!priceOk(sym)) return '価格を最新の状態にできていないため、いまは売買できません。数秒待ってから、もう一度お試しください。';
    // 閉じていた間の利確・損切りの確認が済むまでは、売買させない(先に買い増したり、条件を変えたりできないようにする)
    if (reconciled[sym] !== true || !clockReady) return '開いていなかった間の値動きを確認しています。数秒待ってから、もう一度お試しください。';
  }
  // 気配値が取れているときは、買いは売り注文の価格(ask)、売りは買い注文の価格(bid)で約定させる
  const quote = fixed ? null : liveQuote(sym);
  const px = fixed ? opts.price : quote ? (side === 'buy' ? quote.ask : quote.bid) : T.last[sym];
  if (!(px > 0)) return '価格を取得できていません。';
  if (qty === undefined) qty = notional / px; else notional = qty * px;
  if (!(notional > 0) || !isFinite(notional)) return '金額を入力してください。';
  const q = quoteOf(sym), a = acct(q), dir = side === 'buy' ? 1 : -1;
  const pos = T.positions[sym], fee = notional * FEE, now = tnow();
  T.quotes[sym] = q;
  let pnl = null, feeIn = 0, pid = null;
  if (pos && Math.sign(pos.qty) !== dir) {
    // 反対向き=保有分を減らす(決済)
    const held = Math.abs(pos.qty);
    if (qty > held * (1 + 1e-9)) {
      return `反対向きの注文は、保有している分(${fmtMoney(held * px, q)} ${q})までです。先に決済してから、新しく注文してください。`;
    }
    qty = Math.min(qty, held);
    pnl = qty * (px - pos.avg) * Math.sign(pos.qty);
    feeIn = (pos.feeOpen || 0) * (qty / held);
    pos.feeOpen = (pos.feeOpen || 0) - feeIn;
    pid = pos.id;
    a.cash += pnl - fee;
    pos.qty -= Math.sign(pos.qty) * qty;
    if (Math.abs(pos.qty) <= held * 1e-9) delete T.positions[sym];
    else pos.levelsAt = now;
  } else {
    const st = acctStats(q);
    if (notional + fee > st.avail + 1e-9) {
      return `使える金額が足りません(使える金額: ${fmtMoney(st.avail, q)} ${q}、手数料込みで ${fmtMoney(notional + fee, q)} ${q} 必要)。`;
    }
    a.cash -= fee;
    if (pos) {
      pos.avg = (Math.abs(pos.qty) * pos.avg + qty * px) / (Math.abs(pos.qty) + qty);
      pos.qty += dir * qty;
      pos.feeOpen = (pos.feeOpen || 0) + fee;
      pos.levelsAt = now;
    } else {
      T.positions[sym] = { qty: dir * qty, avg: px, tp: null, sl: null, opened: now, id: now, levelsAt: now, feeOpen: fee };
    }
    pid = T.positions[sym].id;
  }
  T.history.unshift({
    t: fixed && opts.t ? opts.t : now, sym, side, qty, price: px, fee, pnl, reason: reason || 'manual',
    away: fixed && opts.away !== false, feeIn, pid, note: cleanNote(opts && opts.note),
  });
  T.history.length = Math.min(T.history.length, 3000);
  saveTrade();
  return null;
}
function closePosition(sym, reason, opts) {
  const p = T.positions[sym];
  if (!p) return 'ポジションがありません。';
  return execute(sym, p.qty > 0 ? 'sell' : 'buy', 0, reason, Math.abs(p.qty), opts);
}
/* ページを閉じていた間(スリープや通信断も含む)の値動きを取り寄せて、
 * その間に利確・損切りの価格に届いていたら、届いた時点の価格で決済する。
 * これをしないと、「損切りに届きそうなら閉じておき、戻ってから開く」ことで損切りを逃れられてしまう。
 * 調べる起点は、最後に価格を確かめた時刻と、利確・損切りや数量を最後に変えた時刻の、遅いほう。
 * (あとから条件を書き換えて、過去の値動きに当てはめることはできない) */
const reconciled = {}; // sym -> true: 確認済み / 'busy': 確認中 / なし: これから
const recRetryAt = {};
// ある時間帯の約定を取り寄せて、その間の最初の価格・安値・高値を返す(1分足より細かい端数を調べるため)
async function tradeRange(sym, from, to) {
  let lo = Infinity, hi = -Infinity, first = NaN, cur = from;
  for (let page = 0; page < 30 && cur < to; page++) {
    let rows = null, lastErr = null;
    for (const host of HOSTS) {
      const ac = new AbortController(), timer = setTimeout(() => ac.abort(), 8000);
      try {
        const res = await fetch(`${host}/api/v3/aggTrades?symbol=${encodeURIComponent(sym)}&startTime=${cur}&endTime=${to - 1}&limit=1000`, { signal: ac.signal });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        rows = await res.json();
        if (!Array.isArray(rows)) throw new Error('bad');
        break;
      } catch (e) { lastErr = e; rows = null; } finally { clearTimeout(timer); }
    }
    if (!rows) throw lastErr;
    rows.forEach(r => { const p = +r.p; if (!(p > 0)) return; if (!isFinite(first)) first = p; lo = Math.min(lo, p); hi = Math.max(hi, p); });
    if (rows.length < 1000) break;
    cur = +rows[rows.length - 1].T + 1;
  }
  return isFinite(first) ? { lo, hi, first } : null;
}
/* from から現在までの値動きを、もれなく順にたどる。
 * 分の途中から始まる端数は約定の記録で、そこから先は 1分足 → 5分足 → 1時間足 → 日足 と、
 * 区切りがそろうたびに粗い足へ上がり、現在が近づいたら細かい足へ下りる。
 * test(安値, 高値, 最初の価格, 終わりの時刻) が true を返したら、そこでやめる。 */
const LADDER = [['1d', 864e5], ['1h', 36e5], ['5m', 3e5], ['1m', 6e4]];
async function scanAway(sym, from, test) {
  let cur = from;
  if (cur % 6e4) {
    const to = Math.min(Math.ceil(cur / 6e4) * 6e4, tnow());
    const r = await tradeRange(sym, cur, to);
    if (r && test(r.lo, r.hi, r.first, to)) return;
    cur = to;
  }
  for (let guard = 0; guard < 60; guard++) {
    if (tnow() - cur < 6e4) return; // 残りの1分未満は、いまの価格での判定に任せる
    const k = LADDER.findIndex(([, ms]) => cur % ms === 0 && cur + ms <= tnow());
    if (k < 0) return;
    const [api, ms] = LADDER[k];
    // ひとつ粗い足の区切りまで進む(いちばん粗い足なら、一度に最大1000本)
    const limit = k > 0 ? Math.min(1000, Math.round((Math.floor(cur / LADDER[k - 1][1] + 1) * LADDER[k - 1][1] - cur) / ms)) : 1000;
    const rows = await fetchKlines(sym, api, limit, 0, cur).catch(e => { if (e && e.message === 'empty') return []; throw e; });
    let moved = false;
    for (const b of rows) {
      if (b.t < cur) continue;
      if (b.t + ms > tnow()) break; // まだ確定していない足
      if (test(b.l, b.h, b.o, b.t + ms)) return;
      cur = b.t + ms; moved = true;
    }
    if (!moved) cur += ms; // その時間帯のデータがない(取引がなかった)ときは、先へ進む
  }
}
async function reconcile(sym) {
  if (reconciled[sym]) return;
  const pos = T.positions[sym];
  if (!pos || (pos.tp === null && pos.sl === null)) { reconciled[sym] = true; if (clockReady) T.seen[sym] = tnow(); return; }
  if (mono() < (recRetryAt[sym] || 0)) return;
  reconciled[sym] = 'busy';
  try {
    if (!clockReady) await syncClock();
    if (!clockReady) throw new Error('clock');
    const from = Math.min(tnow(), Math.max(pos.opened, pos.levelsAt || 0, T.seen[sym] || 0));
    if (tnow() - from >= 60000) {
      let changed = false;
      await scanAway(sym, from, (lo, hi, open, tEnd) => {
        const p = T.positions[sym];
        // 待っている間に(別のタブなどで)内容が変わっていたら、いったんやめて最初からやり直す
        if (!p || p.id !== pos.id || p.levelsAt !== pos.levelsAt) { changed = true; return true; }
        const long = p.qty > 0;
        let hit = null;
        // 同じ時間帯の中で両方に届いていたら、不利なほう(損切り)を先とみなす。最初の価格がすでに越えていたら、その価格で約定
        if (p.sl !== null && (long ? lo <= p.sl : hi >= p.sl)) hit = ['sl', long ? Math.min(p.sl, open) : Math.max(p.sl, open)];
        else if (p.tp !== null && (long ? hi >= p.tp : lo <= p.tp)) hit = ['tp', p.tp];
        if (!hit) return false;
        if (closePosition(sym, hit[0], { price: hit[1], t: tEnd }) === null) {
          const h = T.history[0], q = quoteOf(sym);
          toast(`${labelOf(sym)}:ページを開いていない間に${hit[0] === 'tp' ? '利確' : '損切り'}の価格に届いていたため、その価格で決済しました(損益 ${fmtMoney(netOf(h), q, true)} ${q})`);
        }
        return true;
      });
      if (changed && T.positions[sym]) throw new Error('changed');
    }
    reconciled[sym] = true;
    T.seen[sym] = tnow();
  } catch (e) {
    // 取り寄せに失敗したら「確認済み」にはしない。少し待ってやり直す
    delete reconciled[sym];
    recRetryAt[sym] = mono() + 10000;
  }
  saveTrade(); renderTrade(); draw();
}
// 利確・損切りの価格が、いまの価格と向きに合っているか調べる
function checkLevels(dir, px, tp, sl) {
  if (tp !== null && !(dir > 0 ? tp > px : tp < px)) {
    return dir > 0 ? '買いの利確は、いまの価格より高くしてください。' : '売りの利確は、いまの価格より低くしてください。';
  }
  if (sl !== null && !(dir > 0 ? sl < px : sl > px)) {
    return dir > 0 ? '買いの損切りは、いまの価格より低くしてください。' : '売りの損切りは、いまの価格より高くしてください。';
  }
  return null;
}
/* いまの価格で、利確・損切りに届いたか調べる。
 * lo / hi: 前回調べてからの安値・高値。一瞬だけ届いてすぐ戻った場合も見逃さない。 */
function checkTriggers(sym, lo, hi) {
  const p = T.positions[sym], px = T.last[sym];
  if (!p || !(px > 0)) return;
  lo = Math.min(isFinite(lo) ? lo : px, px); hi = Math.max(isFinite(hi) ? hi : px, px);
  const long = p.qty > 0;
  let reason = null, level = 0;
  // 両方に届いていたら、不利なほう(損切り)を先とみなす
  if (p.sl !== null && (long ? lo <= p.sl : hi >= p.sl)) { reason = 'sl'; level = p.sl; }
  else if (p.tp !== null && (long ? hi >= p.tp : lo <= p.tp)) { reason = 'tp'; level = p.tp; }
  if (!reason) return;
  // いまも越えたままなら、いまの価格で決済。すでに戻っていたら、届いた価格で決済したものとする
  const still = reason === 'sl' ? (long ? px <= level : px >= level) : (long ? px >= level : px <= level);
  const q = quoteOf(sym);
  if (closePosition(sym, reason, still ? undefined : { price: level, away: false }) === null) {
    const h = T.history[0];
    toast(`${labelOf(sym)}:${reason === 'tp' ? '利確' : '損切り'}の価格に届いたので決済しました(損益 ${fmtMoney(netOf(h), q, true)} ${q})`);
  }
}
/* 予約中の指値注文を調べる。前回調べてからの安値・高値が指値に届いていたら約定させる。
 * 約定価格は、指値か、それより有利ないまの気配値。指値より不利な価格では約定させない。 */
function checkOrders(sym, lo, hi) {
  const px = T.last[sym];
  if (!(px > 0) || !T.orders.some(o => o.sym === sym)) return;
  lo = Math.min(isFinite(lo) ? lo : px, px); hi = Math.max(isFinite(hi) ? hi : px, px);
  T.orders.filter(o => o.sym === sym).forEach(o => {
    const buy = o.side === 'buy';
    if (!(buy ? lo <= o.price : hi >= o.price)) return;
    // 指値より不利な価格では約定させない。いまの気配値のほうが有利なら、その価格で約定させる
    const quote = liveQuote(sym), mkt = quote ? (buy ? quote.ask : quote.bid) : px;
    const fill = buy ? Math.min(o.price, mkt) : Math.max(o.price, mkt);
    const had = T.positions[sym], opening = !had || Math.sign(had.qty) === (buy ? 1 : -1);
    // 保有分を減らす注文で、残りがごくわずか(2%未満)になるなら、端数を残さず全部決済する
    let qty;
    if (had && !opening) { const held = Math.abs(had.qty), want = o.notional / fill; qty = want >= held * 0.98 ? held : want; }
    const err = execute(sym, o.side, o.notional, 'limit', qty, { price: fill, away: false, note: o.note });
    T.orders = T.orders.filter(x => x !== o);
    if (err) { toast(`${labelOf(sym)}:指値注文を取り消しました(${err})`); saveTrade(); return; }
    const pos = T.positions[sym];
    if (pos && opening) {
      // 利確・損切りは、約定した価格に対して向きが合っているものだけ付ける
      const fill = T.history[0].price, dir = buy ? 1 : -1;
      if (o.tp !== null && (dir > 0 ? o.tp > fill : o.tp < fill)) pos.tp = o.tp;
      if (o.sl !== null && (dir > 0 ? o.sl < fill : o.sl > fill)) pos.sl = o.sl;
      pos.levelsAt = tnow();
    }
    saveTrade();
    toast(`${labelOf(sym)}:指値注文が約定しました(${buy ? '買い' : '売り'} ${fmtQty(T.history[0].qty)} @ ${fmtPrice(T.history[0].price)})`);
  });
}
// 売り(ショート)の含み損で評価額がゼロ以下になったら、その口座のポジションを強制的に決済する
function stopOut(q) {
  if (acctStats(q).equity > 0) return;
  const list = Object.keys(T.positions).filter(s => quoteOf(s) === q && priceOk(s) && reconciled[s] === true);
  let closed = 0;
  list.forEach(s => { if (closePosition(s, 'liq') === null) closed++; });
  if (closed) toast(`${q} の口座の評価額がゼロ以下になったため、ポジションを強制的に決済しました。`);
}
let toastTimer = 0;
function toast(text) {
  const box = $('toast');
  box.textContent = text; box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, 6000);
}
// 価格が更新されるたびに呼ばれる
function tradeTick() {
  const n = state.bars.length;
  if (!state.live || !n) return;
  const sym = state.symbol;
  T.last[sym] = state.bars[n - 1].c;
  const lo = feed.lo, hi = feed.hi;
  feed.lo = Infinity; feed.hi = -Infinity;
  if (reconciled[sym] === true) {
    // 開いたままでも、長く価格を確かめられなかった(通信断・スリープ)なら、その間の値動きを調べ直す
    if (T.positions[sym] && clockReady && fin(T.seen[sym]) && tnow() - T.seen[sym] > 90000) { delete reconciled[sym]; reconcile(sym); }
    else {
      if (clockReady) T.seen[sym] = tnow();
      checkTriggers(sym, lo, hi);
      if (clockReady && priceOk(sym)) checkOrders(sym, lo, hi);
      stopOut(quoteOf(sym));
    }
  } else if (!reconciled[sym] && !state.loading) reconcile(sym); // 先に、閉じていた間の値動きを確かめる
  renderTrade();
}
// 表示していない銘柄のポジションも、価格を取りにいって利確・損切りを判定する
function pollPositions() {
  if (!state.live || document.hidden) return;
  // ポジションか、予約中の指値注文がある銘柄を見にいく
  [...new Set(Object.keys(T.positions).concat(T.orders.map(o => o.sym)))].filter(sym => sym !== state.symbol).forEach(sym => {
    fetchKlines(sym, '1m', 1).then(async rows => {
      const b = rows[rows.length - 1];
      T.last[sym] = b.c;
      otherFresh[sym] = mono();
      delete dead[sym];
      if (reconciled[sym] === true && clockReady && fin(T.seen[sym]) && tnow() - T.seen[sym] > 90000) delete reconciled[sym];
      await reconcile(sym);
      if (reconciled[sym] === true) {
        // この1分足がまるごと前回の確認より後なら、その高値・安値も使う
        const whole = clockReady && fin(T.seen[sym]) && b.t >= T.seen[sym];
        if (clockReady) T.seen[sym] = tnow();
        checkTriggers(sym, whole ? b.l : NaN, whole ? b.h : NaN);
        if (clockReady) checkOrders(sym, whole ? b.l : NaN, whole ? b.h : NaN);
        stopOut(quoteOf(sym));
      }
      saveTrade(); renderTrade(); draw();
    }).catch(() => markDeadIfUnlisted(sym));
  });
}

function setHtml(node, html) { if (node.innerHTML !== html) node.innerHTML = html; }
const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
function setTxt(id, text, cls) {
  const n = $(id);
  if (n.textContent !== text) n.textContent = text;
  if (cls !== undefined && n.className !== cls) n.className = cls;
}
const numOrNull = id => { const v = parseFloat($(id).value); return isFinite(v) && v > 0 ? v : null; };
let posKey = '';
function renderTrade() {
  const sym = state.symbol, q = quoteOf(sym), st = acctStats(q);
  const px = state.live ? T.last[sym] : NaN, pos = T.positions[sym];
  document.querySelectorAll('.trQuote').forEach(n => { if (n.textContent !== q) n.textContent = q; });
  setTxt('trSym', curSymbol().label);
  setTxt('trPrice', fmtPrice(px));
  const tradable = px > 0 && priceOk(sym) && reconciled[sym] === true && clockReady;
  $('trBuy').disabled = $('trSell').disabled = !tradable;
  // 取引所から消えた銘柄は価格が取れないので、建値での清算だけできるようにする
  const gone = !!dead[sym] && !!pos;
  $('pClose').disabled = !tradable && !gone;
  setTxt('pClose', gone ? '最後の価格で清算する' : '決済する');
  $('pSave').disabled = !tradable;
  if (gone) setTxt('pMsg', 'この銘柄は取引所で取引できなくなっています。最後に取得できた価格で清算できます。', 'msg');
  if (!(px > 0)) setTxt('trMsg', state.loading ? '' : '実際の価格を取得できていないため、いまは注文できません。');
  else if ($('trMsg').textContent.startsWith('実際の価格')) setTxt('trMsg', '');

  $('trOrders').hidden = !T.orders.length;
  setHtml($('trOrderList'), T.orders.map(o => {
    const oq = quoteOf(o.sym), extra = [o.tp !== null ? `利確 ${fmtPrice(o.tp)}` : '', o.sl !== null ? `損切り ${fmtPrice(o.sl)}` : '', o.note].filter(Boolean).join(' ・ ');
    return `<div class="ord"><span><span class="${o.side === 'buy' ? 'up' : 'down'}">${o.side === 'buy' ? '買い' : '売り'}</span> ${esc(labelOf(o.sym))} @ ${fmtPrice(o.price)}</span>` +
      `<button type="button" class="ctl btn small" data-oid="${esc(o.id)}">取消</button>` +
      `<span class="dim">${fmtMoney(o.notional, oq)} ${esc(oq)} 分${extra ? ' ・ ' + esc(extra) : ''}</span></div>`;
  }).join(''));
  $('trPos').hidden = !pos;
  if (pos) {
    const u = unrealized(sym), base = Math.abs(pos.qty) * pos.avg;
    setTxt('pSide', pos.qty > 0 ? '買い(ロング)' : '売り(ショート)', pos.qty > 0 ? 'up' : 'down');
    setTxt('pQty', `${fmtQty(pos.qty)}(${fmtMoney(Math.abs(pos.qty) * (px > 0 ? px : pos.avg), q)} ${q} 分)`);
    setTxt('pAvg', fmtPrice(pos.avg));
    setTxt('pPnl', `${fmtMoney(u, q, true)} ${q}(${(base ? u / base * 100 : 0).toFixed(2)}%)`, pnlClass(u));
    // 入力中の値を消さないよう、ポジションが変わったときだけ入力欄を書き換える
    const key = [sym, pos.opened, pos.tp, pos.sl].join('|');
    if (key !== posKey) {
      posKey = key;
      $('pTp').value = pos.tp === null ? '' : pos.tp;
      $('pSl').value = pos.sl === null ? '' : pos.sl;
      setTxt('pMsg', '');
    }
  } else posKey = '';

  const ts = tradeStats(q);
  const total = st.equity - st.start;
  setTxt('aEq', `${fmtMoney(st.equity, q)}(${fmtMoney(total, q, true)})`, pnlClass(total));
  setTxt('aCash', fmtMoney(st.cash, q));
  setTxt('aAvail', fmtMoney(st.avail, q));
  setTxt('aReal', fmtMoney(st.cash - st.start, q, true), pnlClass(st.cash - st.start));
  setTxt('aStat', ts.n ? `${ts.n} 回 / ${(ts.wins / ts.n * 100).toFixed(0)}%` : 'まだありません');

  const others = Object.keys(T.positions).filter(s => s !== sym);
  setHtml($('trOthers'), others.map(s => {
    const p = T.positions[s], u = unrealized(s), oq = quoteOf(s);
    return `<button type="button" data-sym="${esc(s)}"><span>${esc(labelOf(s))} <span class="dim">${p.qty > 0 ? '買い' : '売り'}</span></span>` +
      `<span class="${pnlClass(u)}">${fmtMoney(u, oq, true)} ${esc(oq)}</span></button>`;
  }).join(''));

  setHtml($('trHist'), T.history.length ? T.history.slice(0, 40).map(h => {
    const hq = quoteOf(h.sym), d = new Date(h.t);
    const when = `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    const why = h.reason === 'tp' ? '・利確' : h.reason === 'sl' ? '・損切り' : h.reason === 'liq' ? '・強制決済' : h.reason === 'limit' ? '・指値' : '';
    const net = h.pnl === null ? null : netOf(h);
    return `<div class="h-row"><span><span class="${h.side === 'buy' ? 'up' : 'down'}">${h.side === 'buy' ? '買い' : '売り'}</span> ${esc(labelOf(h.sym))}${why}${h.away ? '・不在中' : ''}</span>` +
      `<span class="h-pnl ${net === null ? 'dim' : pnlClass(net)}">${net === null ? '新規' : fmtMoney(net, hq, true) + ' ' + esc(hq)}</span>` +
      `<span class="dim">${fmtQty(h.qty)} @ ${fmtPrice(h.price)}</span><span class="dim h-pnl">${when}</span>` +
      `${h.note ? `<span class="h-note">メモ:${esc(h.note)}</span>` : ''}</div>`;
  }).join('') : '<span class="dim">まだ取引がありません。</span>');

  const u = pos ? unrealized(sym) : 0;
  setTxt('tbText', pos
    ? `${pos.qty > 0 ? '買い' : '売り'}を保有中 損益 ${fmtMoney(u, q, true)} ${q}`
    : `デモ資金 ${fmtMoney(st.equity, q)} ${q}`, pos ? pnlClass(u) : '');
}

// 画面上の位置が、取引の線(利確・損切り・指値・建値)の上かどうか
function tradeLineAt(p, tol) {
  const pane = panes[0];
  if (!state.live || !pane || !pane.yOf || p.x > plotW() || p.y < pane.y || p.y > pane.y + pane.h) return null;
  const sym = state.symbol, pos = T.positions[sym];
  const near = price => Math.abs(p.y - pane.yOf(price)) <= tol;
  if (pos && pos.tp !== null && near(pos.tp)) return { kind: 'tp', price: pos.tp };
  if (pos && pos.sl !== null && near(pos.sl)) return { kind: 'sl', price: pos.sl };
  const o = T.orders.find(x => x.sym === sym && near(x.price));
  if (o) return { kind: 'order', id: o.id, price: o.price };
  // 建値の線は、利確か損切りがまだ無いときだけつかめる(引っぱって新しく置く)
  if (pos && (pos.tp === null || pos.sl === null) && near(pos.avg)) return { kind: 'entry', price: pos.avg };
  return null;
}
// 建値の線を引っぱったとき、上下どちらに動かしたかで、利確か損切りかを決める
function entryDragKind(pos, price) {
  const profitSide = pos.qty > 0 ? price > pos.avg : price < pos.avg;
  const kind = profitSide ? 'tp' : 'sl';
  return pos[kind] === null ? kind : null;
}
// ドラッグで動かした線を確定する。入力欄から変えるときと同じ決まりで確かめる
function commitLine(dl) {
  const sym = state.symbol;
  syncIfStale();
  if (!priceOk(sym) || reconciled[sym] !== true || !clockReady) { toast('価格を最新の状態にできていないため、いまは変更できません。'); return; }
  const price = +dl.price.toFixed(priceDigits(dl.price));
  if (!(price > 0)) return;
  if (dl.kind === 'order') {
    const o = T.orders.find(x => x.id === dl.id);
    if (!o) return;
    const dir = o.side === 'buy' ? 1 : -1, quote = liveQuote(sym), ref = quote ? (dir > 0 ? quote.ask : quote.bid) : T.last[sym];
    const err = (dir > 0 ? price >= ref : price <= ref)
      ? (dir > 0 ? '買いの指値は、いまの価格より安くしてください。' : '売りの指値は、いまの価格より高くしてください。')
      : checkLevels(dir, price, o.tp, o.sl);
    if (err) { toast(err); return; }
    o.price = price;
  } else {
    const pos = T.positions[sym];
    if (!pos) return;
    const kind = dl.kind === 'entry' ? entryDragKind(pos, price) : dl.kind;
    if (!kind) return;
    const tp = kind === 'tp' ? price : pos.tp, sl = kind === 'sl' ? price : pos.sl;
    const err = checkLevels(Math.sign(pos.qty), T.last[sym], tp, sl);
    if (err) { toast(err); return; }
    pos.tp = tp; pos.sl = sl; pos.levelsAt = tnow();
  }
  saveTrade(); renderTrade(); draw();
}
// チャートに建値・利確・損切りの線と、売買した位置の印を描く
function drawTrade(pane, i0, i1) {
  if (!state.live) return;
  const pw = plotW(), bars = state.bars, sym = state.symbol, pos = T.positions[sym];
  const tags = [];
  ctx.save();
  ctx.beginPath(); ctx.rect(0, pane.y, pw, pane.h); ctx.clip();
  T.history.forEach(h => {
    if (h.sym !== sym) return;
    const i = clamp(Math.floor(idxOfTime(h.t) + 1e-6), 0, bars.length - 1);
    if (i < i0 || i > i1) return;
    const x = xOf(i), buy = h.side === 'buy';
    const y = buy ? pane.yOf(bars[i].l) + 6 : pane.yOf(bars[i].h) - 6, s = buy ? 1 : -1;
    ctx.fillStyle = buy ? UP : DOWN;
    ctx.strokeStyle = THEMES[state.theme].bg; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 9 * s); ctx.lineTo(x + 5, y + 9 * s); ctx.closePath();
    ctx.fill(); ctx.stroke();
  });
  {
    const line = (price, color, dash, text) => {
      const y = Math.round(pane.yOf(price)) + 0.5;
      ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.setLineDash(dash);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(pw, y); ctx.stroke();
      ctx.setLineDash([]);
      if (y > pane.y + 8 && y < pane.y + pane.h - 8) {
        const w = ctx.measureText(text).width + 10, x = Math.max(4, pw - w - 6);
        ctx.fillStyle = color; ctx.fillRect(x, y - 9, w, 18);
        ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.fillText(text, x + 5, y);
        tags.push([y, price, color]);
      }
    };
    const dl = state.dragLine;
    T.orders.forEach(o => {
      if (o.sym !== sym) return;
      const moving = dl && dl.kind === 'order' && dl.id === o.id;
      line(moving ? dl.price : o.price, '#5b7fd6', [2, 4], `${o.side === 'buy' ? '買い指値' : '売り指値'} ↕${moving ? ' ' + fmtPrice(dl.price) : ''}`);
    });
    if (pos) {
      const q = quoteOf(sym), u = unrealized(sym);
      // その価格で決済した場合の損益の見込み(手数料込み)
      const est = price => pos.qty * (price - pos.avg) - Math.abs(pos.qty) * price * FEE - (pos.feeOpen || 0);
      const lbl = (name, price, moving) => `${name} ↕${moving ? ` ${fmtPrice(price)}(${fmtMoney(est(price), q, true)} ${q})` : ''}`;
      line(pos.avg, pos.qty > 0 ? '#1f9d8f' : '#e0463f', [], `${pos.qty > 0 ? '買い' : '売り'} ${fmtMoney(u, q, true)} ${q}`);
      const newKind = dl && dl.kind === 'entry' ? entryDragKind(pos, dl.price) : null;
      ['tp', 'sl'].forEach(kind => {
        const moving = dl && (dl.kind === kind || newKind === kind);
        const price = moving ? dl.price : pos[kind];
        if (price !== null) line(price, kind === 'tp' ? '#1f9d8f' : '#e0463f', [5, 4], lbl(kind === 'tp' ? '利確' : '損切り', price, moving));
      });
    }
  }
  ctx.lineWidth = 1;
  ctx.restore();
  tags.forEach(([y, price, color]) => axisTag(y, fmtPrice(price), color, '#ffffff', pane));
}

function bindTrade() {
  const panel = $('trade'), btn = $('tradeBtn');
  const setOpen = on => {
    state.tradeOpen = on;
    panel.hidden = !on;
    btn.setAttribute('aria-pressed', String(on));
    save();
  };
  setOpen(state.tradeOpen && window.innerWidth > 760); // スマホでは閉じた状態から始める
  btn.addEventListener('click', () => setOpen(panel.hidden));
  $('trClose').addEventListener('click', () => setOpen(false));
  $('tbOpen').addEventListener('click', e => { e.stopPropagation(); setOpen(true); });
  // スマホでは、注文画面の外(チャート側)をタップしたら閉じる
  document.addEventListener('pointerdown', e => {
    if (window.innerWidth > 760 || panel.hidden) return;
    if (panel.contains(e.target) || e.target.closest('.overlay, .toast, #tradeBar')) return;
    setOpen(false);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && window.innerWidth <= 760) setOpen(false); });

  const amt = $('trAmt');
  amt.value = acct(quoteOf(state.symbol)).start / 10;
  document.querySelector('.tr-quick').addEventListener('click', e => {
    const pct = parseFloat(e.target.dataset.pct);
    if (!pct) return;
    const q = quoteOf(state.symbol), v = acctStats(q).avail * pct / (1 + FEE);
    amt.value = q === 'JPY' ? Math.floor(v) : Math.floor(v * 100) / 100;
  });
  // 注文の種類(成行 / 指値)
  let orderType = 'market';
  $('trType').addEventListener('click', e => {
    const b = e.target.closest('button[data-type]');
    if (!b) return;
    orderType = b.dataset.type;
    [...$('trType').children].forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
    $('trLimitRow').hidden = orderType !== 'limit';
    if (orderType === 'limit' && !$('trLimit').value && T.last[state.symbol] > 0) $('trLimit').value = T.last[state.symbol];
    renderRisk();
  });
  /* 損切りを入れたら、「損切りになったときにいくら失うか」を見せる。
   * 資金の何%を失う設定にするかを選ぶと、そこから買う金額を逆算する(教科書 第5章の計算)。 */
  const entryPrice = () => (orderType === 'limit' ? parseFloat($('trLimit').value) : T.last[state.symbol]);
  const stopPct = () => {
    const e = entryPrice(), sl = parseFloat($('trSl').value);
    return e > 0 && sl > 0 && sl !== e ? Math.abs(e - sl) / e : NaN;
  };
  function renderRisk() {
    const pct = stopPct(), box = $('trRisk');
    box.hidden = !isFinite(pct);
    if (!isFinite(pct)) return;
    const q = quoteOf(state.symbol), st = acctStats(q), n = parseFloat(amt.value) || 0;
    const loss = n * (pct + 2 * FEE); // 値幅の損に、往復の手数料を足したもの
    setTxt('trRiskText', `損切りまで ${(pct * 100).toFixed(2)}%。この金額だと、損切りで約 ${fmtMoney(loss, q)} ${q}(資金の ${(st.equity > 0 ? loss / st.equity * 100 : 0).toFixed(2)}%)を失います。`);
  }
  ['trSl', 'trAmt', 'trLimit'].forEach(id => $(id).addEventListener('input', renderRisk));
  $('trRisk').addEventListener('click', e => {
    const r = parseFloat(e.target.dataset.risk), pct = stopPct();
    if (!r || !isFinite(pct)) return;
    const q = quoteOf(state.symbol), st = acctStats(q);
    const v = Math.min(st.equity * r / (pct + 2 * FEE), st.avail / (1 + FEE));
    amt.value = q === 'JPY' ? Math.floor(v) : Math.floor(v * 100) / 100;
    renderRisk();
  });
  const order = side => {
    const sym = state.symbol, px = T.last[sym], dir = side === 'buy' ? 1 : -1, q = quoteOf(sym);
    const tp = numOrNull('trTp'), sl = numOrNull('trSl'), note = cleanNote($('trNote').value);
    const notional = parseFloat(amt.value) || 0;
    const had = T.positions[sym], opening = !had || Math.sign(had.qty) === dir;
    const done = () => { $('trTp').value = ''; $('trSl').value = ''; $('trNote').value = ''; renderRisk(); renderTrade(); draw(); };
    if (orderType === 'limit') {
      // 指値注文:いまは約定させず、予約として残す
      syncIfStale();
      const lp = parseFloat($('trLimit').value), quote = liveQuote(sym);
      const ref = quote ? (dir > 0 ? quote.ask : quote.bid) : px;
      let err = null;
      if (!priceOk(sym) || reconciled[sym] !== true || !clockReady) err = '価格を最新の状態にできていないため、いまは注文できません。数秒待ってから、もう一度お試しください。';
      else if (!(lp > 0)) err = '指値の価格を入力してください。';
      else if (!(notional > 0)) err = '金額を入力してください。';
      else if (dir > 0 ? lp >= ref : lp <= ref) err = dir > 0 ? '買いの指値は、いまの価格より安くしてください(いまの価格で買うなら「成行」です)。' : '売りの指値は、いまの価格より高くしてください(いまの価格で売るなら「成行」です)。';
      else if (T.orders.length >= 20) err = '予約できる指値注文は20件までです。';
      else if (opening) err = checkLevels(dir, lp, tp, sl);
      if (err) { setTxt('trMsg', err, 'msg down'); return; }
      T.orders.push({ id: tnow() + Math.random(), sym, side, price: lp, notional, tp: opening ? tp : null, sl: opening ? sl : null, t: tnow(), note });
      saveTrade();
      setTxt('trMsg', `${side === 'buy' ? '買い' : '売り'}の指値注文を予約しました(${fmtPrice(lp)} で ${fmtMoney(notional, q)} ${q} 分)。`, 'msg');
      done();
      return;
    }
    let err = opening && px > 0 ? checkLevels(dir, px, tp, sl) : null;
    if (!err) err = execute(sym, side, notional, 'manual', undefined, { note });
    if (err) { setTxt('trMsg', err, 'msg down'); return; }
    const pos = T.positions[sym];
    if (pos && opening) {
      if (tp !== null) pos.tp = tp;
      if (sl !== null) pos.sl = sl;
      pos.levelsAt = tnow();
      saveTrade();
    }
    const h = T.history[0];
    setTxt('trMsg', `${side === 'buy' ? '買い' : '売り'}ました:${fmtQty(h.qty)} @ ${fmtPrice(h.price)}` +
      (h.pnl === null ? '' : `(損益 ${fmtMoney(netOf(h), q, true)} ${q})`), 'msg');
    done();
  };
  $('trOrderList').addEventListener('click', e => {
    const b = e.target.closest('button[data-oid]');
    if (!b) return;
    syncIfStale();
    T.orders = T.orders.filter(o => String(o.id) !== b.dataset.oid);
    saveTrade(); renderTrade(); draw();
  });
  $('trBuy').addEventListener('click', () => order('buy'));
  $('trSell').addEventListener('click', () => order('sell'));

  $('pSave').addEventListener('click', () => {
    const pos = T.positions[state.symbol];
    if (!pos) return;
    const sym = state.symbol;
    if (syncIfStale()) { renderTrade(); return; }
    // 価格が最新で、閉じていた間の確認も済んでいるときだけ変更できる(過去の値動きを見てからの書き換えを防ぐ)
    if (!priceOk(sym) || reconciled[sym] !== true || !clockReady) { setTxt('pMsg', '価格を最新の状態にできていないため、いまは変更できません。数秒待ってから、もう一度お試しください。', 'msg down'); return; }
    const tp = numOrNull('pTp'), sl = numOrNull('pSl');
    const err = checkLevels(Math.sign(pos.qty), T.last[sym], tp, sl);
    if (err) { setTxt('pMsg', err, 'msg down'); return; }
    pos.tp = tp; pos.sl = sl; pos.levelsAt = tnow();
    saveTrade(); renderTrade(); draw();
    setTxt('pMsg', '保存しました。', 'msg');
  });
  $('pClose').addEventListener('click', () => {
    const sym = state.symbol, q = quoteOf(sym), held = T.positions[sym];
    const err = dead[sym] && held ? closePosition(sym, 'manual', { price: T.last[sym] > 0 ? T.last[sym] : held.avg, away: false }) : closePosition(sym, 'manual');
    if (err) { setTxt('pMsg', err, 'msg down'); return; }
    const h = T.history[0];
    setTxt('trMsg', `決済しました(損益 ${fmtMoney(netOf(h), q, true)} ${q})`, 'msg');
    renderTrade(); draw();
  });
  $('trOthers').addEventListener('click', e => {
    const b = e.target.closest('button[data-sym]');
    if (!b) return;
    const sel = $('symbol'), id = b.dataset.sym;
    // 一覧から消した銘柄のポジションでも、開けるように戻す
    if (!SYMBOLS.some(s => s.id === id)) {
      SYMBOLS.push({ id, label: labelOf(id), base: 100, quote: quoteOf(id) });
      sel.insertBefore(el('option', { value: id, text: labelOf(id) }), sel.lastChild);
    }
    sel.value = b.dataset.sym;
    sel.dispatchEvent(new Event('change'));
  });
  // 押し間違いで消えないよう、リセットは2回押しで実行する
  const reset = $('aReset');
  let armed = 0;
  reset.addEventListener('click', () => {
    if (Date.now() - armed > 4000) {
      armed = Date.now(); reset.textContent = 'もう一度押すとリセット(取り消せません)';
      setTimeout(() => { reset.textContent = '口座をリセット'; }, 4000);
      return;
    }
    armed = 0; reset.textContent = '口座をリセット';
    const last = T.last, quotes = T.quotes;
    T = freshTrade(); T.last = last; T.quotes = quotes;
    Object.keys(reconciled).forEach(k => delete reconciled[k]);
    saveTrade(); renderTrade(); draw();
    setTxt('trMsg', '口座をリセットしました。', 'msg');
  });
  const onSymbol = () => {
    if ($('symbol').value === '__add') return;
    amt.value = acct(quoteOf(state.symbol)).start / 10;
    $('trTp').value = ''; $('trSl').value = ''; setTxt('trMsg', '');
    renderTrade();
  };
  $('symbol').addEventListener('change', onSymbol);
  $('symbol').addEventListener('symbolpicked', onSymbol);
  bindAnalysis();
  renderTrade();
}

// ---------------------------------------------------------------- 成績の分析
/* 履歴を古い順にたどり、口座残高の推移と各種の指標を計算する。
 * 損益はすべて手数料を引いた後の金額。 */
function tradeStats(q) {
  const a = acct(q), start = a.start;
  const events = T.history.filter(h => quoteOf(h.sym) === q).slice().reverse();
  const cashOf = h => (h.pnl === null ? 0 : h.pnl) - h.fee;
  // 履歴は古いものから切り捨てられることがある。最後がいまの残高に合うよう、残っている履歴から逆算した残高を出発点にする
  let cash = a.cash - events.reduce((s, h) => s + cashOf(h), 0);
  const curve = [{ t: events.length ? events[0].t : Date.now(), v: cash }];
  const bySym = {}, trades = new Map(); // trades: 1つのポジション(買ってから売り切るまで)を1回の取引として数える
  let fees = 0, peak = Math.max(cash, start), maxDD = 0, maxDDPct = 0;
  events.forEach((h, i) => {
    fees += h.fee;
    cash += cashOf(h);
    curve.push({ t: h.t, v: cash });
    peak = Math.max(peak, cash);
    if (peak - cash > maxDD) { maxDD = peak - cash; maxDDPct = peak ? maxDD / peak * 100 : 0; }
    const s = bySym[h.sym] || (bySym[h.sym] = { sym: h.sym, n: 0, wins: 0, net: 0 });
    s.net += cashOf(h);
    if (h.pnl === null) return;
    // 分けて決済しても、同じポジションなら1回にまとめる。損益には、建てたときの手数料も含める
    const key = h.pid === null ? `row${i}` : `${h.sym}:${h.pid}`;
    const tr = trades.get(key) || { sym: h.sym, net: 0 };
    tr.net += netOf(h);
    trades.delete(key); trades.set(key, tr); // 最後に決済した順に並べ直す
  });
  const closed = [...trades.values()].map(tr => tr.net);
  let run = 0, bestRun = 0, worstRun = 0;
  [...trades.values()].forEach(tr => {
    bySym[tr.sym].n++; if (tr.net > 0) bySym[tr.sym].wins++;
    run = tr.net > 0 ? Math.max(1, run + 1) : tr.net < 0 ? Math.min(-1, run - 1) : 0;
    bestRun = Math.max(bestRun, run); worstRun = Math.min(worstRun, run);
  });
  const wins = closed.filter(v => v > 0), losses = closed.filter(v => v < 0);
  const sum = arr => arr.reduce((x, y) => x + y, 0);
  const grossWin = sum(wins), grossLoss = -sum(losses);
  return {
    start, cash: a.cash, fees, curve, maxDD, maxDDPct, bestRun, worstRun: -worstRun,
    n: closed.length, wins: wins.length, losses: losses.length,
    net: a.cash - start,
    avgWin: wins.length ? grossWin / wins.length : NaN,
    avgLoss: losses.length ? -grossLoss / losses.length : NaN,
    best: closed.length ? Math.max(...closed) : NaN,
    worst: closed.length ? Math.min(...closed) : NaN,
    pf: grossLoss > 0 ? grossWin / grossLoss : NaN,
    bySym: Object.values(bySym).sort((x, y) => y.net - x.net),
  };
}
function drawCurve(cv, st) {
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (!w) return;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const c = cv.getContext('2d'), th = THEMES[state.theme];
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  const pts = st.curve, padL = 8, padR = 62, padT = 10, padB = 10;
  let lo = Math.min(st.start, ...pts.map(p => p.v)), hi = Math.max(st.start, ...pts.map(p => p.v));
  if (hi === lo) { hi += 1; lo -= 1; }
  const span = hi - lo; lo -= span * 0.08; hi += span * 0.08;
  const X = i => padL + (pts.length > 1 ? i / (pts.length - 1) : 0.5) * (w - padL - padR);
  const Y = v => padT + (hi - v) / (hi - lo) * (h - padT - padB);
  const color = st.cash >= st.start ? UP : DOWN;
  c.font = '11px -apple-system, "Segoe UI", "Hiragino Sans", sans-serif'; c.textBaseline = 'middle';
  // 開始時の資金(基準線)
  c.strokeStyle = th.cross; c.setLineDash([3, 3]); c.lineWidth = 1;
  c.beginPath(); c.moveTo(padL, Y(st.start)); c.lineTo(w - padR, Y(st.start)); c.stroke(); c.setLineDash([]);
  if (pts.length > 1) {
    c.beginPath(); c.moveTo(X(0), Y(st.start));
    pts.forEach((p, i) => c.lineTo(X(i), Y(p.v)));
    c.lineTo(X(pts.length - 1), Y(st.start)); c.closePath();
    c.fillStyle = rgba(color, 0.14); c.fill();
    c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(X(i), Y(p.v)) : c.moveTo(X(i), Y(p.v))));
    c.strokeStyle = color; c.lineWidth = 2; c.lineJoin = 'round'; c.stroke();
  }
  c.fillStyle = th.text; c.textAlign = 'left';
  c.fillText('開始', w - padR + 6, Y(st.start));
  const last = pts[pts.length - 1].v;
  if (Math.abs(Y(last) - Y(st.start)) > 13) { c.fillStyle = color; c.fillText('現在', w - padR + 6, Y(last)); }
}
function renderAnalysis() {
  const body = $('anBody'), sel = $('anQuote');
  const used = [...new Set(T.history.map(h => quoteOf(h.sym)))];
  const cur = quoteOf(state.symbol);
  if (!used.includes(cur)) used.unshift(cur);
  const want = used.includes(sel.value) ? sel.value : cur;
  sel.textContent = '';
  used.forEach(q => sel.appendChild(el('option', { value: q, text: `${q} の口座` })));
  sel.value = want;
  sel.hidden = used.length < 2;
  const q = want, qe = esc(q), st = tradeStats(q), m = (v, s) => (isFinite(v) ? `${fmtMoney(v, q, s)} ${qe}` : '—');
  const kpi = (label, value, cls, hint) =>
    `<div class="kpi"><span class="dim">${label}</span><strong class="${cls || ''}">${value}</strong>${hint ? `<small>${hint}</small>` : ''}</div>`;
  const pfText = isFinite(st.pf) ? st.pf.toFixed(2) : st.wins && !st.losses ? '負けなし' : '—';
  let html = `<div class="kpis">` +
    kpi('確定した損益', m(st.net, true), pnlClass(st.net), `開始資金 ${fmtMoney(st.start, q)} → ${fmtMoney(st.cash, q)}(${(st.net / st.start * 100).toFixed(2)}%)`) +
    kpi('勝率', st.n ? `${(st.wins / st.n * 100).toFixed(0)}%` : '—', '', `決済 ${st.n} 回(勝ち ${st.wins}・負け ${st.losses})`) +
    kpi('プロフィットファクター', pfText, isFinite(st.pf) ? pnlClass(st.pf - 1) : '', '利益の合計 ÷ 損失の合計。1 より大きければ全体でプラス') +
    kpi('最大ドローダウン', st.maxDD > 0 ? `${m(-st.maxDD)}` : '—', st.maxDD > 0 ? 'down' : '', st.maxDD > 0 ? `資金がいちばん多かった時点から、最大で ${st.maxDDPct.toFixed(2)}% 減った` : '資金のピークからの最大の落ち込み') +
    kpi('平均利益 / 平均損失', `${isFinite(st.avgWin) ? fmtMoney(st.avgWin, q, true) : '—'} / ${isFinite(st.avgLoss) ? fmtMoney(st.avgLoss, q, true) : '—'}`, '', '勝ったとき・負けたときの1回あたりの平均') +
    kpi('最大の勝ち / 負け', `${isFinite(st.best) && st.best > 0 ? fmtMoney(st.best, q, true) : '—'} / ${isFinite(st.worst) && st.worst < 0 ? fmtMoney(st.worst, q, true) : '—'}`, '', `最長の連勝 ${st.bestRun} 回・連敗 ${st.worstRun} 回`) +
    kpi('手数料の合計', m(st.fees), '', '損益にはすでに含めています') +
    `</div><h3>資金の推移</h3><canvas id="anCurve" class="curve" role="img" aria-label="取引ごとの口座残高の推移"></canvas>` +
    `<p class="dim small">横軸は取引の順番です。保有中のポジションの含み損益は含みません。</p><h3>銘柄ごとの成績</h3>`;
  html += st.bySym.length
    ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>銘柄</th><th>決済</th><th>勝率</th><th>損益 (${qe})</th></tr></thead><tbody>` +
      st.bySym.map(s => `<tr><td>${esc(labelOf(s.sym))}</td><td>${s.n}</td><td>${s.n ? (s.wins / s.n * 100).toFixed(0) + '%' : '—'}</td><td class="${pnlClass(s.net)}">${fmtMoney(s.net, q, true)}</td></tr>`).join('') +
      `</tbody></table></div>`
    : `<p class="dim">まだ取引がありません。デモトレードで売買すると、ここに成績が出ます。</p>`;
  if (st.n > 0 && st.n < 30) html += `<p class="dim small">決済が ${st.n} 回と少ないため、勝率などの数字は偶然に大きく左右されます。目安として見てください。</p>`;
  body.innerHTML = html;
  drawCurve($('anCurve'), st);
}
function exportCsv() {
  const cell = v => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [['日時', '銘柄', '売買', '数量', '価格', '決済通貨', '手数料', '損益(手数料込み)', '種類', 'メモ']];
  T.history.slice().reverse().forEach(h => {
    rows.push([fmtDate(h.t, true), labelOf(h.sym), h.side === 'buy' ? '買い' : '売り', h.qty, h.price, quoteOf(h.sym), h.fee,
      h.pnl === null ? '' : netOf(h),
      (h.pnl === null ? '新規' : h.reason === 'tp' ? '決済(利確)' : h.reason === 'sl' ? '決済(損切り)' : h.reason === 'liq' ? '決済(強制)' : '決済') + (h.reason === 'limit' ? '・指値' : ''),
      // 表計算ソフトが式として実行しないよう、記号で始まるメモは文字として渡す
      /^[=+\-@]/.test(h.note || '') ? "'" + h.note : h.note || '']);
  });
  // 先頭の BOM は、Excel で日本語が文字化けしないようにするため
  const blob = new Blob(['﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `demo-trades_${fmtDate(Date.now())}.csv`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
function bindAnalysis() {
  const ov = $('anOverlay');
  const close = () => { ov.hidden = true; };
  $('anOpen').addEventListener('click', () => { ov.hidden = false; renderAnalysis(); });
  $('anClose').addEventListener('click', close);
  $('anQuote').addEventListener('change', renderAnalysis);
  $('anCsv').addEventListener('click', exportCsv);
  ov.addEventListener('pointerdown', e => { if (e.target === ov) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  window.addEventListener('resize', () => { if (!ov.hidden) renderAnalysis(); });
}

// ---------------------------------------------------------------- 使い方の案内
const HELP_KEY = 'gold-trade-help-v1';
function openHelp() { $('helpOverlay').hidden = false; $('helpOk').focus(); }
function bindHelp() {
  const ov = $('helpOverlay');
  const close = () => { ov.hidden = true; try { localStorage.setItem(HELP_KEY, '1'); } catch (e) { /* 保存できなくても閉じる */ } };
  $('helpOk').addEventListener('click', close);
  $('helpClose').addEventListener('click', close);
  ov.addEventListener('pointerdown', e => { if (e.target === ov) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !ov.hidden) close(); });
  // 初めて開いたときだけ、自動で出す
  let seen = false;
  try { seen = !!localStorage.getItem(HELP_KEY); } catch (e) { seen = true; }
  if (!seen) openHelp();
}

// ---------------------------------------------------------------- 自分で作るインジケーター(作成画面)
const MK_COLORS = ['#2f80ed', '#f5a623', '#27ae60', '#c0392b'];
const MK_SAMPLES = [
  ['2本の平均線の差', { name: '平均線の差', overlay: false, lines: [{ name: '差', expr: 'ema(close, p1) - ema(close, p2)', color: '#2f80ed' }], hist: '', bands: [0], inputs: [{ label: '短い期間', def: 12 }, { label: '長い期間', def: 26 }] }],
  ['出来高が平均の何倍か', { name: '出来高の倍率', overlay: false, lines: [{ name: '倍率', expr: 'volume / sma(volume, p1)', color: '#f5a623' }], hist: '', bands: [1, 2], inputs: [{ label: '平均する期間', def: 20 }] }],
  ['平均線からの離れ(%)', { name: '平均線からの離れ', overlay: false, lines: [{ name: '%', expr: '(close - sma(close, p1)) / sma(close, p1) * 100', color: '#27ae60' }], hist: '', bands: [0], inputs: [{ label: '期間', def: 25 }] }],
  ['高値と安値の帯(チャートに重ねる)', { name: '高値安値の帯', overlay: true, lines: [{ name: '上', expr: 'highest(high, p1)', color: '#27ae60' }, { name: '下', expr: 'lowest(low, p1)', color: '#c0392b' }], hist: '', bands: [], inputs: [{ label: '期間', def: 20 }] }],
  ['値幅で決める損切りの目安(チャートに重ねる)', { name: '損切りの目安', overlay: true, lines: [{ name: '目安', expr: 'highest(close, p1) - atr(p1) * p2', color: '#c0392b' }], hist: '', bands: [], inputs: [{ label: '期間', def: 22 }, { label: '値幅の何倍', def: 3 }] }],
  ['上げた足・下げた足の出来高(棒グラフ)', { name: '上げ下げ出来高', overlay: false, lines: [], hist: 'if(close > open, volume, -volume)', bands: [0], inputs: [] }],
];
MK_SAMPLES.push(
  ['平均線の交差で合図を出す(▲▼)', { name: '交差の合図', overlay: true, lines: [{ name: '短', expr: 'ema(close, p1)', color: '#2f80ed' }, { name: '長', expr: 'ema(close, p2)', color: '#f5a623' }], hist: '', bands: [], inputs: [{ label: '短い期間', def: 10 }, { label: '長い期間', def: 30 }],
    marks: [{ name: '上抜け', expr: 'crossover(ema(close, p1), ema(close, p2))', dir: 'up' }, { name: '下抜け', expr: 'crossunder(ema(close, p1), ema(close, p2))', dir: 'down' }] }],
  ['RSI が下がりすぎ・上がりすぎた足に合図', { name: 'RSI の合図', overlay: true, lines: [], hist: '', bands: [], inputs: [{ label: '期間', def: 14 }, { label: '下の基準', def: 30 }, { label: '上の基準', def: 70 }],
    marks: [{ name: '下がりすぎ', expr: 'crossunder(rsi(close, p1), p2)', dir: 'up' }, { name: '上がりすぎ', expr: 'crossover(rsi(close, p1), p3)', dir: 'down' }] }],
);
MK_SAMPLES.forEach(x => { if (!x[1].marks) x[1].marks = []; });
const blankCustom = () => ({ id: '', name: '', overlay: false, lines: [{ name: '線1', expr: '', color: MK_COLORS[0] }], hist: '', bands: [], inputs: [], marks: [] });
const mk = { def: null, editId: null, opener: null, focus: null };

function openMaker(editId) {
  const cur = editId && customDefs.find(d => d.id === editId);
  mk.editId = cur ? cur.id : null;
  mk.def = cur ? JSON.parse(JSON.stringify(cur)) : blankCustom();
  if (!Array.isArray(mk.def.marks)) mk.def.marks = [];
  mk.opener = document.activeElement;
  mk.focus = null;
  $('mkTitle').textContent = cur ? 'インジケーターを編集' : 'インジケーターを作る';
  $('mkOverlay').hidden = false;
  renderMaker();
  $('mkName').focus();
}
function closeMaker() {
  $('mkOverlay').hidden = true;
  if (mk.opener && mk.opener.isConnected) mk.opener.focus();
}
// 式を確かめて、問題なければ「いまの値」を、あれば理由を出す
function mkCheck(expr, out, optional, isMark) {
  out.classList.remove('bad', 'good');
  if (!expr.trim()) { out.textContent = optional ? '' : '式を入力してください。下の「使える部品」をタップすると入ります。'; return optional; }
  const err = GT.checkFormula(expr);
  if (err) { out.textContent = err; out.classList.add('bad'); return false; }
  let text = '式は正しく読み取れました。';
  try {
    const vars = {};
    mk.def.inputs.forEach((q, i) => { vars[`p${i + 1}`] = q.def; });
    const vals = GT.evalFormula(GT.parseFormula(expr), state.bars, vars), last = vals[vals.length - 1];
    if (state.bars.length && isMark) {
      const N = Math.min(120, vals.length), hits = vals.slice(-N).filter(v => v > 0 || v < 0).length;
      text = hits ? `OK ・ 直近${N}本のうち ${hits}本で合図が出ます` : `OK ・ ただし直近${N}本では一度も成り立っていません`;
      if (hits > N * 0.4) text += '(多すぎるかもしれません。条件をしぼると見やすくなります)';
    } else if (state.bars.length) text = isFinite(last) ? `OK ・ いまの値: ${fmtCompact(last)}` : 'OK ・ いまの足では値が出ません(期間が長すぎる、0で割っている、など)';
  } catch (e) { /* 値の見本が出せないだけなので、そのまま進める */ }
  out.textContent = text; out.classList.add('good');
  return true;
}
function mkValid() {
  const d = mk.def;
  const ok = d.name.trim() && d.lines.every(l => l.expr.trim() && !GT.checkFormula(l.expr)) &&
    d.marks.every(m => m.expr.trim() && !GT.checkFormula(m.expr)) &&
    (!d.hist.trim() || d.overlay || !GT.checkFormula(d.hist)) && (d.lines.length || d.marks.length || (!d.overlay && d.hist.trim()));
  $('mkSave').disabled = !ok;
  drawMkPreview(!!ok);
  return !!ok;
}
function renderMaker() {
  const d = mk.def, body = $('mkBody');
  body.textContent = '';
  const add = (...nodes) => nodes.forEach(nd => body.appendChild(nd));
  const field = (label, hint, node) => el('label', { class: 'mk-field' }, [labelCell(label, hint), node]);
  const exprBox = (value, onChange, optional, label, isMark) => {
    const ta = el('textarea', { class: 'ctl mk-expr', rows: '2', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', maxlength: '300', 'aria-label': label, placeholder: '例: sma(close, 20)' });
    ta.value = value;
    const out = el('p', { class: 'mk-check', 'aria-live': 'polite' });
    const run = () => { onChange(ta.value); mkCheck(ta.value, out, optional, isMark); mkValid(); };
    ta.addEventListener('input', run);
    ta.addEventListener('focus', () => { mk.focus = ta; });
    mkCheck(value, out, optional, isMark);
    return [ta, out];
  };

  if (!mk.editId) {
    const sel = el('select', { class: 'ctl', id: 'mkSample' }, [el('option', { value: '', text: '見本を選ぶ…' })].concat(MK_SAMPLES.map(([t], i) => el('option', { value: String(i), text: t }))));
    sel.addEventListener('change', () => {
      if (sel.value === '') return;
      mk.def = JSON.parse(JSON.stringify(MK_SAMPLES[+sel.value][1])); mk.def.id = '';
      renderMaker();
    });
    add(field('見本から始める', '選ぶと下の欄に入ります。そこから書きかえられます', sel));
  }
  const name = el('input', { class: 'ctl', id: 'mkName', type: 'text', maxlength: '30', placeholder: '例: 平均線の差' });
  name.value = d.name;
  name.addEventListener('input', () => { d.name = name.value; mkValid(); });
  add(field('名前', null, name));

  const place = el('select', { class: 'ctl', id: 'mkPlace' }, [el('option', { value: '0', text: 'チャートの下(別の枠)' }), el('option', { value: '1', text: 'チャートに重ねる' })]);
  place.value = d.overlay ? '1' : '0';
  place.addEventListener('change', () => { d.overlay = place.value === '1'; renderMaker(); });
  add(field('表示する場所', '価格と同じくらいの大きさの値は「重ねる」、それ以外は「下」', place));

  add(el('div', { class: 'sect', text: '調整できる数値(式の中で p1・p2・p3 と書くと使えます)' }));
  d.inputs.forEach((q, i) => {
    const lab = el('input', { class: 'ctl', type: 'text', maxlength: '20', 'aria-label': `p${i + 1} の名前` });
    lab.value = q.label;
    lab.addEventListener('input', () => { q.label = lab.value; });
    const num = el('input', { class: 'ctl mk-num', type: 'number', step: 'any', inputmode: 'decimal', 'aria-label': `p${i + 1} の初期値` });
    num.value = q.def;
    num.addEventListener('input', () => { const v = parseFloat(num.value); if (isFinite(v)) { q.def = clamp(v, -1e9, 1e9); body.querySelectorAll('.mk-expr').forEach(t => t.dispatchEvent(new Event('input'))); } });
    const row = [el('b', { class: 'mk-p', text: `p${i + 1}` }), lab, num];
    if (i === d.inputs.length - 1) {
      const rm = el('button', { class: 'x', type: 'button', 'aria-label': `p${i + 1} を削除`, text: '×' });
      rm.addEventListener('click', () => { d.inputs.pop(); renderMaker(); });
      row.push(rm);
    }
    add(el('div', { class: 'mk-row' }, row));
  });
  if (d.inputs.length < 3) {
    const b = el('button', { class: 'ctl btn small', type: 'button', text: `＋ 数値を追加(p${d.inputs.length + 1})` });
    b.addEventListener('click', () => { d.inputs.push({ label: '期間', def: 14 }); renderMaker(); });
    add(b);
  }

  add(el('div', { class: 'sect', text: '線(4本まで)' }));
  d.lines.forEach((l, i) => {
    const nm = el('input', { class: 'ctl', type: 'text', maxlength: '12', 'aria-label': `線${i + 1} の名前` });
    nm.value = l.name;
    nm.addEventListener('input', () => { l.name = nm.value; });
    const col = el('input', { type: 'color', 'aria-label': `線${i + 1} の色` });
    col.value = l.color;
    col.addEventListener('input', () => { l.color = col.value; });
    const rm = el('button', { class: 'x', type: 'button', 'aria-label': `線${i + 1} を削除`, text: '×' });
    rm.addEventListener('click', () => { d.lines.splice(i, 1); renderMaker(); });
    add(el('div', { class: 'mk-row' }, [nm, col, rm]));
    add(...exprBox(l.expr, v => { l.expr = v; }, false, `線${i + 1} の式`));
  });
  if (d.lines.length < 4) {
    const b = el('button', { class: 'ctl btn small', type: 'button', text: '＋ 線を追加' });
    b.addEventListener('click', () => { d.lines.push({ name: `線${d.lines.length + 1}`, expr: '', color: MK_COLORS[d.lines.length % 4] }); renderMaker(); });
    add(b);
  }

  if (!d.overlay) {
    add(el('div', { class: 'sect', text: '棒グラフ(なくてもかまいません。プラスは緑、マイナスは赤)' }));
    add(...exprBox(d.hist, v => { d.hist = v; }, true, '棒グラフの式'));
    const bands = el('input', { class: 'ctl', type: 'text', inputmode: 'text', placeholder: '例: 0 または 70, 30', 'aria-label': '基準線' });
    bands.value = d.bands.join(', ');
    bands.addEventListener('input', () => { d.bands = bands.value.split(/[,、\s]+/).map(Number).filter(v => isFinite(v) && Math.abs(v) <= 1e12).slice(0, 4); });
    add(field('基準線', '横に引く目安の線。数をカンマで区切って4本まで', bands));
  }

  add(el('div', { class: 'sect', text: '合図(2つまで。式が成り立った足に ▲ か ▼ をローソク足に付けます)' }));
  d.marks.forEach((m, i) => {
    const nm = el('input', { class: 'ctl', type: 'text', maxlength: '12', 'aria-label': `合図${i + 1} の名前` });
    nm.value = m.name;
    nm.addEventListener('input', () => { m.name = nm.value; });
    const dir = el('select', { class: 'ctl mk-dir', 'aria-label': `合図${i + 1} の形` }, [el('option', { value: 'up', text: '▲ 足の下' }), el('option', { value: 'down', text: '▼ 足の上' })]);
    dir.value = m.dir;
    dir.addEventListener('change', () => { m.dir = dir.value; mkValid(); });
    const rm = el('button', { class: 'x', type: 'button', 'aria-label': `合図${i + 1} を削除`, text: '×' });
    rm.addEventListener('click', () => { d.marks.splice(i, 1); renderMaker(); });
    add(el('div', { class: 'mk-row' }, [nm, dir, rm]));
    add(...exprBox(m.expr, v => { m.expr = v; }, false, `合図${i + 1} の条件`, true));
  });
  if (d.marks.length < 2) {
    const b = el('button', { class: 'ctl btn small', type: 'button', text: '＋ 合図を追加' });
    b.addEventListener('click', () => { d.marks.push({ name: `合図${d.marks.length + 1}`, expr: '', dir: d.marks.length ? 'down' : 'up' }); renderMaker(); });
    add(b);
  }

  add(el('div', { class: 'sect', text: '見本(いま開いているチャートの直近120本で描いたもの)' }));
  add(el('canvas', { id: 'mkPreview', class: 'mk-preview', role: 'img', 'aria-label': '作っているインジケーターの見本' }));

  // 使える部品:タップすると、最後にさわった式の欄に入る
  const parts = el('details', { class: 'mk-parts' }, [el('summary', { text: '使える部品(タップで式に入ります)' })]);
  const chips = (title, items) => {
    parts.appendChild(el('div', { class: 'sect', text: title }));
    const wrap = el('div', { class: 'mk-chips' });
    items.forEach(([text, hint]) => {
      const b = el('button', { type: 'button', class: 'mk-chip', text, title: hint || '' });
      if (hint) b.appendChild(el('small', { text: hint }));
      b.addEventListener('click', () => {
        const ta = mk.focus && mk.focus.isConnected ? mk.focus : body.querySelector('.mk-expr');
        if (!ta) return;
        const a = ta.selectionStart == null ? ta.value.length : ta.selectionStart, z = ta.selectionEnd == null ? a : ta.selectionEnd;
        ta.value = (ta.value.slice(0, a) + text + ta.value.slice(z)).slice(0, 300);
        ta.focus(); ta.selectionStart = ta.selectionEnd = Math.min(300, a + text.length);
        ta.dispatchEvent(new Event('input'));
      });
      wrap.appendChild(b);
    });
    parts.appendChild(wrap);
  };
  chips('価格・出来高', [['close', '終値'], ['open', '始値'], ['high', '高値'], ['low', '安値'], ['volume', '出来高'], ['hl2', '高値と安値の平均'], ['hlc3', '高・安・終の平均'], ['ohlc4', '4つの平均']]);
  chips('記号', [[' + '], [' - '], [' * ', 'かける'], [' / ', 'わる'], ['('], [')'], [' > ', '大きければ 1'], [' < ', '小さければ 1']]);
  chips('関数', Object.keys(GT.FUNCS).map(k => [GT.FUNCS[k].eg, GT.FUNCS[k].desc]));
  add(parts);

  if (!mk.editId) {
    const imp = el('details', { class: 'mk-parts' }, [el('summary', { text: 'ほかの人が作ったものを取り込む' })]);
    const ta = el('textarea', { class: 'ctl mk-expr', rows: '3', spellcheck: 'false', id: 'mkImport', placeholder: 'GTI1: で始まる文字を貼り付けてください', 'aria-label': '共有された文字' });
    const go = el('button', { class: 'ctl btn small', type: 'button', id: 'mkImportGo', text: '読み込む' });
    const out = el('p', { class: 'mk-check' });
    go.addEventListener('click', () => {
      const def = customFromText(ta.value);
      if (!def) { out.textContent = '読み取れませんでした。「GTI1:」から最後まで、欠けずに貼り付けているか確かめてください。'; out.classList.add('bad'); return; }
      mk.def = def; renderMaker();
      toast('読み込みました。内容を確かめてから保存してください。');
    });
    imp.appendChild(el('p', { class: 'msg', text: '取り込めるのは計算の式だけです。プログラムが動くことはありません。' }));
    imp.appendChild(ta); imp.appendChild(go); imp.appendChild(out);
    add(imp);
  }
  $('mkShare').hidden = $('mkDelete').hidden = !mk.editId;
  mkValid();
}
// 作成画面の小さな見本。上半分に終値と合図、重ねる線。下の枠に出すものは下半分に描く
function drawMkPreview(ok) {
  const cv = $('mkPreview');
  if (!cv) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth || 300, h = 150;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const c = cv.getContext('2d'), th = THEMES[state.theme];
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  const note = t => { c.fillStyle = th.cross; c.font = '12px system-ui, sans-serif'; c.textAlign = 'center'; c.fillText(t, w / 2, h / 2); };
  const N = Math.min(120, state.bars.length);
  if (!ok) return note('式が正しく入ると、ここに見本が出ます');
  if (N < 10) return note('チャートの読み込みが終わると、ここに見本が出ます');
  let out;
  try {
    const vars = {};
    mk.def.inputs.forEach((q, i) => { vars[`p${i + 1}`] = q.def; });
    const made = GT.makeCustom(Object.assign({}, mk.def, { name: mk.def.name || 'x', bands: mk.def.bands || [] }));
    out = made.compute(state.bars, vars);
    out.lines.forEach((l, i) => { l.color = mk.def.lines[i].color; });
  } catch (e) { return note('見本を描けませんでした'); }
  const bars = state.bars.slice(-N), off = state.bars.length - N, X = i => (i + 0.5) / N * w;
  const split = mk.def.overlay ? h : Math.round(h * 0.5);
  const scale = (series, y0, y1, extra) => {
    let lo = Infinity, hi = -Infinity;
    series.forEach(a => { for (let i = 0; i < N; i++) { const v = a[i]; if (isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } } });
    (extra || []).forEach(v => { lo = Math.min(lo, v); hi = Math.max(hi, v); });
    if (!isFinite(lo)) { lo = -1; hi = 1; }
    if (hi === lo) { hi += 1; lo -= 1; }
    return v => y1 - 8 - (v - lo) / (hi - lo) * (y1 - y0 - 16);
  };
  const path = (a, Y, color, width) => {
    c.strokeStyle = color; c.lineWidth = width; c.beginPath();
    let pen = false;
    for (let i = 0; i < N; i++) { const v = a[i]; if (!isFinite(v)) { pen = false; continue; } if (pen) c.lineTo(X(i), Y(v)); else c.moveTo(X(i), Y(v)); pen = true; }
    c.stroke();
  };
  const tail = a => a.slice(off), close = bars.map(b => b.c);
  const over = mk.def.overlay ? out.lines.map(l => tail(l.val)) : [];
  const Yp = scale([close].concat(over), 0, split);
  path(close, Yp, th.cross, 1);
  over.forEach((a, i) => path(a, Yp, out.lines[i].color, 1.5));
  (out.marks || []).forEach(m => {
    const up = m.dir === 'up';
    c.fillStyle = up ? UP : DOWN;
    tail(m.val).forEach((v, i) => {
      if (!(v > 0 || v < 0)) return;
      const x = X(i), y = Yp(close[i]) + (up ? 5 : -5), s = 4;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x - s, y + (up ? 7 : -7)); c.lineTo(x + s, y + (up ? 7 : -7)); c.closePath(); c.fill();
    });
  });
  if (!mk.def.overlay) {
    c.strokeStyle = th.axis; c.lineWidth = 1; c.beginPath(); c.moveTo(0, split + 0.5); c.lineTo(w, split + 0.5); c.stroke();
    const hist = out.hist ? tail(out.hist) : null, lines = out.lines.map(l => tail(l.val));
    const Yi = scale(lines.concat(hist ? [hist] : []), split, h, (out.bands || []).concat(hist ? [0] : []));
    c.setLineDash([2, 3]); c.strokeStyle = th.cross; c.beginPath();
    (out.bands || []).forEach(v => { c.moveTo(0, Yi(v)); c.lineTo(w, Yi(v)); });
    c.stroke(); c.setLineDash([]);
    if (hist) hist.forEach((v, i) => { if (!isFinite(v)) return; c.fillStyle = rgba(v >= 0 ? UP : DOWN, 0.6); const y = Yi(v), y0 = Yi(0); c.fillRect(X(i) - w / N * 0.35, Math.min(y, y0), Math.max(1, w / N * 0.7), Math.max(1, Math.abs(y - y0))); });
    lines.forEach((a, i) => path(a, Yi, out.lines[i].color, 1.5));
  }
}
function saveMaker() {
  if (!mkValid()) return;
  const editing = !!mk.editId;
  if (!editing && customDefs.length >= CUSTOM_MAX) { toast(`自分で作れるのは${CUSTOM_MAX}個までです。使っていないものを削除してください。`); return; }
  const def = registerCustom(Object.assign({}, mk.def, { id: mk.editId || '' }));
  if (!def) { toast('保存できませんでした。式と名前を確かめてください。'); return; }
  if (editing) {
    // すでにチャートに出しているものは、新しい式と初期値で作り直す(表示・非表示の設定は残す)
    state.indicators.forEach(ind => {
      if (ind.type !== def.id) return;
      const base = defaultParams(def.id);
      base.vis = ind.p.vis;
      if (ind.p.weight && !def.overlay) base.weight = ind.p.weight;
      ind.p = base;
    });
    recompute(); save(); draw();
    toast('変更を保存しました。');
  } else if (state.indicators.length >= 30) {
    save();
    toast('保存しました。インジケーターが30個あるため、チャートには追加していません。');
  } else {
    addIndicator(def.id);
    toast(`「${def.name}」をチャートに追加しました。`);
  }
  closeMaker();
}
function deleteCustom(id) {
  const at = customDefs.findIndex(d => d.id === id);
  if (at < 0) return;
  customDefs.splice(at, 1);
  state.indicators = state.indicators.filter(i => i.type !== id);
  delete GT.DEFS[id]; delete IND_TYPES[id];
  save(); draw();
}
function bindMaker() {
  const ov = $('mkOverlay');
  $('mkClose').addEventListener('click', closeMaker);
  $('mkCancel').addEventListener('click', closeMaker);
  $('mkSave').addEventListener('click', saveMaker);
  let armed = 0;
  $('mkDelete').addEventListener('click', () => {
    // 2回押して初めて消す(押しまちがい対策)
    if (Date.now() - armed > 4000) { armed = Date.now(); toast('もう一度「削除」を押すと、このインジケーターを消します。'); return; }
    armed = 0;
    deleteCustom(mk.editId); closeMaker(); toast('削除しました。');
  });
  $('mkShare').addEventListener('click', () => {
    const cur = customDefs.find(d => d.id === mk.editId);
    if (!cur) return;
    const text = customToText(cur);
    const done = () => toast('共有用の文字をコピーしました。相手は「自分で作る」→「取り込む」に貼り付けます。');
    const fallback = () => { window.prompt('この文字をコピーして、相手に送ってください。', text); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  });
}

// ---------------------------------------------------------------- 合図どおりに売買した場合の成績
const bt = { ind: null, side: 'long', exit: 'signal', hold: 10 };
function openBacktest(ind) {
  bt.ind = ind;
  const marks = (ind.out && ind.out.marks) || [];
  const hasUp = marks.some(m => m.dir === 'up'), hasDown = marks.some(m => m.dir === 'down');
  bt.side = hasUp ? 'long' : 'short';
  bt.exit = hasUp && hasDown ? 'signal' : 'bars';
  $('btOverlay').hidden = false;
  renderBacktest();
  $('btClose').focus();
}
function renderBacktest() {
  const ind = bt.ind, body = $('btBody');
  if (!ind || !state.indicators.includes(ind) || !ind.out || !ind.out.marks) { $('btOverlay').hidden = true; return; }
  const marks = ind.out.marks, bars = state.bars;
  const hasUp = marks.some(m => m.dir === 'up'), hasDown = marks.some(m => m.dir === 'down');
  const r = GT.backtest(bars, marks, { side: bt.side, exit: bt.exit, hold: bt.hold, fee: FEE });
  const iv = INTERVALS.find(x => x.id === state.interval);
  $('btTitle').textContent = `「${IND_TYPES[ind.type].name}」の合図で売買していたら`;
  body.textContent = '';
  const add = (...nodes) => nodes.forEach(nd => body.appendChild(nd));
  const pct = (v, sign) => (isFinite(v) ? `${sign && v > 0 ? '+' : ''}${(v * 100).toFixed(Math.abs(v) >= 10 ? 0 : 2)}%` : '—');
  const select = (label, value, options, onChange) => {
    const sel = el('select', { class: 'ctl' }, options.map(([v, t]) => el('option', { value: v, text: t })));
    sel.value = value;
    sel.addEventListener('change', () => { onChange(sel.value); renderBacktest(); });
    return el('label', { class: 'bt-ctl' }, [el('span', { class: 'dim', text: label }), sel]);
  };
  const sides = [];
  if (hasUp) sides.push(['long', '▲ で買う(値上がりをねらう)']);
  if (hasDown) sides.push(['short', '▼ で売りから入る(値下がりをねらう)']);
  if (hasUp && hasDown) sides.push(['both', '両方(▲ で買い、▼ で売りに切りかえ)']);
  const ctl = el('div', { class: 'bt-ctls' }, [select('入り方', bt.side, sides, v => { bt.side = v; })]);
  const oppOk = bt.side === 'both' || (bt.side === 'long' ? hasDown : hasUp);
  if (bt.side !== 'both') {
    ctl.appendChild(select('手じまい', r.exitMode, (oppOk ? [['signal', '反対の合図が出たら']] : []).concat([['bars', '決めた本数がたったら']]), v => { bt.exit = v; }));
    if (r.exitMode === 'bars') {
      const num = el('input', { class: 'ctl', type: 'number', min: '1', max: '1000', step: '1', inputmode: 'numeric' });
      num.value = bt.hold;
      num.addEventListener('change', () => { bt.hold = clamp(Math.round(parseFloat(num.value)) || 10, 1, 1000); renderBacktest(); });
      ctl.appendChild(el('label', { class: 'bt-ctl' }, [el('span', { class: 'dim', text: '何本後に手じまうか' }), num]));
    }
  }
  add(ctl);
  add(el('p', { class: 'dim small', text: `${labelOf(state.symbol)}・${iv ? iv.label : ''}足・${bars.length}本(${fmtDate(bars[0].t)} 〜 ${fmtDate(bars[bars.length - 1].t)})で計算。合図が出た足の「次の足の始値」で売買し、売買のたびに手数料 ${(FEE * 100).toFixed(1)}% を引いています。` }));

  const kpi = (label, value, cls, hint) => {
    const k = el('div', { class: 'kpi' }, [el('span', { class: 'dim', text: label }), el('strong', { class: cls || '', text: value })]);
    if (hint) k.appendChild(el('small', { text: hint }));
    return k;
  };
  const cls = v => (v > 0 ? 'up' : v < 0 ? 'down' : '');
  const diff = r.total - r.holdRet;
  add(el('div', { class: 'kpis' }, [
    kpi('合図どおりの損益', pct(r.total, true), cls(r.total), '資金を毎回すべて使った場合の、期間全体の増減'),
    kpi('何もせず持ち続けた場合', pct(r.holdRet, true), cls(r.holdRet), isFinite(diff) ? `合図どおりのほうが ${pct(Math.abs(diff))} ${diff >= 0 ? '良い' : '悪い'}` : ''),
    kpi('勝率', r.n ? `${(r.wins / r.n * 100).toFixed(0)}%` : '—', '', `売買 ${r.n} 回(勝ち ${r.wins}・負け ${r.losses})`),
    kpi('プロフィットファクター', isFinite(r.pf) ? r.pf.toFixed(2) : r.wins && !r.losses ? '負けなし' : '—', isFinite(r.pf) ? cls(r.pf - 1) : '', '利益の合計 ÷ 損失の合計。1 より大きければ全体でプラス'),
    kpi('最大ドローダウン', r.maxDD > 0 ? pct(-r.maxDD) : '—', r.maxDD > 0 ? 'down' : '', '資金がいちばん多かった時点からの、最大の落ち込み'),
    kpi('平均利益 / 平均損失', `${pct(r.avgWin, true)} / ${pct(r.avgLoss, true)}`, '', `ポジションを持っていた時間は全体の ${(r.exposure * 100).toFixed(0)}%`),
  ]));
  add(el('h3', { text: '資金の推移(開始時を 1 とした倍率)' }));
  const cv = el('canvas', { id: 'btCurve', class: 'curve', role: 'img', 'aria-label': '合図どおりに売買した場合と、持ち続けた場合の資金の推移' });
  add(cv);
  add(el('p', { class: 'dim small', text: '色の線が合図どおり、灰色の線が持ち続けた場合です。' }));

  const warn = [];
  if (r.n === 0) warn.push('この期間では、売買が一度も成立していません。条件がきびしすぎるか、合図の向きと「入り方」が合っていない可能性があります。');
  else if (r.n < 30) warn.push(`売買が ${r.n} 回と少ないため、結果は偶然に大きく左右されます。30回に満たない成績は、参考程度に見てください。`);
  if (r.open) warn.push(`最後の売買は、まだ手じまいしていません(いまの含み損益 ${pct(r.open.ret, true)})。損益には含み分も入れていますが、勝率には数えていません。`);
  warn.push('これは過去の値動きに当てはめた結果で、これからも同じようになることを示すものではありません。成績が良くなるまで式や数値を調整すると、過去にたまたま合っただけの設定になりやすくなります。別の銘柄や時間足でも試して、同じ傾向が出るかを確かめてください。');
  warn.push('実際の売買では、注文が思った価格で通らないこと(すべり)があり、成績はここより悪くなるのがふつうです。');
  add(el('ul', { class: 'bt-notes' }, warn.map(t => el('li', { text: t }))));

  if (r.trades.length) {
    add(el('h3', { text: `売買の記録(新しい順・${Math.min(50, r.trades.length)}件まで)` }));
    const rows = r.trades.slice(-50).reverse().map(t => el('tr', {}, [
      el('td', { text: t.dir > 0 ? '買い' : '売り' }), el('td', { text: fmtDate(t.t0, iv && iv.ms < 86400000) }), el('td', { text: fmtPrice(t.p0) }),
      el('td', { text: fmtDate(t.t1, iv && iv.ms < 86400000) }), el('td', { text: fmtPrice(t.p1) }), el('td', { text: `${t.bars}本` }), el('td', { class: cls(t.ret), text: pct(t.ret, true) }),
    ]));
    add(el('div', { class: 'tbl-wrap' }, [el('table', { class: 'tbl' }, [
      el('thead', {}, [el('tr', {}, ['向き', '入った日', '価格', '手じまい', '価格', '期間', '損益'].map(t => el('th', { text: t })))]), el('tbody', {}, rows)])]));
  }
  drawBtCurve(cv, r);
}
function drawBtCurve(cv, r) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight;
  if (!w) return;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const c = cv.getContext('2d'), th = THEMES[state.theme];
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  const N = r.curve.length, padL = 8, padR = 56, padT = 10, padB = 10;
  let lo = 1, hi = 1;
  r.curve.concat(r.holdCurve).forEach(v => { if (isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } });
  if (hi === lo) { hi += 0.1; lo -= 0.1; }
  const span = hi - lo; lo -= span * 0.08; hi += span * 0.08;
  const X = i => padL + (N > 1 ? i / (N - 1) : 0.5) * (w - padL - padR), Y = v => padT + (hi - v) / (hi - lo) * (h - padT - padB);
  const path = (arr, color, width) => {
    c.beginPath(); arr.forEach((v, i) => (i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v))));
    c.strokeStyle = color; c.lineWidth = width; c.lineJoin = 'round'; c.stroke();
  };
  c.strokeStyle = th.cross; c.setLineDash([3, 3]); c.lineWidth = 1;
  c.beginPath(); c.moveTo(padL, Y(1)); c.lineTo(w - padR, Y(1)); c.stroke(); c.setLineDash([]);
  path(r.holdCurve, th.cross, 1);
  const color = r.total >= 0 ? UP : DOWN;
  path(r.curve, color, 2);
  c.font = '11px -apple-system, "Segoe UI", "Hiragino Sans", sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'left';
  const ya = Y(r.curve[N - 1]); let yb = Y(r.holdCurve[N - 1]);
  if (Math.abs(ya - yb) < 13) yb = ya + (yb >= ya ? 13 : -13); // 文字が重ならないようにずらす
  c.fillStyle = color; c.fillText(`合図 ${r.curve[N - 1].toFixed(2)}`, w - padR + 4, ya);
  c.fillStyle = th.text; c.fillText(`保有 ${r.holdCurve[N - 1].toFixed(2)}`, w - padR + 4, clamp(yb, 8, h - 8));
}
function bindBacktest() {
  const ov = $('btOverlay');
  $('btClose').addEventListener('click', () => { ov.hidden = true; });
  ov.addEventListener('pointerdown', e => { if (e.target === ov) ov.hidden = true; });
  window.addEventListener('resize', () => { if (!ov.hidden) renderBacktest(); });
}

// ---------------------------------------------------------------- 起動
load();
buildTopbar();
bindTrade();
bindMaker();
bindBacktest();
bindHelp();
bindPointer();
new ResizeObserver(resize).observe(wrap);
resize();
loadData();
setInterval(poll, 5000);
setInterval(pollPositions, 15000);
setInterval(() => {
  if (document.hidden) return;
  if (!dlg.ind) draw();   // 残り時間の表示を進める
  renderQuote();          // 気配値が古くなったら、表示を消す
  renderTrade();          // 価格が古くなったら、注文ボタンを止める
}, 1000);
// 「最後に価格を確かめた時刻」を定期的に保存する(次に開いたとき、閉じていた間の値動きを調べる起点になる)
setInterval(() => { if (!document.hidden && Object.keys(T.positions).length) saveTrade(); }, 30000);
window.addEventListener('pagehide', saveTrade);
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); saveTrade(); return; }
  // 長く裏に回っていた(スリープなど)あとは、その間の値動きを調べ直す
  if (hiddenAt && Date.now() - hiddenAt > 90000) Object.keys(reconciled).forEach(k => delete reconciled[k]);
  poll();
});
})();
