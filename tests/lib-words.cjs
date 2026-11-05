// 測試用：把表單（data/sheet.json）整理成「主題 → 單字陣列」的舊格式
const { readSheetJSON } = require('../scripts/sheet.cjs');
const sheet = readSheetJSON();
const by = new Map();
for (const e of sheet.words || []) {
  if (!by.has(e.theme)) by.set(e.theme, { id: e.theme, words: [] });
  by.get(e.theme).words.push([e.word, e.zh, e.emoji, e.ipa, e.syl || e.word]);
}
module.exports = { THEMES: [...by.values()], SHEET: sheet };
