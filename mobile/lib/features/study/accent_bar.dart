import 'package:flutter/material.dart';

const germanLetters = ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'];
const hungarianLetters = ['á', 'é', 'í', 'ó', 'ö', 'ő', 'ú', 'ü', 'ű'];

/// Ékezetes betűk gombsora a beviteli mező alatt: a kurzor helyére szúrja be a
/// betűt. Ott is működik, ahol a billentyűzet nem ad ékezetes betűt (pl. az
/// Android emulátor a számítógép billentyűzetéről, vagy angol kiosztásnál).
class AccentBar extends StatelessWidget {
  const AccentBar({super.key, required this.controller, required this.letters, this.focusNode});

  final TextEditingController controller;
  final List<String> letters;
  final FocusNode? focusNode;

  void _insert(String letter) {
    final value = controller.value;
    final sel = value.selection;
    final start = sel.isValid ? sel.start : value.text.length;
    final end = sel.isValid ? sel.end : value.text.length;
    final text = value.text.replaceRange(start, end, letter);
    controller.value = TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: start + letter.length),
    );
    focusNode?.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Wrap(
        spacing: 6,
        runSpacing: 6,
        alignment: WrapAlignment.center,
        children: [
          for (final l in letters)
            SizedBox(
              width: 40,
              height: 40,
              child: OutlinedButton(
                key: Key('accent-$l'),
                style: OutlinedButton.styleFrom(padding: EdgeInsets.zero),
                onPressed: () => _insert(l),
                child: Text(l, style: const TextStyle(fontSize: 18)),
              ),
            ),
        ],
      ),
    );
  }
}
