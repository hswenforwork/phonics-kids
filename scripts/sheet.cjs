// 單字表單（data/*.csv）讀寫工具：給同步腳本、申請單、語音產生、測試共用
// CSV 一律用 UTF-8（含 BOM，Excel 開啟中文才不會亂碼）
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');

// 欄位（中文標題）。「自動_」開頭的欄位由系統填寫，手改會被蓋回
const WORD_COLS = ['英文單字', '中文', '主題', '圖示', '音標', '音節', '整字音檔', '音素音檔', '啟用',
  '自動_等級', '自動_音節', '自動_音節數', '自動_格子', '自動_音素', '自動_檢查'];
const SOUND_COLS = ['聲音', '說明', '音檔', '自動_共用檔名', '自動_例字', '自動_使用字數', '自動_目前來源', '自動_檢查'];
const EXC_COLS = ['單字', '第幾格', '字母', '改念音素', '備註', '自動_檢查'];
const FILES = { words: 'words.csv', sounds: 'sounds.csv', exceptions: 'exceptions.csv' };
const COLS = { words: WORD_COLS, sounds: SOUND_COLS, exceptions: EXC_COLS };

class SheetError extends Error {}

function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}
const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

/** 讀一張表，回傳物件陣列（key 為中文欄名）；檢查是不是 UTF-8 */
function readTable(name) {
  const file = path.join(DATA, FILES[name]);
  if (!fs.existsSync(file)) return [];
  const buf = fs.readFileSync(file);
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) {
    throw new SheetError(`${FILES[name]} 不是 UTF-8 編碼，中文和音標會變亂碼。請在 Excel「另存新檔」時選「CSV UTF-8（逗號分隔）」再上傳。`);
  }
  text = text.replace(/^﻿/, '');
  const rows = parseCSV(text);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim());
  const key = COLS[name][0];
  if (!head.includes(key)) throw new SheetError(`${FILES[name]} 的第一列找不到「${key}」欄位標題，請確認沒有刪掉或改到標題列。`);
  return rows.slice(1).map((r, i) => {
    const o = { _line: i + 2 };
    head.forEach((h, k) => { if (h) o[h] = (r[k] || '').trim(); });
    return o;
  });
}
function writeTable(name, rows) {
  const cols = COLS[name];
  const lines = [cols.map(csvCell).join(',')].concat(rows.map((r) => cols.map((c) => csvCell(r[c])).join(',')));
  fs.writeFileSync(path.join(DATA, FILES[name]), '﻿' + lines.join('\r\n') + '\r\n');
}

const yes = (v) => !/^(否|no|n|false|0|x|×|關|停用)$/i.test(String(v || '').trim());
const wordKey = (w) => String(w || '').toLowerCase().replace(/[^a-z]/g, '');

/** 網站產生的資料（同步腳本輸出）；語音產生、測試用 */
function readSheetJSON() {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, 'sheet.json'), 'utf8')); } catch (e) { return { words: [], sounds: {}, files: [] }; }
}

module.exports = { ROOT, DATA, WORD_COLS, SOUND_COLS, EXC_COLS, FILES, SheetError, parseCSV, readTable, writeTable, yes, wordKey, readSheetJSON };
