alter table "public"."UserMessageImages" drop constraint "usermessageimages_messageid_fkey";

alter table "public"."UserMessageImages" alter column "messageId" drop not null;

alter table "public"."UserMessageImages" add constraint "UserMessageImages_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"(id) not valid;

alter table "public"."UserMessageImages" validate constraint "UserMessageImages_messageId_fkey";


