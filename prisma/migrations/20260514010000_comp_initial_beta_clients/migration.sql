-- One-time data migration. Marks the original 8 beta clients as
-- subscriptionStatus="comped" so they bypass the paywall for life.
-- They built this with Sean and never paid retail; they never will.
--
-- Idempotent: re-running just re-sets the same value. The migration
-- system also won't apply this twice — once prisma_migrations records
-- it, it's done.
--
-- Sean (sean@highprofileconsultancy.com) is intentionally EXCLUDED —
-- that's the test subscriber account currently on a trial; leaving it
-- in trial state preserves the ability to test cancel/renew flows.

UPDATE "User"
SET "subscriptionStatus" = 'comped'
WHERE "role" = 'CLIENT'
  AND "email" IN (
    'stargaze.tiktokshop@gmail.com',
    'ivorykeyz1908@gmail.com',
    'drbatten44@gmail.com',
    'm20094615@gmail.com',
    'williamsmt08@gmail.com',
    'monicamcdaniel00@gmail.com',
    'seanwilliams0324@gmail.com',
    'mrstraceycarterwilliams@gmail.com'
  );
