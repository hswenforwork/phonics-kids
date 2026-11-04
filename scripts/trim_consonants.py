#!/usr/bin/env python3
"""
把子音音檔後面的母音剪掉，只留下子音本身（b 只念「ㄅ」，不念「ㄅㄜ」）。

語音合成無法單獨念子音，所以先請它念「子音＋ə」，再用這支程式偵測母音開始的位置並剪掉：
  - 清子音（p t k f s ʃ θ h tʃ）：剪在「聲帶開始振動」的地方
  - 濁塞音（b d ɡ dʒ）：只留爆破的瞬間（約 50 毫秒）
  - 其他濁子音（m n ŋ l r w j v z ð ʒ）：剪在音量明顯變大（母音進來）的地方
可以拉長的音（s f ʃ θ m n l v z…）會放慢一點，讓孩子聽得清楚。

母音也用同樣的方法：單獨念一個母音時，語音合成常念不準（/ɒ/ 會念得像「ㄚ」），
所以先念「h＋母音」（像 hot 的開頭），再把前面的 h 剪掉，只留下母音。

用法：python3 scripts/trim_consonants.py IPA 輸入.mp3 輸出.mp3
      python3 scripts/trim_consonants.py --vowel IPA 輸入.mp3 輸出.mp3
"""
import subprocess
import sys

import numpy as np

SR = 24000
FRAME = int(SR * 0.01)  # 10 毫秒

VOICELESS = ('p', 't', 'k', 'f', 's', 'ʃ', 'θ', 'h', 'tʃ', 'ks', 'kw')
VOICED_STOPS = ('b', 'd', 'ɡ', 'g', 'dʒ')
SUSTAIN = ('s', 'ʃ', 'f', 'θ', 'h', 'm', 'n', 'ŋ', 'l', 'r', 'v', 'z', 'ð', 'ʒ', 'w', 'j')


def decode(path):
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', path, '-f', 's16le', '-ac', '1', '-ar', str(SR), '-'],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0


def encode(x, path, slow):
    pad = np.zeros(int(SR * 0.05), dtype=np.float32)
    y = np.concatenate([pad, x, pad])
    pcm = (np.clip(y, -1, 1) * 32767).astype(np.int16).tobytes()
    af = 'atempo=0.6,loudnorm=I=-18:TP=-2' if slow else 'loudnorm=I=-18:TP=-2'
    subprocess.run(['ffmpeg', '-v', 'quiet', '-y', '-f', 's16le', '-ar', str(SR), '-ac', '1', '-i', '-',
                    '-af', af, '-ar', '24000', '-b:a', '64k', path], input=pcm, check=True)


def frames(x):
    n = len(x) // FRAME
    return x[: n * FRAME].reshape(n, FRAME)


def periodicity(fr):
    """一個 10 毫秒片段的週期性（0～1），母音、濁音高，清子音的噪音低"""
    f = fr - fr.mean()
    e = float(np.dot(f, f))
    if e < 1e-8:
        return 0.0
    lo, hi = int(SR / 400), int(SR / 80)  # 基頻 80～400 Hz
    ac = np.correlate(f, f, 'full')[len(f) - 1:]
    if hi >= len(ac):
        hi = len(ac) - 1
    return float(ac[lo:hi].max() / e)


def find_cut(x, ipa):
    fr = frames(x)
    rms = np.sqrt((fr ** 2).mean(axis=1) + 1e-12)
    peak = rms.max()
    on = int(np.argmax(rms > peak * 0.015))  # 聲音開始（門檻放低，f、θ、h 這類小聲的子音才抓得到）
    per = np.array([periodicity(np.concatenate([fr[i], fr[i + 1]])) if i + 1 < len(fr) else 0 for i in range(len(fr))])

    if ipa.startswith(VOICELESS):
        # 從聲音開始往後找：連續 3 格「有週期性又夠大聲」= 母音開始
        for i in range(on + 2, len(fr) - 3):
            if all(per[i + k] > 0.55 and rms[i + k] > peak * 0.2 for k in range(3)):
                return on, max(i, on + 4)
        return on, min(on + 15, len(fr))
    if ipa.startswith(VOICED_STOPS):
        return on, min(on + 5, len(fr))
    # 濁的持續音：以開頭 40 毫秒的音量為基準，音量升到 1.7 倍代表母音進來
    base = rms[on:on + 4].mean()
    for i in range(on + 5, min(on + 30, len(fr))):
        if rms[i] > base * 1.7:
            return on, i
    return on, min(on + 14, len(fr))


def trim_vowel(src, dst):
    """剪掉前面的 h：從聲帶開始振動的地方開始保留，到聲音結束"""
    x = decode(src)
    fr = frames(x)
    rms = np.sqrt((fr ** 2).mean(axis=1) + 1e-12)
    peak = rms.max()
    per = np.array([periodicity(np.concatenate([fr[i], fr[i + 1]])) if i + 1 < len(fr) else 0 for i in range(len(fr))])
    on = 0
    for i in range(len(fr) - 3):
        if all(per[i + k] > 0.6 and rms[i + k] > peak * 0.25 for k in range(3)):
            on = i
            break
    end = len(fr) - 1
    while end > on and rms[end] < peak * 0.03:
        end -= 1
    seg = x[on * FRAME: (end + 1) * FRAME].copy()
    fi, fo = int(SR * 0.012), int(SR * 0.03)
    if len(seg) > fi + fo:
        seg[:fi] *= np.linspace(0, 1, fi)
        seg[-fo:] *= np.linspace(1, 0, fo)
    encode(seg, dst, False)
    return (end + 1 - on) * 10


def trim(ipa, src, dst):
    x = decode(src)
    on, cut = find_cut(x, ipa)
    seg = x[on * FRAME: cut * FRAME].copy()
    fade = min(len(seg) // 3, int(SR * 0.02))
    if fade > 0:
        seg[-fade:] *= np.linspace(1, 0, fade)
        seg[: fade // 2] *= np.linspace(0, 1, fade // 2) if fade // 2 else 1
    encode(seg, dst, ipa.startswith(SUSTAIN) and not ipa.startswith(VOICED_STOPS))
    return (cut - on) * 10


if __name__ == '__main__':
    if sys.argv[1] == '--vowel':
        ipa, src, dst = sys.argv[2], sys.argv[3], sys.argv[4]
        print(f'{ipa}（母音）: 保留 {trim_vowel(src, dst)} 毫秒')
    else:
        ipa, src, dst = sys.argv[1], sys.argv[2], sys.argv[3]
        print(f'{ipa}: 保留 {trim(ipa, src, dst)} 毫秒')
