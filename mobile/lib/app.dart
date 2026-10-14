import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'features/auth/auth_controller.dart';
import 'features/auth/login_screen.dart';
import 'features/home/home_screen.dart';

class SzokartyaApp extends StatelessWidget {
  const SzokartyaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Szókártya',
      theme: ThemeData(colorSchemeSeed: const Color(0xFF2E7D32), useMaterial3: true),
      darkTheme: ThemeData(colorSchemeSeed: const Color(0xFF2E7D32), brightness: Brightness.dark, useMaterial3: true),
      home: const _AuthGate(),
    );
  }
}

/// Bejelentkezési állapot szerinti útválasztás.
class _AuthGate extends ConsumerWidget {
  const _AuthGate();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    return switch (auth) {
      AsyncData(value: final profile?) => HomeScreen(profile: profile),
      AsyncLoading() when auth.value == null && !auth.hasError =>
        const Scaffold(body: Center(child: CircularProgressIndicator())),
      _ => const LoginScreen(),
    };
  }
}
