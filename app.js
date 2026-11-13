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
    defaults: { agg: 'smoothed', showMa: false, signMa: false },
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
};

function defaultParams(type) {
  const vis = {};
  INTERVALS.forEach(iv => { vis[iv.id] = true; });
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
    colAbove: '#4caf50',
    colBelow: '#1b7f3b',
    colMa: '#2ecc40',
    colMaNeg: '#e53935',
    opAbove: 0.6,
    opBelow: 0.95,
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
      symbol: state.symbol, interval: state.interval, theme: state.theme,
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
  const list = s && Array.isArray(s.indicators)
    ? s.indicators.filter(i => i && IND_TYPES[i.type])
    : [{ type: 'ccOnly' }, { type: 'enhanced' }];
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
function recompute() {
  state.indicators.forEach(ind => { ind.out = computeCC(state.bars, ind.p); });
}

// ---------------------------------------------------------------- データ
function groupBars(raw, group, ms) {
  if (group <= 1) return raw.slice();
  const span = ms * group, out = [];
  let cur = null, key = null;
  for (const b of raw) {
    const k = Math.floor(b.t / span);
    if (k !== key) {
      cur = { t: k * span, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v };
      out.push(cur); key = k;
    } else {
      cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l);
      cur.c = b.c; cur.v += b.v;
    }
  }
  return out;
}
async function fetchKlines(symbol, api, limit) {
  let lastErr;
  for (const host of HOSTS) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    try {
      const res = await fetch(`${host}/api/v3/klines?symbol=${symbol}&interval=${api}&limit=${limit}`, { signal: ac.signal });
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
  try {
    const raw = await fetchKlines(sym.id, iv.api, 1000);
    if (token !== state.loadToken) return;
    state.live = true;
    setStatus('live', 'ライブ');
    showNotice('');
    setBars(raw, true);
  } catch (e) {
    if (token !== state.loadToken) return;
    state.live = false;
    setStatus('demo', 'デモデータ');
    showNotice('価格データを取得できなかったため、見本用のデモデータを表示しています。実際の価格ではありません。');
    setBars(demoBars(sym, iv, 600), true);
  }
}
async function poll() {
  if (!state.live || document.hidden) return;
  const token = state.loadToken, iv = curInterval();
  try {
    const tail = await fetchKlines(state.symbol, iv.api, 3);
    if (token !== state.loadToken) return;
    const raw = state.raw.slice();
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
    draw();
  } catch (e) { /* 次の周期でやり直す */ }
}
function setStatus(cls, text) {
  const el = $('status');
  el.className = 'badge' + (cls ? ' ' + cls : '');
  el.textContent = text;
}
let noticeTimer = 0;
function showNotice(text) {
  const el = $('notice');
  el.hidden = !text;
  el.textContent = text;
  clearTimeout(noticeTimer);
  // 案内は数秒で消す(右上の「デモデータ」表示は残る)
  if (text) noticeTimer = setTimeout(() => { el.hidden = true; }, 8000);
}

// ---------------------------------------------------------------- 書式
function priceDigits(v) {
  const a = Math.abs(v);
  if (a >= 1000) return 2;
  if (a >= 1) return a >= 100 ? 2 : 4;
  if (a >= 0.01) return 5;
  return 8;
}
const fmtPrice = v => isFinite(v)
  ? v.toLocaleString('en-US', { minimumFractionDigits: priceDigits(v), maximumFractionDigits: priceDigits(v) })
  : '—';
function fmtCompact(v) {
  if (!isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a < 1e-9) return '0';
  const units = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (const [n, u] of units) if (a >= n) return (v / n).toFixed(2) + u;
  return a >= 10 ? v.toFixed(1) : a >= 0.1 ? v.toFixed(2) : v.toFixed(4);
}
const pad2 = n => String(n).padStart(2, '0');
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
let W = 0, H = 0, axisW = 64;
const TIME_H = 24;
let panes = [];

function visibleIndicators() {
  return state.indicators.filter(i => i.p.vis[state.interval] !== false);
}
function layout() {
  axisW = W < 520 ? 54 : 66;
  const inds = visibleIndicators();
  const total = H - TIME_H;
  const weights = [inds.length ? 2.6 : 1].concat(inds.map(() => 1));
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
function axisTag(y, text, bg, fg, pane) {
  const h = 18;
  const yy = clamp(y, pane.y + h / 2, pane.y + pane.h - h / 2);
  ctx.fillStyle = bg;
  ctx.fillRect(plotW(), yy - h / 2, axisW, h);
  ctx.fillStyle = fg;
  ctx.textAlign = 'left';
  ctx.fillText(text, plotW() + 5, yy);
}
function draw() {
  if (!W) return;
  const th = THEMES[state.theme];
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
    let prev = null;
    for (let i = Math.ceil(i0 / step) * step; i <= i1; i += step) {
      const d = new Date(bars[i].t);
      let text;
      if (intraday) {
        text = !prev || prev.getDate() !== d.getDate()
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
    if (n) (pane.ind ? drawIndicator : drawMain)(pane, i0, i1, th);
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

  drawCrosshair(th);
  updateLegends();
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
    if (y > pane.y + 8 && y < pane.y + pane.h - 8) ctx.fillText(fmt(v), pw + 5, y);
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
  const min = lo - padV * 1.6, max = hi + padV;
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
  // 最新の価格ライン
  const last = bars[bars.length - 1];
  const col = last.c >= last.o ? UP : DOWN;
  const ly = Math.round(yOf(last.c)) + 0.5;
  ctx.strokeStyle = col; ctx.setLineDash([2, 3]);
  ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(pw, ly); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  if (ly > pane.y && ly < pane.y + pane.h) axisTag(ly, fmtPrice(last.c), col, '#ffffff', pane);
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
  const min = lo - padV, max = hi + padV;
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
  if (pane && pane.vOf) axisTag(hv.y, pane.fmt(pane.vOf(hv.y)), th.tagBg, th.tagText, pane);

  const text = fmtDate(state.bars[i].t, curInterval().ms < 864e5);
  const tw = ctx.measureText(text).width + 12;
  const tx = clamp(x - tw / 2, 0, pw - tw);
  ctx.fillStyle = th.tagBg; ctx.fillRect(tx, H - TIME_H + 2, tw, TIME_H - 4);
  ctx.fillStyle = th.tagText; ctx.textAlign = 'center';
  ctx.fillText(text, tx + tw / 2, H - TIME_H / 2);
}

// ---------------------------------------------------------------- 凡例
const legendEls = new Map();
function legendFor(key, ind) {
  let el = legendEls.get(key);
  if (el) return el;
  el = document.createElement('div');
  el.className = 'legend';
  el.innerHTML = '<span class="name"></span><span class="dim params"></span><span class="vals"></span>';
  if (ind) {
    const tools = document.createElement('span');
    tools.className = 'tools';
    [['👁', '表示/非表示', () => { ind.hidden = !ind.hidden; save(); draw(); }],
     ['⚙', '設定', () => openDialog(ind)],
     ['🗑', '削除', () => removeIndicator(ind)]].forEach(([icon, label, fn]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = icon; b.title = label; b.setAttribute('aria-label', label);
      b.addEventListener('click', fn);
      tools.appendChild(b);
    });
    el.appendChild(tools);
    el.addEventListener('dblclick', () => openDialog(ind));
  }
  legendsEl.appendChild(el);
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
    const el = legendFor(key, pane.ind);
    el.style.top = (pane.y + 4) + 'px';
    if (!pane.ind) {
      setText(el, '.name', `${curSymbol().label} · ${curInterval().label}`);
      setText(el, '.params', state.live ? 'Binance' : 'デモ');
      const b = state.bars[i];
      if (!b) { setVals(el, []); return; }
      const prev = state.bars[i - 1], col = b.c >= b.o ? UP : DOWN;
      const items = [['始値', fmtPrice(b.o), col], ['高値', fmtPrice(b.h), col], ['安値', fmtPrice(b.l), col], ['終値', fmtPrice(b.c), col]];
      if (prev) {
        const d = b.c - prev.c;
        items.push(['', `${d >= 0 ? '+' : ''}${fmtPrice(d)} (${d >= 0 ? '+' : ''}${(d / prev.c * 100).toFixed(2)}%)`, d >= 0 ? UP : DOWN]);
      }
      items.push(['出来高', fmtCompact(b.v), col]);
      setVals(el, items);
      return;
    }
    const ind = pane.ind, p = ind.p, T = IND_TYPES[ind.type];
    el.classList.toggle('off', !!ind.hidden);
    setText(el, '.name', T.name);
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
const dlg = { ind: null, backup: null, tab: 'params' };

function openDialog(ind) {
  dlg.ind = ind;
  dlg.backup = JSON.parse(JSON.stringify(ind.p));
  dlg.tab = 'params';
  $('dlgTitle').textContent = IND_TYPES[ind.type].name;
  $('overlay').hidden = false;
  renderDialog();
  $('dlgOk').focus();
}
function closeDialog(keep) {
  if (!dlg.ind) return;
  if (!keep) dlg.ind.p = dlg.backup;
  dlg.ind = null;
  $('overlay').hidden = true;
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
  const ind = dlg.ind, T = IND_TYPES[ind.type], L = T.labels;
  const body = $('dlgBody');
  body.textContent = '';
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === dlg.tab));
  const add = (...nodes) => nodes.forEach(nd => body.appendChild(nd));

  if (dlg.tab === 'params') {
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
    b.addEventListener('click', () => {
      state.interval = iv.id;
      [...seg.children].forEach(c => c.classList.toggle('on', c === b));
      save(); loadData();
    });
    seg.appendChild(b);
  });

  const menu = $('indMenu'), btn = $('indBtn');
  const hints = {
    ccOnly: '値動きの向きと強さで重みづけした出来高',
    enhanced: '上の値に、ゼロ上下で色が変わる SMA 線を追加',
  };
  Object.entries(IND_TYPES).forEach(([type, T]) => {
    const b = el('button', { type: 'button', text: T.name }, []);
    b.appendChild(el('small', { text: hints[type] }));
    b.addEventListener('click', () => { addIndicator(type); toggleMenu(false); });
    menu.appendChild(b);
  });
  const toggleMenu = on => { menu.hidden = !on; btn.setAttribute('aria-expanded', String(on)); };
  btn.addEventListener('click', e => { e.stopPropagation(); toggleMenu(menu.hidden); });
  document.addEventListener('click', e => { if (!menu.contains(e.target)) toggleMenu(false); });

  $('themeBtn').addEventListener('click', () => {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = state.theme;
    save(); draw();
  });

  document.querySelectorAll('.tab').forEach(t =>
    t.addEventListener('click', () => { dlg.tab = t.dataset.tab; renderDialog(); }));
  $('dlgOk').addEventListener('click', () => closeDialog(true));
  $('dlgCancel').addEventListener('click', () => closeDialog(false));
  $('dlgClose').addEventListener('click', () => closeDialog(false));
  $('dlgReset').addEventListener('click', () => {
    dlg.ind.p = defaultParams(dlg.ind.type);
    renderDialog(); applyLive();
  });
  $('overlay').addEventListener('pointerdown', e => { if (e.target === $('overlay')) closeDialog(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeDialog(false); toggleMenu(false); } });
}

// ---------------------------------------------------------------- 操作
function zoomAt(x, factor) {
  const idx = startIdx() + x / state.barW;
  const bw = clamp(state.barW * factor, 1.5, 60);
  state.end = idx - x / bw + plotW() / bw;
  state.barW = bw;
}
function bindPointer() {
  const pts = new Map();
  let pinch = 0;
  const pos = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, pos(e));
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
    state.hover = pos(e); draw();
  });
  canvas.addEventListener('pointermove', e => {
    const p = pos(e), prev = pts.get(e.pointerId);
    if (prev && pts.size === 1) {
      state.end -= (p.x - prev.x) / state.barW;
      pts.set(e.pointerId, p);
    } else if (prev && pts.size === 2) {
      pts.set(e.pointerId, p);
      const [a, b] = [...pts.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0 && dist > 0) zoomAt((a.x + b.x) / 2, dist / pinch);
      pinch = dist;
    }
    state.hover = p; draw();
  });
  const up = e => {
    pts.delete(e.pointerId); pinch = 0;
    if (e.pointerType !== 'mouse' && e.type !== 'pointerup') state.hover = null;
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
  canvas.addEventListener('dblclick', () => { resetViewport(); draw(); });
}

// ---------------------------------------------------------------- 起動
load();
document.documentElement.dataset.theme = state.theme;
buildTopbar();
bindPointer();
$('notice').addEventListener('click', () => showNotice(''));
new ResizeObserver(resize).observe(wrap);
resize();
loadData();
setInterval(poll, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
})();
