// 腳本共用：讀取內建單字庫＋申請單加入的單字與修正
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { THEMES, BASE_WORDS } = require('../js/data.js');
const { SOUNDS } = require('../js/sounds.js');
const P = require('../js/phonics.js');

const CUSTOM_PATH = path.join(ROOT, 'data/custom-words.json');
const readCustom = () => JSON.parse(fs.readFileSync(CUSTOM_PATH, 'utf8'));
const writeCustom = (c) => fs.writeFileSync(CUSTOM_PATH, JSON.stringify(c, null, 2) + '\n');
const THEME_IDS = THEMES.map((t) => t.id).concat(['mine']);

function allEntries() {
  const custom = readCustom();
  const map = new Map();
  THEMES.forEach((t) => t.words.forEach(([word, zh, emoji, ipa, syl]) => { if (!map.has(word)) map.set(word, { word, zh, emoji, ipa, syl, theme: t.id }); }));
  (custom.words || []).forEach((c) => { if (!map.has(c.word)) map.set(c.word, Object.assign({ custom: true }, c)); });
  Object.entries(custom.fixes || {}).forEach(([w, f]) => { if (map.has(w)) Object.assign(map.get(w), f); });
  return [...map.values()];
}
const known = () => new Set([...BASE_WORDS, ...allEntries().map((e) => e.word)]);

module.exports = { ROOT, THEMES, SOUNDS, P, readCustom, writeCustom, allEntries, known, THEME_IDS };
