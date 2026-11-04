(function () {
  const { THEMES, BASE_WORDS } = window.PK_DATA;
  const { SOUNDS } = window.PK_SOUNDS;
  const P = window.PK_PHONICS;
  const E = window.PK_EXPLAIN;
  const app = document.getElementById('app');
  const hintEl = document.getElementById('hint');

  // ---------- 資料 ----------
  const LIB = new Map();
  THEMES.forEach((t) => t.words.forEach(([w, zh, emoji, ipa, syl]) => {
    if (!LIB.has(w)) LIB.set(w, { word: w, zh, emoji, ipa, syl, theme: t.id });
  }));
  const KNOWN = new Set([...BASE_WORDS, ...LIB.keys()]);

  // ---------- 本機儲存（各裝置獨立） ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('pk_' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('pk_' + k, JSON.stringify(v)); } catch (e) { /* 私密模式等情況 */ } },
  };
  let learned = store.get('learned', {});
  let zhFix = store.get('zhfix', {});
  let mode = store.get('mode', 'kid');

  // ---------- 語音（瀏覽器內建 TTS） ----------
  let voice = null;
  function pickVoice() {
    const vs = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
    const en = vs.filter((v) => /^en[-_]US/i.test(v.lang));
    const pref = ['Samantha', 'Ava', 'Allison', 'Google US English', 'Microsoft Aria', 'Microsoft Jenny', 'Alex'];
    voice = pref.map((n) => en.find((v) => v.name.includes(n))).find(Boolean) || en[0] || vs.find((v) => /^en/i.test(v.lang)) || null;
  }
  if (window.speechSynthesis) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function speak(list, rate = 0.8) {
    if (!window.speechSynthesis) { showHint('🔇 這台裝置的瀏覽器不支援語音朗讀'); return Promise.resolve(); }
    speechSynthesis.cancel();
    const items = Array.isArray(list) ? list : [list];
    return items.reduce((p, it) => p.then(() => new Promise((res) => {
      const o = typeof it === 'string' ? { text: it } : it;
      if (o.pause) { setTimeout(res, o.pause); return; }
      const u = new SpeechSynthesisUtterance(o.text);
      u.lang = 'en-US'; if (voice) u.voice = voice;
      u.rate = o.rate || rate; u.pitch = 1.05;
      if (o.onstart) u.onstart = o.onstart;
      u.onend = u.onerror = () => res();
      speechSynthesis.speak(u);
      setTimeout(res, 4000); // 保險：某些瀏覽器不觸發 onend
    })), Promise.resolve());
  }

  // ---------- 查字（內建 → 線上字典 → 規則推測） ----------
  async function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
  }
  async function fetchDict(w) {
    const r = await withTimeout(fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(w)), 8000);
    if (!r.ok) return null;
    const data = await r.json();
    const ph = data.flatMap((d) => (d.phonetics || []).map((p) => ({ text: p.text, audio: p.audio || '' })).concat(d.phonetic ? [{ text: d.phonetic, audio: '' }] : []));
    const withText = ph.filter((p) => p.text);
    const us = withText.find((p) => /-us\.mp3/.test(p.audio));
    const ipa = (us || withText[0] || {}).text || '';
    const def = (((data[0] || {}).meanings || [])[0] || {}).definitions;
    return { ipa, defEn: def && def[0] ? def[0].definition : '' };
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
    if (LIB.has(w)) {
      const e = LIB.get(w);
      return { word: w, zh: zhFix[w] || e.zh, emoji: e.emoji, ipa: e.ipa, syl: e.syl, source: 'lib', zhSource: zhFix[w] ? 'fix' : 'lib' };
    }
    const cache = store.get('cache', {});
    let info = cache[w];
    if (!info) {
      const [d, zh] = await Promise.allSettled([fetchDict(w), fetchZh(w)]);
      const dict = d.status === 'fulfilled' ? d.value : null;
      info = { ipa: dict && dict.ipa || '', defEn: dict && dict.defEn || '', zh: zh.status === 'fulfilled' ? zh.value : '' };
      if (info.ipa || info.zh) { cache[w] = info; store.set('cache', cache); }
    }
    return {
      word: w, zh: zhFix[w] || info.zh, defEn: info.defEn, emoji: '🔤', ipa: info.ipa, syl: null,
      source: info.ipa ? 'dict' : 'none', zhSource: zhFix[w] ? 'fix' : (info.zh ? 'mt' : 'none'),
    };
  }
  function analyzeEntry(e) {
    const r = P.analyze(e.word, { ipa: e.ipa, ipaSource: e.source, zh: e.zh, known: KNOWN, libSyllables: e.syl || undefined });
    return r;
  }

  // ---------- 小工具 ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const stars = (n) => '★'.repeat(n) + '<span class="dim">' + '★'.repeat(5 - n) + '</span>';
  let hintTimer;
  function showHint(html, ms = 3200) {
    hintEl.innerHTML = html; hintEl.hidden = false; hintEl.classList.remove('show'); void hintEl.offsetWidth; hintEl.classList.add('show');
    clearTimeout(hintTimer); hintTimer = setTimeout(() => { hintEl.classList.remove('show'); setTimeout(() => (hintEl.hidden = true), 250); }, ms);
  }
  const libStars = {};
  LIB.forEach((e, w) => { libStars[w] = analyzeEntry(lookupSync(w)).stars; });
  function lookupSync(w) { const e = LIB.get(w); return { word: w, zh: e.zh, ipa: e.ipa, syl: e.syl, source: 'lib' }; }

  // ---------- 路由 ----------
  function go(hash) { if (location.hash !== hash) location.hash = hash; else render(); }
  window.addEventListener('hashchange', render);
  document.querySelector('.logo').addEventListener('click', () => go(mode === 'kid' ? '#/' : '#/p'));
  document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.mode; store.set('mode', mode);
    const m = location.hash.match(/^#\/(?:p\/)?w\/([a-z]+)$/);
    go(mode === 'kid' ? (m && LIB.has(m[1]) ? '#/w/' + m[1] : '#/') : (m ? '#/p/w/' + m[1] : '#/p'));
  }));
  function syncMode() {
    document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-selected', b.dataset.mode === mode));
    document.body.dataset.mode = mode;
  }

  function render() {
    const h = location.hash || '#/';
    let m;
    if ((m = h.match(/^#\/p(?:\/w\/([a-z]+))?$/))) { mode = 'parent'; store.set('mode', mode); syncMode(); return renderParent(m[1]); }
    mode = 'kid'; store.set('mode', mode); syncMode();
    if ((m = h.match(/^#\/t\/([a-z]+)$/))) return renderTheme(m[1]);
    if ((m = h.match(/^#\/w\/([a-z]+)$/))) return renderKidWord(m[1]);
    return renderHome();
  }

  // ---------- 孩子模式：首頁 ----------
  function renderHome() {
    const total = LIB.size, done = [...LIB.keys()].filter((w) => learned[w]).length;
    app.innerHTML = `
      <section class="hero">
        <h1>今天想認識什麼字？</h1>
        <p class="progress-line">⭐ 已經學會 <b>${done}</b> / ${total} 個字</p>
      </section>
      <section class="themes">
        ${THEMES.map((t) => {
          const n = t.words.length, d = t.words.filter(([w]) => learned[w]).length;
          return `<a class="theme-card" href="#/t/${t.id}">
            <span class="theme-emoji">${t.emoji}</span>
            <span class="theme-name">${t.zh}</span>
            <span class="theme-meter"><span style="width:${Math.round(d / n * 100)}%"></span></span>
            <span class="theme-count">${d} / ${n}</span>
          </a>`;
        }).join('')}
      </section>`;
    app.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  // ---------- 孩子模式：主題 ----------
  function renderTheme(id) {
    const t = THEMES.find((x) => x.id === id);
    if (!t) return renderHome();
    const words = t.words.slice().sort((a, b) => libStars[a[0]] - libStars[b[0]]);
    app.innerHTML = `
      <nav class="crumbs"><a href="#/" class="back">← 主題</a><h1>${t.emoji} ${t.zh}</h1></nav>
      <p class="legend">★ 越多越有挑戰，從一顆星開始吧！</p>
      <section class="word-grid">
        ${words.map(([w, zh, emoji]) => `
          <a class="word-card ${learned[w] ? 'is-done' : ''}" href="#/w/${w}">
            ${learned[w] ? '<span class="done-badge" aria-label="學會了">⭐</span>' : ''}
            <span class="wc-emoji">${emoji}</span>
            <span class="wc-word">${w}</span>
            <span class="wc-zh">${zh}</span>
            <span class="wc-stars" aria-label="難度 ${libStars[w]} 顆星">${stars(libStars[w])}</span>
          </a>`).join('')}
      </section>`;
    window.scrollTo(0, 0);
  }

  // ---------- 字卡（兩種模式共用） ----------
  const SYL_COLORS = ['c1', 'c2', 'c3', 'c4', 'c5'];
  function tileClass(u) {
    if (u.type === 'S') return 'silent';
    if (u.type === 'V') return { team: 'team', bossy: 'bossy', le: 'team' }[u.sub] || 'vowel';
    return u.sub === 'digraph' || u.sub === 'trigraph' ? 'digraph' : 'cons';
  }
  function wordCardHTML(e, r) {
    const sylHTML = r.syllables.map((s, i) => {
      const units = r.units.filter((u) => u.syl === i);
      const tiles = units.map((u) => {
        const idx = r.units.indexOf(u);
        return `<button class="tile ${tileClass(u)}${u.magic ? ' magic' : ''}" data-unit="${idx}" aria-label="${u.text}">${u.text}</button>`;
      }).join('');
      const cut = r.cuts[i];
      const R = cut && P.RULES[cut.rule];
      const chip = i < r.syllables.length - 1
        ? `<span class="rule-chip" title="${R ? R.zh : '依發音'}">${R ? R.icon : '👂'}<small>${R ? R.zh.replace('法則', '') : '依發音'}</small></span>` : '';
      return `<div class="syl ${SYL_COLORS[i % 5]}"><button class="syl-say" data-syl="${i}" aria-label="念 ${s}">🔊 ${s}</button><div class="tiles">${tiles}</div></div>${chip}`;
    }).join('');
    const zhLine = e.zh
      ? `<span class="zh">${esc(e.zh)}</span>`
      : `<span class="zh muted">（還沒有中文意思）</span>`;
    return `
      <article class="card">
        <div class="card-head">
          <span class="big-emoji">${e.emoji || '🔤'}</span>
          <div>
            <button class="big-word" data-say-word>${esc(r.word)} <span class="spk">🔊</span></button>
            <div class="meaning">${zhLine}${e.zhSource === 'mt' ? '<span class="tag">自動翻譯</span>' : ''}${e.zhSource === 'fix' ? '<span class="tag">已修正</span>' : ''}</div>
          </div>
        </div>
        ${r.verified ? '' : '<p class="warn">⚠️ 這個字沒查到發音，以下是依拼字規則推測（未經發音驗證）</p>'}
        <div class="syl-row">${sylHTML}</div>
        <p class="tap-tip">👆 點字母聽聲音，點 🔊 聽音節</p>
        <div class="actions">
          <button class="btn primary" data-blend>👏 拼起來</button>
          <button class="btn ${learned[r.word] ? 'done' : 'star'}" data-learn>${learned[r.word] ? '⭐ 學會了！' : '☆ 我會了'}</button>
        </div>
      </article>`;
  }

  function soundHint(u) {
    const s = SOUNDS[u.key] || null;
    if (u.type === 'S' || u.key === 'silent') {
      return u.magic ? `🤫 <b>e</b> 不出聲，它是<b>魔法 e</b>，讓前面的母音念自己的名字` : `🤫 <b>${u.text}</b> 在這裡不發音`;
    }
    if (!s) return `<b>${u.text}</b>`;
    const pos = { start: '開頭', mid: '中間', end: '結尾' }[s.pos] || '';
    let extra = '';
    if (u.sub === 'bossy') extra = '（霸道 R）';
    else if (u.sub === 'team') extra = '（母音組合，一起念）';
    else if (u.sub === 'digraph' || u.sub === 'trigraph') extra = '（好朋友字母，一起念）';
    else if (u.key && u.key.startsWith('long_')) extra = '（念自己的名字）';
    else if (u.key === 'schwa') extra = '（輕輕念）';
    return `<span class="h-emoji">${s.emoji}</span> <b>${u.text}</b> 的音就像 <b>${s.kw}</b> ${pos}的音 ${extra}<span class="h-ipa">/${s.ipa}/</span>`;
  }

  function bindWordCard(e, r) {
    const card = app.querySelector('.card');
    card.querySelector('[data-say-word]').addEventListener('click', () => speak(r.word, 0.75));
    card.querySelectorAll('.syl-say').forEach((b) => b.addEventListener('click', () => {
      const i = +b.dataset.syl;
      flash(card.querySelectorAll('.syl')[i]);
      speak(r.syllables[i], 0.7);
    }));
    card.querySelectorAll('.tile').forEach((b) => b.addEventListener('click', () => {
      const u = r.units[+b.dataset.unit];
      flash(b);
      showHint(soundHint(u));
      const s = SOUNDS[u.key];
      if (s && s.kw) speak(s.kw.replace('-', ' '), 0.75);
    }));
    card.querySelector('[data-blend]').addEventListener('click', () => {
      const syls = card.querySelectorAll('.syl');
      const seq = [];
      r.syllables.forEach((s, i) => { seq.push({ text: s, rate: 0.6, onstart: () => flash(syls[i]) }); seq.push({ pause: 250 }); });
      if (r.syllables.length > 1) seq.push({ text: r.word, rate: 0.8, onstart: () => syls.forEach(flash) });
      speak(seq);
    });
    card.querySelector('[data-learn]').addEventListener('click', (ev) => {
      learned[r.word] = !learned[r.word];
      if (!learned[r.word]) delete learned[r.word];
      store.set('learned', learned);
      const b = ev.currentTarget;
      b.className = 'btn ' + (learned[r.word] ? 'done' : 'star');
      b.textContent = learned[r.word] ? '⭐ 學會了！' : '☆ 我會了';
      if (learned[r.word]) { burst(b); speak('Great job!', 0.9); }
    });
  }
  function flash(el) { if (!el) return; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  function burst(el) {
    const rect = el.getBoundingClientRect();
    for (let i = 0; i < 10; i++) {
      const s = document.createElement('span');
      s.className = 'confetti'; s.textContent = ['⭐', '✨', '🌟'][i % 3];
      s.style.left = rect.left + rect.width / 2 + 'px'; s.style.top = rect.top + window.scrollY + 'px';
      s.style.setProperty('--dx', (Math.random() * 200 - 100) + 'px');
      s.style.setProperty('--dy', (-60 - Math.random() * 120) + 'px');
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 1000);
    }
  }

  // ---------- 孩子模式：單字 ----------
  async function renderKidWord(w) {
    if (!LIB.has(w)) return renderHome();
    const e = await lookup(w);
    const r = analyzeEntry(e);
    const t = THEMES.find((x) => x.id === LIB.get(w).theme);
    const list = t.words.slice().sort((a, b) => libStars[a[0]] - libStars[b[0]]).map((x) => x[0]);
    const i = list.indexOf(w);
    app.innerHTML = `
      <nav class="crumbs"><a href="#/t/${t.id}" class="back">← ${t.emoji} ${t.zh}</a></nav>
      ${wordCardHTML(e, r)}
      <nav class="pager">
        ${i > 0 ? `<a class="btn ghost" href="#/w/${list[i - 1]}">⬅ ${list[i - 1]}</a>` : '<span></span>'}
        ${i < list.length - 1 ? `<a class="btn ghost" href="#/w/${list[i + 1]}">${list[i + 1]} ➡</a>` : '<span></span>'}
      </nav>`;
    bindWordCard(e, r);
    window.scrollTo(0, 0);
  }

  // ---------- 家長模式 ----------
  function renderParent(w) {
    app.innerHTML = `
      <section class="parent-search">
        <h1>家長模式：查任何英文單字</h1>
        <form class="search" autocomplete="off">
          <input type="search" name="q" placeholder="輸入英文單字，例如 dangerous" value="${w ? esc(w) : ''}" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="英文單字">
          <button class="btn primary" type="submit">拆音節</button>
        </form>
        <p class="muted small">先查內建單字庫，查不到再查線上字典；都查不到時，依拼字規則推測並標示「未經發音驗證」。</p>
      </section>
      <div id="result">${w ? '<p class="loading">查詢中…</p>' : browseHTML()}</div>`;
    app.querySelector('form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const q = ev.target.q.value.trim().toLowerCase().replace(/[^a-z]/g, '');
      if (q) go('#/p/w/' + q);
    });
    if (w) showParentWord(w);
    window.scrollTo(0, 0);
  }
  function browseHTML() {
    return `<section class="browse"><h2>內建單字</h2>${THEMES.map((t) => `
      <div class="browse-group"><h3>${t.emoji} ${t.zh}</h3><div class="chips">
      ${t.words.map(([x]) => `<a class="chip ${learned[x] ? 'is-done' : ''}" href="#/p/w/${x}">${x}</a>`).join('')}</div></div>`).join('')}
      <p class="muted small">孩子的學習進度只存在這台裝置。<button class="linklike" data-reset>清除這台裝置的進度</button></p></section>`;
  }
  async function showParentWord(w) {
    const box = document.getElementById('result');
    const e = await lookup(w);
    if (!e) { box.innerHTML = '<p class="warn">請輸入英文字母。</p>'; return; }
    const r = analyzeEntry(e);
    const rows = E.steps(r);
    const checks = E.selfCheck(r);
    box.innerHTML = `
      ${wordCardHTML(e, r)}
      <section class="panel">
        <h2>最終音節劃分</h2>
        <p class="final"><span class="ipa">${r.ipa ? esc(r.ipa) : '（無 IPA）'}</span><span class="split">${r.syllables.join(' · ')}</span></p>
        ${r.adjusted ? `<p class="note">👂 規則推得 ${r.ruleSyllables.join('-')}，依實際發音調整為 ${r.syllables.join('-')}。</p>` : ''}
        ${e.defEn ? `<p class="muted small">英文解釋：${esc(e.defEn)}</p>` : ''}
        <div class="zh-edit">
          <label>中文意思 <input type="text" value="${esc(e.zh || '')}" data-zh placeholder="輸入中文意思"></label>
          <button class="btn small" data-save-zh>儲存</button>
          ${zhFix[r.word] ? '<button class="btn small ghost" data-clear-zh>還原</button>' : ''}
        </div>
        <p class="muted small">修正的中文只存在這台裝置。</p>
      </section>
      <section class="panel">
        <h2>中文講解 <button class="btn small ghost" data-copy="zh">複製</button></h2>
        <div class="script" data-script="zh">${esc(E.scriptZh(r)).replace(/\n/g, '<br>')}</div>
      </section>
      <section class="panel">
        <h2>English Script <button class="btn small ghost" data-copy="en">複製</button> <button class="btn small ghost" data-read-en>🔊 朗讀</button></h2>
        <div class="script" data-script="en">${esc(E.scriptEn(r)).replace(/\n/g, '<br>')}</div>
      </section>
      <details class="panel">
        <summary><h2>七步分析表</h2></summary>
        <table class="steps"><tbody>${rows.map(([a, b]) => `<tr><th>${esc(a)}</th><td>${esc(b)}</td></tr>`).join('')}</tbody></table>
        <h3>自檢清單</h3>
        <ul class="checks">${checks.map(([t, ok]) => `<li class="${ok ? 'ok' : 'no'}">${ok ? '✅' : '⚠️'} ${esc(t)}</li>`).join('')}</ul>
        ${r.warnings.length ? `<p class="warn">${r.warnings.map(esc).join('<br>')}</p>` : ''}
      </details>`;
    bindWordCard(e, r);
    box.querySelector('[data-save-zh]').addEventListener('click', () => {
      const v = box.querySelector('[data-zh]').value.trim();
      if (v) zhFix[r.word] = v; else delete zhFix[r.word];
      store.set('zhfix', zhFix); showHint('✅ 已儲存中文意思'); showParentWord(w);
    });
    const clr = box.querySelector('[data-clear-zh]');
    if (clr) clr.addEventListener('click', () => { delete zhFix[r.word]; store.set('zhfix', zhFix); showParentWord(w); });
    box.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
      const txt = b.dataset.copy === 'zh' ? E.scriptZh(r) : E.scriptEn(r);
      try { await navigator.clipboard.writeText(txt); showHint('📋 已複製'); } catch (err) { showHint('無法複製，請手動選取文字'); }
    }));
    box.querySelector('[data-read-en]').addEventListener('click', () => speak(E.scriptEn(r).split('\n').map((t) => t.replace(/\/[^/]+\//g, '')), 0.85));
  }
  app.addEventListener('click', (ev) => {
    if (ev.target.matches('[data-reset]') && confirm('確定要清除這台裝置的學習進度嗎？')) { learned = {}; store.set('learned', learned); render(); }
  });

  render();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
