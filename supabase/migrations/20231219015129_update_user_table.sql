CREATE TYPE gender_enum AS ENUM ('male', 'female', 'other');

ALTER TABLE public."User"
ADD COLUMN gender gender_enum,
ALTER COLUMN "weightKg" TYPE numeric(10, 2) USING "weightKg"::numeric(10, 2),
ALTER COLUMN "heightCm" TYPE numeric(10, 2) USING "heightCm"::numeric(10, 2),
ADD COLUMN "manualMacroGoals" boolean NOT NULL DEFAULT false;
