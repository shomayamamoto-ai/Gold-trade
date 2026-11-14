/* 教科書ページの動き(もくじ、文字サイズ、続きから読む など) */
(() => {
  // 公開ページが他のサイトの中に埋め込まれて、操作を誘導されるのを防ぐ
  if (window.top !== window.self && /\.github\.io$/.test(location.hostname)) { document.documentElement.hidden = true; return; }
  const $ = id => document.getElementById(id);
  const CHART_KEY = 'gold-trade-chart-v1', KEY = 'gold-trade-guide-v1';
  const read = k => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { return {}; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 保存できなくても読める */ } };
  const prefs = read(KEY);

  // ---- ライト/ダーク(チャート側の設定と共通)
  const chart = read(CHART_KEY);
  let theme = chart.theme === 'dark' || chart.theme === 'light'
    ? chart.theme
    : (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const applyTheme = () => { document.documentElement.dataset.theme = theme; };
  applyTheme();
  $('themeBtn').addEventListener('click', () => {
    theme = theme === 'light' ? 'dark' : 'light';
    applyTheme();
    const s = read(CHART_KEY); s.theme = theme; write(CHART_KEY, s);
  });

  // ---- 文字の大きさ(3段階)
  let fs = [0, 1, 2].includes(prefs.fs) ? prefs.fs : 0;
  const applyFs = () => { document.documentElement.dataset.fs = fs; };
  applyFs();
  $('fsBtn').addEventListener('click', () => {
    // 読んでいる場所がずれないよう、いちばん上に見えている見出しの位置を保つ
    const anchor = current(), before = anchor ? anchor.el.getBoundingClientRect().top : 0;
    fs = (fs + 1) % 3; applyFs();
    // 文字の並べ直しは少し遅れて終わるので、落ち着いてから元の位置に合わせ直す
    const fix = () => { if (anchor) window.scrollBy({ top: anchor.el.getBoundingClientRect().top - before, behavior: 'instant' }); };
    fix(); requestAnimationFrame(() => { fix(); requestAnimationFrame(fix); });
    markTables();
    prefs.fs = fs; write(KEY, prefs);
  });

  // ---- もくじ(見出しから自動で作る)
  const nav = $('sideNav'), items = [];
  let grp = null;
  document.querySelectorAll('main h2[id], main h3[id], main .card[id]').forEach(el => {
    const isChapter = el.tagName === 'H2';
    const head = el.classList.contains('card') ? el.querySelector('h3') : el;
    const small = head.querySelector('small');
    const label = isChapter
      ? `${small ? small.textContent + ' ' : ''}${[...head.childNodes].filter(n => n !== small).map(n => n.textContent).join('').trim()}`
      : [...head.childNodes].filter(n => n.nodeName !== 'SMALL').map(n => n.textContent).join('').split(' — ')[0].trim();
    const a = document.createElement('a');
    a.href = '#' + el.id; a.textContent = label;
    if (isChapter) {
      grp = document.createElement('div'); grp.className = 'grp';
      const sub = document.createElement('div'); sub.className = 'sub';
      grp.appendChild(a); grp.appendChild(sub); nav.appendChild(grp);
    } else if (grp) grp.lastChild.appendChild(a);
    items.push({ el, a, grp, isChapter, label });
  });

  const side = $('side'), scrim = $('scrim'), tocBtn = $('tocBtn');
  const setDrawer = on => {
    side.classList.toggle('open', on);
    scrim.hidden = !on;
    tocBtn.setAttribute('aria-expanded', String(on));
    if (on) { const cur = nav.querySelector('a.on'); if (cur) cur.scrollIntoView({ block: 'center' }); }
  };
  tocBtn.addEventListener('click', () => setDrawer(!side.classList.contains('open')));
  $('sideClose').addEventListener('click', () => setDrawer(false));
  scrim.addEventListener('click', () => setDrawer(false));
  nav.addEventListener('click', e => { if (e.target.closest('a')) setDrawer(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setDrawer(false); });

  // ---- いま読んでいる場所の表示、進み具合、先頭へ戻る
  function current() {
    let cur = null;
    for (const it of items) { if (it.el.getBoundingClientRect().top <= 90) cur = it; else break; }
    return cur;
  }
  const where = $('where'), progress = $('progress'), toTop = $('toTop');
  let lastId = null, ticking = false;
  function onScroll() {
    ticking = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    progress.style.width = (max > 0 ? Math.min(100, scrollY / max * 100) : 0) + '%';
    toTop.hidden = scrollY < innerHeight * 1.5;
    const cur = current(), id = cur ? cur.el.id : '';
    if (id === lastId) return;
    lastId = id;
    items.forEach(it => { it.a.classList.toggle('on', it === cur); });
    const chapter = cur ? (cur.isChapter ? cur : items.find(it => it.isChapter && it.grp === cur.grp)) : null;
    nav.querySelectorAll('.grp').forEach(gp => gp.classList.toggle('on', !!chapter && gp === chapter.grp));
    if (chapter) chapter.a.classList.add('on');
    where.textContent = chapter ? chapter.label : 'トレードの教科書';
    if (cur && scrollY > innerHeight) { prefs.pos = id; prefs.posLabel = (chapter && chapter !== cur ? chapter.label + ' › ' : '') + cur.label; write(KEY, prefs); }
  }
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  addEventListener('resize', () => { markTables(); onScroll(); });
  toTop.addEventListener('click', () => scrollTo({ top: 0 }));

  // ---- 前回の続きから読む
  // もくじから移動すると URL に #〜 が付く。付いたままだと、次に開いたとき「続きから」を出せないので消しておく
  addEventListener('hashchange', () => {
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  });
  const savedPos = prefs.pos, savedLabel = prefs.posLabel;
  if (!location.hash && savedPos && document.getElementById(savedPos) && savedPos !== items[0].el.id) {
    // ブラウザが自分で前の位置に戻すことがあるので、少し待ってから、まだ離れているときだけ案内する
    setTimeout(() => {
      const target = document.getElementById(savedPos);
      if (Math.abs(target.getBoundingClientRect().top) < innerHeight) return;
      const box = $('resume');
      $('resumeText').textContent = `前回は「${savedLabel || ''}」まで読みました`;
      box.hidden = false;
      const hide = () => { box.hidden = true; };
      $('resumeGo').addEventListener('click', () => { target.scrollIntoView(); hide(); });
      $('resumeNo').addEventListener('click', hide);
      setTimeout(hide, 12000);
    }, 400);
  }

  // ---- 横にはみ出す表に、スクロールできることを示す
  function markTables() {
    document.querySelectorAll('.tbl-wrap').forEach(w => {
      const wide = w.scrollWidth > w.clientWidth + 2;
      w.classList.toggle('wide', wide);
      if (wide) { w.tabIndex = 0; w.setAttribute('role', 'region'); w.setAttribute('aria-label', '横にスクロールできる表'); }
      else w.removeAttribute('tabindex');
    });
  }
  document.querySelectorAll('.tbl-wrap').forEach(w => w.addEventListener('scroll', () => {
    w.classList.toggle('end', w.scrollLeft + w.clientWidth >= w.scrollWidth - 4);
  }, { passive: true }));

  // ---- 印(事実・実測・常識・考え方)の意味を、その場で確かめられるようにする
  const meaning = { '事実': '出典で確認できる内容です', '実測': 'Binance の日足データから筆者が計算した数字です', '常識': '相場の世界で広く知られている一般的な知識です', '考え方': '筆者の整理や推測です。正しいとは限りません' };
  document.querySelectorAll('.tag').forEach(t => { const m = meaning[t.textContent.trim()]; if (m) t.title = m; });

  markTables();
  onScroll();
})();
