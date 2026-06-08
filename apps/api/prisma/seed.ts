import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const email = "admin@hr.local";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Seed skipped — user "${email}" already exists.`);
    return;
  }

  const password = await bcrypt.hash("admin1234", 10);

  const user = await prisma.user.create({
    data: {
      email,
      password,
      role: "SUPER_ADMIN",
    },
  });

  console.log(`Super admin created: ${user.email} (id: ${user.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
