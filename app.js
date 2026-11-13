/* Gold Trade Chart
 * ローソク足+出来高+Volume (c-c) 系インジケーターを
 * canvas に描く、外部ライブラリなしのチャート。
 */
(() => {
'use strict';

// ---------------------------------------------------------------- 定数
const SYMBOLS = [
  { id: 'PAXGUSDT', label: '金 PAXG/USDT', base: 4000 },
  { id: 'BTCUSDT', label: 'BTC/USDT', base: 77000 },
  { id: 'ETHUSDT', label: 'ETH/USDT', base: 3000 },
  { id: 'XRPUSDT', label: 'XRP/USDT', base: 1.4 },
  { id: 'SOLUSDT', label: 'SOL/USDT', base: 150 },
];
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
const MA_KINDS = [['sma', '単純 (SMA)'], ['ema', '指数 (EMA)'], ['rma', 'Smoothed (RMA)']];

function defaultParams(type) {
  const vis = {};
  INTERVALS.forEach(iv => { vis[iv.id] = true; });
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
      indicators: state.indicators.map(i => ({ type: i.type, hidden: i.hidden, p: i.p })),
    }));
  } catch (e) { /* 保存できなくても表示は続ける */ }
}
function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { s = null; }
  if (s && SYMBOLS.some(x => x.id === s.symbol)) state.symbol = s.symbol;
  if (s && INTERVALS.some(x => x.id === s.interval)) state.interval = s.interval;
  if (s && THEMES[s.theme]) state.theme = s.theme;
  else if (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) state.theme = 'dark';
  if (s && s.mainWeight > 0) state.mainWeight = s.mainWeight;
  if (s && s.drawings && typeof s.drawings === 'object') state.drawings = s.drawings;
  const list = s && Array.isArray(s.indicators)
    ? s.indicators.filter(i => i && IND_TYPES[i.type])
    : [{ type: 'ma' }, { type: 'ccOnly' }, { type: 'enhanced' }];
  list.forEach(i => addIndicator(i.type, i.p, i.hidden, true));
}

// ---------------------------------------------------------------- 計算
function sma(a, n) {
  const out = new Array(a.length).fill(NaN);
  let sum = 0, cnt = 0, first = -1;
  for (let i = 0; i < a.length; i++) {
    if (!isFinite(a[i])) continue;
    if (first < 0) first = i;
    sum += a[i]; cnt++;
    if (cnt > n) { sum -= a[i - n]; cnt--; }
    if (cnt === n) out[i] = sum / n;
  }
  return out;
}
// alpha を渡すと EMA、省略すると RMA(Wilder の平滑化)
function rma(a, n, alpha) {
  const k = alpha || 1 / n;
  const out = new Array(a.length).fill(NaN);
  let prev = NaN, sum = 0, cnt = 0;
  for (let i = 0; i < a.length; i++) {
    if (!isFinite(a[i])) continue;
    if (!isFinite(prev)) {
      sum += a[i]; cnt++;
      if (cnt === n) { prev = sum / n; out[i] = prev; }
    } else {
      prev = k * a[i] + (1 - k) * prev;
      out[i] = prev;
    }
  }
  return out;
}
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
  const val = p.kind === 'ema' ? rma(src, n, 2 / (n + 1)) : p.kind === 'rma' ? rma(src, n) : sma(src, n);
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
  state.indicators.forEach(ind => { ind.out = (fns[ind.type] || computeCC)(state.bars, ind.p); });
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
async function fetchKlines(symbol, api, limit, endTime) {
  let lastErr;
  for (const host of HOSTS) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    try {
      const res = await fetch(`${host}/api/v3/klines?symbol=${symbol}&interval=${api}&limit=${limit}${endTime ? '&endTime=' + endTime : ''}`, { signal: ac.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const rows = await res.json();
      if (!Array.isArray(rows) || !rows.length) throw new Error('empty');
      return rows.map(r => ({ t: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] }));
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
  if (resetView) resetViewport();
  draw();
}
async function loadData() {
  const token = ++state.loadToken;
  const iv = curInterval(), sym = curSymbol();
  setStatus('', '読み込み中');
  setLoading(true);
  closeStream();
  more.busy = false; more.done = false; more.retryAt = 0;
  try {
    const raw = await fetchKlines(sym.id, iv.api, 1000);
    if (token !== state.loadToken) return;
    state.live = true;
    setStatus('live', 'ライブ');
    $('banner').hidden = true;
    setLoading(false);
    setBars(raw, true);
    openStream();
  } catch (e) {
    if (token !== state.loadToken) return;
    state.live = false;
    setStatus('demo', 'デモ');
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
const STREAMS = ['wss://data-stream.binance.vision/ws/', 'wss://stream.binance.com:9443/ws/'];
function closeStream() {
  const s = ws;
  ws = null;
  if (s) { try { s.close(); } catch (e) { /* 何もしない */ } }
}
function openStream() {
  closeStream();
  if (!state.live || !window.WebSocket) return;
  const token = state.loadToken;
  const name = `${state.symbol.toLowerCase()}@kline_${curInterval().api}`;
  let k = 0;
  const connect = () => {
    if (token !== state.loadToken || k >= STREAMS.length) return;
    let opened = false, s;
    try { s = new WebSocket(STREAMS[k] + name); } catch (e) { k++; connect(); return; }
    ws = s;
    s.onopen = () => { opened = true; };
    s.onmessage = ev => {
      if (token !== state.loadToken) return;
      try {
        const m = JSON.parse(ev.data).k;
        if (m) mergeTail([{ t: +m.t, o: +m.o, h: +m.h, l: +m.l, c: +m.c, v: +m.v }]);
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
async function poll() {
  if (!state.live || document.hidden) return;
  if (ws && ws.readyState <= 1) return; // 配信中・接続中は任せる
  const token = state.loadToken, iv = curInterval();
  try {
    const tail = await fetchKlines(state.symbol, iv.api, 3);
    if (token !== state.loadToken) return;
    mergeTail(tail);
    if (!ws) openStream();
  } catch (e) { /* 次の周期でやり直す */ }
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
  state.end = state.bars.length + 5;
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
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(v);
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
    if (n && !pane.ind) { drawMain(pane, i0, i1, th); drawDrawings(pane); }
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
  // 重ねて描くインジケーター(移動平均線)
  visibleOverlays().forEach(ind => {
    if (ind.hidden || !ind.out) return;
    const val = ind.out.val;
    ctx.strokeStyle = ind.p.color; ctx.lineWidth = +ind.p.width || 1.5; ctx.lineJoin = 'round';
    ctx.beginPath();
    let pen = false;
    for (let i = Math.max(0, i0 - 1); i <= Math.min(bars.length - 1, i1 + 1); i++) {
      if (!isFinite(val[i])) { pen = false; continue; }
      if (pen) ctx.lineTo(xOf(i), yOf(val[i])); else ctx.moveTo(xOf(i), yOf(val[i]));
      pen = true;
    }
    ctx.stroke();
    ctx.lineWidth = 1;
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
  if (p.pivots && p.showPlot) {
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

function drawSimple(pane, i0, i1, th) {
  const ind = pane.ind, out = ind.out, pw = plotW(), bw = state.barW;
  if (!out) return;
  let lo = Infinity, hi = -Infinity;
  if (out.fixed) [lo, hi] = out.fixed;
  else {
    const all = out.lines.map(l => l.val).concat(out.hist ? [out.hist] : []);
    for (let i = i0; i <= i1; i++) all.forEach(arr => { if (isFinite(arr[i])) { lo = Math.min(lo, arr[i]); hi = Math.max(hi, arr[i]); } });
    out.bands.forEach(v => { lo = Math.min(lo, v); hi = Math.max(hi, v); });
  }
  if (!isFinite(lo) || !isFinite(hi)) { lo = -1; hi = 1; }
  if (hi === lo) { hi += 1; lo -= 1; }
  const padV = out.fixed ? 0 : (hi - lo) * 0.12;
  const min = lo - padV, max = hi + padV * 0.5 + (out.fixed ? 0 : headroom(lo - padV, hi, pane, compact ? 30 : 24));
  const yOf = v => pane.y + pane.h - (v - min) / (max - min) * pane.h;
  pane.yOf = yOf; pane.vOf = y => min + (pane.y + pane.h - y) / pane.h * (max - min); pane.fmt = fmtCompact;
  gridAndAxis(pane, min, max, yOf, th, fmtCompact);
  if (ind.hidden) return;

  ctx.save();
  ctx.beginPath(); ctx.rect(0, pane.y, pw, pane.h); ctx.clip();
  if (out.bands.length === 2) {
    ctx.fillStyle = rgba(out.lines[0].color, 0.08);
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
      const growing = Math.abs(v) >= Math.abs(out.hist[i - 1]); // 勢いが増している棒は濃く
      ctx.fillStyle = rgba(v >= 0 ? UP : DOWN, growing ? 0.85 : 0.4);
      const y = yOf(v);
      ctx.fillRect(Math.round(xOf(i) - body / 2), Math.min(y, y0), body, Math.max(1, Math.abs(y - y0)));
    }
  }
  ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
  out.lines.forEach(l => {
    ctx.strokeStyle = l.color;
    ctx.beginPath();
    let pen = false;
    for (let i = Math.max(0, i0 - 1); i <= Math.min(state.bars.length - 1, i1 + 1); i++) {
      if (!isFinite(l.val[i])) { pen = false; continue; }
      if (pen) ctx.lineTo(xOf(i), yOf(l.val[i])); else ctx.moveTo(xOf(i), yOf(l.val[i]));
      pen = true;
    }
    ctx.stroke();
  });
  ctx.lineWidth = 1;
  ctx.restore();
  const l0 = out.lines[0], lv = l0.val[state.bars.length - 1];
  if (isFinite(lv)) {
    const y = yOf(lv);
    if (y > pane.y && y < pane.y + pane.h) axisTag(y, fmtCompact(lv), l0.color, '#ffffff', pane);
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
    `<span>${label ? `<span class="dim">${label}</span> ` : ''}<span style="color:${color || 'inherit'}">${value}</span></span>`).join('');
  const t = el.querySelector('.vals');
  if (t.innerHTML !== html) t.innerHTML = html;
}
function updateLegends() {
  const i = hoverIndex(), used = new Set();
  panes.forEach(pane => {
    const key = pane.ind ? 'ind' + pane.ind.id : 'main';
    used.add(key);
    const el = legendFor(key, pane.ind, pane.ind ? null : mainStack());
    if (pane.ind) el.style.top = (pane.y + 4) + 'px';
    if (!pane.ind) {
      mainStack().style.top = (pane.y + 4) + 'px';
      visibleOverlays().forEach(ov => {
        const k = 'ind' + ov.id, le = legendFor(k, ov, mainStack());
        used.add(k);
        le.classList.toggle('off', !!ov.hidden);
        setText(le, '.name', 'MA');
        setText(le, '.params', `${ov.p.kind.toUpperCase()} ${ov.p.len}`);
        setVals(le, ov.out && i >= 0 ? [['', fmtPrice(ov.out.val[i]), ov.p.color]] : []);
      });
      setText(el, '.name', `${curSymbol().label} · ${curInterval().label}`);
      setText(el, '.params', state.live ? 'Binance' : 'デモ');
      el.classList.add('main');
      const b = state.bars[i];
      if (!b) { setVals(el, []); return; }
      const prev = state.bars[i - 1], col = b.c >= b.o ? UP : DOWN;
      const names = compact ? ['始', '高', '安', '終'] : ['始値', '高値', '安値', '終値'];
      const items = [b.o, b.h, b.l, b.c].map((v, k) => [names[k], fmtPrice(v), col]);
      if (prev) {
        const d = b.c - prev.c;
        items.push(['', `${d >= 0 ? '+' : ''}${fmtPrice(d, b.c)} (${d >= 0 ? '+' : ''}${(d / prev.c * 100).toFixed(2)}%)`, d >= 0 ? UP : DOWN]);
      }
      items.push(['出来高', fmtCompact(b.v), col]);
      setVals(el, items);
      return;
    }
    const ind = pane.ind, p = ind.p, T = IND_TYPES[ind.type];
    el.classList.toggle('off', !!ind.hidden);
    setText(el, '.name', T.name);
    if (T.simple) {
      setText(el, '.params', ind.out ? ind.out.label : '');
      setVals(el, ind.out && i >= 0 ? ind.out.lines.map(l => [l.name === T.name ? '' : l.name, fmtCompact(l.val[i]), l.color]) : []);
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
function addIndicator(type, p, hidden, silent) {
  const base = defaultParams(type);
  const merged = Object.assign({}, base, p || {});
  merged.vis = Object.assign({}, base.vis, (p && p.vis) || {});
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

  if (ind.type === 'ma' && dlg.tab === 'params') {
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
  SYMBOLS.forEach(s => sel.appendChild(el('option', { value: s.id, text: s.label })));
  sel.value = state.symbol;
  sel.addEventListener('change', () => { state.symbol = sel.value; save(); loadData(); });

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
  Object.entries(IND_TYPES).forEach(([type, T]) => {
    const b = el('button', { type: 'button', text: T.name }, []);
    b.appendChild(el('small', { text: hints[type] }));
    b.addEventListener('click', () => { addIndicator(type); toggleMenu(false); });
    menu.appendChild(b);
  });
  const toggleMenu = on => { menu.hidden = !on; btn.setAttribute('aria-expanded', String(on)); };
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
    closeDialog(false); toggleMenu(false); toggleDraw(false);
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
  let pinch = 0, resizing = null, moved = 0, dragD = null;
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
      canvas.style.cursor = dividerAt(p.y, 4) >= 0 ? 'ns-resize' : '';
    }
    state.hover = p; draw();
  });
  const up = e => {
    pts.delete(e.pointerId); pinch = 0;
    const special = !!resizing || (dragD && moved > 8);
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

// ---------------------------------------------------------------- 起動
load();
buildTopbar();
bindPointer();
new ResizeObserver(resize).observe(wrap);
resize();
loadData();
setInterval(poll, 15000);
setInterval(() => { if (!document.hidden && !dlg.ind) draw(); }, 1000); // 残り時間の表示を進める
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
})();
