import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 16) {
    throw new Error(
      'ADMIN_EMAIL and ADMIN_PASSWORD (at least 16 characters) are required',
    );
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: Role.ADMIN,
      isActive: true,
      firstName: process.env.ADMIN_FIRST_NAME || 'Admin',
    },
    select: { email: true, role: true },
  });
  console.log('Administrator created:', admin.email);
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : 'Administrator creation failed',
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
