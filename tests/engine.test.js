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
  ['cake', '/keɪk/', 'c=k a=eɪ k=k'], ['nose', '/nəʊz/', 'n=n o=əʊ s=z'], ['biscuit', '/ˈbɪs.kɪt/', 'b=b i=ɪ s=s c=k ui=ɪ t=t'],
  ['computer', '/kəm.ˈpjuː.tə/', 'c=k o=ə m=m p=p u=juː t=t er=ə'], ['turtle', '/ˈtɜː.təl/', 't=t ur=ɜː t=t le=əl'],
  ['fox', '/fɒks/', 'f=f o=ɒ x=ks'], ['knee', '/niː/', 'k=∅ n=n ee=iː'], ['lion', '/ˈlaɪ.ən/', 'l=l i=aɪ o=ə n=n'],
]) check(phs(w, ipa) === exp, `音素對應 ${w}: ${phs(w, ipa)}，應為 ${exp}`);
let unmapped = [];
THEMES.forEach((t) => t.words.forEach(([w, , , ipa, syl]) => { if (!P.analyze(w, { ipa, known, libSyllables: syl }).phMapped) unmapped.push(w); }));
check(unmapped.length === 0, `單字庫都要能對應音素：${unmapped.join(', ')}`);

console.log(`\n${total - fail}/${total} 通過`);
process.exit(fail ? 1 : 0);
