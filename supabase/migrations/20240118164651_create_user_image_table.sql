create sequence "public"."UserMessageImages_id_seq";

create table "public"."UserMessageImages" (
    "id" integer not null default nextval('"UserMessageImages_id_seq"'::regclass),
    "userId" uuid not null,
    "messageId" integer not null,
    "imagePath" text not null,
    "uploadedAt" timestamp without time zone default CURRENT_TIMESTAMP
);


alter table "public"."Message" add column "hasimages" boolean not null default false;

alter sequence "public"."UserMessageImages_id_seq" owned by "public"."UserMessageImages"."id";

CREATE UNIQUE INDEX "UserMessageImages_pkey" ON public."UserMessageImages" USING btree (id);

alter table "public"."UserMessageImages" add constraint "UserMessageImages_pkey" PRIMARY KEY using index "UserMessageImages_pkey";

alter table "public"."UserMessageImages" add constraint "usermessageimages_messageid_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"(id) not valid;

alter table "public"."UserMessageImages" validate constraint "usermessageimages_messageid_fkey";

alter table "public"."UserMessageImages" add constraint "usermessageimages_userid_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) not valid;

alter table "public"."UserMessageImages" validate constraint "usermessageimages_userid_fkey";


