import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { DbClient, PrismaService } from '../prisma/prisma.service';

export interface CreateUserData {
  email: string;
  passwordHash: string;
  displayName?: string | null;
  timezone?: string;
}

/** A `users` tábla adatelérési rétege. Törölt (soft delete) fiókokat nem ad vissza. */
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveByEmail(email: string, db: DbClient = this.prisma): Promise<User | null> {
    // Az e-mail oszlop citext, így az összehasonlítás kis-/nagybetű-független.
    return db.user.findFirst({ where: { email, deletedAt: null } });
  }

  findActiveById(id: string, db: DbClient = this.prisma): Promise<User | null> {
    return db.user.findFirst({ where: { id, deletedAt: null } });
  }

  create(data: CreateUserData, db: DbClient = this.prisma): Promise<User> {
    return db.user.create({ data });
  }

  updatePasswordHash(id: string, passwordHash: string, db: DbClient = this.prisma): Promise<User> {
    return db.user.update({ where: { id }, data: { passwordHash } });
  }

  update(
    id: string,
    data: Partial<Pick<User, 'displayName' | 'timezone' | 'dailyNewCardsLimit' | 'dailyReviewLimit'>>,
    db: DbClient = this.prisma,
  ): Promise<User> {
    return db.user.update({ where: { id }, data });
  }
}
