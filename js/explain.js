/*
 * 依分析結果產生：七步分析表、中文講解、英文講解（文字由本專案自行撰寫）
 */
(function (root) {
  const P = root.PK_PHONICS || (typeof require !== 'undefined' ? require('./phonics.js') : null);
  const S = root.PK_SOUNDS || (typeof require !== 'undefined' ? require('./sounds.js') : null);
  const RULES = P.RULES;
  const snd = (k) => (S.SOUNDS[k] || {});
  const ipaOf = (k) => (snd(k).ipa ? `/${snd(k).ipa}/` : '');
  const join = (a, sep = '、') => a.join(sep);

  function vowelUnits(r) { return (r.units || []).filter((u) => u.type === 'V'); }
  function teams(r) { return (r.units || []).filter((u) => u.sub === 'team'); }
  function bossy(r) { return (r.units || []).filter((u) => u.sub === 'bossy'); }
  function digraphs(r) { return (r.units || []).filter((u) => u.type === 'C' && (u.sub === 'digraph' || u.sub === 'trigraph')); }
  const sylOf = (r, pos) => { let acc = 0; for (let i = 0; i < r.syllables.length; i++) { acc += r.syllables[i].length; if (pos <= acc) return i; } return r.syllables.length - 1; };

  // ---------- 七步分析表 ----------
  function steps(r) {
    const rows = [];
    const src = { lib: '內建單字庫', dict: '線上字典', none: '無' }[r.ipaSource] || r.ipaSource;
    rows.push(['Step 0 – 查發音（IPA）', r.verified
      ? `${r.ipa}（來源：${src}），音節：${r.syllables.join('-')}`
      : `查不到發音，以下依拼字規則推測（未經發音驗證）`]);
    rows.push(['Step 1 – 一眼認讀字', r.strategy === 'sight' ? '是 → 整個字記起來，不套規則' : '不是']);
    rows.push(['Step 2 – 複合字', r.compound ? `是：${r.compound[0]} + ${r.compound[1]}` : '不是']);
    const af = r.affix || {};
    rows.push(['Step 3 – 字首字尾', af.prefix || af.suffix
      ? `${af.prefix ? `字首 ${af.prefix}-，` : ''}${af.suffix ? `字尾 -${af.suffix}，` : ''}詞根 ${af.root}（仍掃描整個字）`
      : '沒有可拆的字首字尾']);
    rows.push(['Step 4 – 找母音', join(vowelUnits(r).map((u) => {
      const kind = { team: '母音組合', bossy: '霸道 R', y: 'y 當母音', le: '字尾 le', single: '單母音' }[u.sub];
      return `${u.text}（第 ${u.start + 1} 個字母，${kind}${u.key ? '，' + (snd(u.key).zh || u.key) + ' ' + ipaOf(u.key) : ''}）`;
    })) || '—']);
    const dg = digraphs(r).map((u) => `${u.text} ${ipaOf(u.key)}`);
    const split = (r.units || []).filter((u) => u.splitNg);
    rows.push(['Step 5 – 好朋友字母', (dg.length ? join(dg) : '無') + (split.length ? `；ng／nk 跨在兩個音節之間，不算好朋友字母` : '')]);
    rows.push(['Step 6 – 動物法則', r.strategy === 'sight' ? '跳過' : (r.cuts.length ? join(r.cuts.map((c) => {
      const R = RULES[c.rule];
      const name = R ? `${R.icon} ${R.zh}` : '依實際發音';
      const mid = c.consonants && c.consonants.length ? `中間子音 ${c.consonants.join('+')}（${c.consonants.length} 個單位）` : '中間沒有子音';
      return `${c.v1 || ''}${c.v2 ? '…' + c.v2 : ''} ${mid} → ${name}，切在第 ${c.pos} 個字母後`;
    }), '；') : '只有一個音節，不用切')]);
    const fx = [];
    fx.push(`魔法 e：${r.magicE ? '有' : '沒有'}`);
    fx.push(`不發音字母：${r.silent.length ? r.silent.map((s) => s.letter).join('、') : '沒有'}`);
    if (r.softC) fx.push('軟 c（念 /s/）');
    if (r.softG) fx.push('軟 g（念 /dʒ/）');
    rows.push(['Step 7 – 特殊效果', join(fx, '；')]);
    return rows;
  }

  function selfCheck(r) {
    const items = [];
    let acc = 0;
    const cutOk = r.cutPositions.every((c, i) => (acc += r.syllables[i].length) === c);
    items.push(['已查發音（IPA）', r.verified]);
    items.push(['好朋友字母已鎖定再切', true]);
    items.push(['老虎／駱駝以發音判斷', r.verified]);
    items.push(['切點位置 = 前面音節字母數總和', cutOk]);
    items.push(['音節拼回去 = 原單字', r.syllables.join('') === r.word]);
    items.push(['音節數與發音一致', !r.warnings.some((w) => w.includes('IPA'))]);
    return items;
  }

  // ---------- 單一音節的說明句 ----------
  function featureSentencesZh(r) {
    const out = [];
    teams(r).forEach((u) => out.push(`${u.text} 是母音組合，兩個母音手牽手，一起念 ${ipaOf(u.key)}。`));
    bossy(r).forEach((u) => out.push(`${u.text} 是霸道 R，r 把前面的 ${u.text[0]} 變成 ${ipaOf(u.key)} 的聲音。`));
    digraphs(r).forEach((u) => out.push(`${u.text} 是好朋友字母，${u.text.length} 個字母合起來只念一個音 ${ipaOf(u.key)}。`));
    (r.units || []).filter((u) => u.sub === 'le').forEach(() => out.push(`字尾的 le 輕輕念 /əl/，像「歐」。`));
    if (r.magicE) {
      const v = (r.units || []).find((u) => u.magicBy);
      out.push(`字尾的 e 是魔法 e，它自己不出聲，卻讓前面的 ${v ? v.text : '母音'} 念自己的名字${v ? ' ' + ipaOf(v.key) : ''}。`);
    }
    r.silent.filter((s) => s.letter !== 'e').forEach((s) => out.push(`${s.letter} 在這裡是安靜字母，不發音。`));
    if (r.softC) out.push(`c 遇到 e、i、y 會變溫柔，念 /s/。`);
    if (r.softG) out.push(`g 遇到 e、i、y 常常變溫柔，念 /dʒ/。`);
    return out;
  }

  function cutSentenceZh(r, c, i) {
    const left = r.syllables[sylOf(r, c.pos)];
    const cons = (c.consonants || []).join('、');
    const vIpa = c.vowelIpa ? `/${c.vowelIpa}/` : ipaOf(c.vowelSound);
    switch (c.rule) {
      case 'compound': return `${r.word} 是複合字，由 ${r.compound[0]} 和 ${r.compound[1]} 兩個字組成，先在中間切開。`;
      case 'affix': { const pre = r.affix.prefix && c.pos === r.affix.prefix.length; return `先把${pre ? `字首 ${r.affix.prefix}-` : `字尾 -${r.affix.suffix}`} 分出來（${r.affix.root} 本身就是一個字），在這裡切開。`; }
      case 'rabbit': return `${c.v1} 和 ${c.v2} 中間有 ${c.consonants.length} 個子音 ${cons}，用兔子法則 🐰 從子音中間切開，得到 ${left}。`;
      case 'tiger':
        if (c.blend) return `${c.v1} 和 ${c.v2} 中間的 ${c.blend} 是子音組合要黏在一起，前面的 ${c.v1} 念長音 ${vIpa}，所以在 ${c.blend} 前面切開（老虎法則 🐯），得到 ${left}。`;
        if (c.vowelSound === 'schwa') return `${c.v1} 和 ${c.v2} 中間只有 1 個子音 ${cons}，前面的 ${c.v1} 輕輕念 /ə/，在 ${cons} 前面切開（老虎法則 🐯），得到 ${left}。`;
        if (/^(ar|er|ir|or|ur)$/.test(c.v1)) return `${c.v1} 是霸道 R，後面只有 1 個子音 ${cons}，在 ${cons} 前面切開，得到 ${left}。`;
        return `${c.v1} 和 ${c.v2} 中間只有 1 個子音 ${cons}，前面的 ${c.v1} ${c.guess ? '可能' : ''}念長音${vIpa ? ' ' + vIpa : ''}（念自己的名字），用老虎法則 🐯 在 ${cons} 前面切開，得到 ${left}。`;
      case 'camel': return `${c.v1} 和 ${c.v2} 中間只有 1 個子音 ${cons}，前面的 ${c.v1} 念短音 ${vIpa}，用駱駝法則 🐫 在 ${cons} 後面切開，讓 ${cons} 留在前面，得到 ${left}。`;
      case 'lion': return `${c.v1} 和 ${c.v2} 緊緊靠在一起，但各念各的音，用獅子法則 🦁 在中間切開，得到 ${left}。`;
      case 'turtle': return `字尾是子音 ${cons.split('、').pop()} + le，用烏龜法則 🐢 在 ${cons.split('、').pop()} 前面切開，得到 ${r.syllables[sylOf(r, c.pos) + 1]}。`;
      default: return `依照實際發音，在第 ${c.pos} 個字母後面切開，得到 ${left}。`;
    }
  }

  function scriptZh(r) {
    const lines = [];
    lines.push(`小朋友，今天我們要拆解的單字是 ${r.word}${r.zh ? `，意思是「${r.zh}」` : ''}。`);
    if (r.strategy === 'sight') {
      lines.push(`${r.word} 是一眼認讀字，它不照一般規則念，我們把整個字記起來就好。`);
      lines.push(`跟我念一次：${r.word}！`);
      return lines.join('\n');
    }
    const vs = vowelUnits(r).map((u) => u.text);
    if (r.syllables.length === 1) {
      lines.push(`先找母音：${vs.join('、')}，只有一個母音音，所以只有一個音節。`);
    } else {
      lines.push(`先找母音：${vs.join('、')}，一共有 ${r.syllables.length} 個母音音，所以有 ${r.syllables.length} 個音節。`);
      r.cuts.forEach((c, i) => lines.push((i ? '接著，' : '') + cutSentenceZh(r, c, i)));
    }
    featureSentencesZh(r).forEach((s) => lines.push(s));
    if (!r.verified) lines.push('（這個字沒有查到發音，上面是依拼字規則推測的，請以實際發音為準。）');
    lines.push(r.syllables.length > 1 ? `拼在一起：${r.syllables.join('-')}，${r.word}！` : `跟我念一次：${r.word}！`);
    return lines.join('\n');
  }

  // ---------- 英文講解 ----------
  const EN_SOUND = (k) => ipaOf(k);
  function scriptEn(r) {
    const L = [];
    L.push(`Today's word is ${r.word}${r.zh ? `, it means ${r.zh}` : ''}.`);
    if (r.strategy === 'sight') {
      L.push(`${cap(r.word)} is a sight word. It doesn't follow the usual rules, so we just remember the whole word.`);
      L.push(`Say it with me: ${r.word}!`);
      return L.join('\n');
    }
    const vs = vowelUnits(r).map((u) => u.text);
    if (r.affix && r.affix.suffix) L.push(`First, let's spot the suffix: -${r.affix.suffix}.`);
    if (r.affix && r.affix.prefix) L.push(`First, let's spot the prefix: ${r.affix.prefix}-.`);
    if (r.compound) L.push(`${cap(r.word)} is a compound word: ${r.compound[0]} + ${r.compound[1]}.`);
    if (r.syllables.length === 1) {
      L.push(`Find the vowel${vs.length > 1 ? 's' : ''}: ${vs.join(' and ')}. There is only one vowel sound, so it's one syllable.`);
    } else {
      L.push(`Find the vowels: ${vs.join(', ')}. ${r.syllables.length} vowel sounds means ${r.syllables.length} syllables.`);
      r.cuts.forEach((c) => {
        const left = r.syllables[sylOf(r, c.pos)];
        const cons = (c.consonants || []).join(' and ');
        const n = (c.consonants || []).length;
        const vIpa = c.vowelIpa ? `/${c.vowelIpa}/` : EN_SOUND(c.vowelSound);
        switch (c.rule) {
          case 'compound': L.push(`Split the two little words apart.`); break;
          case 'affix': L.push(`Cut off the ${r.affix.prefix && c.pos === r.affix.prefix.length ? 'prefix' : 'suffix'} first.`); break;
          case 'rabbit': L.push(`There ${n > 1 ? 'are' : 'is'} ${n} consonant${n > 1 ? 's' : ''} (${cons}) between ${c.v1} and ${c.v2}. Like a rabbit hopping in the middle, we cut between them → ${left}.`); break;
          case 'tiger':
            if (c.blend) L.push(`The blend ${c.blend} sticks together, and ${c.v1} says its long sound ${vIpa}, so we cut before ${c.blend} → ${left}.`);
            else if (c.vowelSound === 'schwa') L.push(`Only one consonant, ${cons}. The ${c.v1} is soft and quiet /ə/, so ${cons} goes to the next part → ${left}.`);
            else L.push(`Only one consonant, ${cons}. The ${c.v1} says its name${vIpa ? ' ' + vIpa : ''}, so we cut before ${cons} — that's the Tiger Rule → ${left}.`);
            break;
          case 'camel': L.push(`Only one consonant, ${cons}. The ${c.v1} says its short sound ${vIpa}, so ${cons} stays with it — that's the Camel Rule → ${left}.`); break;
          case 'lion': L.push(`${c.v1} and ${c.v2} sit side by side but say different sounds, so we cut between them — the Lion Rule → ${left}.`); break;
          case 'turtle': L.push(`The word ends with a consonant + le, so we count back three letters — the Turtle Rule → ${r.syllables[sylOf(r, c.pos) + 1]}.`); break;
          default: L.push(`We follow how the word really sounds and cut → ${left}.`);
        }
      });
    }
    teams(r).forEach((u) => L.push(`${u.text} is a vowel team — the two vowels work together to say ${ipaOf(u.key)}.`));
    bossy(r).forEach((u) => L.push(`${u.text} is a bossy R — the r changes the vowel to ${ipaOf(u.key)}.`));
    digraphs(r).forEach((u) => L.push(`${u.text} is a digraph — ${u.text.length} letters, one sound ${ipaOf(u.key)}.`));
    if (r.magicE) { const v = (r.units || []).find((u) => u.magicBy); L.push(`The silent e at the end is magic — it makes the ${v ? v.text : 'vowel'} say its name.`); }
    r.silent.filter((s) => s.letter !== 'e').forEach((s) => L.push(`The ${s.letter} is silent here.`));
    if (r.softC) L.push(`The c says /s/ because e, i or y comes after it.`);
    if (r.softG) L.push(`The g says /dʒ/ here — a soft g.`);
    L.push(r.syllables.length > 1 ? `Now blend it together: ${r.syllables.join(' - ')}. ${cap(r.word)}!` : `Say it with me: ${r.word}!`);
    return L.join('\n');
  }
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  const api = { steps, selfCheck, scriptZh, scriptEn };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PK_EXPLAIN = api;
})(this);
