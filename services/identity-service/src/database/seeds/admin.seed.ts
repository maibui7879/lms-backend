import * as argon2 from 'argon2';
import AppDataSource from '../data-source';
import { UserEntity } from '../../modules/users/entities/user.entity';

async function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL || 'admin@lms.edu.vn').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'Admin@123456';
  const displayName = (process.env.ADMIN_DISPLAY_NAME || 'System Admin').trim();

  await AppDataSource.initialize();

  try {
    const userRepo = AppDataSource.getRepository(UserEntity);
    const existing = await userRepo.findOne({ where: { email } });

    if (existing) {
      if (existing.role !== 'ADMIN') {
        existing.role = 'ADMIN';
        existing.status = 'ACTIVE';
        existing.emailVerifiedAt = existing.emailVerifiedAt ?? new Date();
        await userRepo.save(existing);
        console.log(`[Seed] Updated existing user "${email}" to ADMIN.`);
      } else {
        console.log(`[Seed] Admin "${email}" already exists. Skipping.`);
      }
      return;
    }

    const passwordHash = await argon2.hash(password);
    const admin = userRepo.create({
      email,
      passwordHash,
      displayName,
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    });

    await userRepo.save(admin);
    console.log(`[Seed] Created default ADMIN account: ${email}`);
  } finally {
    await AppDataSource.destroy();
  }
}

seedAdmin().catch((err) => {
  console.error('[Seed] Failed to seed admin:', err);
  process.exit(1);
});