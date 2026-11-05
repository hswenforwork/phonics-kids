// 同步單字表單：讀 data/words.csv、sounds.csv、exceptions.csv 與 custom/ 上傳的檔案
//   1. 空白的音標、中文、圖示自動查好填回表單
//   2. 依自然發音規則算出等級、音節、格子、音素，寫回「自動_」欄位
//   3. 音素音檔欄：自動填每一格目前使用的檔名；改成 custom/ 裡的檔名就是這一格的例外
//      音節音檔欄：每個音節一段，AI＝AI 語音；改成 custom/ 裡的檔名就改用自己的音檔
//   4. custom/ 裡的音檔轉成 mp3（mp3 原檔直接複製，不改內容）放到 audio/custom/
//   5. 產生網站用的 data/sheet.json
// 有問題的地方寫在「自動_檢查」欄，並輸出到 SYNC_REPORT（申請單回覆、Actions 摘要用）
// 只有表單本身無法讀取（編碼錯誤、標題列被改）才會中止，不寫入任何檔案
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const S = require('./sheet.cjs');
const P = require('../js/phonics.js');
const { THEMES, LETTERS, BASE_WORDS } = require('../js/data.js');
const { SOUNDS } = require('../js/sounds.js');
const { dictIPA, zhOf, IPA_OK } = require('./lookup.cjs');
const EMOJI = require('./emoji-keywords.json');

const ROOT = S.ROOT;
const CUSTOM = path.join(ROOT, 'custom');
const OUT = path.join(ROOT, 'audio/custom');
const AUDIO_EXT = /\.(mp3|m4a|wav|aac|ogg|oga|opus|webm|caf|flac|aiff?|mp4|m4v|mov|3gp|amr|wma)$/i;
const IMG_EXT = /\.(png|jpe?g|gif|webp|svg)$/i;
const OFFLINE = !!process.env.SYNC_OFFLINE; // 測試用：不上網查音標與中文
const SEP = '｜';
const NONE = '—';

const report = { errors: [], warnings: [], notes: [] };
const shareName = (ph) => ph + '.mp3';
const sha = (buf) => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12);
const keyOfPh = (ph) => (Object.entries(SOUNDS).find(([, s]) => s.ipa === ph) || [''])[0];

// ---------- custom/ 上傳的檔案 ----------
function listCustom() {
  if (!fs.existsSync(CUSTOM)) return [];
  return fs.readdirSync(CUSTOM).filter((n) => !n.startsWith('.') && !/^readme/i.test(n) && fs.statSync(path.join(CUSTOM, n)).isFile());
}
const files = listCustom();
const audioFiles = files.filter((n) => AUDIO_EXT.test(n));
const imageFiles = files.filter((n) => IMG_EXT.test(n));
files.filter((n) => !AUDIO_EXT.test(n) && !IMG_EXT.test(n)).forEach((n) => report.warnings.push(`custom/${n}：不是支援的音檔或圖片格式，已略過`));
const noExt = (n) => n.replace(/\.[^.]+$/, '');
/** 依表單填的名稱找 custom/ 裡的檔案（可省略副檔名、不分大小寫） */
function findCustom(name, list) {
  const n = String(name || '').trim().replace(/^custom\//i, '');
  if (!n) return null;
  return list.find((f) => f === n) || list.find((f) => f.toLowerCase() === n.toLowerCase())
    || (list.filter((f) => noExt(f).toLowerCase() === noExt(n).toLowerCase()).length === 1 ? list.find((f) => noExt(f).toLowerCase() === noExt(n).toLowerCase()) : null);
}

// 音檔轉換：同一個原檔只轉一次（依內容雜湊判斷）
const convIndexPath = path.join(OUT, 'index.json');
let convIndex = {};
try { convIndex = JSON.parse(fs.readFileSync(convIndexPath, 'utf8')); } catch (e) { /* 第一次 */ }
const newIndex = {};
const ffmpegOK = spawnSync('ffmpeg', ['-version']).status === 0;
function convertAll() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const n of audioFiles) {
    const buf = fs.readFileSync(path.join(CUSTOM, n));
    const h = sha(buf);
    const id = sha(Buffer.from(n));
    const out = path.join(OUT, id + '.mp3');
    newIndex[n] = { id, hash: h };
    if (convIndex[n] && convIndex[n].hash === h && fs.existsSync(out)) continue;
    if (/\.mp3$/i.test(n)) { fs.writeFileSync(out, buf); continue; }
    if (!ffmpegOK) { report.errors.push(`custom/${n}：這台機器沒有 ffmpeg，無法轉成 mp3`); delete newIndex[n]; continue; }
    const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(CUSTOM, n), '-vn', '-codec:a', 'libmp3lame', '-q:a', '2', out]);
    if (r.status !== 0) { report.errors.push(`custom/${n}：轉檔失敗（${String(r.stderr).trim().split('\n').pop()}）`); delete newIndex[n]; }
  }
  // 移除已刪除原檔的轉換結果
  const keep = new Set(Object.values(newIndex).map((x) => x.id + '.mp3'));
  fs.readdirSync(OUT).filter((f) => f.endsWith('.mp3') && !keep.has(f)).forEach((f) => fs.unlinkSync(path.join(OUT, f)));
}
const customAudio = (name) => { const f = findCustom(name, audioFiles); return f && newIndex[f] ? { file: f, ref: 'custom/' + newIndex[f].id } : null; };

// ---------- 主題 ----------
const themes = THEMES.map((t) => ({ id: t.id, zh: t.zh, emoji: t.emoji }));
function themeId(v) {
  const s = String(v || '').trim();
  if (!s) return 'other';
  const t = themes.find((x) => x.zh === s || x.id === s.toLowerCase());
  if (t) return t.id;
  const id = 'x-' + sha(Buffer.from(s)).slice(0, 6);
  themes.push({ id, zh: s, emoji: '🏷️' });
  return id;
}

function emojiOf(w) {
  for (const k of [w, w + 's', w + 'es', w.replace(/s$/, ''), w.replace(/es$/, ''), w.replace(/ies$/, 'y')]) if (EMOJI[k]) return EMOJI[k];
  return '';
}

(async () => {
  let wordRows, soundRows, excRows;
  try {
    wordRows = S.readTable('words');
    soundRows = S.readTable('sounds');
    excRows = S.readTable('exceptions');
  } catch (e) {
    if (!(e instanceof S.SheetError)) throw e;
    report.errors.push(e.message);
    return finish(true);
  }
  convertAll();

  // ---------- 單字表：補齊空白欄位 ----------
  const seen = new Set();
  const rows = [];
  for (const r of wordRows) {
    const w = S.wordKey(r['英文單字']);
    r._warn = [];
    if (!w) { if (r['英文單字']) r._warn.push('英文單字只能有英文字母'); r._skip = true; rows.push(r); continue; }
    if (r['英文單字'] !== w) r['英文單字'] = w;
    if (seen.has(w)) { r._warn.push('重複的單字，這一列已略過'); r._skip = true; rows.push(r); continue; }
    seen.add(w);
    if (r['音標'] && !IPA_OK.test(r['音標'])) r._warn.push('音標裡有無法辨識的符號');
    if (!r['音標'] && !OFFLINE) { r['音標'] = await dictIPA(w); if (r['音標']) report.notes.push(`${w}：查到音標 ${r['音標']}`); }
    if (!r['中文'] && !OFFLINE) { r['中文'] = await zhOf(w); if (r['中文']) report.notes.push(`${w}：自動翻譯中文「${r['中文']}」，請確認`); }
    if (!r['圖示']) { r['圖示'] = emojiOf(w) || '🌟'; report.notes.push(`${w}：自動配圖示 ${r['圖示']}`); }
    if (!r['啟用']) r['啟用'] = '是';
    rows.push(r);
  }
  const known = new Set([...BASE_WORDS, ...seen]);

  // 例外表：依單字分組
  const excBy = new Map();
  for (const x of excRows) {
    x._warn = [];
    const w = S.wordKey(x['單字']);
    x['單字'] = w;
    if (!seen.has(w)) { x._warn.push('單字表裡沒有這個字'); continue; }
    if (!excBy.has(w)) excBy.set(w, []);
    excBy.get(w).push(x);
  }

  // ---------- 逐字分析 ----------
  const out = [];
  const usage = new Map(); // 音素 → 使用的字
  for (const r of rows) {
    if (r._skip) { r['自動_檢查'] = r._warn.join('；'); continue; }
    const w = r['英文單字'];
    const syl = r['音節'] ? r['音節'].toLowerCase().replace(/\s/g, '') : '';
    const a = P.analyze(w, { ipa: r['音標'], known, libSyllables: syl || undefined });
    if (syl && syl.replace(/-/g, '') !== w) r._warn.push('音節拼起來和單字不同');
    if (!a.verified) r._warn.push('沒有音標，格子是依拼字推測');
    const level = P.levelOf(a);
    const boxes = P.elkonin(a);

    // 例外表：這一格改念哪個音素
    const boxPh = {};
    for (const x of excBy.get(w) || []) {
      const i = parseInt(x['第幾格'], 10);
      const ph = String(x['改念音素'] || '').replace(/[\/\[\]\s]/g, '');
      const b = boxes[i - 1];
      if (!b) { x._warn.push(`第幾格要在 1～${boxes.length} 之間`); continue; }
      if (b.silent) { x._warn.push(`第 ${i} 格（${b.letters}）不發音，不能改音素`); continue; }
      if (x['字母'] && x['字母'].toLowerCase() !== b.letters) { x._warn.push(`第 ${i} 格現在是「${b.letters}」，不是「${x['字母']}」，請確認格子位置`); continue; }
      if (!ph || !IPA_OK.test(ph)) { x._warn.push('改念音素空白或有無法辨識的符號'); continue; }
      x['字母'] = b.letters;
      boxPh[i] = ph;
    }
    P.applyOverrides(boxes, { boxPh });

    // 音素音檔欄：每一格目前用的檔名；改成 custom/ 檔名就是例外
    const defaults = boxes.map((b) => (b.silent ? NONE : shareName(b.ph)));
    const cell = (r['音素音檔'] || '').trim();
    const segs = cell ? cell.split(/[｜|]/).map((s) => s.trim()) : [];
    const boxAudio = {};
    if (segs.length && segs.length !== boxes.length) {
      r._warn.push(`音素音檔有 ${segs.length} 格，但這個字有 ${boxes.length} 格（${boxes.map((b) => b.letters).join(SEP)}），這一欄先不套用，請修正`);
    } else {
      const fixed = defaults.slice();
      segs.forEach((s, k) => {
        const b = boxes[k];
        if (!s || s === defaults[k]) return;
        if (b.silent) { r._warn.push(`第 ${k + 1} 格（${b.letters}）不發音，不需要音檔`); return; }
        const c = customAudio(s);
        if (c) { boxAudio[k + 1] = c.ref; fixed[k] = c.file; return; }
        const m = s.match(/^(.+)\.mp3$/i);
        if (m && (keyOfPh(m[1]) || usage.has(m[1]) || soundRows.some((x) => x['聲音'] === m[1]))) { boxAudio[k + 1] = 'ph:' + m[1]; fixed[k] = s; return; }
        r._warn.push(`第 ${k + 1} 格的音檔「${s}」在 custom/ 資料夾找不到`);
        fixed[k] = s;
      });
      r['音素音檔'] = fixed.join(SEP);
    }
    boxes.forEach((b) => { if (!b.silent && b.ph) { if (!usage.has(b.ph)) usage.set(b.ph, []); usage.get(b.ph).push(w); } });

    // 音節音檔欄：每個音節一段，「AI」＝用 AI 語音；改成 custom/ 檔名就改用自己的音檔
    const sylAudio = {};
    {
      const n = a.syllables.length;
      const cellS = (r['音節音檔'] || '').trim();
      const segS = cellS ? cellS.split(/[｜|]/).map((x) => x.trim()) : [];
      if (segS.length && segS.length !== n) {
        r._warn.push(`音節音檔有 ${segS.length} 段，但這個字有 ${n} 個音節（${a.syllables.join('-')}），這一欄先不套用，請修正`);
      } else {
        const fixedS = a.syllables.map(() => 'AI');
        segS.forEach((x, k) => {
          if (!x || /^ai$/i.test(x)) return;
          const c = customAudio(x);
          if (c) { sylAudio[k] = c.ref; fixedS[k] = c.file; } else { r._warn.push(`第 ${k + 1} 個音節的音檔「${x}」在 custom/ 資料夾找不到`); fixedS[k] = x; }
        });
        r['音節音檔'] = fixedS.join(SEP);
      }
    }

    // 整字音檔、圖示
    let wordAudio = '';
    if (r['整字音檔']) { const c = customAudio(r['整字音檔']); if (c) wordAudio = c.ref; else r._warn.push(`整字音檔「${r['整字音檔']}」在 custom/ 資料夾找不到`); }
    let emoji = r['圖示'], img = '';
    if (IMG_EXT.test(emoji)) { const f = findCustom(emoji, imageFiles); if (f) { img = 'custom/' + f; emoji = ''; } else { r._warn.push(`圖示「${emoji}」在 custom/ 資料夾找不到`); emoji = '🌟'; } }

    r['自動_等級'] = level == null ? '我的單字（只聽與認字）' : `${level} ${P.LEVELS[level].zh}`;
    r['自動_音節'] = a.syllables.join('-');
    r['自動_音節數'] = String(a.syllables.length);
    r['自動_格子'] = boxes.map((b) => (b.silent ? `(${b.letters})` : b.letters)).join(SEP);
    r['自動_音素'] = boxes.map((b) => (b.silent ? NONE : b.ph || '?')).join(SEP);
    r['自動_檢查'] = r._warn.length ? r._warn.join('；') : '✓';
    r._warn.forEach((m) => report.warnings.push(`${w}：${m}`));
    if (!S.yes(r['啟用'])) continue;
    const e = { word: w, zh: r['中文'], theme: themeId(r['主題']), emoji, ipa: r['音標'], syl: syl || '' };
    if (img) e.img = img;
    if (wordAudio) e.wordAudio = wordAudio;
    if (Object.keys(boxPh).length) e.boxPh = boxPh;
    if (Object.keys(boxAudio).length) e.boxAudio = boxAudio;
    if (Object.keys(sylAudio).length) e.sylAudio = sylAudio;
    out.push(e);
  }
  excRows.forEach((x) => { x['自動_檢查'] = x._warn.length ? x._warn.join('；') : '✓'; x._warn.forEach((m) => report.warnings.push(`例外表第 ${x._line} 列（${x['單字']}）：${m}`)); });

  // ---------- 聲音表 ----------
  LETTERS.forEach(([l, ph]) => { if (!usage.has(ph)) usage.set(ph, []); });
  let manifest = { items: {} };
  try { manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'audio/index.json'), 'utf8')); } catch (e) { /* 沒有 AI 音檔 */ }
  const byPh = new Map();
  soundRows.forEach((x) => { const ph = String(x['聲音'] || '').replace(/[\/\[\]\s]/g, ''); if (ph && !byPh.has(ph)) { x['聲音'] = ph; byPh.set(ph, x); } });
  for (const ph of usage.keys()) if (!byPh.has(ph)) byPh.set(ph, { '聲音': ph });
  const sounds = {};
  const soundList = [];
  const soundOut = [...byPh.values()].sort((x, y) => (usage.get(y['聲音']) || []).length - (usage.get(x['聲音']) || []).length);
  for (const x of soundOut) {
    const ph = x['聲音'];
    const warn = [];
    const words = usage.get(ph) || [];
    const letter = LETTERS.find((l) => l[1] === ph);
    const ls = LETTERS.filter((l) => l[1] === ph).map((l) => l[0]).join('、');
    if (!x['說明']) { const s = SOUNDS[keyOfPh(ph)]; x['說明'] = (s && s.zh) || (ls ? `字母 ${ls} 的聲音` : `/${ph}/`); }
    x['自動_共用檔名'] = shareName(ph);
    x['自動_例字'] = words.slice(0, 4).join('、') + (letter && !words.length ? `（字母 ${letter[0]}）` : '');
    x['自動_使用字數'] = String(words.length);
    let src;
    if (x['音檔']) {
      const c = customAudio(x['音檔']);
      if (c) { sounds[ph] = c.ref; src = '自訂：' + c.file; } else warn.push(`音檔「${x['音檔']}」在 custom/ 資料夾找不到`);
    }
    if (!src) src = manifest.items && manifest.items['p/' + P.phFile(ph)] ? 'AI 語音' : '瀏覽器語音（還沒有音檔）';
    x['自動_目前來源'] = src;
    soundList.push({ ph, desc: x['說明'], eg: x['自動_例字'], n: words.length, file: sounds[ph] ? x['音檔'] : '' });
    x['自動_檢查'] = warn.length ? warn.join('；') : '✓';
    warn.forEach((m) => report.warnings.push(`聲音表 /${ph}/：${m}`));
  }

  // ---------- 寫回 ----------
  S.writeTable('words', rows);
  S.writeTable('sounds', soundOut);
  S.writeTable('exceptions', excRows);
  fs.writeFileSync(convIndexPath, JSON.stringify(newIndex, null, 1) + '\n');
  const usedThemes = new Set(out.map((e) => e.theme));
  if (usedThemes.has('other')) themes.push({ id: 'other', zh: '其他', emoji: '📦' });
  const sheet = {
    themes: themes.filter((t) => usedThemes.has(t.id)),
    words: out,
    sounds,
    soundList,
    files: { audio: audioFiles.filter((n) => newIndex[n]).map((n) => [n, 'custom/' + newIndex[n].id]), images: imageFiles },
  };
  fs.writeFileSync(path.join(S.DATA, 'sheet.json'), JSON.stringify(sheet) + '\n');
  report.notes.unshift(`共 ${out.length} 個字上線（單字表 ${rows.length} 列）、${Object.keys(sounds).length} 個聲音使用自訂音檔、custom/ 有 ${audioFiles.length} 個音檔與 ${imageFiles.length} 張圖片`);
  finish(false);
})().catch((e) => { report.errors.push('同步失敗：' + e.message); finish(true); });

function finish(fatal) {
  const lines = [];
  if (report.errors.length) lines.push('### ❌ 需要處理', ...report.errors.map((m) => '- ' + m), '');
  if (report.warnings.length) lines.push('### ⚠️ 請檢查（表單的「自動_檢查」欄也有寫）', ...report.warnings.slice(0, 60).map((m) => '- ' + m), report.warnings.length > 60 ? `- …還有 ${report.warnings.length - 60} 項` : '', '');
  if (report.notes.length) lines.push('### ✅ 已完成', ...report.notes.slice(0, 40).map((m) => '- ' + m), '');
  const text = lines.filter((l, i) => l !== '' || lines[i - 1] !== '').join('\n');
  console.log(text);
  if (process.env.SYNC_REPORT) fs.appendFileSync(process.env.SYNC_REPORT, text + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '## 單字表單同步結果\n' + text + '\n');
  process.exit(fatal ? 1 : 0);
}
