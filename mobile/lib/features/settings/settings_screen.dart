import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/api/api_exception.dart';
import '../../data/models/study_card.dart';
import '../../data/models/user_settings.dart';
import '../../providers.dart';
import '../auth/auth_controller.dart';
import '../home/home_summary_provider.dart';
import '../sync/sync_controller.dart';

const cefrLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/// Gyakori időzónák; a jelenlegi (ha más) is választható marad.
const _timeZones = [
  'Europe/Budapest',
  'Europe/Vienna',
  'Europe/Berlin',
  'Europe/Zurich',
  'Europe/London',
  'Europe/Bucharest',
  'Europe/Bratislava',
  'America/New_York',
  'America/Toronto',
  'Australia/Sydney',
];

/// Beállítások: napi keretek, időzóna, célmegtartás, katalógusszintek,
/// kártyatípusok, adatexport, fióktörlés.
class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key, required this.profile});

  final UserProfile profile;

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  late final _name = TextEditingController(text: widget.profile.displayName ?? '');
  late String _timezone = widget.profile.timezone;
  late double _newLimit = widget.profile.dailyNewCardsLimit.toDouble();
  late double _reviewLimit = widget.profile.dailyReviewLimit.toDouble();
  late double _retention = widget.profile.targetRetention;
  late final Set<String> _levels = {...widget.profile.catalogLevels};
  Set<CardType>? _types;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    ref.read(studyRepositoryProvider).preferredCardTypes().then((t) {
      if (mounted) setState(() => _types = t);
    });
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Beállítások'),
        actions: [
          TextButton(onPressed: _saving ? null : _save, child: const Text('Mentés')),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(controller: _name, decoration: const InputDecoration(labelText: 'Megjelenített név')),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: _timezone,
            decoration: const InputDecoration(labelText: 'Időzóna (a „mai nap” határa)'),
            items: [
              for (final tz in {..._timeZones, _timezone}) DropdownMenuItem(value: tz, child: Text(tz)),
            ],
            onChanged: (v) => setState(() => _timezone = v ?? _timezone),
          ),
          const SizedBox(height: 24),
          Text('Napi új kártyák: ${_newLimit.round()}', style: theme.textTheme.titleSmall),
          Slider(
            value: _newLimit,
            max: 100,
            divisions: 20,
            label: '${_newLimit.round()}',
            onChanged: (v) => setState(() => _newLimit = v),
          ),
          Text('Napi ismétlések felső határa: ${_reviewLimit.round()}', style: theme.textTheme.titleSmall),
          Slider(
            value: _reviewLimit,
            max: 1000,
            divisions: 40,
            label: '${_reviewLimit.round()}',
            onChanged: (v) => setState(() => _reviewLimit = v),
          ),
          Text('Célmegtartás: ${(_retention * 100).round()}%', style: theme.textTheme.titleSmall),
          Slider(
            value: _retention,
            min: 0.7,
            max: 0.97,
            divisions: 27,
            label: '${(_retention * 100).round()}%',
            onChanged: (v) => setState(() => _retention = (v * 100).round() / 100),
          ),
          Text(
            'Magasabb érték: gyakoribb ismétlés, kevesebb felejtés. 90% a kiegyensúlyozott alapérték.',
            style: theme.textTheme.bodySmall,
          ),
          const SizedBox(height: 24),
          Text('Letöltött szókincs szintjei', style: theme.textTheme.titleSmall),
          Text('Ha egyet sem választasz, minden szint letöltődik.', style: theme.textTheme.bodySmall),
          Wrap(spacing: 8, children: [
            for (final level in cefrLevels)
              FilterChip(
                label: Text(level),
                selected: _levels.contains(level),
                onSelected: (on) => setState(() => on ? _levels.add(level) : _levels.remove(level)),
              ),
          ]),
          const SizedBox(height: 24),
          Text('Új szavaknál létrehozott kártyák', style: theme.textTheme.titleSmall),
          if (_types == null)
            const LinearProgressIndicator()
          else
            for (final type in CardType.values)
              CheckboxListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                title: Text(type.label),
                value: _types!.contains(type),
                onChanged: type == CardType.recognition
                    ? null // a felismerés kártya mindig készül
                    : (on) => setState(() => on == true ? _types!.add(type) : _types!.remove(type)),
              ),
          const Divider(height: 40),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.download),
            title: const Text('Adataim exportálása'),
            subtitle: const Text('Minden adatod JSON fájlban'),
            onTap: _export,
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(Icons.delete_forever, color: theme.colorScheme.error),
            title: Text('Fiók törlése', style: TextStyle(color: theme.colorScheme.error)),
            subtitle: const Text('Végleges, nem vonható vissza'),
            onTap: _deleteAccount,
          ),
        ],
      ),
    );
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      if (_types != null) await ref.read(studyRepositoryProvider).setPreferredCardTypes({..._types!, CardType.recognition});
      final name = _name.text.trim();
      final result = await ref.read(settingsRepositoryProvider).update(
            current: widget.profile,
            displayName: name.isEmpty ? null : name,
            timezone: _timezone,
            dailyNewCardsLimit: _newLimit.round(),
            dailyReviewLimit: _reviewLimit.round(),
            targetRetention: _retention,
            catalogLevels: [for (final l in cefrLevels) if (_levels.contains(l)) l],
          );
      ref.read(authControllerProvider.notifier).updateProfile(result.profile);
      ref.invalidate(homeSummaryProvider);
      if (result.resyncNeeded) await ref.read(syncControllerProvider.notifier).syncNow();
      messenger.showSnackBar(const SnackBar(content: Text('Beállítások mentve')));
      if (mounted) Navigator.of(context).pop();
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('Mentés sikertelen: ${e.message}')));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _export() async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      final json = await ref.read(settingsRepositoryProvider).exportJson();
      await SharePlus.instance.share(ShareParams(
        files: [XFile.fromData(utf8.encode(json), mimeType: 'application/json')],
        fileNameOverrides: const ['szokartya-export.json'],
        subject: 'Szókártya adatexport',
      ));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('Az exporthoz kapcsolat kell: ${e.message}')));
    }
  }

  Future<void> _deleteAccount() async {
    final password = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Fiók végleges törlése'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Minden kártyád, értékelésed és saját szavad törlődik a szerverről és erről az eszközről.'),
            TextField(
              controller: password,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Jelszó a megerősítéshez'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Mégse')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Törlés')),
        ],
      ),
    );
    final value = password.text;
    password.dispose();
    if (confirmed != true || !mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    try {
      await ref.read(authControllerProvider.notifier).deleteAccount(value);
      navigator.popUntil((r) => r.isFirst);
    } on UnauthorizedException {
      messenger.showSnackBar(const SnackBar(content: Text('Hibás jelszó.')));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('A törlés nem sikerült: ${e.message}')));
    }
  }
}
