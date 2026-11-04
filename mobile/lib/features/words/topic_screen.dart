import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/word.dart';
import '../../domain/word_scope.dart';
import '../../providers.dart';
import '../home/home_summary_provider.dart';
import '../study/study_screen.dart';
import '../study/study_session_controller.dart';

/// Egy témakör szavai listában, és a témakör leckéjének indítása.
///
/// A lecke ugyanúgy értékel és naplóz, mint a napi lecke (ugyanaz az ütemező,
/// ugyanaz a napló), így az eredményei a statisztikába is ugyanúgy beszámítanak.
class TopicScreen extends ConsumerStatefulWidget {
  const TopicScreen({super.key, required this.scope});

  final TopicScope scope;

  @override
  ConsumerState<TopicScreen> createState() => _TopicScreenState();
}

class _TopicScreenState extends ConsumerState<TopicScreen> {
  List<({Word word, bool enrolled})>? _words;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final words = await ref.read(studyRepositoryProvider).searchWords(scope: widget.scope, limit: 5000);
    if (mounted) setState(() => _words = words);
  }

  Future<void> _start({required bool endless}) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => StudyScreen(args: StudySessionArgs(scope: widget.scope, endless: endless)),
    ));
    ref.invalidate(homeSummaryProvider);
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final words = _words;
    final canStart = words != null && words.isNotEmpty;
    return Scaffold(
      appBar: AppBar(title: Text(widget.scope.title)),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (words != null)
                  Text(
                    '${words.length} szó, ebből ${words.where((w) => w.enrolled).length} már tanulás alatt',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                const SizedBox(height: 8),
                FilledButton.icon(
                  key: const Key('startTopicLesson'),
                  icon: const Icon(Icons.play_arrow),
                  label: const Text('Lecke indítása (20 kártya)'),
                  onPressed: canStart ? () => _start(endless: false) : null,
                ),
                const SizedBox(height: 4),
                OutlinedButton.icon(
                  icon: const Icon(Icons.all_inclusive),
                  label: const Text('Végtelen gyakorlás'),
                  onPressed: canStart ? () => _start(endless: true) : null,
                ),
              ],
            ),
          ),
          const Divider(),
          Expanded(
            child: words == null
                ? const Center(child: CircularProgressIndicator())
                : ListView.builder(
                    itemCount: words.length,
                    itemBuilder: (_, i) => _WordRow(entry: words[i]),
                  ),
          ),
        ],
      ),
    );
  }
}

class _WordRow extends StatelessWidget {
  const _WordRow({required this.entry});

  final ({Word word, bool enrolled}) entry;

  @override
  Widget build(BuildContext context) => ListTile(
        dense: true,
        title: Text(entry.word.display),
        subtitle: Text(entry.word.translations.take(3).join(', ')),
        trailing: entry.enrolled ? const Tooltip(message: 'Már tanulod', child: Icon(Icons.check, size: 18)) : null,
      );
}
