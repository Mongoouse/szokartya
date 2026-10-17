# Szókártya – Flutter kliens

Offline-first mobilkliens (Android, iOS). Architektúra, szinkronizáció és döntések:
[../docs/03-szinkronizacio-es-kliens.md](../docs/03-szinkronizacio-es-kliens.md).

```
lib/
  core/        API kliens (auto token-frissítés), token tároló, konfiguráció, óra
  domain/      SM-2 ütemező (a backend 1:1 megfelelője – offline ütemezéshez)
  data/        helyi SQLite (sqflite), DAO, modellek, repository-k
  sync/        szinkronizációs motor (push → pull)
  features/    auth, home, study (szókártya-állapotgép), sync – Riverpod kontrollerek + UI
  providers.dart  függőségi gráf
```

## Futtatás

```sh
flutter pub get
# Android emulátor + helyi backend (alapértelmezés: http://10.0.2.2:3000/api/v1)
flutter run
# Saját backend:
flutter run --dart-define=API_BASE_URL=https://api.example.hu/api/v1
```

## Ellenőrzés

```sh
flutter analyze
flutter test                                   # egység- és komponenstesztek
```

Többeszközös szinkron valódi backenddel:

```sh
# macOS / Linux
SZOKARTYA_E2E_API=http://localhost:3000/api/v1 flutter test --tags e2e
```

```powershell
# Windows PowerShell
$env:SZOKARTYA_E2E_API = "http://localhost:3000/api/v1"
flutter test --tags e2e
```
