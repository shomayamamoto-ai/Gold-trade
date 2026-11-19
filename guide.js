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
    if (!/^H[234]$/.test(head.tagName)) n = head.textContent.replace(/\s+/g, '').length; // カード(枠)は、その中身の長さ
    else for (let el = head.nextElementSibling; el && !stop.includes(el.tagName) && el.tagName !== 'FOOTER'; el = el.nextElementSibling) n += el.textContent.replace(/\s+/g, '').length;
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
      prefs.tries = tryDone; write(KEY, prefs); tryCount();
    });
    t.appendChild(lab);
  });
  tryCount();

  // ---- 言葉で探す(このページの中だけを探す。外には何も送らない)
  const bar = document.querySelector('.bar'), fsBtn = $('fsBtn');
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const norm = t => t.replace(/\s+/g, ' ').trim();
  // ひらがな・カタカナ、全角・半角、大文字・小文字の違いを気にせず探せるようにそろえる
  const fold = t => t.normalize('NFKC').toLowerCase().replace(/[ぁ-ゖ]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60));
  let findIndex = null;
  function buildIndex() {
    findIndex = [];
    let chap = '', sect = '';
    document.querySelectorAll('main h2, main h3, main h4, main p, main li, main td, main dt, main dd, main figcaption').forEach(el => {
      if (el.closest('.toc, .path')) return;
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
    const target = el.tagName === 'TD' ? el.parentNode : el;
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
    const hits = findIndex.filter(it => words.every(w => it.key.includes(w)));
    hits.sort((x, y) => (y.head - x.head)); // 見出しを先に。あとは本の順
    findInfo.textContent = hits.length ? `${hits.length}件見つかりました` + (hits.length > 50 ? '(はじめの50件)' : '') : '見つかりませんでした。別の言葉や、短い言葉で試してください。';
    hits.slice(0, 50).forEach(it => {
      const b = mk('button', 'res'); b.type = 'button';
      b.appendChild(mk('small', '', it.where));
      // 最初に見つかった言葉のまわりを抜き出して、その言葉に印を付ける
      const at = Math.max(0, it.key.indexOf(words[0])), from = Math.max(0, at - 24), cut = it.text.slice(from, from + 110), line = mk('span');
      const kcut = fold(cut);
      let pos = 0;
      // 折りたたんだ文字と元の文字は長さが同じとは限らないので、長さが同じときだけ印を付ける
      if (kcut.length === cut.length) {
        const marks = [];
        words.forEach(w => { for (let i = kcut.indexOf(w); i >= 0; i = kcut.indexOf(w, i + w.length)) marks.push([i, i + w.length]); });
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
  findIn.addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(findTimer); runFind(); const first = findOut.querySelector('.res'); if (first) first.click(); } });
  function setFind(on) {
    findBox.hidden = !on;
    findBtn.setAttribute('aria-expanded', String(on));
    if (on) { setDrawer(false); findBox.style.top = Math.round(bar.getBoundingClientRect().bottom + 6) + 'px'; runFind(); findIn.focus(); findIn.select(); }
  }
  findBtn.addEventListener('click', () => setFind(findBox.hidden));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !findBox.hidden) { setFind(false); findBtn.focus(); }
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
      const walk = root => {
        const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: t => t.nodeValue.length < 2 || t.parentNode.closest(skip) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
        const nodes = [];
        for (let t = tw.nextNode(); t; t = tw.nextNode()) nodes.push(t);
        nodes.forEach(t => {
          let node = t;
          for (let guard = 0; guard < 6 && node; guard++) {
            re.lastIndex = 0;
            let m, found = null;
            while ((m = re.exec(node.nodeValue))) { const dt = terms.get(m[0]); if (!used.has(dt)) { found = m; break; } }
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
      let stop = false;
      for (let el = document.querySelector('main').firstElementChild; el && !stop; el = el.nextElementSibling) {
        if (el.tagName === 'H2') { used = new Set(); if (el === gloss) stop = true; continue; }
        if (el.tagName === 'FOOTER') break;
        walk(el);
      }
      const pop = mk('div', 'termpop'); pop.hidden = true; pop.setAttribute('role', 'dialog');
      document.body.appendChild(pop);
      let popFor = null;
      const closePop = () => { pop.hidden = true; if (popFor) popFor.setAttribute('aria-expanded', 'false'); popFor = null; };
      const openPop = sp => {
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
      };
      document.addEventListener('click', e => {
        const sp = e.target.closest && e.target.closest('.term');
        if (sp) { openPop(sp); return; }
        if (!pop.hidden && !pop.contains(e.target)) closePop();
      });
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !pop.hidden) { const f = popFor; closePop(); if (f) f.focus(); }
        else if ((e.key === 'Enter' || e.key === ' ') && document.activeElement && document.activeElement.classList.contains('term')) { e.preventDefault(); openPop(document.activeElement); }
      });
      addEventListener('resize', closePop);
    }
  }

  markTables();
  onScroll();
})();
