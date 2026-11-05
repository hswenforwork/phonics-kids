/*
 * 用「格子的說法」產生講解：每一格是什麼、為什麼這樣放
 * 孩子看到的提示不顯示音標；家長模式的格子拆解才顯示音標
 */
(function (root) {
  const P = root.PK_PHONICS || (typeof require !== 'undefined' ? require('./phonics.js') : null);
  const DIGRAPH = ['sh', 'ch', 'tch', 'th', 'ck', 'ng', 'nk', 'wh', 'ph', 'dge'];
  const LONG_NAME = { a: 'a', e: 'e', i: 'i', o: 'o', u: 'u' };

  /** 這一格的種類 */
  function kind(b) {
    if (b.silent) return b.magic ? 'magic' : 'silent';
    if (b.sub === 'team') return 'team';
    if (b.sub === 'bossy' || b.sub === 'team_r') return 'bossy';
    if (b.sub === 'le') return 'le';
    if (DIGRAPH.includes(b.letters)) return 'digraph';
    if (b.dbl) return 'double';
    if (b.type === 'V') return b.magicBy ? 'long' : b.weak ? 'weak' : 'short';
    if (b.inBlend) return 'blend';
    return 'cons';
  }

  /** 孩子點格子或字母卡時的提示（不顯示音標） */
  function boxHint(b, boxes) {
    const v = (boxes || []).find((x) => x.magicBy);
    switch (kind(b)) {
      case 'magic': return `✨ <b>e</b> 是魔法 e：自己不出聲，讓 <b>${v ? v.letters : '母音'}</b> 念自己的名字`;
      case 'silent': return `🤫 <b>${b.letters}</b> 不出聲，放在虛線框`;
      case 'team': return `🤝 <b>${b.letters}</b> 兩個母音住同一格，一起念一個音`;
      case 'bossy': return `🦖 <b>${b.letters}</b>：r 很霸道，跟母音擠在同一格`;
      case 'le': return `<b>le</b> 放同一格，輕輕念`;
      case 'digraph': return `👯 <b>${b.letters}</b> 是好朋友字母：住同一格，只念一個音`;
      case 'double': return `<b>${b.letters}</b> 兩個一樣的字母住同一格，只念一個音`;
      case 'long': return `<b>${b.letters}</b> 念自己的名字（長音）`;
      case 'weak': return `<b>${b.letters}</b> 輕輕念`;
      case 'short': return `<b>${b.letters}</b> 短短的母音`;
      case 'blend': return `〰️ <b>${b.letters}</b> 自己一格，跟旁邊的字母快快連著念`;
      default: return `<b>${b.letters}</b> 一個字母一格`;
    }
  }

  /** 家長模式：格子拆解表 [格子, 音標, 說明] */
  function boxRows(boxes) {
    const v = boxes.find((x) => x.magicBy);
    return boxes.map((b) => {
      const ipa = b.silent ? '不發音' : `/${b.ph || ''}/`;
      const why = {
        magic: `魔法 e：不出聲，讓 ${v ? v.letters : '母音'} 念長音（放虛線框）`,
        silent: '不發音的字母（放虛線框）',
        team: '母音好朋友：兩個母音同一格',
        bossy: '霸道 R：母音和 r 同一格',
        le: '字尾 le 同一格，輕讀',
        digraph: '好朋友字母：兩個字母同一格',
        double: '重複字母：同一格，只發一個音',
        long: '長音（念字母的名字）',
        weak: '弱母音：不是重音，輕輕念',
        short: '短母音',
        blend: '連綴：每個字母各一格',
        cons: '一個字母一格',
      }[kind(b)];
      return [b.letters, ipa, why];
    });
  }

  function sylGroups(boxes) {
    const g = [];
    boxes.forEach((b) => { let x = g.find((y) => y.syl === b.syl); if (!x) { x = { syl: b.syl, boxes: [] }; g.push(x); } x.boxes.push(b); });
    return g;
  }

  /** 中文講解（格子的說法） */
  function scriptZh(r, boxes, level) {
    const L = [];
    const sounds = boxes.filter((b) => !b.silent);
    L.push(`小朋友，我們來聽 ${r.word}${r.zh ? `（${r.zh}）` : ''}。`);
    const groups = sylGroups(boxes);
    const one = (b, i) => {
      switch (kind(b)) {
        case 'digraph': return `第 ${i} 格是 ${b.letters}，兩個字母手牽手，只念一個音。`;
        case 'double': return `第 ${i} 格是 ${b.letters}，兩個一樣的字母放同一格，只念一個音。`;
        case 'team': return `第 ${i} 格是 ${b.letters}，兩個母音一起念。`;
        case 'bossy': return `第 ${i} 格是 ${b.letters}，母音和 r 擠在同一格。`;
        case 'long': return `第 ${i} 格是 ${b.letters}，它念自己的名字。`;
        case 'weak': return `第 ${i} 格是 ${b.letters}，輕輕念。`;
        case 'blend': return `第 ${i} 格是 ${b.letters}，它跟旁邊的字母連著念，但自己有一格。`;
        default: return `第 ${i} 格是 ${b.letters}。`;
      }
    };
    if (groups.length > 1) {
      L.push(`${r.word} 有 ${groups.length} 拍：${r.syllables.join('、')}。先畫 ${groups.length} 個大框。`);
      let n = 0;
      groups.forEach((g, gi) => {
        const s = g.boxes.filter((b) => !b.silent);
        L.push(`第 ${gi + 1} 個大框 ${r.syllables[gi]} 有 ${s.length} 個聲音：`);
        s.forEach((b) => { n++; L.push('　' + one(b, n)); });
      });
    } else {
      L.push(`${r.word} 有 ${sounds.length} 個聲音，所以畫 ${sounds.length} 個格子。`);
      sounds.forEach((b, i) => L.push(one(b, i + 1)));
    }
    boxes.filter((b) => b.silent).forEach((b) => {
      const v = boxes.find((x) => x.magicBy);
      L.push(b.magic ? `最後的 e 是魔法 e，不出聲，放在虛線框；它讓 ${v ? v.letters : '母音'} 念自己的名字。` : `${b.letters} 不出聲，放在虛線框。`);
    });
    L.push(`現在用手指從左滑到右，一格念一個聲音，最後念出：${r.word}！`);
    return L.join('\n');
  }

  /** 英文講解（格子的說法） */
  function scriptEn(r, boxes) {
    const L = [];
    const sounds = boxes.filter((b) => !b.silent);
    const groups = sylGroups(boxes);
    L.push(`Let's listen to ${r.word}.`);
    const one = (b) => {
      switch (kind(b)) {
        case 'digraph': return `${b.letters} — two letters, one sound, one box.`;
        case 'double': return `${b.letters} — two of the same letter, one sound, one box.`;
        case 'team': return `${b.letters} — two vowels work together in one box.`;
        case 'bossy': return `${b.letters} — bossy r shares a box with the vowel.`;
        case 'long': return `${b.letters} — says its name.`;
        case 'weak': return `${b.letters} — a quiet sound.`;
        case 'blend': return `${b.letters} — its own box, slide it into the next sound.`;
        default: return `${b.letters}.`;
      }
    };
    if (groups.length > 1) {
      L.push(`${r.word} has ${groups.length} beats: ${r.syllables.join(' - ')}. Draw ${groups.length} big boxes.`);
      groups.forEach((g, gi) => {
        const s = g.boxes.filter((b) => !b.silent);
        L.push(`Big box ${gi + 1}, ${r.syllables[gi]}, has ${s.length} sound${s.length > 1 ? 's' : ''}: ${s.map(one).join(' ')}`);
      });
    } else {
      L.push(`${r.word} has ${sounds.length} sounds, so we need ${sounds.length} boxes.`);
      sounds.forEach((b, i) => L.push(`Box ${i + 1}: ${one(b)}`));
    }
    if (boxes.some((b) => b.magic)) L.push('The magic e is silent. It goes outside the boxes and makes the vowel say its name.');
    L.push(`Now slide your finger and blend: ${r.word}!`);
    return L.join('\n');
  }

  const api = { kind, boxHint, boxRows, scriptZh, scriptEn };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PK_EXPLAIN = api;
})(this);
