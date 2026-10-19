import 'package:flutter_tts/flutter_tts.dart';

/// Német kiejtés felolvasása. Interfész mögött, hogy tesztben kicserélhető legyen.
abstract interface class Speaker {
  Future<void> speak(String text);
}

/// Az eszköz beépített szövegfelolvasója (Android: TextToSpeech, iOS: AVSpeechSynthesizer).
class DeviceSpeaker implements Speaker {
  DeviceSpeaker() : _tts = FlutterTts();

  final FlutterTts _tts;
  bool _configured = false;

  @override
  Future<void> speak(String text) async {
    try {
      if (!_configured) {
        await _tts.setLanguage('de-DE');
        await _tts.setSpeechRate(0.45);
        _configured = true;
      }
      await _tts.stop();
      await _tts.speak(text);
    } on Exception {
      // Nincs német hang telepítve / nem támogatott platform: csendben kihagyjuk.
    }
  }
}
