/** A tesztadatbázis kapcsolata. CI-ben a TEST_DATABASE_URL környezeti változó adja meg. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://szokartya:szokartya@localhost:5432/szokartya_test?schema=public';

/**
 * Biztonsági zár: a tesztek az adatbázist törlik és újraépítik, ezért csak
 * `_test` végű nevű adatbázison futhatnak – fejlesztői vagy éles adatbázist
 * így egy elírt környezeti változó sem tud törölni.
 */
export function assertTestDatabase(url: string): void {
  const name = new URL(url).pathname.replace(/^\//, '');
  if (!name.endsWith('_test')) {
    throw new Error(`A tesztek csak "_test" végű adatbázison futhatnak (kapott: "${name}")`);
  }
}
