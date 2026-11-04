/*
 * 聲音播放：優先順序
 *   1. 預先產生的 AI 語音檔（audio/…mp3，Google 英式女聲，依 IPA 產生）
 *   2. 字典真人錄音（只限整字，庫外單字用）
 *   3. 瀏覽器內建英式語音（暫時替代，不夠精準）
 */
(function (root) {
  const { SOUNDS } = root.PK_SOUNDS;
  let manifest = { items: {} };
  let ready = fetch('audio/index.json', { cache: 'no-cache' }).then((r) => r.json()).then((m) => { manifest = m || { items: {} }; }).catch(() => {});

  // iOS 需要在手勢中「解鎖」音訊，所以重複使用同一個 Audio 元素
  const el = new Audio();
  el.preload = 'auto';
  let token = 0;

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
    await ready;
    if (it.path && has(it.path)) { if (await playUrl('audio/' + it.path + '.mp3', myToken)) return; }
    if (it.url) { if (await playUrl(it.url, myToken)) return; }
    if (it.text) await tts(it.text, it.rate, myToken);
  }
  async function play(items) {
    const myToken = ++token;
    if (root.speechSynthesis) speechSynthesis.cancel();
    el.pause();
    for (const it of [].concat(items)) { if (myToken !== token) break; await playOne(it, myToken); }
  }
  function stop() { token++; el.pause(); if (root.speechSynthesis) speechSynthesis.cancel(); }

  // 常用片段
  const word = (e, extra) => Object.assign({ path: 'w/' + e.word, url: e.audioUrl || '', text: e.word, rate: 0.8 }, extra);
  const syllable = (e, i, text, extra) => Object.assign({ path: 's/' + e.word + '-' + i, text, rate: 0.65 }, extra);
  const phoneme = (key, extra) => {
    const s = SOUNDS[key];
    if (!s || key === 'silent') return { pause: 10 };
    return Object.assign({ path: 'ph/' + key, text: s.tts || '', rate: 0.6 }, extra);
  };
  const isAI = (e) => has('w/' + e.word);

  root.PK_AUDIO = { play, stop, word, syllable, phoneme, isAI, ready: () => ready, has };
})(this);
