/* 教科書ページの動き(もくじ、文字サイズ、続きから読む など) */
(() => {
  // 公開ページが他のサイトの中に埋め込まれて、操作を誘導されるのを防ぐ
  if (window.top !== window.self && /\.github\.io$/.test(location.hostname)) { document.documentElement.hidden = true; return; }
  const $ = id => document.getElementById(id);
  // 教科書と操作マニュアルで同じ仕組みを使う。読んでいた場所は、ページごとに別々に覚える
  const CHART_KEY = 'gold-trade-chart-v1', KEY = document.documentElement.dataset.key === 'manual' ? 'gold-trade-manual-v1' : 'gold-trade-guide-v1';
  const PAGE_TITLE = document.documentElement.dataset.title || 'トレードの教科書';
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
    // いま画面のいちばん上に見えている段落や見出しを目印にする(遠くの見出しを目印にすると、大きくずれる)
    const blocks = document.querySelectorAll('main h2, main h3, main h4, main p, main li, main tr, main figure');
    let anchor = null;
    for (const b of blocks) { const r = b.getBoundingClientRect(); if (r.bottom > 64 && r.height > 0) { anchor = b; break; } }
    const before = anchor ? anchor.getBoundingClientRect().top : 0;
    fs = (fs + 1) % 3; applyFs();
    // 文字の並べ直しは少し遅れて終わるので、落ち着いてから元の位置に合わせ直す
    const fix = () => { if (anchor) window.scrollBy({ top: anchor.getBoundingClientRect().top - before, behavior: 'instant' }); };
    markTables();
    // 表の印の付け直しなどで、少しあとにも高さが変わる。しばらくの間、何度か合わせ直す(その間に自分で動かしたら、やめる)
    let stop = false;
    const cancel = () => { stop = true; };
    ['wheel', 'touchstart', 'keydown'].forEach(ev => window.addEventListener(ev, cancel, { once: true, passive: true }));
    fix();
    [0, 60, 150, 300, 600].forEach(ms => setTimeout(() => requestAnimationFrame(() => { if (!stop) fix(); }), ms));
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
    for (const it of items) { if (it.el.getBoundingClientRect().top <= 134) cur = it; else break; /* もくじから飛ぶと、見出しは上から約124pxに来る */ }
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
    where.textContent = chapter ? chapter.label : PAGE_TITLE;
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

  // ---- 章ごとの、読むのにかかる時間の目安(日本語の文章を1分に約500文字として計算)
  const chapters = items.filter(it => it.isChapter);
  chapters.forEach(it => {
    let n = 0;
    for (let el = it.el.nextElementSibling; el && el.tagName !== 'H2' && el.tagName !== 'FOOTER'; el = el.nextElementSibling) n += el.textContent.replace(/\s+/g, '').length;
    it.mins = Math.max(1, Math.round(n / 500));
    const m = document.createElement('span');
    m.className = 'mins'; m.textContent = `約${it.mins}分`;
    it.a.appendChild(m);
  });
  // 「最初に読む道すじ」の各行にも、リンク先の節の長さから目安を出す
  document.querySelectorAll('.path a[href^="#"]').forEach(a => {
    const head = document.getElementById(a.getAttribute('href').slice(1));
    if (!head || a.dataset.nomin !== undefined) return;
    const stop = head.tagName === 'H2' ? ['H2'] : head.tagName === 'H3' ? ['H2', 'H3'] : ['H2', 'H3', 'H4'];
    let n = 0;
    for (let el = head.nextElementSibling; el && !stop.includes(el.tagName) && el.tagName !== 'FOOTER'; el = el.nextElementSibling) n += el.textContent.replace(/\s+/g, '').length;
    const m = document.createElement('span');
    m.className = 'mins'; m.textContent = `約${Math.max(1, Math.round(n / 500))}分`;
    a.after(m);
  });

  // ---- 確認問題(選ぶと、その場で答えと解説が出る。結果はこの端末に覚えておく)
  const quizSaved = prefs.quiz && typeof prefs.quiz === 'object' ? prefs.quiz : {};
  const navMark = (id, text) => {
    const it = items.find(x => x.el.id === id);
    if (!it) return;
    let m = it.a.querySelector('.mins');
    if (!m) { m = document.createElement('span'); m.className = 'mins'; it.a.appendChild(m); }
    m.textContent = text;
  };
  document.querySelectorAll('.quiz').forEach(qz => {
    qz.classList.add('js');
    const head = qz.querySelector('h3[id]'), id = head ? head.id : '';
    const qs = [...qz.querySelectorAll('.q')], res = qz.querySelector('.qres'), again = qz.querySelector('.qagain');
    let right = 0, done = 0;
    const report = () => {
      if (done < qs.length) { res.textContent = done ? `${qs.length}問中 ${done}問まで答えました` : ''; again.hidden = true; return; }
      res.textContent = `${qs.length}問中 ${right}問 正解` + (right === qs.length ? '。全問正解です' : '。まちがえた問題は、解説のリンクから読み直せます');
      again.hidden = false;
      quizSaved[id] = { n: qs.length, ok: right }; prefs.quiz = quizSaved; write(KEY, prefs);
      navMark(id, `${right}/${qs.length}`);
    };
    qs.forEach(q => {
      const ans = Number(q.dataset.a), opts = [...q.querySelectorAll('.opt')];
      opts.forEach((b, k) => b.addEventListener('click', () => {
        if (q.classList.contains('done')) return;
        q.classList.add('done');
        opts.forEach((o, j) => { o.disabled = true; if (j === ans) o.classList.add('ok'); });
        if (k !== ans) b.classList.add('ng'); else right++;
        b.setAttribute('aria-pressed', 'true');
        done++;
        report();
      }));
    });
    again.addEventListener('click', () => {
      right = 0; done = 0;
      qs.forEach(q => { q.classList.remove('done'); q.querySelectorAll('.opt').forEach(o => { o.disabled = false; o.classList.remove('ok', 'ng'); o.removeAttribute('aria-pressed'); }); });
      report();
      head.scrollIntoView();
    });
    const old = quizSaved[id];
    if (old && old.n === qs.length) navMark(id, `${old.ok}/${old.n}`);
  });

  markTables();
  onScroll();
})();
