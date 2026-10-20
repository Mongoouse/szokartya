import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:szokartya/data/local/local_store.dart';

import '../helpers/test_support.dart';

/// v1 → v2: a meglévő adatok megmaradnak, a keresőoszlopok és kategóriák a
/// payloadból töltődnek fel, a kimenő sor új típust is elfogad.
void main() {
  test('v1 adatbázis frissítése v2-re adatvesztés nélkül', () async {
    final path = '${(await Directory.systemTemp.createTemp('szokartya_mig_')).path}/db.sqlite';
    final v1 = await openTestDatabase(path: path, version: 1);
    final word = wordJson(id: 'w1', lemma: 'Apfel', translation: 'alma', categories: [(slug: 'essen', nameHu: 'Étel')]);
    await v1.db.insert('words', {
      'id': 'w1',
      'payload': jsonEncode(word),
      'version': 1,
      'cefr_level': 'A1',
      'part_of_speech': 'NOUN',
      'has_gender': 1,
    });
    await v1.db.insert('outbox', {'kind': 'enroll', 'entity_id': 'c1', 'payload': '{}', 'created_at': 1});
    await expectLater(
      v1.db.insert('outbox', {'kind': 'custom_word', 'entity_id': 'w9', 'payload': '{}', 'created_at': 2}),
      throwsA(anything), // v1-ben még nem engedélyezett típus
    );
    await v1.close();

    final v2 = await openTestDatabase(path: path);
    final store = LocalStore(v2);
    final row = (await v2.db.query('words')).single;
    expect(row['search_text'], 'apfel der apfel alma');
    expect(row['is_custom'], 0);
    expect(await store.categories(), [(slug: 'essen', nameHu: 'Étel', total: 1, unenrolled: 1)]);
    expect((await store.searchWords(query: 'alma')).single.word.id, 'w1');

    final outbox = await v2.db.query('outbox');
    expect(outbox.single['entity_id'], 'c1');
    await v2.db.insert('outbox', {'kind': 'custom_word', 'entity_id': 'w9', 'payload': '{}', 'created_at': 2});
    await v2.close();
  });
}
