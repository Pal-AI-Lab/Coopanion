"""Builds Coo's speech bank (web/speech/): one short, pitch-flat unit per toneless Mandarin syllable, and the
character table that maps Han characters to syllable and tone.

Each syllable is spoken alone by a TTS voice through a carrier character, cut to at most 20 ms of consonant before
the voicing and 160 ms of voicing, then set by Praat's PSOLA to one pitch (BANK_HZ, a 0.7-semitone fall over the
last quarter) and to a voiced length of UNIT_VOICED_S. Formants stay the speaker's; the page shifts the pitch by
playback rate only. The EQ follows Animal Crossing: New Horizons' Chinese dialogue as measured: the second and
third harmonics 11-13 and 16-20 dB under the fundamental, under 1.5% of the energy above 4 kHz.

Output: web/speech/zh.ogg (Opus, units back to back with PAD_S of silence between them), web/speech/zh.json
({hz, units: {syllable: [start s, length s]}}) and src/speech/data/zh.json ({"<syllable><tone>": "<characters>"},
the most common reading of every character in U+4E00-U+9FFF, tone 5 = neutral).

    python build.py --tts edge       # Edge's read-aloud service, no account: the bank shipped is built this way
    python build.py --tts azure      # Azure Speech: AZURE_SPEECH_KEY, AZURE_SPEECH_REGION

The voice is --voice, zh-CN-XiaoyiNeural by default.

Needs ffmpeg on PATH and: pip install praat-parselmouth pypinyin numpy scipy soundfile (edge: edge-tts).
Raw recordings are cached under .cache/ next to this file.
"""
import argparse, asyncio, hashlib, json, os, subprocess, sys, urllib.request
from xml.sax.saxutils import escape
import numpy as np
import parselmouth
from parselmouth.praat import call
from pypinyin import pinyin, Style
from scipy.signal import butter, sosfilt, lfilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', '..', 'web', 'speech'))
TABLE = os.path.normpath(os.path.join(HERE, '..', '..', 'src', 'speech', 'data', 'zh.json'))
CACHE = os.path.join(HERE, '.cache')
SR = 48000
BANK_HZ = 364            # the 中 pitch (400 Hz) plays it at 1.1x
UNIT_VOICED_S = .094     # 85 ms at 1.1x
CONS_MAX_S = .02
VOICED_MAX_S = .16
PAD_S = .06
# interjection readings (嗯 n, 呣 m, 噷 hm ...) are read as the nearest syllable of the language
INTERJECTIONS = {'m': 'en', 'n': 'en', 'ng': 'en', 'hm': 'en', 'hng': 'en', 'ê': 'e', 'r': 'er'}


def han_readings():
    """Every character in U+4E00-U+9FFF with its most common reading, as (char, syllable, tone)."""
    out = []
    for cp in range(0x4E00, 0xA000):
        ch = chr(cp)
        r = pinyin(ch, style=Style.TONE3, neutral_tone_with_five=True, errors='ignore')
        if not r or not r[0] or not r[0][0][-1:].isdigit(): continue
        s = r[0][0]
        syl = s[:-1].replace('ü', 'v')
        out.append((ch, INTERJECTIONS.get(syl, syl), int(s[-1])))
    return out


def carriers(readings):
    """One character per syllable that has a single reading: GB2312 level 1 first, then level 2, first tone first."""
    gb = {}
    for hi in range(0xB0, 0xF8):
        for lo in range(0xA1, 0xFF):
            try: gb[bytes([hi, lo]).decode('gb2312')] = 0 if hi < 0xD8 else 1
            except UnicodeDecodeError: pass
    best = {}
    for ch, syl, tone in readings:
        n = len(pinyin(ch, style=Style.NORMAL, heteronym=True)[0])
        rank = (n > 1, gb.get(ch, 2), tone != 1, tone)
        if syl not in best or rank < best[syl][0]: best[syl] = (rank, ch)
    return {s: ch for s, (_, ch) in sorted(best.items())}


def decode(data):
    p = subprocess.run(['ffmpeg', '-v', 'error', '-i', 'pipe:0', '-f', 'f32le', '-ac', '1', '-ar', str(SR), 'pipe:1'], input=data, capture_output=True, check=True)
    return np.frombuffer(p.stdout, np.float32).astype(np.float64)


async def record(text, args):
    os.makedirs(CACHE, exist_ok=True)
    key = os.path.join(CACHE, hashlib.md5(f'{args.tts}|{args.voice}|{text}'.encode()).hexdigest())
    if not os.path.exists(key):
        if args.tts == 'edge':
            import edge_tts
            buf = bytearray()
            async for c in edge_tts.Communicate(text, args.voice).stream():
                if c['type'] == 'audio': buf += c['data']
        else:
            ssml = f"<speak version='1.0' xml:lang='zh-CN'><voice name='{args.voice}'>{escape(text)}</voice></speak>"
            req = urllib.request.Request(
                f"https://{os.environ['AZURE_SPEECH_REGION']}.tts.speech.microsoft.com/cognitiveservices/v1", data=ssml.encode(),
                headers={'Ocp-Apim-Subscription-Key': os.environ['AZURE_SPEECH_KEY'], 'Content-Type': 'application/ssml+xml',
                         'X-Microsoft-OutputFormat': 'riff-48khz-16bit-mono-pcm', 'User-Agent': 'coopanion-speech-bank'})
            buf = urllib.request.urlopen(req, timeout=30).read()
        if len(buf) < 1000: raise RuntimeError(f'no audio for {text!r}')
        open(key, 'wb').write(buf)
    return decode(open(key, 'rb').read())


def cut(x):
    """<=20 ms of consonant before the voicing and <=160 ms of voicing."""
    snd = parselmouth.Sound(x, SR)
    p = snd.to_pitch_ac(time_step=.005, pitch_floor=120, pitch_ceiling=700)
    f0, ts = p.selected_array['frequency'], p.xs()
    v = np.nonzero(f0 > 0)[0]
    loud = np.nonzero(np.abs(x) > np.abs(x).max() * .03)[0]
    a = loud[0] / SR
    v0, v1 = (ts[v[0]], ts[v[-1]]) if len(v) else (a, loud[-1] / SR)
    s, e = max(a, v0 - CONS_MAX_S), min(v1, v0 + VOICED_MAX_S)
    return x[int(s * SR):int(e * SR)]


def peak(x, f0, gain_db, q):
    A = 10 ** (gain_db / 40); w = 2 * np.pi * f0 / SR; al = np.sin(w) / (2 * q); c = np.cos(w)
    b = np.array([1 + al * A, -2 * c, 1 - al * A]); a = np.array([1 + al / A, -2 * c, 1 - al / A])
    return lfilter(b / a[0], a / a[0], x)


LOWPASS = butter(4, 4500, 'low', fs=SR, output='sos')


def unit(seg):
    snd = parselmouth.Sound(seg, SR); d = snd.duration
    m = call(snd, 'To Manipulation', .005, 100, 800)
    pt = call('Create PitchTier', 'p', 0, d)
    call(pt, 'Add point', 0, BANK_HZ); call(pt, 'Add point', d * .75, BANK_HZ); call(pt, 'Add point', d, BANK_HZ * 2 ** (-.7 / 12))
    call([pt, m], 'Replace pitch tier')
    k = min(1., UNIT_VOICED_S / max(d - CONS_MAX_S, .02))
    dt = call('Create DurationTier', 'd', 0, d)
    for t, f in ((0, 1.), (CONS_MAX_S, 1.), (CONS_MAX_S + .005, k), (d, k)): call(dt, 'Add point', t, f)
    call([dt, m], 'Replace duration tier')
    y = call(m, 'Get resynthesis (overlap-add)').values[0]
    nc = int(CONS_MAX_S * SR)
    y[:nc] *= 10 ** (-5 / 20)
    y = peak(peak(sosfilt(LOWPASS, y), 1050, -6, .9), 1900, 4, 1.2)
    y = y / (np.sqrt(np.mean(y[nc:] ** 2)) + 1e-9) * .1
    fi, fo = int(.008 * SR), int(.035 * SR)
    y[:fi] *= np.linspace(0, 1, fi) ** 2; y[-fo:] *= np.cos(np.linspace(0, np.pi / 2, fo))
    return y


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--tts', choices=['edge', 'azure'], default='edge')
    ap.add_argument('--voice', default='zh-CN-XiaoyiNeural')
    args = ap.parse_args()
    readings = han_readings()
    table = {}
    for ch, syl, tone in readings: table[f'{syl}{tone}'] = table.get(f'{syl}{tone}', '') + ch
    which = carriers(readings)
    print(len(readings), 'characters,', len(which), 'syllables', file=sys.stderr)
    pad = np.zeros(int(PAD_S * SR)); parts, units, t = [pad], {}, PAD_S
    for i, (syl, ch) in enumerate(which.items()):
        u = unit(cut(await record(ch, args)))
        units[syl] = [round(t, 4), round(len(u) / SR, 4)]
        parts += [u, pad]; t += len(u) / SR + PAD_S
        if i % 50 == 0: print(i, syl, ch, file=sys.stderr)
    audio = np.concatenate(parts)
    audio = (audio / np.abs(audio).max() * .9).astype(np.float32)
    os.makedirs(OUT, exist_ok=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', 'pipe:0', '-c:a', 'libopus', '-b:a', '48k',
                    os.path.join(OUT, 'zh.ogg')], input=audio.tobytes(), check=True)
    json.dump({'hz': BANK_HZ, 'units': units}, open(os.path.join(OUT, 'zh.json'), 'w', encoding='utf-8'), separators=(',', ':'))
    json.dump(dict(sorted(table.items())), open(TABLE, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'{len(units)} units, {t:.1f} s of audio', file=sys.stderr)


asyncio.run(main())
