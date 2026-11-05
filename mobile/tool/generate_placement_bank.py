#!/usr/bin/env python3
"""A szintfelmérő itemkészletének előállítása a szókincs JSON fájljaiból.

Kimenet: lib/domain/placement_bank.dart (generált, kézzel ne szerkeszd).

Futtatás a mobile/ könyvtárból:
    python3 tool/generate_placement_bank.py

Válogatási szabályok (szintenként ITEMS_PER_LEVEL szó):
  - csak főnév, ige, melléknév, határozószó (kifejezés, elöljáró stb. nem);
  - a lemma csak egyszer szerepel a szókincsben (a „See” A2-ben és B1-ben
    is van, a „sich vorstellen” B1-en kétszer, más jelentéssel – az ilyen
    többértelmű szó kimarad);
  - nem nemzetközi szó: a magyar fordítás (kiejtés szerint közelítve) nem
    egyezik és nem kezdődik ugyanazzal a 4 betűvel, mint a német alak
    (Kollege – kolléga, Satire – szatíra), és nincs az INTERNATIONAL
    listán (Handy, Hotel …), mert az ilyen szót szintjétől függetlenül
    bárki kitalálja;
  - szófajonként legalább 4 szó legyen a szinten (a tévesztők
    ugyanabból a szófajból jönnek), ezért a szófajok arányosan oszlanak meg;
  - rögzített véletlenmag: a kimenet determinisztikus.
"""
import json
import random
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VOCAB = ROOT / 'backend' / 'prisma' / 'data' / 'vocabulary' / 'de'
OUT = ROOT / 'mobile' / 'lib' / 'domain' / 'placement_bank.dart'
LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1']
ITEMS_PER_LEVEL = 16
POS_QUOTA = {'noun': 7, 'verb': 5, 'adjective': 4}
ARTICLE = {'masculine': 'der', 'feminine': 'die', 'neuter': 'das'}
POS_WIRE = {'noun': 'NOUN', 'verb': 'VERB', 'adjective': 'ADJECTIVE'}
SEED = 20261105


def fold(s: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFD', s.lower()) if not unicodedata.combining(c))


def translation(t) -> str:
    return t if isinstance(t, str) else t['text']


def display(w) -> str:
    if w['pos'] == 'noun':
        art = ARTICLE.get((w.get('noun') or {}).get('gender'))
        return f"{art} {w['lemma']}" if art else w['lemma']
    if w['pos'] == 'verb' and (w.get('verb') or {}).get('reflexive'):
        return f"sich {w['lemma']}"
    return w['lemma']


# Nemzetközi szavak, amelyeket a betűalapú szűrő nem fog meg (a magyarban is
# ismertek, így nem mérik a német szókincset).
INTERNATIONAL = {
    'Handy', 'Hotel', 'Restaurant', 'Symptom', 'Publikum', 'Zäsur', 'zivil', 'Radio', 'Computer', 'Internet',
    'interessant', 'Säkularisierung', 'expandieren', 'Sofa', 'ambulant', 'promovieren',
}


def phonetic(s: str) -> str:
    """Durva kiejtés szerinti alak: a magyar és német helyesírás közös nevezője."""
    s = fold(s)
    for a, b in (('sz', 's'), ('ph', 'f'), ('th', 't'), ('ck', 'k'), ('c', 'k'), ('z', 'c'), ('y', 'i'), ('w', 'v')):
        s = s.replace(a, b)
    return s


def is_cognate(lemma: str, hu: str) -> bool:
    if lemma in INTERNATIONAL:
        return True
    a, b = phonetic(lemma), phonetic(hu)
    return a == b or a[:4] == b[:4] or b.startswith(a) or a.startswith(b)


def main() -> None:
    data = {lvl: json.loads((VOCAB / f'{lvl.lower()}.json').read_text('utf-8'))['words'] for lvl in LEVELS}
    lemma_levels = Counter()
    for words in data.values():
        for w in words:
            for key in {w['lemma'], display(w)}:
                lemma_levels[key] += 1

    rng = random.Random(SEED)
    bank = {}
    for lvl in LEVELS:
        by_pos = defaultdict(list)
        for w in data[lvl]:
            if w.get('is_active', True) is False or w['pos'] not in POS_QUOTA:
                continue
            if lemma_levels[w['lemma']] > 1 or lemma_levels[display(w)] > 1 or not w.get('translations'):
                continue
            hu = translation(w['translations'][0])
            if is_cognate(w['lemma'], hu) or len(hu) > 28:
                continue
            by_pos[w['pos']].append((display(w), POS_WIRE[w['pos']], hu))
        items = []
        for pos, quota in POS_QUOTA.items():
            pool = sorted(set(by_pos[pos]))
            if len(pool) < quota:
                raise SystemExit(f'{lvl}: kevés {pos} ({len(pool)} < {quota})')
            chosen = rng.sample(pool, quota)
            # Azonos fordítás ugyanazon a szinten nem lehet (tévesztőként összeakadna).
            if len({c[2] for c in chosen}) < quota:
                chosen = list({c[2]: c for c in pool}.values())[:quota]
            items.extend(chosen)
        assert len(items) == ITEMS_PER_LEVEL, (lvl, len(items))
        bank[lvl] = items

    def esc(s: str) -> str:
        return s.replace('\\', '\\\\').replace("'", "\\'").replace('$', '\\$')

    lines = [
        '// GENERÁLT FÁJL – ne szerkeszd kézzel.',
        '// Forrás: backend/prisma/data/vocabulary/de/*.json',
        '// Előállítás: python3 tool/generate_placement_bank.py (a mobile/ könyvtárból)',
        '',
        "import 'placement_test.dart';",
        '',
        '/// A szintfelmérő itemkészlete szintenként (a szókincsből válogatva, lásd a generátort).',
        'const placementBank = <String, List<PlacementItem>>{',
    ]
    for lvl in LEVELS:
        lines.append(f"  '{lvl}': [")
        for de, pos, hu in bank[lvl]:
            lines.append(f"    PlacementItem(level: '{lvl}', german: '{esc(de)}', partOfSpeech: '{pos}', meaning: '{esc(hu)}'),")
        lines.append('  ],')
    lines.append('};')
    OUT.write_text('\n'.join(lines) + '\n', 'utf-8')
    print(f'{OUT.relative_to(ROOT)}: {sum(len(v) for v in bank.values())} item')


if __name__ == '__main__':
    main()
