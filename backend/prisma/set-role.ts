/**
 * Szerepkör beállítása e-mail cím alapján (az első admin kinevezéséhez is).
 *
 *   npm run user:role -- <email> [ADMIN|USER]     (alapértelmezés: ADMIN)
 *
 * Szándékosan nem API-végpont: az első adminnak nincs kitől jogot kapnia, és
 * a jogosultságadás így csak szerver-hozzáféréssel lehetséges.
 */
import { PrismaClient, UserRole } from '@prisma/client';

async function main(): Promise<void> {
  const [email, rawRole = UserRole.ADMIN] = process.argv.slice(2);
  const role = rawRole.toUpperCase() as UserRole;
  if (!email || !Object.values(UserRole).includes(role)) {
    console.error('Használat: npm run user:role -- <email> [ADMIN|USER]');
    process.exit(2);
  }
  const prisma = new PrismaClient();
  try {
    const { count } = await prisma.user.updateMany({ where: { email, deletedAt: null }, data: { role } });
    if (count === 0) {
      console.error(`Nincs ilyen felhasználó: ${email} (előbb regisztráljon az appban).`);
      process.exit(1);
    }
    console.log(`${email} szerepköre: ${role}`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
