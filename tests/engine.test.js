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

console.log(`\n${total - fail}/${total} 通過`);
process.exit(fail ? 1 : 0);
