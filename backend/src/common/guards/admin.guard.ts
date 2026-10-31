import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequest } from '../decorators/current-user.decorator';

/**
 * Csak ADMIN szerepkörű felhasználót enged tovább (a globális JwtAuthGuard után fut).
 *
 * A szerepkört minden kérésnél az adatbázisból olvassuk, nem az access tokenből:
 * így egy jogosultság visszavonása azonnal érvényes, nem csak a token
 * lejártakor. Az admin végpontok forgalma kicsi, a plusz lekérdezés elhanyagolható.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.user?.id;
    if (!userId) {
      throw new ForbiddenException('Adminisztrátori jogosultság szükséges');
    }
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null }, select: { role: true } });
    if (user?.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Adminisztrátori jogosultság szükséges');
    }
    return true;
  }
}
