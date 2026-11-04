// 執行：node tests/engine.test.js
const { THEMES, BASE_WORDS } = require('../js/data.js');
const P = require('../js/phonics.js');

const known = new Set(BASE_WORDS);
THEMES.forEach((t) => t.words.forEach((w) => known.add(w[0])));

let fail = 0, total = 0;
const check = (cond, msg) => { total++; if (!cond) { fail++; console.log('✗', msg); } };

// 1. 單字庫：規則引擎（不給標準答案）推得的音節應與發音優先的標準音節一致
for (const t of THEMES) {
  for (const [word, zh, , ipa, syl] of t.words) {
    const r = P.analyze(word, { ipa, known });
    check(r.ruleSyllables.join('-') === syl, `${word}: 規則=${r.ruleSyllables.join('-')} 標準=${syl} (對齊=${r.aligned})`);
    const r2 = P.analyze(word, { ipa, known, libSyllables: syl, zh });
    check(r2.syllables.join('') === word, `${word}: 拼回原字`);
    let acc = 0;
    r2.cutPositions.forEach((c, i) => { acc += r2.syllables[i].length; check(c === acc, `${word}: cut_position`); });
    check(r2.warnings.length === 0, `${word}: 警告 ${r2.warnings.join('；')}`);
  }
}

// 2. 原方法的經典易錯字（給 IPA，不給標準答案）
const cases = [
  ['animal', '/ˈæn.ə.məl/', 'an-i-mal'],
  ['river', '/ˈrɪv.ɚ/', 'riv-er'],
  ['never', '/ˈnɛv.ɚ/', 'nev-er'],
  ['clever', '/ˈklɛv.ɚ/', 'clev-er'],
  ['second', '/ˈsɛk.ənd/', 'sec-ond'],
  ['music', '/ˈmju.zɪk/', 'mu-sic'],
  ['open', '/ˈoʊ.pən/', 'o-pen'],
  ['camel', '/ˈkæm.əl/', 'cam-el'],
  ['napkin', '/ˈnæp.kɪn/', 'nap-kin'],
  ['dangerous', '/ˈdeɪn.dʒɚ.əs/', 'dan-ger-ous'],
  ['conductor', '/kən.ˈdʌk.tɚ/', 'con-duc-tor'],
  ['angry', '/ˈæŋ.ɡri/', 'ang-ry'],
  ['finger', '/ˈfɪŋ.ɡɚ/', 'fin-ger'],
  ['poem', '/ˈpoʊ.əm/', 'po-em'],
  ['puzzle', '/ˈpʌz.əl/', 'puz-zle'],
  ['sunflower', '/ˈsʌn.flaʊ.ɚ/', 'sun-flow-er'],
  ['singing', '/ˈsɪŋ.ɪŋ/', 'sing-ing'],
  ['unhappy', '/ʌn.ˈhæp.i/', 'un-hap-py'],
];
for (const [w, ipa, exp] of cases) {
  const r = P.analyze(w, { ipa, known });
  check(r.syllables.join('-') === exp, `${w}: 得到 ${r.syllables.join('-')}，應為 ${exp}`);
}

// 3. 無 IPA 時要標示未驗證
const nr = P.analyze('basket', { known });
check(!nr.verified, 'basket 無 IPA 應標示未驗證');
check(nr.syllables.join('-') === 'bas-ket', `basket 無 IPA: ${nr.syllables.join('-')}`);

// 4. 特效
check(P.analyze('cake', { ipa: '/keɪk/', known }).magicE, 'cake 魔法 e');
check(P.analyze('sight', { ipa: '/saɪt/', known }).silent.some((s) => s.letter === 'gh'), 'sight 不發音 gh');
check(P.analyze('knee', { ipa: '/ni/', known }).silent.some((s) => s.letter === 'k'), 'knee 不發音 k');
check(P.analyze('was', { known }).strategy === 'sight', 'was 一眼認讀字');

// 5. 音素框：一個音一格
const boxes = (w, ipa) => P.elkonin(P.analyze(w, { ipa, known })).map((b) => (b.silent ? `(${b.letters})` : b.letters)).join('/');
for (const [w, ipa, exp] of [
  ['ship', '/ʃɪp/', 'sh/i/p'], ['cake', '/keɪk/', 'c/a/k/(e)'], ['rabbit', '/ˈræb.ɪt/', 'r/a/bb/i/t'],
  ['chair', '/tʃeə/', 'ch/air'], ['sheep', '/ʃiːp/', 'sh/ee/p'], ['knee', '/niː/', '(k)/n/ee'], ['night', '/naɪt/', 'n/igh/t'],
  ['tiger', '/ˈtaɪ.ɡə/', 't/i/g/er'], ['turtle', '/ˈtɜː.təl/', 't/ur/t/le'],
]) check(boxes(w, ipa) === exp, `音素框 ${w}: ${boxes(w, ipa)}，應為 ${exp}`);

// 6. 依 IPA 音素表對應字母
const phs = (w, ipa) => { const r = P.analyze(w, { ipa, known }); return r.units.filter((u) => u.type !== 'S').map((u) => `${u.text}=${u.phSilent ? '∅' : u.ph}`).join(' '); };
for (const [w, ipa, exp] of [
  ['cake', '/keɪk/', 'c=k a=eɪ k=k'], ['nose', '/nəʊz/', 'n=n o=əʊ s=z'], ['biscuit', '/ˈbɪs.kɪt/', 'b=b i=ɪ s=s c=k i=ɪ t=t'],
  ['computer', '/kəm.ˈpjuː.tə/', 'c=k o=ə m=m p=p u=juː t=t er=ə'], ['turtle', '/ˈtɜː.təl/', 't=t ur=ɜː t=t le=əl'],
  ['fox', '/fɒks/', 'f=f o=ɒ x=ks'], ['knee', '/niː/', 'k=∅ n=n ee=iː'], ['lion', '/ˈlaɪ.ən/', 'l=l i=aɪ o=ə n=n'],
]) check(phs(w, ipa) === exp, `音素對應 ${w}: ${phs(w, ipa)}，應為 ${exp}`);
let unmapped = [];
THEMES.forEach((t) => t.words.forEach(([w, , , ipa, syl]) => { if (!P.analyze(w, { ipa, known, libSyllables: syl }).phMapped) unmapped.push(w); }));
check(unmapped.length === 0, `單字庫都要能對應音素：${unmapped.join(', ')}`);

// 7. references/rules.md 的範例（不給 IPA，測試決策指南與例外處理）
const RULES_MD = {
  rabbit: 'rab-bit', napkin: 'nap-kin', pepper: 'pep-per', kitten: 'kit-ten', picnic: 'pic-nic', public: 'pub-lic',
  chicken: 'chick-en', pitcher: 'pitch-er',
  tiger: 'ti-ger', baby: 'ba-by', music: 'mu-sic', open: 'o-pen', robot: 'ro-bot', paper: 'pa-per',
  camel: 'cam-el', city: 'cit-y', robin: 'rob-in', model: 'mod-el', seven: 'sev-en', melon: 'mel-on',
  lion: 'li-on', poem: 'po-em', diet: 'di-et', cruel: 'cru-el', create: 'cre-ate',
  turtle: 'tur-tle', table: 'ta-ble', puzzle: 'puz-zle', simple: 'sim-ple', apple: 'ap-ple', circle: 'cir-cle', gentle: 'gen-tle',
  action: 'ac-tion', nation: 'na-tion', picture: 'pic-ture', nature: 'na-ture',
  finish: 'fin-ish', rapid: 'rap-id', solid: 'sol-id', magic: 'mag-ic', body: 'bod-y', money: 'mon-ey', lemon: 'lem-on', river: 'riv-er',
};
for (const [w, exp] of Object.entries(RULES_MD)) {
  const r = P.analyze(w, { known });
  check(r.syllables.join('-') === exp, `rules.md ${w}: ${r.syllables.join('-')}，應為 ${exp}`);
}
const unitKey = (w, text) => (P.analyze(w, { known }).units.find((u) => u.text === text) || {}).key;
check(unitKey('city', 'c') === 's' && unitKey('pencil', 'c') === 's', '軟 c');
check(unitKey('gym', 'g') === 'j' && unitKey('giant', 'g') === 'j' && unitKey('gentle', 'g') === 'j', '軟 g');
check(unitKey('girl', 'g') === 'g' && unitKey('tiger', 'g') === 'g', '例外的硬 g');
check(unitKey('bread', 'ea') === 'short_e' && unitKey('head', 'ea') === 'short_e' && unitKey('eat', 'ea') === 'long_e', 'ea 長短音');
check(unitKey('cow', 'ow') === 'ow' && unitKey('snow', 'ow') === 'long_o', 'ow 兩種念法');
check(unitKey('book', 'oo') === 'oo_short' && unitKey('moon', 'oo') === 'oo_long', 'oo 長短音');
check(unitKey('yellow', 'y') === 'y', '字首 y 是子音');
for (const [w, letter] of [['knife', 'k'], ['write', 'w'], ['lamb', 'b'], ['talk', 'l'], ['night', 'gh'], ['gnome', 'g'], ['psalm', 'p'], ['listen', 't'], ['castle', 't']]) {
  check(P.analyze(w, { known }).silent.some((s) => s.letter === letter), `不發音字母 ${w} 的 ${letter}`);
}
for (const w of ['cake', 'hope', 'time', 'cute', 'these']) check(P.analyze(w, { known }).magicE, `魔法 e：${w}`);
check(P.analyze('paste', { ipa: '/peɪst/', known }).magicE, '魔法 e：paste（2 個子音，發音確認長音）');
check(P.analyze('nation', { known }).units.some((u) => u.text === 'ti' && u.key === 'sh'), 'tion 的 ti 念 /ʃ/');

// 8. references/rules.md（完整版）新增的規則
const A = (w, ipa) => P.analyze(w, { ipa, known });
for (const w of ['have', 'give', 'love', 'glove']) { const r = A(w); check(r.fakeMagic && !r.magicE, `假魔法 e：${w}`); }
check(A('five').magicE && !A('five').fakeMagic, 'five 是真魔法 e');
check(A('five', '/faɪv/').magicE, 'five（有 IPA）是真魔法 e');
check(A('love').units.find((u) => u.text === 'o').key === 'short_u', 'love 的 o 念 /ʌ/');
for (const w of ['wild', 'child', 'find', 'kind', 'cold', 'old', 'ghost', 'most']) {
  const u = A(w).units.find((x) => x.wildOld);
  check(u && u.key.startsWith('long_'), `閉音節長音：${w}`);
}
check(!A('wind').units.some((u) => u.wildOld), 'wind（風）不是閉音節長音');
const yk = (w) => A(w).units.find((u) => u.text === 'y').key;
check(yk('yes') === 'y' && yk('sky') === 'long_i' && yk('cry') === 'long_i' && yk('baby') === 'long_e' && yk('happy') === 'long_e' && yk('gym') === 'short_i', 'Y 變色龍四種念法');
check(P.yRole(A('sky'), A('sky').units.find((u) => u.text === 'y')).includes('/aɪ/'), 'Y 變色龍說明');
for (const [w, b] of [['frog', 'fr'], ['black', 'bl'], ['stop', 'st'], ['splash', 'spl'], ['street', 'str']]) check(A(w).blends.includes(b), `輔音連綴：${w} 的 ${b}`);
check(!A('ship').blends.length && !A('chip').blends.length && !A('hand').blends.length, '二合輔音與字尾 nd 不列為連綴');
for (const [w, ipa, v] of [['salad', '/ˈsæl.əd/', 'a'], ['lemon', '/ˈlem.ən/', 'o'], ['pencil', '/ˈpen.səl/', 'i'], ['circus', '/ˈsɜː.kəs/', 'u']]) {
  check(A(w, ipa).units.some((u) => u.weak && u.text === v), `弱母音：${w} 的 ${v}`);
}
const team = (w, t, ipa) => A(w, ipa).units.find((u) => u.text === t);
check(team('saw', 'aw', '/sɔː/').ph === 'ɔː' && team('stew', 'ew', '/stjuː/').ph === 'juː' && team('key', 'ey', '/kiː/').ph === 'iː', '母音組合 aw、ew、ey');
for (const [w, exp, type] of [['hopping', 'hop-ping', 'double'], ['running', 'run-ning', 'double'], ['making', 'ma-king', 'drop_e'], ['hoped', 'hoped', 'drop_e'],
  ['happiness', 'hap-pi-ness', 'y_to_i'], ['funnier', 'fun-ni-er', 'y_to_i'], ['crying', 'cry-ing', 'y_keep'], ['stopped', 'stopped', 'double']]) {
  const r = A(w);
  check(r.syllables.join('-') === exp && r.spell && r.spell.type === type, `字尾變化 ${w}: ${r.syllables.join('-')} ${r.spell && r.spell.type}，應為 ${exp} ${type}`);
}

console.log(`\n${total - fail}/${total} 通過`);
process.exit(fail ? 1 : 0);
