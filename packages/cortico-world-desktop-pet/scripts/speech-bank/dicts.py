"""Writes the pronunciation data src/speech reads, into src/speech/data/:

- en.tsv.gz: word, ARPAbet with stress digits; the first pronunciation of each word in the CMU Pronouncing Dictionary.
- ja-ipadic.tsv.gz: word, pronunciation in hiragana; every IPADIC entry with a kanji in it. Where one spelling has
  several entries, a common word's comes before a name's (Noun.name/org/place/proper), then the lower cost.
  IPADIC-COPYING is its license, converted to UTF-8.
- ja-unihan.tsv.gz: kanji, its on'yomi and kun'yomi in hiragana ("on,on|kun,kun"), from Unihan's kJapanese field.

    pip install cmudict
    python dicts.py <mecab-ipadic-2.7.0-20070801 folder> <Unihan.zip>

The IPADIC folder is the unpacked source release (its *.csv are EUC-JP); Unihan.zip is from
https://www.unicode.org/Public/UCD/latest/ucd/ (kJapanese needs Unicode 15.1 or later).
"""
import glob, gzip, io, os, re, sys, zipfile
import cmudict

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'src', 'speech', 'data'))
KANJI = re.compile('[㐀-䶿一-鿿々]')
PROPER = {'Noun.name.csv', 'Noun.org.csv', 'Noun.place.csv', 'Noun.proper.csv'}


def hira(s):
    return ''.join(chr(ord(c) - 0x60) if 0x30a1 <= ord(c) <= 0x30f6 else c for c in s)


def write(name, table):
    with gzip.open(os.path.join(OUT, name), 'wt', encoding='utf-8', newline='\n', compresslevel=9) as f:
        for w in sorted(table): f.write(f'{w}\t{table[w]}\n')


def english():
    en = {}
    with open(os.path.join(os.path.dirname(cmudict.__file__), 'data', 'cmudict.dict'), encoding='utf-8') as f:
        for line in f:
            line = line.split('#')[0].strip()
            if not line: continue
            word, phones = line.split(' ', 1)
            if '(' in word: continue           # word(2), word(3): later pronunciations
            en[word.lower()] = phones
    write('en.tsv.gz', en)
    return len(en)


def ipadic(folder):
    best = {}
    for f in sorted(glob.glob(os.path.join(folder, '*.csv'))):
        proper = os.path.basename(f) in PROPER
        for line in open(f, encoding='euc-jp', errors='replace'):
            c = line.rstrip('\n').split(',')
            if len(c) < 13 or not KANJI.search(c[0]): continue
            said = c[12] if c[12] != '*' else c[11]
            if not re.fullmatch('[ァ-ー]+', said): continue
            rank = (proper, int(c[3]))
            if c[0] not in best or rank < best[c[0]][0]: best[c[0]] = (rank, hira(said))
    write('ja-ipadic.tsv.gz', {w: r for w, (_, r) in best.items()})
    with open(os.path.join(folder, 'COPYING'), encoding='euc-jp', errors='replace') as f:
        open(os.path.join(OUT, 'IPADIC-COPYING'), 'w', encoding='utf-8', newline='\n').write(f.read())
    return len(best)


def unihan(zip_path):
    table = {}
    with zipfile.ZipFile(zip_path) as z, z.open('Unihan_Readings.txt') as f:
        for line in io.TextIOWrapper(f, encoding='utf-8'):
            if not line.startswith('U+'): continue
            cp, field, value = line.rstrip('\n').split('\t')
            if field != 'kJapanese': continue
            on = [hira(v) for v in value.split() if re.fullmatch('[ァ-ー]+', v)]
            kun = [v for v in value.split() if re.fullmatch('[ぁ-ゟー]+', v)]
            table[chr(int(cp[2:], 16))] = ','.join(on) + '|' + ','.join(kun)
    write('ja-unihan.tsv.gz', table)
    return len(table)


print(english(), 'English words,', ipadic(sys.argv[1]), 'IPADIC words,', unihan(sys.argv[2]), 'Unihan kanji')
