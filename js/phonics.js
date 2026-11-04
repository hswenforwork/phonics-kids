/*
 * 自然發音拆音節引擎
 * 核心原則：以實際發音（IPA）為準，拼字規則（動物法則）是輔助；兩者衝突時以發音優先。
 * 流程：Step 0 IPA → 1 一眼認讀字 → 2 複合字 → 3 字首字尾 → 4 母音定位
 *       → 5 好朋友字母 → 6 動物法則 → 7 特殊效果（魔法 e、不發音字母）
 */
(function (root) {
  const isV = (ch) => !!ch && 'aeiou'.includes(ch);

  // 自行整理的常見一眼認讀字（不照規則念的高頻字）
  const SIGHT = new Set(['the', 'a', 'was', 'said', 'have', 'come', 'some', 'what', 'where', 'there',
    'they', 'you', 'your', 'are', 'were', 'one', 'two', 'who', 'do', 'to', 'of', 'from', 'into',
    'been', 'any', 'many', 'could', 'would', 'should', 'does', 'goes', 'says', 'put', 'pull', 'full',
    'push', 'both', 'talk', 'walk', 'eye', 'eight', 'four', 'love', 'give', 'live', 'friend', 'once',
    'only', 'other', 'mother', 'water', 'people', 'again', 'buy', 'done', 'gone', 'move', 'whose',
    'want', 'very', 'our', 'hour', 'here', 'please']);

  const VOWEL_TEAMS = ['eigh', 'igh', 'ai', 'ay', 'ee', 'ea', 'oa', 'oe', 'ow', 'oo', 'ou', 'oi', 'oy',
    'ue', 'ui', 'ie', 'ey', 'ew', 'aw', 'au'];
  const TEAM_KEY = { eigh: 'long_a', igh: 'long_i', ai: 'long_a', ay: 'long_a', ee: 'long_e', ea: 'long_e',
    oa: 'long_o', oe: 'long_o', ow: 'long_o', oo: 'oo_long', ou: 'ow', oi: 'oy', oy: 'oy', ue: 'oo_long',
    ui: 'oo_long', ie: 'long_e', ey: 'long_e', ew: 'oo_long', aw: 'aw', au: 'aw' };
  const BOSSY_KEY = { ar: 'ar', er: 'er', ir: 'er', ur: 'er', or: 'or' };
  const DIGRAPH3 = { tch: 'ch', dge: 'j' };
  const DIGRAPH2 = { sh: 'sh', ch: 'ch', th: 'th', wh: 'w', ph: 'f', ck: 'k', ng: 'ng', nk: 'nk', qu: 'kw' };
  const BLENDS = new Set(['bl', 'br', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gr', 'pl', 'pr', 'sc', 'sk',
    'sl', 'sm', 'sn', 'sp', 'st', 'sw', 'tr', 'tw']);
  const PREFIXES = ['un', 're', 'pre', 'dis', 'mis', 'non', 'sub', 'over'];
  const SUFFIXES = ['ing', 'ness', 'less', 'ment', 'ful', 'est', 'er', 'ly'];
  const LONG = new Set(['long_a', 'long_e', 'long_i', 'long_o', 'long_u', 'oo_long']);
  const SHORT = new Set(['short_a', 'short_e', 'short_i', 'short_o', 'short_u', 'oo_short']);
  const RCOLOR = new Set(['ar', 'er', 'or', 'air', 'ear']);

  const RULES = {
    rabbit: { icon: '🐰', zh: '兔子法則', en: 'Rabbit Rule', pat: 'VC|CV' },
    tiger: { icon: '🐯', zh: '老虎法則', en: 'Tiger Rule', pat: 'V|CV' },
    camel: { icon: '🐫', zh: '駱駝法則', en: 'Camel Rule', pat: 'VC|V' },
    lion: { icon: '🦁', zh: '獅子法則', en: 'Lion Rule', pat: 'V|V' },
    turtle: { icon: '🐢', zh: '烏龜法則', en: 'Turtle Rule', pat: '|Cle' },
    compound: { icon: '🧩', zh: '複合字', en: 'Compound Word', pat: 'word|word' },
    affix: { icon: '✂️', zh: '字首字尾', en: 'Prefix / Suffix', pat: 'root|suffix' },
  };

  // ---------- Step 0：IPA 解析 ----------
  function normIPA(ipa) {
    return String(ipa || '')
      .replace(/[\/\[\]()]/g, '').replace(/ɡ/g, 'g').replace(/ɹ/g, 'r').replace(/ɾ/g, 't')
      .replace(/ɝ/g, 'ɜr').replace(/ɚ/g, 'ər').replace(/əʊ/g, 'oʊ').replace(/ɒ/g, 'ɑ').replace(/ɐ/g, 'ə')
      .replace(/eə/g, 'ɛr').replace(/ɪə/g, 'ɪr').replace(/ʊə/g, 'ʊr').replace(/ᵻ/g, 'ɪ')
      .replace(/̩/g, '').replace(/[ ,]/g, '').trim();
  }

  const NUCLEI = [
    ['iː', 'long_e'], ['uː', 'oo_long'], ['ɑː', 'ar'], ['ɔː', 'aw'], ['ɜː', 'er'], ['ɛː', 'air'],
    ['aɪ', 'long_i'], ['aʊ', 'ow'], ['eɪ', 'long_a'], ['oʊ', 'long_o'], ['ɔɪ', 'oy'],
    ['ɑr', 'ar'], ['ɔr', 'or'], ['ɛr', 'air'], ['er', 'air'], ['ɪr', 'ear'], ['ʊr', 'or'], ['ɜr', 'er'], ['ər', 'er'],
    ['æ', 'short_a'], ['ɛ', 'short_e'], ['e', 'short_e'], ['ɪ', 'short_i'], ['i', 'long_e'], ['ɑ', 'short_o'],
    ['a', 'short_o'], ['ʌ', 'short_u'], ['ɔ', 'aw'], ['ʊ', 'oo_short'], ['u', 'oo_long'], ['ə', 'schwa'],
    ['o', 'long_o'], ['ɜ', 'er'],
  ];

  function parseIPA(ipa) {
    const s = normIPA(ipa);
    if (!s) return null;
    const nuclei = [];
    const hasMarks = /[ˈˌ]/.test(s);
    let pendingStress = !hasMarks;
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (ch === 'ˈ' || ch === 'ˌ') { pendingStress = true; i++; continue; }
      if (ch === '.') { i++; continue; }
      let hit = null;
      for (const [pat, key] of NUCLEI) {
        if (s.startsWith(pat, i)) {
          // r 後面接母音時，r 屬於下一個音節，不算霸道 R
          if (pat.length === 2 && pat[1] === 'r') {
            const nx = s[i + 2];
            if (nx && NUCLEI.some(([p]) => p.length === 1 && p === nx)) continue;
          }
          hit = [pat, key]; break;
        }
      }
      if (hit) {
        let key = hit[1];
        if (key === 'oo_long' && s[i - 1] === 'j') key = 'long_u';
        let len = hit[0].length;
        if (s[i + len] === 'ː') len++; // 其他長音記號
        nuclei.push({ ipa: s.slice(i, i + len), key, stressed: hasMarks ? pendingStress : true });
        pendingStress = false;
        i += len;
        continue;
      }
      i++;
    }
    return {
      raw: ipa, norm: s, nuclei,
      has: (x) => s.includes(x),
    };
  }

  // ---------- Step 4 + 5：拼字切分成單位 ----------
  function tokenize(word, ip, opts = {}) {
    const w = word;
    const n = w.length;
    const units = [];
    const ipHasR = ip ? ip.nuclei.some((x) => RCOLOR.has(x.key)) : true;
    let i = 0;
    while (i < n) {
      const rest = w.slice(i);
      const prevIsV = units.length && units[units.length - 1].type === 'V';
      let u = null;
      // 三合字母（子音）
      for (const d in DIGRAPH3) if (rest.startsWith(d)) { u = { text: d, type: 'C', sub: 'trigraph' }; break; }
      // 字尾 子音+le
      if (!u && i === n - 2 && rest === 'le' && i > 0 && !isV(w[i - 1])) u = { text: 'le', type: 'V', sub: 'le' };
      // 母音組合
      if (!u) {
        for (const t of VOWEL_TEAMS) {
          if (!rest.startsWith(t)) continue;
          if (t === 'ey' && i + 2 < n) continue; // ey 多在字尾
          if (opts.noTeam && opts.noTeam.has(i)) continue;
          u = { text: t, type: 'V', sub: 'team' }; break;
        }
      }
      // 霸道 R：母音 + r，且 r 後面不是母音
      if (!u && 'aeiou'.includes(w[i]) && w[i + 1] === 'r' && (i + 2 >= n || !isV(w[i + 2]) || (w[i + 2] === 'e' && i + 3 === n))) {
        u = { text: w.slice(i, i + 2), type: 'V', sub: 'bossy' };
      }
      // 字尾不發音 e
      if (!u && w[i] === 'e' && i === n - 1 && n > 2 && units.some((x) => x.type === 'V') && !isV(w[i - 1]) && w[i - 1] !== 'l') {
        u = { text: 'e', type: 'S', sub: 'final_e' };
      }
      // 單一母音
      if (!u && isV(w[i])) {
        if (w[i] === 'u' && w[i - 1] === 'q') { /* 已在 qu 處理 */ }
        u = { text: w[i], type: 'V', sub: 'single' };
      }
      // y 當母音（不在字首、後面不是母音）
      if (!u && w[i] === 'y' && i > 0 && !isV(w[i + 1] || '')) u = { text: 'y', type: 'V', sub: 'y' };
      // 二合字母（子音）
      if (!u) {
        for (const d in DIGRAPH2) {
          if (!rest.startsWith(d)) continue;
          u = { text: d, type: 'C', sub: 'digraph' }; break;
        }
      }
      if (!u) u = { text: w[i], type: 'C', sub: 'single' };
      u.start = i; u.end = i + u.text.length;
      units.push(u);
      i = u.end;
    }
    // ng / nk 後面緊接母音 → 跨音節，拆成 n + g/k（不是好朋友字母）
    const out = [];
    for (let k = 0; k < units.length; k++) {
      const u = units[k];
      const next = units[k + 1];
      if (u.type === 'C' && (u.text === 'ng' || u.text === 'nk') && next && next.type === 'V') {
        out.push({ text: 'n', type: 'C', sub: 'single', start: u.start, end: u.start + 1, splitNg: true });
        out.push({ text: u.text[1], type: 'C', sub: 'single', start: u.start + 1, end: u.end, splitNg: true });
      } else out.push(u);
    }
    // 母音組合 + r（後面不接母音），如 air、ear、our、oor：r 跟母音一起念，算同一個母音音
    for (let k = 0; k < out.length - 1; k++) {
      const u = out[k], nx = out[k + 1];
      if (u.type === 'V' && u.sub === 'team' && nx.type === 'C' && nx.text === 'r' && !isV(word[nx.end] || '') && word[nx.end] !== 'y') {
        out.splice(k, 2, { text: u.text + 'r', type: 'V', sub: 'team_r', start: u.start, end: nx.end });
      }
    }
    // 魔法 e：單一母音 + 一個子音單位 + 字尾 e
    const last = out[out.length - 1];
    if (last && last.sub === 'final_e') {
      const c = out[out.length - 2], v = out[out.length - 3];
      if (c && v && c.type === 'C' && v.type === 'V' && v.sub === 'single') { last.magic = true; v.magicBy = true; }
    }
    return out;
  }

  // ---------- Step 2：複合字；Step 3：字首字尾 ----------
  function findCompound(word, known) {
    let best = null;
    for (let k = 3; k <= word.length - 3; k++) {
      const a = word.slice(0, k), b = word.slice(k);
      if (known.has(a) && known.has(b)) best = [a, b];
    }
    return best;
  }
  function findAffix(word, known) {
    const res = { prefix: null, suffix: null, root: word };
    for (const s of SUFFIXES) {
      if (word.endsWith(s) && word.length > s.length + 2) {
        const r = word.slice(0, -s.length);
        if (known.has(r)) { res.suffix = s; res.root = r; break; }
      }
    }
    for (const p of PREFIXES) {
      if (word.startsWith(p) && word.length > p.length + 2) {
        const r = res.root.slice(p.length);
        if (known.has(r)) { res.prefix = p; res.root = r; break; }
      }
    }
    return res;
  }

  // ---------- 子音發音 ----------
  function consonantKey(u, word, ip) {
    if (u.sub === 'trigraph') return DIGRAPH3[u.text];
    if (u.sub === 'digraph') {
      if (u.text === 'th') return ip && ip.has('ð') && !ip.has('θ') ? 'th_v' : 'th';
      return DIGRAPH2[u.text];
    }
    const c = u.text, nx = word[u.end] || '';
    if (u.splitNg && c === 'n' && ip && ip.has('ŋ')) return 'ng';
    switch (c) {
      case 'c': return 'eiy'.includes(nx) && nx ? 's' : 'k';
      case 'g': return 'eiy'.includes(nx) && nx && ip && ip.has('dʒ') ? 'j' : 'g';
      case 's': return ip && ip.has('z') && !word.includes('z') && !word.includes('x') && u.start > 0 ? 'z' : 's';
      case 'x': return 'ks';
      case 'q': return 'k';
      case 'y': return 'y';
      default: return c;
    }
  }

  function syllabifyPart(word, ip, forcedCuts) {
    let units = tokenize(word, ip);
    // IPA 母音音比拼字母音單位多 → 有母音組合其實是兩個音（如 poem），逐一拆開試
    if (ip && ip.nuclei.length > units.filter((u) => u.type === 'V').length) {
      const noTeam = new Set();
      for (const u of units.filter((x) => x.sub === 'team')) {
        noTeam.add(u.start);
        const t = tokenize(word, ip, { noTeam });
        if (t.filter((x) => x.type === 'V').length === ip.nuclei.length) { units = t; break; }
      }
    }
    // 發音顯示是霸道 R（如 dan-ger-ous 的 er），把後面的 r 併入母音
    if (ip) {
      const vs = units.filter((u) => u.type === 'V');
      if (vs.length === ip.nuclei.length) {
        vs.forEach((u, i) => {
          if (u.sub !== 'single' || !['ar', 'er', 'or'].includes(ip.nuclei[i].key) || !/r$/.test(ip.nuclei[i].ipa)) return;
          const k = units.indexOf(u), nx = units[k + 1];
          if (nx && nx.type === 'C' && nx.text === 'r') {
            units.splice(k, 2, { text: u.text + 'r', type: 'V', sub: 'bossy', start: u.start, end: nx.end });
          }
        });
      }
    }
    const vUnits = units.filter((u) => u.type === 'V');
    const aligned = !!(ip && ip.nuclei.length === vUnits.length);
    if (aligned) vUnits.forEach((u, i) => {
      u.ipa = ip.nuclei[i].ipa; u.key = ip.nuclei[i].key; u.stressed = ip.nuclei[i].stressed;
      if ((u.sub === 'bossy' || u.sub === 'team_r') && u.key === 'aw') u.key = 'or';
      if (u.sub === 'le') u.key = 'le';
    });
    const cuts = [];
    for (let i = 0; i < vUnits.length - 1; i++) {
      const v1 = vUnits[i], v2 = vUnits[i + 1];
      const between = units.filter((u) => u.start >= v1.end && u.end <= v2.start && u.type === 'C');
      const forced = forcedCuts.find((f) => f.pos >= v1.end && f.pos <= v2.start);
      const cut = { v1: v1.text, v2: v2.text, consonants: between.map((c) => c.text) };
      if (forced) { Object.assign(cut, { pos: forced.pos, rule: forced.rule }); cuts.push(cut); continue; }
      const k = between.length;
      if (v2.sub === 'le' && k >= 1) {
        Object.assign(cut, { pos: between[k - 1].start, rule: 'turtle' });
      } else if (k === 0) {
        Object.assign(cut, { pos: v2.start, rule: 'lion' });
      } else if (k === 1) {
        const c = between[0];
        let isCamel;
        if (v1.sub === 'bossy') isCamel = false;
        else if (aligned) isCamel = SHORT.has(v1.key) && v1.stressed !== false;
        else isCamel = v1.sub === 'single' ? false : false; // 無發音資料時先試老虎法則
        cut.vowelSound = v1.key;
        cut.vowelIpa = v1.ipa;
        Object.assign(cut, isCamel ? { pos: c.end, rule: 'camel' } : { pos: c.start, rule: 'tiger' });
        if (!aligned) cut.guess = true;
      } else {
        const pair = between.slice(-2).map((c) => c.text).join('');
        const longV1 = aligned && (LONG.has(v1.key));
        if (BLENDS.has(pair) && between.slice(-2).every((c) => c.sub === 'single') && longV1 && k === 2) {
          Object.assign(cut, { pos: between[0].start, rule: 'tiger', blend: pair, vowelSound: v1.key, vowelIpa: v1.ipa });
        } else {
          Object.assign(cut, { pos: between[0].end, rule: 'rabbit' });
        }
      }
      cuts.push(cut);
    }
    return { units, vUnits, aligned, cuts };
  }

  function cutsToSyllables(word, positions) {
    const out = [];
    let p = 0;
    for (const c of positions) { out.push(word.slice(p, c)); p = c; }
    out.push(word.slice(p));
    return out;
  }

  // ---------- 主分析 ----------
  /**
   * analyze(word, { ipa, ipaSource, zh, known:Set, libSyllables:'ti-ger' })
   */
  function analyze(rawWord, opts = {}) {
    const word = String(rawWord || '').toLowerCase().replace(/[^a-z]/g, '');
    const known = opts.known || new Set();
    const ip = opts.ipa ? parseIPA(opts.ipa) : null;
    const res = {
      word, zh: opts.zh || '', ipa: opts.ipa || '', ipaSource: opts.ipa ? (opts.ipaSource || 'lib') : 'none',
      verified: !!ip && ip.nuclei.length > 0, strategy: 'rule', steps: {}, warnings: [],
    };
    if (!word) return res;

    // Step 1
    const sight = SIGHT.has(word);
    res.steps.sight = sight;
    // Step 2
    const compound = sight ? null : findCompound(word, known);
    res.compound = compound;
    // Step 3
    const affix = sight || compound ? { prefix: null, suffix: null, root: word } : findAffix(word, known);
    res.affix = affix;

    const forced = [];
    if (compound) forced.push({ pos: compound[0].length, rule: 'compound' });
    if (affix.suffix) forced.push({ pos: word.length - affix.suffix.length, rule: 'affix', which: 'suffix' });
    if (affix.prefix) forced.push({ pos: affix.prefix.length, rule: 'affix', which: 'prefix' });

    let part;
    if (compound) {
      // 複合字：兩個部分各自分析，再合併
      const ipaParts = splitIPAForCompound(ip, compound, known, opts);
      const a = syllabifyPart(compound[0], ipaParts[0], []);
      const b = syllabifyPart(compound[1], ipaParts[1], []);
      const off = compound[0].length;
      const shift = (u) => Object.assign({}, u, { start: u.start + off, end: u.end + off });
      part = {
        units: a.units.concat(b.units.map(shift)),
        vUnits: a.vUnits.concat(b.vUnits.map(shift)),
        aligned: a.aligned && b.aligned,
        cuts: a.cuts.concat([{ pos: off, rule: 'compound', v1: '', v2: '', consonants: [] }], b.cuts.map((c) => Object.assign({}, c, { pos: c.pos + off }))),
      };
      res.strategy = 'compound';
    } else {
      part = syllabifyPart(word, ip, forced);
    }
    if (sight) { res.strategy = 'sight'; part.cuts = []; }

    res.units = part.units;
    res.aligned = part.aligned;
    res.ruleCuts = part.cuts;
    const ruleSyl = cutsToSyllables(word, part.cuts.map((c) => c.pos));
    res.ruleSyllables = ruleSyl;

    // 發音優先：單字庫音節為最終答案
    let finalSyl = ruleSyl;
    if (opts.libSyllables) {
      const lib = opts.libSyllables.split('-');
      if (lib.join('') === word) {
        finalSyl = lib;
        if (lib.join('-') !== ruleSyl.join('-')) { res.adjusted = true; }
      } else res.warnings.push('單字庫音節拼回去不等於原單字');
    }
    res.syllables = finalSyl;
    let p = 0;
    res.cutPositions = finalSyl.slice(0, -1).map((s) => (p += s.length));
    // 規則說明對應到最終切點
    res.cuts = res.cutPositions.map((pos) => part.cuts.find((c) => c.pos === pos) || { pos, rule: 'ipa', consonants: [] });
    if (res.adjusted) res.cuts.forEach((c) => { if (c.rule === 'ipa') c.note = '依實際發音調整'; });

    // 未對齊時，用音節開閉推測母音音
    const sylOf = (pos) => { let acc = 0; for (let i = 0; i < finalSyl.length; i++) { acc += finalSyl[i].length; if (pos < acc) return i; } return finalSyl.length - 1; };
    for (const u of part.units) {
      u.syl = sylOf(u.start);
      if (u.type === 'V' && !u.key) u.key = guessVowelKey(u, word, finalSyl, part.units);
      if (u.type === 'C') u.key = consonantKey(u, word, ip);
      if (u.type === 'S') u.key = 'silent';
    }
    // 不發音字母
    const silent = [];
    if (/^kn/.test(word)) silent.push({ letter: 'k', at: 0 });
    if (/^wr/.test(word)) silent.push({ letter: 'w', at: 0 });
    if (/mb$/.test(word)) silent.push({ letter: 'b', at: word.length - 1 });
    part.units.forEach((u) => {
      if (u.text === 'igh' || u.text === 'eigh') silent.push({ letter: 'gh', at: u.end - 2 });
      if (u.sub === 'final_e') silent.push({ letter: 'e', at: u.start, magic: !!u.magic });
    });
    res.silent = silent;
    res.magicE = part.units.some((u) => u.magic);
    res.softC = part.units.filter((u) => u.text === 'c' && u.key === 's').length > 0;
    res.softG = part.units.filter((u) => u.text === 'g' && u.key === 'j').length > 0;

    // 自檢
    if (finalSyl.join('') !== word) res.warnings.push('音節拼回去不等於原單字');
    if (ip && !sight && ip.nuclei.length && ip.nuclei.length !== finalSyl.length) res.warnings.push(`IPA 有 ${ip.nuclei.length} 個母音音，但切成 ${finalSyl.length} 個音節`);
    res.phMapped = opts.ipa ? mapPhonemes(part.units, opts.ipa) : false;
    res.stars = computeStars(res);
    return res;
  }

  function splitIPAForCompound(ip, compound, known, opts) {
    if (!ip) return [null, null];
    // 依母音數比例切 IPA：先算第一部分的母音單位數
    const n1 = tokenize(compound[0], null).filter((u) => u.type === 'V').length;
    const nuc = ip.nuclei;
    if (nuc.length < 2) return [null, null];
    const mk = (arr) => ({ raw: '', norm: ip.norm, nuclei: arr, has: ip.has });
    return [mk(nuc.slice(0, n1)), mk(nuc.slice(n1))];
  }

  function guessVowelKey(u, word, syl, units) {
    if (u.sub === 'team') {
      if (u.text === 'ie' && word.length <= 4) return 'long_i';
      return TEAM_KEY[u.text];
    }
    if (u.sub === 'bossy') return BOSSY_KEY[u.text];
    if (u.sub === 'team_r') return { air: 'air', ear: 'ear', our: 'or', oor: 'or', oar: 'or' }[u.text] || 'er';
    if (u.sub === 'le') return 'le';
    if (u.sub === 'y') return syl.length > 1 && u.end === word.length ? 'long_e' : (syl.length === 1 && u.end === word.length ? 'long_i' : 'short_i');
    const L = { a: 'long_a', e: 'long_e', i: 'long_i', o: 'long_o', u: 'long_u' };
    const S = { a: 'short_a', e: 'short_e', i: 'short_i', o: 'short_o', u: 'short_u' };
    if (u.magicBy) return L[u.text];
    // 所在音節以母音結尾 → 開音節 → 長音
    let acc = 0, s = '';
    for (const x of syl) { if (u.start < acc + x.length) { s = x; break; } acc += x.length; }
    const endsHere = acc + s.length === u.end;
    return endsHere ? L[u.text] : S[u.text];
  }

  function computeStars(r) {
    const n = (r.syllables || []).length;
    if (n >= 3) return 5;
    if (n === 2) return 4;
    if (r.strategy === 'sight') return 3;
    const units = r.units || [];
    if (units.some((u) => u.sub === 'bossy' || u.sub === 'team' || u.sub === 'team_r') || r.magicE) return 3;
    const consonantRun = /[^aeiouy]{2,}/.test(r.word);
    if (units.some((u) => u.sub === 'digraph' || u.sub === 'trigraph') || consonantRun) return 2;
    return 1;
  }


  // ---------- 依 IPA 音素表，把每個字母單位對應到這個字實際的音素 ----------
  const IPA_V = ['aɪə', 'aʊə', 'eɪ', 'aɪ', 'ɔɪ', 'aʊ', 'əʊ', 'oʊ', 'ɪə', 'eə', 'ʊə', 'iː', 'uː', 'ɑː', 'ɔː', 'ɜː', 'ɛː',
    'ɑr', 'ɔr', 'ɛr', 'ɪr', 'ʊr', 'ɜr', 'ər', 'ɝ', 'ɚ', 'æ', 'e', 'ɛ', 'ɪ', 'i', 'ɒ', 'ɑ', 'ʌ', 'ɔ', 'ʊ', 'u', 'ə', 'ɐ', 'o', 'a', 'ɜ', 'ᵻ'];
  const IPA_C2 = ['tʃ', 'dʒ'];
  const isIpaV = (ch) => !!ch && IPA_V.some((v) => v[0] === ch);
  function ipaSegments(ipa) {
    // 音節點是界線：母音組合不會跨過音節（lion 的 aɪ.ə 不會被當成一個三合母音）
    const pieces = String(ipa || '').replace(/[\/\[\]()ˈˌ\s]/g, '').replace(/ɹ/g, 'r').replace(/g/g, 'ɡ').replace(/̩/g, '').split('.');
    const out = [];
    for (const s of pieces) {
      let i = 0;
      while (i < s.length) {
        const v = IPA_V.find((p) => s.startsWith(p, i) && !(p.length > 1 && p.endsWith('r') && isIpaV(s[i + p.length])));
        if (v) {
          let len = v.length;
          if (s[i + len] === 'ː' && !v.endsWith('ː')) len++;
          const seg = s.slice(i, i + len);
          const prev = out[out.length - 1];
          // /juː/（computer 的 u）：j 跟母音一起算
          if (prev && prev.t === 'C' && prev.ipa === 'j' && /^u/.test(seg)) { prev.t = 'V'; prev.ipa = 'j' + seg; }
          else out.push({ t: 'V', ipa: seg });
          i += len; continue;
        }
        const c2 = IPA_C2.find((p) => s.startsWith(p, i));
        if (c2) { out.push({ t: 'C', ipa: c2 }); i += 2; continue; }
        if (s[i] === 'ː') { i++; continue; }
        out.push({ t: 'C', ipa: s[i] }); i++;
      }
    }
    return out;
  }
  const COMPAT = {
    b: ['b'], c: ['k', 's'], ch: ['tʃ', 'k', 'ʃ'], ck: ['k'], d: ['d'], dge: ['dʒ'], f: ['f'], g: ['ɡ', 'dʒ'], h: ['h'], j: ['dʒ'],
    k: ['k'], l: ['l'], m: ['m'], n: ['n', 'ŋ'], ng: ['ŋ', 'ŋɡ'], nk: ['ŋk'], p: ['p'], ph: ['f'], qu: ['kw', 'k'], r: ['r'],
    s: ['s', 'z', 'ʃ', 'ʒ'], sh: ['ʃ'], t: ['t', 'tʃ'], tch: ['tʃ'], th: ['θ', 'ð'], v: ['v'], w: ['w'], wh: ['w', 'h'],
    x: ['ks', 'ɡz'], y: ['j'], z: ['z', 's', 't', 'ts'],
  };
  function alignGap(units, phs) {
    const m = units.length, n = phs.length, INF = 1e9;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(INF));
    const back = Array.from({ length: m + 1 }, () => Array(n + 1).fill(null));
    dp[0][0] = 0;
    for (let i = 0; i <= m; i++) for (let j = 0; j <= n; j++) {
      const c = dp[i][j]; if (c >= INF) continue;
      if (j < n && c + 4 < dp[i][j + 1]) { dp[i][j + 1] = c + 4; back[i][j + 1] = [i, j, -1]; } // 多出來的音素
      if (i === m) continue;
      const u = units[i];
      for (let L = 0; L <= 2 && j + L <= n; L++) {
        const seq = phs.slice(j, j + L).join('');
        let cost;
        if (L === 0) cost = (i > 0 && units[i - 1].text === u.text) || u.text === 'r' || u.text === 'h' ? 0.3 : 2;
        else cost = (COMPAT[u.text] || [u.text]).includes(seq) ? 0 : (L === 1 ? 3 : 5);
        if (c + cost < dp[i + 1][j + L]) { dp[i + 1][j + L] = c + cost; back[i + 1][j + L] = [i, j, L]; }
      }
    }
    const res = Array(m).fill('');
    let i = m, j = n;
    while (i > 0 || j > 0) {
      const b = back[i][j]; if (!b) break;
      if (b[2] >= 0) res[b[0]] = phs.slice(b[1], b[1] + b[2]).join('');
      i = b[0]; j = b[1];
    }
    return res;
  }
  function mapPhonemes(units, ipa) {
    const segs = ipaSegments(ipa);
    const vs = units.filter((u) => u.type === 'V');
    const nuc = segs.filter((x) => x.t === 'V');
    if (!segs.length || nuc.length !== vs.length) return false;
    // 字尾 le：/əl/ 的 l 跟著 le 一起（turtle 的 le = /əl/）
    vs.forEach((u, k) => {
      if (u.sub !== 'le') return;
      const at = segs.indexOf(nuc[k]);
      if (segs[at + 1] && segs[at + 1].t === 'C' && segs[at + 1].ipa === 'l') { nuc[k].ipa += 'l'; segs.splice(at + 1, 1); }
    });
    // 依母音把字母與音素切成一段一段（母音前、母音之間、母音後），每段內的子音用最小代價對齊
    const gapsU = [[]], gapsP = [[]];
    units.forEach((u) => { if (u.type === 'V') { gapsU.push([]); } else if (u.type === 'C') gapsU[gapsU.length - 1].push(u); });
    segs.forEach((x) => { if (x.t === 'V') gapsP.push([]); else gapsP[gapsP.length - 1].push(x.ipa); });
    vs.forEach((u, k) => { u.ph = nuc[k].ipa; });
    gapsU.forEach((gu, k) => {
      const res = alignGap(gu, gapsP[k] || []);
      gu.forEach((u, idx) => {
        u.ph = res[idx];
        if (!u.ph) {
          const prev = gu[idx - 1];
          if (prev && prev.text === u.text) { u.ph = prev.ph; u.dbl = true; } // 重複字母同一個音
          else u.phSilent = true;
        }
      });
    });
    return true;
  }

  // ---------- 音素框（Elkonin Boxes）：一個音一格 ----------
  // 回傳 [{ letters, key, silent }]，不發音字母另成虛線框（silent: true）
  function elkonin(r) {
    const w = r.word;
    const silentAt = new Set();
    if (/^kn/.test(w)) silentAt.add(0);
    if (/^wr/.test(w)) silentAt.add(0);
    if (/mb$/.test(w)) silentAt.add(w.length - 1);
    const boxes = [];
    for (const u of r.units || []) {
      if (u.type === 'S' || u.phSilent || silentAt.has(u.start) && u.text.length === 1) {
        boxes.push({ letters: u.text, key: 'silent', silent: true, magic: !!u.magic });
        continue;
      }
      const prev = boxes[boxes.length - 1];
      // 重複子音（bb、ll、zz…）只有一個音，放同一格
      if (u.type === 'C' && prev && !prev.silent && prev.type === 'C' && prev.letters.slice(-1) === u.text && u.text.length === 1) {
        prev.letters += u.text;
        if (u.ph && !u.dbl) prev.ph += u.ph; // pizza 的 zz = /ts/
        continue;
      }
      boxes.push({ letters: u.text, key: u.key, ph: u.ph || '', silent: false, type: u.type });
    }
    return boxes;
  }

  // 音素轉檔名（避免特殊符號）：b → 62，eɪ → 65_26a
  const phFile = (ph) => Array.from(ph).map((c) => c.codePointAt(0).toString(16)).join('_');
  // 產生語音用的 IPA：子音不能單獨發聲，加極短的 /ə/（b → bə，像「ㄅ」）
  function phSay(ph) {
    if (!ph) return '';
    if (isIpaV(ph[0]) || /^j[uː]/.test(ph)) return ph;
    if (/^ŋ/.test(ph) || /^(ks|ts|ɡz)$/.test(ph)) return 'ə' + ph;
    return ph + 'ə';
  }

  const api = { analyze, parseIPA, tokenize, elkonin, ipaSegments, mapPhonemes, phFile, phSay, RULES, SIGHT, LONG, SHORT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PK_PHONICS = api;
})(this);
