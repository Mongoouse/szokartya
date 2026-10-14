import 'dart:convert';
import 'dart:io';

import 'package:szokartya/domain/sm2_scheduler.dart';

/// Az ütemező kimenete egy értékelési sorozatra (JSON) – a TypeScript
/// implementációval való összevetéshez.
void main(List<String> args) {
  final seq = (jsonDecode(File(args.first).readAsStringSync()) as List).cast<List<dynamic>>();
  var c = CardSchedulingState.initial();
  var t = DateTime.utc(2026, 1, 1, 8).millisecondsSinceEpoch;
  final out = <Object>[];
  for (final step in seq) {
    final g = step[0] as int;
    final rt = step[1] as int;
    final parts = (step[2] as String).split(':');
    final base = c.nextReviewAt?.millisecondsSinceEpoch ?? t;
    final at = switch (parts[0]) {
      'now' => t,
      'late' => base + (double.parse(parts[1]) * 86400000).round(),
      'early' => t + (double.parse(parts[1]) * (base - t)).round(),
      _ => base,
    };
    final r = scheduleReview(c, grade: g, responseTimeMs: rt, reviewedAt: DateTime.fromMillisecondsSinceEpoch(at, isUtc: true));
    c = r.card;
    t = at;
    out.add({
      's': c.state.wire, 'ef': c.easeFactor, 'i': c.intervalDays, 'rep': c.repetitions, 'ls': c.learningStep,
      'l': c.lapses, 'tr': c.totalReviews, 'cr': c.correctReviews, 'avg': c.avgResponseMs, 'st': c.stabilityDays,
      'next': c.nextReviewAt!.toIso8601String(), 'eg': r.effectiveGrade, 'el': r.elapsedDays,
    });
  }
  stdout.writeln(jsonEncode(out));
}
