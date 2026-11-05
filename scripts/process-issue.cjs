// 處理家長模式表單頁送出的 GitHub 申請單，把內容寫進表單（data/*.csv）
//   pk-action: edit（新增或修改一個字）、sound（修改聲音表的音檔）
// 寫完後由流程接著執行 sync-sheet.cjs（補齊欄位、檢查、產生網站資料）
// 申請單內容從環境變數 ISSUE_BODY 讀取（不會被當成指令執行）
const fs = require('fs');
const S = require('./sheet.cjs');

const body = process.env.ISSUE_BODY || '';
const resultFile = process.env.RESULT_FILE || 'result.md';
const fields = {};
body.split(/\r?\n/).forEach((line) => {
  const m = line.match(/^\s*([^:：\s][^:：]{0,30}?)\s*[:：]\s?(.*?)\s*$/);
  if (m && !(m[1] in fields)) fields[m[1]] = m[2];
});
const done = (ok, msg) => { fs.writeFileSync(resultFile, msg + '\n'); console.log(msg); process.exit(ok ? 0 : 1); };
const clean = (s, n = 80) => String(s || '').replace(/[\r\n]/g, ' ').replace(/[<>`$\\]/g, '').trim().slice(0, n);

const action = (fields['pk-action'] || '').toLowerCase();
let tables;
try { tables = { words: S.readTable('words'), sounds: S.readTable('sounds'), exceptions: S.readTable('exceptions') }; } catch (e) { done(false, '❌ ' + e.message); }

if (action === 'edit' || action === 'add') {
  const word = S.wordKey(fields.word);
  if (!word || word.length > 24) done(false, '❌ 單字格式不正確（只能是 1～24 個英文字母）。');
  let row = tables.words.find((r) => S.wordKey(r['英文單字']) === word);
  const isNew = !row;
  if (isNew) { row = { '英文單字': word }; tables.words.push(row); }
  const changes = [];
  for (const col of ['中文', '主題', '圖示', '音標', '音節', '整字音檔', '音素音檔', '啟用']) {
    if (!(col in fields)) continue;
    const v = clean(fields[col], col === '音素音檔' ? 400 : 80);
    if ((row[col] || '') !== v) { changes.push(`${col}：${row[col] || '（空白）'} → ${v || '（空白）'}`); row[col] = v; }
  }
  // 例外：「2=ʌ、4=s」整串取代這個字原本的例外
  if ('例外' in fields) {
    const before = tables.exceptions.filter((x) => S.wordKey(x['單字']) === word).map((x) => `${x['第幾格']}=${x['改念音素']}`).join('、');
    const list = clean(fields['例外'], 200).split(/[,，、;；\s]+/).filter(Boolean).map((p) => p.split('=')).filter((p) => p.length === 2 && /^\d+$/.test(p[0].trim()) && p[1].trim());
    const keep = tables.exceptions.filter((x) => S.wordKey(x['單字']) !== word);
    const old = tables.exceptions.filter((x) => S.wordKey(x['單字']) === word);
    tables.exceptions = keep.concat(list.map(([i, ph]) => {
      const prev = old.find((x) => x['第幾格'] === i.trim());
      return { '單字': word, '第幾格': i.trim(), '字母': '', '改念音素': ph.trim().replace(/[\/\s]/g, ''), '備註': prev ? prev['備註'] : '' };
    }));
    const after = list.map(([i, ph]) => `${i.trim()}=${ph.trim()}`).join('、');
    if (before !== after) changes.push(`例外音素：${before || '（無）'} → ${after || '（無）'}`);
  }
  S.writeTable('words', tables.words);
  S.writeTable('exceptions', tables.exceptions);
  done(true, `✅ ${isNew ? '已新增' : '已更新'} **${word}**\n${changes.map((c) => '- ' + c).join('\n') || '- 沒有變更'}\n`);
}

if (action === 'sound') {
  // 一行一個：「音檔 k: my-k.mp3」，值空白代表改回 AI
  const changes = [];
  for (const [k, v] of Object.entries(fields)) {
    const m = k.match(/^音檔\s+(\S+)$/);
    if (!m) continue;
    const ph = m[1].replace(/[\/\[\]]/g, '');
    let row = tables.sounds.find((x) => x['聲音'] === ph);
    if (!row) { row = { '聲音': ph }; tables.sounds.push(row); }
    const val = clean(v);
    if ((row['音檔'] || '') !== val) { changes.push(`/${ph}/：${row['音檔'] || 'AI'} → ${val || 'AI'}`); row['音檔'] = val; }
  }
  S.writeTable('sounds', tables.sounds);
  done(true, `✅ 已更新聲音表\n${changes.map((c) => '- ' + c).join('\n') || '- 沒有變更'}\n`);
}

done(false, '❌ 看不懂這張申請單（缺少 pk-action）。');
