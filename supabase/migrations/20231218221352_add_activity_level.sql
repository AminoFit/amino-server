-- Create the enum type
CREATE TYPE public."ActivityLevel" AS ENUM ('None', 'Light Exercise', 'Moderate Exercise', 'Very Active', 'Extremely Active');

-- Add the column with the enum type
ALTER TABLE public."User"
ADD COLUMN "activityLevel" public."ActivityLevel" NULL;
