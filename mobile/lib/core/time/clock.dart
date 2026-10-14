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

/// A helyi (eszköz-időzóna szerinti) nap kezdete és vége UTC-ben.
({DateTime start, DateTime end}) localDayBounds(DateTime instant) {
  final local = instant.toLocal();
  final start = DateTime(local.year, local.month, local.day);
  final end = DateTime(local.year, local.month, local.day + 1);
  return (start: start.toUtc(), end: end.toUtc());
}
