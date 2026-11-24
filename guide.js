/* 教科書ページの動き(もくじ、文字サイズ、続きから読む など) */
(() => {
  // 公開ページが他のサイトの中に埋め込まれて、操作を誘導されるのを防ぐ
  if (window.top !== window.self && /\.github\.io$/.test(location.hostname)) { document.documentElement.hidden = true; return; }
  const $ = id => document.getElementById(id);
  // 教科書と操作マニュアルで同じ仕組みを使う。読んでいた場所は、ページごとに別々に覚える
  const CHART_KEY = 'gold-trade-chart-v1', KEY = document.documentElement.dataset.key === 'manual' ? 'gold-trade-manual-v1' : 'gold-trade-guide-v1';
  const PAGE_TITLE = document.documentElement.dataset.title || 'トレードの教科書';
  const read = k => { try { const v = JSON.parse(localStorage.getItem(k)); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (e) { return {}; } }; // 壊れた値は、空として扱う
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
  const meaning = { '事実': '出典で確認できる内容です', '実測': 'Binance の日足データから筆者が計算した数字です', '常識': '相場の世界で広く知られている一般的な知識です', '考え方': '筆者の整理や推測です。正しいとは限りません', '報道': '報道で伝えられている内容です。筆者は一次資料(公的機関や当事者の発表)で確かめられていません' };
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
    if (!/^H[234]$/.test(head.tagName)) n = head.textContent.replace(/\s+/g, '').length; // カード(枠)は、その中身の長さ
    else for (let el = head.nextElementSibling; el && !stop.includes(el.tagName) && el.tagName !== 'FOOTER'; el = el.nextElementSibling) n += el.textContent.replace(/\s+/g, '').length;
    const m = document.createElement('span');
    m.className = 'mins'; m.textContent = `約${Math.max(1, Math.round(n / 500))}分`;
    a.after(m);
  });

  const mk2 = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  // ---- 確認問題(選ぶと、その場で答えと解説が出る。結果はこの端末に覚えておく)
  const quizSaved = prefs.quiz && typeof prefs.quiz === 'object' ? prefs.quiz : {};
  const navMark = (id, text) => {
    const it = items.find(x => x.el.id === id);
    if (!it) return;
    let m = it.a.querySelector('.mins');
    if (!m) { m = document.createElement('span'); m.className = 'mins'; it.a.appendChild(m); }
    m.textContent = text;
  };
  // 1問ごとの結果も覚えておく(まちがえた問題だけ解き直す・進み具合の表示に使う)。鍵は「確認問題の id:何問目」
  const qlog = prefs.qlog && typeof prefs.qlog === 'object' ? prefs.qlog : {};
  // 1問を動くようにする。answered(正解か) は、答えたときに1回だけ呼ばれる
  const wireQ = (q, answered) => {
    const ans = Number(q.dataset.a), opts = [...q.querySelectorAll('.opt')];
    opts.forEach((b, k) => b.addEventListener('click', () => {
      if (q.classList.contains('done')) return;
      q.classList.add('done');
      opts.forEach((o, j) => { o.disabled = true; if (j === ans) o.classList.add('ok'); });
      if (k !== ans) b.classList.add('ng');
      b.setAttribute('aria-pressed', 'true');
      if (q.dataset.key) { qlog[q.dataset.key] = k === ans ? 1 : 0; prefs.qlog = qlog; write(KEY, prefs); }
      answered(k === ans);
      renderLearn(); renderExamInfo(); paintNavMarks();
    }));
  };
  const resetQ = q => { q.classList.remove('done'); q.querySelectorAll('.opt').forEach(o => { o.disabled = false; o.classList.remove('ok', 'ng'); o.removeAttribute('aria-pressed'); }); };
  const chapterQuizzes = [...document.querySelectorAll('.quiz')].filter(qz => qz.querySelector('h3[id]'));
  chapterQuizzes.forEach(qz => {
    qz.classList.add('js');
    const head = qz.querySelector('h3[id]'), id = head.id;
    const qs = [...qz.querySelectorAll('.q')], res = qz.querySelector('.qres'), again = qz.querySelector('.qagain');
    qs.forEach((q, i) => { q.dataset.key = `${id}:${i}`; });
    let right = 0, done = 0;
    const report = () => {
      if (done < qs.length) { res.textContent = done ? `${qs.length}問中 ${done}問まで答えました` : ''; again.hidden = true; return; }
      res.textContent = `${qs.length}問中 ${right}問 正解` + (right === qs.length ? '。全問正解です' : '。まちがえた問題は、解説のリンクから読み直せます');
      again.hidden = false;
      quizSaved[id] = { n: qs.length, ok: right }; prefs.quiz = quizSaved; write(KEY, prefs);
    };
    qs.forEach(q => wireQ(q, ok => { if (ok) right++; done++; report(); }));
    again.addEventListener('click', () => { right = 0; done = 0; qs.forEach(resetQ); report(); head.scrollIntoView(); });
    // 前に全部答えてあれば、その結果を出しておく(選んだ答えまでは覚えていないので、問題は解き直せる状態のまま)
    if (qs.every(q => q.dataset.key in qlog)) { res.textContent = `前回までの結果:${qs.length}問中 ${qs.filter(q => qlog[q.dataset.key] === 1).length}問 正解`; }
  });
  // もくじの印は、1問ごとの最後の答え(章の確認問題・総合テスト・解き直しのどれでも)から出す
  function paintNavMarks() {
    chapterQuizzes.forEach(qz => {
      const qs = [...qz.querySelectorAll('.q')], ans = qs.filter(q => q.dataset.key in qlog).length;
      if (ans) navMark(qz.querySelector('h3[id]').id, `${qs.filter(q => qlog[q.dataset.key] === 1).length}/${qs.length}`);
    });
  }
  paintNavMarks();

  // ---- 総合テスト:各章から1問ずつ出す。まちがえた問題だけを解き直すこともできる
  const examBox = $('examQuiz');
  const allQ = () => chapterQuizzes.flatMap(qz => [...qz.querySelectorAll('.q')]);
  const wrongKeys = () => allQ().filter(q => qlog[q.dataset.key] === 0);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  function startExam(list, title) {
    examBox.textContent = '';
    const wrap = mk2('section', 'quiz js'), res = mk2('p', 'qres'), head = mk2('h3', '', title);
    res.setAttribute('role', 'status'); res.setAttribute('aria-live', 'polite');
    wrap.appendChild(head);
    let right = 0, done = 0;
    list.forEach((src, i) => {
      const q = src.cloneNode(true);
      resetQ(q);
      // 選択肢の順番を入れかえる(位置で覚えてしまわないように)
      const opts = [...q.querySelectorAll('.opt')], ans = opts[Number(q.dataset.a)];
      for (let k = opts.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [opts[k], opts[j]] = [opts[j], opts[k]]; }
      const ex = q.querySelector('.ex');
      opts.forEach(o => q.insertBefore(o, ex));
      q.dataset.a = String(opts.indexOf(ans));
      const qt = q.querySelector('.qt'); qt.textContent = qt.textContent.replace(/^問\d+\.\s*/, `問${i + 1}. `);
      wireQ(q, ok => {
        if (ok) right++; done++;
        if (done < list.length) { res.textContent = `${list.length}問中 ${done}問まで答えました`; return; }
        const pct = Math.round(right / list.length * 100);
        res.textContent = `${list.length}問中 ${right}問 正解(${pct}%)。` + (right === list.length ? '全問正解です。' : 'まちがえた問題は、解説のリンクから本文を読み直してください。');
        if (title.indexOf('総合') === 0) { const pe = prefs.exam && Number.isFinite(prefs.exam.best) && Number.isFinite(prefs.exam.n) ? prefs.exam : null; const best = pe && pe.best > pct ? pe.best : pct; prefs.exam = { last: pct, best, n: (pe ? pe.n : 0) + 1 }; write(KEY, prefs); }
        renderExamInfo(); renderLearn();
      });
      wrap.appendChild(q);
    });
    wrap.appendChild(res);
    examBox.appendChild(wrap);
    head.tabIndex = -1; head.focus({ preventScroll: true }); head.scrollIntoView();
  }
  function renderExamInfo() {
    const info = $('examInfo'), wrongBtn = $('examWrong');
    if (!info) return;
    const w = wrongKeys().length, e = prefs.exam;
    const okE = e && [e.n, e.last, e.best].every(Number.isFinite);
    info.textContent = (okE ? `これまでに ${e.n} 回。前回 ${e.last}%、いちばん良かった回 ${e.best}%。` : 'まだ受けていません。') + (w ? ` まちがえたままの問題が ${w} 問あります。` : '');
    wrongBtn.disabled = !w; wrongBtn.textContent = w ? `まちがえた問題だけ解き直す(${w}問)` : 'まちがえた問題はありません';
  }
  if (examBox) {
    $('examStart').addEventListener('click', () => startExam(chapterQuizzes.map(qz => pick([...qz.querySelectorAll('.q')])), '総合テスト'));
    $('examWrong').addEventListener('click', () => { const w = wrongKeys(); if (w.length) startExam(w, 'まちがえた問題の解き直し'); });
    $('examBox').hidden = false;
    renderExamInfo();
  }

  // ---- 学習の進み具合(読んだ章・確認問題・課題を、ひと目で)
  const seen = prefs.seen && typeof prefs.seen === 'object' ? prefs.seen : {};
  function renderLearn() {
    const box = $('learn');
    if (!box) return;
    const qs = allQ(), okN = qs.filter(q => qlog[q.dataset.key] === 1).length, ansN = qs.filter(q => q.dataset.key in qlog).length;
    const trs = [...document.querySelectorAll('.try[data-id]')], tdone = prefs.tries && typeof prefs.tries === 'object' ? prefs.tries : {};
    const chs = chapters.filter(it => document.getElementById('q-' + it.el.id));
    box.textContent = '';
    const row = (label, n, total, note) => {
      const r = mk2('div', 'learn-row'), bar = mk2('div', 'learn-bar'), fill = mk2('span');
      fill.style.width = (total ? Math.round(n / total * 100) : 0) + '%';
      bar.appendChild(fill);
      r.appendChild(mk2('b', '', label)); r.appendChild(bar); r.appendChild(mk2('span', 'learn-n', `${n} / ${total}${note || ''}`));
      return r;
    };
    box.appendChild(row('読んだ章', chs.filter(it => seen[it.el.id]).length, chs.length));
    box.appendChild(row('確認問題の正解', okN, qs.length, ansN > okN ? `(まちがい ${ansN - okN})` : ''));
    box.appendChild(row('チャートで試す', trs.filter(t => tdone[t.dataset.id]).length, trs.length));
    const list = mk2('div', 'learn-ch');
    chs.forEach(it => {
      const cq = [...document.querySelectorAll(`#q-${it.el.id} ~ .q`)], ok = cq.filter(q => qlog[q.dataset.key] === 1).length;
      const a = mk2('a', seen[it.el.id] ? 'seen' : '', `${it.label.split(' ')[0]} ${ok}/${cq.length}`);
      a.href = '#' + it.el.id; a.title = it.label + (seen[it.el.id] ? '(読んだ)' : '(まだ)');
      list.appendChild(a);
    });
    box.appendChild(list);
  }
  // 章の確認問題まで読み進めたら、その章を「読んだ」ことにする
  if ('IntersectionObserver' in window) {
    // もくじから飛んだときなど、通りすぎただけでは数えない。確認問題の見出しが 1.5 秒見えていたら「読んだ」とする
    const seenTimers = {};
    const io = new IntersectionObserver(es => es.forEach(e => {
      const ch = e.target.id.slice(2);
      clearTimeout(seenTimers[ch]);
      if (!e.isIntersecting || seen[ch]) return;
      seenTimers[ch] = setTimeout(() => { seen[ch] = 1; prefs.seen = seen; write(KEY, prefs); renderLearn(); }, 1500);
    }), { threshold: 0.6 });
    chapterQuizzes.forEach(qz => io.observe(qz.querySelector('h3[id]')));
  }

  // ---- 「チャートで試す」の課題:やってみた印を、この端末に覚えておく
  const tries = [...document.querySelectorAll('.try[data-id]')], tryDone = prefs.tries && typeof prefs.tries === 'object' ? prefs.tries : {};
  const tryCount = () => { const n = $('tryCount'); if (n && tries.length) n.textContent = ` いま ${tries.filter(t => tryDone[t.dataset.id]).length} / ${tries.length} 個。`; };
  tries.forEach(t => {
    const lab = document.createElement('label'), box = document.createElement('input');
    lab.className = 'try-done'; box.type = 'checkbox'; box.checked = !!tryDone[t.dataset.id];
    lab.appendChild(box); lab.appendChild(document.createTextNode('やってみた'));
    t.classList.toggle('done', box.checked);
    box.addEventListener('change', () => {
      if (box.checked) tryDone[t.dataset.id] = 1; else delete tryDone[t.dataset.id];
      t.classList.toggle('done', box.checked);
      prefs.tries = tryDone; write(KEY, prefs); tryCount(); renderLearn();
    });
    t.appendChild(lab);
  });
  tryCount();
  renderLearn();

  // ---- 言葉で探す(このページの中だけを探す。外には何も送らない)
  const bar = document.querySelector('.bar'), fsBtn = $('fsBtn');
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const norm = t => t.replace(/\s+/g, ' ').trim();
  // ひらがな・カタカナ、全角・半角、大文字・小文字の違いを気にせず探せるようにそろえる
  const fold = t => t.normalize('NFKC').toLowerCase().replace(/[−‐‑–—]/g, '-').replace(/[〜～]/g, '~').replace(/[ぁ-ゖ]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60));
  // 漢字の言葉を、よみがなでも探せるようにする(よみ → 本文での書き方)
  const YOMI = [['そんぎり', '損切り'], ['りかく', '利確'], ['できだか', '出来高'], ['いどうへいきん', '移動平均'], ['きたいち', '期待値'], ['しょうりつ', '勝率'], ['そんえきひ', '損益比'], ['しきんかんり', '資金管理'], ['てすうりょう', '手数料'], ['おしめ', '押し目'], ['もどり', '戻り'], ['たかね', '高値'], ['やすね', '安値'], ['おわりね', '終値'], ['はじめね', '始値'], ['ようせん', '陽線'], ['いんせん', '陰線'], ['きんり', '金利'], ['えんだか', '円高'], ['えんやす', '円安'], ['かわせ', '為替'], ['ぜいきん', '税金'], ['かくていしんこく', '確定申告'], ['れんぱい', '連敗'], ['ぶんさん', '分散'], ['あんごうしさん', '暗号資産'], ['かそうつうか', '暗号資産'], ['さきもの', '先物'], ['げんぶつ', '現物'], ['まど', '窓'], ['いた', '板'], ['なりゆき', '成行'], ['さしね', '指値'], ['ぎゃくさしね', '逆指値'], ['ふくみえき', '含み益'], ['ふくみぞん', '含み損'], ['けっさい', '決済'], ['じゅんばり', '順張り'], ['ぎゃくばり', '逆張り'], ['しょうこきん', '証拠金'], ['きょうせいけっさい', '強制決済'], ['せいさん', '清算'], ['はんげんき', '半減期'], ['りゅうどうせい', '流動性'], ['じっしつきんり', '実質金利'], ['たてね', '建値'], ['そうかん', '相関'], ['れんどう', '連動'], ['あんぜんしさん', '安全資産'], ['つうかきょうじゃく', '通貨強弱'], ['はさん', '破産'], ['しんり', '心理'], ['きろく', '記録'], ['しっぱい', '失敗'], ['きん', '金'], ['かぶ', '株'], ['ひげ', 'ヒゲ'], ['じったい', '実体'], ['へいきんあし', '平均足'], ['いちもくきんこうひょう', '一目均衡表'], ['くも', '雲'], ['たいすう', '対数'], ['ひかく', '比較'], ['しゅうまつ', '週末'], ['かちょく', '価格'], ['かかく', '価格'], ['ねうごき', '値動き'], ['ねはば', '値幅'], ['だまし', 'だまし'], ['そうごうてすと', '総合テスト'], ['ようごしゅう', '用語集'], ['しゅってん', '出典']].map(([y, w]) => [fold(y), fold(w)]);
  const variants = w => { const out = [w]; if (w.length >= 2) YOMI.forEach(([y, k]) => { if (y === w || (w.length >= 3 && y.startsWith(w))) out.push(k); }); return out; };
  let findIndex = null;
  function buildIndex() {
    findIndex = [];
    let chap = '', sect = '';
    document.querySelectorAll('main h2, main h3, main h4, main p, main li, main th, main td, main dt, main dd, main summary, main figcaption').forEach(el => {
      // もくじ、総合テストの出題(作り直すたびに変わる)、確認問題の解説(答えが見えてしまう)は探さない
      if (el.closest('.toc, .path, #examQuiz') || el.classList.contains('ex')) return;
      if (el.tagName === 'H2') { chap = norm(el.textContent); sect = ''; }
      else if (el.tagName === 'H3') sect = norm(el.textContent).split(' — ')[0];
      if ((el.tagName === 'LI' || el.tagName === 'DD' || el.tagName === 'TD') && el.querySelector('li, p, table')) return; // 中身を別に数えるので、外側は飛ばす
      const text = norm(el.textContent);
      if (text.length < 2) return;
      findIndex.push({ el, text, key: fold(text), head: /^H[234]$/.test(el.tagName), where: sect && !/^H[23]$/.test(el.tagName) ? `${chap} › ${sect}` : chap });
    });
  }
  const findBtn = mk('button'); findBtn.type = 'button'; findBtn.id = 'findBtn';
  findBtn.setAttribute('aria-label', 'このページの中を言葉で探す'); findBtn.title = 'このページの中を言葉で探す( / キー)'; findBtn.setAttribute('aria-expanded', 'false');
  const NS = 'http://www.w3.org/2000/svg', ico = document.createElementNS(NS, 'svg');
  ico.setAttribute('viewBox', '0 0 16 16'); ico.setAttribute('width', '16'); ico.setAttribute('height', '16'); ico.setAttribute('aria-hidden', 'true');
  [['circle', { cx: 7, cy: 7, r: 4.5, fill: 'none' }], ['path', { d: 'M10.5 10.5L14 14' }]].forEach(([n, at]) => { const e = document.createElementNS(NS, n); Object.keys(at).forEach(k => e.setAttribute(k, at[k])); e.setAttribute('stroke', 'currentColor'); e.setAttribute('stroke-width', '1.6'); e.setAttribute('stroke-linecap', 'round'); ico.appendChild(e); });
  findBtn.appendChild(ico);
  bar.insertBefore(findBtn, fsBtn);
  const findBox = mk('div', 'find'); findBox.hidden = true; findBox.setAttribute('role', 'dialog'); findBox.setAttribute('aria-label', 'このページの中を探す');
  const findIn = mk('input'); findIn.type = 'search'; findIn.placeholder = '言葉で探す(例:損切り 位置)'; findIn.setAttribute('aria-label', '探す言葉'); findIn.autocomplete = 'off'; findIn.enterKeyHint = 'search';
  const findInfo = mk('p', 'find-info'); findInfo.setAttribute('role', 'status'); findInfo.setAttribute('aria-live', 'polite');
  const findOut = mk('div', 'find-out');
  findBox.appendChild(findIn); findBox.appendChild(findInfo); findBox.appendChild(findOut);
  document.body.appendChild(findBox);
  let hitTimer = 0, hitEl = null;
  const jump = el => {
    setFind(false);
    // 表の中のセルなどは、行ごと目立たせる
    const target = el.tagName === 'TD' || el.tagName === 'TH' ? el.parentNode : el;
    // 折りたたまれた中にあるときは、開いてから移動する
    for (let d = el.closest('details'); d; d = d.parentNode.closest ? d.parentNode.closest('details') : null) d.open = true;
    target.scrollIntoView({ block: 'center' });
    if (hitEl) hitEl.classList.remove('hit');
    hitEl = target; target.classList.add('hit');
    clearTimeout(hitTimer); hitTimer = setTimeout(() => target.classList.remove('hit'), 3000);
  };
  function runFind() {
    const words = fold(findIn.value).split(' ').filter(Boolean);
    findOut.textContent = '';
    if (!words.length) { findInfo.textContent = 'スペースで区切ると、すべての言葉を含むところを探します。'; return; }
    if (!findIndex) buildIndex();
    const alts = words.map(variants); // それぞれの言葉について、よみがなから直した書き方も候補にする
    const hits = findIndex.filter(it => alts.every(c => c.some(w => it.key.includes(w))));
    hits.sort((x, y) => (y.head - x.head)); // 見出しを先に。あとは本の順
    findInfo.textContent = hits.length ? `${hits.length}件見つかりました` + (hits.length > 50 ? '(はじめの50件)' : '') : '見つかりませんでした。別の言葉や、短い言葉で試してください。';
    hits.slice(0, 50).forEach(it => {
      const b = mk('button', 'res'); b.type = 'button';
      b.appendChild(mk('small', '', it.where));
      // 最初に見つかった言葉のまわりを抜き出して、その言葉に印を付ける
      const shown = alts.map(c => c.find(w => it.key.includes(w)) || c[0]);
      const at = Math.max(0, it.key.indexOf(shown[0])), from = Math.max(0, at - 24), cut = it.text.slice(from, from + 110), line = mk('span');
      const kcut = fold(cut);
      let pos = 0;
      // 折りたたんだ文字と元の文字は長さが同じとは限らないので、長さが同じときだけ印を付ける
      if (kcut.length === cut.length) {
        const marks = [];
        shown.forEach(w => { for (let i = kcut.indexOf(w); i >= 0; i = kcut.indexOf(w, i + w.length)) marks.push([i, i + w.length]); });
        marks.sort((p, q) => p[0] - q[0]);
        marks.forEach(([p, q]) => { if (p < pos) return; if (p > pos) line.appendChild(document.createTextNode(cut.slice(pos, p))); line.appendChild(mk('mark', '', cut.slice(p, q))); pos = q; });
      }
      line.appendChild(document.createTextNode(cut.slice(pos)));
      if (from > 0) line.insertBefore(document.createTextNode('…'), line.firstChild);
      if (from + 110 < it.text.length) line.appendChild(document.createTextNode('…'));
      b.appendChild(line);
      b.addEventListener('click', () => jump(it.el));
      findOut.appendChild(b);
    });
  }
  let findTimer = 0;
  findIn.addEventListener('input', () => { clearTimeout(findTimer); findTimer = setTimeout(runFind, 120); });
  findIn.addEventListener('keydown', e => { if (e.isComposing || e.keyCode === 229) return; /* かな漢字変換の確定の Enter では、移動しない */ if (e.key === 'Enter') { clearTimeout(findTimer); runFind(); const first = findOut.querySelector('.res'); if (first) first.click(); } });
  function setFind(on) {
    findBox.hidden = !on;
    findBtn.setAttribute('aria-expanded', String(on));
    if (on) { setDrawer(false); findBox.style.top = Math.round(bar.getBoundingClientRect().bottom + 6) + 'px'; runFind(); findIn.focus(); findIn.select(); }
  }
  findBtn.addEventListener('click', () => setFind(findBox.hidden));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !findBox.hidden) { setFind(false); findBtn.focus({ preventScroll: true }); }
    else if (e.key === '/' && findBox.hidden && !/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '') && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setFind(true); }
  });
  document.addEventListener('pointerdown', e => { if (!findBox.hidden && !findBox.contains(e.target) && !findBtn.contains(e.target)) setFind(false); });

  // ---- 用語集にある言葉に印を付け、押すとその場で意味を出す(章ごとに、最初に出てきた1回だけ)
  const gloss = $('glossary');
  if (gloss) {
    const terms = new Map(); // 言葉 → 用語集の見出し(dt)
    let n = 0;
    for (let el = gloss.nextElementSibling; el && el.tagName !== 'H2'; el = el.nextElementSibling) {
      el.querySelectorAll('dt').forEach(dt => {
        if (!dt.id) dt.id = 'term-' + (++n);
        // 「A / B」「A(B)」のような見出しは、A と B のどちらでも引けるようにする
        norm(dt.textContent).split(/\s*[\/／]\s*|[((]|[))]/).map(x => x.trim()).forEach(w => {
          if (w.length < 2 || /^[ぁ-ゖー]+$/.test(w) || /^[→ ]/.test(w)) return; // 1文字と、読みがな(ひらがなだけ)は除く
          if (!terms.has(w)) terms.set(w, dt);
        });
      });
    }
    const words = [...terms.keys()].sort((x, y) => y.length - x.length);
    if (words.length) {
      const re = new RegExp(words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
      const skip = 'a, button, h1, h2, h3, h4, sup, svg, code, .quiz, .toc, .path, .tag, .term, .formula, .open-chart, .try';
      let used = new Set();
      // カタカナの言葉が、もっと長いカタカナの言葉の一部であるとき(「ディスポジション効果」の中の「ポジション」など)や、
      // 同じ文字でも別の意味で使われているとき(「元に戻りました」の「戻り」など)は、印を付けない
      const KATA = /[\u30A1-\u30FAー]/, NOT_AFTER = { '戻り': /^[まっそた]/, '連動': /^(国債|して|する|し)/, '決済': /^(通貨|す|さ|し)/, '分散': /^(し|す|さ)/, '清算': /^(し|す|さ)/ };
      const senseOk = (text, at, w) => {
        const prev = text[at - 1] || '', rest = text.slice(at + w.length);
        if (/^[\u30A1-\u30FAー]+$/.test(w) && (KATA.test(prev) || KATA.test(rest[0] || ''))) return false;
        if (w === '建玉' || w === '戻り' && /[にへ]$/.test(text.slice(0, at))) return false; // 建玉は2つの意味で使うので付けない。「〜に戻り」は動詞
        return !(NOT_AFTER[w] && NOT_AFTER[w].test(rest));
      };
      const walk = root => {
        const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: t => t.nodeValue.length < 2 || t.parentNode.closest(skip) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
        const nodes = [];
        for (let t = tw.nextNode(); t; t = tw.nextNode()) nodes.push(t);
        nodes.forEach(t => {
          let node = t;
          for (let guard = 0; guard < 6 && node; guard++) {
            re.lastIndex = 0;
            let m, found = null;
            while ((m = re.exec(node.nodeValue))) { const dt = terms.get(m[0]); if (!used.has(dt) && senseOk(node.nodeValue, m.index, m[0])) { found = m; break; } }
            if (!found) return;
            const dt = terms.get(found[0]); used.add(dt);
            const rest = node.splitText(found.index); const after = rest.splitText(found[0].length);
            const sp = mk('span', 'term', found[0]); sp.tabIndex = 0; sp.setAttribute('role', 'button'); sp.dataset.t = dt.id; sp.setAttribute('aria-label', `${found[0]}(言葉の説明を開く)`);
            rest.parentNode.replaceChild(sp, rest);
            node = after;
          }
        });
      };
      // 用語集そのものと、それより後ろ(出典)には印を付けない
      // 一度にやると、開いた直後に画面がしばらく固まる。手の空いたときに、少しずつ進める
      const idle = window.requestIdleCallback ? f => requestIdleCallback(f, { timeout: 600 }) : f => setTimeout(f, 60);
      let cursor = document.querySelector('main').firstElementChild;
      const step = dl => {
        const t0 = performance.now();
        for (; cursor; cursor = cursor.nextElementSibling) {
          if (cursor.tagName === 'H2') { used = new Set(); if (cursor === gloss) { cursor = null; break; } continue; }
          if (cursor.tagName === 'FOOTER') { cursor = null; break; }
          walk(cursor);
          if (performance.now() - t0 > 12 && !(dl && dl.timeRemaining && dl.timeRemaining() > 4)) { cursor = cursor.nextElementSibling; break; }
        }
        if (cursor) idle(step);
      };
      idle(step);
      const pop = mk('div', 'termpop'); pop.hidden = true; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', '言葉の説明');
      document.body.appendChild(pop);
      let popFor = null;
      const closePop = () => { pop.hidden = true; if (popFor) popFor.setAttribute('aria-expanded', 'false'); popFor = null; };
      const openPop = (sp, byKey) => {
        if (popFor === sp) { closePop(); return; }
        closePop();
        const dt = document.getElementById(sp.dataset.t), dd = dt && dt.nextElementSibling;
        if (!dd) return;
        pop.textContent = '';
        pop.appendChild(mk('b', '', norm(dt.textContent)));
        pop.appendChild(mk('p', '', norm(dd.textContent)));
        const more = mk('a', '', '用語集で見る'); more.href = '#' + dt.id;
        more.addEventListener('click', e => { e.preventDefault(); closePop(); jump(dt); });
        pop.appendChild(more);
        pop.hidden = false; popFor = sp; sp.setAttribute('aria-expanded', 'true');
        // 言葉のすぐ下に出す。画面からはみ出すときは、左右と上下を調整する
        const r = sp.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
        const left = Math.max(8, Math.min(r.left, innerWidth - w - 8));
        const below = r.bottom + 6 + h < innerHeight || r.top < h + 12;
        pop.style.left = Math.round(left + scrollX) + 'px';
        pop.style.top = Math.round((below ? r.bottom + 6 : r.top - h - 6) + scrollY) + 'px';
        if (byKey) more.focus({ preventScroll: true }); // キーボードで開いたときは、中のリンクへ移れるようにする
      };
      document.addEventListener('click', e => {
        const sp = e.target.closest && e.target.closest('.term');
        if (sp) { openPop(sp); return; }
        if (!pop.hidden && !pop.contains(e.target)) closePop();
      });
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !pop.hidden) { const f = popFor; closePop(); if (f) f.focus(); }
        else if ((e.key === 'Enter' || e.key === ' ') && document.activeElement && document.activeElement.classList.contains('term')) { e.preventDefault(); openPop(document.activeElement, true); }
      });
      addEventListener('resize', closePop);
    }
  }

  addEventListener('beforeprint', () => document.querySelectorAll('main details').forEach(d => { d.open = true; }));

  markTables();
  onScroll();
})();
