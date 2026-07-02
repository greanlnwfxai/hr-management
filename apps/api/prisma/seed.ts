import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const email = "admin@hr.local";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Never touch password/mustChangePassword on an existing account — re-running
    // the seed must not revert a rotated admin password back to the default.
    console.log(`Seed complete: admin@hr.local already exists, credentials unchanged`);
    return;
  }

  const password = await bcrypt.hash("admin1234", 10);
  await prisma.user.create({
    data: {
      email,
      username: "admin",
      password,
      role: "SUPER_ADMIN",
    },
  });

  console.log(`Seed complete: admin@hr.local / username: admin (default seed password — rotate before production use)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
