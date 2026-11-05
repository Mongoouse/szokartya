import '../../core/time/clock.dart';
import '../../domain/placement_test.dart';
import '../local/local_store.dart';

/// A szintfelmérő állapota ezen az eszközön.
sealed class PlacementOutcome {
  const PlacementOutcome();
}

/// Még nem töltötte ki és nem is hagyta ki.
final class PlacementNotTaken extends PlacementOutcome {
  const PlacementNotTaken();
}

/// Kihagyta (a kezdőképernyőről később elindíthatja).
final class PlacementSkipped extends PlacementOutcome {
  const PlacementSkipped();
}

final class PlacementDone extends PlacementOutcome {
  const PlacementDone(this.result);

  final PlacementResult result;
}

/// A szintfelmérő eredményének tárolása (helyben – a felmérés offline is
/// kitölthető, és csak a kezdőképernyő ajánlását befolyásolja). Kijelentkezéskor
/// a helyi adatokkal együtt törlődik.
class PlacementRepository {
  PlacementRepository({required this._store, required this._clock});

  final LocalStore _store;
  final Clock _clock;

  static const _resultKey = 'placement.result';
  static const _skippedKey = 'placement.skipped';

  Future<PlacementOutcome> load() async {
    final raw = await _store.getState(_resultKey);
    if (raw != null) {
      try {
        return PlacementDone(PlacementResult.decode(raw));
      } on Object {
        // sérült / régi formátum → mintha nem töltötte volna ki
      }
    }
    return await _store.getState(_skippedKey) == null ? const PlacementNotTaken() : const PlacementSkipped();
  }

  /// Felajánljuk-e induláskor: még nem döntött róla, és nincs felvett szava
  /// (a meglévő felhasználókat – pl. frissítés után – nem állítjuk meg).
  Future<bool> shouldOfferOnStart() async =>
      await load() is PlacementNotTaken && await _store.countEnrolledWords() == 0;

  Future<void> save(PlacementResult result) => _store.setState(_resultKey, result.encode());

  Future<void> skip() => _store.setState(_skippedKey, _clock.now().toIso8601String());
}
