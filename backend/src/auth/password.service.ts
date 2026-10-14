import { Injectable, OnModuleInit } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Jelszó-hashelés argon2id-vel.
 *
 * Indoklás: az argon2id memóriaigényes (GPU/ASIC elleni védelem), és az OWASP
 * ajánlott első választása. Paraméterek: 19 MiB memória, 2 iteráció, 1 szál –
 * az OWASP Password Storage Cheat Sheet minimális ajánlása (~30–50 ms/hash).
 * A PHC formátumú hash tartalmazza a paramétereket, így később szigorítható.
 */
@Injectable()
export class PasswordService implements OnModuleInit {
  private static readonly OPTIONS: argon2.HashOptions & { raw?: false } = {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  };

  /** Nem létező felhasználónál is futtatott hash: kiegyenlíti a válaszidőt. */
  private dummyHash = '';

  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.hash('timing-attack-mitigation-placeholder');
  }

  hash(plain: string): Promise<string> {
    return argon2.hash(plain, PasswordService.OPTIONS);
  }

  /** Igaz, ha a hash régebbi (gyengébb) paraméterekkel készült – belépéskor újrahashelendő. */
  needsRehash(hash: string): boolean {
    const { memoryCost, timeCost, parallelism } = PasswordService.OPTIONS;
    return argon2.needsRehash(hash, { memoryCost, timeCost, parallelism });
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  /**
   * Felhasználó-felsorolás (user enumeration) elleni védelem: ha az e-mail nem
   * létezik, ugyanannyi ideig dolgozunk, mintha hibás lenne a jelszó.
   */
  async verifyAgainstDummy(plain: string): Promise<false> {
    await this.verify(this.dummyHash, plain);
    return false;
  }
}
