# Szókártya – Flutter kliens

Offline-first kliens: Android, iOS és böngésző (Flutter web). Architektúra, szinkronizáció és döntések:
[../docs/03-szinkronizacio-es-kliens.md](../docs/03-szinkronizacio-es-kliens.md).

```
lib/
  core/        API kliens (auto token-frissítés), token tároló, konfiguráció, óra (profil-időzóna), kiejtés (TTS)
  domain/      SM-2 ütemező (a backend 1:1 megfelelője – offline ütemezéshez), gépelt válasz ellenőrzése
  data/        helyi SQLite (mobilon sqflite, böngészőben sqflite_common_ffi_web), DAO, modellek, repository-k
  sync/        szinkronizációs motor (push → pull)
  features/    auth, home, study (szókártya-állapotgép), stats, settings, words (szókereső, saját szó), sync
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

## Böngészős változat (Flutter web)

Ugyanaz a kód fut böngészőben is; a tanulás, a szinkron és az offline működés megegyezik a mobilossal.

```sh
# Fejlesztés: Chrome (vagy Edge: -d edge), fix porton, mert a backend CORS csak az engedélyezett originről fogad kérést
flutter run -d chrome --web-port 8080

# Saját backend:
flutter run -d chrome --web-port 8080 --dart-define=API_BASE_URL=https://api.example.hu/api/v1

# Éles build (statikus fájlok a build/web mappában, bármely webszerverrel kiszolgálható):
flutter build web --release --dart-define=API_BASE_URL=https://api.example.hu/api/v1
```

- **API cím:** böngészőben az alapértelmezés `http://localhost:3000/api/v1` (mobilon `10.0.2.2`).
- **CORS:** a backend `.env` fájljában a `CORS_ORIGINS` sorolja fel a webes kliens címét
  (alapértelmezés: `http://localhost:8080`; több cím vesszővel). E nélkül a böngésző blokkolja a kéréseket,
  és az app „Nincs hálózati kapcsolat” hibát mutat.
- **Helyi tárolás:** az SQLite WebAssemblyben fut (`web/sqlite3.wasm`, `web/sqflite_sw.js` – a
  `dart run sqflite_common_ffi_web:setup` állítja elő őket, verziózva vannak), az adatok az IndexedDB-be
  kerülnek. A tokeneket a `flutter_secure_storage` webes megvalósítása titkosítva tárolja (WebCrypto,
  ezért élesben HTTPS kell; a `localhost` kivétel).
- **Korlát:** a böngésző helyi adatai törlődhetnek (böngészési adatok törlése, privát ablak, a
  `flutter run` minden indításkor új Chrome-profilt használ). Ilyenkor csak a még **nem szinkronizált**
  helyi módosítások vesznek el; belépés után a szinkron visszahozza a szerveren lévő haladást.
- Kiejtés: a böngésző beépített felolvasója (Web Speech API); adatexport: megosztás vagy letöltés.

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
