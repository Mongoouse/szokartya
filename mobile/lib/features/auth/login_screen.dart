import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_exception.dart';
import 'auth_controller.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _name = TextEditingController();
  bool _register = false;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _name.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    final auth = ref.read(authControllerProvider.notifier);
    if (_register) {
      await auth.register(_email.text, _password.text, _name.text);
    } else {
      await auth.login(_email.text, _password.text);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final loading = auth.isLoading;
    final error = switch (auth) {
      AsyncError(:final error) => error is ApiException ? error.message : 'Váratlan hiba: $error',
      _ => null,
    };

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('Szókártya', style: Theme.of(context).textTheme.displaySmall, textAlign: TextAlign.center),
                    const SizedBox(height: 32),
                    if (_register)
                      TextFormField(
                        controller: _name,
                        decoration: const InputDecoration(labelText: 'Név (nem kötelező)'),
                        textInputAction: TextInputAction.next,
                      ),
                    TextFormField(
                      controller: _email,
                      decoration: const InputDecoration(labelText: 'E-mail cím'),
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.email],
                      textInputAction: TextInputAction.next,
                      validator: (v) => (v == null || !v.contains('@')) ? 'Adj meg érvényes e-mail címet' : null,
                    ),
                    TextFormField(
                      controller: _password,
                      decoration: const InputDecoration(labelText: 'Jelszó'),
                      obscureText: true,
                      autofillHints: [_register ? AutofillHints.newPassword : AutofillHints.password],
                      onFieldSubmitted: (_) => _submit(),
                      // A szerver szabályával egyező (NIST: hossz, nem összetétel).
                      validator: (v) => _register && (v == null || v.length < 10)
                          ? 'Legalább 10 karakter'
                          : (v == null || v.isEmpty ? 'Add meg a jelszót' : null),
                    ),
                    const SizedBox(height: 16),
                    if (error != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Text(error, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                      ),
                    FilledButton(
                      onPressed: loading ? null : _submit,
                      child: loading
                          ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2))
                          : Text(_register ? 'Regisztráció' : 'Belépés'),
                    ),
                    TextButton(
                      onPressed: loading ? null : () => setState(() => _register = !_register),
                      child: Text(_register ? 'Van már fiókom' : 'Új fiók létrehozása'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
