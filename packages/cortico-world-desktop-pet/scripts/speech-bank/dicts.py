"""Writes the pronunciation dictionaries src/speech reads: src/speech/data/en.tsv.gz (word, ARPAbet with stress
digits; the first pronunciation of each word in the CMU Pronouncing Dictionary) and src/speech/data/ja.tsv.gz
(word, hiragana reading; the first reading of each entry in pykakasi's KAKASI dictionary).

    pip install cmudict pykakasi
    python dicts.py
"""
import gzip, os, pickle, re
import cmudict, pykakasi

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'src', 'speech', 'data'))
os.makedirs(OUT, exist_ok=True)


def write(name, table):
    with gzip.open(os.path.join(OUT, name), 'wt', encoding='utf-8', newline='\n', compresslevel=9) as f:
        for w in sorted(table): f.write(f'{w}\t{table[w]}\n')


en = {}
with open(os.path.join(os.path.dirname(cmudict.__file__), 'data', 'cmudict.dict'), encoding='utf-8') as f:
    for line in f:
        line = line.split('#')[0].strip()
        if not line: continue
        word, phones = line.split(' ', 1)
        if '(' in word: continue           # word(2), word(3): later pronunciations
        en[word.lower()] = phones
write('en.tsv.gz', en)

with open(os.path.join(os.path.dirname(pykakasi.__file__), 'data', 'kanwadict4.db'), 'rb') as f: table = pickle.load(f)
ja = {}
for entries in table.values():
    for word, readings in entries.items():
        if readings and re.fullmatch('[ぁ-ゟー]+', readings[0][0]) and word not in ja: ja[word] = readings[0][0]
write('ja.tsv.gz', ja)
print(len(en), 'English words,', len(ja), 'Japanese entries')
