import 'store/card_queries.dart';
import 'store/key_value_store.dart';
import 'store/local_changes.dart';
import 'store/outbox_store.dart';
import 'store/server_apply.dart';
import 'store/stats_queries.dart';
import 'store/store_support.dart';
import 'store/word_queries.dart';

export 'store/local_changes.dart' show LocalReview;
export 'store/outbox_store.dart' show OutboxEntry, OutboxKind;

/// A helyi adatbázis adatelérési rétege (DAO). Minden SQL ebben a rétegben
/// van; a felsőbb rétegek típusos modellekkel dolgoznak.
///
/// A műveletek témánként külön fájlban, mixinként vannak (`store/`), ez az
/// osztály csak összefogja őket, így a hívók egyetlen objektumot kapnak.
class LocalStore extends LocalStoreBase
    with CardQueries, WordQueries, LocalChanges, OutboxStore, ServerApply, StatsQueries, KeyValueStore {
  LocalStore(super.database);
}
