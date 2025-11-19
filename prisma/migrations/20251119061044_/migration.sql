/*
  Safe migration:
  - Does NOT drop the column blindly
  - Does NOT recreate the column
  - Avoids data loss
  - Works on fresh DBs and existing DBs
*/

DO $$ BEGIN
    -- Check if the Shortlist table exists
    IF EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'Shortlist'
          AND n.nspname = 'public'
    ) THEN
        -- Check if the status column exists before altering
        IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'Shortlist'
              AND column_name = 'status'
        ) THEN
            -- Convert enum → TEXT safely without dropping the column
            ALTER TABLE "public"."Shortlist"
                ALTER COLUMN "status" DROP DEFAULT,
                ALTER COLUMN "status" TYPE TEXT,
                ALTER COLUMN "status" SET DEFAULT 'TARGET';
        ELSE
            RAISE NOTICE 'Column "status" does not exist on Shortlist — skipping ALTER.';
        END IF;
    ELSE
        RAISE NOTICE 'Shortlist table does not exist — skipping ALTER.';
    END IF;
END $$;

-- Safe enum drop
DROP TYPE IF EXISTS "public"."ShortlistStatus";
