/*
 * Elkonin Boxes（音素框）互動
 *   第 1 關 推代幣：先聽示範，每聽到一個音，把一個代幣推進一格（拆音）
 *   第 2 關 放字母：把字母卡拖進對的格子；好朋友字母、重複字母是一張卡
 *   第 3 關 滑讀：手指沿著箭頭從左滑到右，滑過一格念一個音，滑到底念整個字（拼讀）
 *   第 0 級 音節拍拍手：一格一個音節，每拍推一個代幣
 * 多音節字（第 8 級）用雙層格子：一個音節一個大框，大框裡是音素小格。
 * 放錯會彈回並念出那一格的聲音；同一格錯兩次，正確的卡會閃動提示。
 */
(function (root) {
  const A = root.PK_AUDIO;
  const STAGES = [null,
    { name: '推代幣', icon: '🔴', tip: '聽一個音，就把一個代幣推進一格' },
    { name: '放字母', icon: '🔤', tip: '把字母卡拖進對的格子' },
    { name: '滑讀', icon: '👉', tip: '手指沿著箭頭滑過去，一格念一個音' },
  ];
  const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  function bounce(c) { c.classList.remove('bounce'); void c.offsetWidth; c.classList.add('bounce'); }
  function flash(x) { if (!x) return; x.classList.remove('flash'); void x.offsetWidth; x.classList.add('flash'); }
  function showTip(html) { if (root.PK_SHOWHINT) root.PK_SHOWHINT(html); }

  // 格子的 HTML：多音節時，依音節包成大框
  function boxesHTML(slots, fill) {
    const sylCount = new Set(slots.map((b) => b.syl)).size;
    const box = (b, k) => `<div class="ebox${b.silent ? ' silent' : ''}${b.weak ? ' weak' : ''}" data-slot="${k}">
      ${b.silent ? '<span class="ebox-tag">🤫 不出聲</span>' : ''}${b.weak && !b.silent ? '<span class="ebox-weak">輕</span>' : ''}<span class="ebox-fill">${fill ? fill(b) : ''}</span></div>`;
    if (sylCount <= 1) return `<div class="boxes" style="--n:${slots.length}">${slots.map(box).join('')}</div>`;
    const groups = [];
    slots.forEach((b, k) => { const g = groups.find((x) => x.syl === b.syl); if (g) g.items.push([b, k]); else groups.push({ syl: b.syl, items: [[b, k]] }); });
    return `<div class="boxes two-layer" style="--n:${slots.length + groups.length * 0.6}">${groups.map((g) => `<div class="sylframe">${g.items.map(([b, k]) => box(b, k)).join('')}</div>`).join('')}</div>`;
  }

  // 共用的拖曳：card 拖到 box 上
  function makeDrag(trayEl, boxEls, canStart, onDrop) {
    let drag = null;
    trayEl.addEventListener('pointerdown', (ev) => {
      const c = ev.target.closest('.card-drag');
      if (!c || !canStart() || c.classList.contains('used')) return;
      ev.preventDefault();
      const rect = c.getBoundingClientRect();
      const ghost = c.cloneNode(true);
      ghost.classList.add('ghost-drag');
      ghost.style.width = rect.width + 'px'; ghost.style.height = rect.height + 'px';
      document.body.appendChild(ghost);
      drag = { card: c, ghost, dx: ev.clientX - rect.left, dy: ev.clientY - rect.top };
      c.classList.add('lifted');
      move(ev);
      try { c.setPointerCapture(ev.pointerId); } catch (e) { /* 部分瀏覽器不支援 */ }
    });
    function move(ev) {
      if (!drag) return;
      drag.ghost.style.transform = `translate(${ev.clientX - drag.dx}px, ${ev.clientY - drag.dy}px) scale(1.08)`;
      const k = hitBox(ev.clientX, ev.clientY);
      boxEls.forEach((x, j) => x.classList.toggle('hover', j === k));
    }
    trayEl.addEventListener('pointermove', move);
    trayEl.addEventListener('pointerup', (ev) => {
      if (!drag) return;
      const { card, ghost } = drag;
      drag = null;
      boxEls.forEach((x) => x.classList.remove('hover'));
      ghost.remove();
      card.classList.remove('lifted');
      const k = hitBox(ev.clientX, ev.clientY);
      if (k >= 0) onDrop(card, k); // 沒放到格子上：回到原位，不算錯
    });
    trayEl.addEventListener('pointercancel', () => { if (drag) { drag.ghost.remove(); drag.card.classList.remove('lifted'); drag = null; } });
    // 感應範圍放大 28px，手指不用對很準
    function hitBox(x, y) {
      let best = -1, bestD = Infinity;
      boxEls.forEach((b, k) => {
        const r = b.getBoundingClientRect(), pad = 28;
        if (x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad) {
          const d = Math.hypot(x - (r.left + r.right) / 2, y - (r.top + r.bottom) / 2);
          if (d < bestD) { bestD = d; best = k; }
        }
      });
      return best;
    }
  }

  /**
   * 第 2～8 級的三關：mount(el, { entry, boxes, stage, onComplete })
   */
  function mount(el, opts) {
    const { entry, boxes, stage } = opts;
    const S = STAGES[stage];
    // 第 1 關只處理有聲音的格子
    const slots = boxes.map((b, i) => Object.assign({ i, filled: '', errors: 0 }, b)).filter((b) => stage !== 1 || !b.silent);
    let cards = [];
    if (stage === 1) cards = slots.map((b, i) => ({ id: 'c' + i, label: '', token: true }));
    else if (stage === 2) cards = shuffle(slots.map((b, i) => ({ id: 'c' + i, label: b.letters })));
    let started = false, finished = false;

    el.innerHTML = `
      <div class="box-stage">
        <div class="box-head">
          <span class="box-emoji">${entry.emoji || '🔤'}</span>
          <div><p class="box-title">${S.icon} 第 ${stage} 關：${S.name}</p><p class="box-tip">${S.tip}</p></div>
          <button class="btn ghost small" data-hear>🔊 再聽一次</button>
        </div>
        ${boxesHTML(slots, stage === 3 ? (b) => b.letters : null)}
        ${stage === 3 ? '<div class="slide-track waiting" aria-label="滑讀箭頭"><span class="slide-knob">👉</span><span class="slide-arrow"></span></div>'
                      : `<div class="tray waiting">${cards.map((c) => `<div class="card-drag${c.token ? ' token' : ''}" data-card="${c.id}">${c.token ? '' : c.label}</div>`).join('')}</div>`}
        <div class="box-start"><button class="btn primary big" data-start>▶ ${stage === 3 ? '先聽一次' : '先聽一聽'}</button></div>
      </div>`;

    const boxEls = [...el.querySelectorAll('.ebox')];
    const startBtn = el.querySelector('[data-start]');
    const sayBox = (b) => (b.silent ? { pause: 250 } : A.box(b));

    function highlightNext() {
      boxEls.forEach((x) => x.classList.remove('next'));
      if (stage === 1) { const k = slots.findIndex((b) => !b.filled); if (k >= 0) boxEls[k].classList.add('next'); }
    }
    async function demo() {
      const seq = [A.word(entry, { onstart: () => boxEls.forEach(flash) }), { pause: 400 }];
      slots.forEach((b, k) => { if (!b.silent) { const it = sayBox(b); it.onstart = () => flash(boxEls[k]); seq.push(it, { pause: 250 }); } });
      seq.push(A.word(entry));
      await A.play(seq);
    }
    const ready = () => started && !finished;
    startBtn.addEventListener('click', async () => {
      startBtn.parentElement.remove();
      started = true;
      const w = el.querySelector('.tray, .slide-track'); if (w) w.classList.remove('waiting');
      if (stage === 3) await A.play(A.word(entry, { onstart: () => boxEls.forEach(flash) }));
      else await demo();
      highlightNext();
    });
    el.querySelector('[data-hear]').addEventListener('click', () => (started ? demo() : startBtn.click()));
    boxEls.forEach((x, k) => x.addEventListener('click', () => { if (slots[k].filled || stage === 3) A.play(sayBox(slots[k])); }));

    async function finish() {
      finished = true;
      await new Promise((r) => setTimeout(r, 400));
      await A.play([A.word(entry, { onstart: () => boxEls.forEach(flash) })]);
      opts.onComplete && opts.onComplete(stage);
    }

    if (stage === 3) { slideRead(); highlightNext(); return; }

    // ---------- 第 1、2 關：拖曳 ----------
    const trayEl = el.querySelector('.tray');
    makeDrag(trayEl, boxEls, ready, (card, k) => {
      const b = slots[k];
      const label = card.textContent;
      const ok = stage === 1 ? slots.findIndex((x) => !x.filled) === k : !b.filled && label === b.letters;
      if (!ok) {
        bounce(card);
        if (stage === 1) { flash(boxEls[slots.findIndex((x) => !x.filled)]); return; }
        if (b.filled) { flash(boxEls[k]); return; }
        b.errors++;
        A.play(sayBox(b));
        if (b.silent) showTip('🤫 這一格放的是不出聲的字母');
        if (b.errors >= 2) {
          const c = [...trayEl.querySelectorAll('.card-drag:not(.used)')].find((x) => x.textContent === b.letters);
          if (c) { c.classList.remove('nudge'); void c.offsetWidth; c.classList.add('nudge'); }
        }
        return;
      }
      card.classList.add('used');
      b.filled = stage === 1 ? '●' : label;
      boxEls[k].querySelector('.ebox-fill').innerHTML = stage === 1 ? '<span class="coin"></span>' : label;
      boxEls[k].classList.add('done'); flash(boxEls[k]); A.play(sayBox(b));
      highlightNext();
      if (slots.every((x) => x.filled)) finish();
    });
    highlightNext();

    // ---------- 第 3 關：滑讀 ----------
    function slideRead() {
      const track = el.querySelector('.slide-track');
      const knob = track.querySelector('.slide-knob');
      let lit = -1, active = false;
      const centers = () => boxEls.map((b) => { const r = b.getBoundingClientRect(); return r.left + r.width / 2; });
      function at(x) {
        const tr = track.getBoundingClientRect();
        knob.style.left = Math.max(6, Math.min(tr.width - 58, x - tr.left - 26)) + 'px';
        const cs = centers();
        // 一次只往右走一格，不會跳過
        while (lit + 1 < slots.length && x >= cs[lit + 1] - 12) {
          lit++;
          boxEls[lit].classList.add('lit');
          if (!slots[lit].silent) A.play(sayBox(slots[lit]));
        }
        if (lit === slots.length - 1 && !finished) { active = false; setTimeout(finish, 450); }
      }
      track.addEventListener('pointerdown', (ev) => {
        if (!ready()) return;
        ev.preventDefault();
        active = true;
        try { track.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
        at(ev.clientX);
      });
      track.addEventListener('pointermove', (ev) => { if (active) at(ev.clientX); });
      const end = () => { active = false; };
      track.addEventListener('pointerup', end);
      track.addEventListener('pointercancel', end);
    }
  }

  /**
   * 第 0 級：音節拍拍手。mountSyllables(el, { entry, syllables, onComplete })
   */
  function mountSyllables(el, opts) {
    const { entry, syllables } = opts;
    const n = syllables.length;
    let started = false, filled = 0, finished = false;
    el.innerHTML = `
      <div class="box-stage">
        <div class="box-head">
          <span class="box-emoji">${entry.emoji || '🔤'}</span>
          <div><p class="box-title">👏 音節拍拍手</p><p class="box-tip">聽到幾拍，就推幾個代幣</p></div>
          <button class="btn ghost small" data-hear>🔊 再聽一次</button>
        </div>
        <div class="boxes syl-boxes" style="--n:${n}">${syllables.map((s, k) => `<div class="ebox sylbox" data-slot="${k}"><span class="ebox-fill"></span></div>`).join('')}</div>
        <div class="tray waiting">${syllables.map((s, k) => `<div class="card-drag token big-token" data-card="${k}"></div>`).join('')}</div>
        <div class="box-start"><button class="btn primary big" data-start>▶ 先聽一聽</button></div>
      </div>`;
    const boxEls = [...el.querySelectorAll('.ebox')];
    const trayEl = el.querySelector('.tray');
    const sylSay = (k) => A.syllable(entry, k, syllables[k]);
    async function demo() {
      const seq = [A.word(entry), { pause: 400 }];
      syllables.forEach((s, k) => { const it = sylSay(k); it.onstart = () => { flash(boxEls[k]); showTip('👏'); }; seq.push(it, { pause: 300 }); });
      seq.push(A.word(entry));
      await A.play(seq);
    }
    function next() { boxEls.forEach((x, k) => x.classList.toggle('next', k === filled)); }
    el.querySelector('[data-start]').addEventListener('click', async (ev) => {
      ev.currentTarget.parentElement.remove();
      started = true; trayEl.classList.remove('waiting');
      await demo(); next();
    });
    el.querySelector('[data-hear]').addEventListener('click', () => started && demo());
    makeDrag(trayEl, boxEls, () => started && !finished, async (card, k) => {
      if (k !== filled) { bounce(card); flash(boxEls[filled]); return; }
      card.classList.add('used');
      boxEls[k].querySelector('.ebox-fill').innerHTML = '<span class="coin big"></span>';
      boxEls[k].classList.add('done'); flash(boxEls[k]);
      A.play(sylSay(k));
      filled++; next();
      if (filled === n) {
        finished = true;
        await new Promise((r) => setTimeout(r, 700));
        await A.play(A.word(entry, { onstart: () => boxEls.forEach(flash) }));
        opts.onComplete && opts.onComplete();
      }
    });
  }

  root.PK_BOX = { mount, mountSyllables, boxesHTML, STAGES };
})(this);
