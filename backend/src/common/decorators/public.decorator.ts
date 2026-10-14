import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * A globális JWT guard alól kivett végpont. Indoklás: a „deny by default”
 * minta miatt egy új végpont elfelejtett annotáció esetén is védett marad.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
