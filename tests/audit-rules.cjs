// 檢查單字庫每張字母卡的發音是否符合 references/rules.md
// 符合規則表 → 不列出；屬於已知例外 → 列出並附說明；說不出原因的例外 → 視為錯誤
// 執行：node tests/audit-rules.cjs
const { BASE_WORDS } = require('../js/data.js');
const { THEMES } = require('./lib-words.cjs');
const P = require('../js/phonics.js');

const known = new Set(BASE_WORDS);
THEMES.forEach((t) => t.words.forEach((w) => known.add(w[0])));

let checked = 0;
const errors = [], exceptions = [], sight = [];
for (const t of THEMES) {
  for (const [word, , , ipa, syl] of t.words) {
    const r = P.analyze(word, { ipa, known, libSyllables: syl });
    if (!r.phMapped) { errors.push(`${word}：音標無法對應到字母`); continue; }
    if (r.strategy === 'sight') { sight.push(word); continue; }
    for (const u of r.units) {
      if (u.type === 'S') continue;
      checked++;
      const n = P.ruleNote(r, u);
      if (!n) continue;
      const line = `${word} 的 ${u.text}：念 /${u.phSilent ? '不發音' : u.ph}/（規則表為 /${n.exp}/）→ ${n.why}`;
      if (/^例外念法/.test(n.why)) errors.push(line); else exceptions.push(line);
    }
    // 魔法 e 前的母音一定要念長音
    const v = r.units.find((x) => x.magicBy);
    if (v && P.ruleNote(r, v)) errors.push(`${word}：魔法 e 前的 ${v.text} 沒有念長音`);
  }
}
console.log(`檢查了 ${checked} 張字母卡（一眼認讀字 ${sight.length} 個不套規則：${sight.join('、')}）\n`);
console.log(`✅ 符合 rules.md：${checked - exceptions.length - errors.length} 張`);
console.log(`ℹ️ 已知例外（有說明）：${exceptions.length} 張`);
exceptions.forEach((x) => console.log('  - ' + x));
console.log(`❌ 無法說明的不符合：${errors.length} 項`);
errors.forEach((x) => console.log('  - ' + x));
process.exit(errors.length ? 1 : 0);
