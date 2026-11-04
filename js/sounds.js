/*
 * 音素表（英式音標）
 * ipa：顯示用音標；
 * zh：提示文字；
 * tts：AI 音檔產生前，瀏覽器語音的近似念法（只是暫時替代，不夠精準）。
 * kw／emoji／pos 為舊版代表字資料，目前未使用。
 */
(function (root) {
  const SOUNDS = {
    // 短母音
    short_a: { tts: 'a', ipa: 'æ', kw: 'apple', emoji: '🍎', pos: 'start', zh: '短母音 a' },
    short_e: { tts: 'eh', ipa: 'e', kw: 'egg', emoji: '🥚', pos: 'start', zh: '短母音 e' },
    short_i: { tts: 'ih', ipa: 'ɪ', kw: 'insect', emoji: '🐛', pos: 'start', zh: '短母音 i' },
    short_o: { tts: 'o', ipa: 'ɒ', kw: 'octopus', emoji: '🐙', pos: 'start', zh: '短母音 o' },
    short_u: { tts: 'uh', ipa: 'ʌ', kw: 'umbrella', emoji: '☂️', pos: 'start', zh: '短母音 u' },
    // 長母音（念字母自己的名字）
    long_a: { tts: 'A', ipa: 'eɪ', kw: 'cake', emoji: '🍰', pos: 'mid', zh: '長母音 a（念自己的名字）' },
    long_e: { tts: 'E', ipa: 'iː', kw: 'bee', emoji: '🐝', pos: 'end', zh: '長母音 e（念自己的名字）' },
    long_i: { tts: 'I', ipa: 'aɪ', kw: 'ice', emoji: '🧊', pos: 'start', zh: '長母音 i（念自己的名字）' },
    long_o: { tts: 'O', ipa: 'oʊ', kw: 'boat', emoji: '⛵', pos: 'mid', zh: '長母音 o（念自己的名字）' },
    long_u: { tts: 'U', ipa: 'juː', kw: 'unicorn', emoji: '🦄', pos: 'start', zh: '長母音 u（念自己的名字）' },
    // 其他母音
    oo_long: { tts: 'oo', ipa: 'uː', kw: 'moon', emoji: '🌙', pos: 'mid', zh: '長 oo 音' },
    oo_short: { tts: 'uh', ipa: 'ʊ', kw: 'book', emoji: '📖', pos: 'mid', zh: '短 oo 音' },
    aw: { tts: 'or', ipa: 'ɔː', kw: 'paw', emoji: '🐾', pos: 'end', zh: 'aw 音' },
    ow: { tts: 'ow', ipa: 'aʊ', kw: 'cow', emoji: '🐮', pos: 'end', zh: 'ow 音（像被捏到喊「喔」）' },
    oy: { tts: 'oy', ipa: 'ɔɪ', kw: 'boy', emoji: '👦', pos: 'end', zh: 'oy 音' },
    schwa: { tts: 'uh', ipa: 'ə', kw: 'banana', emoji: '🍌', pos: 'start', zh: '輕聲「呃」（弱讀音）' },
    // 霸道 R
    ar: { tts: 'ah', ipa: 'ɑː', kw: 'car', emoji: '🚗', pos: 'end', zh: '霸道 R：ar' },
    er: { tts: 'er', ipa: 'ɜː', kw: 'bird', emoji: '🐦', pos: 'mid', zh: '霸道 R：er／ir／ur' },
    or: { tts: 'or', ipa: 'ɔː', kw: 'fork', emoji: '🍴', pos: 'mid', zh: '霸道 R：or' },
    air: { tts: 'air', ipa: 'eə', kw: 'hair', emoji: '💇', pos: 'end', zh: 'air 音' },
    ear: { tts: 'ear', ipa: 'ɪə', kw: 'ear', emoji: '👂', pos: 'start', zh: 'ear 音' },
    le: { tts: 'ull', ipa: 'əl', kw: 'turtle', emoji: '🐢', pos: 'end', zh: '字尾 le（輕輕的「歐」）' },
    // 子音
    b: { tts: 'buh', ipa: 'b', kw: 'ball', emoji: '⚽', pos: 'start' },
    k: { tts: 'kuh', ipa: 'k', kw: 'kite', emoji: '🪁', pos: 'start' },
    d: { tts: 'duh', ipa: 'd', kw: 'dog', emoji: '🐶', pos: 'start' },
    f: { tts: 'fuh', ipa: 'f', kw: 'fish', emoji: '🐟', pos: 'start' },
    g: { tts: 'guh', ipa: 'ɡ', kw: 'goat', emoji: '🐐', pos: 'start' },
    h: { tts: 'huh', ipa: 'h', kw: 'hat', emoji: '👒', pos: 'start' },
    j: { tts: 'juh', ipa: 'dʒ', kw: 'jam', emoji: '🍓', pos: 'start' },
    l: { tts: 'luh', ipa: 'l', kw: 'lion', emoji: '🦁', pos: 'start' },
    m: { tts: 'muh', ipa: 'm', kw: 'moon', emoji: '🌙', pos: 'start' },
    n: { tts: 'nuh', ipa: 'n', kw: 'nose', emoji: '👃', pos: 'start' },
    p: { tts: 'puh', ipa: 'p', kw: 'pig', emoji: '🐷', pos: 'start' },
    r: { tts: 'ruh', ipa: 'r', kw: 'red', emoji: '🟥', pos: 'start' },
    s: { tts: 'suh', ipa: 's', kw: 'sun', emoji: '☀️', pos: 'start' },
    t: { tts: 'tuh', ipa: 't', kw: 'top', emoji: '🔝', pos: 'start' },
    v: { tts: 'vuh', ipa: 'v', kw: 'van', emoji: '🚐', pos: 'start' },
    w: { tts: 'wuh', ipa: 'w', kw: 'web', emoji: '🕸️', pos: 'start' },
    y: { tts: 'yuh', ipa: 'j', kw: 'yo-yo', emoji: '🪀', pos: 'start' },
    z: { tts: 'zuh', ipa: 'z', kw: 'zebra', emoji: '🦓', pos: 'start' },
    ks: { tts: 'ox', ipa: 'ks', kw: 'box', emoji: '📦', pos: 'end' },
    kw: { tts: 'kwuh', ipa: 'kw', kw: 'queen', emoji: '👑', pos: 'start' },
    sh: { tts: 'shuh', ipa: 'ʃ', kw: 'ship', emoji: '🚢', pos: 'start' },
    ch: { tts: 'chuh', ipa: 'tʃ', kw: 'chick', emoji: '🐤', pos: 'start' },
    th: { tts: 'thuh', ipa: 'θ', kw: 'thumb', emoji: '👍', pos: 'start' },
    th_v: { tts: 'thuh', ipa: 'ð', kw: 'this', emoji: '👉', pos: 'start' },
    ng: { tts: 'ing', ipa: 'ŋ', kw: 'ring', emoji: '💍', pos: 'end' },
    nk: { tts: 'ink', ipa: 'ŋk', kw: 'pink', emoji: '🌸', pos: 'end' },
    silent: { ipa: '', kw: '', emoji: '🤫', pos: '', zh: '不發音（安靜字母）' },
  };

  const api = { SOUNDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PK_SOUNDS = api;
})(this);
