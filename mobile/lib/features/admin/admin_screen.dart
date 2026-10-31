import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_exception.dart';
import '../../data/repositories/admin_repository.dart';
import '../../data/repositories/report_repository.dart';
import '../../providers.dart';
import '../sync/sync_controller.dart';

final adminSummaryProvider = FutureProvider.autoDispose<AdminSummary>((ref) => ref.watch(adminRepositoryProvider).summary());

/// Adminisztráció (csak ADMIN szerepkörrel látszik): a felhasználói
/// hibabejelentések kezelése és a központi szókincs emberi ellenőrzése.
/// Online nézet – minden módosítás a szerveren történik, és a szinkronnal jut
/// el a felhasználók eszközeire.
class AdminScreen extends ConsumerWidget {
  const AdminScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(adminSummaryProvider);
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Adminisztráció'),
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(88),
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                  child: summary.when(
                    loading: () => const LinearProgressIndicator(),
                    error: (e, _) => Text(_errorText(e)),
                    data: (s) => Text(
                      'Szavak: ${s.verified} ellenőrzött · ${s.unreviewed} ellenőrizetlen · ${s.rejected} elutasított\n'
                      'Nyitott bejelentés: ${s.openReports}'
                      '${s.avgResolutionHours == null ? '' : ' · átl. átfutás: ${s.avgResolutionHours!.toStringAsFixed(1)} óra'}',
                      textAlign: TextAlign.center,
                    ),
                  ),
                ),
                const TabBar(tabs: [Tab(text: 'Bejelentések'), Tab(text: 'Szavak')]),
              ],
            ),
          ),
        ),
        body: const TabBarView(children: [_ReportsTab(), _WordsTab()]),
      ),
    );
  }
}

String _errorText(Object e) => switch (e) {
      NetworkException() => 'Nincs kapcsolat – az adminisztráció csak online érhető el.',
      HttpStatusException(statusCode: 403) => 'Nincs adminisztrátori jogosultságod.',
      HttpStatusException(statusCode: 409) => 'A szót közben módosították – frissítsd a listát.',
      ApiException(:final message) => message,
      _ => '$e',
    };

void _showError(BuildContext context, Object e) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(_errorText(e))));

/// A változás után az admin saját eszköze is frissüljön (és az összesítés).
void _afterChange(WidgetRef ref) {
  ref.invalidate(adminSummaryProvider);
  ref.read(syncControllerProvider.notifier).scheduleSync();
}

// -----------------------------------------------------------------------------
// Bejelentések
// -----------------------------------------------------------------------------

class _ReportsTab extends ConsumerStatefulWidget {
  const _ReportsTab();

  @override
  ConsumerState<_ReportsTab> createState() => _ReportsTabState();
}

class _ReportsTabState extends ConsumerState<_ReportsTab> {
  static const _statuses = [('OPEN', 'Nyitott'), ('RESOLVED', 'Javítva'), ('DISMISSED', 'Nem hiba')];

  var _status = 'OPEN';
  late Future<({List<AdminReport> items, int total})> _future = _load();

  Future<({List<AdminReport> items, int total})> _load() =>
      ref.read(adminRepositoryProvider).reports(status: _status, limit: 200);

  void _reload() => setState(() => _future = _load());

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(8),
          child: SegmentedButton<String>(
            segments: [for (final (v, l) in _statuses) ButtonSegment(value: v, label: Text(l))],
            selected: {_status},
            onSelectionChanged: (s) {
              _status = s.single;
              _reload();
            },
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () async => _reload(),
            child: FutureBuilder(
              future: _future,
              builder: (context, snap) {
                if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
                if (snap.hasError) return ListView(children: [Padding(padding: const EdgeInsets.all(24), child: Text(_errorText(snap.error!)))]);
                final items = snap.data!.items;
                if (items.isEmpty) {
                  return ListView(children: const [Padding(padding: EdgeInsets.all(24), child: Text('Nincs ilyen bejelentés.'))]);
                }
                return ListView.separated(
                  itemCount: items.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (context, i) {
                    final r = items[i];
                    return ListTile(
                      title: Text('${r.word.word.display} – ${ReportCategory.parse(r.category).label}'),
                      subtitle: Text('${r.message}\n${r.reporterEmail} · ${_date(r.receivedAt)}'),
                      isThreeLine: true,
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () async {
                        final changed = await showModalBottomSheet<bool>(
                          context: context,
                          isScrollControlled: true,
                          builder: (_) => _ReportSheet(report: r),
                        );
                        if (changed == true) _reload();
                      },
                    );
                  },
                );
              },
            ),
          ),
        ),
      ],
    );
  }
}

String _date(DateTime t) {
  final l = t.toLocal();
  String two(int n) => n.toString().padLeft(2, '0');
  return '${l.year}.${two(l.month)}.${two(l.day)}. ${two(l.hour)}:${two(l.minute)}';
}

/// Egy bejelentés kezelése: a szó javítása vagy elutasítása, majd a bejelentés lezárása.
class _ReportSheet extends ConsumerStatefulWidget {
  const _ReportSheet({required this.report});

  final AdminReport report;

  @override
  ConsumerState<_ReportSheet> createState() => _ReportSheetState();
}

class _ReportSheetState extends ConsumerState<_ReportSheet> {
  final _note = TextEditingController();
  late AdminWord _word = widget.report.word;
  var _busy = false;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
      _afterChange(ref);
    } on Object catch (e) {
      if (mounted) _showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _fixTranslations() async {
    final translations = await showTranslationEditor(context, _word);
    if (translations == null) return;
    await _run(() async {
      _word = await ref
          .read(adminRepositoryProvider)
          .updateWord(_word.word.id, translations: translations, expectedVersion: _word.version);
      if (_note.text.trim().isEmpty) _note.text = 'Javítva: ${translations.join(', ')}';
    });
  }

  Future<void> _setWordStatus(String status) =>
      _run(() async => _word = await ref.read(adminRepositoryProvider).updateWord(_word.word.id, reviewStatus: status));

  Future<void> _close(String status) => _run(() async {
        await ref.read(adminRepositoryProvider).updateReport(widget.report.id, status: status, adminNote: _note.text);
        if (mounted) Navigator.of(context).pop(true);
      });

  @override
  Widget build(BuildContext context) {
    final r = widget.report;
    final theme = Theme.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(_word.word.display, style: theme.textTheme.headlineSmall),
            Text(_word.word.translations.join(', '), style: theme.textTheme.titleMedium),
            Text('Állapot: ${reviewStatusLabel(_word.reviewStatus)}${r.cardType == null ? '' : ' · kártya: ${r.cardType}'}'),
            const Divider(height: 24),
            Text(ReportCategory.parse(r.category).label, style: theme.textTheme.labelLarge),
            Text(r.message),
            Text('${r.reporterEmail} · ${_date(r.receivedAt)}', style: theme.textTheme.bodySmall),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                OutlinedButton.icon(
                  onPressed: _busy ? null : _fixTranslations,
                  icon: const Icon(Icons.edit),
                  label: const Text('Jelentés javítása'),
                ),
                if (_word.reviewStatus != 'VERIFIED')
                  OutlinedButton.icon(
                    onPressed: _busy ? null : () => _setWordStatus('VERIFIED'),
                    icon: const Icon(Icons.verified_outlined),
                    label: const Text('Szó helyes'),
                  ),
                if (_word.reviewStatus != 'REJECTED')
                  OutlinedButton.icon(
                    onPressed: _busy ? null : () => _setWordStatus('REJECTED'),
                    icon: const Icon(Icons.block),
                    label: const Text('Szó elutasítása'),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _note,
              enabled: !_busy,
              maxLength: 1000,
              decoration: const InputDecoration(labelText: 'Válasz a bejelentőnek (nem kötelező)'),
            ),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: _busy || r.status == 'DISMISSED' ? null : () => _close('DISMISSED'),
                    child: const Text('Lezárás: nem hiba'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: FilledButton(
                    onPressed: _busy || r.status == 'RESOLVED' ? null : () => _close('RESOLVED'),
                    child: const Text('Lezárás: javítva'),
                  ),
                ),
              ],
            ),
            if (r.status != 'OPEN')
              TextButton(onPressed: _busy ? null : () => _close('OPEN'), child: const Text('Újranyitás')),
          ],
        ),
      ),
    );
  }
}

String reviewStatusLabel(String status) => switch (status) {
      'VERIFIED' => 'ellenőrzött',
      'REJECTED' => 'elutasított',
      _ => 'ellenőrizetlen',
    };

/// A magyar jelentések szerkesztése (soronként egy, az első az elsődleges).
/// @returns az új lista, vagy null, ha a felhasználó megszakította.
Future<List<String>?> showTranslationEditor(BuildContext context, AdminWord word) {
  final controller = TextEditingController(text: word.word.translations.join('\n'));
  return showDialog<List<String>>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text('Jelentések: ${word.word.display}'),
      content: TextField(
        key: const Key('translationEditor'),
        controller: controller,
        autofocus: true,
        minLines: 3,
        maxLines: 8,
        decoration: const InputDecoration(helperText: 'Soronként egy jelentés; az első az elsődleges.'),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Mégse')),
        FilledButton(
          onPressed: () {
            final seen = <String>{};
            final lines = [
              for (final l in controller.text.split('\n'))
                if (l.trim().isNotEmpty && seen.add(l.trim().toLowerCase())) l.trim(),
            ];
            if (lines.isNotEmpty) Navigator.pop(ctx, lines);
          },
          child: const Text('Mentés'),
        ),
      ],
    ),
  ).whenComplete(controller.dispose);
}

// -----------------------------------------------------------------------------
// Szavak ellenőrzése
// -----------------------------------------------------------------------------

class _WordsTab extends ConsumerStatefulWidget {
  const _WordsTab();

  @override
  ConsumerState<_WordsTab> createState() => _WordsTabState();
}

class _WordsTabState extends ConsumerState<_WordsTab> {
  static const _pageSize = 50;
  static const _filters = [
    ('UNREVIEWED', 'Ellenőrizetlen'),
    ('reported', 'Bejelentett'),
    ('VERIFIED', 'Ellenőrzött'),
    ('REJECTED', 'Elutasított'),
  ];

  final _search = TextEditingController();
  var _filter = 'UNREVIEWED';
  final _items = <AdminWord>[];
  var _total = 0;
  var _loading = false;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _load(reset: true);
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load({required bool reset}) async {
    setState(() {
      _loading = true;
      _error = null;
      if (reset) _items.clear();
    });
    try {
      final page = await ref.read(adminRepositoryProvider).words(
            status: _filter == 'reported' ? null : _filter,
            hasOpenReports: _filter == 'reported',
            query: _search.text,
            limit: _pageSize,
            offset: _items.length,
          );
      if (!mounted) return;
      setState(() {
        _items.addAll(page.items);
        _total = page.total;
      });
    } on Object catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// Gyors döntés a listából: a szó a szűrőnek már nem felel meg, ezért kikerül belőle.
  Future<void> _update(AdminWord w, {String? status, List<String>? translations}) async {
    try {
      final updated = await ref
          .read(adminRepositoryProvider)
          .updateWord(w.word.id, reviewStatus: status, translations: translations, expectedVersion: w.version);
      _afterChange(ref);
      if (!mounted) return;
      setState(() {
        final i = _items.indexWhere((x) => x.word.id == w.word.id);
        if (i < 0) return;
        final stillMatches = _filter == 'reported' ? updated.openReports > 0 : updated.reviewStatus == _filter;
        if (stillMatches) {
          _items[i] = updated;
        } else {
          _items.removeAt(i);
          _total--;
        }
      });
    } on Object catch (e) {
      if (mounted) _showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(8, 8, 8, 0),
          child: TextField(
            controller: _search,
            textInputAction: TextInputAction.search,
            onSubmitted: (_) => _load(reset: true),
            decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Keresés németül vagy magyarul'),
          ),
        ),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Row(
            children: [
              for (final (value, label) in _filters)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text(label),
                    selected: _filter == value,
                    onSelected: (_) {
                      _filter = value;
                      _load(reset: true);
                    },
                  ),
                ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Align(alignment: Alignment.centerLeft, child: Text('Találat: $_total')),
        ),
        Expanded(
          child: _error != null && _items.isEmpty
              ? Padding(padding: const EdgeInsets.all(24), child: Text(_errorText(_error!)))
              : ListView.builder(
                  itemCount: _items.length + 1,
                  itemBuilder: (context, i) {
                    if (i == _items.length) {
                      if (_loading) return const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator()));
                      if (_items.length < _total) {
                        return TextButton(onPressed: () => _load(reset: false), child: const Text('Több betöltése'));
                      }
                      return const SizedBox(height: 32);
                    }
                    final w = _items[i];
                    return ListTile(
                      title: Text('${w.word.display}${w.word.cefrLevel == null ? '' : '  (${w.word.cefrLevel})'}'),
                      subtitle: Text(
                        [
                          w.word.translations.join(', '),
                          if (w.openReports > 0) '${w.openReports} nyitott bejelentés',
                        ].join('\n'),
                      ),
                      isThreeLine: w.openReports > 0,
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          IconButton(
                            tooltip: 'Jelentés javítása',
                            icon: const Icon(Icons.edit),
                            onPressed: () async {
                              final t = await showTranslationEditor(context, w);
                              if (t != null) await _update(w, translations: t);
                            },
                          ),
                          if (w.reviewStatus != 'VERIFIED')
                            IconButton(
                              tooltip: 'Helyes',
                              icon: const Icon(Icons.check, color: Colors.green),
                              onPressed: () => _update(w, status: 'VERIFIED'),
                            ),
                          if (w.reviewStatus != 'REJECTED')
                            IconButton(
                              tooltip: 'Elutasítás',
                              icon: Icon(Icons.close, color: Theme.of(context).colorScheme.error),
                              onPressed: () => _update(w, status: 'REJECTED'),
                            ),
                        ],
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }
}
