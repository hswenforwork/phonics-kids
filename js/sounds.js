/*
 * 音素代表字表
 * 瀏覽器語音念單一字母音常會念成字母名稱，所以點字母時改念「代表字」，
 * 並顯示「這個音就像 apple 開頭的 a」之類的提示。
 * 欄位：ipa 音標、kw 代表字、emoji、pos 這個音在代表字的位置（start 開頭／mid 中間／end 結尾）
 */
(function (root) {
  const SOUNDS = {
    // 短母音
    short_a: { ipa: 'æ', kw: 'apple', emoji: '🍎', pos: 'start', zh: '短母音 a' },
    short_e: { ipa: 'ɛ', kw: 'egg', emoji: '🥚', pos: 'start', zh: '短母音 e' },
    short_i: { ipa: 'ɪ', kw: 'insect', emoji: '🐛', pos: 'start', zh: '短母音 i' },
    short_o: { ipa: 'ɑ', kw: 'octopus', emoji: '🐙', pos: 'start', zh: '短母音 o' },
    short_u: { ipa: 'ʌ', kw: 'umbrella', emoji: '☂️', pos: 'start', zh: '短母音 u' },
    // 長母音（念字母自己的名字）
    long_a: { ipa: 'eɪ', kw: 'cake', emoji: '🍰', pos: 'mid', zh: '長母音 a（念自己的名字）' },
    long_e: { ipa: 'i', kw: 'bee', emoji: '🐝', pos: 'end', zh: '長母音 e（念自己的名字）' },
    long_i: { ipa: 'aɪ', kw: 'ice', emoji: '🧊', pos: 'start', zh: '長母音 i（念自己的名字）' },
    long_o: { ipa: 'oʊ', kw: 'boat', emoji: '⛵', pos: 'mid', zh: '長母音 o（念自己的名字）' },
    long_u: { ipa: 'ju', kw: 'unicorn', emoji: '🦄', pos: 'start', zh: '長母音 u（念自己的名字）' },
    // 其他母音
    oo_long: { ipa: 'u', kw: 'moon', emoji: '🌙', pos: 'mid', zh: '長 oo 音' },
    oo_short: { ipa: 'ʊ', kw: 'book', emoji: '📖', pos: 'mid', zh: '短 oo 音' },
    aw: { ipa: 'ɔ', kw: 'paw', emoji: '🐾', pos: 'end', zh: 'aw 音' },
    ow: { ipa: 'aʊ', kw: 'cow', emoji: '🐮', pos: 'end', zh: 'ow 音（像被捏到喊「喔」）' },
    oy: { ipa: 'ɔɪ', kw: 'boy', emoji: '👦', pos: 'end', zh: 'oy 音' },
    schwa: { ipa: 'ə', kw: 'banana', emoji: '🍌', pos: 'start', zh: '輕聲「呃」（弱讀音）' },
    // 霸道 R
    ar: { ipa: 'ɑr', kw: 'car', emoji: '🚗', pos: 'end', zh: '霸道 R：ar' },
    er: { ipa: 'ɚ', kw: 'bird', emoji: '🐦', pos: 'mid', zh: '霸道 R：er／ir／ur' },
    or: { ipa: 'ɔr', kw: 'fork', emoji: '🍴', pos: 'mid', zh: '霸道 R：or' },
    air: { ipa: 'ɛr', kw: 'hair', emoji: '💇', pos: 'end', zh: 'air 音' },
    ear: { ipa: 'ɪr', kw: 'ear', emoji: '👂', pos: 'start', zh: 'ear 音' },
    le: { ipa: 'əl', kw: 'turtle', emoji: '🐢', pos: 'end', zh: '字尾 le（輕輕的「歐」）' },
    // 子音
    b: { ipa: 'b', kw: 'ball', emoji: '⚽', pos: 'start' },
    k: { ipa: 'k', kw: 'kite', emoji: '🪁', pos: 'start' },
    d: { ipa: 'd', kw: 'dog', emoji: '🐶', pos: 'start' },
    f: { ipa: 'f', kw: 'fish', emoji: '🐟', pos: 'start' },
    g: { ipa: 'ɡ', kw: 'goat', emoji: '🐐', pos: 'start' },
    h: { ipa: 'h', kw: 'hat', emoji: '👒', pos: 'start' },
    j: { ipa: 'dʒ', kw: 'jam', emoji: '🍓', pos: 'start' },
    l: { ipa: 'l', kw: 'lion', emoji: '🦁', pos: 'start' },
    m: { ipa: 'm', kw: 'moon', emoji: '🌙', pos: 'start' },
    n: { ipa: 'n', kw: 'nose', emoji: '👃', pos: 'start' },
    p: { ipa: 'p', kw: 'pig', emoji: '🐷', pos: 'start' },
    r: { ipa: 'r', kw: 'red', emoji: '🟥', pos: 'start' },
    s: { ipa: 's', kw: 'sun', emoji: '☀️', pos: 'start' },
    t: { ipa: 't', kw: 'top', emoji: '🔝', pos: 'start' },
    v: { ipa: 'v', kw: 'van', emoji: '🚐', pos: 'start' },
    w: { ipa: 'w', kw: 'web', emoji: '🕸️', pos: 'start' },
    y: { ipa: 'j', kw: 'yo-yo', emoji: '🪀', pos: 'start' },
    z: { ipa: 'z', kw: 'zebra', emoji: '🦓', pos: 'start' },
    ks: { ipa: 'ks', kw: 'box', emoji: '📦', pos: 'end' },
    kw: { ipa: 'kw', kw: 'queen', emoji: '👑', pos: 'start' },
    sh: { ipa: 'ʃ', kw: 'ship', emoji: '🚢', pos: 'start' },
    ch: { ipa: 'tʃ', kw: 'chick', emoji: '🐤', pos: 'start' },
    th: { ipa: 'θ', kw: 'thumb', emoji: '👍', pos: 'start' },
    th_v: { ipa: 'ð', kw: 'this', emoji: '👉', pos: 'start' },
    ng: { ipa: 'ŋ', kw: 'ring', emoji: '💍', pos: 'end' },
    nk: { ipa: 'ŋk', kw: 'pink', emoji: '🌸', pos: 'end' },
    silent: { ipa: '', kw: '', emoji: '🤫', pos: '', zh: '不發音（安靜字母）' },
  };

  const api = { SOUNDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PK_SOUNDS = api;
})(this);
