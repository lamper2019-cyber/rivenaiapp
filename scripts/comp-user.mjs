/**
 * One-off: comp a user (subscriptionStatus = "comped") so they bypass the
 * paywall forever — same effect as the coach "Comp" toggle. Used to comp the
 * Apple App Review demo account.
 *
 * Run:  node --env-file=.env scripts/comp-user.mjs <email>
 * (Reads DATABASE_URL from .env — never prints the connection string.)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const email = (process.argv[2] || "").trim().toLowerCase();

if (!email) {
  console.error("Usage: node --env-file=.env scripts/comp-user.mjs <email>");
  process.exit(1);
}

const before = await prisma.user.findFirst({
  where: { email },
  select: { id: true, email: true, role: true, subscriptionStatus: true },
});

if (!before) {
  console.error(`No user found for "${email}". Check the address and try again.`);
  await prisma.$disconnect();
  process.exit(1);
}

console.log("BEFORE:", before);

const after = await prisma.user.update({
  where: { id: before.id },
  data: { subscriptionStatus: "comped" },
  select: { email: true, role: true, subscriptionStatus: true },
});

console.log("AFTER: ", after);
console.log("✅ Comped. This account now bypasses the paywall permanently.");

await prisma.$disconnect();
