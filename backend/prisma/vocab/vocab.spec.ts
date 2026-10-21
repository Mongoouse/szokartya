import { CefrLevel, GrammaticalGender, NumberType, PartOfSpeech, ReflexiveType } from '@prisma/client';
import { B2_SET } from './b2';
import { CORE_SET } from './core';
import { parseAdjectives, parseNouns, parseVerbs, regularComparison, umlaut } from './dsl';
import { selectSets } from './index';
import { SeedWord } from './types';

const opts = { level: CefrLevel.B2, baseCategory: 'b2-wortschatz', source: 'teszt' };

describe('szólista-értelmező', () => {
  it('főnév: névelő, umlautos többes szám, szabályos birtokos, vonzat', () => {
    const [w] = parseNouns('@politik\nder Antrag | ¨+e | | kérvény; kérelem {hivatalos} | auf+A = kérelem valamire', opts);
    expect(w).toMatchObject({
      lemma: 'Antrag',
      partOfSpeech: PartOfSpeech.NOUN,
      categories: ['b2-wortschatz', 'politik'],
      translations: [{ text: 'kérvény' }, { text: 'kérelem', senseNote: 'hivatalos' }],
      attributes: {
        kind: 'noun',
        data: { gender: GrammaticalGender.MASCULINE, pluralForm: 'Anträge', genitiveSingular: 'Antrags', isNDeclension: false },
      },
      valencies: [{ preposition: 'auf', governedCase: 'ACCUSATIVE', pattern: 'Antrag auf + Akk.', meaning: 'kérelem valamire' }],
    });
  });

  it('főnév: n-deklináció, csak egyes és csak többes szám', () => {
    const [kollege, armut, kosten] = parseNouns('der* Zeuge | +n | | tanú\ndie Armut | - | | szegénység\npl Kosten | | | költségek', opts);
    expect(kollege!.attributes!.data).toMatchObject({ pluralForm: 'Zeugen', genitiveSingular: 'Zeugen', isNDeclension: true });
    expect(armut!.attributes!.data).toMatchObject({ numberType: NumberType.SINGULAR_ONLY, pluralForm: null, genitiveSingular: 'Armut' });
    expect(kosten!.attributes!.data).toEqual({ numberType: NumberType.PLURAL_ONLY, pluralForm: 'Kosten' });
  });

  it('umlaut: utolsó a/o/u, au → äu', () => {
    expect(umlaut('Vorschlag')).toBe('Vorschläg');
    expect(umlaut('Lebenslauf')).toBe('Lebensläuf');
    expect(umlaut('Boden')).toBe('Böden');
    expect(umlaut('Teil')).toBeNull();
  });

  it('ige: elváló igekötő, visszaható „sich” beillesztése, két tárgy', () => {
    const [vor, bew] = parseVerbs(
      'sich(D) vorstellen | stellt vor | stellte vor | vorgestellt | h | r | elképzel | A = elképzel valamit\n' +
        'sich bewerben | bewirbt | bewarb | beworben | h | i | pályázik | um+A = pályázik valamire',
      opts,
    );
    expect(vor!.attributes!.data).toMatchObject({
      present3sg: 'stellt sich vor',
      isSeparable: true,
      separablePrefix: 'vor',
      reflexiveType: ReflexiveType.DATIVE,
    });
    expect(vor!.valencies![0]).toMatchObject({ preposition: null, isReflexive: true, pattern: 'sich vorstellen + Akk.' });
    expect(bew!.attributes!.data).toMatchObject({ present3sg: 'bewirbt sich', isSeparable: false, separablePrefix: null });
    expect(bew!.valencies![0]!.pattern).toBe('sich bewerben um + Akk.');

    const [vorwerfen] = parseVerbs('vorwerfen | wirft vor | warf vor | vorgeworfen | h | i | szemére vet | D+A = szemére vet valakinek valamit', opts);
    expect(vorwerfen!.valencies![0]).toMatchObject({ governedCase: 'DATIVE', pattern: 'vorwerfen + Dat. + Akk.', isReflexive: false });
  });

  it('melléknév: szabályos és megadott fokozás, csak állítmányi használat', () => {
    expect(regularComparison('dunkel')).toEqual({ comparative: 'dunkler', superlative: 'am dunkelsten' });
    expect(regularComparison('teuer')).toEqual({ comparative: 'teurer', superlative: 'am teuersten' });
    expect(regularComparison('bekannt')).toEqual({ comparative: 'bekannter', superlative: 'am bekanntesten' });
    expect(regularComparison('typisch')).toEqual({ comparative: 'typischer', superlative: 'am typischsten' });
    expect(regularComparison('spannend')).toEqual({ comparative: 'spannender', superlative: 'am spannendsten' });

    const [hoch, schuld] = parseAdjectives('hoch | höher, am höchsten | magas\nschuld | - präd | hibás | an+D = hibás valamiben', opts);
    expect(hoch!.attributes!.data).toMatchObject({ comparative: 'höher', isIrregularComparison: true, isPredicativeOnly: false });
    expect(schuld!.attributes!.data).toEqual({ comparative: null, superlative: null, isIrregularComparison: false, isPredicativeOnly: true });
  });

  it.each([
    ['ismeretlen névelő', () => parseNouns('dem Tisch | +e | | asztal', opts)],
    ['hiányzó többes szám', () => parseNouns('der Tisch | | | asztal', opts)],
    ['vonzat jelentés nélkül', () => parseNouns('die Angst | ¨+e | | félelem | vor+D', opts)],
    ['ismétlődő vonzat', () => parseNouns('die Angst | ¨+e | | félelem | vor+D = a; vor+D = b', opts)],
    ['igekötő nem a lemma eleje', () => parseVerbs('anrufen | ruft auf | rief auf | aufgerufen | h | i | felhív', opts)],
    ['sich a ragozott alakban', () => parseVerbs('sich freuen | freut sich | freute sich | gefreut | h | r | örül', opts)],
    ['ismeretlen segédige', () => parseVerbs('gehen | geht | ging | gegangen | x | i | megy', opts)],
  ])('hibás sor elutasítása: %s', (_name, run) => {
    expect(run).toThrow(/teszt:1:/);
  });
});

describe('B2 szókészlet', () => {
  const words = B2_SET.words;
  const of = (pos: PartOfSpeech): SeedWord[] => words.filter((w) => w.partOfSpeech === pos);

  it('legalább 800, célként ~1000+ rekord', () => {
    expect(words.length).toBeGreaterThanOrEqual(1000);
  });

  it('minden szó B2 szintű, a gyűjtő- és egy tematikus kategóriában', () => {
    const slugs = new Set(selectSets(undefined).categories.map((c) => c.slug));
    for (const w of words) {
      expect(w.cefrLevel).toBe(CefrLevel.B2);
      expect(w.categories[0]).toBe('b2-wortschatz');
      expect(w.categories).toHaveLength(2);
      for (const c of w.categories) expect(slugs).toContain(c);
    }
  });

  it('nincs ismétlődő szó, és nem ütközik az alap mintakészlettel', () => {
    expect(() => selectSets('core,b2')).not.toThrow();
    expect(selectSets(undefined).words).toHaveLength(CORE_SET.words.length + words.length);
  });

  it('minden főnévnek van névelője (kivéve a csak többes számúakat) és birtokos esete', () => {
    for (const w of of(PartOfSpeech.NOUN)) {
      if (w.attributes?.kind !== 'noun') throw new Error(`${w.lemma}: nincs főnévi attribútum`);
      const d = w.attributes.data;
      if (d.numberType === NumberType.PLURAL_ONLY) {
        expect(d.gender ?? null).toBeNull();
      } else {
        expect(d.gender).toBeDefined();
        expect(d.genitiveSingular).toBeTruthy();
      }
      if (d.numberType === NumberType.REGULAR) expect(d.pluralForm).toBeTruthy();
    }
  });

  it('az igék és melléknevek nagy része vonzatos', () => {
    const withValency = (pos: PartOfSpeech) => of(pos).filter((w) => (w.valencies?.length ?? 0) > 0).length / of(pos).length;
    expect(withValency(PartOfSpeech.VERB)).toBeGreaterThan(0.5);
    expect(withValency(PartOfSpeech.ADJECTIVE)).toBeGreaterThan(0.3);
    for (const w of of(PartOfSpeech.PREPOSITION)) expect(w.valencies).toHaveLength(1);
  });

  it('a mezők beleférnek az adatbázis oszlopméreteibe', () => {
    for (const w of words) {
      expect(w.lemma.length).toBeLessThanOrEqual(200);
      expect(w.lemma).toBe(w.lemma.trim());
      for (const t of w.translations) {
        expect(t.text.length).toBeLessThanOrEqual(300);
        expect(t.text).not.toMatch(/[{}|]/);
      }
      for (const v of w.valencies ?? []) {
        expect(v.pattern.length).toBeLessThanOrEqual(200);
        expect(v.meaning.length).toBeLessThanOrEqual(300);
      }
    }
  });

  it('ismeretlen készletnév hibát ad', () => {
    expect(() => selectSets('c1')).toThrow(/Ismeretlen szókészlet/);
  });
});
