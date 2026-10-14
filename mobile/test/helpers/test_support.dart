import 'dart:io';

import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:szokartya/core/api/api_client.dart';
import 'package:szokartya/core/time/clock.dart';
import 'package:szokartya/data/local/app_database.dart';
import 'package:szokartya/data/local/local_store.dart';
import 'package:szokartya/data/models/user_settings.dart';
import 'package:szokartya/data/repositories/auth_repository.dart';

/// Vezérelhető óra.
class FakeClock implements Clock {
  FakeClock(this._now);

  DateTime _now;

  @override
  DateTime now() => _now;

  void advance(Duration d) => _now = _now.add(d);

  set time(DateTime value) => _now = value.toUtc();
}

/// Külön, ideiglenes fájlban tárolt adatbázis.
///
/// Fontos: az `inMemoryDatabasePath` NEM használható több „eszköz” szimulálására,
/// mert a sqflite azonos útvonalra ugyanazt a példányt adja vissza.
Future<AppDatabase> openTestDatabase() async {
  sqfliteFfiInit();
  final dir = await Directory.systemTemp.createTemp('szokartya_test_');
  return AppDatabase.open(path: '${dir.path}/db.sqlite', factory: databaseFactoryFfiNoIsolate);
}

/// Bejelentkezett állapot előkészítése (profil a helyi tárolóban).
Future<void> seedProfile(LocalStore store, {int dailyNew = 20, int dailyReview = 200}) => store.setState(
      profileStateKey,
      UserProfile(
        id: 'u1',
        email: 'anna@example.hu',
        displayName: 'Anna',
        timezone: 'Europe/Budapest',
        dailyNewCardsLimit: dailyNew,
        dailyReviewLimit: dailyReview,
      ).encode(),
    );

int _wordVersion = 0;

/// A szerver `WordSyncDto`-jának megfelelő JSON.
Json wordJson({
  required String id,
  String lemma = 'Tisch',
  String partOfSpeech = 'NOUN',
  String? article = 'der',
  String cefrLevel = 'A1',
  String translation = 'asztal',
  int? version,
  bool deleted = false,
}) =>
    {
      'id': id,
      'lemma': lemma,
      'display': article == null ? lemma : '$article $lemma',
      'partOfSpeech': partOfSpeech,
      'homographNo': 1,
      'cefrLevel': cefrLevel,
      'ipa': null,
      'isCustom': false,
      'noun': partOfSpeech == 'NOUN'
          ? {'gender': 'MASCULINE', 'article': article, 'numberType': 'REGULAR', 'pluralForm': '${lemma}e'}
          : null,
      'verb': null,
      'adjective': null,
      'translations': [
        {'text': translation, 'senseNote': null, 'isPrimary': true},
      ],
      'valencies': <Json>[],
      'examples': <Json>[],
      'categories': <Json>[],
      'version': version ?? ++_wordVersion,
      'updatedAt': DateTime.utc(2026).toIso8601String(),
      'deletedAt': deleted ? DateTime.utc(2026).toIso8601String() : null,
    };

/// A szerver `ProgressSyncDto`-jának megfelelő JSON.
Json progressJson({
  required String id,
  required String wordId,
  String cardType = 'RECOGNITION',
  String state = 'NEW',
  int version = 1,
  int totalReviews = 0,
  int intervalDays = 0,
  DateTime? nextReviewAt,
  bool isSuspended = false,
  bool deleted = false,
}) =>
    {
      'id': id,
      'wordId': wordId,
      'cardType': cardType,
      'state': state,
      'easeFactor': 2.5,
      'intervalDays': intervalDays,
      'repetitions': 0,
      'learningStep': 0,
      'lapses': 0,
      'totalReviews': totalReviews,
      'correctReviews': totalReviews,
      'avgResponseMs': null,
      'stabilityDays': null,
      'lastReviewedAt': null,
      'nextReviewAt': nextReviewAt?.toIso8601String(),
      'isSuspended': isSuspended,
      'version': version,
      'createdAt': DateTime.utc(2026).toIso8601String(),
      'updatedAt': DateTime.utc(2026).toIso8601String(),
      'deletedAt': deleted ? DateTime.utc(2026).toIso8601String() : null,
    };
