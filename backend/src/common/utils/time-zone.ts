/**
 * Időzóna-számítások külső függőség nélkül (Intl API).
 *
 * A „mai nap” a felhasználó saját időzónájában értendő: egy budapesti
 * felhasználónak éjfélkor kezdődik az új nap, nem UTC szerint.
 */

/** Az adott pillanat UTC-eltolása percben a megadott időzónában (pl. +120). */
export function timeZoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

/** A helyi nap kezdete (00:00) és vége (következő nap 00:00) UTC pillanatként. */
export function localDayBounds(instant: Date, timeZone: string): { start: Date; end: Date } {
  const offset = timeZoneOffsetMinutes(instant, timeZone);
  const local = new Date(instant.getTime() + offset * 60_000);
  const midnightLocalAsUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());

  // Az éjféli eltolás eltérhet az aktuálistól (nyári időszámítás váltásának napja).
  const startGuess = new Date(midnightLocalAsUtc - offset * 60_000);
  const start = new Date(midnightLocalAsUtc - timeZoneOffsetMinutes(startGuess, timeZone) * 60_000);

  const nextMidnightLocalAsUtc = midnightLocalAsUtc + 86_400_000;
  const endGuess = new Date(nextMidnightLocalAsUtc - offset * 60_000);
  const end = new Date(nextMidnightLocalAsUtc - timeZoneOffsetMinutes(endGuess, timeZone) * 60_000);
  return { start, end };
}

/** Érvényes IANA időzóna-azonosító-e. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}
