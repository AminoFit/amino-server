-- Foods the meal agent had to estimate because no catalogue, USDA or cited web
-- source existed. Kept distinct from sourced data and never marked verified.
ALTER TYPE public."FoodInfoSource" ADD VALUE IF NOT EXISTS 'AgentEstimate';
