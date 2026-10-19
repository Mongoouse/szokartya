import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/word.dart';
import '../../providers.dart';
import '../home/home_summary_provider.dart';
import '../settings/settings_screen.dart' show cefrLevels;
import '../sync/sync_controller.dart';
import 'custom_word_screen.dart';

/// Szókereső: keresés németül vagy magyarul, szint- és kategóriaszűrés,
/// egyes szavak felvétele, kiejtés.
class WordBrowserScreen extends ConsumerStatefulWidget {
  const WordBrowserScreen({super.key, this.initialCategory});

  final String? initialCategory;

  @override
  ConsumerState<WordBrowserScreen> createState() => _WordBrowserScreenState();
}

class _WordBrowserScreenState extends ConsumerState<WordBrowserScreen> {
  final _query = TextEditingController();
  Timer? _debounce;
  String? _level;
  late String? _category = widget.initialCategory;
  bool _customOnly = false;
  List<({Word word, bool enrolled})>? _results;
  List<({String slug, String nameHu, int total, int unenrolled})> _categories = const [];

  @override
  void initState() {
    super.initState();
    unawaited(_loadCategories());
    unawaited(_search());
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _query.dispose();
    super.dispose();
  }

  Future<void> _loadCategories() async {
    final cats = await ref.read(localStoreProvider).categories();
    if (mounted) setState(() => _categories = cats);
  }

  Future<void> _search() async {
    final results = await ref.read(studyRepositoryProvider).searchWords(
          query: _query.text,
          cefrLevel: _level,
          categorySlug: _category,
          customOnly: _customOnly,
        );
    if (mounted) setState(() => _results = results);
  }

  void _onQueryChanged(String _) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 250), _search);
  }

  @override
  Widget build(BuildContext context) {
    final results = _results;
    return Scaffold(
      appBar: AppBar(title: const Text('Szókereső')),
      floatingActionButton: FloatingActionButton.extended(
        icon: const Icon(Icons.add),
        label: const Text('Saját szó'),
        onPressed: () async {
          await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const CustomWordScreen()));
          await _search();
        },
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: TextField(
              controller: _query,
              onChanged: _onQueryChanged,
              decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Keresés németül vagy magyarul'),
            ),
          ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(children: [
              for (final level in cefrLevels)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: ChoiceChip(
                    label: Text(level),
                    selected: _level == level,
                    onSelected: (on) {
                      setState(() => _level = on ? level : null);
                      unawaited(_search());
                    },
                  ),
                ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: FilterChip(
                  label: const Text('Saját'),
                  selected: _customOnly,
                  onSelected: (on) {
                    setState(() => _customOnly = on);
                    unawaited(_search());
                  },
                ),
              ),
              if (_categories.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: DropdownButton<String?>(
                    value: _category,
                    hint: const Text('Kategória'),
                    items: [
                      const DropdownMenuItem<String?>(child: Text('Minden kategória')),
                      for (final c in _categories) DropdownMenuItem(value: c.slug, child: Text(c.nameHu)),
                    ],
                    onChanged: (v) {
                      setState(() => _category = v);
                      unawaited(_search());
                    },
                  ),
                ),
            ]),
          ),
          Expanded(
            child: results == null
                ? const Center(child: CircularProgressIndicator())
                : results.isEmpty
                    ? const Center(child: Text('Nincs találat.'))
                    : ListView.builder(
                        itemCount: results.length,
                        itemBuilder: (_, i) => _WordTile(entry: results[i], onChanged: _search),
                      ),
          ),
        ],
      ),
    );
  }
}

class _WordTile extends ConsumerWidget {
  const _WordTile({required this.entry, required this.onChanged});

  final ({Word word, bool enrolled}) entry;
  final Future<void> Function() onChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final w = entry.word;
    return ListTile(
      title: Text(w.display),
      subtitle: Text([
        w.translations.take(3).join(', '),
        if (w.cefrLevel != null) w.cefrLevel!,
        if (w.isCustom) 'saját',
      ].join(' · ')),
      leading: IconButton(
        icon: const Icon(Icons.volume_up),
        tooltip: 'Kiejtés: ${w.display}',
        onPressed: () => ref.read(speakerProvider).speak(w.display),
      ),
      trailing: entry.enrolled
          ? const Tooltip(message: 'Már tanulod', child: Icon(Icons.check))
          : IconButton(
              icon: const Icon(Icons.add_circle_outline),
              tooltip: 'Felvétel a tanulandók közé',
              onPressed: () async {
                final created = await ref.read(studyRepositoryProvider).enrollWords([w]);
                ref.invalidate(homeSummaryProvider);
                ref.read(syncControllerProvider.notifier).scheduleSync();
                await onChanged();
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${w.display}: $created új kártya')));
                }
              },
            ),
    );
  }
}
