/*
 * 聲音播放：優先順序
 *   0. 表單指定的自訂音檔（custom/ 上傳，轉成 audio/custom/…mp3）
 *   1. 預先產生的 AI 語音檔（audio/…mp3，Google 英式女聲，依 IPA 產生）
 *   2. 字典真人錄音（只限整字，庫外單字用）
 *   3. 瀏覽器內建英式語音（暫時替代，不夠精準）
 */
(function (root) {
  const { SOUNDS } = root.PK_SOUNDS;
  let manifest = { items: {} };
  let loaded = false;
  let ready = fetch('audio/index.json', { cache: 'no-cache' }).then((r) => r.json()).then((m) => { manifest = m || { items: {} }; }).catch(() => {}).then(() => { loaded = true; });

  // iOS 需要在手勢中「解鎖」音訊，所以重複使用同一個 Audio 元素
  const el = new Audio();
  el.preload = 'auto';
  let token = 0;
  let lastSource = '';
  let onSource = null;
  const report = (src) => { lastSource = src; if (onSource) onSource(src); };

  // iOS Safari：第一次觸碰畫面時，在手勢當下播放一段極短的靜音，之後 AI 語音檔才能正常播放
  const SILENT = 'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYwLjE2LjEwMAAAAAAAAAAAAAAA//OEwAAAAAAAAAAAAEluZm8AAAAPAAAABQAAAqAAbW1tbW1tbW1tbW1tbW1tbW1tbZKSkpKSkpKSkpKSkpKSkpKSkpKStra2tra2tra2tra2tra2tra2trbb29vb29vb29vb29vb29vb29vb2///////////////////////////AAAAAExhdmM2MC4zMQAAAAAAAAAAAAAAACQEUAAAAAAAAAKgvT9A1gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//NExAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMu//NExFMAAANIAAAAADEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMu//NExKYAAANIAAAAADEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NExKwAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NExKwAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';
  let unlocked = false;
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    try {
      el.src = SILENT;
      const p = el.play();
      if (p && p.catch) p.catch(() => { unlocked = false; });
    } catch (e) { unlocked = false; }
    if (root.speechSynthesis) { try { speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch (e) { /* 忽略 */ } }
  }
  ['touchend', 'pointerdown', 'click', 'keydown'].forEach((ev) => root.addEventListener(ev, unlock, { capture: true, passive: true }));

  function has(path) { return !!(manifest.items && manifest.items[path]); }

  function playUrl(url, myToken) {
    return new Promise((res) => {
      if (myToken !== token) return res(false);
      let done = false;
      const fin = (ok) => { if (!done) { done = true; el.onended = el.onerror = null; res(ok); } };
      el.onended = () => fin(true);
      el.onerror = () => fin(false);
      el.src = url;
      const p = el.play();
      if (p && p.catch) p.catch(() => fin(false));
      setTimeout(() => fin(true), 6000);
    });
  }

  // ---------- 瀏覽器語音（英式） ----------
  let voice = null;
  function pickVoice() {
    const vs = (root.speechSynthesis && speechSynthesis.getVoices()) || [];
    const gb = vs.filter((v) => /^en[-_]GB/i.test(v.lang));
    const pref = ['Serena', 'Kate', 'Martha', 'Stephanie', 'Google UK English Female', 'Microsoft Sonia', 'Microsoft Libby', 'Microsoft Hazel'];
    voice = pref.map((n) => gb.find((v) => v.name.includes(n))).find(Boolean) || gb[0] || vs.find((v) => /^en/i.test(v.lang)) || null;
  }
  if (root.speechSynthesis) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function tts(text, rate, myToken) {
    return new Promise((res) => {
      if (!root.speechSynthesis || myToken !== token) return res(false);
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-GB'; if (voice) u.voice = voice;
      u.rate = rate || 0.8; u.pitch = 1.05;
      let done = false; const fin = () => { if (!done) { done = true; res(true); } };
      u.onend = u.onerror = fin;
      speechSynthesis.speak(u);
      setTimeout(fin, 4000);
    });
  }

  // 一個片段：{ path, url, text, rate, pause, onstart }
  async function playOne(it, myToken) {
    if (myToken !== token) return;
    if (it.pause) { await new Promise((r) => setTimeout(r, it.pause)); return; }
    if (it.onstart) it.onstart();
    if (!loaded) await ready; // 已載入時不等待，讓播放留在觸碰的當下（iOS 才允許）
    if (it.custom) { if (await playUrl('audio/' + it.custom + '.mp3', myToken)) return report('自訂音檔'); }
    if (it.path && has(it.path)) { if (await playUrl('audio/' + it.path + '.mp3', myToken)) return report('AI 語音檔'); }
    if (it.path2 && has(it.path2)) { if (await playUrl('audio/' + it.path2 + '.mp3', myToken)) return report('AI 語音檔（同類音）'); }
    if (it.url) { if (await playUrl(it.url, myToken)) return report('字典真人錄音'); }
    if (it.text) { await tts(it.text, it.rate, myToken); report('瀏覽器語音（較不精準）'); }
  }
  async function play(items) {
    const myToken = ++token;
    if (root.speechSynthesis) speechSynthesis.cancel();
    el.pause();
    for (const it of [].concat(items)) { if (myToken !== token) break; await playOne(it, myToken); }
  }
  function stop() { token++; el.pause(); if (root.speechSynthesis) speechSynthesis.cancel(); }

  // 常用片段
  let customSounds = {}; // 聲音表指定的自訂音檔：{ 音素: 'custom/…' }
  const word = (e, extra) => Object.assign({ custom: e.wordAudio || '', path: 'w/' + e.word, url: e.audioUrl || '', text: e.word, rate: 0.8 }, extra);
  const syllable = (e, i, text, extra) => Object.assign({ path: 's/' + e.word + '-' + i, text, rate: 0.65 }, extra);
  const phoneme = (key, extra) => {
    const s = SOUNDS[key];
    if (!s || key === 'silent') return { pause: 10 };
    return Object.assign({ path: 'ph/' + key, text: s.tts || '', rate: 0.6 }, extra);
  };
  // 依這個字實際的 IPA 音素播放；沒有對應音檔時退回同類音（ph/key），再退回瀏覽器語音
  const phonemeIPA = (ph, key, extra) => {
    if (!ph) return phoneme(key, extra);
    const s = SOUNDS[key] || {};
    return Object.assign({ custom: customSounds[ph] || '', path: 'p/' + root.PK_PHONICS.phFile(ph), path2: 'ph/' + key, text: s.tts || '', rate: 0.6 }, extra);
  };
  // 一個格子的聲音：單字表「音素音檔」指定的檔 → 聲音表 → AI
  const keyOfPh = (ph) => (Object.entries(SOUNDS).find(([, s]) => s.ipa === ph) || [''])[0];
  const box = (b, extra) => {
    if (!b || b.silent) return { pause: 200 };
    if (b.audio && b.audio.startsWith('ph:')) { const ph = b.audio.slice(3); return phonemeIPA(ph, keyOfPh(ph) || b.key, extra); }
    const it = phonemeIPA(b.ph, b.key, extra);
    if (b.audio) it.custom = b.audio;
    return it;
  };
  /** 這一格目前播哪個來源（家長模式顯示用） */
  const boxSource = (b) => {
    if (!b || b.silent) return '';
    if (b.audio && !b.audio.startsWith('ph:')) return '自訂（這個字）';
    const ph = b.audio ? b.audio.slice(3) : b.ph;
    if (customSounds[ph]) return '自訂（聲音表）';
    return has('p/' + root.PK_PHONICS.phFile(ph)) ? 'AI' : '瀏覽器語音';
  };
  const isAI = (e) => has('w/' + e.word);

  root.PK_AUDIO = { play, stop, word, syllable, phoneme, phonemeIPA, box, boxSource, setCustomSounds: (m) => { customSounds = m || {}; }, isAI, ready: () => ready, has, setOnSource: (f) => { onSource = f; }, last: () => lastSource };
})(this);
