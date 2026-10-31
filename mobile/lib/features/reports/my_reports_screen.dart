import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_exception.dart';
import '../../data/repositories/report_repository.dart';
import '../../providers.dart';

final myReportsProvider = FutureProvider.autoDispose<List<MyReport>>((ref) => ref.watch(reportRepositoryProvider).mine());

/// A felhasználó bejelentései és azok állapota (javítva / nem hiba / feldolgozás alatt),
/// az admin megjegyzésével. Online nézet: a még fel nem töltött bejelentések a
/// következő szinkron után jelennek meg.
class MyReportsScreen extends ConsumerWidget {
  const MyReportsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reports = ref.watch(myReportsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Bejelentéseim')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(myReportsProvider.future),
        child: reports.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(children: [
            Padding(
              padding: const EdgeInsets.all(24),
              child: Text(e is NetworkException
                  ? 'Nincs kapcsolat. A bejelentéseid nem vesznek el: a következő szinkronnál feltöltődnek.'
                  : 'Hiba: $e'),
            ),
          ]),
          data: (items) => items.isEmpty
              ? ListView(children: const [
                  Padding(
                    padding: EdgeInsets.all(24),
                    child: Text('Még nincs feltöltött bejelentésed. Tanulás közben a zászló ikonnal jelezhetsz hibát.'),
                  ),
                ])
              : ListView.separated(
                  itemCount: items.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (context, i) => _ReportTile(report: items[i]),
                ),
        ),
      ),
    );
  }
}

class _ReportTile extends StatelessWidget {
  const _ReportTile({required this.report});

  final MyReport report;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final (icon, color) = switch (report.status) {
      'RESOLVED' => (Icons.check_circle, Colors.green),
      'DISMISSED' => (Icons.remove_circle_outline, scheme.outline),
      _ => (Icons.hourglass_top, scheme.primary),
    };
    return ListTile(
      leading: Icon(icon, color: color),
      title: Text('${report.word} – ${report.category.label}'),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(report.message),
          if (report.adminNote != null) Text('Válasz: ${report.adminNote}', style: TextStyle(color: scheme.primary)),
        ],
      ),
      trailing: Text(report.statusLabel, style: Theme.of(context).textTheme.labelSmall),
      isThreeLine: report.adminNote != null,
    );
  }
}
