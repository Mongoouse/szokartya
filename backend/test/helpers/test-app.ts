import { INestApplication } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import TestAgent from 'supertest/lib/agent';
import { configureApp } from '../../src/app.factory';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

export const PASSWORD = 'helyes-lo-elem-tuzgolyo';

export interface TestApp {
  app: INestApplication;
  http: TestAgent;
  prisma: PrismaService;
  close: () => Promise<void>;
}

/**
 * A valódi AppModule-ból épített alkalmazás, ugyanazzal a pipeline-nal
 * (validáció, globális guardok, prefix), mint élesben.
 */
export async function createTestApp(customize?: (b: TestingModuleBuilder) => TestingModuleBuilder): Promise<TestApp> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (customize) builder = customize(builder);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ logger: ['error'] });
  configureApp(app);
  await app.init();
  return {
    app,
    http: request(app.getHttpServer()),
    prisma: app.get(PrismaService),
    close: () => app.close(),
  };
}

/** Minden felhasználói adat törlése (a központi szókatalógus marad). */
export async function resetUserData(prisma: PrismaClient): Promise<void> {
  // Kaszkád: refresh_tokens, user_progress, review_logs, saját szavak.
  await prisma.user.deleteMany();
}

export interface RegisteredUser {
  id: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  auth: { Authorization: string };
}

export async function registerUser(http: TestAgent, email = `user-${randomUUID()}@example.hu`): Promise<RegisteredUser> {
  const res = await http.post('/api/v1/auth/register').send({ email, password: PASSWORD }).expect(201);
  const body = res.body as { accessToken: string; refreshToken: string; user: { id: string; email: string } };
  return {
    id: body.user.id,
    email: body.user.email,
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    auth: { Authorization: `Bearer ${body.accessToken}` },
  };
}

/** Szó azonosítója lemma alapján a központi szótárból. */
export async function wordId(prisma: PrismaClient, lemma: string, homographNo = 1): Promise<string> {
  const word = await prisma.word.findFirstOrThrow({ where: { lemma, homographNo, ownerId: null } });
  return word.id;
}

export const uuid = (): string => randomUUID();
