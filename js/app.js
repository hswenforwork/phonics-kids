(async function () {
  const { BASE_WORDS, LETTERS } = window.PK_DATA;
  const { SOUNDS } = window.PK_SOUNDS;
  const P = window.PK_PHONICS;
  const E = window.PK_EXPLAIN;
  const A = window.PK_AUDIO;
  const BOX = window.PK_BOX;
  const app = document.getElementById('app');
  const hintEl = document.getElementById('hint');
  const REPO = 'hswenforwork/phonics-kids';

  // ---------- 本機儲存（各裝置獨立） ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('pk_' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('pk_' + k, JSON.stringify(v)); } catch (e) { /* 私密模式等情況 */ } },
    del(k) { try { localStorage.removeItem('pk_' + k); } catch (e) { /* 忽略 */ } },
  };
  store.del('learned'); store.del('zhfix');
  let progress = store.get('box', {}); // { word: 第 2～8 級已完成關數 0～3 }
  let sylDone = store.get('syl', {}); // { word: true } 第 0 級音節拍拍手已完成
  let weakLetters = store.get('weakLetters', {}); // { a: true } 家長標記還不熟的字母
  let mode = store.get('mode', 'kid');

  // ---------- 資料：內建單字庫 + 申請單加入的單字與修正 ----------
  let custom = { words: [], fixes: {} };
  try { custom = await (await fetch('data/custom-words.json', { cache: 'no-cache' })).json(); } catch (e) { /* 離線時只用內建字 */ }
  const THEMES = window.PK_DATA.THEMES.map((t) => ({ id: t.id, zh: t.zh, emoji: t.emoji }));
  THEMES.push({ id: 'mine', zh: '我的單字', emoji: '🌟' });
  const themeOf = (id) => THEMES.find((t) => t.id === id) || THEMES[THEMES.length - 1];
  const LIB = new Map();
  window.PK_DATA.THEMES.forEach((t) => t.words.forEach(([w, zh, emoji, ipa, syl]) => { if (!LIB.has(w)) LIB.set(w, { word: w, zh, emoji, ipa, syl, theme: t.id }); }));
  (custom.words || []).forEach((c) => {
    if (!c.word || LIB.has(c.word)) return;
    LIB.set(c.word, { word: c.word, zh: c.zh || '', emoji: c.emoji || '🌟', ipa: c.ipa || '', syl: c.syl || '', theme: c.theme || 'mine', custom: true });
  });
  Object.entries(custom.fixes || {}).forEach(([w, f]) => { const e = LIB.get(w); if (e) Object.assign(e, f); });
  const KNOWN = new Set([...BASE_WORDS, ...LIB.keys()]);
  const analyzeEntry = (e) => P.analyze(e.word, { ipa: e.ipa, ipaSource: e.source, zh: e.zh, known: KNOWN, libSyllables: e.syl || undefined });

  // 每個字自動判斷等級（2～8）；判斷不出來的放「我的單字」，只聽與認字
  const ANALYSIS = new Map();
  LIB.forEach((e, w) => { const r = analyzeEntry(Object.assign({ source: 'lib' }, e)); ANALYSIS.set(w, r); e.level = P.levelOf(r); });
  const wordsOfLevel = (n) => [...LIB.values()].filter((e) => e.level === n);
  const mineWords = () => [...LIB.values()].filter((e) => e.level == null);
  // 第 0 級：多音節字＋幾個一拍的字，混在一起聽
  const ONE_BEAT = ['cat', 'dog', 'sun', 'fish', 'cake', 'star', 'frog', 'rain', 'bird', 'ship'];
  const level0Words = () => [...ONE_BEAT.filter((w) => LIB.has(w)).map((w) => LIB.get(w)), ...wordsOfLevel(8)];

  // ---------- 查字（內建 → 線上字典 → 規則推測） ----------
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
  async function fetchDict(w) {
    const r = await withTimeout(fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(w)), 8000);
    if (!r.ok) return null;
    const data = await r.json();
    const ph = data.flatMap((d) => (d.phonetics || []).map((p) => ({ text: p.text || '', audio: p.audio || '' })));
    const uk = ph.find((p) => /-uk\.mp3/.test(p.audio) && p.text) || ph.find((p) => /-uk\.mp3/.test(p.audio));
    const anyText = ph.find((p) => p.text) || { text: data[0] && data[0].phonetic || '' };
    const def = (((data[0] || {}).meanings || [])[0] || {}).definitions;
    return {
      ipa: ((uk && uk.text) || anyText.text || '').replace(/əʊ/g, 'oʊ'),
      audioUrl: (uk && uk.audio) || (ph.find((p) => p.audio) || {}).audio || '',
      defEn: def && def[0] ? def[0].definition : '',
    };
  }
  async function fetchZh(w) {
    const r = await withTimeout(fetch('https://api.mymemory.translated.net/get?langpair=en|zh-TW&q=' + encodeURIComponent(w)), 8000);
    if (!r.ok) return '';
    const d = await r.json();
    const t = ((d.responseData || {}).translatedText || '').trim();
    if (!t || t.toLowerCase() === w || /MYMEMORY|QUERY LENGTH|INVALID/i.test(t)) return '';
    return t.replace(/[。.]$/, '');
  }
  async function lookup(raw) {
    const w = raw.toLowerCase().replace(/[^a-z]/g, '');
    if (!w) return null;
    if (LIB.has(w)) return Object.assign({ source: 'lib' }, LIB.get(w));
    const cache = store.get('cache2', {});
    let info = cache[w];
    if (!info) {
      const [d, zh] = await Promise.allSettled([fetchDict(w), fetchZh(w)]);
      const dict = d.status === 'fulfilled' ? d.value : null;
      info = { ipa: dict ? dict.ipa : '', audioUrl: dict ? dict.audioUrl : '', defEn: dict ? dict.defEn : '', zh: zh.status === 'fulfilled' ? zh.value : '' };
      if (info.ipa || info.zh) { cache[w] = info; store.set('cache2', cache); }
    }
    const e = Object.assign({ word: w, emoji: '🔤', syl: null, source: info.ipa ? 'dict' : 'none', mt: !!info.zh }, info);
    e.level = P.levelOf(analyzeEntry(e));
    return e;
  }

  // ---------- 小工具 ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const stageDots = (w) => { const d = progress[w] || 0; return [1, 2, 3].map((i) => `<span class="sdot${i <= d ? ' on' : ''}"></span>`).join(''); };
  const sticker0 = (w) => !!sylDone[w];
  
  let hintTimer;
  function showHint(html, ms = 2800) {
    hintEl.innerHTML = html; hintEl.hidden = false; hintEl.classList.remove('show'); void hintEl.offsetWidth; hintEl.classList.add('show');
    clearTimeout(hintTimer); hintTimer = setTimeout(() => { hintEl.classList.remove('show'); setTimeout(() => (hintEl.hidden = true), 250); }, ms);
  }
  window.PK_SHOWHINT = showHint;
  const srcBadge = document.createElement('div');
  srcBadge.className = 'src-badge'; srcBadge.hidden = true;
  document.body.appendChild(srcBadge);
  A.setOnSource((src) => {
    if (mode !== 'parent') { srcBadge.hidden = true; return; }
    srcBadge.textContent = '🔈 剛剛的聲音來源：' + src;
    srcBadge.hidden = false;
  });
  function flash(el) { if (!el) return; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  function burst(el, big) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    for (let i = 0; i < (big ? 18 : 9); i++) {
      const s = document.createElement('span');
      s.className = 'confetti'; s.textContent = ['⭐', '✨', '🌟'][i % 3];
      s.style.left = rect.left + rect.width / 2 + 'px'; s.style.top = rect.top + window.scrollY + rect.height / 2 + 'px';
      s.style.setProperty('--dx', (Math.random() * 240 - 120) + 'px');
      s.style.setProperty('--dy', (-60 - Math.random() * 160) + 'px');
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 1100);
    }
  }
  const issueURL = (title, lines) => `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(lines.join('\n'))}`;
  const keyOfIpa = (ph) => (Object.entries(SOUNDS).find(([, s]) => s.ipa === ph) || [''])[0];

  // ---------- 等級進度與建議 ----------
  function levelStats(n) {
    if (n === 1) return null;
    const ws = n === 0 ? level0Words() : wordsOfLevel(n);
    const done = ws.filter((e) => (n === 0 ? sticker0(e.word) : (progress[e.word] || 0) >= 3)).length;
    return { done, total: ws.length };
  }
  function recommended() {
    for (const n of [0, 2, 3, 4, 5, 6, 7, 8]) {
      const s = levelStats(n);
      if (s.total && s.done / s.total < 0.7) return n;
    }
    return 8;
  }

  // ---------- 路由 ----------
  function go(hash) { if (location.hash !== hash) location.hash = hash; else render(); }
  window.addEventListener('hashchange', render);
  document.querySelector('.logo').addEventListener('click', () => go(mode === 'kid' ? '#/' : '#/p'));
  document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
    const m = location.hash.match(/^#\/(?:p\/)?w\/([a-z]+)/);
    go(b.dataset.mode === 'kid' ? (m && LIB.has(m[1]) ? '#/w/' + m[1] : '#/') : (m ? '#/p/w/' + m[1] : '#/p'));
  }));
  function setMode(m) {
    mode = m; store.set('mode', m);
    document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-selected', b.dataset.mode === m));
    document.body.dataset.mode = m;
  }
  function render() {
    A.stop();
    hintEl.classList.remove('show'); hintEl.hidden = true; srcBadge.hidden = true;
    const h = location.hash || '#/';
    let m;
    if (h === '#/p/guide') { setMode('parent'); return renderGuide(); }
    if ((m = h.match(/^#\/p(?:\/w\/([a-z]+))?$/))) { setMode('parent'); return renderParent(m[1]); }
    setMode('kid');
    if ((m = h.match(/^#\/L\/([0-8])$/))) return renderLevel(+m[1]);
    if (h === '#/mine') return renderMine();
    if (h === '#/stickers') return renderStickers();
    if ((m = h.match(/^#\/s\/([a-z]+)$/))) return renderSyllableGame(m[1]);
    if ((m = h.match(/^#\/w\/([a-z]+)\/b\/([123])$/))) return renderBox(m[1], +m[2]);
    if ((m = h.match(/^#\/w\/([a-z]+)$/))) return renderKidWord(m[1]);
    return renderHome();
  }

  // ---------- 孩子模式：首頁（九個等級） ----------
  function renderHome() {
    const rec = recommended();
    app.innerHTML = `
      <section class="hero"><h1>今天想玩哪一級？</h1>
        <p class="progress-line">🏅 已經收集 <b>${[...LIB.values()].filter((e) => e.level != null && (progress[e.word] || 0) >= 3).length + Object.keys(sylDone).length}</b> 張貼紙　<a class="link" href="#/stickers">📒 看貼紙冊</a></p>
      </section>
      <section class="levels">
        ${P.LEVELS.map((L) => {
          const s = levelStats(L.n);
          const pct = s && s.total ? Math.round(s.done / s.total * 100) : 0;
          return `<a class="level-card${L.n === rec ? ' rec' : ''}" href="#/L/${L.n}">
            ${L.n === rec ? '<span class="rec-badge">⭐ 建議</span>' : ''}
            <span class="lv-num">第 ${L.n} 級</span>
            <span class="lv-icon">${L.icon}</span>
            <span class="lv-name">${L.zh}</span>
            <span class="lv-desc">${L.desc}</span>
            ${s ? `<span class="theme-meter"><span style="width:${pct}%"></span></span><span class="theme-count">${s.done} / ${s.total}</span>` : `<span class="theme-count">${Object.keys(weakLetters).length ? `⭐ ${Object.keys(weakLetters).length} 個字母要多練` : '26 個字母'}</span>`}
          </a>`;
        }).join('')}
        ${mineWords().length ? `<a class="level-card mine" href="#/mine"><span class="lv-icon">🌟</span><span class="lv-name">我的單字</span><span class="lv-desc">聽一聽、認一認</span><span class="theme-count">${mineWords().length} 個字</span></a>` : ''}
      </section>`;
    window.scrollTo(0, 0);
  }

  // ---------- 等級頁 ----------
  const filters = { theme: '', vowel: '' };
  function renderLevel(n) {
    if (n === 1) return renderLetters();
    const L = P.LEVELS[n];
    const all = n === 0 ? level0Words() : wordsOfLevel(n);
    const themes = [...new Set(all.map((e) => e.theme))];
    if (filters.theme && !themes.includes(filters.theme)) filters.theme = '';
    const vowelOf = (e) => (ANALYSIS.get(e.word).units.find((u) => u.type === 'V') || {}).text;
    const list = all.filter((e) => (!filters.theme || e.theme === filters.theme) && (n !== 2 || !filters.vowel || vowelOf(e) === filters.vowel));
    const chip = (key, val, label) => `<button class="chip${filters[key] === val ? ' on' : ''}" data-f="${key}" data-v="${val}">${label}</button>`;
    app.innerHTML = `
      <nav class="crumbs"><a href="#/" class="back">← 等級</a><h1>${L.icon} 第 ${n} 級：${L.zh}</h1></nav>
      <p class="legend">${L.desc}</p>
      ${n === 2 ? `<div class="filter-row"><span class="filter-label">母音</span>${chip('vowel', '', '全部')}${['a', 'e', 'i', 'o', 'u'].map((v) => chip('vowel', v, v)).join('')}</div>` : ''}
      <div class="filter-row"><span class="filter-label">主題</span>${chip('theme', '', '全部')}${themes.map((t) => chip('theme', t, `${themeOf(t).emoji} ${themeOf(t).zh}`)).join('')}</div>
      <section class="word-grid">
        ${list.map((e) => {
          const done = n === 0 ? sticker0(e.word) : (progress[e.word] || 0) >= 3;
          return `<a class="word-card${done ? ' is-done' : ''}" href="${n === 0 ? '#/s/' : '#/w/'}${e.word}">
            ${done ? `<span class="done-badge" aria-label="拿到貼紙">${e.emoji}</span>` : ''}
            <span class="wc-emoji">${e.emoji}</span><span class="wc-word">${e.word}</span><span class="wc-zh">${esc(e.zh)}</span>
            ${n === 0 ? `<span class="wc-stage">${'👏'.repeat(ANALYSIS.get(e.word).syllables.length)}</span>` : `<span class="wc-stage">${stageDots(e.word)}</span>`}
          </a>`;
        }).join('')}
      </section>`;
    app.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { filters[b.dataset.f] = b.dataset.v; renderLevel(n); }));
    window.scrollTo(0, 0);
  }

  // ---------- 第 1 級：字母的聲音 ----------
  function renderLetters() {
    app.innerHTML = `
      <nav class="crumbs"><a href="#/" class="back">← 等級</a><h1>🔤 第 1 級：字母的聲音</h1></nav>
      <p class="legend">點字母，聽它的聲音（不是字母的名字）。${Object.keys(weakLetters).length ? '⭐ 是爸爸媽媽說要多練的字母。' : ''}</p>
      <section class="letter-grid">
        ${LETTERS.map(([l, ph, emoji]) => `<button class="letter-card${weakLetters[l] ? ' weak-letter' : ''}" data-l="${l}" data-ph="${ph}">
          ${weakLetters[l] ? '<span class="done-badge">⭐</span>' : ''}<span class="lt">${l}</span><span class="lt-pic">${emoji}</span></button>`).join('')}
      </section>`;
    app.querySelectorAll('.letter-card').forEach((b) => b.addEventListener('click', () => {
      flash(b);
      A.play(A.phonemeIPA(b.dataset.ph, keyOfIpa(b.dataset.ph)));
    }));
    window.scrollTo(0, 0);
  }

  // ---------- 我的單字（只聽與認字） ----------
  function renderMine() {
    const list = mineWords();
    app.innerHTML = `
      <nav class="crumbs"><a href="#/" class="back">← 等級</a><h1>🌟 我的單字</h1></nav>
      <p class="legend">這些字不照格子規則，先聽一聽、認一認。</p>
      <section class="word-grid">${list.map((e) => `<a class="word-card" href="#/w/${e.word}"><span class="wc-emoji">${e.emoji}</span><span class="wc-word">${e.word}</span><span class="wc-zh">${esc(e.zh)}</span></a>`).join('')}</section>`;
    window.scrollTo(0, 0);
  }

  // ---------- 貼紙冊 ----------
  function renderStickers() {
    const books = [0, 2, 3, 4, 5, 6, 7, 8].map((n) => {
      const ws = n === 0 ? level0Words() : wordsOfLevel(n);
      const got = ws.filter((e) => (n === 0 ? sticker0(e.word) : (progress[e.word] || 0) >= 3));
      return { n, L: P.LEVELS[n], ws, got };
    });
    app.innerHTML = `
      <nav class="crumbs"><a href="#/" class="back">← 等級</a><h1>📒 貼紙冊</h1></nav>
      ${books.map((b) => `<section class="sticker-book${b.got.length === b.ws.length && b.ws.length ? ' full' : ''}">
        <h2>${b.L.icon} 第 ${b.n} 級：${b.L.zh} <small>${b.got.length} / ${b.ws.length}</small></h2>
        ${b.got.length === b.ws.length && b.ws.length ? '<p class="full-msg">🎉 這一本集滿了，好厲害！</p>' : ''}
        <div class="sticker-grid">${b.ws.map((e) => {
          const has = b.got.includes(e);
          return `<a class="sticker${has ? ' has' : ''}" href="${b.n === 0 ? '#/s/' : '#/w/'}${e.word}" aria-label="${e.word}">${has ? `<span>${e.emoji}</span><small>${e.word}</small>` : '<span>❔</span>'}</a>`;
        }).join('')}</div></section>`).join('')}`;
    const full = app.querySelector('.sticker-book.full .full-msg');
    if (full) burst(full, true);
    window.scrollTo(0, 0);
  }

  // ---------- 字卡（格子預覽） ----------
  let curBoxes = [];
  function cardHTML(e, r, opts = {}) {
    const boxes = P.elkonin(r);
    curBoxes = boxes;
    const canPlay = e.level != null;
    const d = progress[e.word] || 0;
    const ipaFill = opts.parent ? (b) => `${b.letters}<small class="box-ipa">${b.silent ? '—' : '/' + (b.ph || '?') + '/'}</small>` : (b) => b.letters;
    return `
      <article class="card">
        <div class="card-head">
          <span class="big-emoji">${e.emoji || '🔤'}</span>
          <div>
            <button class="big-word" data-say-word>${esc(r.word)} <span class="spk">🔊</span></button>
            <div class="meaning">${e.zh ? `<span class="zh">${esc(e.zh)}</span>` : '<span class="zh muted">（還沒有中文意思）</span>'}${e.mt ? '<span class="tag">自動翻譯</span>' : ''}</div>
          </div>
        </div>
        ${r.verified ? '' : '<p class="warn">⚠️ 這個字沒查到發音，以下是依拼字推測（未經發音驗證）</p>'}
        ${canPlay || opts.parent ? `<div class="preview">${BOX.boxesHTML(boxes, ipaFill)}</div><p class="tap-tip">👆 點格子聽聲音</p>` : ''}
        <div class="actions">
          ${canPlay || opts.parent ? '<button class="btn primary" data-blend>👏 一格一格念</button>' : ''}
          ${canPlay && !opts.noBox ? `<a class="btn star" href="#/w/${e.word}/b/${Math.min(d + 1, 3)}">🔲 開始練習 <span class="stage-dots">${stageDots(e.word)}</span></a>` : ''}
        </div>
      </article>`;
  }
  function bindCard(e, r) {
    const card = app.querySelector('.card');
    const boxes = curBoxes;
    card.querySelector('[data-say-word]').addEventListener('click', () => A.play(A.word(e)));
    const boxEls = [...card.querySelectorAll('.preview .ebox')];
    const say = (b) => (b.silent ? { pause: 200 } : A.phonemeIPA(b.ph, b.key));
    boxEls.forEach((el, k) => el.addEventListener('click', () => {
      const b = boxes[k];
      flash(el);
      showHint(E.boxHint(b, boxes));
      if (b.magic) {
        const vi = boxes.findIndex((x) => x.magicBy);
        if (vi >= 0) A.play(A.phonemeIPA(boxes[vi].ph, boxes[vi].key, { onstart: () => flash(boxEls[vi]) }));
        return;
      }
      if (!b.silent) A.play(say(b));
    }));
    const blend = card.querySelector('[data-blend]');
    if (blend) blend.addEventListener('click', () => {
      const seq = [];
      boxes.forEach((b, k) => { if (!b.silent) { const it = say(b); it.onstart = () => flash(boxEls[k]); seq.push(it, { pause: 200 }); } });
      seq.push(A.word(e, { onstart: () => boxEls.forEach(flash) }));
      A.play(seq);
    });
  }

  async function renderKidWord(w) {
    if (!LIB.has(w)) return renderHome();
    const e = await lookup(w);
    const r = ANALYSIS.get(w);
    const back = e.level == null ? '#/mine' : `#/L/${e.level}`;
    const list = e.level == null ? mineWords() : wordsOfLevel(e.level);
    const i = list.findIndex((x) => x.word === w);
    app.innerHTML = `
      <nav class="crumbs"><a href="${back}" class="back">← ${e.level == null ? '🌟 我的單字' : `${P.LEVELS[e.level].icon} 第 ${e.level} 級`}</a></nav>
      ${cardHTML(e, r)}
      <nav class="pager">
        ${i > 0 ? `<a class="btn ghost" href="#/w/${list[i - 1].word}">⬅ ${list[i - 1].word}</a>` : '<span></span>'}
        ${i < list.length - 1 ? `<a class="btn ghost" href="#/w/${list[i + 1].word}">${list[i + 1].word} ➡</a>` : '<span></span>'}
      </nav>`;
    bindCard(e, r);
    window.scrollTo(0, 0);
  }

  // ---------- 三關練習 ----------
  async function renderBox(w, stage) {
    const e0 = LIB.get(w);
    if (!e0 || e0.level == null) return renderHome();
    const done = progress[w] || 0;
    if (stage > done + 1) return go(`#/w/${w}/b/${done + 1}`);
    const e = await lookup(w);
    const r = ANALYSIS.get(w);
    const boxes = P.elkonin(r);
    app.innerHTML = `
      <nav class="crumbs"><a href="#/w/${w}" class="back">← ${esc(w)}</a></nav>
      <div class="stage-tabs">
        ${[1, 2, 3].map((s) => {
          const locked = s > done + 1, ok = s <= done;
          return `<a class="stage-tab${s === stage ? ' current' : ''}${locked ? ' locked' : ''}" ${locked ? 'aria-disabled="true"' : `href="#/w/${w}/b/${s}"`}>
            <span>${locked ? '🔒' : ok ? '⭐' : BOX.STAGES[s].icon}</span>第 ${s} 關<small>${BOX.STAGES[s].name}</small></a>`;
        }).join('')}
      </div>
      <section class="card" id="boxmount"></section>
      <div id="boxdone"></div>`;
    BOX.mount(app.querySelector('#boxmount'), {
      entry: e, boxes, stage,
      onComplete: (s) => {
        const first = (progress[w] || 0) < s;
        if (first) { progress[w] = s; store.set('box', progress); }
        const gotSticker = s === 3;
        const box = app.querySelector('#boxdone');
        const next = wordsOfLevel(e0.level).find((x) => (progress[x.word] || 0) < 3 && x.word !== w);
        box.innerHTML = `<div class="done-panel">
          ${gotSticker ? `<div class="sticker-pop">${e.emoji}</div><p class="done-big">🎉 三關都完成，得到 ${esc(w)} 貼紙！</p>` : '<p class="done-big">⭐ 過關了，拿到一顆小星星！</p>'}
          <div class="actions">
            <button class="btn ghost" data-again>🔁 再玩一次</button>
            ${s < 3 ? `<a class="btn primary" href="#/w/${w}/b/${s + 1}">下一關 ➡</a>` : next ? `<a class="btn primary" href="#/w/${next.word}">下一個字：${next.word} ➡</a>` : '<a class="btn primary" href="#/stickers">📒 看貼紙冊</a>'}
          </div></div>`;
        burst(box.querySelector('.done-big'), gotSticker);
        box.querySelector('[data-again]').addEventListener('click', () => renderBox(w, s));
        box.scrollIntoView({ behavior: 'smooth', block: 'center' });
        app.querySelectorAll('.stage-tab').forEach((tab, k) => {
          const sn = k + 1, d2 = progress[w] || 0;
          if (sn <= d2) tab.querySelector('span').textContent = '⭐';
          if (sn === d2 + 1) { tab.classList.remove('locked'); tab.removeAttribute('aria-disabled'); tab.setAttribute('href', `#/w/${w}/b/${sn}`); tab.querySelector('span').textContent = BOX.STAGES[sn].icon; }
        });
      },
    });
    window.scrollTo(0, 0);
  }

  // ---------- 第 0 級：音節拍拍手 ----------
  async function renderSyllableGame(w) {
    if (!LIB.has(w)) return renderHome();
    const e = await lookup(w);
    const r = ANALYSIS.get(w);
    const list = level0Words();
    const i = list.findIndex((x) => x.word === w);
    const next = list[i + 1];
    app.innerHTML = `
      <nav class="crumbs"><a href="#/L/0" class="back">← 👏 第 0 級</a></nav>
      <section class="card" id="sylmount"></section>
      <div id="syldone"></div>`;
    BOX.mountSyllables(app.querySelector('#sylmount'), {
      entry: e, syllables: r.syllables,
      onComplete: () => {
        const first = !sylDone[w];
        sylDone[w] = true; store.set('syl', sylDone);
        const box = app.querySelector('#syldone');
        box.innerHTML = `<div class="done-panel">
          ${first ? `<div class="sticker-pop">${e.emoji}</div>` : ''}
          <p class="done-big">👏 ${esc(w)} 有 ${r.syllables.length} 拍！${first ? '得到貼紙！' : ''}</p>
          <div class="actions"><button class="btn ghost" data-again>🔁 再玩一次</button>
          ${next ? `<a class="btn primary" href="#/s/${next.word}">下一個：${next.word} ➡</a>` : '<a class="btn primary" href="#/stickers">📒 看貼紙冊</a>'}</div></div>`;
        burst(box.querySelector('.done-big'), first);
        box.querySelector('[data-again]').addEventListener('click', () => renderSyllableGame(w));
        box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      },
    });
    window.scrollTo(0, 0);
  }

  // ---------- 家長模式 ----------
  function renderParent(w) {
    const totalStickers = [...LIB.values()].filter((e) => e.level != null && (progress[e.word] || 0) >= 3).length + Object.keys(sylDone).length;
    app.innerHTML = `
      <section class="parent-search">
        <h1>家長模式</h1>
        <form class="search" autocomplete="off">
          <input type="search" name="q" placeholder="輸入英文單字，看它的格子拆解" value="${w ? esc(w) : ''}" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="英文單字">
          <button class="btn primary" type="submit">查詢</button>
        </form>
        <p class="muted small">先查內建單字庫，查不到再查線上字典（英式）；都查不到時，依拼字推測並標示「未經發音驗證」。</p>
        <a class="btn small" href="#/p/guide">📘 教學指南</a>
      </section>
      <div id="result">${w ? '<p class="loading">查詢中…</p>' : `
        <section class="panel">
          <h2>⭐ 標記還不熟的字母</h2>
          <p class="muted small">標記的字母會在孩子的「第 1 級：字母的聲音」顯示星星，提醒多練。</p>
          <div class="chips">${LETTERS.map(([l]) => `<button class="chip letter-chip${weakLetters[l] ? ' on' : ''}" data-weak="${l}">${l}</button>`).join('')}</div>
        </section>
        <section class="panel">
          <h2>📊 這台裝置的進度</h2>
          <ul class="checks">${[0, 2, 3, 4, 5, 6, 7, 8].map((n) => { const s = levelStats(n); return `<li>${P.LEVELS[n].icon} 第 ${n} 級 ${P.LEVELS[n].zh}：${s.done} / ${s.total}</li>`; }).join('')}</ul>
          <p class="muted small">共 ${totalStickers} 張貼紙。進度只存在這台裝置。<button class="linklike" data-reset>清除這台裝置的進度</button></p>
        </section>`}</div>`;
    app.querySelector('form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const q = ev.target.q.value.trim().toLowerCase().replace(/[^a-z]/g, '');
      if (q) go('#/p/w/' + q);
    });
    app.querySelectorAll('[data-weak]').forEach((b) => b.addEventListener('click', () => {
      const l = b.dataset.weak;
      if (weakLetters[l]) delete weakLetters[l]; else weakLetters[l] = true;
      store.set('weakLetters', weakLetters); b.classList.toggle('on', !!weakLetters[l]);
    }));
    const reset = app.querySelector('[data-reset]');
    if (reset) reset.addEventListener('click', () => {
      if (!confirm('確定要清除這台裝置的進度和貼紙嗎？')) return;
      progress = {}; sylDone = {}; store.set('box', progress); store.set('syl', sylDone); render();
    });
    if (w) showParentWord(w);
    window.scrollTo(0, 0);
  }

  async function showParentWord(w) {
    const box = document.getElementById('result');
    const e = await lookup(w);
    if (!e) { box.innerHTML = '<p class="warn">請輸入英文字母。</p>'; return; }
    const r = ANALYSIS.get(e.word) || analyzeEntry(e);
    const inLib = LIB.has(r.word);
    const boxes = P.elkonin(r);
    const L = e.level != null ? P.LEVELS[e.level] : null;
    const addURL = issueURL(`加入單字：${r.word}`, ['pk-action: add', `word: ${r.word}`, '', '（送出後會自動判斷等級、產生音標、中文意思與語音，約幾分鐘後網站更新。）']);
    const fixURL = issueURL(`回報錯誤：${r.word}`, ['pk-action: fix', `word: ${r.word}`, `ipa: ${r.ipa || ''}`, `syllables: ${r.syllables.join('-')}`, `zh: ${e.zh || ''}`, '', '（請直接修改上面需要更正的欄位，再按 Submit new issue 送出。）']);
    box.innerHTML = `
      ${cardHTML(e, r, { parent: true, noBox: !inLib })}
      <section class="panel">
        <h2>🔲 格子拆解</h2>
        <p>${L ? `屬於 <b>第 ${e.level} 級：${L.zh}</b>（${L.desc}）` : '<b>不符合格子規則的等級</b>：加入後會放在「我的單字」，只開放聽和認字。'}</p>
        <p class="muted small">IPA：${r.ipa ? esc(r.ipa) : '（無）'}　音節：${r.syllables.join(' · ')}　共 ${boxes.filter((b) => !b.silent).length} 個聲音</p>
        <table class="steps box-table"><thead><tr><th>格子</th><th>聲音</th><th>說明</th></tr></thead>
          <tbody>${E.boxRows(boxes).map(([a, b, c]) => `<tr><td class="box-cell">${esc(a)}</td><td>${esc(b)}</td><td>${esc(c)}</td></tr>`).join('')}</tbody></table>
        ${e.defEn ? `<p class="muted small">英文解釋：${esc(e.defEn)}</p>` : ''}
        <div class="gh-actions">
          ${inLib ? `<a class="btn small" href="${fixURL}" target="_blank" rel="noopener">🛠 回報錯誤</a>${LIB.get(r.word).custom ? '<button class="btn small" data-move>🗂 換主題</button>' : ''}`
                  : `<a class="btn small primary" href="${addURL}" target="_blank" rel="noopener">➕ 加入單字庫</a>`}
        </div>
        <p class="muted small">按鈕會開啟 GitHub 申請單（需登入 GitHub），按「Submit new issue」送出後，自動流程會更新單字庫與語音，所有裝置同步。</p>
      </section>
      <section class="panel"><h2>中文講解 <button class="btn small ghost" data-copy="zh">複製</button></h2>
        <div class="script">${esc(E.scriptZh(r, boxes, e.level)).replace(/\n/g, '<br>')}</div></section>
      <section class="panel"><h2>English Script <button class="btn small ghost" data-copy="en">複製</button></h2>
        <div class="script" data-script="en">${esc(E.scriptEn(r, boxes)).replace(/\n/g, '<br>')}</div></section>`;
    bindCard(e, r);
    const mv = box.querySelector('[data-move]');
    if (mv) mv.addEventListener('click', () => openMove(r.word));
    box.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
      const txt = b.dataset.copy === 'zh' ? E.scriptZh(r, boxes, e.level) : E.scriptEn(r, boxes);
      try { await navigator.clipboard.writeText(txt); showHint('📋 已複製'); } catch (err) { showHint('無法複製，請手動選取文字'); }
    }));
  }

  // 換主題（只影響篩選）：開 GitHub 申請單，送出後所有裝置同步
  function openMove(w) {
    const dlg = document.createElement('div');
    dlg.className = 'dialog-back';
    dlg.innerHTML = `<div class="dialog" role="dialog" aria-label="換主題">
      <h2>把 <b>${w}</b> 放到哪個主題？</h2>
      <div class="dialog-grid">${THEMES.filter((t) => t.id !== 'mine').map((t) => `<button class="btn ghost" data-to="${t.id}">${t.emoji} ${t.zh}</button>`).join('')}</div>
      <p class="muted small">按下後會開啟 GitHub 申請單，請按「Submit new issue」送出。</p>
      <button class="btn small" data-close>取消</button></div>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('click', (ev) => {
      const to = ev.target.closest('[data-to]');
      if (to) { window.open(issueURL(`換主題：${w}`, ['pk-action: move', `word: ${w}`, `theme: ${to.dataset.to}`]), '_blank', 'noopener'); dlg.remove(); }
      else if (ev.target === dlg || ev.target.matches('[data-close]')) dlg.remove();
    });
  }

  // ---------- 教學指南（呈現 references/rules.md） ----------
  function md(src) {
    const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');
    const lines = src.split(/\r?\n/);
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      if (/^\s*$/.test(l)) { i++; continue; }
      if (/^---+$/.test(l)) { out.push('<hr>'); i++; continue; }
      let m;
      if ((m = l.match(/^(#{1,4})\s+(.*)$/))) { const n = Math.min(m[1].length + 1, 4); out.push(`<h${n}>${inline(m[2])}</h${n}>`); i++; continue; }
      if (/^\|/.test(l)) {
        const rows = [];
        while (i < lines.length && /^\|/.test(lines[i])) { rows.push(lines[i]); i++; }
        const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        const body = rows.filter((r, k) => k !== 1 || !/^\|[\s:|-]+\|$/.test(r));
        out.push(`<div class="table-wrap"><table class="steps">${body.map((r, k) => `<tr>${cells(r).map((c) => k === 0 ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</table></div>`);
        continue;
      }
      if (/^>\s?/.test(l)) {
        const q = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, '')); i++; }
        out.push(`<blockquote>${q.map(inline).join('<br>')}</blockquote>`); continue;
      }
      if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
        const ordered = /^\s*\d+\./.test(l);
        const items = [];
        while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, '')); i++; }
        out.push(`<${ordered ? 'ol' : 'ul'}>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`); continue;
      }
      const para = [];
      while (i < lines.length && lines[i].trim() && !/^(#|\||>|---|\s*([-*]|\d+\.)\s)/.test(lines[i])) { para.push(lines[i]); i++; }
      out.push(`<p>${para.map(inline).join('<br>')}</p>`);
    }
    return out.join('\n');
  }
  async function renderGuide() {
    app.innerHTML = `<nav class="crumbs"><a href="#/p" class="back">← 家長模式</a></nav><article class="panel guide"><p class="loading">載入中…</p></article>`;
    window.scrollTo(0, 0);
    try {
      const t = await (await fetch('references/rules.md', { cache: 'no-cache' })).text();
      app.querySelector('.guide').innerHTML = md(t);
    } catch (err) {
      app.querySelector('.guide').innerHTML = '<p class="warn">指南載入失敗，請確認網路連線。</p>';
    }
  }

  render();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
