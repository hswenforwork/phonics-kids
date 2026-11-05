// 查英式音標（Free Dictionary API）與中文意思（MyMemory）；查不到回傳空字串
const IPA_OK = /^[\/a-zA-Zæɑɒɔəɛɜɪʊʌθðʃʒŋɡːˈˌ.ɐɚɝɹɾʔɫʤʧ̩ ]{1,48}$/;
const cleanZh = (s) => String(s || '').replace(/[<>&"`$\\]/g, '').trim().slice(0, 20);
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

async function dictIPA(w) {
  try {
    const r = await withTimeout(fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(w)), 10000);
    if (!r.ok) return '';
    const data = await r.json();
    const ph = data.flatMap((d) => d.phonetics || []);
    const uk = ph.find((p) => /-uk\.mp3/.test(p.audio || '') && p.text);
    let ipa = ((uk || ph.find((p) => p.text) || {}).text || data[0].phonetic || '').trim();
    ipa = ipa.replace(/əʊ/g, 'oʊ'); // 長音 o 統一標成 /oʊ/
    if (ipa && !ipa.startsWith('/')) ipa = '/' + ipa.replace(/^\[|\]$/g, '') + '/';
    return IPA_OK.test(ipa) ? ipa : '';
  } catch (e) { return ''; }
}
async function zhOf(w) {
  try {
    const r = await withTimeout(fetch('https://api.mymemory.translated.net/get?langpair=en|zh-TW&q=' + encodeURIComponent(w)), 10000);
    const t = (((await r.json()).responseData || {}).translatedText || '').trim();
    return !t || t.toLowerCase() === w || /MYMEMORY|INVALID|QUERY LENGTH/i.test(t) ? '' : cleanZh(t.replace(/[。.]$/, ''));
  } catch (e) { return ''; }
}

module.exports = { IPA_OK, cleanZh, dictIPA, zhOf };
