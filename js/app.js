(async function () {
  const { BASE_WORDS } = window.PK_DATA;
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
  // 舊版「我會了」與本機中文修正已停用（改為闖關得星、申請單修正）
  store.del('learned'); store.del('zhfix');
  let progress = store.get('box', {}); // { word: 已完成關數 0～3 }
  let mode = store.get('mode', 'kid');

  // ---------- 資料：內建單字庫 + 申請單加入的單字與修正 ----------
  let custom = { words: [], fixes: {} };
  try { custom = await (await fetch('data/custom-words.json', { cache: 'no-cache' })).json(); } catch (e) { /* 離線時只用內建字 */ }
  const THEMES = window.PK_DATA.THEMES.map((t) => ({ id: t.id, zh: t.zh, emoji: t.emoji, groups: t.groups || null, words: t.words.map((w) => w.slice()) }));
  THEMES.push({ id: 'mine', zh: '我的單字', emoji: '🌟', words: [] });
  const LIB = new Map();
  THEMES.forEach((t) => t.words.forEach(([w, zh, emoji, ipa, syl]) => { if (!LIB.has(w)) LIB.set(w, { word: w, zh, emoji, ipa, syl, theme: t.id }); }));
  (custom.words || []).forEach((c) => {
    if (!c.word || LIB.has(c.word)) return;
    const theme = THEMES.find((t) => t.id === c.theme) || THEMES.find((t) => t.id === 'mine');
    theme.words.push([c.word, c.zh || '', c.emoji || '🌟', c.ipa || '', c.syl || '']);
    LIB.set(c.word, { word: c.word, zh: c.zh || '', emoji: c.emoji || '🌟', ipa: c.ipa || '', syl: c.syl || '', theme: theme.id, custom: true });
  });
  Object.entries(custom.fixes || {}).forEach(([w, f]) => {
    const e = LIB.get(w); if (!e) return;
    Object.assign(e, f);
    const t = THEMES.find((x) => x.id === e.theme);
    const row = t && t.words.find((x) => x[0] === w);
    if (row) { if (f.zh) row[1] = f.zh; if (f.ipa) row[3] = f.ipa; if (f.syl) row[4] = f.syl; }
  });
  const KNOWN = new Set([...BASE_WORDS, ...LIB.keys()]);

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
      ipa: ((uk && uk.text) || anyText.text || '').replace(/əʊ/g, 'oʊ'), // 長音 o 統一標成 /oʊ/
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
    return Object.assign({ word: w, emoji: '🔤', syl: null, source: info.ipa ? 'dict' : 'none', mt: !!info.zh }, info);
  }
  const analyzeEntry = (e) => P.analyze(e.word, { ipa: e.ipa, ipaSource: e.source, zh: e.zh, known: KNOWN, libSyllables: e.syl || undefined });

  // ---------- 小工具 ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const starsHTML = (n) => '★'.repeat(n) + '<span class="dim">' + '★'.repeat(5 - n) + '</span>';
  const stageDots = (w) => { const d = progress[w] || 0; return [1, 2, 3].map((i) => `<span class="sdot${i <= d ? ' on' : ''}"></span>`).join(''); };
  let hintTimer;
  function showHint(html, ms = 2800) {
    hintEl.innerHTML = html; hintEl.hidden = false; hintEl.classList.remove('show'); void hintEl.offsetWidth; hintEl.classList.add('show');
    clearTimeout(hintTimer); hintTimer = setTimeout(() => { hintEl.classList.remove('show'); setTimeout(() => (hintEl.hidden = true), 250); }, ms);
  }
  window.PK_SHOWHINT = showHint;
  // 家長模式：顯示剛剛播放的聲音來源，方便確認是不是 AI 語音檔
  const srcBadge = document.createElement('div');
  srcBadge.className = 'src-badge'; srcBadge.hidden = true;
  document.body.appendChild(srcBadge);
  A.setOnSource((src) => {
    if (mode !== 'parent') { srcBadge.hidden = true; return; }
    srcBadge.textContent = '🔈 剛剛的聲音來源：' + src;
    srcBadge.hidden = false;
  });
  const libStars = {};
  LIB.forEach((e, w) => { libStars[w] = analyzeEntry(Object.assign({ source: 'lib' }, e)).stars; });
  const sortedWords = (t) => t.words.slice().sort((a, b) => libStars[a[0]] - libStars[b[0]]);
  function flash(el) { if (!el) return; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  function burst(el, big) {
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
  function issueURL(title, lines) {
    const body = lines.join('\n');
    return `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
  }

  // ---------- 路由 ----------
  function go(hash) { if (location.hash !== hash) location.hash = hash; else render(); }
  window.addEventListener('hashchange', render);
  document.querySelector('.logo').addEventListener('click', () => go(mode === 'kid' ? '#/' : '#/p'));
  document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
    const m = location.hash.match(/^#\/(?:p\/)?w\/([a-z]+)/);
    const target = b.dataset.mode;
    go(target === 'kid' ? (m && LIB.has(m[1]) ? '#/w/' + m[1] : '#/') : (m ? '#/p/w/' + m[1] : '#/p'));
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
    if (h === '#/p/rules') { setMode('parent'); return renderRuleMap(); }
    if ((m = h.match(/^#\/p(?:\/w\/([a-z]+))?$/))) { setMode('parent'); return renderParent(m[1]); }
    setMode('kid');
    if ((m = h.match(/^#\/t\/([a-z]+)(?:\/([a-z]+))?$/))) return renderTheme(m[1], m[2]);
    if ((m = h.match(/^#\/w\/([a-z]+)\/box\/([123])$/))) return renderBox(m[1], +m[2]);
    if ((m = h.match(/^#\/w\/([a-z]+)$/))) return renderKidWord(m[1]);
    return renderHome();
  }

  // ---------- 孩子模式：首頁 ----------
  function renderHome() {
    const all = [...LIB.keys()];
    const done = all.filter((w) => (progress[w] || 0) >= 3).length;
    app.innerHTML = `
      <section class="hero">
        <h1>今天想認識什麼字？</h1>
        <p class="progress-line">🌟 已經拿到 <b>${done}</b> / ${all.length} 顆大星星</p>
      </section>
      <section class="themes">
        ${THEMES.filter((t) => t.words.length || t.id === 'mine').map((t) => {
          const n = t.words.length, d = t.words.filter(([w]) => (progress[w] || 0) >= 3).length;
          return `<a class="theme-card${t.id === 'mine' ? ' mine' : ''}" href="#/t/${t.id}">
            <span class="theme-emoji">${t.emoji}</span>
            <span class="theme-name">${t.zh}</span>
            <span class="theme-meter"><span style="width:${n ? Math.round(d / n * 100) : 0}%"></span></span>
            <span class="theme-count">${n ? `${d} / ${n}` : '還沒有字'}</span>
          </a>`;
        }).join('')}
      </section>`;
    window.scrollTo(0, 0);
  }

  // ---------- 孩子模式：主題 ----------
  function renderTheme(id, focus) {
    const t = THEMES.find((x) => x.id === id);
    if (!t) return renderHome();
    if (t.groups) return renderGroupedTheme(t, focus);
    const words = sortedWords(t);
    const mine = id === 'mine';
    app.innerHTML = `
      <nav class="crumbs"><a href="#/" class="back">← 主題</a><h1>${t.emoji} ${t.zh}</h1></nav>
      <p class="legend">${mine ? '家長加進來的字都在這裡。按 🗂 可以幫單字換到其他主題。' : '★ 越多越有挑戰，從一顆星開始吧！'}</p>
      ${!words.length ? `<p class="empty">還沒有字。到「家長模式」查一個字，按「➕ 加入單字庫」就會出現在這裡。</p>` : ''}
      <section class="word-grid">
        ${words.map(([w, zh, emoji]) => {
          const big = (progress[w] || 0) >= 3;
          return `<div class="word-card-wrap">
          <a class="word-card ${big ? 'is-done' : ''}" href="#/w/${w}">
            ${big ? '<span class="done-badge" aria-label="拿到大星星">🌟</span>' : ''}
            <span class="wc-emoji">${emoji}</span>
            <span class="wc-word">${w}</span>
            <span class="wc-zh">${esc(zh)}</span>
            <span class="wc-stars" aria-label="難度 ${libStars[w]} 顆星">${starsHTML(libStars[w])}</span>
            <span class="wc-stage" aria-label="音素框完成 ${progress[w] || 0} 關">${stageDots(w)}</span>
          </a>
          ${mine ? `<button class="move-btn" data-move="${w}" aria-label="幫 ${w} 換主題">🗂</button>` : ''}
          </div>`;
        }).join('')}
      </section>`;
    app.querySelectorAll('[data-move]').forEach((b) => b.addEventListener('click', () => openMove(b.dataset.move)));
    window.scrollTo(0, 0);
  }

  // 規則小教室：依規則分組顯示
  function wordCardLink(w, zh, emoji) {
    const big = (progress[w] || 0) >= 3;
    return `<div class="word-card-wrap"><a class="word-card ${big ? 'is-done' : ''}" href="#/w/${w}">
      ${big ? '<span class="done-badge" aria-label="拿到大星星">🌟</span>' : ''}
      <span class="wc-emoji">${emoji}</span><span class="wc-word">${w}</span><span class="wc-zh">${esc(zh)}</span>
      <span class="wc-stage" aria-label="音素框完成 ${progress[w] || 0} 關">${stageDots(w)}</span></a></div>`;
  }
  function renderGroupedTheme(t, focus) {
    app.innerHTML = `
      <nav class="crumbs"><a href="#/" class="back">← 主題</a><h1>${t.emoji} ${t.zh}</h1></nav>
      <nav class="group-chips">${t.groups.map((g) => `<a class="chip" href="#/t/${t.id}/${g.id}">${g.icon} ${g.zh}</a>`).join('')}</nav>
      ${t.groups.map((g) => {
        const ws = t.words.filter((w) => w[5] === g.id);
        return ws.length ? `<section class="rule-group" id="g-${g.id}"><h2>${g.icon} ${g.zh}</h2>
          <div class="word-grid">${ws.map(([w, zh, emoji]) => wordCardLink(w, zh, emoji)).join('')}</div></section>` : '';
      }).join('')}`;
    const target = focus && document.getElementById('g-' + focus);
    if (target) { target.classList.add('focus'); target.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); } else window.scrollTo(0, 0);
  }

  // ---------- 家長模式：規則地圖 ----------
  function renderRuleMap() {
    const { RULE_MAP } = window.PK_RULEMAP;
    const chip = (w) => `<a class="chip" href="#/p/w/${w.replace(/[^a-z]/g, '')}">${esc(w)}</a>`;
    app.innerHTML = `
      <nav class="crumbs"><a href="#/p" class="back">← 家長模式</a><h1>🗺️ 自然發音規則地圖</h1></nav>
      <p class="legend">依 rules.md 附錄 B 整理。點例字可以看完整拆解；點「帶孩子練習」會打開規則小教室對應的那一組字。</p>
      ${RULE_MAP.map((cat) => `
        <section class="panel rule-cat">
          <h2>${cat.icon} ${cat.zh}</h2>
          ${cat.items.map((it) => `
            <details class="rule-item">
              <summary>${esc(it.title)}</summary>
              <p>${esc(it.desc)}</p>
              ${it.words.length ? `<div class="chips">${it.words.map(chip).join('')}</div>` : ''}
              ${it.more && it.more.length ? `<p class="muted small">更多例字（說明用）：${it.more.map((m) => /^[a-z]+$/.test(m) ? chip(m) : esc(m)).join(' ')}</p>` : ''}
              ${it.group ? `<a class="btn small primary" href="#/t/rules/${it.group}">🧒 帶孩子練習</a>` : ''}
            </details>`).join('')}
        </section>`).join('')}`;
    window.scrollTo(0, 0);
  }

  // 換主題：選好主題後開 GitHub 申請單，送出後所有裝置同步
  function openMove(w) {
    const dlg = document.createElement('div');
    dlg.className = 'dialog-back';
    dlg.innerHTML = `<div class="dialog" role="dialog" aria-label="換主題">
      <h2>把 <b>${w}</b> 放到哪個主題？</h2>
      <div class="dialog-grid">${THEMES.filter((t) => t.id !== 'mine').map((t) => `<button class="btn ghost" data-to="${t.id}">${t.emoji} ${t.zh}</button>`).join('')}</div>
      <p class="muted small">按下後會開啟 GitHub 申請單，請按「Submit new issue」送出；幾分鐘後所有裝置都會更新。</p>
      <button class="btn small" data-close>取消</button></div>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('click', (ev) => {
      const to = ev.target.closest('[data-to]');
      if (to) {
        window.open(issueURL(`換主題：${w}`, ['pk-action: move', `word: ${w}`, `theme: ${to.dataset.to}`, '', '（送出後自動流程會把這個字移到新的主題。）']), '_blank', 'noopener');
        dlg.remove();
      } else if (ev.target === dlg || ev.target.matches('[data-close]')) dlg.remove();
    });
  }

  // ---------- 字卡（兩種模式共用） ----------
  const SYL_COLORS = ['c1', 'c2', 'c3', 'c4', 'c5'];
  function tileClass(u) {
    if (u.type === 'S' || u.phSilent || u.ruleSilent) return 'silent';
    if (u.type === 'V') return { team: 'team', team_r: 'team', bossy: 'bossy', le: 'team' }[u.sub] || 'vowel';
    return u.sub === 'digraph' || u.sub === 'trigraph' || u.sub === 'suffix_sh' ? 'digraph' : 'cons';
  }
  function wordCardHTML(e, r, opts = {}) {
    const sylHTML = r.syllables.map((s, i) => {
      const tiles = r.units.filter((u) => u.syl === i).map((u) => {
        const idx = r.units.indexOf(u);
        const cls = `tile ${tileClass(u)}${u.magic ? ' magic' : ''}${u.magicBy ? ' magic-v' : ''}${u.weak ? ' weak' : ''}${u.inBlend ? ' blend' : ''}`;
        const tile = `<button class="${cls}" data-unit="${idx}" aria-label="${u.text}">${u.text}${u.weak ? '<span class="weak-tag">輕</span>' : ''}</button>`;
        return tile + (u.blendNext ? '<span class="blend-link" aria-hidden="true">〰</span>' : '');
      }).join('');
      const cut = r.cuts[i];
      const R = cut && P.RULES[cut.rule];
      const chip = i < r.syllables.length - 1 ? `<span class="rule-chip" title="${R ? R.zh : '依發音'}">${R ? R.icon : '👂'}<small>${R ? R.zh.replace('法則', '') : '依發音'}</small></span>` : '';
      return `<div class="syl ${SYL_COLORS[i % 5]}"><button class="syl-say" data-syl="${i}" aria-label="念 ${s}">🔊 ${s}</button><div class="tiles">${tiles}</div></div>${chip}`;
    }).join('');
    const accurate = A.isAI(e);
    const d = progress[r.word] || 0;
    return `
      <article class="card">
        <div class="card-head">
          <span class="big-emoji">${e.emoji || '🔤'}</span>
          <div>
            <button class="big-word" data-say-word>${esc(r.word)} <span class="spk">🔊</span></button>
            <div class="meaning">${e.zh ? `<span class="zh">${esc(e.zh)}</span>` : '<span class="zh muted">（還沒有中文意思）</span>'}${e.mt ? '<span class="tag">自動翻譯</span>' : ''}</div>
          </div>
        </div>
        ${r.verified ? '' : '<p class="warn">⚠️ 這個字沒查到發音，以下是依拼字規則推測（未經發音驗證）</p>'}
        ${!accurate && opts.parent ? '<p class="note">🔈 這個字還沒有 AI 語音檔，音節和單音暫時用瀏覽器語音，發音較不精準。</p>' : ''}
        <div class="syl-row">${sylHTML}</div>
        <p class="tap-tip">👆 點字母聽單音，點 🔊 聽音節</p>
        <div class="actions">
          <button class="btn primary" data-blend>👏 拼起來</button>
          ${opts.noBox ? '' : `<a class="btn star" href="#/w/${r.word}/box/${Math.min(d + 1, 3)}">🔲 音素框練習 <span class="stage-dots">${stageDots(r.word)}</span></a>`}
        </div>
      </article>`;
  }

  // 提示只顯示音標與規則（不顯示代表字）
  function soundHint(u) {
    if (u.type === 'S' || u.key === 'silent' || u.phSilent || u.ruleSilent) {
      if (u.magic) { const v = curAnalysis.units.find((x) => x.magicBy); return `✨ <b>e</b> 是魔法 e：自己不出聲，讓 <b>${v ? v.text : '母音'}</b> 念自己的名字${v && v.ph ? ` <span class="h-ipa">/${v.ph}/</span>` : ''}`; }
      if (u.fakeMagic) return '🎭 <b>e</b> 是假魔法 e：不出聲，前面的母音仍念短音（英文字不以 v 結尾）';
      if (u.sub === 'ed_e') return '🤫 <b>e</b> 不出聲：-ed 接在 t、d 以外的字後面，不多一個音節';
      return `🤫 <b>${u.text}</b> 在這裡不發音`;
    }
    const s = SOUNDS[u.key] || {};
    const ipa = u.ph || s.ipa;
    if (!ipa) return `<b>${u.text}</b>`;
    let rule;
    if (u.text === 'y') rule = P.yRole(curAnalysis, u);
    else if (u.inBlend) { const b = (curAnalysis.blends || []).find((x) => x.includes(u.text)) || u.text; rule = `輔音連綴 ${b}：每個字母都發音，快速滑過`; }
    else if (u.weak) rule = '弱母音：不是重音的音節，輕輕念 /ə/';
    else if (u.wildOld) rule = '閉音節長音特例：在 -nd、-ld、-lt、-st 前念長音';
    else if (u.sub === 'bossy') rule = '霸道 R';
    else if (u.sub === 'team' || u.sub === 'team_r') rule = '母音組合，一起念';
    else if (u.sub === 'digraph' || u.sub === 'trigraph') rule = '好朋友字母，一起念';
    else if (u.sub === 'le') rule = '字尾 le';
    else if (u.sub === 'suffix_sh') rule = `字尾 ${u.text}on 的一部分，整體不拆`;
    else if (u.sub === 'ture_t' || u.sub === 'ure') rule = '字尾 ture 的一部分，整體念 /tʃə/';
    else if (u.key.startsWith('long_')) rule = '長音，念自己的名字';
    else if (u.key.startsWith('short_')) rule = '短音';
    else if (u.key === 'schwa') rule = '輕聲，輕輕念';
    else if (u.type === 'C') rule = u.dbl ? '重複字母，同一個音' : '子音';
    else rule = s.zh || '';
    const note = P.ruleNote(curAnalysis, u);
    if (note && (u.text === 'y' || u.inBlend || u.weak)) note.why = rule; // 這三種以專屬說明為主
    return `<b>${u.text}</b> 念 <span class="h-ipa">/${ipa}/</span>　<span class="h-rule">${note ? note.why : rule}</span>`;
  }
  let curAnalysis = null;

  // 魔法 e 連線：在字母卡下方畫一條彎彎的線，從 e 連到它影響的母音
  function drawMagicLine(card, r) {
    const row = card.querySelector('.syl-row');
    const old = row.querySelector('.magic-line');
    if (old) old.remove();
    const ei = r.units.findIndex((x) => x.magic), vi = r.units.findIndex((x) => x.magicBy);
    if (ei < 0 || vi < 0) return;
    const et = row.querySelector(`.tile[data-unit="${ei}"]`), vt = row.querySelector(`.tile[data-unit="${vi}"]`);
    if (!et || !vt) return;
    const base = row.getBoundingClientRect(), a = vt.getBoundingClientRect(), b = et.getBoundingClientRect();
    const x1 = a.left + a.width / 2 - base.left, x2 = b.left + b.width / 2 - base.left;
    const y = Math.max(a.bottom, b.bottom) - base.top + 2, depth = 18;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'magic-line');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.left = '0'; svg.style.top = '0';
    svg.setAttribute('width', base.width); svg.setAttribute('height', y + depth + 14);
    svg.innerHTML = `<path d="M${x1} ${y} Q ${(x1 + x2) / 2} ${y + depth * 2} ${x2} ${y}" /><text x="${(x1 + x2) / 2}" y="${y + depth + 10}" text-anchor="middle">✨</text>`;
    row.appendChild(svg);
  }
  let magicResize;
  window.addEventListener('resize', () => { clearTimeout(magicResize); magicResize = setTimeout(() => { const c = app.querySelector('.card'); if (c && curAnalysis) drawMagicLine(c, curAnalysis); }, 150); });

  function bindWordCard(e, r) {
    curAnalysis = r;
    const card = app.querySelector('.card');
    card.querySelector('[data-say-word]').addEventListener('click', () => A.play(A.word(e)));
    card.querySelectorAll('.syl-say').forEach((b) => b.addEventListener('click', () => {
      const i = +b.dataset.syl;
      A.play(A.syllable(e, i, r.syllables[i], { onstart: () => flash(card.querySelectorAll('.syl')[i]) }));
    }));
    card.querySelectorAll('.tile').forEach((b) => b.addEventListener('click', () => {
      const u = r.units[+b.dataset.unit];
      flash(b);
      showHint(soundHint(u));
      if (u.magic) {
        // 點魔法 e：前面的母音閃一下，念出長音
        const vi = r.units.findIndex((x) => x.magicBy);
        const vt = card.querySelector(`.tile[data-unit="${vi}"]`);
        const line = card.querySelector('.magic-line');
        if (line) flash(line);
        if (vi >= 0) A.play(A.phonemeIPA(r.units[vi].ph, r.units[vi].key, { onstart: () => flash(vt) }));
        return;
      }
      if (!u.phSilent && !u.ruleSilent && u.type !== 'S') A.play(A.phonemeIPA(u.ph, u.key));
    }));
    drawMagicLine(card, r);
    card.querySelector('[data-blend]').addEventListener('click', () => {
      const syls = card.querySelectorAll('.syl');
      const seq = [];
      r.syllables.forEach((s, i) => { seq.push(A.syllable(e, i, s, { onstart: () => flash(syls[i]) })); seq.push({ pause: 250 }); });
      if (r.syllables.length > 1) seq.push(A.word(e, { onstart: () => syls.forEach(flash) }));
      A.play(seq);
    });
  }

  // ---------- 孩子模式：單字 ----------
  async function renderKidWord(w) {
    if (!LIB.has(w)) return renderHome();
    const e = await lookup(w);
    const r = analyzeEntry(e);
    const t = THEMES.find((x) => x.id === LIB.get(w).theme);
    const list = sortedWords(t).map((x) => x[0]);
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

  // ---------- 音素框練習 ----------
  async function renderBox(w, stage) {
    if (!LIB.has(w)) return renderHome();
    const done = progress[w] || 0;
    if (stage > done + 1) return go(`#/w/${w}/box/${done + 1}`);
    const e = await lookup(w);
    const r = analyzeEntry(e);
    const boxes = P.elkonin(r);
    app.innerHTML = `
      <nav class="crumbs"><a href="#/w/${w}" class="back">← ${esc(w)}</a></nav>
      <div class="stage-tabs">
        ${[1, 2, 3].map((s) => {
          const locked = s > done + 1, ok = s <= done;
          return `<a class="stage-tab${s === stage ? ' current' : ''}${locked ? ' locked' : ''}" ${locked ? 'aria-disabled="true"' : `href="#/w/${w}/box/${s}"`}>
            <span>${locked ? '🔒' : ok ? '⭐' : BOX.STAGES[s].icon}</span>第 ${s} 關<small>${BOX.STAGES[s].name}</small></a>`;
        }).join('')}
      </div>
      <section class="card" id="boxmount"></section>
      <div id="boxdone"></div>`;
    BOX.mount(app.querySelector('#boxmount'), {
      entry: e, analysis: r, boxes, stage,
      onComplete: (s) => {
        const first = (progress[w] || 0) < s;
        if (first) { progress[w] = s; store.set('box', progress); }
        const allDone = (progress[w] || 0) >= 3;
        const box = app.querySelector('#boxdone');
        box.innerHTML = `<div class="done-panel">
          <p class="done-big">${allDone && s === 3 ? '🌟 三關都完成，拿到大星星！' : '⭐ 過關了，拿到一顆小星星！'}</p>
          <div class="actions">
            <button class="btn ghost" data-again>🔁 再玩一次</button>
            ${s < 3 ? `<a class="btn primary" href="#/w/${w}/box/${s + 1}">下一關 ➡</a>` : `<a class="btn primary" href="#/t/${LIB.get(w).theme}">選下一個字 ➡</a>`}
          </div></div>`;
        burst(box.querySelector('.done-big'), s === 3);
        box.querySelector('[data-again]').addEventListener('click', () => renderBox(w, s));
        box.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // 更新關卡標籤
        app.querySelectorAll('.stage-tab').forEach((tab, k) => {
          const sn = k + 1, d2 = progress[w] || 0;
          if (sn <= d2) tab.querySelector('span').textContent = '⭐';
          if (sn === d2 + 1) { tab.classList.remove('locked'); tab.removeAttribute('aria-disabled'); tab.setAttribute('href', `#/w/${w}/box/${sn}`); tab.querySelector('span').textContent = BOX.STAGES[sn].icon; }
        });
      },
    });
    window.scrollTo(0, 0);
  }

  // ---------- 家長模式 ----------
  function renderParent(w) {
    app.innerHTML = `
      <section class="parent-search">
        <h1>家長模式：查任何英文單字</h1>
        <form class="search" autocomplete="off">
          <input type="search" name="q" placeholder="輸入英文單字，例如 umbrella" value="${w ? esc(w) : ''}" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="英文單字">
          <button class="btn primary" type="submit">拆音節</button>
        </form>
        <p class="muted small">先查內建單字庫，查不到再查線上字典（英式）；都查不到時，依拼字規則推測並標示「未經發音驗證」。</p>
        <a class="btn small" href="#/p/rules">🗺️ 自然發音規則地圖</a>
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
    return `<section class="browse"><h2>單字庫</h2>${THEMES.filter((t) => t.words.length).map((t) => `
      <div class="browse-group"><h3>${t.emoji} ${t.zh}</h3><div class="chips">
      ${t.words.map(([x]) => `<a class="chip ${(progress[x] || 0) >= 3 ? 'is-done' : ''}" href="#/p/w/${x}">${x}</a>`).join('')}</div></div>`).join('')}
      <p class="muted small">孩子的闖關進度只存在這台裝置。<button class="linklike" data-reset>清除這台裝置的進度</button></p></section>`;
  }
  async function showParentWord(w) {
    const box = document.getElementById('result');
    const e = await lookup(w);
    if (!e) { box.innerHTML = '<p class="warn">請輸入英文字母。</p>'; return; }
    const r = analyzeEntry(e);
    const inLib = LIB.has(r.word);
    const rows = E.steps(r);
    const checks = E.selfCheck(r);
    const addURL = issueURL(`加入單字：${r.word}`, ['pk-action: add', `word: ${r.word}`, '', '（送出後會自動加入「我的單字」，並產生音標、音節、中文意思與語音，約幾分鐘後網站更新。）']);
    const fixURL = issueURL(`回報錯誤：${r.word}`, ['pk-action: fix', `word: ${r.word}`, `ipa: ${r.ipa || ''}`, `syllables: ${r.syllables.join('-')}`, `zh: ${e.zh || ''}`, '', '（請直接修改上面需要更正的欄位，再按 Submit new issue 送出。）']);
    box.innerHTML = `
      ${wordCardHTML(e, r, { parent: true, noBox: !inLib })}
      <section class="panel">
        <h2>最終音節劃分</h2>
        <p class="final"><span class="ipa">${r.ipa ? esc(r.ipa) : '（無 IPA）'}</span><span class="split">${r.syllables.join(' · ')}</span></p>
        ${r.spell ? `<p class="note">✂️ ${esc(E.spellZh(r.spell))}${r.spell.type === 'double' ? `：<b>${r.spell.base}</b>＋<b>${r.spell.letter}</b>＋<b>${r.spell.suffix}</b>` : r.spell.type === 'drop_e' ? `：<b>${r.spell.base.slice(0, -1)}</b>（去 e）＋<b>${r.spell.suffix}</b>` : r.spell.type === 'y_to_i' ? `：<b>${r.spell.base.slice(0, -1)}i</b>＋<b>${r.spell.suffix}</b>` : ''}</p>` : ''}
        ${r.adjusted ? `<p class="note">👂 規則推得 ${r.ruleSyllables.join('-')}，依實際發音調整為 ${r.syllables.join('-')}。</p>` : ''}
        ${e.defEn ? `<p class="muted small">英文解釋：${esc(e.defEn)}</p>` : ''}
        <p class="muted small">音素框：${P.elkonin(r).map((b) => (b.silent ? `(${b.letters})` : `${b.letters} /${b.ph || (SOUNDS[b.key] || {}).ipa || '?'}/`)).join(' ｜ ')}</p>
        ${r.phMapped ? '' : '<p class="note">⚠️ 這個字的音標無法逐一對應到字母，字母卡的音依拼字規則推測。</p>'}
        <div class="gh-actions">
          ${inLib ? `<a class="btn small" href="${fixURL}" target="_blank" rel="noopener">🛠 回報錯誤</a>
                     ${LIB.get(r.word).custom ? `<button class="btn small" data-move="${r.word}">🗂 換主題</button>` : ''}`
                  : `<a class="btn small primary" href="${addURL}" target="_blank" rel="noopener">➕ 加入單字庫</a>`}
        </div>
        <p class="muted small">按鈕會開啟 GitHub 申請單（需登入 GitHub），按「Submit new issue」送出後，自動流程會更新單字庫與語音，所有裝置同步。</p>
      </section>
      <section class="panel">
        <h2>中文講解 <button class="btn small ghost" data-copy="zh">複製</button></h2>
        <div class="script">${esc(E.scriptZh(r)).replace(/\n/g, '<br>')}</div>
      </section>
      <section class="panel">
        <h2>English Script <button class="btn small ghost" data-copy="en">複製</button></h2>
        <div class="script" data-script="en">${esc(E.scriptEn(r)).replace(/\n/g, '<br>')}</div>
      </section>
      <details class="panel">
        <summary><h2>七步分析表</h2></summary>
        <table class="steps"><tbody>${rows.map(([a, b]) => `<tr><th>${esc(a)}</th><td>${esc(b)}</td></tr>`).join('')}</tbody></table>
        <h3>自檢清單</h3>
        <ul class="checks">${checks.map(([t, ok]) => `<li>${ok ? '✅' : '⚠️'} ${esc(t)}</li>`).join('')}</ul>
        ${r.warnings.length ? `<p class="warn">${r.warnings.map(esc).join('<br>')}</p>` : ''}
      </details>`;
    bindWordCard(e, r);
    box.querySelectorAll('[data-move]').forEach((b) => b.addEventListener('click', () => openMove(b.dataset.move)));
    box.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
      const txt = b.dataset.copy === 'zh' ? E.scriptZh(r) : E.scriptEn(r);
      try { await navigator.clipboard.writeText(txt); showHint('📋 已複製'); } catch (err) { showHint('無法複製，請手動選取文字'); }
    }));
  }
  app.addEventListener('click', (ev) => {
    if (ev.target.matches('[data-reset]') && confirm('確定要清除這台裝置的闖關進度嗎？')) { progress = {}; store.set('box', progress); render(); }
  });

  render();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
