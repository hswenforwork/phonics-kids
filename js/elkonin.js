/*
 * 音素框（Elkonin Boxes）互動：
 *   第 1 關 推代幣：先示範，再依序把代幣拖進每一格（每格播放該音），推完念整字即過關
 *   第 2 關 放字母：只給正確字母卡（好朋友字母一張卡），順序打亂
 *   第 3 關 自己拼：單一字母卡＋3～4 個干擾字母，好朋友字母要自己組
 * 放錯會彈回並播放該格的正確聲音；同一格錯兩次，正確的卡會閃動提示。
 */
(function (root) {
  const A = root.PK_AUDIO;
  const STAGES = [null,
    { name: '推代幣', icon: '🔴', tip: '聽一個音，就把一個代幣推進一格' },
    { name: '放字母', icon: '🔤', tip: '把字母卡拖進對的格子' },
    { name: '自己拼', icon: '✏️', tip: '自己找出字母，拼進格子裡' },
  ];
  const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

  function distractors(word, n) {
    const pool = 'abcdefghijklmnoprstuvwyz'.split('').filter((c) => !word.includes(c));
    return shuffle(pool).slice(0, n);
  }

  /**
   * mount(el, { entry, analysis, boxes, stage, onComplete })
   */
  function mount(el, opts) {
    const { entry, boxes, stage } = opts;
    const S = STAGES[stage];
    // 第 1 關只處理有聲音的格子
    const slots = boxes.map((b, i) => Object.assign({ i, filled: '', errors: 0 }, b)).filter((b) => stage > 1 || !b.silent);
    let cards;
    if (stage === 1) cards = slots.map((b, i) => ({ id: 'c' + i, label: '', token: true }));
    else if (stage === 2) cards = shuffle(slots.map((b, i) => ({ id: 'c' + i, label: b.letters })));
    else {
      const letters = slots.flatMap((b) => b.letters.split(''));
      cards = shuffle(letters.concat(distractors(entry.word, letters.length > 6 ? 3 : 4)).map((l, i) => ({ id: 'c' + i, label: l })));
    }
    let started = false, finished = false;

    el.innerHTML = `
      <div class="box-stage">
        <div class="box-head">
          <span class="box-emoji">${entry.emoji || '🔤'}</span>
          <div>
            <p class="box-title">${S.icon} 第 ${stage} 關：${S.name}</p>
            <p class="box-tip">${S.tip}</p>
          </div>
          <button class="btn ghost small" data-hear>🔊 再聽一次</button>
        </div>
        <div class="boxes" style="--n:${slots.length}">
          ${slots.map((b, k) => `<div class="ebox${b.silent ? ' silent' : ''}" data-slot="${k}">
              ${b.silent ? '<span class="ebox-tag">🤫 不出聲</span>' : ''}<span class="ebox-fill"></span></div>`).join('')}
        </div>
        <div class="tray${started ? '' : ' waiting'}">
          ${cards.map((c) => `<div class="card-drag${c.token ? ' token' : ''}" data-card="${c.id}" draggable="false">${c.token ? '' : c.label}</div>`).join('')}
        </div>
        <div class="box-start"><button class="btn primary big" data-start>▶ 先聽一聽</button></div>
      </div>`;

    const boxEls = [...el.querySelectorAll('.ebox')];
    const trayEl = el.querySelector('.tray');
    const startBtn = el.querySelector('[data-start]');

    const sayBox = (b) => (b.silent ? { pause: 300 } : A.phonemeIPA(b.ph, b.key));
    function highlightNext() {
      boxEls.forEach((x) => x.classList.remove('next'));
      if (stage === 1) { const k = slots.findIndex((b) => !b.filled); if (k >= 0) boxEls[k].classList.add('next'); }
    }
    async function demo() {
      const seq = [A.word(entry, { onstart: () => boxEls.forEach((x) => flash(x)) }), { pause: 400 }];
      slots.forEach((b, k) => { if (!b.silent) { seq.push(sayBox(b)); seq[seq.length - 1].onstart = () => flash(boxEls[k]); seq.push({ pause: 250 }); } });
      seq.push(A.word(entry));
      await A.play(seq);
    }
    startBtn.addEventListener('click', async () => {
      startBtn.parentElement.remove();
      started = true; trayEl.classList.remove('waiting');
      await demo();
      highlightNext();
    });
    el.querySelector('[data-hear]').addEventListener('click', () => (started ? demo() : startBtn.click()));
    boxEls.forEach((x, k) => x.addEventListener('click', () => { if (slots[k].filled) A.play(sayBox(slots[k])); }));

    // ---------- 拖曳（觸控與滑鼠都可） ----------
    let drag = null;
    trayEl.addEventListener('pointerdown', (ev) => {
      const c = ev.target.closest('.card-drag');
      if (!c || !started || finished || c.classList.contains('used')) return;
      ev.preventDefault();
      const rect = c.getBoundingClientRect();
      const ghost = c.cloneNode(true);
      ghost.classList.add('ghost-drag');
      ghost.style.width = rect.width + 'px'; ghost.style.height = rect.height + 'px';
      document.body.appendChild(ghost);
      drag = { card: c, ghost, dx: ev.clientX - rect.left, dy: ev.clientY - rect.top, id: ev.pointerId };
      c.classList.add('lifted');
      moveGhost(ev);
      try { c.setPointerCapture(ev.pointerId); } catch (e) { /* 部分瀏覽器不支援 */ }
    });
    function moveGhost(ev) {
      if (!drag) return;
      drag.ghost.style.transform = `translate(${ev.clientX - drag.dx}px, ${ev.clientY - drag.dy}px) scale(1.08)`;
      const k = hitBox(ev.clientX, ev.clientY);
      boxEls.forEach((x, j) => x.classList.toggle('hover', j === k));
    }
    trayEl.addEventListener('pointermove', moveGhost);
    const endDrag = (ev) => {
      if (!drag) return;
      const { card, ghost } = drag;
      drag = null;
      boxEls.forEach((x) => x.classList.remove('hover'));
      ghost.remove();
      card.classList.remove('lifted');
      const k = hitBox(ev.clientX, ev.clientY);
      if (k < 0) return; // 沒放到格子上：回到原位，不算錯
      tryDrop(card, k);
    };
    trayEl.addEventListener('pointerup', endDrag);
    trayEl.addEventListener('pointercancel', (ev) => { if (drag) { drag.ghost.remove(); drag.card.classList.remove('lifted'); drag = null; } });

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

    function tryDrop(card, k) {
      const b = slots[k];
      const label = card.textContent;
      let ok = false;
      if (stage === 1) ok = slots.findIndex((x) => !x.filled) === k;
      else if (stage === 2) ok = !b.filled && label === b.letters;
      else ok = b.filled.length < b.letters.length && label === b.letters[b.filled.length];

      if (!ok) {
        bounce(card);
        if (stage === 1) { flash(boxEls[slots.findIndex((x) => !x.filled)]); return; }
        if (b.filled === b.letters) { flash(boxEls[k]); return; } // 已經放滿的格子
        b.errors++;
        A.play(sayBox(b));
        if (b.silent) showTip('🤫 這一格放的是不出聲的字母');
        if (b.errors >= 2) hintFor(b);
        return;
      }
      card.classList.add('used');
      if (stage === 1) {
        b.filled = '●';
        boxEls[k].querySelector('.ebox-fill').innerHTML = '<span class="coin"></span>';
      } else {
        b.filled += label;
        boxEls[k].querySelector('.ebox-fill').textContent = b.filled;
      }
      const complete = b.filled === '●' || b.filled === b.letters;
      if (complete) { boxEls[k].classList.add('done'); flash(boxEls[k]); A.play(sayBox(b)); }
      highlightNext();
      if (slots.every((x) => x.filled === '●' || x.filled === x.letters)) finish();
    }

    function hintFor(b) {
      const need = stage === 2 ? b.letters : b.letters[b.filled.length];
      const c = [...trayEl.querySelectorAll('.card-drag:not(.used)')].find((x) => x.textContent === need);
      if (c) { c.classList.remove('nudge'); void c.offsetWidth; c.classList.add('nudge'); }
    }

    async function finish() {
      finished = true;
      await new Promise((r) => setTimeout(r, 500));
      await A.play([A.word(entry, { onstart: () => boxEls.forEach(flash) })]);
      opts.onComplete && opts.onComplete(stage);
    }
    highlightNext();
  }

  function bounce(c) { c.classList.remove('bounce'); void c.offsetWidth; c.classList.add('bounce'); }
  function flash(x) { if (!x) return; x.classList.remove('flash'); void x.offsetWidth; x.classList.add('flash'); }
  function showTip(html) { if (root.PK_SHOWHINT) root.PK_SHOWHINT(html); }

  root.PK_BOX = { mount, STAGES };
})(this);
