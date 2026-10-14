import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** A hitelesített felhasználó adatai, ahogy az access tokenből kiolvasható. */
export interface AuthenticatedUser {
  id: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/** A JwtAuthGuard által a kéréshez csatolt felhasználó. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.user) {
    // Csak akkor fordulhat elő, ha a dekorátort @Public() végponton használják.
    throw new Error('CurrentUser használata hitelesítés nélküli végponton');
  }
  return request.user;
});
