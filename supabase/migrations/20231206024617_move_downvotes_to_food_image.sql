alter table "public"."FoodImage" add column "downvotes" integer not null default 0;

alter table "public"."FoodItemImages" drop column "downvotes";



