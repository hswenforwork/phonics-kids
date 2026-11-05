/*
 * 固定資料：主題清單（只當篩選標籤）、第 1 級字母、拆字用的常見原形字。
 * 單字本身改放在表單 data/words.csv（由 scripts/sync-sheet.cjs 產生網站用的 data/sheet.json）。
 */
(function (root) {
  const THEMES = [
    { id: 'animals', zh: '動物', emoji: '🐾' },
    { id: 'colors', zh: '顏色', emoji: '🎨' },
    { id: 'numbers', zh: '數字', emoji: '🔢' },
    { id: 'family', zh: '人物', emoji: '👨‍👩‍👧' },
    { id: 'school', zh: '學校', emoji: '🏫' },
    { id: 'toys', zh: '玩具', emoji: '🧸' },
    { id: 'body', zh: '身體', emoji: '🖐️' },
    { id: 'food', zh: '食物', emoji: '🍎' },
    { id: 'clothes', zh: '衣服', emoji: '👕' },
    { id: 'home', zh: '家裡', emoji: '🏠' },
    { id: 'nature', zh: '大自然', emoji: '🌳' },
    { id: 'things', zh: '東西', emoji: '🧰' },
    { id: 'actions', zh: '動作', emoji: '🏃' },
  ];

  // 第 1 級字母音：字母、念的音（IPA，只在背後用）、提示圖（只看，不念）
  const LETTERS = [
    ['a', 'æ', '🍎'],
    ['b', 'b', '🐻'],
    ['c', 'k', '🐱'],
    ['d', 'd', '🐶'],
    ['e', 'e', '🥚'],
    ['f', 'f', '🐟'],
    ['g', 'ɡ', '🐐'],
    ['h', 'h', '🎩'],
    ['i', 'ɪ', '🐛'],
    ['j', 'dʒ', '🫙'],
    ['k', 'k', '🪁'],
    ['l', 'l', '🦁'],
    ['m', 'm', '🌙'],
    ['n', 'n', '👃'],
    ['o', 'ɒ', '🐙'],
    ['p', 'p', '🐷'],
    ['q', 'kw', '👑'],
    ['r', 'r', '🐀'],
    ['s', 's', '☀️'],
    ['t', 't', '🐯'],
    ['u', 'ʌ', '☂️'],
    ['v', 'v', '🚐'],
    ['w', 'w', '🕸️'],
    ['x', 'ks', '📦'],
    ['y', 'j', '🪀'],
    ['z', 'z', '🦓'],
  ];

  // 複合詞／詞根判斷用的常見基礎字（不在圖卡中也可）
  const BASE_WORDS = ['cup', 'room', 'sun', 'flower', 'class', 'play', 'home', 'work', 'rain', 'bow',
    'snow', 'man', 'day', 'birth', 'tooth', 'brush', 'hair', 'cut', 'pan', 'cake', 'pop', 'corn',
    'teach', 'play', 'sing', 'jump', 'run', 'read', 'kind', 'help', 'care', 'farm', 'paint', 'clean',
    'happy', 'quick', 'slow', 'soft', 'loud', 'cook', 'fly', 'butter', 'fire', 'star', 'fish', 'bed',
    'foot', 'ball', 'gold', 'sea', 'horse', 'shell', 'ship', 'box', 'lunch', 'tea', 'pot', 'note', 'hand',
    'bag', 'back', 'pack', 'side', 'walk', 'out', 'in', 'up', 'down', 'light', 'house', 'dog', 'cat',
    // 字尾變化（雙寫、去 E、Y 變 I）常見的原形字
    'hop', 'stop', 'sit', 'swim', 'shop', 'clap', 'drop', 'skip', 'big', 'hot', 'sad', 'fun', 'win', 'get', 'put', 'cut', 'dig',
    'make', 'take', 'bake', 'ride', 'hope', 'smile', 'shine', 'dance', 'write', 'like', 'come', 'skate', 'wave', 'live', 'love', 'give', 'have',
    'happy', 'funny', 'cry', 'try', 'fly', 'baby', 'easy', 'lucky', 'tidy', 'busy', 'pretty', 'silly', 'carry', 'hurry', 'study'];

  const api = { THEMES, LETTERS, BASE_WORDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PK_DATA = api;
})(this);
