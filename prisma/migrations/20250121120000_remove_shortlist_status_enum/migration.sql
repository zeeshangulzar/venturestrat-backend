DO $$ BEGIN
    -- Only attempt to alter if table exists
    IF EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'Shortlist'
          AND n.nspname = 'public'
    ) THEN
        ALTER TABLE "Shortlist" ALTER COLUMN "status" DROP DEFAULT;
        ALTER TABLE "Shortlist" ALTER COLUMN "status" TYPE TEXT;
        ALTER TABLE "Shortlist" ALTER COLUMN "status" SET DEFAULT 'TARGET';
    ELSE
        RAISE NOTICE 'Shortlist table does not exist, skipping ALTER.';
    END IF;
END $$;

-- Drop enum safely
DROP TYPE IF EXISTS "ShortlistStatus";
