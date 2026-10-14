import { isValidTimeZone, localDayBounds, timeZoneOffsetMinutes } from './time-zone';

const H = 3_600_000;

describe('időzóna-segédfüggvények', () => {
  it('UTC-eltolás: Budapest télen +60, nyáron +120 perc', () => {
    expect(timeZoneOffsetMinutes(new Date('2026-01-15T12:00:00Z'), 'Europe/Budapest')).toBe(60);
    expect(timeZoneOffsetMinutes(new Date('2026-07-15T12:00:00Z'), 'Europe/Budapest')).toBe(120);
  });

  it('normál nap: 24 óra, helyi éjféltől helyi éjfélig', () => {
    const { start, end } = localDayBounds(new Date('2026-01-15T12:00:00Z'), 'Europe/Budapest');
    expect(start.toISOString()).toBe('2026-01-14T23:00:00.000Z');
    expect(end.toISOString()).toBe('2026-01-15T23:00:00.000Z');
  });

  it('a helyi nap az UTC naptól eltérhet (Budapest, helyi 00:30 = előző napi UTC 23:30)', () => {
    const { start } = localDayBounds(new Date('2026-01-15T23:30:00Z'), 'Europe/Budapest');
    expect(start.toISOString()).toBe('2026-01-15T23:00:00.000Z');
  });

  it('nyári időszámítás kezdete (2026-03-29): 23 órás nap', () => {
    const { start, end } = localDayBounds(new Date('2026-03-29T12:00:00Z'), 'Europe/Budapest');
    expect(start.toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-29T22:00:00.000Z');
    expect(end.getTime() - start.getTime()).toBe(23 * H);
  });

  it('nyári időszámítás vége (2026-10-25): 25 órás nap', () => {
    const { start, end } = localDayBounds(new Date('2026-10-25T12:00:00Z'), 'Europe/Budapest');
    expect(start.toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-25T23:00:00.000Z');
    expect(end.getTime() - start.getTime()).toBe(25 * H);
  });

  it('negatív eltolású zóna (New York)', () => {
    const { start, end } = localDayBounds(new Date('2026-01-15T03:00:00Z'), 'America/New_York');
    expect(start.toISOString()).toBe('2026-01-14T05:00:00.000Z');
    expect(end.toISOString()).toBe('2026-01-15T05:00:00.000Z');
  });

  it('IANA-azonosító ellenőrzése', () => {
    expect(isValidTimeZone('Europe/Budapest')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});
