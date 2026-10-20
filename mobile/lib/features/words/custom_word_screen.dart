import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/custom_word_input.dart';
import '../../providers.dart';
import '../home/home_summary_provider.dart';
import '../settings/settings_screen.dart' show cefrLevels;
import '../sync/sync_controller.dart';

const _partsOfSpeech = {
  'NOUN': 'Főnév',
  'VERB': 'Ige',
  'ADJECTIVE': 'Melléknév',
  'ADVERB': 'Határozószó',
  'PHRASE': 'Kifejezés',
  'OTHER': 'Egyéb',
};

/// Saját szó felvétele (offline is): a szó és kártyái azonnal tanulhatók,
/// a szerverre a következő szinkronnál kerülnek fel.
class CustomWordScreen extends ConsumerStatefulWidget {
  const CustomWordScreen({super.key});

  @override
  ConsumerState<CustomWordScreen> createState() => _CustomWordScreenState();
}

class _CustomWordScreenState extends ConsumerState<CustomWordScreen> {
  final _lemma = TextEditingController();
  final _translations = TextEditingController();
  final _plural = TextEditingController();
  final _present = TextEditingController();
  final _preterite = TextEditingController();
  final _participle = TextEditingController();
  final _example = TextEditingController();
  final _exampleHu = TextEditingController();
  String _pos = 'NOUN';
  String? _gender = 'MASCULINE';
  String? _level;
  String _auxiliary = 'HABEN';
  String? _error;
  bool _saving = false;

  @override
  void dispose() {
    for (final c in [_lemma, _translations, _plural, _present, _preterite, _participle, _example, _exampleHu]) {
      c.dispose();
    }
    super.dispose();
  }

  CustomWordInput get _input => CustomWordInput(
        lemma: _lemma.text,
        partOfSpeech: _pos,
        translations: _translations.text.split(RegExp('[,;]')),
        cefrLevel: _level,
        gender: _pos == 'NOUN' ? _gender : null,
        pluralForm: _pos == 'NOUN' ? _blank(_plural) : null,
        present3sg: _pos == 'VERB' ? _blank(_present) : null,
        preterite3sg: _pos == 'VERB' ? _blank(_preterite) : null,
        pastParticiple: _pos == 'VERB' ? _blank(_participle) : null,
        auxiliary: _auxiliary,
        exampleSentence: _blank(_example),
        exampleTranslation: _blank(_exampleHu),
      );

  static String? _blank(TextEditingController c) => c.text.trim().isEmpty ? null : c.text.trim();

  Future<void> _save() async {
    final input = _input;
    final error = input.validate();
    if (error != null) {
      setState(() => _error = error);
      return;
    }
    setState(() {
      _error = null;
      _saving = true;
    });
    final word = await ref.read(studyRepositoryProvider).addCustomWord(input);
    ref.invalidate(homeSummaryProvider);
    ref.read(syncControllerProvider.notifier).scheduleSync();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${word.display} felvéve')));
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Új saját szó')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          DropdownButtonFormField<String>(
            initialValue: _pos,
            decoration: const InputDecoration(labelText: 'Szófaj'),
            items: [for (final e in _partsOfSpeech.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
            onChanged: (v) => setState(() => _pos = v ?? _pos),
          ),
          if (_pos == 'NOUN')
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: SegmentedButton<String?>(
                segments: const [
                  ButtonSegment(value: 'MASCULINE', label: Text('der')),
                  ButtonSegment(value: 'FEMININE', label: Text('die')),
                  ButtonSegment(value: 'NEUTER', label: Text('das')),
                ],
                selected: {_gender},
                onSelectionChanged: (s) => setState(() => _gender = s.first),
              ),
            ),
          TextField(
            key: const Key('lemma'),
            controller: _lemma,
            autocorrect: false,
            decoration: InputDecoration(labelText: _pos == 'VERB' ? 'Főnévi igenév (pl. fahren)' : 'Német alak (névelő nélkül)'),
          ),
          TextField(
            key: const Key('translations'),
            controller: _translations,
            decoration: const InputDecoration(labelText: 'Fordítás(ok), vesszővel elválasztva'),
          ),
          if (_pos == 'NOUN')
            TextField(
              controller: _plural,
              autocorrect: false,
              decoration: const InputDecoration(labelText: 'Többes szám (névelő nélkül, üres = nincs)'),
            ),
          if (_pos == 'VERB') ...[
            TextField(controller: _present, autocorrect: false, decoration: const InputDecoration(labelText: 'E/3 jelen (er fährt)')),
            TextField(controller: _preterite, autocorrect: false, decoration: const InputDecoration(labelText: 'E/3 Präteritum (er fuhr)')),
            TextField(controller: _participle, autocorrect: false, decoration: const InputDecoration(labelText: 'Partizip II (gefahren)')),
            const SizedBox(height: 12),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'HABEN', label: Text('hat')),
                ButtonSegment(value: 'SEIN', label: Text('ist')),
                ButtonSegment(value: 'BOTH', label: Text('hat/ist')),
              ],
              selected: {_auxiliary},
              onSelectionChanged: (s) => setState(() => _auxiliary = s.first),
            ),
          ],
          DropdownButtonFormField<String?>(
            initialValue: _level,
            decoration: const InputDecoration(labelText: 'Szint (nem kötelező)'),
            items: [
              const DropdownMenuItem<String?>(child: Text('–')),
              for (final l in cefrLevels) DropdownMenuItem(value: l, child: Text(l)),
            ],
            onChanged: (v) => setState(() => _level = v),
          ),
          TextField(controller: _example, decoration: const InputDecoration(labelText: 'Példamondat (nem kötelező)')),
          TextField(controller: _exampleHu, decoration: const InputDecoration(labelText: 'A példamondat fordítása')),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ),
          const SizedBox(height: 24),
          FilledButton(onPressed: _saving ? null : _save, child: const Text('Mentés és tanulás')),
        ],
      ),
    );
  }
}
