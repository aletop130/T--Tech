-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Full-text search configuration (use DO block to check if exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'sda_search') THEN
        CREATE TEXT SEARCH CONFIGURATION sda_search (COPY = english);
    END IF;
END
$$;
