// 處理 GitHub 申請單：add（加入單字）、move（換主題）、fix（回報錯誤）
// 申請單內容從環境變數 ISSUE_BODY 讀取（不會被當成指令執行）
// 結果寫到 RESULT_FILE，供流程回覆在申請單上
const fs = require('fs');
const { P, readCustom, writeCustom, allEntries, known, THEME_IDS } = require('./common.cjs');

const body = process.env.ISSUE_BODY || '';
const resultFile = process.env.RESULT_FILE || 'result.md';
const fields = {};
body.split(/\r?\n/).forEach((line) => {
  const m = line.match(/^\s*([a-z-]+)\s*:\s*(.*?)\s*$/i);
  if (m && !(m[1].toLowerCase() in fields)) fields[m[1].toLowerCase()] = m[2];
});
const done = (ok, msg) => { fs.writeFileSync(resultFile, msg + '\n'); console.log(msg); process.exit(ok ? 0 : 1); };

const action = (fields['pk-action'] || '').toLowerCase();
const word = (fields.word || '').toLowerCase();
if (!/^[a-z]{1,24}$/.test(word)) done(false, '❌ 單字格式不正確（只能是 1～24 個英文字母）。');

const IPA_OK = /^[\/a-zA-Zæɑɒɔəɛɜɪʊʌθðʃʒŋɡːˈˌ.ɐɚɝɹɾʔɫʤʧ̩ ]{1,48}$/;
const cleanZh = (s) => String(s || '').replace(/[<>&"`$\\]/g, '').trim().slice(0, 20);

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
async function dict(w) {
  try {
    const r = await withTimeout(fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + w), 10000);
    if (!r.ok) return '';
    const data = await r.json();
    const ph = data.flatMap((d) => d.phonetics || []);
    const uk = ph.find((p) => /-uk\.mp3/.test(p.audio || '') && p.text);
    return ((uk || ph.find((p) => p.text) || {}).text || data[0].phonetic || '').trim();
  } catch (e) { return ''; }
}
async function zh(w) {
  try {
    const r = await withTimeout(fetch('https://api.mymemory.translated.net/get?langpair=en|zh-TW&q=' + w), 10000);
    const t = (((await r.json()).responseData || {}).translatedText || '').trim();
    return !t || t.toLowerCase() === w || /MYMEMORY|INVALID/i.test(t) ? '' : cleanZh(t.replace(/[。.]$/, ''));
  } catch (e) { return ''; }
}

(async () => {
  const custom = readCustom();
  custom.words = custom.words || []; custom.fixes = custom.fixes || {};
  const entries = allEntries();
  const existing = entries.find((e) => e.word === word);

  if (action === 'add') {
    if (existing) done(true, `ℹ️ **${word}** 已經在單字庫裡了，不用再加。`);
    let ipa = (await dict(word)).replace(/əʊ/g, 'oʊ'); // 長音 o 統一標成 /oʊ/
    if (ipa && !IPA_OK.test(ipa)) ipa = '';
    const r = P.analyze(word, { ipa, known: known() });
    const syl = r.syllables.join('-');
    const meaning = await zh(word);
    custom.words.push({ word, zh: meaning, emoji: '🌟', ipa, syl, theme: 'mine' });
    writeCustom(custom);
    done(true, `✅ 已把 **${word}** 加入「我的單字」\n- 音標：${ipa || '（查不到，依拼字規則推測）'}\n- 音節：${syl}\n- 中文：${meaning || '（查不到，可用「回報錯誤」補上）'}\n\n內容有錯的話，在網站家長模式按「🛠 回報錯誤」修正。`);
  }

  if (!existing) done(false, `❌ 單字庫裡找不到 **${word}**，請先用「加入單字庫」。`);

  if (action === 'move') {
    const theme = (fields.theme || '').toLowerCase();
    if (!THEME_IDS.includes(theme)) done(false, `❌ 主題 ${theme} 不存在。`);
    const c = custom.words.find((x) => x.word === word);
    if (!c) done(false, '❌ 只有「我的單字」裡加入的字可以換主題。');
    c.theme = theme;
    writeCustom(custom);
    done(true, `✅ 已把 **${word}** 移到主題「${theme}」。`);
  }

  if (action === 'fix') {
    const fix = {};
    const changes = [];
    const ipa = fields.ipa || '';
    if (ipa && ipa !== existing.ipa) {
      if (!IPA_OK.test(ipa)) done(false, '❌ 音標裡有無法辨識的符號。');
      fix.ipa = ipa; changes.push(`音標 → ${ipa}`);
    }
    const syl = (fields.syllables || '').toLowerCase().replace(/\s/g, '');
    if (syl && syl !== existing.syl && syl !== (existing.syl || word)) {
      if (!/^[a-z-]+$/.test(syl) || syl.replace(/-/g, '') !== word) done(false, '❌ 音節拼起來要等於原單字，例如 ba-na-na。');
      fix.syl = syl; changes.push(`音節 → ${syl}`);
    }
    const z = cleanZh(fields.zh);
    if (z && z !== existing.zh) { fix.zh = z; changes.push(`中文 → ${z}`); }
    if (!changes.length) done(true, 'ℹ️ 沒有偵測到修改，單字庫維持原樣。');
    const c = custom.words.find((x) => x.word === word);
    if (c) Object.assign(c, fix); else custom.fixes[word] = Object.assign(custom.fixes[word] || {}, fix);
    writeCustom(custom);
    done(true, `✅ 已修正 **${word}**：\n- ${changes.join('\n- ')}`);
  }

  done(false, '❌ 看不懂這張申請單（pk-action 要是 add、move 或 fix）。');
})();
