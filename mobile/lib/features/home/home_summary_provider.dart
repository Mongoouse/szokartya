import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/repositories/study_repository.dart';
import '../../providers.dart';

/// A kezdőképernyő összesítője (helyi adatokból). Szinkron és tanulás után érvénytelenítjük.
final homeSummaryProvider = FutureProvider.autoDispose<HomeSummary>(
  (ref) => ref.watch(studyRepositoryProvider).summary(),
);
