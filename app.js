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
/* 最初から選べる銘柄。取引所(Binance)で実際に取引されていて、出来高のあるものを、分類ごとに並べる。
 * 2026年11月に、時価総額の順位(CoinMarketCap)と、Binance の24時間の出来高を調べて選んだ。
 * base は、取引所につながらないときに見本の値動きを作るための、だいたいの価格 */
const SYMBOL_CATS = [
  ['fx', '為替'], ['pop', '人気の銘柄'], ['gold', '金(ゴールド)'], ['major', '主要な暗号資産'], ['meme', '話題の銘柄(値動きがとても大きい)'],
  ['stock', '米国株・ETF(トークン化 bStocks)'], ['jpy', '円建て'], ['btc', 'BTC 建て'],
];
// long は銘柄の一覧に出す名前(日本語の名前つき)。label は、凡例・履歴・お知らせなどに使う短い名前
const sym = (id, long, base, cat, quote) => {
  const pair = (long.match(/[A-Z0-9]+\/[A-Z]+/) || [long])[0];
  return { id, long, label: cat === 'gold' ? long : pair, base, cat, quote: quote || 'USDT' };
};
/* 並び順は、利用者から届いた TradingView の銘柄リスト(人気の銘柄が上)に合わせた(2026年11月)。
 * リストは米ドル建て(BTCUSD など)だが、このサイトは Binance のデータを使うので、同じ銘柄の USDT 建てを載せている。
 * Binance で取引されていない銘柄(TRIA、FLUID、FLR、LIGHTER、GFI、VVV)と、指数・先物(DVOL など)は載せていない */
const SYMBOLS = [
  sym('USDJPY', 'USD/JPY ドル円(計算値)', 155, 'fx', 'JPY'),
  sym('EURUSDT', 'EUR/USDT ユーロ/ドル', 1.1, 'fx'),
  sym('BTCUSDT', 'BTC/USDT ビットコイン', 65000, 'pop'),
  sym('ETHUSDT', 'ETH/USDT イーサリアム', 1800, 'pop'),
  sym('SOLUSDT', 'SOL/USDT ソラナ', 71, 'pop'),
  sym('XRPUSDT', 'XRP/USDT リップル', 0.96, 'pop'),
  sym('HYPEUSDT', 'HYPE/USDT ハイパーリキッド', 66, 'pop'),
  sym('LINKUSDT', 'LINK/USDT チェーンリンク', 9.1, 'pop'),
  sym('INJUSDT', 'INJ/USDT インジェクティブ', 6.8, 'pop'),
  sym('XLMUSDT', 'XLM/USDT ステラ', 0.14, 'pop'),
  sym('ADAUSDT', 'ADA/USDT カルダノ', 0.15, 'pop'),
  sym('BCHUSDT', 'BCH/USDT ビットコインキャッシュ', 208, 'pop'),
  sym('DOGEUSDT', 'DOGE/USDT ドージコイン', 0.059, 'pop'),
  sym('LTCUSDT', 'LTC/USDT ライトコイン', 45, 'pop'),
  sym('SUSDT', 'S/USDT ソニック', 0.033, 'pop'),
  sym('SUIUSDT', 'SUI/USDT スイ', 0.72, 'pop'),
  sym('ZECUSDT', 'ZEC/USDT ジーキャッシュ', 880, 'pop'),
  sym('BNBUSDT', 'BNB/USDT', 590, 'pop'),
  sym('PAXGUSDT', '金 PAXG/USDT', 3860, 'gold'),
  sym('XAUTUSDT', '金 XAUT/USDT', 3860, 'gold'),
  sym('ICPUSDT', 'ICP/USDT インターネットコンピューター', 2.2, 'major'),
  sym('ZROUSDT', 'ZRO/USDT レイヤーゼロ', 1.4, 'major'),
  sym('TAOUSDT', 'TAO/USDT ビットテンソル', 190, 'major'),
  sym('ATOMUSDT', 'ATOM/USDT コスモス', 1.3, 'major'),
  sym('NEARUSDT', 'NEAR/USDT ニア', 3.1, 'major'),
  sym('AVAXUSDT', 'AVAX/USDT アバランチ', 7.2, 'major'),
  sym('ETCUSDT', 'ETC/USDT イーサリアムクラシック', 5.9, 'major'),
  sym('ARBUSDT', 'ARB/USDT アービトラム', 0.13, 'major'),
  sym('SEIUSDT', 'SEI/USDT セイ', 0.039, 'major'),
  sym('DASHUSDT', 'DASH/USDT ダッシュ', 37, 'major'),
  sym('RENDERUSDT', 'RENDER/USDT レンダー', 1.4, 'major'),
  sym('CHZUSDT', 'CHZ/USDT チリーズ', 0.0097, 'major'),
  sym('ONDOUSDT', 'ONDO/USDT オンド', 0.3, 'major'),
  sym('POLUSDT', 'POL/USDT ポリゴン', 0.08, 'major'),
  sym('AAVEUSDT', 'AAVE/USDT アーベ', 108, 'major'),
  sym('APTUSDT', 'APT/USDT アプトス', 0.45, 'major'),
  sym('GRTUSDT', 'GRT/USDT ザ・グラフ', 0.017, 'major'),
  sym('FILUSDT', 'FIL/USDT ファイルコイン', 0.6, 'major'),
  sym('JASMYUSDT', 'JASMY/USDT ジャスミー', 0.0032, 'major'),
  sym('AEROUSDT', 'AERO/USDT エアロドローム', 0.42, 'major'),
  sym('UNIUSDT', 'UNI/USDT ユニスワップ', 5.1, 'major'),
  sym('FETUSDT', 'FET/USDT', 0.13, 'major'),
  sym('DOTUSDT', 'DOT/USDT ポルカドット', 0.72, 'major'),
  sym('QNTUSDT', 'QNT/USDT クアント', 156, 'major'),
  sym('TRXUSDT', 'TRX/USDT トロン', 0.3, 'major'),
  sym('HBARUSDT', 'HBAR/USDT ヘデラ', 0.058, 'major'),
  sym('SHIBUSDT', 'SHIB/USDT 柴犬コイン', 0.0000039, 'meme'),
  sym('PEPEUSDT', 'PEPE/USDT', 0.0000039, 'meme'),
  sym('PUMPUSDT', 'PUMP/USDT パンプファン', 0.0029, 'meme'),
  sym('BONKUSDT', 'BONK/USDT', 0.0000024, 'meme'),
  sym('WIFUSDT', 'WIF/USDT', 0.13, 'meme'),
  sym('PENGUUSDT', 'PENGU/USDT', 0.005, 'meme'),
  sym('TRUMPUSDT', 'TRUMP/USDT', 0.97, 'meme'),
  sym('NVDABUSDT', 'エヌビディア NVDAB/USDT', 160, 'stock'),
  sym('TSLABUSDT', 'テスラ TSLAB/USDT', 385, 'stock'),
  sym('AAPLBUSDT', 'アップル AAPLB/USDT', 356, 'stock'),
  sym('MSFTBUSDT', 'マイクロソフト MSFTB/USDT', 520, 'stock'),
  sym('GOOGLBUSDT', 'アルファベット GOOGLB/USDT', 290, 'stock'),
  sym('METABUSDT', 'メタ METAB/USDT', 634, 'stock'),
  sym('AMDBUSDT', 'AMD AMDB/USDT', 518, 'stock'),
  sym('TSMBUSDT', 'TSMC TSMB/USDT', 391, 'stock'),
  sym('MSTRBUSDT', 'ストラテジー MSTRB/USDT', 103, 'stock'),
  sym('COINBUSDT', 'コインベース COINB/USDT', 120, 'stock'),
  sym('CRCLBUSDT', 'サークル CRCLB/USDT', 59, 'stock'),
  sym('SPCXBUSDT', 'スペースX SPCXB/USDT', 135, 'stock'),
  sym('SOXLBUSDT', '半導体3倍 ETF SOXLB/USDT', 54, 'stock'),
  sym('SPYBUSDT', 'S&P500 ETF SPYB/USDT', 748, 'stock'),
  sym('QQQBUSDT', 'ナスダック100 ETF QQQB/USDT', 671, 'stock'),
  sym('BTCJPY', 'BTC/JPY ビットコイン', 10500000, 'jpy', 'JPY'),
  sym('ETHJPY', 'ETH/JPY イーサリアム', 293000, 'jpy', 'JPY'),
  sym('XRPJPY', 'XRP/JPY リップル', 153, 'jpy', 'JPY'),
  sym('SOLJPY', 'SOL/JPY ソラナ', 11600, 'jpy', 'JPY'),
  sym('BNBJPY', 'BNB/JPY', 94000, 'jpy', 'JPY'),
  sym('DOGEJPY', 'DOGE/JPY ドージコイン', 9.6, 'jpy', 'JPY'),
  sym('ADAJPY', 'ADA/JPY カルダノ', 24.6, 'jpy', 'JPY'),
  sym('ETHBTC', 'ETH/BTC イーサリアム(BTC 建て)', 0.028, 'btc', 'BTC'),
  sym('SOLBTC', 'SOL/BTC ソラナ(BTC 建て)', 0.0011, 'btc', 'BTC'),
];
/* 取引所にない銘柄を、2つの銘柄の割り算で作る(計算値)。
 * ドル円は Binance で取引されていないので、「BTC の円価格 ÷ BTC のドル(USDT)価格」で求める。
 * 本物の為替レートとは少しずれ、土日も動く。出来高は、円側の取引をドルに直した参考値 */
const SYNTH = { USDJPY: { num: 'BTCJPY', den: 'BTCUSDT' } };
const BUILTIN = SYMBOLS.length; // これより後ろは、利用者が追加した銘柄
// 'DOGEUSDT' → 'DOGE/USDT' のように、読みやすい名前にする
function prettySymbol(id) {
  const q = ['FDUSD', 'USDT', 'USDC', 'JPY', 'BTC', 'ETH', 'BNB', 'EUR', 'TRY', 'BRL', 'IDR'].find(x => id.endsWith(x) && id.length > x.length);
  return q ? `${id.slice(0, -q.length)}/${q}` : id;
}
// api: 取引所に問い合わせる足 / group: 何本まとめて1本にするか
const INTERVALS = [
  { id: '1m', label: '1分', api: '1m', ms: 6e4, group: 1 },
  { id: '5m', label: '5分', api: '5m', ms: 3e5, group: 1 },
  { id: '15m', label: '15分', api: '15m', ms: 9e5, group: 1 },
  { id: '30m', label: '30分', api: '30m', ms: 18e5, group: 1 },
  { id: '1h', label: '1時間', api: '1h', ms: 36e5, group: 1 },
  { id: '4h', label: '4時間', api: '4h', ms: 144e5, group: 1 },
  { id: '1d', label: '日', api: '1d', ms: 864e5, group: 1 },
  { id: '1w', label: '週', api: '1w', ms: 6048e5, group: 1 },
  // 月足は、月によって長さが違う。ms は目安(平均の長さ)で、足の区切りは barEnd で暦どおりに求める
  { id: '1M', label: '月', api: '1M', ms: 26298e5, group: 1, month: true },
];
// ある足が終わる時刻(=次の足が始まる時刻)。月足は、翌月の1日(協定世界時)
function barEnd(t, iv) {
  if (iv.month) { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); }
  return t + iv.ms * iv.group;
}
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
const ALERT_COLOR = '#e67e22';
const TWO_POINT = ['t', 'r', 'f', 'm']; // 2点で決める図形:トレンドライン、長方形、フィボナッチ
const FIB = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const CHART_TYPES = [['candle', 'ローソク足'], ['heikin', '平均足'], ['line', 'ライン(終値)']];
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
let defaults2Done = false; // 最初から出すインジケーターを足し終えたか(2026年11月の変更)
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
  if (type === 'rsi') return { len: 14, source: 'close', upper: 70, lower: 30, color: '#7e57c2', showMa: true, maLen: 14, cMa: '#f5a623', weight: 1, vis };
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
  logScale: false,    // 価格の目盛りを対数にするか(同じ%の動きが、同じ高さになる)
  compare: null,      // 重ねて比べる銘柄(ないときは null)
  quickTrade: true,   // チャートの左上に、売買ボタンを出すか
  btSlip: 0.05,       // 過去データで試すときの、すべり(片道の %)
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
      symbol: state.symbol, interval: state.interval, theme: state.theme, mainWeight: state.mainWeight, drawings: state.drawings, chartType: state.chartType,
      tradeOpen: state.tradeOpen, logScale: state.logScale, compare: state.compare, quickTrade: state.quickTrade, btSlip: state.btSlip,
      custom: SYMBOLS.slice(BUILTIN).map(x => ({ id: x.id, label: x.label, quote: x.quote || null })),
      customInds: customDefs, favs: favs.filter(t => IND_TYPES[t]), defaults2: defaults2Done,
      indicators: state.indicators.map(i => ({ type: i.type, hidden: i.hidden, p: i.p })),
    }));
  } catch (e) { /* 保存できなくても表示は続ける */ }
}
// 保存されていた線を、形を確かめながら読み取る
function readDrawings(s) {
  const out = {};
  if (!s || !s.drawings || typeof s.drawings !== 'object') return out;
  const pt = q => q && typeof q === 'object' && isFinite(q.t) && isFinite(q.price) ? { t: +q.t, price: +q.price } : null;
  Object.keys(s.drawings).forEach(sym => {
    if (!/^[A-Z0-9]{5,20}$/.test(sym) || !Array.isArray(s.drawings[sym])) return;
    out[sym] = s.drawings[sym].slice(0, 200).map(d => {
      const p1 = pt(d && d.p1), p2 = pt(d && d.p2);
      if (d && d.type === 'h' && p1) return { type: 'h', p1 };
      if (d && TWO_POINT.includes(d.type) && p1 && p2) return { type: d.type, p1, p2 };
      if (d && d.type === 'v' && p1) return { type: 'v', p1 };
      if (d && d.type === 'a' && p1) return { type: 'a', p1, above: !!d.above, done: !!d.done };
      if (d && d.type === 'x' && p1 && typeof d.text === 'string' && plain(d.text, 40)) return { type: 'x', p1, text: plain(d.text, 40) };
      return null;
    }).filter(Boolean);
  });
  return out;
}
function readSymbols(s) {
  if (!s || !Array.isArray(s.custom)) return;
  s.custom.slice(0, 100).forEach(c => {
    const o = typeof c === 'string' ? { id: c } : c || {}; // 以前は名前だけを保存していた
    if (typeof o.id !== 'string' || !/^[A-Z0-9]{5,20}$/.test(o.id) || SYMBOLS.some(x => x.id === o.id)) return;
    const quote = typeof o.quote === 'string' && /^[A-Z0-9]{1,8}$/.test(o.quote) ? o.quote : null;
    SYMBOLS.push({ id: o.id, label: quote ? `${o.id.slice(0, -quote.length)}/${quote}` : prettySymbol(o.id), base: 100, quote });
  });
}
/* 別のタブが設定を保存したら、みんなで使うもの(引いた線・自作インジケーター・よく使う印・追加した銘柄)を取り込む。
 * これをしないと、古い内容を持ったタブが次に保存したとき、別のタブで足したものを消してしまう。
 * 見ている銘柄・時間足・表示中のインジケーターは、タブごとのものなので変えない */
let refreshSymbols = () => {};
function adoptShared() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { s = null; }
  if (!s || typeof s !== 'object') return;
  state.drawings = readDrawings(s); state.sel = null;
  // 目盛りの種類と、チャート上の売買ボタンを出すかどうかも、どのタブでも同じにする(重ねて比べる銘柄は、タブごと)
  state.logScale = s.logScale === true; state.quickTrade = s.quickTrade !== false;
  readSymbols(s); refreshSymbols();
  const stored = (Array.isArray(s.customInds) ? s.customInds : []).filter(d => d && CUSTOM_ID.test(d.id)).slice(0, CUSTOM_MAX);
  const keep = new Set(stored.map(d => d.id));
  customDefs.slice().forEach(d => {
    if (keep.has(d.id)) return;
    customDefs.splice(customDefs.indexOf(d), 1);
    state.indicators = state.indicators.filter(i => i.type !== d.id);
    delete GT.DEFS[d.id]; delete IND_TYPES[d.id];
  });
  stored.forEach(d => {
    const old = customDefs.find(x => x.id === d.id), was = old ? JSON.stringify(old) : '';
    const def = registerCustom(d);
    if (!def || !old || JSON.stringify(def) === was) return;
    // 式が変わったものは、表示中の分も新しい初期値で作り直す
    state.indicators.forEach(ind => { if (ind.type === def.id) { const base = defaultParams(def.id); base.vis = ind.p.vis; ind.p = base; } });
  });
  favs.length = 0;
  if (Array.isArray(s.favs)) s.favs.slice(0, 60).forEach(t => { if (typeof t === 'string' && Object.prototype.hasOwnProperty.call(IND_TYPES, t) && !favs.includes(t)) favs.push(t); });
  if (dlg.ind && !state.indicators.includes(dlg.ind)) { dlg.ind = null; $('overlay').hidden = true; }
  recompute(); draw(); renderQuick();
}
window.addEventListener('storage', e => { if (e.key === STORE_KEY) adoptShared(); });
function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { s = null; }
  readSymbols(s);
  if (s && SYMBOLS.some(x => x.id === s.symbol)) state.symbol = s.symbol;
  if (s && INTERVALS.some(x => x.id === s.interval)) state.interval = s.interval;
  // 教科書などからのリンク(?symbol=BTCUSDT&interval=1d)で、開く銘柄と時間足を指定できる
  const qs = new URLSearchParams(location.search), qSym = qs.get('symbol'), qIv = qs.get('interval');
  if (qSym && SYMBOLS.some(x => x.id === qSym)) state.symbol = qSym;
  if (INTERVALS.some(x => x.id === qIv)) state.interval = qIv;
  if (s && THEMES[s.theme]) state.theme = s.theme;
  else if (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) state.theme = 'dark';
  if (s && s.mainWeight > 0) state.mainWeight = s.mainWeight;
  state.chartType = s && CHART_TYPES.some(c => c[0] === s.chartType) ? s.chartType : 'candle';
  state.tradeOpen = s && typeof s.tradeOpen === 'boolean' ? s.tradeOpen : window.innerWidth > 1000;
  state.drawings = readDrawings(s);
  state.logScale = !!s && s.logScale === true;
  state.quickTrade = !s || s.quickTrade !== false;
  state.btSlip = s && typeof s.btSlip === 'number' && s.btSlip >= 0 && s.btSlip <= 5 ? s.btSlip : 0.05;
  state.compare = s && typeof s.compare === 'string' && SYMBOLS.some(x => x.id === s.compare) ? s.compare : null;
  if (s && Array.isArray(s.customInds)) s.customInds.slice(0, CUSTOM_MAX).forEach(d => { if (d && CUSTOM_ID.test(d.id)) registerCustom(d); });
  if (s && Array.isArray(s.favs)) s.favs.slice(0, 60).forEach(t => { if (typeof t === 'string' && Object.prototype.hasOwnProperty.call(IND_TYPES, t) && !favs.includes(t)) favs.push(t); });
  // 最初から出すもの:移動平均線(7・25・75・100・200)、ボリンジャーバンド、一目均衡表と、出来高の2つ
  const DEFAULT_INDS = [{ type: 'mas' }, { type: 'bb' }, { type: 'ichimoku' }, { type: 'ccOnly' }, { type: 'enhanced' }];
  const list = s && Array.isArray(s.indicators)
    ? s.indicators.filter(i => i && IND_TYPES[i.type])
    : DEFAULT_INDS.slice();
  // 以前から使っている人にも、一度だけ、新しく最初から出すようにしたもの(まだ出していないもの)を足す
  if (s && Array.isArray(s.indicators) && !s.defaults2) {
    ['mas', 'bb', 'ichimoku'].forEach(t => { if (!list.some(i => i.type === t)) list.unshift({ type: t }); });
  }
  defaults2Done = true;
  list.length = Math.min(list.length, 40); // 極端な数の読み込みで固まらないようにする
  list.forEach(i => addIndicator(i.type, i.p, i.hidden, true));
  /* 教科書からのリンク(?ind=rsi,macd)で、開いたときに出しておくインジケーターを指定できる。
   * ないものは足し、隠してあるものは表示に戻す。すでにあるものは消さない。知らない名前は無視し、6個までにする */
  const qInd = qs.get('ind');
  if (qInd !== null) {
    const want = [];
    qInd.split(',').forEach(t => { t = t.trim(); if (!Object.prototype.hasOwnProperty.call(IND_TYPES, t) && Object.prototype.hasOwnProperty.call(IND_TYPES, t.toLowerCase())) t = t.toLowerCase(); if (Object.prototype.hasOwnProperty.call(IND_TYPES, t) && !want.includes(t) && want.length < 6) want.push(t); });
    want.forEach(type => {
      const same = state.indicators.filter(i => i.type === type);
      if (same.some(i => !i.hidden && shownHere(i))) return;
      if (same.length) { same[0].hidden = false; same[0].p.vis[state.interval] = true; }
      else if (state.indicators.length < 40) addIndicator(type, undefined, false, true);
    });
    // アドレスから ind を外す(再読み込みのたびに、利用者が消したものをまた足してしまわないように)
    try {
      qs.delete('ind');
      const rest = qs.toString();
      history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
    } catch (e) { /* アドレスを書きかえられない環境でも、表示は続ける */ }
    if (want.length) save();
  }
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
  const lines = [{ name: 'RSI', val, color: p.color }];
  // RSI をならした平均線(RSI が平均線の上にあるか下にあるかで、勢いの向きを見る)
  if (p.showMa) lines.push({ name: 'MA', val: sma(val, lenOf(p.maLen)), color: p.cMa, width: 1 });
  return {
    lines, hist: null,
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
    // 表示していないもの(目のアイコンで隠した、この時間足では非表示)は計算しない。お知らせを頼まれているものは別
    if ((ind.hidden || ind.p.vis[state.interval] === false) && !ind.p.alert && !(dlg.ind === ind) && !(bt.ind === ind && !$('btOverlay').hidden)) { ind.out = null; ind.stale = true; return; }
    ind.stale = false;
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
  if (n < 3 || state.replay) return; // リプレイ中の合図は、過去の再生なので知らせない
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
/* 計算値の銘柄の足を作る。2つの銘柄の足を、同じ時刻どうしで割る。
 * 高値・安値は、2つの銘柄の高値(安値)どうしの割り算で目安を出すが、2つの高値がつく時刻はずれるので、
 * そのままだと値幅が実際の半分くらいに狭く出る(2026年11月、1時間足で約47%)。
 * そこで、1段細かい足(1時間足なら15分足)も取り寄せ、その範囲の高値・安値を細かい足から作り直す(約71〜82%まで近づく)。
 * 細かい足は1回の取り寄せ分(1000本)だけ使い、それより古い足は、目安のままにする */
const SYNTH_FINER = { '5m': ['1m', 5], '15m': ['5m', 3], '30m': ['5m', 6], '1h': ['15m', 4], '4h': ['1h', 4], '1d': ['1h', 24], '1w': ['4h', 42], '1M': ['1d', 31] }; // [細かい足, 1本に入る本数]
function ratioBars(a, b) {
  const den = new Map(b.map(x => [x.t, x]));
  const out = [];
  for (const x of a) {
    const y = den.get(x.t);
    if (!y || !(y.o > 0) || !(y.c > 0) || !(y.h > 0) || !(y.l > 0)) continue;
    const o = x.o / y.o, c = x.c / y.c, p = x.h / y.h, q = x.l / y.l;
    out.push({ t: x.t, o, h: Math.max(o, c, p, q), l: Math.min(o, c, p, q), c, v: x.v * y.c });
  }
  return out;
}
async function fetchKlines(symbol, api, limit, endTime, startTime) {
  const sy = SYNTH[symbol];
  if (!sy) return fetchKlinesRaw(symbol, api, limit, endTime, startTime);
  // 細かい足は、必要な本数だけ取る(最新の数本だけを取り直すときに、毎回1000本を取らないように)
  const fz = SYNTH_FINER[api], fineN = fz ? Math.min(1000, (limit + 1) * fz[1]) : 0;
  const fineLeg = s => (fz ? fetchKlinesRaw(s, fz[0], fineN, endTime, startTime).catch(() => []) : Promise.resolve([]));
  const [a, b, fa, fb] = await Promise.all([fetchKlinesRaw(sy.num, api, limit, endTime, startTime), fetchKlinesRaw(sy.den, api, limit, endTime, startTime), fineLeg(sy.num), fineLeg(sy.den)]);
  const out = ratioBars(a, b);
  if (!out.length) throw new Error('empty');
  const fine = ratioBars(fa, fb);
  if (fine.length) {
    // 細かい足が、その足の始まりからそろっているものだけ作り直す(途中から始まる足は、目安のまま)
    let k = 0;
    for (let i = 0; i < out.length; i++) {
      const t0 = out[i].t, t1 = i + 1 < out.length ? out[i + 1].t : Infinity;
      if (t0 < fine[0].t) continue;
      while (k < fine.length && fine[k].t < t0) k++;
      let hi = -Infinity, lo = Infinity;
      for (let j = k; j < fine.length && fine[j].t < t1; j++) { if (fine[j].h > hi) hi = fine[j].h; if (fine[j].l < lo) lo = fine[j].l; }
      if (hi > 0) { out[i].h = Math.max(out[i].o, out[i].c, hi); out[i].l = Math.min(out[i].o, out[i].c, lo); }
    }
  }
  return out;
}
async function fetchKlinesRaw(symbol, api, limit, endTime, startTime) {
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

/* インジケーターの計算は、足の数や種類が多いと時間がかかる。
 * 約定が届くたびの更新(light)では、価格・ローソク足・売買の判定は必ずその場で行い、
 * インジケーターの計算だけは、かかる時間に合わせて間をあける(遅い端末でも、価格の表示は止まらない)。
 * 足が増えたときと、足の更新の知らせ(1〜2秒ごと)のときは、必ずその場で計算する */
let recTimer = 0, recCost = 0;
function timedRecompute() {
  const t0 = performance.now();
  recompute();
  recCost = recCost * 0.6 + (performance.now() - t0) * 0.4;
}
function queueRecompute() {
  if (recCost < 4) { timedRecompute(); return; } // 軽いときは、これまでどおり毎回
  if (recTimer) return;
  recTimer = setTimeout(() => { recTimer = 0; timedRecompute(); draw(); }, clamp(recCost * 3, 16, 400));
}
function setBars(raw, resetView, light) {
  const iv = curInterval(), before = state.bars.length;
  state.raw = raw;
  state.allBars = groupBars(raw, iv.group, iv.ms);
  // リプレイ中は、決めた足までしか見せない(売買の判定には、いつも全部の足=本物の価格を使う)
  if (state.replay) {
    let n = 0;
    while (n < state.allBars.length && state.allBars[n].t <= state.replay.t) n++;
    state.bars = state.allBars.slice(0, Math.max(2, n));
  } else state.bars = state.allBars;
  if (light && state.bars.length === before) queueRecompute();
  else { clearTimeout(recTimer); recTimer = 0; timedRecompute(); }
  tradeTick();
  if (resetView) resetViewport();
  draw();
}
async function loadData() {
  const token = ++state.loadToken;
  stopReplay(true); // 銘柄・時間足を変えたら、リプレイは終わる
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
    if (state.pendingRange) applyRange();
    syncCompare();
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
    syncCompare(); // 見本データとは比べられないので、比べる線は消す
  }
}
// 新しく届いた足を末尾に反映する
function mergeTail(tail, light) {
  const raw0 = state.raw;
  if (!raw0.length || !tail.length) return;
  const atEnd = state.end >= state.bars.length - 0.01;
  const before = state.bars.length;
  let raw;
  const last = raw0[raw0.length - 1];
  if (tail.length === 1 && tail[0].t >= last.t) {
    // 配信で届いた1本(いちばん多い場合)。同じ足なら置きかえ、新しい足なら足す
    raw = raw0.slice();
    if (tail[0].t === last.t) raw[raw.length - 1] = tail[0]; else raw.push(tail[0]);
  } else {
    // 取り寄せた何本か。重なる足は置きかえ(途中のままだった足も直る)、抜けていた足は差し込む
    const t0 = tail[0].t, have = new Set(tail.map(b => b.t));
    let k = raw0.length;
    while (k > 0 && raw0[k - 1].t >= t0) k--;
    raw = raw0.slice(0, k).concat(raw0.slice(k).filter(b => !have.has(b.t)), tail).sort((a, b) => a.t - b.t);
  }
  setBars(raw, false, light);
  if (atEnd) state.end += state.bars.length - before; // 最新を見ているときは追従する
}
// リアルタイム配信。つながらないときは下の poll が代わりを務める
let ws = null;
const STREAMS = ['wss://data-stream.binance.vision/stream?streams=', 'wss://stream.binance.com:9443/stream?streams='];
const mono = () => performance.now(); // 端末の時計を変えても巻き戻らない経過時間。価格の鮮度はこれで測る
let clockOffset = 0, clockReady = false; // 取引所の時計 − 端末の時計
const tnow = () => Date.now() + clockOffset; // 取引所の時計での現在時刻(取引の記録に使う)
const feed = { lo: Infinity, hi: -Infinity, okAt: -1e9, lastMsg: -1e9, lastTick: 0, tick: null, timer: 0, vol: 0, cost: 0, qRaf: 0, n: 0, msgs: 0, rate: 0, bid: NaN, ask: NaN, quoteAt: 0, quoteSym: '', book: null, path: [], pathFull: false, upSince: Infinity, covers: new Set(), rec: [], gapFrom: Infinity, legK: {} }; // 配信の状態
/* book: 板の上位5段 { sym, bids: [[価格, 数量]…], asks, at }。成行注文の平均の約定価格を見積もるのに使う。
 * path: 前回の判定から届いた約定の列 [{ p: 価格, b: そのときの売れる価格, a: 買える価格, q: 数量, t: 時刻 }]。
 * 利確・損切り・強制決済が「どの約定で」「どちらが先に」届いたかを、順番どおりに調べるために覚えておく
 * upSince: いまの配信が、途切れずに届き始めた時刻(取引所の時刻)。これより前に最後に確かめた銘柄は、間の約定を取り寄せて調べる
 * covers: いまの配信で約定が届く銘柄。rec: 直近30秒の約定の高値・安値(1秒ごと)。板の見えない先を見積もるときの上限に使う
 * gapFrom: 足が抜けているかもしれない時刻。次の取り寄せで、ここから先を取り直す
 * legK: 計算値の銘柄の、2つの銘柄の足の更新(出来高を出すのに使う) */
const PATH_MAX = 5000;
// 配信がいま届いているか(2.5秒以上なにも届かなければ、止まっているとみなす)
const streamLive = () => !!ws && ws.readyState === 1 && mono() - feed.lastMsg < 2500;
// 直近30秒に実際にあった約定の、いちばん高い価格(買い)/安い価格(売り)。分からなければ NaN
function recentExtreme(side) {
  const now = Math.floor(mono() / 1000);
  let v = side === 'buy' ? -Infinity : Infinity;
  feed.rec.forEach(x => { if (now - x.s <= 30) v = side === 'buy' ? Math.max(v, x.hi) : Math.min(v, x.lo); });
  return isFinite(v) ? v : NaN;
}
function noteRecent(p) {
  const s = Math.floor(mono() / 1000), r = feed.rec, last = r[r.length - 1];
  if (last && last.s === s) { last.lo = Math.min(last.lo, p); last.hi = Math.max(last.hi, p); return; }
  r.push({ s, lo: p, hi: p });
  while (r.length && s - r[0].s > 30) r.shift();
}
function closeStream() {
  const s = ws;
  ws = null;
  clearTimeout(feed.timer); feed.timer = 0; feed.tick = null; feed.vol = 0;
  feed.bid = feed.ask = NaN; feed.quoteAt = -1e9; feed.lo = Infinity; feed.hi = -Infinity;
  feed.book = null; feed.path = []; feed.pathFull = false;
  feed.upSince = Infinity; feed.covers = new Set(); feed.rec = []; feed.legK = {};
  renderQuote();
  if (s) { try { s.close(); } catch (e) { /* 何もしない */ } }
}
/* 約定(1件ごとの売買)を、いちばん新しい足に反映する。
 * 画面は1秒に約60回しか描けないので、反映は「画面の1コマ(約16ミリ秒)に1回」まで細かくする。
 * インジケーターが多くて計算が重いときは、操作が固まらないよう、かかった時間の3倍まで間隔を空ける。
 * 間に届いた約定の高値・安値(feed.lo / hi)と数量(feed.vol)は、まとめて反映するので取りこぼさない */
const TICK_MIN = 16, TICK_MAX = 250;
function queueTick() {
  if (feed.timer) return;
  // 別のタブを見ている間は描く必要がないので、ゆっくりでよい(利確・損切りの判定は続ける)
  feed.timer = setTimeout(applyTick, document.hidden ? TICK_MAX : clamp(feed.cost * 3, TICK_MIN, TICK_MAX));
}
function applyTick() {
  feed.timer = 0;
  const tk = feed.tick, raw = state.raw, vol = feed.vol;
  feed.tick = null; feed.vol = 0;
  if (!tk || !raw.length) return;
  const last = raw[raw.length - 1], iv = curInterval();
  if (tk.t < last.t || (tk.p === last.c && !(vol > 0))) return;
  if (tk.p !== last.c) noteTick(tk.p > last.c ? 1 : -1);
  const t0 = mono();
  // 次の足の時間に入ってからの約定は、確定した足に混ぜず、新しい足として始める
  // (足の更新の知らせより先に約定が届くことがある。混ぜると、確定した足の終値が変わってしまう)
  if (tk.t >= barEnd(last.t, { ms: iv.ms, group: 1, month: iv.month })) {
    let nt = last.t;
    if (iv.month) { while (barEnd(nt, iv) <= tk.t) nt = barEnd(nt, iv); }
    else nt = last.t + Math.floor((tk.t - last.t) / iv.ms) * iv.ms;
    // 1本以上とばして新しい足を始めたら(通信が途切れていた)、抜けた足をあとで取り寄せる
    if (nt > barEnd(last.t, iv)) { feed.gapFrom = Math.min(feed.gapFrom, last.t); queueSync(); }
    mergeTail([{ t: nt, o: tk.p, h: tk.p, l: tk.p, c: tk.p, v: vol }]);
    // 計算値の銘柄は、気配値から作った足なので、確定した足を、取り寄せた足(チャートを開いたときと同じ作り方)に置きかえる
    if (SYNTH[state.symbol]) { const tok = state.loadToken, closedT = last.t; setTimeout(() => refreshSynth(tok, closedT), 1500); }
  }
  else mergeTail([{ t: last.t, o: last.o, h: Math.max(last.h, tk.p), l: Math.min(last.l, tk.p), c: tk.p, v: last.v + vol }], true);
  feed.cost = feed.cost * 0.7 + (mono() - t0) * 0.3; // 反映にかかった時間(ならした値)
  feed.n++;
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
// いま有効な気配値(売れる価格 bid と、買える価格 ask)。古いものや別の銘柄のものは使わない。
// 表示には5秒まで使う。成行の約定には、もっと新しいもの(QUOTE_TRADE_MS)だけを使う
const QUOTE_TRADE_MS = 2000;
function liveQuote(sym, maxAge) {
  if (feed.quoteSym !== sym || mono() - feed.quoteAt > (maxAge || 5000) || !(feed.bid > 0) || !(feed.ask > 0)) return null;
  return { bid: feed.bid, ask: feed.ask };
}
/* チャートの左上の売買ボタン(幅の広い画面だけ)。売れる価格・買える価格を出し、押せるかどうかは、注文画面のボタンに合わせる。
 * 気配値がないときは、最新の価格を出す(そのときの約定も、最新の価格で行われる) */
let quickEl = null;
function renderQuick() {
  if (!quickEl) return;
  const show = state.quickTrade && state.live;
  if (quickEl.hidden === show) quickEl.hidden = !show;
  if (!show) return;
  const sym = state.symbol, lq = liveQuote(sym), px = T.last[sym];
  setTxt('qtSellPx', lq ? fmtPrice(lq.bid, lq.ask) : fmtPrice(px)); setTxt('qtBuyPx', fmtPrice(lq ? lq.ask : px));
  const off = $('trBuy').disabled;
  if ($('qtBuy').disabled !== off) $('qtBuy').disabled = $('qtSell').disabled = off;
}
let lastQuoteText = '';
function renderQuote() {
  const q = liveQuote(state.symbol), box = $('trQuoteLine');
  renderQuick();
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
// 直近1秒に取引所から受け取った件数を出す(リアルタイムで届いているかが、目で分かるように)
let rateAt = 0;
function renderRate() {
  const now = mono(), dt = now - rateAt;
  if (dt < 900) return;
  feed.rate = rateAt ? Math.round(feed.msgs / dt * 1000) : 0;
  feed.msgs = 0; rateAt = now;
  const on = state.live && ws && ws.readyState === 1 && now - feed.lastMsg < 5000;
  const waiting = !ws || ws.readyState === 0 || now - feed.lastMsg < 5000; // つなぎ始めたばかり
  setTxt('trRate', on ? `受信 ${feed.rate.toLocaleString()} 件/秒` : !state.live ? '' : waiting ? '配信につないでいます…' : '配信が止まっています(2秒ごとに取得中)');
  $('status').title = on ? `リアルタイム配信を受信中(直近1秒で ${feed.rate} 件)` : '';
}
// 約定を1件、判定待ちの列に足す。多すぎるとき(重くて判定が遅れたとき)は列をあきらめ、高値・安値だけで判定する
// q: 約定の数量、t: 約定の時刻。指値の「順番待ち」で、置いたあとにその価格でどれだけ取引されたかを数えるのに使う
function pushPath(p, b, a, q, t) {
  if (feed.pathFull || !(p > 0)) return;
  if (feed.path.length >= PATH_MAX) { feed.pathFull = true; feed.path = []; return; }
  feed.path.push({ p, b, a, q, t });
}
function openStream() {
  closeStream();
  if (!state.live || !window.WebSocket) return;
  const token = state.loadToken;
  const sym = state.symbol.toLowerCase();
  // 足の更新(kline)に加えて、約定(aggTrade)も受け取り、1件ごとの値動きを表示する
  // bookTicker は、いちばん良い買い注文・売り注文の価格が変わるたびに届く(気配値をすぐに反映する)
  // depth5 は 0.1 秒ごとに必ず届くので、取引がない間も「つながっている」ことが分かる
  // ポジションや指値注文があるほかの銘柄も、約定を受け取ってすぐに損益と利確・損切りへ反映する(10銘柄まで)
  const others = [...new Set(Object.keys(T.positions).concat(T.orders.map(o => o.sym)))].filter(x => x !== state.symbol && !SYNTH[x] && /^[A-Z0-9]{5,20}$/.test(x)).slice(0, 10);
  const syn = SYNTH[state.symbol];
  const leg = { n: NaN, d: NaN, nb: NaN, na: NaN, db: NaN, da: NaN }; // 計算値の銘柄:2つの銘柄の気配値
  // 計算値の銘柄は、2つの銘柄の気配値に加えて、足の更新も受け取る(いま動いている足の出来高と始値を、取り寄せた足と同じ作り方にするため)
  const name = syn ? [syn.num, syn.den].map(x => `${x.toLowerCase()}@bookTicker/${x.toLowerCase()}@kline_${curInterval().api}`).join('/') : `${sym}@kline_${curInterval().api}/${sym}@aggTrade/${sym}@bookTicker/${sym}@depth5@100ms` + others.map(x => `/${x.toLowerCase()}@aggTrade`).join('');
  feed.covers = new Set([state.symbol].concat(others));
  const pend = {}; let pendTimer = 0;
  const flushOthers = () => {
    pendTimer = 0;
    if (token !== state.loadToken) return;
    let any = false, wait = false;
    Object.keys(pend).forEach(x => {
      const t = pend[x];
      T.last[x] = t.p; otherFresh[x] = mono(); delete dead[x];
      if (!clockReady) { delete pend[x]; return; }
      // 最後に確かめた時刻から、配信が途切れずに届いていなければ、その間の約定を取り寄せて調べる(下の reconcile)
      if (reconciled[x] === true && needsScan(x)) delete reconciled[x];
      if (reconciled[x] !== true) {
        // 調べ終わるまで、届いた約定は捨てずにためておく(調べ終えたあと、その続きから判定する)
        if (!reconciled[x]) reconcile(x);
        wait = true; return;
      }
      delete pend[x];
      let { lo, hi, path } = t;
      const done = recEnd[x];
      if (done !== undefined) {
        // 取り寄せて調べ終えた時刻より前の約定は、もう調べてあるので使わない(同じ値動きで二度約定させない)
        delete recEnd[x];
        path = path ? path.filter(y => !(y.t < done)) : null;
        lo = hi = NaN;
      }
      T.seen[x] = tnow();
      if (settleFunding(x, tnow(), t.p)) saveTrade();
      checkTriggers(x, lo, hi, path);
      checkOrders(x, lo, hi, path);
      stopOut(quoteOf(x));
      any = true;
    });
    if (any) { renderTrade(); draw(); }
    if (wait && !pendTimer) pendTimer = setTimeout(flushOthers, 500);
  };
  let klineE = 0; // 最後に届いた足の更新の時刻。これより後の約定だけ、出来高に足す(二重に数えない)
  const quoteIn = (bid, ask) => {
    if (!(bid > 0) || !(ask > 0)) return;
    const moved = bid !== feed.bid || ask !== feed.ask;
    feed.bid = bid; feed.ask = ask; // 売買の約定価格には、届いた瞬間の値を使う
    feed.quoteAt = mono(); feed.quoteSym = streamSym;
    if (moved && !feed.qRaf) feed.qRaf = requestAnimationFrame(() => { feed.qRaf = 0; renderQuote(); }); // 表示は1コマに1回
  };
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
      const gapped = mono() - feed.lastMsg > 2500 || !isFinite(feed.upSince);
      feed.lastMsg = feed.okAt = mono();
      try {
        const d = JSON.parse(ev.data).data;
        if (!d) return;
        // 取引所の時計とのずれを覚えておく(端末の時計を変えても、記録の時刻が狂わないようにする)
        if (typeof d.E === 'number' && isFinite(d.E)) { clockOffset = d.E - Date.now(); clockReady = true; }
        // つながった直後(または、しばらく止まっていたあと)は、ここから「途切れずに届いている」ことになる。
        // その前の足は、取り寄せて直す(途中のままの足や、抜けた足を残さない)
        if (gapped) { feed.upSince = tnow(); queueSync(); }
        feed.msgs++;
        if (syn && d.e === 'kline' && d.k && (d.s === syn.num || d.s === syn.den)) {
          // 計算値の銘柄:2つの銘柄の、いま動いている足。出来高は「分子の銘柄の出来高 × 分母の銘柄の終値」(取り寄せた足と同じ作り方)
          feed.legK[d.s] = { t: +d.k.t, o: +d.k.o, c: +d.k.c, v: +d.k.v };
          const a = feed.legK[syn.num], b = feed.legK[syn.den], last = state.raw[state.raw.length - 1];
          if (a && b && last && a.t === b.t && a.t === last.t && b.o > 0 && b.c > 0 && a.o > 0) {
            const o = a.o / b.o, v = a.v * b.c;
            if (o !== last.o || v !== last.v) mergeTail([{ t: last.t, o, h: Math.max(last.h, o), l: Math.min(last.l, o), c: last.c, v }], true);
          }
          return;
        }
        if (syn && d.s && d.b !== undefined && d.a !== undefined && (d.s === syn.num || d.s === syn.den)) {
          // 計算値の銘柄:気配値の中間どうしを割って、いまの価格にする。買い・売りの気配は、不利な側どうしで割る
          const bb = +d.b, aa = +d.a;
          if (!(bb > 0) || !(aa > 0)) return;
          if (d.s === syn.num) { leg.nb = bb; leg.na = aa; } else { leg.db = bb; leg.da = aa; }
          if (!(leg.nb > 0) || !(leg.db > 0)) return;
          const p = (leg.nb + leg.na) / (leg.db + leg.da);
          quoteIn(leg.nb / leg.da, leg.na / leg.db);
          pushPath(p, feed.bid, feed.ask, undefined, tnow());
          feed.tick = { t: tnow(), p };
          feed.lo = Math.min(feed.lo, p); feed.hi = Math.max(feed.hi, p);
          queueTick();
          return;
        }
        if (d.e === 'aggTrade' && d.s && d.s !== streamSym) {
          // ほかの銘柄の約定:高値・安値を覚えておき、0.25 秒ごとにまとめて反映する
          if (!others.includes(d.s) || !(+d.p > 0)) return;
          const t = pend[d.s] || (pend[d.s] = { p: +d.p, lo: +d.p, hi: +d.p, path: [] });
          t.p = +d.p; t.lo = Math.min(t.lo, t.p); t.hi = Math.max(t.hi, t.p);
          // ほかの銘柄は気配値を受け取っていないので、約定の価格そのものを使う
          if (t.path && t.path.length < PATH_MAX) t.path.push({ p: t.p, q: +d.q, t: +d.T }); else t.path = null;
          if (!pendTimer) pendTimer = setTimeout(flushOthers, 250);
          return;
        }
        if (d.e === 'kline' && d.k) {
          const m = d.k, prev = state.raw[state.raw.length - 1];
          if (prev && +m.c !== prev.c) noteTick(+m.c > prev.c ? 1 : -1);
          klineE = +d.E || 0; feed.vol = 0; // 足の更新には、ここまでの出来高がすでに入っている
          mergeTail([{ t: +m.t, o: +m.o, h: +m.h, l: +m.l, c: +m.c, v: +m.v }]);
        } else if (d.e === 'aggTrade') {
          feed.tick = { t: +d.T, p: +d.p };
          feed.lo = Math.min(feed.lo, +d.p); feed.hi = Math.max(feed.hi, +d.p); // 間引いている間の高値・安値も覚えておく
          const lq = liveQuote(streamSym);
          pushPath(+d.p, lq ? lq.bid : NaN, lq ? lq.ask : NaN, +d.q, +d.T);
          noteRecent(+d.p);
          if (+d.T > klineE && +d.q > 0) feed.vol += +d.q;
          queueTick();
        } else if (d.b !== undefined && d.a !== undefined && !d.bids) quoteIn(+d.b, +d.a);
        else if (d.bids && d.asks && d.bids[0] && d.asks[0]) {
          // 板の上位5段。成行注文が、どの価格でどれだけ約定するかの見積もりに使う
          const lv = a => a.slice(0, 5).map(x => [+x[0], +x[1]]).filter(x => x[0] > 0 && x[1] > 0);
          feed.book = { sym: streamSym, bids: lv(d.bids), asks: lv(d.asks), at: mono() };
          quoteIn(+d.bids[0][0], +d.asks[0][0]);
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
let probeAt = -1e9, hiddenPollAt = -1e9;
async function poll() {
  if (document.hidden) {
    // 裏に回っている間も、配信が切れていたらつなぎ直す(利確・損切り・指値の判定を続けるため)。取りにいくのは10秒に1回まで
    if (!state.live || state.loading || (ws && ws.readyState <= 1) || mono() - hiddenPollAt < 10000) return;
    hiddenPollAt = mono();
  }
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
  if (ws && ws.readyState <= 1 && quiet < 2500) return;
  // 1分以上なにも届かなければ、つなぎ直す
  if (ws && quiet > 60000) closeStream();
  try {
    if (!(await syncTail(state.loadToken))) return;
    if (!ws) openStream();
  } catch (e) { /* 次の周期でやり直す */ }
}
/* いちばん新しい足の始まり(足が抜けているかもしれないときは、その時刻)から先を取り寄せて、重なる足は置きかえる。
 * 以前は最新の3本だけを取っていたため、長く途切れたあとは、途中の足が抜けたり、途中のままの足が残ったりしていた。
 * 取れたら true。あまりに長く途切れていたら(900本より多い)、全部を読み込み直す */
async function syncTail(token) {
  const iv = curInterval(), last = state.raw[state.raw.length - 1];
  if (!last) return false;
  const from = Math.min(last.t, feed.gapFrom);
  if (tnow() - from > 900 * iv.ms) { loadData(); return false; }
  const want = Math.min(1000, Math.ceil((tnow() - from) / iv.ms) + 2);
  const rows = await fetchKlines(state.symbol, iv.api, want, 0, from);
  if (token !== state.loadToken) return false;
  feed.okAt = mono();
  if (from <= feed.gapFrom) feed.gapFrom = Infinity;
  const prev = state.raw[state.raw.length - 1], now = rows[rows.length - 1];
  if (prev && now && now.c !== prev.c) noteTick(now.c > prev.c ? 1 : -1);
  mergeTail(rows.filter(b => b.t >= from));
  return true;
}
// 配信がつながり直したときや、足が抜けたときに、少し待ってから取り寄せる(何度も続けて呼ばれても、1回にまとめる)
let syncTimer = 0;
function queueSync() {
  if (syncTimer) return;
  const token = state.loadToken;
  syncTimer = setTimeout(() => { syncTimer = 0; if (token === state.loadToken && state.live) syncTail(token).catch(() => { /* 次の取り寄せで直す */ }); }, 1500);
}
// 計算値の銘柄:確定した足を、取り寄せた足に置きかえる(いま動いている足は、気配値からの価格のまま。表示の速さを保つため)
async function refreshSynth(token, fromT) {
  if (token !== state.loadToken || !SYNTH[state.symbol]) return;
  try {
    const rows = await fetchKlines(state.symbol, curInterval().api, 4, 0, fromT);
    if (token !== state.loadToken) return;
    const cur = state.raw[state.raw.length - 1];
    const done = rows.filter(b => b.t >= fromT && cur && b.t < cur.t);
    if (done.length) mergeTail(done);
  } catch (e) { /* 次に足が確定したときに、もう一度取り寄せる */ }
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
    syncCompare(); // 比べている銘柄も、同じところまで読み足す
  }).catch(e => {
    if (token !== state.loadToken) return;
    if (e && e.message === 'empty') more.done = true; else more.retryAt = Date.now() + 10000;
  }).finally(() => { if (token === state.loadToken) more.busy = false; });
}
/* ---- 銘柄の比較:もう1つの銘柄を、変化率(%)の線で重ねる。
 * 画面の左端に見えている足を 0% として、そこから何%動いたかを、見ている銘柄と同じ縦の物差しで描く
 * (左端で2つの線が重なり、そこからの上がり下がりの差が、そのまま線の開きになる)。
 * 足は同じ時間足で取りにいき、足の始まりの時刻で合わせる。売買の価格には、いっさい使わない */
const CMP_COLOR = '#00a3c4';
const cmp = { key: '', raw: [], byT: new Map(), busy: false, done: false, err: false, fails: 0, token: 0, view: null };
const fmtPct = v => (isFinite(v) ? `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%` : '—');
const compareOn = () => !!state.compare && state.compare !== state.symbol;
function setCompareBars(raw) {
  const iv = curInterval();
  cmp.raw = raw;
  cmp.byT = new Map(groupBars(raw, iv.group, iv.ms).map(b => [b.t, b.c]));
  draw();
}
// 比べる銘柄の足を用意する。銘柄・時間足が変わったら取り直し、見ている銘柄の足のほうが古くまであれば、足りない分を読み足す
function syncCompare() {
  if (!compareOn() || !state.live) { cmp.key = ''; cmp.raw = []; cmp.byT = new Map(); cmp.busy = false; cmp.token++; return; }
  const iv = curInterval(), key = `${state.compare}|${iv.id}`;
  if (key !== cmp.key) { cmp.key = key; cmp.raw = []; cmp.byT = new Map(); cmp.busy = false; cmp.done = false; cmp.err = false; cmp.fails = 0; cmp.token++; }
  if (cmp.busy || !state.raw.length) return;
  const fresh = !cmp.raw.length;
  if (!fresh && (cmp.done || cmp.raw[0].t <= state.raw[0].t || cmp.raw.length >= 20000)) return;
  cmp.busy = true;
  const token = cmp.token, first = fresh ? 0 : cmp.raw[0].t;
  fetchKlines(state.compare, iv.api, 1000, fresh ? undefined : first - 1).then(rows => {
    if (token !== cmp.token) return;
    cmp.busy = false; cmp.err = false;
    if (fresh) setCompareBars(rows);
    else {
      const older = rows.filter(b => b.t < first);
      if (older.length < 2) { cmp.done = true; return; }
      setCompareBars(older.concat(cmp.raw));
    }
    syncCompare(); // まだ足りなければ、続けて読み足す
  }).catch(e => {
    if (token !== cmp.token) return;
    cmp.busy = false;
    // 取れなかったときは、下の定期的な更新のときに、もう一度試す。
    // 古い足の読み足しは、それより古い足がないとき・3回続けて失敗したときは、そこで終わりにする(同じ失敗をくり返さない)
    if (fresh) { cmp.err = true; draw(); } else if ((e && (e.message === 'empty' || e.final)) || ++cmp.fails >= 3) cmp.done = true;
  });
}
// 比べる銘柄の最新の足は、12秒ごとに取り直す(配信をもう1本つなぐほどのことではないので、足だけを軽く取る)
setInterval(() => {
  if (document.hidden || !compareOn() || !state.live) return;
  if (!cmp.raw.length || cmp.key !== `${state.compare}|${state.interval}`) { syncCompare(); return; }
  const token = cmp.token;
  fetchKlines(state.compare, curInterval().api, 3).then(rows => {
    if (token !== cmp.token || !cmp.raw.length) return;
    const raw = cmp.raw.slice();
    rows.forEach(b => {
      const last = raw[raw.length - 1];
      if (b.t === last.t) raw[raw.length - 1] = b;
      else if (b.t > last.t) raw.push(b);
      else if (raw.length > 1 && b.t === raw[raw.length - 2].t) raw[raw.length - 2] = b;
    });
    setCompareBars(raw);
    syncCompare();
  }).catch(() => { /* 次の回に取り直す */ });
}, 12000);
function setCompare(id) {
  state.compare = id && SYMBOLS.some(x => x.id === id) ? id : null;
  save(); syncCompare(); draw();
}
/* 画面に見えている範囲の、比べる銘柄の線を作る。
 * val は「見ている銘柄の価格に直した値」(= 左端の価格 ×(1 + 変化率))。こうすると、ふつうの目盛りでも対数目盛りでも、
 * ほかの線と同じ yOf で描けて、同じ%の物差しにそろう。リプレイ中は、state.bars が途中までなので、先の足は出ない */
function compareSeries(i0, i1) {
  cmp.view = null;
  if (!compareOn() || !cmp.byT.size) return null;
  const bars = state.bars, val = new Array(Math.min(bars.length, i1 + 2));
  let ib = -1, c0 = 0;
  for (let i = i0; i <= i1; i++) { const c = cmp.byT.get(bars[i].t); if (c > 0 && bars[i].c > 0) { ib = i; c0 = c; break; } }
  if (ib < 0) return null;
  const m0 = bars[ib].c;
  for (let i = ib; i < val.length; i++) { const c = cmp.byT.get(bars[i].t); if (c > 0) val[i] = m0 * c / c0; }
  cmp.view = { val, base: ib, late: ib > i0, pct: i => (val[i] > 0 ? val[i] / m0 - 1 : NaN) };
  return cmp.view;
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
/* 数字の書式は、画面の更新のたびに何百回も使う。毎回 toLocaleString で作り直すと遅いので、
 * 桁数ごとに1度だけ作って使い回す(遅い端末での引っかかりを減らす) */
const nfCache = {};
function nf(dg) { return nfCache[dg] || (nfCache[dg] = new Intl.NumberFormat('en-US', { minimumFractionDigits: dg, maximumFractionDigits: dg })); }
const nfSig6 = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 6 });
function priceDigits(v) {
  const a = Math.abs(v);
  if (a === 0) return 2;
  if (a >= 1000) return 2;
  if (a >= 1) return a >= 100 ? 2 : 4;
  if (a >= 0.01) return 5;
  return 8;
}
// ref を渡すと、その価格と同じ小数桁でそろえる(前日比などの小さな値用)
const fmtPrice = (v, ref) => {
  if (!isFinite(v)) return '—';
  const dg = priceDigits(ref === undefined ? v : ref);
  return nf(dg).format(v);
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
  // ただし、空ける幅は画面の4分の1まで(狭いスマホで、ローソク足がほとんど見えなくなるのを防ぐ。左に動かせば先の部分も見える)
  ahead = Math.min(ahead, Math.floor(plotW() / state.barW * 0.25));
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
/* 対数目盛り用の目盛り。幅がせまいときは、ふつうの目盛りと同じ「きりのよい数」を使い、
 * 幅が広いとき(何倍にもなっているとき)は、1・2・5・10・20・50 … と、けたごとに同じ並びで置く。
 * 上のほうは間がつまるので、近すぎるものは下から順に見て省く */
function logTicks(min, max, count, yOf) {
  if (!(min > 0) || !(max > min)) return [];
  let c = [];
  if (max / min < 4) c = niceTicks(min, max, count);
  else {
    const d0 = Math.floor(Math.log10(min)), d1 = Math.ceil(Math.log10(max));
    const sets = [[1, 2, 5], [1, 3], [1]], decades = Math.log10(max / min);
    const m = sets.find(x => x.length * decades <= count * 1.5) || [1];
    const skip = m.length === 1 ? Math.max(1, Math.ceil(decades / (count * 1.5))) : 1; // けたの数が多すぎるときは、何けたかおきにする
    for (let d = d0; d <= d1 && c.length < 400; d++) {
      if (((d % skip) + skip) % skip) continue;
      m.forEach(k => { const v = k * Math.pow(10, d); if (v >= min && v <= max) c.push(+v.toPrecision(12)); });
    }
  }
  const out = [];
  let lastY = Infinity;
  c.forEach(v => { const y = yOf(v); if (lastY - y >= 26) { out.push(v); lastY = y; } });
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
    const period = [3e5, 6e5, 9e5, 18e5, 36e5, 72e5, 144e5, 216e5, 432e5, 864e5, 1728e5, 6048e5].find(v => v >= need) || 6048e5;
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

function gridAndAxis(pane, min, max, yOf, th, fmt, log) {
  const pw = plotW(), count = Math.max(2, Math.floor(pane.h / 46));
  const ticks = log ? logTicks(min, max, count, yOf) : niceTicks(min, max, count);
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

/* 平均足:値動きをならして、流れを見やすくした足(実際の4本値とは違う)。
 *   終値 = (始値 + 高値 + 安値 + 終値) ÷ 4、始値 = 1本前の平均足の(始値 + 終値) ÷ 2 */
function heikin(bars) {
  const out = new Array(bars.length);
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i], c = (b.o + b.h + b.l + b.c) / 4, o = i ? (out[i - 1].o + out[i - 1].c) / 2 : (b.o + b.c) / 2;
    out[i] = { o, c, h: Math.max(b.h, o, c), l: Math.min(b.l, o, c) };
  }
  return out;
}
function drawMain(pane, i0, i1, th) {
  const bars = state.bars, pw = plotW(), bw = state.barW;
  let lo = Infinity, hi = -Infinity, vmax = 0;
  for (let i = i0; i <= i1; i++) {
    lo = Math.min(lo, bars[i].l); hi = Math.max(hi, bars[i].h); vmax = Math.max(vmax, bars[i].v);
  }
  if (!isFinite(lo)) return;
  // 重ねて比べる銘柄の線も、画面に収まるようにする
  const cmpLine = compareSeries(i0, i1);
  if (cmpLine) {
    // ただし、ローソク足が小さくなりすぎないよう、足の値幅の上下1つ分までしか広げない(はみ出た線は、枠の外に切れる)
    let clo = lo, chi = hi;
    for (let i = i0; i <= i1; i++) { const v = cmpLine.val[i]; if (v > 0) { clo = Math.min(clo, v); chi = Math.max(chi, v); } }
    if (state.logScale && lo > 0) { const r = Math.max(Math.log(hi / lo), 0.02); lo = Math.max(clo, lo / Math.exp(r)); hi = Math.min(chi, hi * Math.exp(r)); }
    else { const r = hi - lo || hi * 0.02; lo = Math.max(clo, lo - r); hi = Math.min(chi, hi + r); }
  }
  /* 価格 ↔ 画面の縦位置。対数目盛りのときは、価格の対数を取ってから同じ計算をする(同じ%の動きが、同じ高さになる)。
   * 線・注文の線・十字線・ドラッグなど、価格と位置の変換はすべて pane.yOf / pane.vOf を通すので、ここだけ変えればそろう。
   * 対数は 0 以下の値に使えないので、0 以下の価格があるときは、ふつうの目盛りで描く */
  const log = state.logScale && lo > 0;
  const fw = log ? Math.log : v => v, bk = log ? Math.exp : v => v;
  let a = fw(lo), b = fw(hi);
  if (b === a) { if (log) { a -= 0.01; b += 0.01; } else { a -= 1; b += 1; } }
  const padV = (b - a) * 0.1;
  // ふつうの目盛りで、価格がすべてプラスなら、目盛りが 0 より下へ行かないようにする
  const tmin = !log && lo > 0 ? Math.max(0, a - padV * 1.6) : a - padV * 1.6, tmax = b + padV * 0.5 + headroom(tmin, b, pane, compact ? 78 : 44);
  const min = bk(tmin), max = bk(tmax);
  // 対数目盛りでは、0 以下の値(一部のインジケーターの線など)は描けない。位置なし(NaN)にして、線をそこで切る
  const yOf = v => (log && !(v > 0) ? NaN : pane.y + pane.h - (fw(v) - tmin) / (tmax - tmin) * pane.h);
  pane.yOf = yOf; pane.vOf = y => bk(tmin + (pane.y + pane.h - y) / pane.h * (tmax - tmin)); pane.fmt = fmtPrice; pane.log = log;

  gridAndAxis(pane, min, max, yOf, th, fmtPrice, log);

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
  if (state.chartType === 'line') {
    // 終値を結んだ線
    ctx.beginPath();
    for (let i = i0; i <= i1; i++) { if (i === i0) ctx.moveTo(xOf(i), yOf(bars[i].c)); else ctx.lineTo(xOf(i), yOf(bars[i].c)); }
    ctx.strokeStyle = th.text; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.stroke(); ctx.lineWidth = 1;
    ctx.lineTo(xOf(i1), pane.y + pane.h); ctx.lineTo(xOf(i0), pane.y + pane.h); ctx.closePath();
    ctx.fillStyle = rgba(DRAW_COLOR, 0.06); ctx.fill();
  }
  const shown = state.chartType === 'heikin' ? heikin(bars) : bars;
  for (let i = i0; i <= i1 && state.chartType !== 'line'; i++) {
    const b = shown[i], x = xOf(i), up = b.c >= b.o;
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
  if (cmpLine) strokeSeries({ val: cmpLine.val, color: CMP_COLOR, width: 1.8 }, yOf, i0, i1);
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
    const left = barEnd(last.t, iv) - Date.now();
    const y = clamp(ly, pane.y + 9, pane.y + pane.h - (left > 0 ? 27 : 9));
    axisTag(y, fmtPrice(last.c), col, '#ffffff', pane);
    if (left > 0) axisTag(y + 18, fmtRemain(left), col, '#ffffff', pane);
  }
  // 重ねて描いている線(移動平均線など)の、いちばん新しい値を、線と同じ色のラベルで価格の目盛りに出す
  // (スマホでは目盛りがせまく、ラベルで埋まってしまうので出さない)
  if (!compact) {
    const li = bars.length - 1;
    visibleOverlays().forEach(ind => {
      if (ind.hidden || !ind.out) return;
      const lines = ind.out.lines || [{ val: ind.out.val, color: ind.p.color }];
      lines.forEach(l => {
        const v = l.val[li - (l.offset > 0 ? l.offset : 0)];
        if (!isFinite(v) || !COLOR_RE.test(l.color || '')) return;
        const yy = yOf(v);
        if (yy > pane.y + 9 && yy < pane.y + pane.h - 9) axisTag(yy, fmtPrice(v), l.color, '#ffffff', pane);
      });
    });
  }
  // 比べている銘柄の、いちばん新しい変化率を、線と同じ色のラベルで出す
  if (cmpLine && !compact) {
    let k = Math.min(i1, bars.length - 1);
    while (k >= i0 && !(cmpLine.val[k] > 0)) k--;
    const yy = k >= i0 ? yOf(cmpLine.val[k]) : NaN;
    if (yy > pane.y + 9 && yy < pane.y + pane.h - 9) axisTag(yy, fmtPct(cmpLine.pct(k)), CMP_COLOR, '#ffffff', pane);
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
  if (state.hideDraw) return null;
  const list = curDrawings();
  for (let k = list.length - 1; k >= 0; k--) {
    const d = list[k];
    if (d.type === 'x') { const q = drawingPoints(d, pane)[0]; if (pos.x >= q.x - tol && pos.x <= q.x + Math.max(40, d.text.length * 12) && Math.abs(pos.y - q.y) <= tol + 8) return d; continue; }
    if (d.type === 'h' || d.type === 'a') { if (Math.abs(pos.y - pane.yOf(d.p1.price)) <= tol) return d; continue; }
    if (d.type === 'v') { if (Math.abs(pos.x - xOf(idxOfTime(d.p1.t))) <= tol) return d; continue; }
    const [a, b] = drawingPoints(d, pane);
    if (d.type === 'r' || d.type === 'f' || d.type === 'm') {
      const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
      if (pos.x < x0 - tol || pos.x > x1 + tol || pos.y < y0 - tol || pos.y > y1 + tol) continue;
      // 長方形は枠の近く、フィボナッチは各水準の線の近くをつかむ(中をさわっても、下の足を選べるように)
      const near = d.type !== 'f'
        ? Math.min(Math.abs(pos.x - x0), Math.abs(pos.x - x1), Math.abs(pos.y - y0), Math.abs(pos.y - y1)) <= tol
        : FIB.some(f => Math.abs(pos.y - pane.yOf(d.p2.price + (d.p1.price - d.p2.price) * f)) <= tol);
      if (near) return d;
      continue;
    }
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    const u = len2 ? clamp(((pos.x - a.x) * dx + (pos.y - a.y) * dy) / len2, 0, 1) : 0;
    if (Math.hypot(pos.x - (a.x + u * dx), pos.y - (a.y + u * dy)) <= tol) return d;
  }
  return null;
}
function drawDrawings(pane) {
  const pw = plotW(), tags = [], alertTags = [];
  if (state.hideDraw) return; // 「線を隠す」を選んでいる間は、何も描かない(消えてはいない)
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
    } else if (d.type === 'a') {
      // 価格のお知らせの線。鳴ったあとは、うすい色で残す
      const y = Math.round(pane.yOf(d.p1.price)) + 0.5, col = d.done ? '#9aa0b0' : ALERT_COLOR;
      ctx.save(); ctx.strokeStyle = col; ctx.setLineDash([6, 4]);
      ctx.moveTo(0, y); ctx.lineTo(pw, y); ctx.stroke(); ctx.restore();
      alertTags.push([y, d.p1.price, col, d.done]);
    } else if (d.type === 'v') {
      const x = Math.round(xOf(idxOfTime(d.p1.t))) + 0.5;
      ctx.moveTo(x, pane.y); ctx.lineTo(x, pane.y + pane.h); ctx.stroke();
    } else if (d.type === 'x') {
      const q = drawingPoints(d, pane)[0];
      ctx.save();
      ctx.font = `${on ? '700 ' : ''}13px -apple-system, "Segoe UI", "Hiragino Sans", sans-serif`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      const w = ctx.measureText(d.text).width;
      ctx.fillStyle = rgba(THEMES[state.theme].bg, 0.8); ctx.fillRect(q.x - 3, q.y - 10, w + 6, 20);
      ctx.fillStyle = DRAW_COLOR; ctx.fillText(d.text, q.x, q.y);
      ctx.restore();
    } else if (d.type === 'm') {
      const [a, b] = drawingPoints(d, pane);
      drawMeasure(a, b, d.p1, d.p2);
      if (on) [a, b].forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); });
    } else if (d.type === 'r' || d.type === 'f') {
      const [a, b] = drawingPoints(d, pane);
      drawShape(d.type, a, b, d.p1.price, d.p2.price, on);
      if (on) [a, b].forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); });
    } else {
      const [a, b] = drawingPoints(d, pane);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      if (on) [a, b].forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); });
    }
  });
  // 2点目を選んでいる間の下書き
  if (TWO_POINT.includes(state.tool) && state.pending && state.hover) {
    const a = { x: xOf(idxOfTime(state.pending.t)), y: pane.yOf(state.pending.price) };
    ctx.lineWidth = 1.4; ctx.setLineDash([4, 4]);
    if (state.tool === 't') { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(state.hover.x, state.hover.y); ctx.stroke(); }
    else if (state.tool === 'm') { ctx.setLineDash([]); drawMeasure(a, state.hover, state.pending, { t: timeOfIdx(idxAtX(state.hover.x)), price: pane.vOf(state.hover.y) }); }
    else drawShape(state.tool, a, state.hover, state.pending.price, pane.vOf(state.hover.y), false);
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(a.x, a.y, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.lineWidth = 1;
  ctx.restore();
  tags.forEach(([y, price]) => {
    if (y > pane.y && y < pane.y + pane.h) axisTag(y, fmtPrice(price), DRAW_COLOR, '#ffffff', pane);
  });
  alertTags.forEach(([y, price, col, done]) => {
    if (y <= pane.y || y >= pane.y + pane.h) return;
    axisTag(y, fmtPrice(price), col, '#ffffff', pane);
    ctx.save();
    ctx.font = '11px -apple-system, "Segoe UI", "Hiragino Sans", sans-serif'; ctx.textBaseline = 'bottom'; ctx.textAlign = 'right'; ctx.fillStyle = col;
    ctx.fillText(done ? 'お知らせ済み' : 'ここに届いたら知らせる', pw - 6, y - 3);
    ctx.restore();
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
// ものさし:2点の間の値幅・変化率・足の本数を表示する
function drawMeasure(a, b, p1, p2) {
  const up = p2.price >= p1.price, col = up ? UP : DOWN;
  const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
  ctx.save();
  ctx.fillStyle = rgba(col, 0.12); ctx.fillRect(x0, y0, w, h);
  ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.strokeRect(Math.round(x0) + 0.5, Math.round(y0) + 0.5, w, h);
  const d = p2.price - p1.price, pct = p1.price ? d / p1.price * 100 : 0;
  const nb = Math.round(Math.abs(idxOfTime(p2.t) - idxOfTime(p1.t)));
  const text = `${d >= 0 ? '+' : ''}${fmtPrice(d, p1.price)}(${d >= 0 ? '+' : ''}${pct.toFixed(2)}%)・${nb}本`;
  ctx.font = '12px -apple-system, "Segoe UI", "Hiragino Sans", sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  const tw = ctx.measureText(text).width + 12, tx = clamp(x0 + w / 2, tw / 2 + 2, plotW() - tw / 2 - 2), ty = up ? y0 - 13 : y0 + h + 13;
  ctx.fillStyle = col; ctx.fillRect(tx - tw / 2, ty - 10, tw, 20);
  ctx.fillStyle = '#ffffff'; ctx.fillText(text, tx, ty);
  ctx.restore();
}
// 線を変える前の状態を覚えておく(「元に戻す」用。銘柄ごとに20回分まで)
const undoStack = [];
function snapDraw() {
  undoStack.push({ sym: state.symbol, list: JSON.stringify(curDrawings()) });
  if (undoStack.length > 20) undoStack.shift();
}
function undoDraw() {
  for (let k = undoStack.length - 1; k >= 0; k--) {
    if (undoStack[k].sym !== state.symbol) continue;
    const snap = undoStack.splice(k, 1)[0];
    state.drawings[state.symbol] = readDrawings({ drawings: { [state.symbol]: JSON.parse(snap.list) } })[state.symbol] || [];
    state.sel = null; save(); updateHint(); draw();
    toast('線を、ひとつ前の状態に戻しました。');
    return;
  }
  toast('元に戻せる変更がありません。');
}
// 引いた線を、消さずに隠す / 表示に戻す(メニューと、左のツールバーの両方から使う)
function toggleHideDraw() {
  state.hideDraw = !state.hideDraw; state.sel = null; updateHint(); draw();
  toast(state.hideDraw ? '線を隠しました(消えてはいません)。もう一度選ぶと表示します。' : '線を表示しました。');
}
// この銘柄に引いた線を全部消す(「元に戻す」で戻せる)
function clearDrawings() {
  const n = curDrawings().length;
  if (n) snapDraw();
  state.drawings[state.symbol] = []; state.sel = null; save(); setTool(null);
  toast(n ? `この銘柄の線を、すべて削除しました(${n}本)。「元に戻す」で戻せます。` : 'この銘柄には、消す線がありません。');
}
// 目盛りを、ふつう ⇄ 対数 に切りかえる
function toggleLogScale() {
  state.logScale = !state.logScale; save(); draw();
  toast(state.logScale ? '目盛り:対数(同じ%の値動きが、同じ高さになります)' : '目盛り:ふつう');
}
/* 左側の描画ツールバー(パソコンなど、幅の広い画面だけ)。ボタンは「ツール」メニューと同じ処理を呼ぶ。
 * 選んでいるツールは aria-pressed で示す */
let paintDrawBar = () => {};
function buildDrawBar() {
  const bar = $('drawBar');
  const I = {
    cursor: '<path d="M4 2.5l8 6.2-3.6.5 2 4-1.6.8-2-4L4 12.5z"/>',
    h: '<path d="M1.5 8h13"/><circle cx="8" cy="8" r="1.6"/>',
    v: '<path d="M8 1.5v13"/><circle cx="8" cy="8" r="1.6"/>',
    t: '<path d="M3.6 11.4l8.8-6.8"/><circle cx="2.8" cy="12" r="1.3"/><circle cx="13.2" cy="4" r="1.3"/>',
    r: '<rect x="2.5" y="4" width="11" height="8" rx="1"/>',
    f: '<path d="M2 3h12M2 6.5h12M2 9.5h12M2 13h12"/>',
    m: '<path d="M2.2 10.6l8.4-8.4 3.2 3.2-8.4 8.4z"/><path d="M5 8.6l1.2 1.2M7 6.6l1.2 1.2M9 4.6l1.2 1.2"/>',
    x: '<path d="M3.5 4.5V3h9v1.5M8 3v10M6.2 13h3.6"/>',
    a: '<path d="M4 11V7.5a4 4 0 0 1 8 0V11l1.2 1.5H2.8zM6.8 14h2.4"/>',
    hide: '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/><path d="M2.5 13.5l11-11"/>',
    undo: '<path d="M5.5 3L2.5 6l3 3"/><path d="M2.5 6h6.5a4 4 0 0 1 0 8H6"/>',
  };
  const btns = [];
  let armed = 0, armedSym = '';
  const add = (key, icon, label, fn, pressed) => {
    const b = el('button', { type: 'button', title: label, 'aria-label': label });
    b.innerHTML = svg(icon);
    b.addEventListener('click', () => fn(b));
    bar.appendChild(b);
    btns.push([b, pressed]);
    return b;
  };
  const tool = (key, label) => add(key, I[key], label, () => setTool(state.tool === key ? null : key), () => state.tool === key);
  add('cursor', I.cursor, 'カーソル(線を引かずに、チャートを動かす・線を選ぶ)', () => setTool(null), () => !state.tool);
  tool('h', '水平線(決めた価格に横線を引く)');
  tool('v', '垂直線(決めた日時に縦線を引く)');
  tool('t', 'トレンドライン(2点を結ぶ線を引く)');
  tool('r', '長方形(値動きの範囲を囲む)');
  tool('f', 'フィボナッチ(戻りの目安を引く)');
  tool('m', 'ものさし(値幅・変化率・足の本数を測る)');
  tool('x', '文字(メモを書きこむ)');
  tool('a', '価格のお知らせ(届いたら知らせる線を置く)');
  bar.appendChild(el('span', { class: 'sep', 'aria-hidden': 'true' }));
  add('hide', I.hide, '線を隠す / 表示する', () => toggleHideDraw(), () => !!state.hideDraw);
  add('undo', I.undo, '元に戻す(Ctrl + Z)', () => undoDraw());
  // 全部消すのは、押しまちがいを防ぐため、2回押して確定する(この画面のほかのボタンと同じやり方)
  const NAME = '線をすべて削除';
  const del = add('clear', ICONS.trash.replace(/^<svg[^>]*>|<\/svg>$/g, ''), NAME, () => {
    const n = curDrawings().length, now = Date.now();
    if (!n) { toast('この銘柄には、消す線がありません。'); return; }
    if (now - armed > 4000 || armedSym !== state.symbol) {
      armed = now; armedSym = state.symbol; del.classList.add('armed'); del.title = 'もう一度押すと、すべて削除します'; del.setAttribute('aria-label', del.title);
      toast(`もう一度押すと、この銘柄の線(${n}本)をすべて削除します。`);
      setTimeout(() => { if (Date.now() - armed >= 3900) disarm(); }, 4000);
      return;
    }
    if (now - armed < 400) return; // 続けざまの2回押し(押しまちがい)では消さない
    disarm(); clearDrawings();
  });
  const disarm = () => { armed = 0; del.classList.remove('armed'); del.title = NAME; del.setAttribute('aria-label', NAME); };
  document.addEventListener('pointerdown', e => { if (armed && !del.contains(e.target)) disarm(); });
  paintDrawBar = () => btns.forEach(([b, pressed]) => { if (pressed) b.setAttribute('aria-pressed', String(!!pressed())); });
  paintDrawBar();
}
// 長方形と、フィボナッチ・リトレースメント(p1 を 100%、p2 を 0% として、戻りの目安の水準を引く)
function drawShape(type, a, b, price1, price2, on) {
  const x0 = Math.min(a.x, b.x), w = Math.abs(b.x - a.x);
  if (type === 'r') {
    ctx.fillStyle = rgba(DRAW_COLOR, 0.1);
    ctx.fillRect(x0, Math.min(a.y, b.y), w, Math.abs(b.y - a.y));
    ctx.strokeRect(Math.round(x0) + 0.5, Math.round(Math.min(a.y, b.y)) + 0.5, w, Math.abs(b.y - a.y));
    ctx.fillStyle = DRAW_COLOR;
    return;
  }
  ctx.font = '11px -apple-system, "Segoe UI", "Hiragino Sans", sans-serif'; ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
  // 線の間がせまいときは、文字が重ならないよう、主な水準(0・50・61.8・100%)から順に、置けるものだけ書く
  const placed = [];
  FIB.slice().sort((p, q) => [0, 1, 0.618, 0.5, 0.382, 0.236, 0.786].indexOf(p) - [0, 1, 0.618, 0.5, 0.382, 0.236, 0.786].indexOf(q)).forEach(f => {
    // 水準の位置は、価格から決める(対数目盛りでも、書いてある価格の高さに線が来る)
    const lv = price2 + (price1 - price2) * f, pane = panes[0];
    const y = Math.round(pane && pane.yOf && lv > 0 ? pane.yOf(lv) : b.y + (a.y - b.y) * f) + 0.5;
    ctx.globalAlpha = f === 0 || f === 1 || f === 0.5 || f === 0.618 ? 1 : 0.6;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + Math.max(w, 40), y); ctx.stroke();
    if (placed.some(py => Math.abs(py - y) < 12)) return;
    placed.push(y);
    ctx.fillText(`${(f * 100).toFixed(1)}%  ${fmtPrice(lv)}`, x0 + 3, y - 2);
  });
  ctx.globalAlpha = 1;
  ctx.lineWidth = on ? 2.5 : 1.4;
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
  else if (state.tool === 'a') text = '知らせてほしい価格をタップ';
  else if (state.tool === 'x') text = '文字を置きたい場所をタップ';
  else if (state.tool === 'replay') text = 'リプレイを始める足をタップ';
  else if (state.tool === 'm') text = state.pending ? '測りたい終わりの点をタップ' : '測りたい始まりの点をタップ';
  else if (state.tool === 'v') text = '線を置きたい日時をタップ';
  else if (state.tool === 'f') text = state.pending ? '動きの終わり(戻りを測りたい側)をタップ' : '動きの始まり(安値か高値)をタップ';
  else if (state.tool === 'r') text = state.pending ? '反対側の角をタップ' : '角をタップ';
  else if (state.tool === 't') text = state.pending ? '終点をタップ' : '始点をタップ';
  else if (state.sel) text = TWO_POINT.includes(state.sel.type) ? 'ドラッグで移動(端の点で形を変更)' : 'ドラッグで移動できます';
  box.hidden = !text;
  $('hintText').textContent = text;
  btn.textContent = state.tool ? '中止' : '削除';
  canvas.classList.toggle('placing', !!state.tool);
  paintDrawBar();
}
function removeSelected() {
  if (!state.sel) return;
  snapDraw();
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
  if (state.tool === 'replay') { const i = Math.round(idxAtX(pos.x)); setTool(null); startReplay(i); return; }
  if (curDrawings().length >= 200) { toast('線は1銘柄につき200本までです。'); setTool(null); return; }
  if (state.hideDraw) { state.hideDraw = false; paintDrawBar(); toast('隠していた線を、表示に戻しました。'); }
  if (state.tool === 'x') {
    const text = plain(window.prompt('チャートに書きこむ文字(40文字まで)', '') || '', 40);
    if (text) { snapDraw(); curDrawings().push({ type: 'x', p1: pt, text }); save(); }
    setTool(null);
    return;
  }
  if (state.tool !== 'a' && (state.tool === 'h' || state.tool === 'v' || state.pending)) snapDraw();
  if (state.tool === 'a') {
    // いまの価格より上に置いたら「上がって届いたとき」、下なら「下がって届いたとき」に知らせる
    const last = state.bars[state.bars.length - 1].c;
    if (pt.price === last) { toast('いまの価格と同じ位置には置けません。少し上か下に置いてください。'); return; }
    curDrawings().push({ type: 'a', p1: pt, above: pt.price > last, done: false });
    try { if (window.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch (e) { /* 通知が使えない環境 */ }
    setTool(null);
    toast(`${fmtPrice(pt.price)} に${pt.price > last ? '上がって' : '下がって'}届いたら、お知らせします(この銘柄を表示している間)。`);
  }
  else if (state.tool === 'h' || state.tool === 'v') { curDrawings().push({ type: state.tool, p1: pt }); setTool(null); }
  else if (!state.pending) { state.pending = pt; updateHint(); }
  else { curDrawings().push({ type: state.tool, p1: state.pending, p2: pt }); setTool(null); }
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
    [[ICONS.eye, '表示/非表示', () => { ind.hidden = !ind.hidden; recompute(); save(); draw(); }],
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
      if (compareOn()) {
        // 比べている銘柄:名前と、左端からの変化率を、線と同じ色で出す。× で比較をやめる
        used.add('cmp');
        const le = legendFor('cmp', null, mainStack()), cs = SYMBOLS.find(x => x.id === state.compare), v = cmp.view;
        if (!le.querySelector('.cmp-x')) {
          le.classList.add('cmp');
          le.querySelector('.name').style.color = CMP_COLOR;
          const x = document.createElement('button');
          x.type = 'button'; x.className = 'cmp-x'; x.textContent = '×'; x.title = '比較をやめる'; x.setAttribute('aria-label', '比較をやめる');
          x.addEventListener('click', () => setCompare(null));
          le.appendChild(x);
        }
        setText(le, '.name', cs ? cs.label : state.compare);
        // 比べる銘柄の歴史が短いと、左端にはデータがない。そのときは、0% にした日を出す
        setText(le, '.params', v && v.late ? `比較(${fmtDate(state.bars[v.base].t)} から)` : '比較(左端から)');
        let k = i;
        while (v && k >= v.base && !(v.val[k] > 0)) k--;
        setVals(le, v && k >= v.base ? [['', fmtPct(v.pct(k)), CMP_COLOR]]
          : [['', !state.live ? 'デモデータでは比べられません' : cmp.err ? 'データを取得できません' : cmp.byT.size ? 'この範囲のデータがありません' : '読み込み中…', '']]);
      }
      setText(el, '.name', `${curSymbol().label} · ${curInterval().label}${state.chartType === 'heikin' ? ' · 平均足' : ''}${panes[0].log ? ' · 対数' : ''}`);
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
  if (!ind.out) recompute(); // 隠していて計算を省いていたものは、設定を開くときに計算する
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
// 複数の移動平均線の1本分:表示する・期間・色 を1行で
function fSlot(i) {
  const p = dlg.ind.p;
  const on = el('input', { type: 'checkbox', 'aria-label': `線${i} を表示` });
  on.checked = !!p[`on${i}`];
  const len = el('input', { class: 'ctl', type: 'number', min: '1', max: '1000', step: '1', inputmode: 'numeric', 'aria-label': `線${i} の期間` });
  len.value = p[`len${i}`];
  const color = el('input', { type: 'color', 'aria-label': `線${i} の色` });
  color.value = p[`c${i}`];
  const sync = () => { len.disabled = color.disabled = !on.checked; };
  on.addEventListener('change', () => { p[`on${i}`] = on.checked; sync(); applyLive(); });
  len.addEventListener('input', () => { const v = parseInt(len.value, 10); if (v >= 1) { p[`len${i}`] = clamp(v, 1, 1000); applyLive(); } });
  len.addEventListener('blur', () => { len.value = p[`len${i}`]; });
  color.addEventListener('input', () => { p[`c${i}`] = color.value; applyLive(); });
  sync();
  return el('div', { class: 'row slot' }, [el('label', { class: 'slot-on' }, [on, el('span', { text: `線${i}` })]), el('span', { class: 'slot-len' }, [len, el('small', { text: '本' })]), color]);
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
    const ps = GT.DEFS[ind.type].params;
    ps.forEach(q => {
      // 「線○を表示」「期間」「色」の3つ組は、1行にまとめる(複数の移動平均線など)
      const slot = /^on(\d+)$/.exec(q.key);
      if (slot && q.type === 'bool') { add(fSlot(slot[1])); return; }
      if (/^(len|c)\d+$/.test(q.key) && ps.some(x => x.key === `on${q.key.replace(/\D/g, '')}`)) return;
      if (q.type === 'bool') add(fCheck(q.key, q.label, q.hint));
      else if (q.type === 'color') add(fColor(q.key, q.label));
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
      fColor('color', '線の色'),
      fCheck('showMa', 'RSI の平均線を表示', 'RSI をならした線。RSI がこの線の上なら勢いは上向き'),
      fNumber('maLen', '平均線の期間', 1, 500, 1),
      fColor('cMa', '平均線の色')
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
  refreshSymbols = () => { fillSymbols(); $('symbol').value = state.symbol; };
  const fillSymbols = () => {
    sel.textContent = '';
    // 分類ごとにまとめて並べる。利用者が追加した銘柄は「追加した銘柄」にまとめる
    SYMBOL_CATS.concat([['', '追加した銘柄']]).forEach(([cat, name]) => {
      const list = SYMBOLS.filter((s, i) => (cat ? s.cat === cat : i >= BUILTIN));
      if (!list.length) return;
      const g = el('optgroup', { label: name });
      list.forEach(s => g.appendChild(el('option', { value: s.id, text: s.long || s.label })));
      sel.appendChild(g);
    });
    sel.appendChild(el('option', { value: '__add', text: '🔍 すべての銘柄から探す(1,300以上)…' }));
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
        if (wasCurrent) state.symbol = 'BTCUSDT';
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
  // 人気の順:最初から選べる銘柄の並び(上ほど人気)を使い、そこにないものは後ろへ
  const POP = {}; SYMBOLS.slice(0, BUILTIN).filter(s => s.cat !== 'fx').forEach((s, i) => { const b = s.id.slice(0, -s.quote.length); if (!(b in POP)) POP[b] = i; });
  const pop = b => (b in POP ? POP[b] : 9999);
  const searchUniverse = () => {
    if (!universe) return [];
    const text = symIn.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const score = u => (u.base === text ? 0 : u.base.startsWith(text) ? 1 : u.id.startsWith(text) ? 2 : u.id.includes(text) ? 3 : 9);
    return universe
      .filter(u => (!chip || u.quote === chip) && (!text || score(u) < 9))
      .sort((x, y) => (text ? score(x) - score(y) : 0) || rank(x.quote) - rank(y.quote) || pop(x.base) - pop(y.base) || x.base.localeCompare(y.base));
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
    // スマホでは時間足の列が横にスクロールする。選んでいるものが見える位置に来るようにする
    if (iv.id === state.interval) setTimeout(() => { if (b.scrollIntoView) b.scrollIntoView({ block: 'nearest', inline: 'center' }); }, 0);
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
  const liveHints = []; // いまの設定を説明文に出す項目(開くたびに書き直す)
  const toggleDraw = on => {
    if (on) liveHints.forEach(([node, fn]) => { node.textContent = fn(); });
    if (on) setTimeout(() => { dMenu.scrollTop = 0; }, 0); // 項目が多くて中でスクロールするので、開くたびに先頭から見せる
    dMenu.hidden = !on; dBtn.setAttribute('aria-expanded', String(on));
  };
  // 重ねて比べる銘柄を選ぶ画面。銘柄の一覧は、上の銘柄選びと同じ分類で並べる
  const cmpOv = $('cmpOverlay');
  const closeCmp = () => { if (cmpOv.hidden) return; cmpOv.hidden = true; dBtn.focus(); };
  const openCompare = () => {
    const box = $('cmpList');
    box.textContent = '';
    SYMBOL_CATS.concat([['', '追加した銘柄']]).forEach(([cat, name]) => {
      const list = SYMBOLS.filter((x, i) => (cat ? x.cat === cat : i >= BUILTIN) && x.id !== state.symbol);
      if (!list.length) return;
      box.appendChild(el('div', { class: 'sect', text: name }));
      list.forEach(x => {
        const on = state.compare === x.id;
        const b = el('button', { type: 'button', 'aria-pressed': String(on) }, [el('span', { text: x.long || x.label }), el('small', { text: on ? '比較中' : '' })]);
        b.addEventListener('click', () => { closeCmp(); setCompare(x.id); toast(`${x.label} を重ねました。画面の左端を 0% として、そこからの変化率(%)で比べます。`); });
        box.appendChild(b);
      });
    });
    $('cmpOff').disabled = !state.compare;
    cmpOv.hidden = false; $('cmpCancel').focus();
  };
  $('cmpOff').addEventListener('click', () => { closeCmp(); setCompare(null); toast('銘柄の比較をやめました。'); });
  $('cmpCancel').addEventListener('click', closeCmp);
  cmpOv.addEventListener('pointerdown', e => { if (e.target === cmpOv) closeCmp(); });
  [['水平線', '決めた価格に横線を引く', () => setTool('h')],
   ['トレンドライン', '2点を結ぶ線を引く', () => setTool('t')],
   ['垂直線', '決めた日時に縦線を引く', () => setTool('v')],
   ['価格のお知らせ', '決めた価格に届いたら知らせる線を置く(注文はしません)', () => setTool('a')],
   ['ものさし', '2点の間の値幅・変化率・足の本数を測る', () => setTool('m')],
   ['文字', 'チャートにメモの文字を書きこむ', () => setTool('x')],
   ['線を隠す / 表示する', '引いた線を、消さずに一時的に見えなくする', () => toggleHideDraw()],
   ['元に戻す', '線の追加・移動・削除を、ひとつ前に戻す(Ctrl + Z)', () => undoDraw()],
   ['リプレイ', '過去の足を選び、そこから値動きを1本ずつ再生する', () => { if (state.replay) stopReplay(false); setTool('replay'); }],
   ['全画面表示', '画面いっぱいに表示する(もう一度選ぶと戻る)', () => { try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); } catch (e) { toast('この端末では、全画面表示を使えません。'); } }],
   ['長方形', '2つの角を決めて、値動きの範囲を囲む', () => setTool('r')],
   ['フィボナッチ', '上げ(下げ)の始まりと終わりを決めて、戻りの目安を引く', () => setTool('f')],
   ['売買ルールを試す', '移動平均の交差や RSI などで売買していたら、どうなっていたかを過去データで計算', () => openRules()],
   ['表示を切りかえ', 'ローソク足 → 平均足 → ライン の順に変わります', () => {
     const k = CHART_TYPES.findIndex(c => c[0] === state.chartType);
     state.chartType = CHART_TYPES[(k + 1) % CHART_TYPES.length][0];
     save(); draw(); toast(`表示:${CHART_TYPES.find(c => c[0] === state.chartType)[1]}`);
   }],
   ['目盛り:ふつう / 対数', () => (state.logScale ? 'いまは「対数」(同じ%の値動きが、同じ高さ)。押すと「ふつう」に戻ります' : 'いまは「ふつう」。押すと「対数」(同じ%の値動きが、同じ高さ)になります'), () => toggleLogScale()],
   ['銘柄を重ねて比べる…', () => { const c = state.compare && SYMBOLS.find(x => x.id === state.compare); return c ? `いまは ${c.label} を重ねています。別の銘柄に変える・やめるときも、ここから` : 'もう1つの銘柄を、変化率(%)の線で重ねて、値動きを比べる'; }, () => openCompare()],
   ['チャート上の売買ボタン:表示 / 隠す', () => (state.quickTrade ? 'いまは「表示」。押すと、チャート左上の売り・買いボタンを隠します' : 'いまは「隠す」。押すと、チャート左上に売り・買いボタンを出します'), () => {
     state.quickTrade = !state.quickTrade; save(); renderTrade();
     toast(state.quickTrade ? 'チャート上の売買ボタンを表示しました(幅の広い画面で、チャートの左上に出ます)。' : 'チャート上の売買ボタンを隠しました。');
   }],
   ['線をすべて削除', 'この銘柄に引いた線を全部消す', () => clearDrawings()],
   ['画像として保存', 'いまのチャートを PNG 画像でダウンロード', () => { state.hover = null; render(); saveImage(); }],
   ['使い方の案内', '画面の主な場所を、順番に案内します(1分ほど)', () => startTour()],
   ['使い方(一覧)', '画面の動かし方と、主な機能の場所', () => openHelp()],
   ['操作マニュアル', 'すべての機能の使い方を、目的別にまとめたページ', () => { location.href = 'manual.html'; }],
   ['教科書を読む', '銘柄・インジケーター・手法・資金管理の解説', () => { location.href = 'guide.html'; }],
  ].forEach(([name, hint, fn]) => {
    const b = el('button', { type: 'button', text: name }), small = el('small', { text: typeof hint === 'function' ? hint() : hint });
    if (typeof hint === 'function') liveHints.push([small, hint]);
    b.appendChild(small);
    b.addEventListener('click', () => { toggleDraw(false); fn(); });
    dMenu.appendChild(b);
  });
  dBtn.addEventListener('click', e => { e.stopPropagation(); toggleMenu(false); toggleDraw(dMenu.hidden); });
  btn.addEventListener('click', () => toggleDraw(false));
  document.addEventListener('click', e => { if (!dMenu.contains(e.target)) toggleDraw(false); });
  $('hintBtn').addEventListener('click', () => { if (state.tool) setTool(null); else removeSelected(); });
  sel.addEventListener('change', () => { state.sel = null; setTool(null); });
  buildDrawBar();

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
    closeCmp();
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
      if (TWO_POINT.includes(state.sel.type)) {
        // 端の点をつかんだときは、その点だけ動かす(向きや長さを変えられる)
        const ends = drawingPoints(state.sel, panes[0]);
        const k = ends.findIndex(q => Math.hypot(q.x - p.x, q.y - p.y) <= tol);
        if (k >= 0) keys = [k ? 'p2' : 'p1'];
      }
      snapDraw();
      dragD = { start: p, keys, orig: JSON.parse(JSON.stringify(state.sel)) };
      state.dragging = state.sel;
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
      const dy = p.y - dragD.start.y; // 価格は「元の位置から何ピクセル動かしたか」で決める(対数目盛りでも、指の動きと線の動きが合う)
      const di = Math.round((p.x - dragD.start.x) / state.barW);
      dragD.keys.forEach(k => {
        if (!o[k]) return;
        if (d.type !== 'v') d[k].price = pane.vOf(pane.yOf(o[k].price) + dy);
        if (d.type !== 'h') d[k].t = timeOfIdx(Math.round(idxOfTime(o[k].t)) + di);
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
    if (dragD) {
      // お知らせの線を動かしたら、新しい位置で待ち直す
      const d = state.sel, last = state.bars.length ? state.bars[state.bars.length - 1].c : NaN;
      // 動かしたときだけ、待ち直す(選んだだけ・押しただけでは、鳴り終わった線を元に戻さない)
      if (d && d.type === 'a' && isFinite(last) && moved > 3 && d.p1.price !== dragD.orig.p1.price) { d.above = d.p1.price > last; d.done = false; }
      dragD = null; state.dragging = null; save(); draw();
    }
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
/* レバレッジ取引(分離マージン)。
 * 証拠金 = 取引額 ÷ レバレッジ。損失がポジションの証拠金に近づくと、強制決済される。
 * 維持証拠金の割合は、Binance の先物の小さい建玉の水準(0.4〜0.5% ほど)に合わせて 0.5% とした。
 * 1倍は、これまでどおりの「現物」の扱い(証拠金ではなく、取引額そのものを使う) */
const LEVERAGES = [1, 2, 3, 5, 10, 20, 50, 100], MAX_LEV = 100, MMR = 0.005;
// ポジションの強制決済の価格(1倍のときは null)
function liqPrice(p) {
  if (!p || !(p.lev > 1) || !(p.margin > 0)) return null;
  const q = Math.abs(p.qty);
  const v = p.qty > 0 ? (p.avg * q - p.margin) / (q * (1 - MMR)) : (p.margin + q * p.avg) / (q * (1 + MMR));
  return v > 0 ? v : null;
}
// これから建てる場合の、強制決済の価格の目安
function liqAt(dir, entry, lev) {
  if (!(lev > 1) || !(entry > 0)) return null;
  return dir > 0 ? entry * (1 - 1 / lev) / (1 - MMR) : entry * (1 + 1 / lev) / (1 + MMR);
}
/* 資金調達料(ファンディング)。先物の取引所では、8時間ごと(日本時間 9時・17時・1時 = UTC 0時・8時・16時)に、
 * 買いの人と売りの人の間でお金をやり取りする。率は毎回変わる(プラスなら買いが払い、売りが受け取る)。
 * Binance の先物(USDⓈ-M の無期限)に同じ銘柄があれば、その実際の率を取り寄せて使う。
 * 取り寄せられないとき(先物にない銘柄・円建て・計算値の銘柄・通信の失敗)は、取引所の基準の率 0.01% が
 * 続いたものとした目安で計算する。どちらを使ったかは、取引履歴の行に出す。レバレッジ1倍(現物)は払わない */
const FUND_RATE = 0.0001, FUND_MS = 8 * 36e5;
const FAPI = 'https://fapi.binance.com';
/* 銘柄ごとの、取り寄せた実際の率。
 * st: '' まだ / 'ok' 取れた / 'none' 先物にない / 'fail' 失敗(しばらく目安を使う)
 * rates: 取引所の精算の時刻 → 率。from〜upTo: 取り寄せ済みの時間帯(取引所の時刻)。next: いまの期間の率の予想 */
const fundReal = {};
// 実際の率を取りにいける銘柄か(USDT 建ての、取引所に実在する銘柄だけ。先物にあるかは、聞いてみるまで分からない)
const perpOf = sym => (!SYNTH[sym] && SYM_RE.test(sym) && quoteOf(sym) === 'USDT' && sym.endsWith('USDT') ? sym : null);
function fundState(sym) {
  return fundReal[sym] || (fundReal[sym] = { st: '', busy: false, rates: new Map(), from: Infinity, upTo: -Infinity, retryAt: 0, next: null, nextAt: -1e9, nextBusy: false });
}
// 取りにいく(8秒で打ち切り)。400 は「その銘柄は先物にない」。CORS などで届かないときも、失敗として扱う
async function fapiGet(path) {
  const ac = new AbortController(), timer = setTimeout(() => ac.abort(), 8000);
  try {
    const res = await fetch(FAPI + path, { signal: ac.signal });
    if (res.status === 400) return { none: true };
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return { data: await res.json() };
  } finally { clearTimeout(timer); }
}
// 過去の実際の率を、from から現在まで取り寄せる。失敗しても例外は出さない(目安の率に切りかえる)
async function loadFunding(sym, from) {
  const f = fundState(sym);
  if (!perpOf(sym)) { f.st = 'none'; return f; }
  if (f.st === 'none' || f.busy || mono() < f.retryAt) return f;
  f.busy = true;
  const start = Math.min(from, f.from), asked = tnow();
  try {
    const r = await fapiGet(`/fapi/v1/fundingRate?symbol=${encodeURIComponent(sym)}&startTime=${Math.floor(start)}&endTime=${Math.floor(asked)}&limit=1000`);
    if (r.none) f.st = 'none';
    else {
      if (!Array.isArray(r.data)) throw new Error('bad');
      r.data.forEach(x => { const t = +x.fundingTime, v = +x.fundingRate; if (fin(t) && fin(v) && Math.abs(v) < 0.05) f.rates.set(t, v); });
      f.from = start; f.upTo = Math.max(f.upTo, asked); f.st = 'ok';
      f.retryAt = mono() + 30000; // 精算の直後は、まだ記録に載っていないことがあるので、少し待ってから取り直す
    }
  } catch (e) { if (f.st !== 'ok') f.st = 'fail'; f.retryAt = mono() + 60000; }
  f.busy = false;
  return f;
}
// いまの期間の率の予想(次の精算の時刻と率)。ポジションの欄に出す。5分に1回まで
async function loadNextFunding(sym) {
  const f = fundState(sym);
  if (!perpOf(sym) || f.st === 'none' || f.nextBusy || mono() - f.nextAt < 300000) return;
  f.nextBusy = true; f.nextAt = mono();
  try {
    const r = await fapiGet(`/fapi/v1/premiumIndex?symbol=${encodeURIComponent(sym)}`);
    if (r.none) f.st = 'none';
    else if (r.data && fin(+r.data.lastFundingRate) && fin(+r.data.nextFundingTime)) f.next = { t: +r.data.nextFundingTime, rate: +r.data.lastFundingRate };
  } catch (e) { f.next = null; }
  f.nextBusy = false;
  renderTrade();
}
/* 区切りの時刻 B(UTC 0・8・16時)に払う率。{ rate, real } か、まだ分からなければ null。
 * 実際の率は、(B − 8時間, B] に精算された分を足す(4時間ごとに精算する銘柄もあるため)。
 * B ちょうどの精算の記録がまだ載っていなければ、10分までは待ち、それを過ぎたら目安にする */
function fundRateAt(sym, B) {
  const est = { rate: FUND_RATE, real: false };
  if (!perpOf(sym)) return est;
  const f = fundReal[sym];
  if (!f || (f.st === '' && !f.busy) || (f.busy && f.st !== 'ok')) return null;
  // 失敗したあとは、しばらく目安を使い、時間をおいてから取り直す(一度の失敗で、ずっと目安にはしない)
  if (f.st === 'fail') return mono() >= f.retryAt && !f.busy ? null : est;
  if (f.st !== 'ok') return est;
  if (B <= f.from) return null; // まだ取り寄せていない時間帯
  let sum = 0, atB = false;
  f.rates.forEach((v, t) => { if (t > B - FUND_MS + 60000 && t <= B + 60000) { sum += v; if (t > B - 60000) atB = true; } });
  if (atB) return { rate: sum, real: true };
  return f.upTo >= B + 600000 ? est : null;
}
// 取引履歴の資金調達料の行に出す、どちらの率を使ったか
const fundLabel = h => (h.fund === 'real' ? '実際の率' : h.fund === 'mix' ? '実際の率と目安' : '0.01%の目安');
// ポジションの欄に出す、資金調達料の率の説明
function fundNowText(sym) {
  const f = fundReal[sym];
  if (!perpOf(sym) || (f && f.st === 'none')) return '0.01%の目安(この銘柄は実際の率がありません)';
  if (f && f.next) return `次回 ${pctRate(f.next.rate)}(実際の率。+は買いが払う)${fundYearText(f.next.rate)}`;
  if (f && (f.nextBusy || f.busy)) return '実際の率を取り寄せています…';
  return '0.01%の目安(実際の率を取れませんでした)';
}
const pctRate = v => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(4)}%`;
/* 資金調達料の率を年率に直す(8時間ごと = 1日3回 × 365日。4時間ごとの銘柄では実際はこの2倍)。
 * 年率 30% を超えるほど買いに偏っているときは、落ち着いて知らせる。Schmeling・Schrimpf・Todorov(BIS WP 1087)は、
 * 先物と現物の価格差(キャリー)が大きいと、そのあとに急落が起きやすく、レバレッジを求める個人の買いが原因の一つだと報告している */
const FUND_WARN = 0.3;
const fundYear = rate => rate * 3 * 365;
function fundYearText(rate) {
  if (!fin(rate)) return '';
  const y = fundYear(rate);
  return ` ・ 年率にすると約 ${y >= 0 ? '+' : ''}${(y * 100).toFixed(1)}%` +
    (Math.abs(y) >= FUND_WARN ? `。年率 ${FUND_WARN * 100}% を超える率は、過去には、そのあとの急な値下がりと結びつきやすかったと報告されています(Schmeling・Schrimpf・Todorov、BIS WP 1087)` : '');
}
/* 成行注文が板(上位5段)を食っていくときの、5段目より先の分。5段より先の板は見えないので、見積もる。
 * 見えている5段と同じ厚さ(価格 1 あたりの数量)が、その先にも続いているとして、足りない分の平均の価格を出す
 * (足りない分が多いほど不利になる)。ただし、
 *   ・5段目の価格から BOOK_PENALTY(0.1%)より不利にはしない(以前は、足りない分をすべて 0.1% 不利にしていた。
 *     小さな不足でも 0.1% 不利になり、実際のどの約定より悪い価格になることがあった)
 *   ・全体の平均は、直近30秒に実際にあった約定のいちばん不利な価格から RECENT_CAP(0.05%)より不利にはしない
 *     (5段目そのものがそれより不利なら、5段目まで) */
const BOOK_PENALTY = 0.001, RECENT_CAP = 0.0005;
/* 板(上位5段)を使って、成行注文の平均の約定価格を見積もる。want: { qty } か { notional }。
 * 板が取れていない(古い・別の銘柄・計算値の銘柄)ときは null */
function bookFill(sym, side, want) {
  const bk = feed.book;
  if (!bk || bk.sym !== sym || mono() - bk.at > 5000) return null;
  const lv = side === 'buy' ? bk.asks : bk.bids;
  if (!lv.length) return null;
  const byQty = want.qty !== undefined, goal = byQty ? want.qty : want.notional;
  if (!(goal > 0)) return null;
  let qty = 0, cost = 0;
  for (const [p, s] of lv) {
    const left = byQty ? goal - qty : goal - cost;
    if (left <= goal * 1e-12) break;
    const take = byQty ? Math.min(s, left) : Math.min(s, left / p);
    qty += take; cost += take * p;
  }
  const left = byQty ? goal - qty : goal - cost;
  const dir = side === 'buy' ? 1 : -1, p1 = lv[0][0], p5 = lv[lv.length - 1][0];
  const over = left > goal * 1e-9; // 5段では足りなかった
  let worst = p5, capped = false;
  if (over) {
    const depth = lv.reduce((a, x) => a + x[1], 0), width = Math.max(Math.abs(p5 - p1), p1 * 1e-4); // 1段しかないときは、幅を 0.01% とみる
    const lq = byQty ? left : left / p5; // 足りない数量(金額のときは、5段目の価格で数量に直す)
    const extra = Math.min(lq / (depth / width) / 2, p5 * BOOK_PENALTY); // 足りない分の平均が、5段目からどれだけ不利か
    const avg = p5 + dir * extra;
    worst = p5 + dir * Math.min(2 * extra, p5 * BOOK_PENALTY);
    const take = byQty ? left : left / avg; qty += take; cost += take * avg;
  }
  let px = cost / qty;
  const ext = over ? recentExtreme(side) : NaN;
  if (ext > 0) {
    const bound = dir > 0 ? Math.max(ext * (1 + RECENT_CAP), p5) : Math.min(ext * (1 - RECENT_CAP), p5);
    if (dir > 0 ? px > bound : px < bound) { px = bound; capped = true; if (byQty) cost = qty * px; else qty = cost / px; }
  }
  return { px, qty, notional: cost, top: p1, over, worst, capped };
}
/* 指値を置くときに、同じ価格で前に並んでいる数量を、板(上位5段)から読む。
 * 買いの指値は買いの板(bids)、売りの指値は売りの板(asks)に並ぶ。その価格が見えている板になければ null(分からない) */
function queueAhead(sym, side, price) {
  const bk = feed.book;
  if (!bk || bk.sym !== sym || mono() - bk.at > 5000) return null;
  const lv = (side === 'buy' ? bk.bids : bk.asks).find(x => x[0] === price);
  return lv ? lv[1] : null;
}
/* その時刻までに過ぎた資金調達の時刻(8時間ごと)の分を、まとめて精算する。price: そのときの価格。
 * 実際の率をまだ取り寄せ中なら、force でないときは精算を先に延ばす(取り寄せを始めて false を返す)。
 * force(売買の直前・閉じていた間の確認)は待てないので、分からない回は目安の率で精算する。
 * 保存は呼んだ側で行う(精算したら true を返す) */
function settleFunding(sym, upTo, price, force) {
  const p = T.positions[sym];
  if (!p || !(p.lev > 1) || !(price > 0) || !fin(upTo)) return false;
  const from = fin(p.fundAt) ? p.fundAt : p.opened;
  const k = Math.floor(upTo / FUND_MS) - Math.floor(from / FUND_MS); // (from, upTo] の間にある区切りの数
  if (k <= 0) return false;
  const first = (Math.floor(from / FUND_MS) + 1) * FUND_MS;
  let sum = 0, nReal = 0, wait = false;
  for (let i = 0; i < k; i++) {
    let r = fundRateAt(sym, first + i * FUND_MS);
    if (!r) { wait = true; r = { rate: FUND_RATE, real: false }; }
    sum += r.rate; if (r.real) nReal++;
  }
  if (wait) { loadFunding(sym, first - FUND_MS); if (!force) return false; }
  p.fundAt = Math.floor(upTo / FUND_MS) * FUND_MS;
  const amt = Math.abs(p.qty) * price * sum * Math.sign(p.qty); // 率がプラスなら、買いは払い(+)、売りは受け取る(−)
  acct(quoteOf(sym)).cash -= amt;
  const kind = nReal === k ? 'real' : nReal > 0 ? 'mix' : 'est';
  const note = kind === 'real' ? `資金調達料(取引所の実際の率 計 ${pctRate(sum)}、${k}回)`
    : kind === 'mix' ? `資金調達料(実際の率${nReal}回+目安0.01%×${k - nReal}回、計 ${pctRate(sum)})` : `資金調達料の目安(0.01%×${k}回)`;
  T.history.unshift({ t: p.fundAt, sym, side: p.qty > 0 ? 'buy' : 'sell', qty: Math.abs(p.qty), price, fee: 0, pnl: -amt, reason: 'fund', away: false, feeIn: 0, pid: p.id, note, lev: p.lev, fund: kind });
  T.history.length = Math.min(T.history.length, 3000);
  return true;
}
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
  const levOf = v => (fin(v) && v >= 1 && v <= MAX_LEV ? Math.round(v) : 1);
  each(t.positions, (s, v) => {
    if (!SYM_RE.test(s) || !v || !fin(v.qty) || v.qty === 0 || !fin(v.avg) || !(v.avg > 0)) return;
    const opened = fin(v.opened) ? v.opened : Date.now();
    out.positions[s] = {
      qty: v.qty, avg: v.avg, tp: level(v.tp), sl: level(v.sl), opened,
      id: fin(v.id) ? v.id : opened, levelsAt: fin(v.levelsAt) ? v.levelsAt : opened, feeOpen: fin(v.feeOpen) && v.feeOpen >= 0 ? v.feeOpen : 0,
      lev: levOf(v.lev), fundAt: fin(v.fundAt) ? v.fundAt : undefined,
    };
    const P1 = out.positions[s];
    P1.margin = P1.lev > 1 ? (fin(v.margin) && v.margin > 0 ? v.margin : Math.abs(P1.qty) * P1.avg / P1.lev) : 0;
  });
  if (Array.isArray(t.orders)) {
    t.orders.slice(0, 20).forEach(o => {
      if (!o || !SYM_RE.test(o.sym) || !fin(o.price) || !(o.price > 0) || !fin(o.notional) || !(o.notional > 0) || !fin(o.id)) return;
      out.orders.push({ id: o.id, sym: o.sym, side: o.side === 'sell' ? 'sell' : 'buy', price: o.price, notional: o.notional, tp: level(o.tp), sl: level(o.sl), t: fin(o.t) ? o.t : 0, note: cleanNote(o.note), reduce: o.reduce === true, lev: levOf(o.lev),
        qAhead: fin(o.qAhead) && o.qAhead >= 0 ? o.qAhead : null, qDone: fin(o.qDone) && o.qDone >= 0 ? o.qDone : 0 });
    });
  }
  if (Array.isArray(t.history)) {
    t.history.slice(0, 3000).forEach(h => {
      if (!h || !SYM_RE.test(h.sym) || !fin(h.t) || !fin(h.qty) || !fin(h.price) || !fin(h.fee)) return;
      out.history.push({
        t: h.t, sym: h.sym, side: h.side === 'sell' ? 'sell' : 'buy', qty: h.qty, price: h.price, fee: h.fee,
        pnl: fin(h.pnl) ? h.pnl : null, reason: ['tp', 'sl', 'liq', 'limit', 'fund'].includes(h.reason) ? h.reason : 'manual', away: !!h.away, note: cleanNote(h.note),
        feeIn: fin(h.feeIn) && h.feeIn >= 0 ? h.feeIn : 0, pid: fin(h.pid) ? h.pid : null, lev: levOf(h.lev) > 1 ? levOf(h.lev) : undefined,
        fund: ['real', 'mix', 'est'].includes(h.fund) ? h.fund : undefined,
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
  if (!p || !(px > 0)) return 0;
  const u = p.qty * (px - p.avg);
  return p.lev > 1 ? Math.max(u, -p.margin) : u; // レバレッジのポジションは、証拠金より多くは失わない
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
    // レバレッジのポジションは、証拠金を取り置く。損失は証拠金の中で収まるので、二重には引かない。含み益は余力に数えない
    if (p.lev > 1) { margin += p.margin; return; }
    uSafe += priceOk(sym) ? ui : Math.min(ui, 0);
    margin += Math.abs(p.qty) * Math.max(p.avg, last);
  });
  const a = acct(q);
  return { cash: a.cash, equity: a.cash + u, avail: Math.max(0, a.cash + uSafe - margin), start: a.start };
}
function fmtMoney(v, q, signed) {
  if (!isFinite(v)) return '—';
  const dg = moneyDigits(q);
  const r = +v.toFixed(dg) || 0; // 先に丸めてから符号を決める(「-0.00」と出さない)
  const s = nf(dg).format(Math.abs(r));
  return (r < 0 ? '-' : signed ? '+' : '') + s;
}
// 決済通貨ごとの小数の桁数。暗号資産で数える口座(BTC 建てなど)は、1単位が大きいので細かくする
const CRYPTO_QUOTES = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'DOGE', 'TRX', 'DOT'];
function moneyDigits(q) { return q === 'JPY' ? 0 : CRYPTO_QUOTES.includes(q) ? 6 : 2; }
function floorMoney(v, q) { const k = Math.pow(10, moneyDigits(q)); return Math.floor(v * k + 1e-9) / k; }
const pct2 = v => { const s = v.toFixed(2); return s === '-0.00' ? '0.00' : s; };
const fmtQty = v => {
  const a = Math.abs(v);
  return a >= 1000 ? fmtCompact(a) : nfSig6.format(a);
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
  if (SYNTH[sym]) return; // 計算値の銘柄は、取引所の一覧にはない
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
    if (!priceOk(sym)) return STALE_MSG;
    // 閉じていた間の利確・損切りの確認が済むまでは、売買させない(先に買い増したり、条件を変えたりできないようにする)
    if (reconciled[sym] !== true || !clockReady) return '開いていなかった間・通信が途切れていた間の値動きを確認しています。数秒待ってから、もう一度お試しください。';
  }
  // 買いは売り注文の価格(ask)、売りは買い注文の価格(bid)で約定させる。
  // 板(上位5段)も取れていれば、注文の大きさの分だけ板を食っていった平均の価格にする(大きな注文ほど不利になる)。
  // 気配値が2秒より古いとき(配信が途切れた直後・つなぎ直した直後など)は、断る。
  // 以前は最後の約定の価格で約定させていたが、それは数秒前の価格のことがあり、実際の取引所より有利になりうる
  const quote = fixed ? null : liveQuote(sym, QUOTE_TRADE_MS);
  if (!fixed && !quote) return STALE_MSG;
  let px = fixed ? opts.price : side === 'buy' ? quote.ask : quote.bid;
  if (!(px > 0)) return '価格を取得できていません。';
  let bf = quote ? bookFill(sym, side, qty === undefined ? { notional } : { qty }) : null;
  if (bf) px = bf.px;
  if (qty === undefined) qty = notional / px; else notional = qty * px;
  // 数量を変えたら、板での平均の価格も見積もり直す
  const reprice = () => { if (bf) { bf = bookFill(sym, side, { qty }) || bf; px = bf.px; } notional = qty * px; fee = notional * FEE; };
  if (!(notional > 0) || !isFinite(notional)) return '金額を入力してください。';
  const q = quoteOf(sym), a = acct(q), dir = side === 'buy' ? 1 : -1;
  const now = tnow();
  // 資金調達料は、ポジションを変える前に、この約定の時刻までの分を精算する
  settleFunding(sym, fixed && opts.t ? opts.t : now, px, true);
  const pos = T.positions[sym];
  let fee = notional * FEE;
  T.quotes[sym] = q;
  let pnl = null, feeIn = 0, pid = null;
  // 決済のための注文なのに、決済する相手がもうない(別のタブで先に決済された、など)ときは、何もしない。
  // これがないと、決済のつもりの注文が、反対向きの新しいポジションを作ってしまう
  if (opts && opts.closeOnly && (!pos || Math.sign(pos.qty) === dir)) return 'このポジションは、すでに決済されています。';
  if (opts && opts.closeOnly && qty > Math.abs(pos.qty)) { qty = Math.abs(pos.qty); reprice(); }
  // 買い増し・売り増しは、保有中のポジションのレバレッジに合わせる
  const lev = pos ? (pos.lev || 1) : clamp(Math.round((opts && opts.lev) || 1), 1, MAX_LEV);
  if (pos && Math.sign(pos.qty) !== dir) {
    // 反対向き=保有分を減らす(決済)
    const held = Math.abs(pos.qty);
    // 保有分より多い注文は、保有分ちょうどの決済として扱う(反対向きへの乗りかえはしない)。
    // 同じ金額で売って買い戻すと、価格の差でわずかに数量が増え、以前は決済できなかった
    // 保有分の 98% 以上を決済する注文も、全部の決済として扱う(価格が動いた分の、ごく小さな端数を残さない)
    if (qty >= held * 0.98) { qty = held; reprice(); }
    pnl = qty * (px - pos.avg) * Math.sign(pos.qty);
    if (pos.lev > 1) {
      // 決済する割合の証拠金を戻す。損失は、その証拠金までで止まる(分離マージン)
      const mPart = (pos.margin || 0) * Math.min(1, qty / held);
      pnl = Math.max(pnl, -mPart);
      // 強制決済では、証拠金をすべて失う(取引所では、残った維持証拠金は保険基金に入り、戻ってこない)
      if (reason === 'liq') pnl = -mPart;
      pos.margin = Math.max(0, (pos.margin || 0) - mPart);
    }
    feeIn = (pos.feeOpen || 0) * (qty / held);
    pos.feeOpen = (pos.feeOpen || 0) - feeIn;
    pid = pos.id;
    a.cash += pnl - fee;
    pos.qty -= Math.sign(pos.qty) * qty;
    if (Math.abs(pos.qty) <= held * 1e-9) {
      delete T.positions[sym];
      // ポジションがなくなったら、その決済用に置いていた指値も取り消す(残しておくと、あとで反対向きの新しいポジションを作ってしまう)
      const n0 = T.orders.length;
      T.orders = T.orders.filter(o => !(o.sym === sym && o.reduce));
      if (T.orders.length < n0) toast(`${labelOf(sym)}:ポジションがなくなったため、決済用の指値注文を取り消しました。`);
    }
    else pos.levelsAt = now;
  } else {
    const st = acctStats(q);
    // 「100%」などで入れた金額は、押したあとに価格が少し動くだけで、使える金額をわずかに超える。
    // 超えた分が1%以内なら、断らずに、使える金額いっぱいまで減らして通す(金額で指定した成行注文だけ)
    // 必要なお金:1倍は取引額そのもの、レバレッジは証拠金(取引額 ÷ レバレッジ)。どちらも手数料を足す
    const need = () => (lev > 1 ? notional / lev : notional) + fee;
    if (!fixed && reason === 'manual' && need() > st.avail && need() <= st.avail * 1.01 && st.avail > 0) {
      notional = st.avail / ((lev > 1 ? 1 / lev : 1) + FEE) * (1 - 1e-9);
      if (bf) { bf = bookFill(sym, side, { notional }) || bf; px = bf.px; }
      qty = notional / px; fee = notional * FEE;
    }
    if (need() > st.avail + 1e-9) {
      return `使える金額が足りません(使える金額: ${fmtMoney(st.avail, q)} ${q}、${lev > 1 ? `証拠金と` : ''}手数料込みで ${fmtMoney(need(), q)} ${q} 必要)。`;
    }
    a.cash -= fee;
    if (pos) {
      pos.avg = (Math.abs(pos.qty) * pos.avg + qty * px) / (Math.abs(pos.qty) + qty);
      pos.qty += dir * qty;
      pos.feeOpen = (pos.feeOpen || 0) + fee;
      if (pos.lev > 1) pos.margin = (pos.margin || 0) + notional / pos.lev;
      pos.levelsAt = now;
    } else {
      T.positions[sym] = { qty: dir * qty, avg: px, tp: null, sl: null, opened: now, id: now, levelsAt: now, feeOpen: fee, lev, margin: lev > 1 ? notional / lev : 0, fundAt: fixed && opts.t ? opts.t : now };
    }
    pid = T.positions[sym].id;
  }
  T.history.unshift({
    t: fixed && opts.t ? opts.t : now, sym, side, qty, price: px, fee, pnl, reason: reason || 'manual',
    away: fixed && opts.away !== false, feeIn, pid, note: cleanNote(opts && opts.note), lev: lev > 1 ? lev : undefined,
  });
  T.history.length = Math.min(T.history.length, 3000);
  // 板の5段では足りなかったことを、注文した人に伝える
  lastFill = bf ? { over: bf.over, top: bf.top, px } : null;
  if (bf && bf.over) toast(`${labelOf(sym)}:板の上位5段では足りなかったため、足りない分は、見えている板と同じ厚さが先にも続くとして見積もりました(5段目から最大 0.1%)。平均 ${fmtPrice(px)}。`);
  saveTrade();
  return null;
}
let lastFill = null; // 直前の成行注文の、板での約定の様子
/* 注文の遅れ。実際の取引所では、押してから注文が届くまでに時間がかかり、その間に板が動く。
 * 成行の注文(手での決済も)は、押してから 0.2 秒たち、かつ押したあとの板・気配値が1回以上届いてから、
 * その時点の板・気配値で約定させる。1秒たっても新しい板・気配値が届かなければ、価格が古いとみなして取り消す。
 * 利確・損切り・指値・強制決済は、取引所の側で待っている注文なので、遅れは足さない */
const LATENCY_MS = 200, LATENCY_MAX = 1000;
const SENDING_MSG = '注文を送っています…';
const STALE_MSG = '価格を最新の状態にできていないため、いまは売買できません。数秒待ってから、もう一度お試しください。';
let sending = false; // 注文を送っている途中(その間は、売買・決済のボタンを押せない)
// その銘柄の板・気配値が最後に届いた時刻(経過時間)
function dataAt(sym) {
  let t = -Infinity;
  if (feed.book && feed.book.sym === sym) t = feed.book.at;
  if (feed.quoteSym === sym) t = Math.max(t, feed.quoteAt);
  return t;
}
// 注文が取引所に届くまで待つ。取り消すときは、その理由の文を返す。
// 押したあとの板・気配値が届くまで待つ(配信が止まっているときは、1秒で取り消す。古い価格では約定させない)
async function afterLatency(sym) {
  const t0 = mono();
  for (;;) {
    await new Promise(r => setTimeout(r, 20));
    const dt = mono() - t0;
    if (state.symbol !== sym) return '注文を送っている間に銘柄が切りかわったため、注文を取り消しました。';
    if (dt >= LATENCY_MS && dataAt(sym) > t0) return null;
    if (dt >= LATENCY_MAX) return STALE_MSG;
  }
}
function closePosition(sym, reason, opts) {
  syncIfStale(); // 別のタブでの変更を先に取り込んでから、いまのポジションを見る
  const p = T.positions[sym];
  if (!p) return 'ポジションがありません。';
  return execute(sym, p.qty > 0 ? 'sell' : 'buy', 0, reason, Math.abs(p.qty), Object.assign({}, opts, { closeOnly: true }));
}
/* ページを閉じていた間(スリープや通信断も含む)の値動きを取り寄せて、
 * その間に利確・損切りの価格に届いていたら、届いた時点の価格で決済する。
 * これをしないと、「損切りに届きそうなら閉じておき、戻ってから開く」ことで損切りを逃れられてしまう。
 * 調べる起点は、最後に価格を確かめた時刻と、利確・損切りや数量を最後に変えた時刻の、遅いほう。
 * (あとから条件を書き換えて、過去の値動きに当てはめることはできない) */
const reconciled = {}; // sym -> true: 確認済み / 'busy': 確認中 / なし: これから
const recRetryAt = {};
/* 開いたままでも、通信が途切れた・配信が止まった間の約定は、配信では届かない。
 * 最後に確かめた時刻(T.seen)から GAP_MS より長く間があいたら、その間の約定を取り寄せて、同じように調べる。
 * 以前は 90 秒より長い場合だけ調べていたので、短い通信断の間に指値や損切りの価格を通っても、見逃していた */
const GAP_MS = 3000;
const recEnd = {}; // sym -> 取り寄せて調べ終えた時刻(取引所の時刻)。これより前の約定は、配信で届いても二度は使わない
// その銘柄で、最後に確かめた時刻から今までの約定を、取り寄せて調べる必要があるか
function needsScan(sym) {
  if (!clockReady || !fin(T.seen[sym])) return false;
  const gap = tnow() - T.seen[sym];
  // 配信で約定が届いている銘柄は、配信が途切れずに届き始めた時刻より前に確かめたものだけ。
  // それより後の約定は、すべて配信で届いて、ためてある(調べるのに時間がかかっても、調べ直しをくり返さない)
  if (streamLive() && feed.covers.has(sym)) return T.seen[sym] < feed.upSince;
  return gap > GAP_MS;
}
// ある時間帯の約定を取り寄せて、その間の最初の価格・安値・高値を返す(1分足より細かい端数を調べるため)
async function tradeRange(sym, from, to) {
  if (SYNTH[sym]) return null; // 計算値の銘柄には約定の記録がないので、分の端数は調べない
  let lo = Infinity, hi = -Infinity, first = NaN, cur = from, upTo = to;
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
    if (rows.length < 1000) { upTo = to; break; }
    cur = +rows[rows.length - 1].T + 1;
    upTo = cur; // 30回で打ち切ったときは、ここまでしか調べていない
  }
  return isFinite(first) ? { lo, hi, first, upTo } : { lo: NaN, hi: NaN, first: NaN, upTo };
}
/* from から現在までの値動きを、もれなく順にたどる。
 * 分の途中から始まる端数は約定の記録で、そこから先は 1分足 → 5分足 → 1時間足 → 日足 と、
 * 区切りがそろうたびに粗い足へ上がり、現在が近づいたら細かい足へ下りる。
 * test(安値, 高値, 最初の価格, 終わりの時刻) が true を返したら、そこでやめる。 */
const LADDER = [['1d', 864e5], ['1h', 36e5], ['5m', 3e5], ['1m', 6e4]];
// end: どこまで調べるか。調べ終えた時刻を返す(途中でやめたときも、そこまで)
async function scanAway(sym, from, end, test) {
  let cur = from;
  if (cur % 6e4) {
    const to = Math.min(Math.ceil(cur / 6e4) * 6e4, end);
    const r = await tradeRange(sym, cur, to);
    if (r && isFinite(r.first) && test(r.lo, r.hi, r.first, r.upTo, cur)) return end;
    if (r && r.upTo < to) return r.upTo;
    cur = to;
  }
  for (let guard = 0; guard < 60; guard++) {
    if (end - cur < 6e4) break; // 残りの1分未満は、下で約定の記録から調べる
    const k = LADDER.findIndex(([, ms]) => cur % ms === 0 && cur + ms <= end);
    if (k < 0) break;
    const [api, ms] = LADDER[k];
    // ひとつ粗い足の区切りまで進む(いちばん粗い足なら、一度に最大1000本)
    const limit = k > 0 ? Math.min(1000, Math.round((Math.floor(cur / LADDER[k - 1][1] + 1) * LADDER[k - 1][1] - cur) / ms)) : 1000;
    const rows = await fetchKlines(sym, api, limit, 0, cur).catch(e => { if (e && e.message === 'empty') return []; throw e; });
    let moved = false;
    for (const b of rows) {
      if (b.t < cur) continue;
      if (b.t + ms > end) break; // まだ確定していない足
      if (test(b.l, b.h, b.o, b.t + ms, b.t)) return end;
      cur = b.t + ms; moved = true;
    }
    if (!moved) cur += ms; // その時間帯のデータがない(取引がなかった)ときは、先へ進む
  }
  if (end - cur >= 6e4) return cur; // 長すぎて一度に調べきれなかった。続きは次に調べる
  // 残りの1分未満(いまの直前まで)。約定の記録で調べる。計算値の銘柄は約定の記録がないので、いまの1分足の高値・安値で調べる
  if (cur < end) {
    let r;
    if (SYNTH[sym]) {
      const rows = await fetchKlines(sym, '1m', 2, 0, cur).catch(e => { if (e && e.message === 'empty') return []; throw e; });
      const b = rows.find(x => x.t === cur);
      r = b ? { lo: b.l, hi: b.h, first: b.o, upTo: end } : { first: NaN, upTo: end };
    } else r = await tradeRange(sym, cur, end);
    if (isFinite(r.first)) test(r.lo, r.hi, r.first, r.upTo, cur);
    return r.upTo;
  }
  return end;
}
async function reconcile(sym) {
  if (reconciled[sym]) return;
  const pos0 = T.positions[sym], orders0 = T.orders.filter(o => o.sym === sym);
  const guarded = p => !!p && (p.tp !== null || p.sl !== null || p.lev > 1); // 利確・損切り・強制決済のどれかがある
  const watching = guarded(pos0) || orders0.length > 0;
  if (!watching) { reconciled[sym] = true; if (clockReady) T.seen[sym] = tnow(); return; }
  if (mono() < (recRetryAt[sym] || 0)) return;
  reconciled[sym] = 'busy';
  try {
    if (!clockReady) await syncClock();
    if (!clockReady) throw new Error('clock');
    const seen0 = T.seen[sym] || 0;
    // それぞれ「いつから調べるか」が違う:ポジションは建てた時刻と条件を変えた時刻、指値は予約した時刻。どれも、最後に価格を確かめた時刻より前は調べない
    const posStart = p => Math.max(p.opened, p.levelsAt || 0, seen0), ordStart = o => Math.max(o.t || 0, seen0);
    const starts = orders0.map(ordStart).concat(guarded(pos0) ? [posStart(pos0)] : []);
    const from = Math.min(tnow(), ...starts);
    // いまの直前(1秒前)まで調べる。最後の1秒は、取引所の記録に載るのが遅れることがあるので、配信で届いた約定で調べる
    const end = tnow() - 1000;
    let upTo = Math.max(seen0, end);
    if (end > from) {
      // 待っている間に(別のタブなどで)内容が変わっていたら、いったんやめて最初からやり直す
      const sig = () => { const p = T.positions[sym]; return `${p ? `${p.id}:${p.levelsAt}:${p.qty}` : '-'}|${T.orders.filter(o => o.sym === sym).map(o => `${o.id}:${o.price}`).join(',')}`; };
      let expect = sig(), changed = false;
      // 資金調達料の実際の率を、先に取り寄せておく(調べている途中では待てないため。取れなければ目安の率)
      const pf = T.positions[sym];
      if (pf && pf.lev > 1 && perpOf(sym)) await loadFunding(sym, (fin(pf.fundAt) ? pf.fundAt : pf.opened) - FUND_MS);
      upTo = await scanAway(sym, from, end, (lo, hi, open, tEnd, tStart) => {
        if (sig() !== expect) { changed = true; return true; }
        const q = quoteOf(sym);
        // 0. 資金調達料:この時間帯が始まるまでに過ぎた区切りの分を、始値で精算する(区切りの時刻に近い価格を使うため)
        if (T.positions[sym] && tStart >= posStart(T.positions[sym])) settleFunding(sym, tStart, open, true);
        // 1. 利確・損切り
        const p = T.positions[sym];
        if (guarded(p) && tStart >= posStart(p)) {
          const long = p.qty > 0;
          let hit = null;
          const L = liqPrice(p), liqFirst = L !== null && (p.sl === null || (long ? L >= p.sl : L <= p.sl));
          // 同じ時間帯の中で両方に届いていたら、不利なほう(損切り)を先とみなす。最初の価格(始値)がすでに越えていたら、その価格で約定。
          // 利確は指値と同じで、利確の価格ちょうど(始値のほうが有利でも、それより良くはしない)
          if (liqFirst && (long ? lo <= L : hi >= L)) hit = ['liq', long ? Math.min(L, open) : Math.max(L, open)];
          else if (p.sl !== null && (long ? lo <= p.sl : hi >= p.sl)) hit = ['sl', long ? Math.min(p.sl, open) : Math.max(p.sl, open)];
          else if (p.tp !== null && (long ? hi >= p.tp : lo <= p.tp)) hit = ['tp', p.tp];
          if (hit && closePosition(sym, hit[0], { price: hit[1], t: tEnd }) === null) {
            toast(`${labelOf(sym)}:ページを開いていない間に${hit[0] === 'tp' ? '利確' : hit[0] === 'liq' ? '強制決済' : '損切り'}の価格に届いていたため、決済しました(${fmtPrice(T.history[0].price)}、損益 ${fmtMoney(netOf(T.history[0]), q, true)} ${q})`);
          }
        }
        // 2. 指値注文。この時間帯に指値を越えていたら(買いは安値が指値より下、売りは高値が指値より上)、指値ちょうどの価格で約定させる。
        //    足の安値・高値がちょうど指値なだけ(触れただけ)では約定させない。足からは、その価格でどれだけ取引されたか分からないため
        //    約定してできたポジションの利確・損切りは、同じ時間帯では判定しない(どちらが先か分からないため)。次の時間帯から調べる
        T.orders.filter(o => o.sym === sym && tStart >= ordStart(o)).forEach(o => {
          const buy = o.side === 'buy';
          if (!(buy ? lo < o.price : hi > o.price)) return;
          fillOrder(o, o.price, tEnd);
        });
        expect = sig();
        const left = T.positions[sym];
        return !guarded(left) && !T.orders.some(o => o.sym === sym); // もう調べるものがなければ終わり
      });
      if (changed) throw new Error('changed');
    }
    reconciled[sym] = true;
    // ここまで調べた。これより前の約定は、配信で届いていても、もう使わない(二度約定させない)
    T.seen[sym] = upTo; recEnd[sym] = upTo;
  } catch (e) {
    // 取り寄せに失敗したら「確認済み」にはしない。少し待ってやり直す
    delete reconciled[sym];
    recRetryAt[sym] = mono() + 10000;
  }
  saveTrade(); renderTrade(); draw();
}
/* 指値注文を1件、決まった価格で約定させる。
 * awayT を渡すと「ページを開いていなかった間の約定」として、その時刻で記録する */
function fillOrder(o, fill, awayT) {
  const sym = o.sym, buy = o.side === 'buy', away = awayT !== undefined;
  const had = T.positions[sym], opening = !had || Math.sign(had.qty) === (buy ? 1 : -1);
  // 保有分を減らす注文で、残りがごくわずか(2%未満)になるなら、端数を残さず全部決済する
  let qty;
  if (had && !opening) { const held = Math.abs(had.qty), want = o.notional / fill; qty = want >= held * 0.98 ? held : want; }
  const err = execute(sym, o.side, o.notional, 'limit', qty, Object.assign(away ? { price: fill, t: awayT, note: o.note } : { price: fill, away: false, note: o.note }, o.reduce ? { closeOnly: true } : {}, { lev: o.lev || 1 }));
  T.orders = T.orders.filter(x => x !== o);
  if (err) { toast(`${labelOf(sym)}:指値注文を取り消しました(${err})`); saveTrade(); return; }
  const pos = T.positions[sym];
  if (pos && opening) {
    // 利確・損切りは、約定した価格に対して向きが合っているものだけ付ける
    const done = T.history[0].price, dir = buy ? 1 : -1;
    if (o.tp !== null && (dir > 0 ? o.tp > done : o.tp < done)) pos.tp = o.tp;
    if (o.sl !== null && (dir > 0 ? o.sl < done : o.sl > done)) pos.sl = o.sl;
    pos.levelsAt = away ? awayT : tnow();
    if (away && !had) pos.opened = awayT; // 建てた時刻も、約定した時刻に合わせる(それより前の値動きを、利確・損切りの判定に使わない)
  }
  // 閉じていた間の約定でポジションが一部だけ減った場合も、「条件を変えた時刻」は約定した時刻にする。
  // いまの時刻にしてしまうと、残りの分の利確・損切りが、そのあとの値動きで判定されなくなる
  if (pos && away) pos.levelsAt = awayT;
  saveTrade();
  toast(`${labelOf(sym)}:${away ? 'ページを開いていない間に指値の価格に届いていたため、' : ''}指値注文が約定しました(${buy ? '買い' : '売り'} ${fmtQty(T.history[0].qty)} @ ${fmtPrice(T.history[0].price)})`);
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
/* いまの価格で、利確・損切り・強制決済に届いたか調べる。
 * lo / hi: 前回調べてからの安値・高値。一瞬だけ届いてすぐ戻った場合も見逃さない。
 * path: 前回からの約定の列(届いた順)。あれば、どれに先に届いたかを順番どおりに調べ、
 *       届いた瞬間の約定・気配値で決済する。ないとき(ほかの方法で取った価格)は、高値・安値で判定する。
 * 約定価格の決まり(実際の取引所より有利にしない):
 *   ・損切り・強制決済 … 届いた瞬間の「売れる価格」(買いの決済)/「買える価格」(売りの決済)。
 *     届いた約定の価格より有利にはしない。窓を開けて飛びこえたら、飛びこえた先の価格で決済する(損切りの価格より悪くなる)
 *     いま見ている銘柄で板が取れていれば、さらに、数量の分だけ板を食っていった平均の価格(どちらか不利なほう)
 *   ・利確 … 指値と同じで、利確の価格ちょうど(それより有利にはしない) */
function checkTriggers(sym, lo, hi, path) {
  syncIfStale();
  const p = T.positions[sym], px = T.last[sym];
  if (!p || !(px > 0)) return;
  const long = p.qty > 0;
  const L = liqPrice(p), liqFirst = L !== null && (p.sl === null || (long ? L >= p.sl : L <= p.sl));
  // その価格で、どれに届いたか。強制決済が損切りより手前にあれば先に届く。両方に届く価格なら、不利なほうを先とみなす
  const hitAt = (dn, up) => {
    if (liqFirst && (long ? dn <= L : up >= L)) return 'liq';
    if (p.sl !== null && (long ? dn <= p.sl : up >= p.sl)) return 'sl';
    if (p.tp !== null && (long ? up >= p.tp : dn <= p.tp)) return 'tp';
    return null;
  };
  // 損切り・強制決済で決済する価格:届いた瞬間の気配値(なければ約定の価格)。約定の価格より有利にはしない
  const exitPx = (trade, b, a) => {
    const q = long ? b : a;
    return q > 0 ? (long ? Math.min(q, trade) : Math.max(q, trade)) : trade;
  };
  const lq = liveQuote(sym);
  let reason = null, fill = 0;
  if (path && path.length) {
    // 約定を届いた順にたどる。最後に、いまの価格(足の終値)も1件として見る
    const pts = path.concat([{ p: px, b: lq ? lq.bid : NaN, a: lq ? lq.ask : NaN }]);
    for (const x of pts) {
      reason = hitAt(x.p, x.p);
      if (reason) { fill = reason === 'tp' ? p.tp : exitPx(x.p, x.b, x.a); break; }
    }
  } else {
    lo = Math.min(isFinite(lo) ? lo : px, px); hi = Math.max(isFinite(hi) ? hi : px, px);
    reason = hitAt(lo, hi);
    if (reason === 'tp') fill = p.tp;
    else if (reason) {
      // どの約定で届いたか分からないので、届いた価格と、いまの決済できる価格の、不利なほうにする
      const level = reason === 'liq' ? L : p.sl, nowPx = exitPx(px, lq ? lq.bid : NaN, lq ? lq.ask : NaN);
      fill = long ? Math.min(level, nowPx) : Math.max(level, nowPx);
    }
  }
  if (!reason || !(fill > 0)) return;
  // 損切り・強制決済は、取引所では成行の決済注文になる。いま見ている銘柄で板(上位5段)が取れていれば、
  // ポジションの数量の分だけ板を食っていった平均の価格にする(成行と同じ決まり。5段で足りない分は見積もる)。
  // それでも、届いた約定・気配値から決めた上の価格より有利にはしない
  let thin = null;
  if (reason !== 'tp' && sym === state.symbol) {
    const bf = bookFill(sym, long ? 'sell' : 'buy', { qty: Math.abs(p.qty) });
    if (bf) { fill = long ? Math.min(fill, bf.px) : Math.max(fill, bf.px); thin = bf; }
  }
  const q = quoteOf(sym);
  if (closePosition(sym, reason, { price: fill, away: false }) === null) {
    const h = T.history[0];
    if (thin && thin.over) toast(`${labelOf(sym)}:板の上位5段では足りなかったため、足りない分は、見えている板と同じ厚さが先にも続くとして見積もりました(5段目から最大 0.1%)。平均 ${fmtPrice(h.price)}。`);
    toast(reason === 'liq'
      ? `${labelOf(sym)}:強制決済の価格に届いたため、ポジションが強制的に決済されました(損益 ${fmtMoney(netOf(h), q, true)} ${q}。証拠金はすべて失います)`
      : `${labelOf(sym)}:${reason === 'tp' ? '利確' : '損切り'}の価格に届いたので決済しました(${fmtPrice(h.price)}、損益 ${fmtMoney(netOf(h), q, true)} ${q})`);
  }
}
/* 予約中の指値注文を調べる。約定の価格は、いつも指値ちょうど(それより有利にはしない)。
 * 取引所では、同じ価格に置かれた注文は、先に置かれた順に約定する(順番待ち)。価格に「触れた」だけでは、
 * 自分の番まで回ってこないことが多い。そこで、次のどちらかになったときだけ約定させる:
 *   (a) 指値を越えた取引があった(買いは指値より安い取引、売りは指値より高い取引)。
 *       越えて取引されたなら、その価格に並んでいた注文は、すべて約定したはずだから
 *   (b) 置いたあとに、指値ちょうどで取引された数量が、「置いたときに前に並んでいた数量 + 自分の数量」を超えた。
 *       前に並んでいた数量は、置いたときの板(上位5段)から取る。板に指値の価格がなかった・板がなかったときは
 *       分からないので、(a) だけで判定する(分からない分を、有利な側に見積もらないため)
 * path: 前回からの約定の列。あれば、注文を置いたあとの約定だけを見る。
 *       ないとき(列があふれた・配信が止まって取りにいった価格のとき)は、高値・安値で (a) だけを調べる */
function checkOrders(sym, lo, hi, path) {
  const px = T.last[sym];
  if (!(px > 0) || !T.orders.some(o => o.sym === sym)) return;
  lo = Math.min(isFinite(lo) ? lo : px, px); hi = Math.max(isFinite(hi) ? hi : px, px);
  let counted = false;
  T.orders.filter(o => o.sym === sym).forEach(o => {
    const buy = o.side === 'buy';
    let through;
    if (path) {
      const after = path.filter(x => !(x.t < o.t)); // 置く前の約定は数えない
      through = after.some(x => (buy ? x.p < o.price : x.p > o.price));
      // その価格ちょうどの取引の数量を、順番待ちの進み具合として足していく
      const atPx = after.reduce((s, x) => s + (x.p === o.price && x.q > 0 ? x.q : 0), 0);
      if (atPx > 0) { o.qDone = (o.qDone || 0) + atPx; counted = true; }
    } else through = buy ? lo < o.price : hi > o.price;
    const own = o.notional / o.price;
    const queued = o.qAhead !== null && o.qAhead !== undefined && (o.qDone || 0) > o.qAhead + own;
    if (through || queued) fillOrder(o, o.price);
  });
  // 順番待ちの進み具合の保存は、1秒に1回まで(約定のたびに書くと重い)
  if (counted && mono() - queueSavedAt > 1000) { queueSavedAt = mono(); saveTrade(); }
}
let queueSavedAt = -1e9;
// 売り(ショート)の含み損で評価額がゼロ以下になったら、その口座のポジションを強制的に決済する
function stopOut(q) {
  syncIfStale();
  if (acctStats(q).equity > 0) return;
  const list = Object.keys(T.positions).filter(s => quoteOf(s) === q && priceOk(s) && reconciled[s] === true);
  let closed = 0;
  list.forEach(s => { if (closePosition(s, 'liq') === null) closed++; });
  if (closed) toast(`${q} の口座の評価額がゼロ以下になったため、ポジションを強制的に決済しました。`);
}
let toastTimer = 0;
// お知らせ。続けて出たものは、前のものを消さずに並べる(3件まで)
let toastLines = [];
function toast(text) {
  const box = $('toast'), now = Date.now();
  toastLines = toastLines.filter(x => now - x.t < 6000 && x.text !== text).slice(-2);
  toastLines.push({ text, t: now });
  box.textContent = toastLines.map(x => x.text).join('\n'); box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; toastLines = []; }, 6000);
}
// 価格のお知らせの線に届いたかを調べる(いま表示している銘柄だけ)。一瞬だけ届いた場合も、高値・安値で拾う
function checkPriceAlerts(sym, lo, hi) {
  const list = state.drawings[sym];
  if (!list || !list.length || !isFinite(lo) || !isFinite(hi)) return;
  let fired = false;
  list.forEach(d => {
    if (d.type !== 'a' || d.done || d === state.dragging) return; // つかんで動かしている最中の線は鳴らさない
    if (!(d.above ? hi >= d.p1.price : lo <= d.p1.price)) return;
    d.done = true; fired = true;
    const text = `🔔 ${labelOf(sym)} が ${fmtPrice(d.p1.price)} に${d.above ? '上がって' : '下がって'}届きました`;
    toast(text);
    try { if (window.Notification && Notification.permission === 'granted' && document.hidden) new Notification('Gold Trade Chart', { body: text }); } catch (e) { /* 画面には出ている */ }
  });
  if (fired) { save(); draw(); }
}
// 価格が更新されるたびに呼ばれる
function tradeTick() {
  const n = state.bars.length;
  if (!state.live || !n) return;
  const sym = state.symbol;
  const allB = state.allBars && state.allBars.length ? state.allBars : state.bars;
  T.last[sym] = allB[allB.length - 1].c; // リプレイ中でも、売買に使うのは本物の最新の価格
  const watching = !!T.positions[sym] || T.orders.some(o => o.sym === sym);
  // 通信が途切れた・配信が止まった・長く閉じていた間の約定は、取り寄せて調べ直す(GAP_MS)
  if (reconciled[sym] === true && watching && needsScan(sym)) delete reconciled[sym];
  if (reconciled[sym] !== true) {
    // 先に、途切れていた間の値動きを確かめる。確かめている間に届いた約定は、捨てずにためておき、終わってから続きを調べる
    checkPriceAlerts(sym, Math.min(feed.lo, T.last[sym]), Math.max(feed.hi, T.last[sym]));
    if (!reconciled[sym] && !state.loading) reconcile(sym);
    renderTrade();
    return;
  }
  let lo = feed.lo, hi = feed.hi, path = feed.pathFull ? null : feed.path;
  feed.lo = Infinity; feed.hi = -Infinity; feed.path = []; feed.pathFull = false;
  checkPriceAlerts(sym, Math.min(lo, T.last[sym]), Math.max(hi, T.last[sym]));
  const done = recEnd[sym];
  if (done !== undefined) {
    // 取り寄せて調べ終えた時刻より前の約定は、もう調べてあるので使わない(同じ値動きで二度約定させない)。
    // 列があふれていたら、どれが後の約定か分からないので、いまの価格だけで調べる
    delete recEnd[sym];
    if (path) path = path.filter(x => !(x.t < done));
    lo = hi = NaN;
  }
  // 配信が止まって、取りにいった価格しかないときは、ここでは判定しない。間があいたら、上で約定を取り寄せて調べる
  // (取りにいった価格は数秒おきなので、その間に一瞬だけ届いた価格を見逃してしまう)
  const live = streamLive();
  if (live || !watching) {
    if (clockReady) { T.seen[sym] = tnow(); if (settleFunding(sym, tnow(), T.last[sym])) saveTrade(); }
    checkTriggers(sym, lo, hi, path);
    // 指値:配信が届いている間は、約定の列だけで判定する(足の終値は、置く前の約定のこともあるため)
    if (clockReady && priceOk(sym)) checkOrders(sym, lo, hi, path && (path.length || live) ? path : null);
  }
  stopOut(quoteOf(sym));
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
      // 前回から今までの約定を取り寄せて、もれなく調べる(5秒おきの価格だけでは、その間に一瞬届いた価格を見逃すため)。
      // 配信で約定が届いている銘柄は、配信のほうで調べる
      if (reconciled[sym] === true && needsScan(sym)) delete reconciled[sym];
      await reconcile(sym);
      if (reconciled[sym] === true) stopOut(quoteOf(sym));
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
let lastHistKey = '';
let curLev = () => 1; // 注文の画面ができたら、選んでいるレバレッジを返すものに置きかわる
const histKeyPeek = (hf, sym) => `${T.rev}|${T.history.length}|${T.history.length ? T.history[0].t : 0}|${hf}|${hf === 'sym' ? sym : ''}`;
function renderTrade() {
  const sym = state.symbol, q = quoteOf(sym), st = acctStats(q);
  const px = state.live ? T.last[sym] : NaN, pos = T.positions[sym];
  document.querySelectorAll('.trQuote').forEach(n => { if (n.textContent !== q) n.textContent = q; });
  setTxt('trSym', curSymbol().label);
  setTxt('trPrice', fmtPrice(px));
  // ポジションを持っているときは、どちらのボタンが「決済」になるかをボタンに書く
  setTxt('trSellSub', pos ? (pos.qty > 0 ? '買いを決済する' : '売りを増やす') : '下がると利益');
  setTxt('trBuySub', pos ? (pos.qty < 0 ? '売りを決済する' : '買いを増やす') : '上がると利益');
  // 気配値(買える価格・売れる価格)が届いていないとき(つなぎ直した直後・配信が止まったとき)も、売買できない
  const quoteOk = !!liveQuote(sym);
  const tradable = px > 0 && priceOk(sym) && reconciled[sym] === true && clockReady && quoteOk && !state.replay;
  $('trBuy').disabled = $('trSell').disabled = !tradable || sending;
  renderQuick();
  const levSel = $('trLev');
  if (pos) { levSel.value = String(pos.lev || 1); levSel.disabled = true; setTxt('trLevHint', '保有中のポジションに合わせます'); }
  else { levSel.disabled = false; setTxt('trLevHint', '1倍 = レバレッジなし。高いほど危険'); }
  // 閉じていた間の値動きの確認が終わらず売買できないときは、その理由を出す(何も出ないと故障に見える)
  const WAIT = '開いていなかった間・通信が途切れていた間の値動きを確認しています。終わるまで売買できません(通信が不安定だと、時間がかかります)。';
  const WAIT_PRICE = '最新の価格を確認しています。数秒で売買できるようになります。';
  const REPLAY_MSG = 'リプレイ中は売買できません。リプレイを終わると、売買できるようになります。';
  if (state.replay && !$('trMsg').textContent) setTxt('trMsg', REPLAY_MSG, 'msg');
  else if (!state.replay && $('trMsg').textContent === REPLAY_MSG) setTxt('trMsg', '');
  const checking = reconciled[sym] !== true || !clockReady;
  const waiting = px > 0 && !tradable && !state.replay && (checking || !quoteOk);
  // 調べるもの(ポジション・指値)がないときは、「価格を確かめている」とだけ出す(閉じていた間の確認と言うと、誤解させる)
  const msgNow = checking && (pos || T.orders.some(o => o.sym === sym)) ? WAIT : WAIT_PRICE;
  const cur = $('trMsg').textContent;
  if (waiting && (!cur || cur === WAIT || cur === WAIT_PRICE)) setTxt('trMsg', msgNow, 'msg');
  else if (!waiting && (cur === WAIT || cur === WAIT_PRICE)) setTxt('trMsg', '');
  // 取引所から消えた銘柄は価格が取れないので、建値での清算だけできるようにする
  const gone = !!dead[sym] && !!pos;
  $('pClose').disabled = (!tradable && !gone) || sending;
  setTxt('pClose', gone ? '最後の価格で清算する' : '決済する');
  $('pSave').disabled = !tradable;
  if (gone) setTxt('pMsg', 'この銘柄は取引所で取引できなくなっています。最後に取得できた価格で清算できます。', 'msg');
  if (!(px > 0)) setTxt('trMsg', state.loading ? '' : '実際の価格を取得できていないため、いまは注文できません。');
  else if ($('trMsg').textContent.startsWith('実際の価格')) setTxt('trMsg', '');

  $('trOrders').hidden = !T.orders.length;
  setHtml($('trOrderList'), T.orders.map(o => {
    const oq = quoteOf(o.sym), extra = [o.tp !== null ? `利確 ${fmtPrice(o.tp)}` : '', o.sl !== null ? `損切り ${fmtPrice(o.sl)}` : '', o.note].filter(Boolean).join(' ・ ');
    // 順番待ちの様子。前に並んでいた数量が分からない注文は、指値を越えた取引が出るまで約定しない
    const own = o.notional / o.price, line = o.qAhead === null || o.qAhead === undefined ? '指値を越えたら約定'
      : `順番待ち ${fmtQty(Math.min(o.qDone || 0, o.qAhead + own))} / ${fmtQty(o.qAhead + own)}`;
    return `<div class="ord"><span><span class="${o.side === 'buy' ? 'up' : 'down'}">${o.side === 'buy' ? '買い' : '売り'}</span> ${esc(labelOf(o.sym))} @ ${fmtPrice(o.price)}</span>` +
      `<button type="button" class="ctl btn small" data-oid="${esc(o.id)}">取消</button>` +
      `<span class="dim">${fmtMoney(o.notional, oq)} ${esc(oq)} 分${o.reduce ? ' ・ 決済用' : ''} ・ ${line}${extra ? ' ・ ' + esc(extra) : ''}</span></div>`;
  }).join(''));
  $('trPos').hidden = !pos;
  if (pos) {
    const u = unrealized(sym), base = Math.abs(pos.qty) * pos.avg;
    setTxt('pSide', pos.qty > 0 ? '買い(ロング)' : '売り(ショート)', pos.qty > 0 ? 'up' : 'down');
    setTxt('pQty', `${fmtQty(pos.qty)}(${fmtMoney(Math.abs(pos.qty) * (px > 0 ? px : pos.avg), q)} ${q} 分)`);
    setTxt('pAvg', fmtPrice(pos.avg));
    const L = liqPrice(pos);
    setTxt('pLev', pos.lev > 1 ? `×${pos.lev}(証拠金 ${fmtMoney(pos.margin, q)} ${q})` : '×1(レバレッジなし)', pos.lev > 1 ? 'down' : '');
    if (pos.lev > 1) { loadNextFunding(sym); setTxt('pFund', fundNowText(sym)); } else setTxt('pFund', 'かかりません(1倍)');
    setTxt('pLiq', L !== null ? `${fmtPrice(L)}(いまから ${px > 0 ? ((pos.qty > 0 ? px - L : L - px) / px * 100).toFixed(2) : '—'}%)` : 'なし');
    setTxt('pPnl', `${fmtMoney(u, q, true)} ${q}(${pct2(base ? u / base * 100 : 0)}%)`, pnlClass(u));
    // いま全部を決済した場合の損益:決済できる価格(買いは売れる価格、売りは買える価格)で、決済の手数料と、建てたときの手数料も引く
    {
      const lq = liveQuote(sym), xp = lq ? (pos.qty > 0 ? lq.bid : lq.ask) : px;
      let net = NaN;
      if (xp > 0) {
        const g = pos.qty * (xp - pos.avg);
        net = (pos.lev > 1 ? Math.max(g, -pos.margin) : g) - Math.abs(pos.qty) * xp * FEE - (pos.feeOpen || 0);
      }
      setTxt('pNet', isFinite(net) ? `${fmtMoney(net, q, true)} ${q}` : '—', pnlClass(net));
    }
    // 利確・損切りに届いたときの損益の目安(手数料も引いた額)。入力中の値で計算する
    const est = (id, out) => {
      const v = parseFloat($(id).value);
      if (!(v > 0)) { setTxt(out, ''); return; }
      const r = pos.qty * (v - pos.avg) - Math.abs(pos.qty) * v * FEE - (pos.feeOpen || 0);
      setTxt(out, `届くと ${fmtMoney(r, q, true)} ${q}`, 'tr-est ' + pnlClass(r));
    };
    est('pTp', 'pTpEst'); est('pSl', 'pSlEst');
    drawPosSpark(pos, q);
    $('pHalf').disabled = $('pClose').disabled || gone;
    $('pBe').disabled = !tradable;
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

  const hf = $('trHistFilter').value;
  const hist = histKeyPeek(hf, sym) === lastHistKey ? [] : T.history.filter(h => hf === 'sym' ? h.sym === sym : hf === 'win' ? h.pnl !== null && h.reason !== 'fund' && netOf(h) > 0 : hf === 'loss' ? h.pnl !== null && h.reason !== 'fund' && netOf(h) <= 0 : hf === 'auto' ? ['tp', 'sl', 'liq', 'limit'].includes(h.reason) : true);
  // 履歴の一覧は、中身が変わったときだけ作り直す(価格が動くたびに40行を作り直すと重い)
  const histKey = `${T.rev}|${T.history.length}|${T.history.length ? T.history[0].t : 0}|${hf}|${hf === 'sym' ? sym : ''}`;
  if (histKey !== lastHistKey) {
  lastHistKey = histKey;
  setTxt('trHistCount', T.history.length ? `${hist.length} 件${hist.length > 40 ? '(新しい40件を表示)' : ''}` : '');
  setHtml($('trHist'), hist.length ? hist.slice(0, 40).map(h => {
    const hq = quoteOf(h.sym), d = new Date(h.t);
    const when = `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    const why = h.reason === 'tp' ? '・利確' : h.reason === 'sl' ? '・損切り' : h.reason === 'liq' ? '・強制決済' : h.reason === 'limit' ? '・指値' : h.reason === 'fund' ? '・資金調達料' : '';
    const net = h.pnl === null ? null : netOf(h);
    return `<div class="h-row"><span><span class="${h.side === 'buy' ? 'up' : 'down'}">${h.side === 'buy' ? '買い' : '売り'}${h.lev > 1 ? ` ×${h.lev}` : ''}</span> ${esc(labelOf(h.sym))}${why}${h.away ? '・不在中' : ''}</span>` +
      `<span class="h-pnl ${net === null ? 'dim' : pnlClass(net)}">${net === null ? '新規' : fmtMoney(net, hq, true) + ' ' + esc(hq)}</span>` +
      `<span class="dim">${h.reason === 'fund' ? fundLabel(h) + '・' : ''}${fmtQty(h.qty)} @ ${fmtPrice(h.price)}</span><span class="dim h-pnl">${when}</span>` +
      `${h.note ? `<span class="h-note">メモ:${esc(h.note)}</span>` : ''}</div>`;
  }).join('') : `<span class="dim">${T.history.length ? 'この条件に合う取引はありません。' : 'まだ取引がありません。'}</span>`);
  }

  const u = pos ? unrealized(sym) : 0;
  $('tbClose').hidden = !pos; $('tbClose').disabled = !tradable || sending;
  setTxt('tbText', pos
    ? `${pos.qty > 0 ? '買い' : '売り'}${pos.lev > 1 ? ` ×${pos.lev}` : ''}を保有中 損益 ${fmtMoney(u, q, true)} ${q}`
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
// いまの価格より有利な側に置けば利確、不利な側に置けば損切り(利益が出ているときは、建値より上の損切りも置ける)
function entryDragKind(pos, price) {
  const px = T.last[state.symbol] > 0 ? T.last[state.symbol] : pos.avg;
  const profitSide = pos.qty > 0 ? price > px : price < px;
  return profitSide ? 'tp' : 'sl';
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
    // 指値を動かすのは、取引所では「取り消して置き直す」こと。順番待ちは、新しい価格の列の最後からやり直す
    if (price !== o.price) { o.price = price; o.t = tnow(); o.qAhead = queueAhead(sym, o.side, price); o.qDone = 0; }
  } else {
    const pos = T.positions[sym];
    if (!pos) return;
    const kind = dl.kind === 'entry' ? entryDragKind(pos, price) : dl.kind;
    if (dl.kind === 'entry' && pos[kind] !== null) {
      toast(`${kind === 'tp' ? '利確' : '損切り'}の線は、すでにあります。動かすときは、その線をつかんでください。`);
      return;
    }
    const tp = kind === 'tp' ? price : pos.tp, sl = kind === 'sl' ? price : pos.sl;
    let err = checkLevels(Math.sign(pos.qty), T.last[sym], tp, sl);
    if (!err && pos.lev > 1 && sl !== null) {
      const L = liqPrice(pos);
      if (L !== null && (pos.qty > 0 ? sl <= L : sl >= L)) err = `損切りの価格が、強制決済の価格(${fmtPrice(L)})より遠いため、先に強制決済されます。損切りを ${fmtPrice(L)} より${pos.qty > 0 ? '上' : '下'}にしてください。`;
    }
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
    if (h.sym !== sym || h.reason === 'fund') return; // 資金調達料は売買ではないので、印を付けない
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
      const LQ = liqPrice(pos);
      if (LQ !== null) line(LQ, '#e67e22', [2, 3], `強制決済 ×${pos.lev}`);
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
  // 選んでいるレバレッジ。同じ銘柄のポジションを持っているときは、そのポジションのものに合わせる
  curLev = () => { const p = T.positions[state.symbol]; return p ? (p.lev || 1) : clamp(parseInt($('trLev').value, 10) || 1, 1, MAX_LEV); };
  let levWarned = false;
  $('trLev').addEventListener('change', () => {
    if (curLev() > 1 && !levWarned) {
      levWarned = true;
      toast('レバレッジをかけると、小さな値動きで大きく損をします。証拠金がなくなる手前で強制的に決済され、その証拠金はすべて失います(デモなので、実際のお金は動きません)。');
    }
    renderUnit(); renderRisk(); renderTrade(); renderFundNote();
  });
  amt.value = acct(quoteOf(state.symbol)).start / 10;
  // レバレッジを選んでいるときは、この銘柄の資金調達料の率(年率)を出す。実際の率が取れたときだけ
  const renderFundNote = () => {
    const sym = state.symbol, box = $('trFundNote'), on = curLev() > 1 && !!perpOf(sym);
    if (on) loadNextFunding(sym);
    const f = fundReal[sym], text = on && f && f.next ? `この銘柄の資金調達料:次回 ${pctRate(f.next.rate)}(+は買いが払う)${fundYearText(f.next.rate)}` : '';
    setTxt('trFundNote', text);
    if (box.hidden === !!text) box.hidden = !text;
  };
  setInterval(() => { if (!document.hidden && state.tradeOpen !== false) renderFundNote(); }, 2000);
  /* 注文の大きさは「金額」でも「数量」でも入れられる。中では、いつも金額に直して扱う。
   * 数量から金額への換算には、実際に約定する側の価格(買いは買える価格、売りは売れる価格)を使う */
  let unit = 'amount';
  const baseOf = sym => { const q = quoteOf(sym); return sym.endsWith(q) ? sym.slice(0, -q.length) : sym; };
  const refPrice = (dir, market) => {
    if (orderType === 'limit' && !market) return parseFloat($('trLimit').value) || 0;
    const lq = liveQuote(state.symbol), px = T.last[state.symbol] || 0;
    return lq ? (dir > 0 ? lq.ask : dir < 0 ? lq.bid : (lq.ask + lq.bid) / 2) : px;
  };
  const notionalOf = (dir, market) => { const v = parseFloat(amt.value) || 0; return unit === 'qty' ? v * refPrice(dir || 0, market) : v; };
  const setNotional = n => {
    const q = quoteOf(state.symbol), px = refPrice(0);
    if (unit !== 'qty') amt.value = n > 0 ? floorMoney(n, q) : '';
    else if (n > 0 && px > 0) {
      // 6桁に切り捨てる(四捨五入で増えると、「100%」が使える金額をわずかに超えてしまう)
      const qv = n / px, k = Math.pow(10, 5 - Math.floor(Math.log10(qv)));
      amt.value = +(Math.floor(qv * k + 1e-9) / k).toPrecision(6);
    } else amt.value = '';
    renderUnit();
  };
  function renderUnit() {
    const sym = state.symbol, q = quoteOf(sym), cur = $('trAmtCur'), v = parseFloat(amt.value) || 0, px = refPrice(0);
    setTxt('trUnitName', unit === 'qty' ? '数量' : '金額');
    setTxt('trAmtCur', unit === 'qty' ? baseOf(sym) : q);
    cur.classList.toggle('trQuote', unit !== 'qty'); // 金額のときは、決済通貨の表示をほかと同じように自動で保つ
    setTxt('trAmtHint', unit === 'qty' ? 'いくつ売買するか' : 'いくら分を売買するか');
    setTxt('trUnit', unit === 'qty' ? '金額で入力' : '数量で入力');
    const lv = curLev(), nOf = unit === 'qty' ? v * px : v;
    const levTxt = lv > 1 && nOf > 0 && px > 0 ? ` ・ 証拠金 ${fmtMoney(nOf / lv, q)} ${q} ・ 強制決済の目安 買い ${fmtPrice(liqAt(1, px, lv))} / 売り ${fmtPrice(liqAt(-1, px, lv))}` : '';
    setTxt('trAmtEst', v > 0 && px > 0 ? (unit === 'qty' ? `≈ ${fmtMoney(v * px, q)} ${q}` : `≈ ${fmtQty(v / px)} ${baseOf(sym)}`) + levTxt : '');
    renderFill(v);
  }
  /* 成行で注文した場合の、平均の約定価格の見積もり。入力するたびに、いまの板(上位5段)で計算し直す。
   * 大きな注文ほど、板の奥の不利な価格まで食うので、平均の価格は悪くなる */
  function renderFill(v) {
    const sym = state.symbol;
    if (orderType !== 'market' || !(v > 0) || !liveQuote(sym)) { setTxt('trFillEst', ''); return; }
    const want = unit === 'qty' ? { qty: v } : { notional: v };
    const b = bookFill(sym, 'buy', want), s = bookFill(sym, 'sell', want);
    if (!b || !s) {
      setTxt('trFillEst', 'この銘柄は板の情報がないため、成行は「買える価格」「売れる価格」のまま約定します(注文が大きくても価格は不利になりません。実際より有利な計算です)。');
      return;
    }
    const worse = (x, side) => `${((side === 'buy' ? x.px / x.top - 1 : 1 - x.px / x.top) * 100).toFixed(3)}%`;
    setTxt('trFillEst', `成行の見込み:買い 平均 ${fmtPrice(b.px)}(最良より ${worse(b, 'buy')} 不利)/売り 平均 ${fmtPrice(s.px)}(${worse(s, 'sell')} 不利)` +
      (b.over || s.over ? '。板の上位5段では足りないため、足りない分は、見えている板と同じ厚さが先にも続くとして見積もっています(5段目から最大 0.1%)' : ''));
  }
  $('trUnit').addEventListener('click', () => {
    const n = notionalOf(0);
    unit = unit === 'qty' ? 'amount' : 'qty';
    setNotional(n); renderRisk();
  });
  amt.addEventListener('input', renderUnit);
  setInterval(() => { if (!document.hidden && state.tradeOpen !== false) renderUnit(); }, 1000);
  document.querySelector('.tr-quick').addEventListener('click', e => {
    const pct = parseFloat(e.target.dataset.pct);
    if (!pct) return;
    const sym = state.symbol, q = quoteOf(sym), lv = curLev(), v = acctStats(q).avail * pct / ((lv > 1 ? 1 / lv : 1) + FEE);
    const pos = T.positions[sym], px = T.last[sym];
    if (pos && px > 0 && floorMoney(v, q) <= 0) {
      // 使える金額が残っていないとき(全額で持っているとき)は、保有分の何%かを入れる。決済に使える
      setNotional(floorMoney(Math.abs(pos.qty) * px * pct, q));
      setTxt('trMsg', `使える金額が残っていないため、保有分の ${Math.round(pct * 100)}% の金額を入れました。「${pos.qty > 0 ? '売り' : '買い'}」を押すと、その分を決済します。`, 'msg');
    } else setNotional(floorMoney(v, q));
    renderRisk();
  });
  /* 値動きの大きさに合わせた金額(ボラティリティ目標)。金額 = 評価額 × min(1, 目標の値動き ÷ この銘柄の値動き)。
   * この銘柄の値動きは、いまのチャートの足 20 本の変化率の標準偏差を年率にしたもの。いま動いている足は使わない(前の足まで)。
   * 値動きの大きい銘柄ほど、金額が小さくなる。研究(Moreira・Muir 2017、Harvey ら 2018)では、値動きの荒さを平らにする効果は
   * はっきりしているが、利益が増えるかどうかは結果が分かれている */
  $('trVt').addEventListener('click', e => {
    const tg = parseFloat(e.target.dataset.vt);
    if (!tg) return;
    const sym = state.symbol, q = quoteOf(sym), bars = state.allBars && state.allBars.length ? state.allBars : state.bars, iv = curInterval();
    const vol = bars.length > 22 ? GT.stats.realizedVol(bars, 20, 'sd')[bars.length - 1] : NaN;
    if (!(vol > 0) || !state.live) { setTxt('trVtText', '値動きの大きさを計算できません(足が足りないか、価格を取得できていません)。', 'dim'); return; }
    const st = acctStats(q), lv = curLev(), w = Math.min(1, tg / vol);
    const v = Math.min(st.equity * w, st.avail / ((lv > 1 ? 1 / lv : 1) + FEE));
    setNotional(floorMoney(v, q)); renderRisk();
    setTxt('trVtText', `この銘柄の値動きは年率 約 ${(vol * 100).toFixed(0)}%(${iv.label}足 20 本・前の足まで。1年 = ${Math.round(GT.stats.barsPerYear(iv.ms)).toLocaleString()} 本で年率に)。` +
      `目標 ${(tg * 100).toFixed(0)}% ÷ ${(vol * 100).toFixed(0)}% = ${w.toFixed(2)} → 評価額の ${(w * 100).toFixed(0)}%${v < st.equity * w - 1e-9 ? '(使える金額までにしました)' : ''}を入れました。短い足ほど、値動きは大きめ・小さめにぶれます。`, 'dim');
  });
  ['change', 'symbolpicked'].forEach(ev => $('symbol').addEventListener(ev, () => setTxt('trVtText', '', 'dim')));
  // 注文の種類(成行 / 指値)
  let orderType = 'market';
  $('trType').addEventListener('click', e => {
    const b = e.target.closest('button[data-type]');
    if (!b) return;
    orderType = b.dataset.type;
    [...$('trType').children].forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
    $('trLimitRow').hidden = orderType !== 'limit';
    if (orderType === 'limit' && !$('trLimit').value && T.last[state.symbol] > 0) $('trLimit').value = T.last[state.symbol];
    renderUnit(); renderRisk();
  });
  /* 損切りを入れたら、「損切りになったときにいくら失うか」を見せる。
   * 資金の何%を失う設定にするかを選ぶと、そこから買う金額を逆算する(教科書 第6章の計算)。 */
  const entryPrice = () => (orderType === 'limit' ? parseFloat($('trLimit').value) : T.last[state.symbol]);
  const stopPct = () => {
    const e = entryPrice(), sl = parseFloat($('trSl').value);
    return e > 0 && sl > 0 && sl !== e ? Math.abs(e - sl) / e : NaN;
  };
  function renderRisk() {
    const pct = stopPct(), box = $('trRisk');
    box.hidden = !isFinite(pct);
    if (!isFinite(pct)) return;
    const q = quoteOf(state.symbol), st = acctStats(q), n = notionalOf(0);
    const loss = n * (pct + 2 * FEE); // 値幅の損に、往復の手数料を足したもの
    setTxt('trRiskText', `損切りまで ${(pct * 100).toFixed(2)}%。この金額だと、損切りで約 ${fmtMoney(loss, q)} ${q}(資金の ${(st.equity > 0 ? loss / st.equity * 100 : 0).toFixed(2)}%)を失います。`);
  }
  ['trSl', 'trAmt', 'trLimit'].forEach(id => $(id).addEventListener('input', renderRisk));
  $('trRisk').addEventListener('click', e => {
    const r = parseFloat(e.target.dataset.risk), pct = stopPct();
    if (!r || !isFinite(pct)) return;
    const q = quoteOf(state.symbol), st = acctStats(q);
    const lv = curLev(), v = Math.min(st.equity * r / (pct + 2 * FEE), st.avail / ((lv > 1 ? 1 / lv : 1) + FEE));
    setNotional(floorMoney(v, q));
    renderRisk();
  });
  /* quick = チャート上の売買ボタンから。注文画面で「指値」を選んでいても、いつも成行で出す。
   * 注文画面が閉じていると結果の文が見えないので、同じ文をお知らせ(画面の上)にも出す。それ以外は、注文画面のボタンとまったく同じ */
  const order = (side, quick) => {
    const sym = state.symbol, px = T.last[sym], dir = side === 'buy' ? 1 : -1, q = quoteOf(sym);
    const tp = numOrNull('trTp'), sl = numOrNull('trSl'), note = cleanNote($('trNote').value);
    const notional = notionalOf(dir, quick);
    const say = (text, cls) => { setTxt('trMsg', text, cls); if (quick) toast(text); };
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
      else if (opening && notional * ((curLev() > 1 ? 1 / curLev() : 1) + FEE) > acctStats(q).avail + 1e-9) err = `使える金額が足りません(使える金額: ${fmtMoney(acctStats(q).avail, q)} ${q})。金額を減らしてください。`;
      else if (opening) err = checkLevels(dir, lp, tp, sl);
      if (err) { setTxt('trMsg', err, 'msg down'); return; }
      // ポジションを減らすために置いた指値は「決済用」として覚えておく(ポジションがなくなったら、いっしょに取り消す)
      // qAhead: 置いたときに、同じ価格で前に並んでいた数量(板の上位5段に、その価格があったときだけ。なければ null = 分からない)
      T.orders.push({ id: tnow() + Math.random(), sym, side, price: lp, notional, tp: opening ? tp : null, sl: opening ? sl : null, t: tnow(), note, reduce: !opening, lev: opening ? curLev() : 1, qAhead: queueAhead(sym, side, lp), qDone: 0 });
      saveTrade();
      setTxt('trMsg', `${side === 'buy' ? '買い' : '売り'}の指値注文を予約しました(${fmtPrice(lp)} で ${fmtMoney(notional, q)} ${q} 分)。`, 'msg');
      done();
      return;
    }
    // 成行:取引所に注文が届くまでの遅れ(約 0.2 秒)を待ち、そのときの板・気配値で約定させる。
    // 待っている間は、もう一度押しても注文しない(二重の注文を防ぐ)
    if (sending) return;
    const levNow = curLev();
    // 利確・損切りが、約定する価格に対して向きが合っているか。押したときと、約定させる直前の2回調べる
    const levelErr = () => {
      const px = T.last[sym], had = T.positions[sym], opening = !had || Math.sign(had.qty) === dir;
      // 利確・損切りは、実際に約定する価格(買いは「買える価格」、売りは「売れる価格」)とも比べる。
      // そうしないと、買った価格より安い「利確」が通り、すぐ損で決済されてしまう
      // 板を食う大きな注文は、平均の約定価格が買える価格・売れる価格より不利になるので、その見込みとも比べる
      const lq = liveQuote(sym), est = lq ? bookFill(sym, side, { notional }) : null;
      const hiRef = Math.max(px, lq ? lq.ask : px, est && dir > 0 ? est.px : -Infinity), loRef = Math.min(px, lq ? lq.bid : px, est && dir < 0 ? est.px : Infinity);
      let err = opening && px > 0 ? (checkLevels(dir, dir > 0 ? hiRef : loRef, tp, null) || checkLevels(dir, dir > 0 ? loRef : hiRef, null, sl)) : null;
      // レバレッジで新しく建てるとき、損切りが強制決済より遠ければ断る
      if (!err && opening && !had && levNow > 1 && sl !== null) {
        const L = liqAt(dir, dir > 0 ? hiRef : loRef, levNow);
        if (L !== null && (dir > 0 ? sl <= L : sl >= L)) err = `損切りの価格が、強制決済の価格の目安(${fmtPrice(L)})より遠いため、先に強制決済されます。損切りを ${fmtPrice(L)} より${dir > 0 ? '上' : '下'}にするか、レバレッジを下げてください。`;
      }
      return err;
    };
    const early = levelErr();
    if (early) { say(early, 'msg down'); return; }
    sending = true; setTxt('trMsg', SENDING_MSG, 'msg'); renderTrade();
    const fire = late => {
      // 待っている間に価格やポジションが変わっていることがあるので、ここで読み直す
      const had = T.positions[sym], opening = !had || Math.sign(had.qty) === dir;
      const hadDir = had ? Math.sign(had.qty) : 0; // 決済すると had の数量が変わるので、向きを先に覚えておく
      let err = late || levelErr();
      if (!err) err = execute(sym, side, notional, 'manual', undefined, { note, lev: levNow });
      if (err) { say(err, 'msg down'); renderTrade(); return; }
      const pos = T.positions[sym], h = T.history[0];
      // 利確・損切りは、実際に約定した価格に対して向きが合っているものだけ付ける(見込みより不利に約定した場合に備える)
      let dropped = '';
      if (pos && opening) {
        if (tp !== null) { if (checkLevels(dir, h.price, tp, null) === null) pos.tp = tp; else dropped += '利確'; }
        if (sl !== null) { if (checkLevels(dir, h.price, null, sl) === null) pos.sl = sl; else dropped += (dropped ? '・' : '') + '損切り'; }
        pos.levelsAt = tnow();
        saveTrade();
      }
      const closedAll = !opening && !T.positions[sym], capped = closedAll && notional > h.qty * h.price * 1.02;
      say((closedAll ? `${hadDir > 0 ? '買い' : '売り'}のポジションをすべて決済しました` : `${side === 'buy' ? '買い' : '売り'}ました`) + `:${fmtQty(h.qty)} @ ${fmtPrice(h.price)}` +
        (h.pnl === null ? '' : `(損益 ${fmtMoney(netOf(h), q, true)} ${q})`) +
        (capped ? '。保有分を超える金額は注文していません。反対向きに持つには、もう一度注文してください。' : '') +
        (lastFill && lastFill.over ? '。板の上位5段では足りなかったため、足りない分は、見えている板と同じ厚さが先にも続くとして見積もりました(5段目から最大 0.1%)' : '') +
        (!opening && (tp !== null || sl !== null) ? '。入力した利確・損切りは、決済の注文では使いません(変えるときは「保有中のポジション」の欄で)。' : '') +
        (dropped ? `。約定した価格(${fmtPrice(h.price)})に対して向きが合わないため、${dropped}は付けませんでした。「保有中のポジション」の欄で付け直してください` : ''), 'msg');
      done();
    };
    afterLatency(sym).then(late => { sending = false; fire(late); });
  };
  $('trOrderList').addEventListener('click', e => {
    const b = e.target.closest('button[data-oid]');
    if (!b) return;
    syncIfStale();
    T.orders = T.orders.filter(o => String(o.id) !== b.dataset.oid);
    saveTrade(); renderTrade(); draw();
  });
  $('trHistFilter').addEventListener('change', renderTrade);
  $('trBuy').addEventListener('click', () => order('buy'));
  $('trSell').addEventListener('click', () => order('sell'));
  /* チャート上の売買ボタン。押しまちがいで注文しないよう、2回押して確定する:
   * 1回目で「もう一度押すと買います」に変わり(3秒)、その間にもう一度押すと注文する。ほかの場所を押すと取り消す */
  const qt = { side: '', at: 0, timer: 0, sym: '' };
  const qtDisarm = () => {
    if (!qt.side) return;
    const qb = $(qt.side === 'buy' ? 'qtBuy' : 'qtSell');
    qb.classList.remove('armed'); qb.setAttribute('aria-pressed', 'false');
    clearTimeout(qt.timer); qt.side = ''; qt.at = 0;
  };
  const qtMake = (side, word, tip) => {
    const b = el('button', { type: 'button', id: side === 'buy' ? 'qtBuy' : 'qtSell', class: 'qt ' + side, title: tip }, [
      el('span', { class: 'qt-idle' }, [document.createTextNode(word + ' '), el('b', { id: side === 'buy' ? 'qtBuyPx' : 'qtSellPx' })]),
      el('span', { class: 'qt-arm', text: `もう一度押すと${side === 'buy' ? '買います' : '売ります'}` }),
    ]);
    b.setAttribute('aria-pressed', 'false');
    // キーを押しっぱなしにしても、くり返しの入力では確定しない(1回目で構え、いったん離してから2回目)
    b.addEventListener('keydown', e => { if (e.repeat && (e.key === 'Enter' || e.key === ' ')) e.preventDefault(); });
    b.addEventListener('click', () => {
      const now = Date.now();
      if (qt.side !== side || qt.sym !== state.symbol) {
        qtDisarm();
        qt.side = side; qt.at = now; qt.sym = state.symbol; b.classList.add('armed'); b.setAttribute('aria-pressed', 'true');
        // 注文画面が「指値」のときは、指値の予約になることを、押す前に伝える
        b.querySelector('.qt-arm').textContent = `もう一度押すと${orderType === 'limit' ? '指値で' : ''}${side === 'buy' ? '買います' : '売ります'}`;
        qt.timer = setTimeout(qtDisarm, 3000);
        return;
      }
      if (now - qt.at < 400) return; // 続けざまの2回押し(ダブルクリックなど)では注文しない
      qtDisarm();
      order(side, true);
    });
    return b;
  };
  quickEl = el('div', { class: 'quick-trade', role: 'group', 'aria-label': 'チャートから、いまの価格で売買する(デモ)' }, [
    qtMake('sell', '売', 'いまの価格で売る。金額・レバレッジ・利確・損切りは、デモトレードの画面で入れたものを使います(画面が「指値」のときは、その価格で予約します)。2回押すと注文します'),
    qtMake('buy', '買', 'いまの価格で買う。金額・レバレッジ・利確・損切りは、デモトレードの画面で入れたものを使います(画面が「指値」のときは、その価格で予約します)。2回押すと注文します'),
  ]);
  quickEl.hidden = true;
  mainStack().appendChild(quickEl);
  document.addEventListener('pointerdown', e => { if (qt.side && !$(qt.side === 'buy' ? 'qtBuy' : 'qtSell').contains(e.target)) qtDisarm(); });
  $('symbol').addEventListener('change', qtDisarm);
  $('symbol').addEventListener('symbolpicked', qtDisarm);

  $('pSave').addEventListener('click', () => {
    const pos = T.positions[state.symbol];
    if (!pos) return;
    const sym = state.symbol;
    if (syncIfStale()) { renderTrade(); return; }
    // 価格が最新で、閉じていた間の確認も済んでいるときだけ変更できる(過去の値動きを見てからの書き換えを防ぐ)
    if (!priceOk(sym) || reconciled[sym] !== true || !clockReady) { setTxt('pMsg', '価格を最新の状態にできていないため、いまは変更できません。数秒待ってから、もう一度お試しください。', 'msg down'); return; }
    const tp = numOrNull('pTp'), sl = numOrNull('pSl');
    let err = checkLevels(Math.sign(pos.qty), T.last[sym], tp, sl);
    if (!err && pos.lev > 1 && sl !== null) {
      const L = liqPrice(pos);
      if (L !== null && (pos.qty > 0 ? sl <= L : sl >= L)) err = `損切りの価格が、強制決済の価格(${fmtPrice(L)})より遠いため、先に強制決済されます。損切りを ${fmtPrice(L)} より${pos.qty > 0 ? '上' : '下'}にしてください。`;
    }
    if (err) { setTxt('pMsg', err, 'msg down'); return; }
    pos.tp = tp; pos.sl = sl; pos.levelsAt = tnow();
    saveTrade(); renderTrade(); draw();
    setTxt('pMsg', '保存しました。', 'msg');
  });
  /* 手での決済も成行の注文なので、成行の買い・売りと同じく、届くまでの遅れ(約 0.2 秒)を待ってから約定させる。
   * run(late): 待ち終わったときに呼ぶ。late は、待っている間に価格が古くなったなどで取り消すときの理由(なければ null) */
  const sendClose = (sym, msgId, run) => {
    if (sending) return;
    sending = true; if (msgId) setTxt(msgId, SENDING_MSG, 'msg'); renderTrade();
    afterLatency(sym).then(late => { sending = false; run(late); renderTrade(); draw(); });
  };
  $('pClose').addEventListener('click', () => {
    const sym = state.symbol, q = quoteOf(sym), held = T.positions[sym];
    const said = err => {
      if (err) { setTxt('pMsg', err, 'msg down'); return; }
      setTxt('pMsg', '');
      const h = T.history[0];
      setTxt('trMsg', `決済しました(損益 ${fmtMoney(netOf(h), q, true)} ${q})`, 'msg');
      renderTrade(); draw();
    };
    // 取引所から消えた銘柄は、注文を出す先がないので、最後の価格でそのまま清算する(待たない)
    if (dead[sym] && held) { said(closePosition(sym, 'manual', { price: T.last[sym] > 0 ? T.last[sym] : held.avg, away: false })); return; }
    sendClose(sym, 'pMsg', late => said(late || closePosition(sym, 'manual')));
  });
  // 半分だけ決済する(残りはそのまま持ち続ける)
  $('pHalf').addEventListener('click', () => {
    const sym = state.symbol, q = quoteOf(sym);
    if (!T.positions[sym]) { renderTrade(); return; }
    sendClose(sym, 'pMsg', late => {
      syncIfStale();
      const held = T.positions[sym];
      const err = late || (held ? execute(sym, held.qty > 0 ? 'sell' : 'buy', 0, 'manual', Math.abs(held.qty) / 2, { closeOnly: true }) : 'ポジションがありません。');
      if (err) { setTxt('pMsg', err, 'msg down'); return; }
      const h = T.history[0];
      setTxt('pMsg', `半分を決済しました(損益 ${fmtMoney(netOf(h), q, true)} ${q})。残りは持ち続けています。`, 'msg');
    });
  });
  // 損切りを、買った(売った)ときの価格に動かす。利益が出ているときに使うと、そこから下がっても損にならない
  $('pBe').addEventListener('click', () => {
    const pos = T.positions[state.symbol];
    if (!pos) return;
    const px = T.last[state.symbol];
    if (!(pos.qty > 0 ? px > pos.avg : px < pos.avg)) {
      setTxt('pMsg', '損切りを建値に動かせるのは、利益が出ているときだけです(いまの価格が建値より不利な側にあります)。', 'msg down');
      return;
    }
    const before = $('pSl').value;
    $('pSl').value = String(+pos.avg.toPrecision(10));
    $('pSave').click();
    // ほかの理由で断られたとき(利確の欄の値がおかしい、など)は、入力欄だけ元に戻す。理由は保存のときの表示のまま
    const now = T.positions[state.symbol];
    if (now && now.sl !== parseFloat($('pSl').value)) $('pSl').value = before;
  });
  // スマホの下のバーから、シートを開かずに決済できる。押しまちがいを防ぐため、2回押して確定する
  let tbArmed = 0, tbSym = '';
  const tbDisarm = () => { tbArmed = 0; tbSym = ''; $('tbClose').textContent = '決済'; $('tbClose').classList.remove('armed'); };
  $('symbol').addEventListener('change', tbDisarm);        // 銘柄を変えたら、押しかけの状態は取り消す
  $('symbol').addEventListener('symbolpicked', tbDisarm);
  $('tbClose').addEventListener('click', () => {
    const sym = state.symbol, q = quoteOf(sym), now = Date.now();
    if (!T.positions[sym]) return;
    if (tbSym !== sym || now - tbArmed > 4000) {
      tbArmed = now; tbSym = sym; $('tbClose').textContent = 'もう一度で決済'; $('tbClose').classList.add('armed');
      setTimeout(() => { if (Date.now() - tbArmed >= 3900) tbDisarm(); }, 4000);
      return;
    }
    if (now - tbArmed < 400) return; // 続けざまの2回押し(押しまちがい)では決済しない
    tbDisarm();
    if (sending) return;
    toast(SENDING_MSG);
    sendClose(sym, null, late => {
      const err = late || closePosition(sym, 'manual');
      toast(err || `決済しました(損益 ${fmtMoney(netOf(T.history[0]), q, true)} ${q})`);
    });
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
    const last = T.last, quotes = T.quotes, rev = T.rev;
    T = freshTrade(); T.last = last; T.quotes = quotes;
    T.rev = rev; // 保存の通し番号は引きつぐ(0 に戻すと「古い内容」とみなされ、リセット前の状態に戻されてしまう)
    Object.keys(reconciled).forEach(k => delete reconciled[k]);
    saveTrade(); renderTrade(); draw();
    setTxt('trMsg', '口座をリセットしました。', 'msg');
  });
  const onSymbol = () => {
    if ($('symbol').value === '__add') return;
    unit = 'amount'; amt.value = acct(quoteOf(state.symbol)).start / 10; renderUnit();
    $('trTp').value = ''; $('trSl').value = ''; setTxt('trMsg', '');
    $('trLimit').value = ''; // 前の銘柄の指値の価格を、別の銘柄に持ちこさない
    renderRisk();
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
  let fees = 0, funding = 0, peak = Math.max(cash, start), maxDD = 0, maxDDPct = 0;
  const fundBy = {}; // 資金調達料は、そのポジションの取引の損益に入れる(決済が済んでから)
  events.forEach((h, i) => {
    fees += h.fee;
    cash += cashOf(h);
    curve.push({ t: h.t, v: cash });
    peak = Math.max(peak, cash);
    if (peak - cash > maxDD) { maxDD = peak - cash; maxDDPct = peak ? maxDD / peak * 100 : 0; }
    const s = bySym[h.sym] || (bySym[h.sym] = { sym: h.sym, n: 0, wins: 0, net: 0 });
    s.net += cashOf(h);
    if (h.reason === 'fund') { funding -= h.pnl; const k = `${h.sym}:${h.pid}`; fundBy[k] = (fundBy[k] || 0) + h.pnl; return; }
    if (h.pnl === null) return;
    // 分けて決済しても、同じポジションなら1回にまとめる。損益には、建てたときの手数料も含める
    const key = h.pid === null ? `row${i}` : `${h.sym}:${h.pid}`;
    const tr = trades.get(key) || { sym: h.sym, net: 0 };
    tr.net += netOf(h);
    trades.delete(key); trades.set(key, tr); // 最後に決済した順に並べ直す
  });
  trades.forEach((tr, key) => { if (fundBy[key]) tr.net += fundBy[key]; });
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
    start, cash: a.cash, fees, funding, curve, maxDD, maxDDPct, bestRun, worstRun: -worstRun,
    n: closed.length, wins: wins.length, losses: losses.length,
    net: a.cash - start,
    avgWin: wins.length ? grossWin / wins.length : NaN,
    avgLoss: losses.length ? -grossLoss / losses.length : NaN,
    best: closed.length ? Math.max(...closed) : NaN,
    worst: closed.length ? Math.min(...closed) : NaN,
    pf: grossLoss > 0 ? grossWin / grossLoss : NaN,
    bySym: Object.values(bySym).sort((x, y) => y.net - x.net),
    list: [...trades.values()], // 取引(1つのポジション)ごとの損益。決済した順
  };
}
/* 保有中のポジションの含み損益が、建ててからどう動いてきたか。
 * いま見ている時間足の終値で計算する(建てたあとの足が2本に満たない間は、まだ描けない) */
let sparkKey = '';
function drawPosSpark(pos, q) {
  const cv = $('pSpark'), bars = state.bars, n = bars.length;
  // デモ表示のとき(本物の価格ではない)と、読み込みの途中(前の銘柄・時間足の足が残っている)は出さない
  if (!state.live || state.loading) { $('pSparkBox').hidden = true; sparkKey = ''; return; }
  let i0 = n;
  while (i0 > 0 && barEnd(bars[i0 - 1].t, curInterval()) > pos.opened) i0--; // 建てた時刻を含む足から
  const pts = bars.slice(i0).map(b => pos.qty * (b.c - pos.avg));
  const few = pts.length < 2;
  $('pSparkBox').hidden = few;
  if (few) { sparkKey = ''; return; }
  const key = `${state.symbol}|${state.interval}|${pos.qty}|${pts.length}|${pts[pts.length - 1].toPrecision(6)}|${state.theme}|${cv.clientWidth}`;
  if (key === sparkKey) return; // 変わっていなければ描き直さない
  sparkKey = key;
  const dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight;
  if (!w) { sparkKey = ''; return; }
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const c = cv.getContext('2d'), th = THEMES[state.theme];
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  const hi = Math.max(0, ...pts), lo = Math.min(0, ...pts), span = hi - lo || 1, pad = 6;
  const X = i => pad + i / (pts.length - 1) * (w - pad * 2), Y = v => pad + (hi - v) / span * (h - pad * 2);
  const last = pts[pts.length - 1], color = last >= 0 ? UP : DOWN;
  c.strokeStyle = th.cross; c.setLineDash([3, 3]); c.lineWidth = 1;
  c.beginPath(); c.moveTo(pad, Y(0)); c.lineTo(w - pad, Y(0)); c.stroke(); c.setLineDash([]);
  c.beginPath(); c.moveTo(X(0), Y(0)); pts.forEach((v, i) => c.lineTo(X(i), Y(v))); c.lineTo(X(pts.length - 1), Y(0)); c.closePath();
  c.fillStyle = rgba(color, 0.14); c.fill();
  c.beginPath(); pts.forEach((v, i) => (i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v))));
  c.strokeStyle = color; c.lineWidth = 1.8; c.lineJoin = 'round'; c.stroke();
  setTxt('pSparkNote', `建ててからの含み損益(${curInterval().label}足 ${pts.length}本)。いちばん良かったとき ${fmtMoney(Math.max(...pts), q, true)}、悪かったとき ${fmtMoney(Math.min(...pts), q, true)} ${q}`);
}
// 取引ごとの損益の棒グラフ。「小さく勝って大きく負けていないか」が、ひと目で分かる
function drawPnlBars(cv, st, q) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight;
  if (!w) return;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const c = cv.getContext('2d'), th = THEMES[state.theme];
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  const list = st.list.slice(-120), padL = 8, padR = 78, padT = 12, padB = 12;
  const hi = Math.max(0, ...list.map(t => t.net)), lo = Math.min(0, ...list.map(t => t.net)), span = hi - lo || 1;
  const Y = v => padT + (hi - v) / span * (h - padT - padB), slot = (w - padL - padR) / list.length, bw = Math.max(1, Math.min(26, slot * 0.72));
  list.forEach((t, i) => {
    const x = padL + slot * (i + 0.5) - bw / 2, y = Y(t.net), y0 = Y(0);
    c.fillStyle = rgba(t.net >= 0 ? UP : DOWN, 0.85);
    c.fillRect(x, Math.min(y, y0), bw, Math.max(1, Math.abs(y - y0)));
  });
  c.strokeStyle = th.cross; c.lineWidth = 1; c.beginPath(); c.moveTo(padL, Math.round(Y(0)) + 0.5); c.lineTo(w - padR, Math.round(Y(0)) + 0.5); c.stroke();
  c.font = '11px -apple-system, "Segoe UI", "Hiragino Sans", sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'left';
  const label = (v, color) => { let t = fmtMoney(v, q, true); if (c.measureText(t).width > padR - 8) t = (v > 0 ? '+' : '') + fmtCompact(v); c.fillStyle = color; c.fillText(t, w - padR + 6, clamp(Y(v), 8, h - 8)); };
  if (hi > 0) label(hi, UP);
  if (lo < 0) label(lo, DOWN);
  if (Math.abs(Y(0) - Y(hi)) > 13 && Math.abs(Y(0) - Y(lo)) > 13) { c.fillStyle = th.text; c.fillText('0', w - padR + 6, Y(0)); }
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
/* 自分の売買のくせ(デモの履歴から)。研究で知られた「くせ」と同じ形で数えるだけで、良い・悪いは決めない。
 *   ・含み益・含み損の決済の割合(PGR / PLR。Odean 1998):自分の手で決済したときに、そのとき持っていたポジションを
 *     「決済した益・決済した損・持ち続けた益・持ち続けた損」に分けて数える。利確・損切り・強制決済で自動的に決済されたものは数えない。
 *     持ち続けたほうの含み損益は、その時刻の1時間足の終値で判定する(足を取り寄せるので、下の marketStats で数える)
 *   ・持っていた時間(負けた取引と勝った取引の中央値)、勝ったあと・負けたあとの次の取引の金額(Ben-David ら 2018)、
 *     負けてから30分以内の次の取引、1週間あたりの取引の数、手数料が手数料を引く前の利益に占める割合(Barber・Odean 2000)
 * 30分などの区切りは、このアプリで決めたもので、論文の値ではない */
function behaviourStats(q) {
  const ev = T.history.filter(h => quoteOf(h.sym) === q && h.reason !== 'fund').slice().reverse();
  const open = new Map(), pos = [], held = []; // open: `sym:pid` → { sym, dir, avg, qty, t0, size }。held: 手で決済したときに持ち続けていたもの
  let rg = 0, rl = 0, manual = 0, gross = 0, fees = 0;
  ev.forEach(h => {
    fees += h.fee;
    const key = `${h.sym}:${h.pid}`;
    if (h.pnl === null) {
      // 建てた・買い増した
      const o = open.get(key);
      if (o) { o.avg = (o.avg * o.qty + h.price * h.qty) / (o.qty + h.qty); o.qty += h.qty; }
      else { const n = { sym: h.sym, dir: h.side === 'buy' ? 1 : -1, avg: h.price, qty: h.qty, t0: h.t, size: h.qty * h.price, net: 0 }; open.set(key, n); pos.push(n); }
      return;
    }
    gross += h.pnl;
    const o = open.get(key);
    if (h.reason === 'manual') {
      manual++;
      if (h.pnl > 0) rg++; else if (h.pnl < 0) rl++;
      open.forEach((x, k) => { if (k !== key) held.push({ sym: x.sym, dir: x.dir, avg: x.avg, t: h.t }); });
    }
    if (o) { o.net += netOf(h); o.qty -= h.qty; o.t1 = h.t; if (o.qty <= o.size / o.avg * 1e-6) { o.closed = true; open.delete(key); } }
  });
  const med = a => { if (!a.length) return NaN; const b = a.slice().sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
  const done = pos.filter(x => x.closed);
  const win = done.filter(x => x.net > 0), loss = done.filter(x => x.net < 0);
  // 次の取引の金額:直前に決済し終えた取引が勝ちか負けか
  const afterW = [], afterL = [];
  let reIn = 0;
  pos.forEach(x => {
    const prev = done.filter(y => y !== x && y.t1 <= x.t0).sort((a, b) => b.t1 - a.t1)[0];
    if (!prev) return;
    (prev.net > 0 ? afterW : prev.net < 0 ? afterL : []).push(x.size);
  });
  loss.forEach(y => { if (pos.some(x => x !== y && x.t0 > y.t1 && x.t0 - y.t1 <= 30 * 6e4)) reIn++; });
  const span = ev.length ? Math.max(ev[ev.length - 1].t - ev[0].t, 7 * 864e5) : NaN;
  return {
    manual, rg, rl, held,
    holdLoss: med(loss.map(x => x.t1 - x.t0)), holdWin: med(win.map(x => x.t1 - x.t0)), nWin: win.length, nLoss: loss.length,
    sizeAll: med(pos.map(x => x.size)), sizeAfterW: med(afterW), sizeAfterL: med(afterL), nAfterW: afterW.length, nAfterL: afterL.length,
    reIn, perWeek: done.length / (span / (7 * 864e5)), nDone: done.length, fees, gross, feeShare: gross > 0 ? fees / gross : NaN,
    entries: pos.map(x => ({ sym: x.sym, t: x.t0, px: x.avg })),
  };
}
/* 大きく動いた直後に入った取引の割合(Barber・Odean 2008、Barber ら 2022:個人は、注目を集めた銘柄を買いがち)。
 * 入る前の24時間の値動きの大きさ |いまの価格 ÷ 24時間前の価格 − 1| が、日足の ATR(14本、前の日まで)の2倍を超えたら「大きく動いた直後」。
 * 足を取り寄せるので、別に計算する(直近 約40日の、1時間足がある範囲の取引だけ) */
const attnCache = new Map();
async function marketStats(b) {
  const entries = b.entries;
  const syms = [...new Set(entries.map(e => e.sym).concat(b.held.map(x => x.sym)))].slice(0, 10);
  let n = 0, big = 0, pg = 0, pl = 0, unk = 0;
  for (const sym of syms) {
    let d = attnCache.get(sym);
    if (!d || Date.now() - d.at > 6e5) {
      const [h1, d1] = await Promise.all([fetchKlines(sym, '1h', 1000), fetchKlines(sym, '1d', 120)]);
      d = { at: Date.now(), h1, d1 }; attnCache.set(sym, d);
    }
    const atrD = GT.helpers.atr(d.d1, 14);
    entries.filter(e => e.sym === sym).forEach(e => {
      const k = d.h1.findIndex(b => b.t <= e.t - 864e5 && e.t - 864e5 < b.t + 36e5);
      let j = -1; for (let i = 0; i < d.d1.length; i++) if (d.d1[i].t + 864e5 <= e.t) j = i;
      if (k < 0 || j < 14 || !(atrD[j] > 0)) return;
      n++;
      if (Math.abs(e.px - d.h1[k].c) > 2 * atrD[j]) big++;
    });
    // 手で決済したときに持ち続けていたポジションの含み損益:その時刻を含む1時間足の終値で判定
    b.held.filter(x => x.sym === sym).forEach(x => {
      const bar = d.h1.find(y => y.t <= x.t && x.t < y.t + 36e5);
      if (!bar) { unk++; return; }
      const u = (bar.c - x.avg) * x.dir;
      if (u > 0) pg++; else if (u < 0) pl++;
    });
  }
  unk += b.held.filter(x => !syms.includes(x.sym)).length;
  const rg = b.rg, rl = b.rl;
  return { n, big, pg, pl, unk, nPgr: rg + rl + pg + pl, pgr: rg + pg ? rg / (rg + pg) : NaN, plr: rl + pl ? rl / (rl + pl) : NaN };
}
function behaviourHtml(b, q) {
  const pc = v => (isFinite(v) ? `${(v * 100).toFixed(0)}%` : '—');
  const dur = ms => (!isFinite(ms) ? '—' : ms < 36e5 ? `${Math.max(1, Math.round(ms / 6e4))} 分` : ms < 864e5 ? `${(ms / 36e5).toFixed(1)} 時間` : `${(ms / 864e5).toFixed(1)} 日`);
  const kpi = (label, value, hint) => `<div class="kpi"><span class="dim">${label}</span><strong>${value}</strong>${hint ? `<small>${hint}</small>` : ''}</div>`;
  const money = v => (isFinite(v) ? `${fmtMoney(v, q)} ${esc(q)}` : '—');
  return `<h3>売買のくせ(研究で知られた形で数えたもの)</h3>` +
    `<p class="small">あなたのデモの履歴を、投資家の行動の研究と同じ形で数えたものです。数が少ないうちは偶然で大きく変わります。良い・悪いの判定ではありません。</p><div class="kpis">` +
    `<div class="kpi" id="anPgr"><span class="dim">含み益・含み損の決済の割合</span><strong>計算しています…</strong><small>自分の手で決済した ${b.manual} 回について数えます</small></div>` +
    kpi('持っていた時間(中央値)', `負け ${dur(b.holdLoss)} / 勝ち ${dur(b.holdWin)}`, `負けた取引 ${b.nLoss} 回・勝った取引 ${b.nWin} 回。負けた取引を長く持つ傾向は、上と同じ研究で「損を確定させにくい」くせとして知られています`) +
    kpi('次の取引の金額(中央値)', `勝ったあと ${money(b.sizeAfterW)} / 負けたあと ${money(b.sizeAfterL)}`, `全体の中央値 ${money(b.sizeAll)}(勝ったあと ${b.nAfterW} 回・負けたあと ${b.nAfterL} 回)。Ben-David ら(2018)は、個人の為替の取引で、勝った週のあとに金額を大きく増やす傾向を報告しています`) +
    kpi('負けてから30分以内に次の取引', `${b.reIn} 回`, `負けた取引 ${b.nLoss} 回のうち(30分はこのアプリで決めた区切り)`) +
    `<div class="kpi" id="anAttn"><span class="dim">大きく動いた直後に入った取引</span><strong>計算しています…</strong><small>入る前の24時間の値動きが、日足の ATR(14)の2倍を超えていたもの</small></div>` +
    kpi('1週間あたりの取引', isFinite(b.perWeek) ? b.perWeek.toFixed(1) : '—', `決済し終えた取引 ${b.nDone} 回`) +
    kpi('手数料 ÷ 手数料を引く前の損益', b.gross > 0 ? pc(b.feeShare) : '—', b.gross > 0 ? `手数料 ${money(b.fees)}、引く前の損益 ${money(b.gross)}。Barber・Odean(2000)は、よく売買する個人ほど、手数料などで成績が下がったと報告しています` : `手数料 ${money(b.fees)}。手数料を引く前の損益がプラスでないため、割合は出していません`) +
    `</div>`;
}
let attnToken = 0;
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
    kpi('確定した損益', m(st.net, true), pnlClass(st.net), `開始資金 ${fmtMoney(st.start, q)} → ${fmtMoney(st.cash, q)}(${pct2(st.net / st.start * 100)}%)`) +
    kpi('勝率', st.n ? `${(st.wins / st.n * 100).toFixed(0)}%` : '—', '', `決済 ${st.n} 回(勝ち ${st.wins}・負け ${st.losses})`) +
    kpi('プロフィットファクター', pfText, isFinite(st.pf) ? pnlClass(st.pf - 1) : '', '利益の合計 ÷ 損失の合計。1 より大きければ全体でプラス') +
    kpi('最大ドローダウン', st.maxDD > 0 ? `${m(-st.maxDD)}` : '—', st.maxDD > 0 ? 'down' : '', st.maxDD > 0 ? `資金がいちばん多かった時点から、最大で ${st.maxDDPct.toFixed(2)}% 減った` : '資金のピークからの最大の落ち込み') +
    kpi('平均利益 / 平均損失', `${isFinite(st.avgWin) ? fmtMoney(st.avgWin, q, true) : '—'} / ${isFinite(st.avgLoss) ? fmtMoney(st.avgLoss, q, true) : '—'}`, '', '勝ったとき・負けたときの1回あたりの平均') +
    kpi('最大の勝ち / 負け', `${isFinite(st.best) && st.best > 0 ? fmtMoney(st.best, q, true) : '—'} / ${isFinite(st.worst) && st.worst < 0 ? fmtMoney(st.worst, q, true) : '—'}`, '', `最長の連勝 ${st.bestRun} 回・連敗 ${st.worstRun} 回`) +
    kpi('手数料の合計', m(st.fees), '', '損益にはすでに含めています') +
    (st.funding ? kpi('資金調達料の合計', m(-st.funding, true), pnlClass(-st.funding), 'レバレッジのポジションに8時間ごとにかかる分(取引所の実際の率。取り寄せられないときは 0.01% の目安)。損益に含めています') : '') +
    `</div><h3>資金の推移</h3><canvas id="anCurve" class="curve" role="img" aria-label="取引ごとの口座残高の推移"></canvas>` +
    `<p class="dim small">横軸は取引の順番です。保有中のポジションの含み損益は含みません。</p>` +
    (st.list.length ? `<h3>取引ごとの損益</h3><canvas id="anBars" class="curve bars" role="img" aria-label="取引ごとの損益の棒グラフ"></canvas>` +
      `<p class="dim small">棒1本が、1つのポジション(建ててから決済し終えるまで)です。左が古く、右が新しい取引です。上向きの緑が利益、下向きの赤が損失で、手数料を引いたあとの金額です。${st.list.length > 120 ? '新しい120件を表示しています。' : ''}</p>` : '') +
    `<h3>銘柄ごとの成績</h3>`;
  html += st.bySym.length
    ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>銘柄</th><th>決済</th><th>勝率</th><th>損益 (${qe})</th></tr></thead><tbody>` +
      st.bySym.map(s => `<tr><td>${esc(labelOf(s.sym))}</td><td>${s.n}</td><td>${s.n ? (s.wins / s.n * 100).toFixed(0) + '%' : '—'}</td><td class="${pnlClass(s.net)}">${fmtMoney(s.net, q, true)}</td></tr>`).join('') +
      `</tbody></table></div>`
    : `<p class="dim">まだ取引がありません。デモトレードで売買すると、ここに成績が出ます。</p>`;
  if (st.n > 0 && st.n < 30) html += `<p class="dim small">決済が ${st.n} 回と少ないため、勝率などの数字は偶然に大きく左右されます。目安として見てください。</p>`;
  const bh = behaviourStats(q);
  if (st.n > 0) html += behaviourHtml(bh, q);
  body.innerHTML = html;
  if (st.n > 0 && $('anAttn')) {
    const token = ++attnToken;
    marketStats(bh).then(r => {
      const box = $('anAttn');
      if (token !== attnToken || !box) return;
      box.querySelector('strong').textContent = r.n ? `${r.big} 回 / ${r.n} 回` : '数えられる取引がありません';
      const pg = $('anPgr'), pc = v => (isFinite(v) ? `${(v * 100).toFixed(0)}%` : '—');
      if (pg) {
        pg.querySelector('strong').textContent = r.nPgr >= 20 ? `益 ${pc(r.pgr)} / 損 ${pc(r.plr)}` : 'まだ数が足りません';
        pg.querySelector('small').textContent = `自分の手で決済した ${bh.manual} 回について、そのとき持っていたポジション ${r.nPgr} 件(決済した益 ${bh.rg}・損 ${bh.rl}、持ち続けた益 ${r.pg}・損 ${r.pl})を数えました(20 件以上で表示${r.unk ? `。価格が取れず数えなかったもの ${r.unk} 件` : ''})。` +
          (r.nPgr >= 20 && isFinite(r.pgr - r.plr) ? `差 ${((r.pgr - r.plr) * 100).toFixed(0)} ポイント。` : '') + 'Odean(1998)は、個人投資家は含み益を含み損より決済しやすいと報告しています。持ち続けた分の含み損益は、その時刻の1時間足の終値で判定。利確・損切りでの自動の決済は数えません';
      }
      box.querySelector('small').textContent = `入る前の24時間の値動きが、日足の ATR(14、前の日まで)の2倍を超えていた取引(直近 約40日の取引だけ)。Barber・Odean(2008)は、個人投資家は注目を集めた(大きく動いた・出来高の多い)銘柄を買いがちだと報告しています`;
    }).catch(() => { if (token !== attnToken) return; ['anAttn', 'anPgr'].forEach(id => { const box = $(id); if (box) box.querySelector('strong').textContent = '価格を取り寄せられませんでした'; }); });
  }
  drawCurve($('anCurve'), st);
  if ($('anBars')) drawPnlBars($('anBars'), st, q);
}
function exportCsv() {
  const cell = v => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [['日時', '銘柄', '売買', '数量', '価格', '決済通貨', '手数料', '損益(手数料込み。建てたときの手数料も引いた額)', '種類', 'メモ']];
  T.history.slice().reverse().forEach(h => {
    rows.push([fmtDate(h.t, true), labelOf(h.sym), h.side === 'buy' ? '買い' : '売り', h.qty, h.price, quoteOf(h.sym), h.fee,
      h.pnl === null ? '' : netOf(h),
      (h.reason === 'fund' ? `資金調達料(${fundLabel(h)})` : h.pnl === null ? '新規' : h.reason === 'tp' ? '決済(利確)' : h.reason === 'sl' ? '決済(損切り)' : h.reason === 'liq' ? '決済(強制)' : '決済') + (h.reason === 'limit' ? '・指値' : ''),
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
  $('helpTour').addEventListener('click', () => { ov.hidden = true; startTour(); });
  // 初めて開いたときだけ、ポップアップ式の案内を自動で始める
  let seen = false;
  try { seen = !!localStorage.getItem(HELP_KEY); } catch (e) { seen = true; }
  // 教科書の課題などから、銘柄や指標を指定して開いたときは、案内で作業をさえぎらない(案内は、次にふつうに開いたときに出る)
  const fromLink = /[?&](symbol|ind)=/.test(location.search) || /guide\.html|manual\.html/.test(document.referrer || '');
  if (!seen && !fromLink) startTour();
}

// ---------------------------------------------------------------- ポップアップ式の案内(初回に自動で出る)
/* 画面の部品を1つずつ明るく囲み、その横に説明の吹き出しを出す。
 * sel は、囲む部品の候補(先に見つかった、画面に出ているものを使う)。なければ画面の中央に出す */
const TOUR_STEPS = [
  { title: 'ようこそ', body: 'このサイトは、暗号資産や金のチャートを見ながら、仮想の資金で売買の練習ができる場所です。実際のお金は動きません。\nこれから1分ほどで、画面の主な場所を案内します。' },
  { sel: ['#symbol'], title: '銘柄を選ぶ', body: 'ここで、表示する銘柄を変えます。いちばん下の「すべての銘柄から探す」を選ぶと、取引所にあるすべての銘柄から選べます。' },
  { sel: ['#intervals'], title: '時間足を選ぶ', body: 'ローソク足1本が表す時間の長さです。1分・5分・15分・30分・1時間・4時間・日・週・月から選べます。',
    touch: 'スマホでは、この列を左右にスワイプすると、隠れている時間足が出てきます。' },
  { sel: ['#chartWrap'], title: 'チャートを動かす', inside: true,
    touch: '指1本で左右にスワイプすると、過去にさかのぼれます。指2本で広げる・つまむと、拡大・縮小します。\nチャートをタップすると十字線が出て、その足の始値・高値・安値・終値が上に出ます。',
    mouse: 'ドラッグで左右に動かし、マウスのホイールで拡大・縮小します。ダブルクリックで元の表示に戻ります。\nマウスを重ねた足の始値・高値・安値・終値が、左上に出ます。' },
  { sel: ['#indBtn'], title: 'インジケーターを足す', body: '移動平均線や RSI など、78種類の分析用の線を追加できます。名前で検索でき、☆ を押すと「よく使う」に入ります。\nいちばん下の「＋ 自分で作る」では、式を書いてオリジナルも作れます。' },
  { sel: ['#drawBtn'], title: 'ツール', body: '線を引く(水平線・トレンドライン・フィボナッチなど)、価格のお知らせを置く、売買ルールを過去のデータで試す、表示を切りかえる、画像で保存する、といった機能が入っています。' },
  { sel: ['#tbOpen', '#tradeBtn'], title: 'デモトレード', body: '仮想の資金 10,000 で、買い・売りの練習ができます。利確・損切りの価格を入れておくと、届いたときに自動で決済します。\n成績は「成績を分析」で振り返れます。' },
  { sel: ['#guideLink', '#drawBtn'], title: '学ぶ・調べる', body: '「教科書」には、銘柄の特徴・インジケーターの読み方・手法・資金管理をまとめています。\n操作で迷ったら、「ツール → 操作マニュアル」に、すべての機能の使い方があります。' },
  { title: '準備ができました', body: 'まずは銘柄と時間足を変えてみて、チャートを動かしてみてください。\nこの案内は、「ツール → 使い方の案内」から、いつでも見直せます。' },
];
const tour = { i: 0, on: false, opener: null };
function tourTarget(step) {
  for (const s of step.sel || []) {
    const e = document.querySelector(s);
    if (!e) continue;
    const r = e.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight) return e;
  }
  return null;
}
function renderTour() {
  if (!tour.on) return;
  const step = TOUR_STEPS[tour.i], touchUi = window.matchMedia && matchMedia('(hover: none), (max-width: 760px)').matches;
  const pop = $('tourPop'), hole = $('tourHole'), target = tourTarget(step);
  $('tourTitle').textContent = step.title;
  $('tourBody').textContent = [step.body, touchUi ? step.touch : step.mouse].filter(Boolean).join('\n');
  $('tourCount').textContent = `${tour.i + 1} / ${TOUR_STEPS.length}`;
  $('tourPrev').hidden = tour.i === 0;
  $('tourSkip').hidden = tour.i === TOUR_STEPS.length - 1;
  $('tourNext').textContent = tour.i === TOUR_STEPS.length - 1 ? 'はじめる' : '次へ';
  const vw = window.innerWidth, vh = window.innerHeight, gap = 12;
  pop.style.width = `${Math.min(360, vw - 24)}px`;
  pop.style.left = '0px'; pop.style.top = '0px';
  const ph = pop.offsetHeight, pw = pop.offsetWidth;
  if (!target) {
    hole.hidden = true;
    $('tour').classList.add('plain');
    pop.style.left = `${Math.round((vw - pw) / 2)}px`; pop.style.top = `${Math.round(Math.max(12, (vh - ph) / 2))}px`;
    return;
  }
  $('tour').classList.remove('plain');
  const r = target.getBoundingClientRect(), pad = 6;
  const hx = Math.max(4, r.left - pad), hy = Math.max(4, r.top - pad), hw = Math.min(vw - 4, r.right + pad) - hx, hh = Math.min(vh - 4, r.bottom + pad) - hy;
  hole.hidden = false;
  hole.style.left = `${hx}px`; hole.style.top = `${hy}px`; hole.style.width = `${hw}px`; hole.style.height = `${hh}px`;
  // 吹き出しは、部品の下 → 上 → 中(大きな部品のとき)の順で、収まる場所に置く
  let top;
  if (step.inside || (hy + hh + gap + ph > vh - 8 && hy - gap - ph < 8)) top = clamp(hy + (hh - ph) / 2, 8, Math.max(8, vh - ph - 8));
  else if (hy + hh + gap + ph <= vh - 8) top = hy + hh + gap;
  else top = hy - gap - ph;
  pop.style.top = `${Math.round(top)}px`;
  pop.style.left = `${Math.round(clamp(hx + hw / 2 - pw / 2, 12, Math.max(12, vw - pw - 12)))}px`;
}
function startTour() {
  // 開いているメニューや画面は閉じてから始める
  document.querySelectorAll('.overlay').forEach(o => { o.hidden = true; });
  document.querySelectorAll('.menu').forEach(m => { m.hidden = true; });
  tour.i = 0; tour.on = true; tour.opener = document.activeElement;
  $('tour').hidden = false;
  renderTour();
  $('tourNext').focus();
}
function endTour() {
  if (!tour.on) return;
  tour.on = false;
  $('tour').hidden = true;
  try { localStorage.setItem(HELP_KEY, '1'); } catch (e) { /* 保存できなくても閉じる */ }
  if (tour.opener && tour.opener.isConnected && tour.opener.focus) tour.opener.focus();
}
function bindTour() {
  $('tourNext').addEventListener('click', () => { if (tour.i >= TOUR_STEPS.length - 1) endTour(); else { tour.i++; renderTour(); $('tourNext').focus(); } });
  $('tourPrev').addEventListener('click', () => { if (tour.i > 0) { tour.i--; renderTour(); } });
  $('tourSkip').addEventListener('click', endTour);
  window.addEventListener('resize', renderTour);
  // 案内の間は、キー操作を案内だけに向ける(Esc で終了、左右の矢印で前後)
  document.addEventListener('keydown', e => {
    if (!tour.on) return;
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); endTour(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); $('tourNext').click(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); $('tourPrev').click(); }
    else if (e.key === 'Tab') {
      // フォーカスを吹き出しの中にとどめる
      const btns = [...$('tourPop').querySelectorAll('button')].filter(x => !x.hidden);
      const at = btns.indexOf(document.activeElement);
      e.preventDefault();
      btns[(at + (e.shiftKey ? -1 : 1) + btns.length) % btns.length].focus();
    }
  }, true);
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
  const err = GT.checkFormula(expr, mk.def.inputs.length);
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
  const nIn = d.inputs.length;
  const ok = d.name.trim() && d.lines.every(l => l.expr.trim() && !GT.checkFormula(l.expr, nIn)) &&
    d.marks.every(m => m.expr.trim() && !GT.checkFormula(m.expr, nIn)) &&
    (!d.hist.trim() || d.overlay || !GT.checkFormula(d.hist, nIn)) && (d.lines.length || d.marks.length || (!d.overlay && d.hist.trim()));
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
    bands.addEventListener('input', () => { d.bands = bands.value.split(/[,、\s]+/).filter(t => t !== '').map(Number).filter(v => isFinite(v) && Math.abs(v) <= 1e12).slice(0, 4); });
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
const bt = { ind: null, rule: -1, side: 'long', exit: 'signal', hold: 10, sl: 0, tp: 0 };
/* よく知られた売買ルール。自作インジケーターと同じ「式」で書いてあるので、そのままチャートにも出せる。
 * ▲ が買いの合図、▼ が売りの合図 */
const RULES = [
  { name: '移動平均の交差', desc: '短い平均線が長い平均線を上に抜けたら買い、下に抜けたら売り。流れに乗る手法の基本です。', overlay: true,
    inputs: [{ label: '短い期間', def: 10 }, { label: '長い期間', def: 30 }],
    lines: [{ name: '短', expr: 'ema(close, p1)', color: '#2f80ed' }, { name: '長', expr: 'ema(close, p2)', color: '#f5a623' }],
    marks: [{ name: '上抜け', expr: 'crossover(ema(close, p1), ema(close, p2))', dir: 'up' }, { name: '下抜け', expr: 'crossunder(ema(close, p1), ema(close, p2))', dir: 'down' }] },
  { name: '長期の平均線の上下', desc: '価格が長期の平均線を上に抜けたら買い、下に抜けたら売り。大きな流れだけを取りにいきます。', overlay: true,
    inputs: [{ label: '期間', def: 200 }],
    lines: [{ name: '平均', expr: 'sma(close, p1)', color: '#8e44ad' }],
    marks: [{ name: '上抜け', expr: 'crossover(close, sma(close, p1))', dir: 'up' }, { name: '下抜け', expr: 'crossunder(close, sma(close, p1))', dir: 'down' }] },
  { name: 'RSI の行きすぎからの戻り', desc: 'RSI が下の基準を割ったあと、上に戻ったら買い。上の基準を超えたあと、下に戻ったら売り。横ばいの相場向きです。', overlay: true,
    inputs: [{ label: '期間', def: 14 }, { label: '下の基準', def: 30 }, { label: '上の基準', def: 70 }], lines: [],
    marks: [{ name: '下から戻る', expr: 'crossover(rsi(close, p1), p2)', dir: 'up' }, { name: '上から戻る', expr: 'crossunder(rsi(close, p1), p3)', dir: 'down' }] },
  { name: 'MACD とシグナルの交差', desc: 'MACD がシグナルを上に抜けたら買い、下に抜けたら売り。', overlay: true,
    inputs: [{ label: '短期', def: 12 }, { label: '長期', def: 26 }, { label: 'シグナル', def: 9 }], lines: [],
    marks: [{ name: '上抜け', expr: 'crossover(ema(close, p1) - ema(close, p2), ema(ema(close, p1) - ema(close, p2), p3))', dir: 'up' },
      { name: '下抜け', expr: 'crossunder(ema(close, p1) - ema(close, p2), ema(ema(close, p1) - ema(close, p2), p3))', dir: 'down' }] },
  { name: 'ボリンジャーバンドの逆張り', desc: '下のバンドを割ったら買い、上のバンドを超えたら売り。「行きすぎは戻る」という考え方です。強い流れが出ると負け続けます。', overlay: true,
    inputs: [{ label: '期間', def: 20 }, { label: '幅(標準偏差の何倍)', def: 2 }],
    lines: [{ name: '上', expr: 'sma(close, p1) + stdev(close, p1) * p2', color: '#16a085' }, { name: '下', expr: 'sma(close, p1) - stdev(close, p1) * p2', color: '#16a085' }],
    marks: [{ name: '下を割る', expr: 'crossunder(close, sma(close, p1) - stdev(close, p1) * p2)', dir: 'up' }, { name: '上を超える', expr: 'crossover(close, sma(close, p1) + stdev(close, p1) * p2)', dir: 'down' }] },
  { name: '高値・安値の更新(ブレイクアウト)', desc: '直近の高値を終値で超えたら買い、直近の安値を終値で割ったら売り。', overlay: true,
    inputs: [{ label: '期間', def: 20 }],
    lines: [{ name: '高値', expr: 'prev(highest(high, p1))', color: '#27ae60' }, { name: '安値', expr: 'prev(lowest(low, p1))', color: '#c0392b' }],
    marks: [{ name: '高値を超える', expr: 'crossover(close, prev(highest(high, p1)))', dir: 'up' }, { name: '安値を割る', expr: 'crossunder(close, prev(lowest(low, p1)))', dir: 'down' }] },
  // ここから下は、論文で調べられた形のもの(説明に論文の名前を書いてある)。どれも「買うか、休むか」だけで試す
  { name: '12か月の時系列モメンタム(TSMOM)', desc: '過去252本(日足で約12か月)の値上がり率がプラスに変わったら買い、マイナスに変わったら手じまう。Moskowitz・Ooi・Pedersen(2012)と Hurst・Ooi・Pedersen(2017)の、過去12か月の値動きの符号で向きを決める方法です(論文では売りも使い、値動きの大きさで持つ量を調整しています。ここでは買うか休むかだけで、最初の合図が出るまでは持ちません)。日足で使う想定です。Huang ら(2020)は、銘柄ごとに見ると予想する力は弱いと反論しています。', overlay: true,
    inputs: [{ label: '何本前と比べるか', def: 252 }],
    lines: [{ name: 'n本前の終値', expr: 'prev(close, p1)', color: '#8e44ad' }],
    marks: [{ name: 'プラスに変わる', expr: 'crossover(close, prev(close, p1))', dir: 'up' }, { name: 'マイナスに変わる', expr: 'crossunder(close, prev(close, p1))', dir: 'down' }] },
  { name: '2週間の暗号資産モメンタム', desc: '過去14本(日足で2週間)の値上がり率がプラスに変わったら買い、マイナスに変わったら手じまう。Liu・Tsyvinski(2021)と Dobrynskaya(2023)は、暗号資産では2〜4週の流れが続きやすく、1か月を超えると反転しやすいと報告しています(どちらも多くの銘柄を比べた研究で、1銘柄の売買の成績ではありません)。日足で使う想定です(1時間足なら 336 本)。', overlay: true,
    inputs: [{ label: '何本前と比べるか', def: 14 }],
    lines: [{ name: 'n本前の終値', expr: 'prev(close, p1)', color: '#e67e22' }],
    marks: [{ name: 'プラスに変わる', expr: 'crossover(close, prev(close, p1))', dir: 'up' }, { name: 'マイナスに変わる', expr: 'crossunder(close, prev(close, p1))', dir: 'down' }] },
  { name: '終値と10日平均線(Han・Yang・Zhou)', desc: '終値が10本の単純移動平均線を上に抜けたら買い、下に抜けたら手じまう。Han・Yang・Zhou(2013)は、値動きの大きい株のグループで、この10日の平均線の規則が持ち続けるより良かったと報告しています。Zakamulin は、こうした平均線の規則の良い成績の多くは、計算の誤り(先読み)を除くと消えると指摘しています。', overlay: true,
    inputs: [{ label: '平均線の期間', def: 10 }],
    lines: [{ name: '平均', expr: 'sma(close, p1)', color: '#2f80ed' }],
    marks: [{ name: '上抜け', expr: 'crossover(close, sma(close, p1))', dir: 'up' }, { name: '下抜け', expr: 'crossunder(close, sma(close, p1))', dir: 'down' }] },
];
RULES.forEach(r => { r.hist = ''; r.bands = []; });
function openRules() {
  bt.ind = null; bt.rule = Math.max(0, bt.rule | 0);
  bt.side = 'long'; bt.exit = 'signal';
  $('btOverlay').hidden = false;
  renderBacktest();
  $('btClose').focus();
}
// いま選んでいるルールの合図を、読み込んである足で計算する
function ruleMarks() {
  const def = RULES[bt.rule], made = GT.makeCustom(def), p = {};
  made.params.forEach(q => { p[q.key] = q.def; });
  return made.compute(state.bars, p).marks;
}
function openBacktest(ind) {
  bt.ind = ind; bt.rule = -1;
  $('btOverlay').hidden = false;
  if (!ind.out) recompute(); // 隠しているインジケーターは計算を省いているので、ここで計算する
  const marks = (ind.out && ind.out.marks) || [];
  const hasUp = marks.some(m => m.dir === 'up'), hasDown = marks.some(m => m.dir === 'down');
  bt.side = hasUp ? 'long' : 'short';
  bt.exit = hasUp && hasDown ? 'signal' : 'bars';
  renderBacktest();
  $('btClose').focus();
}
function renderBacktest() {
  const ind = bt.ind, body = $('btBody');
  const byRule = bt.rule >= 0 && !ind;
  if (!byRule && (!ind || !state.indicators.includes(ind) || !ind.out || !ind.out.marks)) { $('btOverlay').hidden = true; return; }
  if (!state.bars.length) { $('btOverlay').hidden = true; toast('チャートの読み込みが終わってから、もう一度お試しください。'); return; }
  const marks = byRule ? ruleMarks() : ind.out.marks, bars = state.bars;
  const hasUp = marks.some(m => m.dir === 'up'), hasDown = marks.some(m => m.dir === 'down');
  const r = GT.backtest(bars, marks, { side: bt.side, exit: bt.side === 'both' ? 'signal' : bt.exit, hold: bt.hold, fee: FEE, slip: state.btSlip / 100, sl: bt.sl / 100, tp: bt.tp / 100 });
  const iv = INTERVALS.find(x => x.id === state.interval);
  $('btTitle').textContent = byRule ? '売買ルールを過去データで試す' : `「${IND_TYPES[ind.type].name}」の合図で売買していたら`;
  body.textContent = '';
  const add = (...nodes) => nodes.forEach(nd => body.appendChild(nd));
  if (byRule) {
    const def = RULES[bt.rule];
    const sel = el('select', { class: 'ctl', id: 'btRule', 'aria-label': '売買ルール' }, RULES.map((r, i) => el('option', { value: String(i), text: r.name })));
    sel.value = String(bt.rule);
    sel.addEventListener('change', () => { bt.rule = +sel.value; bt.side = 'long'; bt.exit = 'signal'; renderBacktest(); });
    const addBtn = el('button', { class: 'ctl btn', type: 'button', id: 'btAdd', text: 'チャートに出す' });
    addBtn.addEventListener('click', () => {
      // 自作インジケーターとして登録する。数値や式は、あとから自由に変えられる
      if (state.indicators.length >= 30) { toast('インジケーターは30個までです。使っていないものを削除してから追加してください。'); return; }
      // 同じ内容のものをすでに登録していれば、それを使う(押すたびに同じものが増えないように)
      const same = cleanCustom(Object.assign({}, def, { id: '' })), sameText = same ? customToText(same) : '';
      const made = customDefs.find(d => customToText(d) === sameText) || registerCustom(Object.assign({}, def, { id: '' }));
      if (!made) { toast(`自分で作れるのは${CUSTOM_MAX}個までです。使っていないものを削除してください。`); return; }
      addIndicator(made.id);
      $('btOverlay').hidden = true;
      toast(`「${def.name}」をチャートに追加しました。⚙ から数値を変えたり、式を編集したりできます。`);
    });
    add(el('div', { class: 'bt-rule' }, [el('label', { class: 'bt-ctl' }, [el('span', { class: 'dim', text: '売買ルール' }), sel]), addBtn]));
    add(el('p', { class: 'small', text: `${def.desc} 設定: ${def.inputs.map(q => `${q.label} ${q.def}`).join('、')}(「チャートに出す」と、数値を変えて試せます)` }));
  }
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
  const pctBox = (label, key, hint) => {
    const num = el('input', { class: 'ctl', type: 'number', min: '0', max: key === 'sl' ? '99' : '1000', step: '0.1', inputmode: 'decimal', placeholder: 'なし' });
    if (bt[key] > 0) num.value = bt[key];
    num.addEventListener('change', () => { const v = parseFloat(num.value); bt[key] = v > 0 ? clamp(v, 0.01, key === 'sl' ? 99 : 1000) : 0; renderBacktest(); });
    return el('label', { class: 'bt-ctl' }, [el('span', { class: 'dim', text: label }), num]);
  };
  ctl.appendChild(pctBox('損切り(入った価格から何%不利に動いたら)', 'sl'));
  ctl.appendChild(pctBox('利確(何%有利に動いたら)', 'tp'));
  {
    // すべり:注文した価格より、少し不利な価格で約定すること。入るときも出るときも、毎回この割合だけ不利にする
    const num = el('input', { class: 'ctl', type: 'number', min: '0', max: '5', step: '0.01', inputmode: 'decimal', id: 'btSlip' });
    num.value = state.btSlip;
    num.addEventListener('change', () => { const v = parseFloat(num.value); state.btSlip = isFinite(v) && v >= 0 ? clamp(v, 0, 5) : 0.05; save(); renderBacktest(); });
    ctl.appendChild(el('label', { class: 'bt-ctl' }, [el('span', { class: 'dim', text: `すべり(片道 %。手数料 ${(FEE * 100).toFixed(1)}% とは別)` }), num]));
  }
  add(ctl);
  add(el('p', { class: 'dim small', text: `${labelOf(state.symbol)}・${iv ? iv.label : ''}足・${bars.length}本(${fmtDate(bars[0].t)} 〜 ${fmtDate(bars[bars.length - 1].t)})で計算。合図が出た足の「次の足の始値」で売買し、売買のたびに手数料 ${(FEE * 100).toFixed(1)}% とすべり ${state.btSlip}% を不利な側に引いています。「持ち続けた場合」も、同じ最初の足の始値で買い、同じ最後の足の終値で売ったとして、同じ手数料とすべりを引いています。最後に手じまっていない売買も、最後の足の終値で手じまったとして計算しています。` }));

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
    kpi('勝率', r.n ? `${(r.wins / r.n * 100).toFixed(0)}%` : '—', '', `売買 ${r.n} 回(勝ち ${r.wins}・負け ${r.losses})` + (bt.sl > 0 || bt.tp > 0 ? `。うち損切り ${r.nSl} 回・利確 ${r.nTp} 回` : '')),
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
  if (r.open) warn.push(`最後の売買は、まだ手じまいしていません(いま手じまうと ${pct(r.open.ret, true)}。手数料・すべり込み)。損益には入れていますが、勝率には数えていません。`);
  if (bt.sl > 0 && bt.tp > 0) warn.push('1本の足の中で損切りと利確の両方に届いた場合は、どちらが先か分からないため、損切りが先だったとして計算しています(成績を良く見せないため)。');
  warn.push('これは過去の値動きに当てはめた結果で、これからも同じようになることを示すものではありません。成績が良くなるまで式や数値を調整すると、過去にたまたま合っただけの設定になりやすくなります。別の銘柄や時間足でも試して、同じ傾向が出るかを確かめてください。');
  warn.push('実際の売買では、注文が思った価格で通らないこと(すべり)があり、成績はここより悪くなるのがふつうです。');
  add(el('ul', { class: 'bt-notes' }, warn.map(t => el('li', { text: t }))));
  // 偶然でも出せる成績かどうか:でたらめな時点で同じように売買した場合と比べる
  if (r.n >= 1) {
    add(el('h3', { text: 'たまたまではないか(でたらめに売買した場合と比べる)' }));
    const box = el('p', { class: 'small', id: 'btLuck', text: '計算しています…' });
    add(box);
    luckTest(bars, r, box);
  }

  renderBtStats(add, kpi, r, bars, iv, marks, byRule);
  if (r.trades.length) {
    add(el('h3', { text: `売買の記録(新しい順・${Math.min(50, r.trades.length)}件まで)` }));
    // スマホでも横にずらさず読めるよう、大事な「損益」と「理由」を左に置く
    const rows = r.trades.slice(-50).reverse().map(t => el('tr', {}, [
      el('td', { text: t.dir > 0 ? '買い' : '売り' }), el('td', { class: cls(t.ret), text: pct(t.ret, true) }),
      el('td', { text: t.why === 'liq' ? '資金がゼロ' : t.why === 'sl' ? '損切り' : t.why === 'tp' ? '利確' : r.exitMode === 'signal' ? '合図' : '本数' }),
      el('td', { text: fmtDate(t.t0, iv && iv.ms < 86400000) }), el('td', { text: fmtPrice(t.p0) }),
      el('td', { text: fmtDate(t.t1, iv && iv.ms < 86400000) }), el('td', { text: fmtPrice(t.p1) }), el('td', { text: `${t.bars}本` }),
    ]));
    add(el('div', { class: 'tbl-wrap' }, [el('table', { class: 'tbl' }, [
      el('thead', {}, [el('tr', {}, ['向き', '損益', '理由', '入った日', '価格', '手じまい', '価格', '期間'].map(t => el('th', { text: t })))]), el('tbody', {}, rows)])]));
  }
  drawBtCurve(cv, r);
}
/* 成績の読み方(統計の目安)。式は indicators.js の stats にまとめてある(Node でも確かめられる)。
 * 試した回数 N:この画面を開いてから(ページを読み込み直すまで)、同じ銘柄・時間足で試した「ルール・数値・設定」の組み合わせの数。
 * 同じ組み合わせは何度試しても1回と数える。たくさん試すほど、いちばん良い結果は偶然でも良く見えるので、そのぶん割り引く(DSR) */
const btTrials = new Map(); // `銘柄|時間足` → Map(組み合わせ → 1本あたりの SR)
function renderBtStats(add, kpi, r, bars, iv, marks, byRule) {
  const S = GT.stats, bpy = S.barsPerYear(iv ? iv.ms * iv.group : NaN);
  if (!(bpy > 0) || bars.length < 30) return;
  const gross = GT.backtest(bars, marks, { side: bt.side, exit: bt.side === 'both' ? 'signal' : bt.exit, hold: bt.hold, fee: 0, slip: 0, sl: bt.sl / 100, tp: bt.tp / 100 });
  const st = S.btStats(r, bpy, gross);
  const what = byRule ? `rule:${bt.rule}` : `ind:${bt.ind.type}:${JSON.stringify(bt.ind.p, (k, v) => (k === 'vis' || k === 'alert' ? undefined : v))}`;
  const key = [what, bt.side, r.exitMode, r.exitMode === 'bars' ? bt.hold : '', bt.sl, bt.tp, state.btSlip].join('|');
  const bucket = `${state.symbol}|${state.interval}`;
  if (!btTrials.has(bucket)) btTrials.set(bucket, new Map());
  const tries = btTrials.get(bucket);
  if (isFinite(st.sr)) tries.set(key, st.sr);
  const N = Math.max(1, tries.size), srs = [...tries.values()];
  // V:試した結果の SR のばらつき。5回以上試していれば、その実際のばらつきを使う。少ないうちは「本当は差がない」場合のばらつき 1/(n−1)
  let V = 1 / (st.n - 1), vFrom = '本当の差がない場合のばらつき 1/(本数−1)';
  if (srs.length >= 5) {
    const m = srs.reduce((a, x) => a + x, 0) / srs.length, v = srs.reduce((a, x) => a + (x - m) * (x - m), 0) / (srs.length - 1);
    if (v > 0) { V = v; vFrom = `試した ${srs.length} 通りの結果のばらつき`; }
  }
  const d = S.dsr(st.sr, st.n, st.skew, st.kurt, N, V);
  const f2 = v => (isFinite(v) ? v.toFixed(2) : '—'), pc = v => (isFinite(v) ? `${(v * 100).toFixed(1)}%` : '—');
  const yrs = v => (isFinite(v) ? (v >= 1 ? `約 ${v.toFixed(1)} 年` : `約 ${Math.max(1, Math.round(v * 365))} 日`) : '—');
  add(el('h3', { text: '成績の読み方(条件つきの目安)' }));
  add(el('p', { class: 'small', text: `足1本ごとの資金の増減から計算しています(1年 = ${Math.round(bpy).toLocaleString()} 本。暗号資産は土日も動くので 365 日で数えます)。` +
    'どれも「毎回の値動きが互いに無関係で、性質が時間で変わらない」とした場合の目安です。実際の値動きは、荒れる時期と静かな時期がかたまって来るので、目安は甘めに出ます。もうかる確率ではありません。' }));
  const enough = st.n >= st.minTRL;
  const trl = el('div', { class: 'kpi' }, [el('span', { class: 'dim', text: '必要なデータの長さ(MinTRL)' }),
    el('strong', { text: isFinite(st.minTRL) ? `${Math.ceil(st.minTRL).toLocaleString()} 本` : '—' }),
    el('small', { text: isFinite(st.minTRL) ? `${yrs(st.minTRL / bpy)}。いまは ${st.n.toLocaleString()} 本(${yrs(st.years)})。この本数がないと、95% の確かさで「SR が 0 より上」とは言えない(Bailey・López de Prado 2012)` : 'SR が 0 以下なので、データをどれだけ増やしても「0 より上」とは言えません' })]);
  if (!enough && isFinite(st.minTRL)) trl.querySelector('strong').appendChild(el('span', { class: 'bt-badge', text: 'データが足りない' }));
  add(el('div', { class: 'kpis', id: 'btStats' }, [
    kpi('シャープレシオ(年率)', f2(st.srAnn), '', '平均の増え方 ÷ ばらつき。1本あたりの値 × √(1年の本数)。売買のない足も 0 として入る'),
    kpi('ソルティノレシオ(年率)', f2(st.sortinoAnn), '', '下がる方向のばらつきだけで割ったもの(目標 0)'),
    kpi('PSR(0 と比べて)', pc(st.psr0), '', `本数 ${st.n.toLocaleString()}・ゆがみ ${f2(st.skew)}・とがり ${f2(st.kurt)} から見た「SR が 0 より上」の確からしさ(Bailey・López de Prado 2012)`),
    kpi(`DSR(試した回数 N = ${N})`, pc(d.dsr), '', `${N} 通り試したことを割り引いた PSR(Bailey・López de Prado 2014)。比べる基準 SR0 = ${f2(d.sr0 * Math.sqrt(bpy))}(年率)。ばらつきは${vFrom}。試した組み合わせが似ていると、割り引きすぎになります`),
    trl,
    kpi('t 値', f2(st.tstat), st.tstat < 3 ? 'down' : '', st.tstat < 3 ? '3 より小さい。たくさんの手法が試されてきたので、3 以上でないと偶然と区別しにくい(Harvey・Liu・Zhu 2016)' : '3 以上(Harvey・Liu・Zhu 2016 の目安)。それでも、試した回数が多ければ偶然はありえます'),
    kpi('損益が 0 になる片道のコスト', isFinite(st.breakEven) ? (st.breakEven > 0 ? `${(st.breakEven * 100).toFixed(3)}%` : 'なし') : '—', '',
      st.breakEven > 0 ? `手数料とすべりを合わせて、1回の売買(片道)でこの割合を超えると、損益がマイナスになります。いまの設定は ${((FEE + state.btSlip / 100) * 100).toFixed(3)}%` : '手数料・すべりが 0 でも、損益がプラスになりません'),
    kpi('1年あたりの売買の回数', isFinite(st.tradesPerYear) ? st.tradesPerYear.toFixed(1) : '—', '', `コストが、コストを引く前の利益に占める割合: ${isFinite(st.costShare) ? pc(st.costShare) : 'コストを引く前も利益なし'}。回数の多い手法ほど、コストで利益が消えやすい(Novy-Marx・Velikov 2016)`),
  ]));
  const btl = S.minBTL(N, 1);
  if (N > 1) add(el('p', { class: 'dim small', text: `${N} 通り試した場合、本当は何の力もない手法でも、いちばん良いものは偶然で年率 SR 1 くらいに見えることがあります。それを避けるには、${yrs(btl)}以上のデータが目安です(MinBTL、Bailey ら 2014)。いまのデータは ${yrs(st.years)}。` }));
  else add(el('p', { class: 'dim small', text: '試した回数 N は、ルールや数値、入り方・手じまい・損切り・利確・すべりを変えて試すたびに増えます(同じ組み合わせは1回)。ページを読み込み直すと 0 に戻ります。' }));
}
/* 「たまたま」の確かめ。同じ回数・同じ向き・同じ保有期間の売買を、でたらめな時点で始めた場合を LUCK_RUNS 回作り、
 * 合図どおりの成績が、その中で上から何%に入るかを出す。
 * でたらめな売買は、始値で入り、決めた本数後の始値で出る(損切り・利確は使わない)。手数料とすべりは同じだけ引く。
 * 乱数は決まった種から作るので、同じ条件なら毎回同じ結果になる。画面が固まらないよう、少しずつ計算する */
const LUCK_RUNS = 500;
let luckToken = 0;
const luckCache = { key: '', html: null };
function luckTest(bars, r, box) {
  const token = ++luckToken, n = bars.length;
  const list = r.trades.map(t => ({ dir: t.dir, len: Math.max(1, t.bars) }));
  const key = `${state.symbol}|${state.interval}|${n}|${n ? bars[n - 1].t : 0}|${r.total}|${r.fee}|${r.slip}|${list.length}`;
  if (luckCache.key === key && luckCache.text) { box.textContent = luckCache.text; return; }
  const span = (n - 1) - 1, used = list.reduce((a, t) => a + t.len, 0), free = span - used;
  if (free < 0 || n < 3) { box.textContent = '売買している期間が長すぎて、でたらめな時点に置きかえられないため、比べられません。'; return; }
  // 決まった種から作る乱数(mulberry32)
  let seed = (n * 2654435761 + list.length * 40503 + Math.round((bars[0].t || 0) / 6e4)) >>> 0;
  const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const fee = r.fee, slip = r.slip;
  const tradeRet = (dir, i0, i1) => {
    const e = bars[i0].o * (1 + dir * slip), x = bars[i1].o * (1 - dir * slip);
    if (!(e > 0)) return 0;
    return Math.max(0, dir > 0 ? x / e : 2 - x / e) * (1 - fee) * (1 - fee) - 1;
  };
  const one = () => {
    // 並び順を混ぜ、空いている本数を、売買の前後にでたらめに配る
    const order = list.slice();
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const cuts = Array.from({ length: order.length }, () => Math.floor(rnd() * (free + 1))).sort((a, b) => a - b);
    let pos = 1, prev = 0, eq = 1, sum = 0;
    order.forEach((t, k) => {
      pos += cuts[k] - prev; prev = cuts[k];
      const ret = eq > 0 ? tradeRet(t.dir, pos, pos + t.len) : -1;
      eq *= 1 + ret; sum += ret; pos += t.len;
    });
    return { total: eq - 1, avg: sum / order.length };
  };
  // 比べる相手:手じまった売買だけの成績(でたらめな売買も、手じまった分だけなので)
  const mine = r.trades.reduce((a, t) => a * (1 + t.ret), 1) - 1, mineAvg = r.avgRet;
  const res = [];
  const step = () => {
    if (token !== luckToken) return; // 条件が変わった
    for (let k = 0; k < 100 && res.length < LUCK_RUNS; k++) res.push(one());
    if (res.length < LUCK_RUNS) { box.textContent = `計算しています… ${res.length} / ${LUCK_RUNS} 回`; setTimeout(step, 0); return; }
    const below = (arr, v) => arr.filter(x => x < v).length / arr.length * 100;
    const pTot = below(res.map(x => x.total), mine), pAvg = below(res.map(x => x.avg), mineAvg);
    const verdict = pTot >= 95 ? 'でたらめな売買ではめったに出ない成績です。ただし、条件を何度も調整した結果なら、たまたまの可能性は残ります。'
      : pTot >= 75 ? 'でたらめな売買より良い方ですが、偶然でも十分に起こる範囲です。'
      : pTot >= 25 ? 'でたらめに売買したのと、ほとんど変わりません。合図に意味があるとは言えません。'
      : 'でたらめに売買したより悪い成績です。';
    const text = `同じ回数(${list.length} 回)・同じ向き・同じ保有本数の売買を、でたらめな時点で始めた場合を ${LUCK_RUNS} 通り作って比べました。` +
      `合図どおりの成績(手じまった売買だけで ${(mine * 100).toFixed(2)}%)は、でたらめな売買の ${pTot.toFixed(0)}% より良く、` +
      `1回あたりの平均(${(mineAvg * 100).toFixed(2)}%)は ${pAvg.toFixed(0)}% より良い結果でした。${verdict}`;
    luckCache.key = key; luckCache.text = text;
    if (box.isConnected) box.textContent = text;
  };
  setTimeout(step, 0);
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

// ---------------------------------------------------------------- リプレイ(過去の値動きを1本ずつ再生する)
function startReplay(i) {
  const all = state.allBars || state.bars;
  if (all.length < 20) return;
  i = clamp(Math.round(i), 10, all.length - 2);
  state.replay = { t: all[i].t, playing: false, speed: 1, timer: 0 };
  setBars(state.raw, false);
  state.end = state.bars.length + Math.max(8, Math.floor(plotW() / state.barW * 0.3)); // 右に、これから出てくる足のための空きを作る
  renderReplay(); renderTrade(); draw();
}
function stepReplay() {
  const r = state.replay, all = state.allBars || [];
  if (!r) return;
  const n = state.bars.length;
  if (n >= all.length) { playReplay(false); toast('最新の足まで再生しました。「終了」で、ふつうの表示に戻ります。'); return; }
  const follow = state.end >= n - 0.01;
  r.t = all[n].t;
  setBars(state.raw, false);
  if (follow && state.end < state.bars.length + 3) state.end += 1;
  renderReplay(); draw();
}
function playReplay(on) {
  const r = state.replay;
  if (!r) return;
  clearInterval(r.timer); r.timer = 0; r.playing = !!on;
  if (on) r.timer = setInterval(stepReplay, 1000 / r.speed);
  renderReplay();
}
function stopReplay(silent) {
  const r = state.replay;
  if (!r) return;
  clearInterval(r.timer);
  state.replay = null;
  if (!silent) { setBars(state.raw, false); state.end = state.bars.length + 5; renderTrade(); draw(); }
  renderReplay();
}
function renderReplay() {
  const box = $('replayBar'), r = state.replay;
  box.hidden = !r;
  if (!r) return;
  const last = state.bars[state.bars.length - 1];
  $('rpText').textContent = `リプレイ中 ${fmtDate(last.t, curInterval().ms < 864e5)}`;
  $('rpPlay').textContent = r.playing ? '⏸ 止める' : '▶ 再生';
  $('rpPlay').setAttribute('aria-pressed', String(r.playing));
  $('rpSpeed').value = String(r.speed);
}
// Ctrl + Z(Mac は ⌘ + Z)で、線の変更をひとつ戻す。文字を入力している最中は、入力欄の「元に戻す」を優先する
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '')) return;
  e.preventDefault(); undoDraw();
});
function bindReplay() {
  $('rpPlay').addEventListener('click', () => playReplay(!state.replay.playing));
  $('rpStep').addEventListener('click', () => { playReplay(false); stepReplay(); });
  $('rpSpeed').addEventListener('change', () => { const r = state.replay; if (!r) return; r.speed = clamp(parseFloat($('rpSpeed').value) || 1, 0.5, 20); if (r.playing) playReplay(true); });
  $('rpStop').addEventListener('click', () => stopReplay(false));
}

// ---------------------------------------------------------------- 表示する期間(1日・5日・1ヶ月 … すべて)と、時計
// [id, 表示名, 使う時間足, さかのぼる日数(0 = すべて、-1 = 今年の初めから)]
const RANGES = [['1d', '1日', '5m', 1], ['5d', '5日', '30m', 5], ['1m', '1ヶ月', '1h', 30], ['3m', '3ヶ月', '4h', 91], ['6m', '6ヶ月', '1d', 182],
  ['ytd', '年初来', '1d', -1], ['1y', '1年', '1d', 365], ['5y', '5年', '1w', 1826], ['all', 'すべて', '1M', 0]];
function applyRange() {
  const r = RANGES.find(x => x[0] === state.pendingRange), bars = state.bars;
  state.pendingRange = null;
  if (!r || !bars.length) return;
  const now = bars[bars.length - 1].t;
  const from = r[3] === 0 ? -Infinity : r[3] < 0 ? Date.UTC(new Date(now).getUTCFullYear(), 0, 1) : now - r[3] * 864e5;
  let k = 0;
  for (let i = bars.length - 1; i >= 0 && bars[i].t >= from; i--) k++;
  k = Math.max(k, 5);
  state.barW = clamp(plotW() / (k + 4), 1.5, 60);
  state.end = bars.length + 3;
  draw();
}
function bindRange() {
  const bar = $('rangeBtns');
  RANGES.forEach(([id, label, iv]) => {
    const b = el('button', { type: 'button', text: label, title: `直近の${label}を表示(${(INTERVALS.find(x => x.id === iv) || {}).label}足)` });
    b.addEventListener('click', () => {
      state.pendingRange = id;
      if (state.interval === iv) { applyRange(); return; }
      // 期間に合った時間足に切りかえる(読み込みが終わったら、その期間が画面に収まるように合わせる)
      const btn = [...$('intervals').children][INTERVALS.findIndex(x => x.id === iv)];
      if (btn) btn.click(); else state.pendingRange = null;
    });
    bar.appendChild(b);
  });
  // 時計:この端末の時刻と、協定世界時からのずれ
  const tick = () => {
    const d = new Date(tnow()), off = -d.getTimezoneOffset(), h = Math.trunc(off / 60), m = Math.abs(off % 60);
    setTxt('clock', `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())} UTC${off >= 0 ? '+' : '-'}${Math.abs(h)}${m ? ':' + pad2(m) : ''}`);
  };
  tick(); setInterval(tick, 1000);
}

// ---------------------------------------------------------------- 文字入力のキーボード(スマホ)
/* スマホでキーボードが出ると、画面の下半分が隠れる。下から出すシート(注文画面・設定)が
 * キーボードの下に隠れないよう、見えている範囲の高さと、キーボードの高さを CSS に伝える */
function fitKeyboard() {
  const vv = window.visualViewport, root = document.documentElement;
  if (!vv) return;
  const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  // ピンチで拡大しているとき(scale が 1 でない)は、キーボードではないので動かさない
  const on = kb > 80 && Math.abs(vv.scale - 1) < 0.01;
  root.style.setProperty('--kb', on ? `${Math.round(kb)}px` : '0px');
  root.style.setProperty('--vvh', `${Math.round(on ? vv.height : window.innerHeight)}px`);
  root.classList.toggle('kb-open', on);
  // 入力中の欄が隠れていたら、見える位置まで寄せる
  const f = document.activeElement;
  if (on && f && /^(INPUT|TEXTAREA|SELECT)$/.test(f.tagName) && f.scrollIntoView) setTimeout(() => f.scrollIntoView({ block: 'nearest' }), 50);
}
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', fitKeyboard);
  window.visualViewport.addEventListener('scroll', fitKeyboard);
  fitKeyboard();
}

// ---------------------------------------------------------------- 起動
load();
buildTopbar();
bindTrade();
bindMaker();
bindReplay();
bindRange();
bindTour();
bindBacktest();
bindHelp();
bindPointer();
new ResizeObserver(resize).observe(wrap);
resize();
loadData();
setInterval(poll, 2000);          // 配信が止まったときの代わり(届いている間は何もしない)
setInterval(pollPositions, 5000); // いま見ていない銘柄のポジション・指値注文
setInterval(() => {
  if (document.hidden) return;
  if (!dlg.ind) draw();   // 残り時間の表示を進める
  renderQuote();          // 気配値が古くなったら、表示を消す
  renderRate();           // 1秒間に受け取った件数
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
