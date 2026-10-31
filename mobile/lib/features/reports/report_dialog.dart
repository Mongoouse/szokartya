import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/study_card.dart';
import '../../data/models/word.dart';
import '../../data/repositories/report_repository.dart';
import '../../providers.dart';
import '../sync/sync_controller.dart';

/// Hibabejelentés egy szóról: típus + szabad szöveg. Offline is működik – a
/// bejelentés a kimenő sorba kerül, és a következő szinkronnal megy fel.
///
/// @returns true, ha a bejelentés rögzült.
Future<bool> showReportDialog(BuildContext context, WidgetRef ref, {required Word word, CardType? cardType}) async {
  final saved = await showDialog<bool>(
    context: context,
    builder: (_) => ReportDialog(word: word, cardType: cardType),
  );
  if (saved == true && context.mounted) {
    ref.read(syncControllerProvider.notifier).scheduleSync();
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Köszönjük! A bejelentést a következő szinkronnál elküldjük.')),
    );
  }
  return saved == true;
}

class ReportDialog extends ConsumerStatefulWidget {
  const ReportDialog({super.key, required this.word, this.cardType});

  final Word word;
  final CardType? cardType;

  @override
  ConsumerState<ReportDialog> createState() => _ReportDialogState();
}

class _ReportDialogState extends ConsumerState<ReportDialog> {
  final _message = TextEditingController();
  var _category = ReportCategory.translation;
  var _saving = false;
  String? _error;

  @override
  void dispose() {
    _message.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_message.text.trim().isEmpty) {
      setState(() => _error = 'Írd le röviden, mi a hiba.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(reportRepositoryProvider).report(
            wordId: widget.word.id,
            category: _category,
            message: _message.text,
            cardType: widget.cardType,
          );
      if (mounted) Navigator.of(context).pop(true);
    } on Object catch (e) {
      setState(() {
        _saving = false;
        _error = 'Nem sikerült menteni: $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('Hiba bejelentése: ${widget.word.display}'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(widget.word.translations.join(', '), style: Theme.of(context).textTheme.bodyMedium),
            const SizedBox(height: 16),
            DropdownButtonFormField<ReportCategory>(
              key: const Key('reportCategory'),
              initialValue: _category,
              decoration: const InputDecoration(labelText: 'Mi a hiba?'),
              items: [
                for (final c in ReportCategory.values) DropdownMenuItem(value: c, child: Text(c.label)),
              ],
              onChanged: _saving ? null : (c) => setState(() => _category = c ?? _category),
            ),
            const SizedBox(height: 12),
            TextField(
              key: const Key('reportMessage'),
              controller: _message,
              enabled: !_saving,
              autofocus: true,
              minLines: 3,
              maxLines: 6,
              maxLength: ReportRepository.maxMessageLength,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(
                labelText: 'Leírás',
                hintText: 'Pl.: a „Museum” jelentése nem „könyvtár”, hanem „múzeum”.',
                errorText: _error,
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: _saving ? null : () => Navigator.of(context).pop(false), child: const Text('Mégse')),
        FilledButton(onPressed: _saving ? null : _submit, child: const Text('Küldés')),
      ],
    );
  }
}
