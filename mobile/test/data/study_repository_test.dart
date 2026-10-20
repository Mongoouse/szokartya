import 'package:flutter_test/flutter_test.dart';
import 'package:szokartya/core/time/clock.dart';
import 'package:szokartya/data/local/app_database.dart';
import 'package:szokartya/data/local/local_store.dart';
import 'package:szokartya/data/models/custom_word_input.dart';
import 'package:szokartya/data/models/study_card.dart';
import 'package:szokartya/data/repositories/auth_repository.dart';
import 'package:szokartya/data/models/user_settings.dart';
import 'package:szokartya/data/repositories/study_repository.dart';

import '../helpers/test_support.dart';

void main() {
  late AppDatabase db;
  late LocalStore store;
  late StudyRepository study;
  final clock = FakeClock(DateTime.utc(2026, 3, 10, 9));

  const food = (slug: 'essen', nameHu: 'Étel');
  final verb = {
    'present3sg': 'fährt',
    'preterite3sg': 'fuhr',
    'pastParticiple': 'gefahren',
    'auxiliary': 'SEIN',
  };

  setUp(() async {
    clock.time = DateTime.utc(2026, 3, 10, 9);
    db = await openTestDatabase();
    store = LocalStore(db);
    await seedProfile(store);
    await store.applyServerWords([
      wordJson(id: 'apfel', lemma: 'Apfel', translation: 'alma', pluralForm: 'Äpfel', categories: [food]),
      wordJson(id: 'milch', lemma: 'Milch', translation: 'tej', countable: false, categories: [food]),
      wordJson(id: 'fahren', lemma: 'fahren', partOfSpeech: 'VERB', article: null, translation: 'utazik', verb: verb),
      wordJson(
        id: 'warten',
        lemma: 'warten',
        partOfSpeech: 'VERB',
        article: null,
        translation: 'vár',
        cefrLevel: 'A2',
        valencies: [
          {'pattern': 'warten auf + Akk.', 'meaning': 'vár valakire', 'preposition': 'auf', 'caseAbbreviation': 'Akk.', 'examples': <Object>[]},
        ],
      ),
    ]);
    study = StudyRepository(store: store, clock: clock);
  });
  tearDown(() => db.close());

  Future<Set<CardType>> typesOf(String wordId) => store.enrolledTypes(wordId);

  group('kártyafelvétel', () {
    test('alapértelmezés: felismerés, felidézés, névelő, többes szám – csak ahol értelmes', () async {
      await study.enrollLevel('A1');
      expect(await typesOf('apfel'), {CardType.recognition, CardType.production, CardType.gender, CardType.plural});
      expect(await typesOf('milch'), {CardType.recognition, CardType.production, CardType.gender});
      expect(await typesOf('fahren'), {CardType.recognition, CardType.production});
    });

    test('a választott típusok tárolódnak; igei alakok és vonzat kártya', () async {
      await study.setPreferredCardTypes({CardType.recognition, CardType.verbForms, CardType.valency});
      expect(await study.preferredCardTypes(), {CardType.recognition, CardType.verbForms, CardType.valency});
      await study.enrollLevel('A1');
      await study.enrollLevel('A2');
      expect(await typesOf('fahren'), {CardType.recognition, CardType.verbForms});
      expect(await typesOf('warten'), {CardType.recognition, CardType.valency});
    });

    test('kategória szerinti felvétel és kategórialista', () async {
      expect(await store.categories(), [(slug: 'essen', nameHu: 'Étel', total: 2, unenrolled: 2)]);
      final created = await study.enrollCategory('essen');
      expect(created, 7);
      expect(await store.categories(), [(slug: 'essen', nameHu: 'Étel', total: 2, unenrolled: 0)]);
      expect(await typesOf('fahren'), isEmpty);
    });
  });

  group('szókereső', () {
    test('németül és magyarul is keres; a szó eleji egyezés előre kerül', () async {
      expect((await study.searchWords(query: 'alma')).map((r) => r.word.id), ['apfel']);
      expect((await study.searchWords(query: 'FAHR')).map((r) => r.word.id), ['fahren']);
      final all = await study.searchWords(query: 'a');
      expect(all.first.word.id, 'apfel'); // „apfel …” a szó elején egyezik
    });

    test('szűrők és a felvett állapot jelölése; a LIKE helyettesítő karakterei szó szerint értendők', () async {
      await study.enrollWords([(await store.unenrolledWords(cefrLevel: 'A2')).single]);
      final a2 = await study.searchWords(cefrLevel: 'A2');
      expect(a2.single.word.id, 'warten');
      expect(a2.single.enrolled, isTrue);
      expect((await study.searchWords(categorySlug: 'essen')).map((r) => r.word.id).toSet(), {'apfel', 'milch'});
      expect(await study.searchWords(query: '%'), isEmpty);
      expect(await study.searchWords(query: '_'), isEmpty);
    });
  });

  group('saját szó', () {
    test('offline felvétel: szó + kártyák + kimenő sor (a szó a felvételek előtt)', () async {
      final word = await study.addCustomWord(const CustomWordInput(
        lemma: 'Fernweh',
        partOfSpeech: 'NOUN',
        gender: 'NEUTER',
        translations: ['vágyakozás távoli helyekre'],
      ));
      expect(word.display, 'das Fernweh');
      expect(word.isCustom, isTrue);
      expect(await typesOf(word.id), {CardType.recognition, CardType.production, CardType.gender});
      expect((await study.searchWords(customOnly: true)).single.word.id, word.id);

      final rows = await db.db.query('outbox', orderBy: 'seq');
      expect(rows.first['kind'], 'custom_word');
      final push = (await store.outbox(kind: OutboxKind.customWord, limit: 10)).single.payload;
      expect(push, {
        'id': word.id,
        'lemma': 'Fernweh',
        'partOfSpeech': 'NOUN',
        'translations': ['vágyakozás távoli helyekre'],
        'gender': 'NEUTER',
      });

      await store.discardWord(word.id);
      expect(await study.searchWords(customOnly: true), isEmpty);
      expect(await store.outboxCount(), 0);
    });

    test('ellenőrzés: ige alapalakok nélkül nem menthető', () {
      expect(const CustomWordInput(lemma: 'x', partOfSpeech: 'VERB', translations: ['y']).validate(), isNotNull);
      expect(const CustomWordInput(lemma: 'x', partOfSpeech: 'NOUN', translations: [' ']).validate(), isNotNull);
      expect(const CustomWordInput(lemma: 'x', partOfSpeech: 'ADVERB', translations: ['y']).validate(), isNull);
    });
  });

  group('célmegtartás és időzóna', () {
    Future<void> setProfile({double retention = 0.9, String tz = 'Europe/Budapest'}) => store.setState(
          profileStateKey,
          UserProfile(
            id: 'u1',
            email: 'a@b.hu',
            displayName: null,
            timezone: tz,
            dailyNewCardsLimit: 20,
            dailyReviewLimit: 200,
            targetRetention: retention,
          ).encode(),
        );

    test('a profil célmegtartása rövidíti az előnézett intervallumot', () async {
      await store.applyServerCards([
        progressJson(id: 'c1', wordId: 'apfel', state: 'REVIEW', intervalDays: 10, totalReviews: 3, nextReviewAt: clock.now()),
      ]);
      final card = (await store.card('c1'))!;
      final base = (await study.previewIntervals(card, responseTimeMs: 2000))[4]!;
      await setProfile(retention: 0.95);
      final strict = (await study.previewIntervals(card, responseTimeMs: 2000))[4]!;
      expect(strict, lessThan(base));
    });

    test('a „mai nap” a profil időzónája szerint ér véget', () async {
      await setProfile(tz: 'America/New_York');
      final queue = await study.loadQueue();
      expect(queue.dayEndsAt, localDayBounds(clock.now(), timeZone: 'America/New_York').end);
      expect(queue.dayEndsAt, DateTime.utc(2026, 3, 11, 4)); // New York: UTC−4 (márc. 8. óta nyári idő)
    });
  });

  test('statisztika: napi aktivitás, pontosság, sorozat, előrejelzés', () async {
    await study.enrollWords([(await store.unenrolledWords(cefrLevel: 'A2')).single], types: {CardType.recognition});
    // Három egymást követő napon egy-egy értékelés (tegnapelőtt, tegnap, ma).
    for (final (i, grade) in [(2, 4), (1, 1), (0, 5)]) {
      clock.time = DateTime.utc(2026, 3, 10 - i, 9);
      final card = (await store.newCards(limit: 1)).firstOrNull ?? (await store.card((await db.db.query('cards')).single['id']! as String))!;
      await study.review(card, grade: grade, responseTimeMs: 3000);
    }
    final s = await study.stats();
    expect(s.reviewsLast30Days, 3);
    expect(s.accuracyLast30Days, closeTo(2 / 3, 1e-9));
    expect(s.avgResponseMsLast30Days, 3000);
    expect(s.streakDays, 3);
    expect(s.days, hasLength(30));
    expect(s.days.last.reviews, 1);
    expect(s.forecast, hasLength(14));
    expect(s.forecast.fold<int>(0, (a, d) => a + d.due), 1);
    expect(s.cardsByType, {CardType.recognition: 1});
  });
}
