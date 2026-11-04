/*
 * 規則地圖（家長模式）：依 references/rules.md 附錄 B 的心智圖分成五大類
 * group：對應「規則小教室」的分組，可以直接帶孩子去練習
 * more：rules.md 裡比較抽象的例字，只在這裡當說明，不做成孩子的圖卡
 */
(function (root) {
  const RULE_MAP = [
    { id: 'basic', zh: '1. 字母與基本聲音', icon: '🔤', items: [
      { title: '21 個子音', desc: '大部分子音一個字母一個音，例如 b /b/、m /m/、s /s/。q 幾乎都跟 u 一起出現，qu 念 /kw/。', words: ['bed', 'map', 'sun'], more: ['queen', 'quick'] },
      { title: '5 個短母音', desc: 'a /æ/、e /e/、i /ɪ/、o /ɒ/、u /ʌ/。單音節、母音後面有子音（閉音節）時念短音。', group: 'short', words: ['map', 'web', 'pin', 'hot', 'sun'] },
    ]},
    { id: 'combo', zh: '2. 組合音', icon: '🧩', items: [
      { title: '輔音連綴（發 2 個音）', desc: 'bl、fr、st 這類組合，每個字母都要發音，快速滑過連在一起念。字卡上用 〰 連起來。', group: 'blend', words: ['crab', 'clock', 'star', 'splash'], more: ['spring', 'street', 'scream'] },
      { title: '二合輔音（發 1 個音）', desc: 'sh /ʃ/、ch /tʃ/、th /θ/ 或 /ð/、ph /f/、wh /w/、ck /k/、ng /ŋ/：兩個字母合起來只念一個全新的音。', group: 'digraph', words: ['ship', 'chip', 'whale', 'phone', 'ring'] },
      { title: '母音組合', desc: 'ai／ay /eɪ/、ee／ea /iː/、oa／ow /oʊ/、ou／ow /aʊ/、oi／oy /ɔɪ/、oo /uː/ 或 /ʊ/、au／aw /ɔː/、ew /uː/ 或 /juː/、ey /iː/ 或 /eɪ/。', group: 'team', words: ['rain', 'boat', 'moon', 'coin', 'cow', 'saw', 'key'], more: ['bread（ea 念短音 /e/）', 'book（oo 念短音 /ʊ/）'] },
      { title: '霸道 R', desc: 'r 會改變前面母音的聲音：ar /ɑː/、er／ir／ur /ɜː/、or /ɔː/。英式念法不捲舌。', group: 'bossy', words: ['farm', 'shark', 'girl', 'fork'], more: ['her', 'fern', 'burn'] },
    ]},
    { id: 'split', zh: '3. 音節切分（動物法則）', icon: '🐾', items: [
      { title: '🐰 兔子法則 VC|CV', desc: '兩個母音中間有 2 個以上子音，從中間切開。雙寫字母在第一個後面切。', group: 'animal', words: ['rabbit', 'napkin', 'puzzle'] },
      { title: '🐯 老虎法則 V|CV', desc: '中間只有 1 個子音，前面的母音念長音（開音節），在子音前面切。', group: 'animal', words: ['tiger', 'paper', 'music'] },
      { title: '🐫 駱駝法則 VC|V', desc: '中間只有 1 個子音，前面的母音念短音（閉音節），在子音後面切。', group: 'animal', words: ['robin', 'camel', 'seven'] },
      { title: '🦁 獅子法則 V|V', desc: '兩個母音字母相鄰，但不是母音組合，要分開念。', group: 'animal', words: ['lion', 'piano'], more: ['poem', 'diet'] },
      { title: '🐢 烏龜法則 -Cle', desc: '字尾是「子音＋le」，從字尾數三個字母，在子音前面切開。', group: 'animal', words: ['turtle', 'table', 'apple', 'puzzle'] },
    ]},
    { id: 'magic', zh: '4. 拼讀魔法與變形', icon: '✨', items: [
      { title: '魔法 e', desc: '母音＋子音＋e：字尾 e 不出聲，讓前面的母音念自己的名字（長音）。字卡上用 ✨ 魔法線連起來。', group: 'magic', words: ['cake', 'bone', 'cube', 'time'] },
      { title: 'Y 變色龍', desc: '字首念子音 /j/（yes）；單音節字尾念 /aɪ/（sky）；多音節字尾念 /i/（happy）；字中間念 /ɪ/（gym）。', group: 'y', words: ['yes', 'sky', 'happy', 'gym'], more: ['myth'] },
      { title: '弱母音 /ə/', desc: '不是重音的音節，母音常常弱化成輕輕的 /ə/。字卡上這種母音變小、變淡，標「輕」。', group: 'schwa', words: ['salad', 'camel', 'lemon', 'circus'] },
      { title: '溫柔的 c／g', desc: 'c 遇到 e、i、y 念 /s/；g 遇到 e、i、y 常念 /dʒ/（tiger、girl 是例外）。', group: 'soft', words: ['city', 'dice', 'gem', 'giraffe'], more: ['cell', 'cycle', 'gym'] },
      { title: '字尾拼寫變化', desc: '1-1-1 雙寫：hop → hopping。去 E：make → making。變 Y 為 I：happy → happiness（加 -ing 時不變：crying）。家長模式查字時會自動顯示拆解。', words: [], more: ['hopping', 'making', 'happiness', 'crying'] },
    ]},
    { id: 'trap', zh: '5. 特例與陷阱', icon: '🪤', items: [
      { title: '不發音字母', desc: 'kn 的 k、wr 的 w、mb 的 b、igh 的 gh、-lk 的 l：字母寫出來但不念。字卡上是灰色虛線。', group: 'silent', words: ['knife', 'write', 'lamb', 'night', 'walk'], more: ['gnome', 'psalm', 'listen', 'castle'] },
      { title: '假魔法 e', desc: '英文字不以 v 結尾，所以補上 e，母音仍念短音。', group: 'fake', words: ['have', 'give', 'love', 'glove'], more: ['come'] },
      { title: '閉音節長音', desc: 'i、o 在 -nd、-ld、-lt、-st 前，雖然是閉音節也念長音。', group: 'wild', words: ['wild', 'child', 'find', 'cold', 'old', 'ghost'] },
      { title: '不拆的字尾', desc: '-tion／-sion 念 /ʃən/、-ture 念 /tʃə/，整體不拆開。', group: 'suffix', words: ['picture', 'station', 'potion'], more: ['action', 'nature'] },
    ]},
  ];
  root.PK_RULEMAP = { RULE_MAP };
})(this);
