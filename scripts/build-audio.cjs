// 用 Google Cloud Text-to-Speech 依 IPA 產生語音檔（整字、音節、單音）
// 需要環境變數 GOOGLE_TTS_API_KEY；可用 TTS_VOICE 指定聲音（預設 en-GB-Neural2-C 英式女聲）
// 只產生新的或內容有變的檔案，記錄在 audio/index.json
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ROOT, SOUNDS, P, allEntries, known } = require('./common.cjs');

const KEY = process.env.GOOGLE_TTS_API_KEY;
const VOICE = process.env.TTS_VOICE || 'en-GB-Neural2-C';
const INDEX = path.join(ROOT, 'audio/index.json');

if (!KEY) {
  console.log('沒有設定 GOOGLE_TTS_API_KEY，略過語音產生（網站會先用瀏覽器語音）。');
  process.exit(0);
}

const cleanIPA = (ipa) => String(ipa || '').replace(/[\/\[\]]/g, '').trim();
const escAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const ssml = (ipa, text) => `<speak><phoneme alphabet="ipa" ph="${escAttr(ipa)}">${escAttr(text)}</phoneme></speak>`;

function jobs() {
  const out = [];
  for (const e of allEntries()) {
    if (!e.ipa) continue;
    const ipa = cleanIPA(e.ipa);
    out.push({ id: 'w/' + e.word, ssml: ssml(ipa.replace(/\./g, ''), e.word), rate: 0.85 });
    const syl = (e.syl || e.word).split('-');
    const parts = ipa.split('.');
    if (parts.length === syl.length && syl.length > 1) {
      syl.forEach((s, i) => out.push({ id: `s/${e.word}-${i}`, ssml: ssml(parts[i].replace(/[ˈˌ]/g, ''), s), rate: 0.75 }));
    } else if (syl.length === 1) {
      out.push({ id: `s/${e.word}-0`, ssml: ssml(ipa.replace(/[.ˈˌ]/g, ''), e.word), rate: 0.75 });
    }
  }
  // 每個字實際出現的音素（依 IPA 音素表對應到字母），重複的只產生一次
  const kn = known();
  const phs = new Map();
  for (const e of allEntries()) {
    if (!e.ipa) continue;
    const r = P.analyze(e.word, { ipa: e.ipa, known: kn, libSyllables: e.syl || undefined });
    (r.units || []).forEach((u) => { if (u.ph && !phs.has(u.ph)) phs.set(u.ph, u.key); });
    P.elkonin(r).forEach((b) => { if (b.ph && !phs.has(b.ph)) phs.set(b.ph, b.key); });
  }
  for (const [ph, key] of phs) {
    out.push({ id: 'p/' + P.phFile(ph), ssml: ssml(P.phSay(ph), (SOUNDS[key] || {}).tts || 'uh'), rate: 0.8 });
  }
  for (const [key, s] of Object.entries(SOUNDS)) {
    if (!s.ipa || key === 'silent') continue;
    // 子音不能單獨發聲，語音服務會改念字母名稱（b 念成 bee），所以用 say 欄位（例如 /bə/）；
    // 文字也用近似念法（buh），即使音素標記失效也不會念成字母名稱
    out.push({ id: 'ph/' + key, ssml: ssml(s.say || s.ipa, s.tts || s.ipa), rate: 0.8 });
  }
  return out;
}

async function synth(job) {
  const r = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize?key=' + encodeURIComponent(KEY), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { ssml: job.ssml },
      voice: { languageCode: 'en-GB', name: VOICE },
      audioConfig: { audioEncoding: 'MP3', speakingRate: job.rate, sampleRateHertz: 24000 },
    }),
  });
  if (!r.ok) throw new Error(`${job.id}：${r.status} ${(await r.text()).slice(0, 200)}`);
  const { audioContent } = await r.json();
  return Buffer.from(audioContent, 'base64');
}

(async () => {
  const index = fs.existsSync(INDEX) ? JSON.parse(fs.readFileSync(INDEX, 'utf8')) : { items: {} };
  index.items = index.items || {};
  const list = jobs();
  let made = 0, failed = 0;
  for (const job of list) {
    const hash = crypto.createHash('sha1').update(VOICE + '|' + job.rate + '|' + job.ssml).digest('hex').slice(0, 12);
    const file = path.join(ROOT, 'audio', job.id + '.mp3');
    if (index.items[job.id] === hash && fs.existsSync(file)) continue;
    try {
      const buf = await synth(job);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, buf);
      index.items[job.id] = hash;
      made++;
      await new Promise((r) => setTimeout(r, 80));
    } catch (err) {
      failed++;
      console.error('✗', err.message);
      if (/40[13]/.test(err.message)) { console.error('金鑰無效或未啟用 Text-to-Speech API，停止。'); break; }
    }
  }
  // 移除已不存在的項目
  const ids = new Set(list.map((j) => j.id));
  for (const id of Object.keys(index.items)) if (!ids.has(id)) delete index.items[id];
  index.voice = VOICE;
  fs.writeFileSync(INDEX, JSON.stringify(index, null, 1) + '\n');
  console.log(`語音檔：新產生 ${made} 個，失敗 ${failed} 個，共 ${Object.keys(index.items).length} 個。`);
  if (failed && !made) process.exit(1);
})();
