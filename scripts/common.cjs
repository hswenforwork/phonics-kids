// 腳本共用：網站用的單字資料（由 scripts/sync-sheet.cjs 從 data/words.csv 產生的 data/sheet.json）
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { THEMES, BASE_WORDS, LETTERS } = require('../js/data.js');
const { SOUNDS } = require('../js/sounds.js');
const P = require('../js/phonics.js');
const { readSheetJSON } = require('./sheet.cjs');

/** 上線中的單字：{ word, zh, theme, emoji, ipa, syl, boxPh, boxAudio, wordAudio } */
const allEntries = () => readSheetJSON().words || [];
const known = () => new Set([...BASE_WORDS, ...allEntries().map((e) => e.word)]);

module.exports = { ROOT, THEMES, SOUNDS, LETTERS, P, allEntries, known };
