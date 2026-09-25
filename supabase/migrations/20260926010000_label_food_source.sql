-- Foods created from the nutrition label in a user's photo.
ALTER TYPE public."FoodInfoSource" ADD VALUE IF NOT EXISTS 'Label';
