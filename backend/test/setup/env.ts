import { TEST_DATABASE_URL } from './test-database';

// Minden tesztfájl előtt: a NestJS konfiguráció a tesztadatbázist és rögzített titkot kap.
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.JWT_ACCESS_SECRET = 'e2e-test-secret-that-is-at-least-32-characters-long';
process.env.JWT_ACCESS_TTL_SECONDS = '900';
process.env.REFRESH_TOKEN_TTL_DAYS = '30';
// A rate limit külön tesztben, saját alkalmazáspéldánnyal kerül ellenőrzésre.
process.env.THROTTLE_ENABLED = 'false';
process.env.LOG_LEVEL = 'silent';
