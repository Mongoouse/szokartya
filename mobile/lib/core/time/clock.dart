import 'package:timezone/data/latest.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

/// Az aktuális idő forrása. Injektálható, hogy az időfüggő logika (ütemezés,
/// napi keretek, szinkron) tesztben determinisztikusan vezérelhető legyen.
abstract interface class Clock {
  DateTime now();
}

class SystemClock implements Clock {
  const SystemClock();

  @override
  DateTime now() => DateTime.now().toUtc();
}

/// A „mai nap” kezdete és vége UTC-ben.
///
/// Ha [timeZone] (IANA név, pl. `Europe/Budapest`) adott és ismert, a nap a
/// profilban beállított időzóna szerint értendő – ugyanúgy, ahogy a szerver
/// számolja a napi kereteket. Így egy másik időzónában lévő eszközön sem
/// tolódik el a napi keret határa. Ismeretlen zónánál az eszköz időzónája.
({DateTime start, DateTime end}) localDayBounds(DateTime instant, {String? timeZone}) {
  final location = timeZone == null ? null : _location(timeZone);
  if (location == null) {
    final local = instant.toLocal();
    final start = DateTime(local.year, local.month, local.day);
    final end = DateTime(local.year, local.month, local.day + 1);
    return (start: start.toUtc(), end: end.toUtc());
  }
  final t = tz.TZDateTime.from(instant, location);
  final start = tz.TZDateTime(location, t.year, t.month, t.day);
  final end = tz.TZDateTime(location, t.year, t.month, t.day + 1);
  return (
    start: DateTime.fromMillisecondsSinceEpoch(start.millisecondsSinceEpoch, isUtc: true),
    end: DateTime.fromMillisecondsSinceEpoch(end.millisecondsSinceEpoch, isUtc: true),
  );
}

bool _tzInitialized = false;

tz.Location? _location(String name) {
  if (!_tzInitialized) {
    tzdata.initializeTimeZones();
    _tzInitialized = true;
  }
  try {
    return tz.getLocation(name);
  } on tz.LocationNotFoundException {
    return null;
  }
}
