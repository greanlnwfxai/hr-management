import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const email = "admin@hr.local";
  const password = await bcrypt.hash("admin1234", 10);

  await prisma.user.upsert({
    where: { email },
    update: { username: "admin", password, mustChangePassword: false },
    create: {
      email,
      username: "admin",
      password,
      role: "SUPER_ADMIN",
    },
  });

  console.log(`Seed complete: admin@hr.local / username: admin`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
