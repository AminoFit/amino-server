-- People and sharing, phases 1-3 (2026-10-07, plan: 2026-10-07-people-and-sharing-plan.md).
--
-- People: two users link (friend, partner or trainer) only when both agree: one invites (QR code, link or email
-- request) and the other accepts. An invite only asks; every permission is granted by the person whose data it touches
-- (LinkGrant, one row per direction) and can be revoked at any time.
--
-- Sharing: an owner shares a food's lineage (all its versions, 20261015000000) with a linked person, who then sees it
-- and its later versions. FoodShare is what the owner chose; FoodAccess is what each person can see, rebuilt by
-- refresh_food_access from four sources: explicit shares, the private ingredients of shared recipes, a partner's
-- "share all my foods", and foods used in a meal someone logged for them (FoodShare reason 'log').
--
-- Losing access never breaks a diary: when access to a lineage ends (unshare, unlink, share-all off, the owner deletes
-- the food), whatever the person used (logged, favourited, cooked with) becomes their own private copy, and their
-- meals, favourites and recipes point at it. Numbers on logged rows never change.
--
-- Copy links: anyone with a link can add their own copy of a food or recipe; nothing stays linked.
--
-- Every table is written by the server only (service role). Linked people see each other's display name, nothing else.

SET TimeZone = 'UTC';

-- ---------------------------------------------------------------------------------------------------------------------
-- Tables

-- A meal someone logged into another person's diary (phase 4): who, their name then (it survives unlinking and their
-- account being deleted), and the meals one "log for several people" made together.
ALTER TABLE public."Message" ADD COLUMN IF NOT EXISTS "loggedByUserId" uuid REFERENCES public."User"(id) ON DELETE SET NULL;
ALTER TABLE public."Message" ADD COLUMN IF NOT EXISTS "loggedByName" text;
ALTER TABLE public."Message" ADD COLUMN IF NOT EXISTS "logGroupId" uuid;
CREATE INDEX IF NOT EXISTS "Message_loggedBy_idx" ON public."Message"("loggedByUserId", "userId") WHERE "loggedByUserId" IS NOT NULL;

CREATE TABLE IF NOT EXISTS public."UserLink" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userLow" uuid NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  "userHigh" uuid NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('friend', 'partner', 'trainer')),
  "trainerId" uuid,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid,
  "endedAt" timestamptz,
  "endedBy" uuid,
  CHECK ("userLow" < "userHigh"),
  CHECK ((kind = 'trainer') = ("trainerId" IS NOT NULL) AND ("trainerId" IS NULL OR "trainerId" IN ("userLow", "userHigh")))
);
CREATE UNIQUE INDEX IF NOT EXISTS "UserLink_active_pair" ON public."UserLink"("userLow", "userHigh") WHERE "endedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "UserLink_high_idx" ON public."UserLink"("userHigh") WHERE "endedAt" IS NULL;

CREATE TABLE IF NOT EXISTS public."LinkGrant" (
  "linkId" uuid NOT NULL REFERENCES public."UserLink"(id) ON DELETE CASCADE,
  "grantorId" uuid NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  "granteeId" uuid NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  "canLogForMe" boolean NOT NULL DEFAULT false,
  "shareAllFoods" boolean NOT NULL DEFAULT false,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("linkId", "grantorId")
);
CREATE INDEX IF NOT EXISTS "LinkGrant_grantee_idx" ON public."LinkGrant"("granteeId", "grantorId");

CREATE TABLE IF NOT EXISTS public."LinkInvite" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tokenHash" text UNIQUE,
  "inviterId" uuid NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  "inviteeId" uuid REFERENCES public."User"(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('friend', 'partner', 'trainer', 'client')),
  "asksToLog" boolean NOT NULL DEFAULT false,
  channel text NOT NULL CHECK (channel IN ('qr', 'link', 'email')),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "expiresAt" timestamptz NOT NULL,
  "acceptedAt" timestamptz, "acceptedBy" uuid, "declinedAt" timestamptz, "revokedAt" timestamptz, "linkId" uuid,
  CHECK ("tokenHash" IS NOT NULL OR "inviteeId" IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS "LinkInvite_inviter_idx" ON public."LinkInvite"("inviterId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "LinkInvite_invitee_idx" ON public."LinkInvite"("inviteeId") WHERE "inviteeId" IS NOT NULL;

CREATE TABLE IF NOT EXISTS public."UserBlock" (
  "blockerId" uuid NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  "blockedId" uuid NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("blockerId", "blockedId")
);

CREATE TABLE IF NOT EXISTS public."FoodShare" (
  "recipientId" uuid NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  "lineageId" integer NOT NULL,
  "ownerId" uuid NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT 'share' CHECK (reason IN ('share', 'log')),
  via text NOT NULL DEFAULT 'app' CHECK (via IN ('app', 'mcp')),
  "agentClientId" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "revokedAt" timestamptz,
  PRIMARY KEY ("recipientId", "lineageId")
);
CREATE INDEX IF NOT EXISTS "FoodShare_owner_idx" ON public."FoodShare"("ownerId", "recipientId") WHERE "revokedAt" IS NULL;

CREATE TABLE IF NOT EXISTS public."FoodAccess" (
  "recipientId" uuid NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  "lineageId" integer NOT NULL,
  "ownerId" uuid NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  "viaShare" boolean NOT NULL DEFAULT false,
  "viaRecipe" boolean NOT NULL DEFAULT false,
  "viaShareAll" boolean NOT NULL DEFAULT false,
  "grantedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "revokedAt" timestamptz,
  "hiddenAt" timestamptz,
  PRIMARY KEY ("recipientId", "lineageId")
);
CREATE INDEX IF NOT EXISTS "FoodAccess_sync_idx" ON public."FoodAccess"("recipientId", "updatedAt");
CREATE INDEX IF NOT EXISTS "FoodAccess_owner_idx" ON public."FoodAccess"("ownerId", "recipientId") WHERE "revokedAt" IS NULL;

CREATE TABLE IF NOT EXISTS public."FoodCopyLink" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tokenHash" text NOT NULL UNIQUE,
  "ownerId" uuid NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  "lineageId" integer NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "revokedAt" timestamptz,
  copies integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "FoodCopyLink_owner_idx" ON public."FoodCopyLink"("ownerId", "lineageId");

ALTER TABLE public."UserLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."LinkGrant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."LinkInvite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UserBlock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FoodShare" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FoodAccess" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FoodCopyLink" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."UserLink", public."LinkGrant", public."LinkInvite", public."UserBlock", public."FoodShare",
  public."FoodAccess", public."FoodCopyLink" FROM anon, authenticated;
-- The app reads its own access rows (to sync shared foods and follow them live). food_visible reads them under this
-- policy too, as the requesting user.
GRANT SELECT ON public."FoodAccess" TO authenticated;
DROP POLICY IF EXISTS "Read your own food access" ON public."FoodAccess";
CREATE POLICY "Read your own food access" ON public."FoodAccess" FOR SELECT USING ("recipientId" = auth.uid());

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'FoodAccess')
  THEN ALTER PUBLICATION supabase_realtime ADD TABLE public."FoodAccess"; END IF;
END $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Who can see a food: the catalogue, your own, and lineages you have access to.

CREATE OR REPLACE FUNCTION public.food_visible(p_user_id uuid, p_private_to uuid, p_lineage_id integer) RETURNS boolean
LANGUAGE sql STABLE AS $function$
  SELECT p_private_to IS NULL OR p_private_to = p_user_id OR EXISTS (
    SELECT 1 FROM public."FoodAccess" a
    WHERE a."recipientId" = p_user_id AND a."lineageId" = p_lineage_id AND a."revokedAt" IS NULL)
$function$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Small helpers

CREATE OR REPLACE FUNCTION public.active_link(p_a uuid, p_b uuid) RETURNS uuid
LANGUAGE sql STABLE SET search_path = '' AS $function$
  SELECT l.id FROM public."UserLink" l
  WHERE l."userLow" = LEAST(p_a, p_b) AND l."userHigh" = GREATEST(p_a, p_b) AND l."endedAt" IS NULL
$function$;

CREATE OR REPLACE FUNCTION public.person_name(p_user_id uuid) RETURNS text
LANGUAGE sql STABLE SET search_path = '' AS $function$
  SELECT coalesce(nullif(pg_catalog.btrim(u."displayName"), ''), nullif(pg_catalog.btrim(u."fullName"), ''))
  FROM public."User" u WHERE u.id = p_user_id
$function$;

CREATE OR REPLACE FUNCTION public.blocked_between(p_a uuid, p_b uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $function$
  SELECT EXISTS (SELECT 1 FROM public."UserBlock" b WHERE (b."blockerId" = p_a AND b."blockedId" = p_b)
    OR (b."blockerId" = p_b AND b."blockedId" = p_a))
$function$;

-- What the other person is to this user: 'partner', 'friend', 'trainer' (they train me) or 'client' (I train them).
CREATE OR REPLACE FUNCTION public.link_label(p_link public."UserLink", p_user_id uuid) RETURNS text
LANGUAGE sql IMMUTABLE AS $function$
  SELECT CASE WHEN p_link.kind <> 'trainer' THEN p_link.kind WHEN p_link."trainerId" = p_user_id THEN 'client' ELSE 'trainer' END
$function$;

-- The grant from grantor to grantee on their active link, if any.
CREATE OR REPLACE FUNCTION public.link_grant(p_grantor uuid, p_grantee uuid) RETURNS public."LinkGrant"
LANGUAGE sql STABLE SET search_path = '' AS $function$
  SELECT g.* FROM public."LinkGrant" g WHERE g."linkId" = public.active_link(p_grantor, p_grantee) AND g."grantorId" = p_grantor
$function$;

-- ---------------------------------------------------------------------------------------------------------------------
-- People

CREATE OR REPLACE FUNCTION public.people_create_invite(p_user_id uuid, p_token_hash text, p_kind text,
  p_asks_to_log boolean, p_channel text) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE invite public."LinkInvite"%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_token_hash IS NULL OR length(p_token_hash) < 32 OR p_kind NOT IN ('friend', 'partner', 'trainer', 'client')
    OR p_channel NOT IN ('qr', 'link') THEN RAISE EXCEPTION 'invalid_invite' USING ERRCODE = '22023'; END IF;
  IF public.person_name(p_user_id) IS NULL THEN RAISE EXCEPTION 'name_required' USING ERRCODE = 'P0001'; END IF;
  -- One live QR code at a time: showing a new one retires the last.
  IF p_channel = 'qr' THEN
    UPDATE public."LinkInvite" SET "revokedAt" = now()
      WHERE "inviterId" = p_user_id AND channel = 'qr' AND "acceptedAt" IS NULL AND "revokedAt" IS NULL;
  END IF;
  IF (SELECT count(*) FROM public."LinkInvite" WHERE "inviterId" = p_user_id AND "createdAt" > now() - interval '1 day') >= 100
  THEN RAISE EXCEPTION 'too_many_invites' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public."LinkInvite" ("tokenHash", "inviterId", kind, "asksToLog", channel, "expiresAt")
  VALUES (p_token_hash, p_user_id, p_kind, coalesce(p_asks_to_log, false), p_channel,
    now() + CASE WHEN p_channel = 'qr' THEN interval '15 minutes' ELSE interval '7 days' END)
  RETURNING * INTO invite;
  RETURN jsonb_build_object('id', invite.id, 'expiresAt', invite."expiresAt");
END;
$function$;

-- An email request reaches the user with that verified email, if there is one. The app always gets the same answer,
-- so nobody can find out which emails have an account; the server gets the person to notify (or null).
CREATE OR REPLACE FUNCTION public.people_request_by_email(p_user_id uuid, p_email text, p_kind text, p_asks_to_log boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE target uuid;
  delivered boolean;
BEGIN
  IF p_user_id IS NULL OR p_email IS NULL OR length(p_email) NOT BETWEEN 3 AND 320 OR p_kind NOT IN ('friend', 'partner', 'trainer', 'client')
  THEN RAISE EXCEPTION 'invalid_invite' USING ERRCODE = '22023'; END IF;
  IF public.person_name(p_user_id) IS NULL THEN RAISE EXCEPTION 'name_required' USING ERRCODE = 'P0001'; END IF;
  IF (SELECT count(*) FROM public."LinkInvite" WHERE "inviterId" = p_user_id AND channel = 'email'
      AND "createdAt" > now() - interval '1 day') >= 10
  THEN RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0001'; END IF;
  SELECT u.id INTO target FROM auth.users u
    WHERE pg_catalog.lower(u.email) = pg_catalog.lower(pg_catalog.btrim(p_email)) AND u.email_confirmed_at IS NOT NULL
      AND u.id <> p_user_id LIMIT 1;
  -- Recorded even without a match (inviteeId null is not allowed, so a miss records the inviter's own id, which can
  -- never be accepted): the daily limit then counts every lookup.
  INSERT INTO public."LinkInvite" ("inviterId", "inviteeId", kind, "asksToLog", channel, "expiresAt", "revokedAt")
  VALUES (p_user_id, coalesce(target, p_user_id), p_kind, coalesce(p_asks_to_log, false), 'email', now() + interval '30 days',
    CASE WHEN target IS NULL OR public.blocked_between(p_user_id, target) OR public.active_link(p_user_id, target) IS NOT NULL
      OR EXISTS (SELECT 1 FROM public."LinkInvite" i WHERE i."inviterId" = p_user_id AND i."inviteeId" = target
        AND i."acceptedAt" IS NULL AND i."declinedAt" IS NULL AND i."revokedAt" IS NULL AND i."expiresAt" > now())
    THEN now() END)
  RETURNING "revokedAt" IS NULL INTO delivered;
  RETURN CASE WHEN delivered THEN target END;
END;
$function$;

-- The invite behind a token (QR code or link) or an email request (by id, only for its invitee).
CREATE OR REPLACE FUNCTION public.people_find_invite(p_user_id uuid, p_token_hash text, p_invite_id uuid)
RETURNS public."LinkInvite" LANGUAGE sql STABLE SET search_path = '' AS $function$
  SELECT i.* FROM public."LinkInvite" i
  WHERE (p_token_hash IS NOT NULL AND i."tokenHash" = p_token_hash)
     OR (p_token_hash IS NULL AND i.id = p_invite_id AND i."inviteeId" = p_user_id AND i."inviterId" <> p_user_id)
$function$;

CREATE OR REPLACE FUNCTION public.people_invite_preview(p_user_id uuid, p_token_hash text, p_invite_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = '' AS $function$
DECLARE invite public."LinkInvite"%ROWTYPE := public.people_find_invite(p_user_id, p_token_hash, p_invite_id);
  label text;
BEGIN
  IF invite.id IS NULL OR invite."revokedAt" IS NOT NULL OR invite."declinedAt" IS NOT NULL
    OR public.blocked_between(p_user_id, invite."inviterId") OR (invite."inviteeId" IS NOT NULL AND invite."inviteeId" <> p_user_id)
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF invite."inviterId" = p_user_id THEN RETURN jsonb_build_object('status', 'own'); END IF;
  IF invite."acceptedAt" IS NOT NULL OR invite."expiresAt" < now() THEN
    RETURN jsonb_build_object('status', CASE WHEN invite."acceptedBy" = p_user_id THEN 'linked' ELSE 'expired' END,
      'inviter', jsonb_build_object('id', invite."inviterId", 'name', public.person_name(invite."inviterId")));
  END IF;
  -- The kind as the invitee sees the inviter.
  label := CASE invite.kind WHEN 'trainer' THEN 'trainer' WHEN 'client' THEN 'client' ELSE invite.kind END;
  RETURN jsonb_build_object('status', CASE WHEN public.active_link(p_user_id, invite."inviterId") IS NULL THEN 'ok' ELSE 'linked' END,
    'inviter', jsonb_build_object('id', invite."inviterId", 'name', public.person_name(invite."inviterId")),
    'kind', label, 'asksToLog', invite."asksToLog",
    'defaults', jsonb_build_object('canLogForMe', invite."asksToLog", 'shareAllFoods', invite.kind = 'partner'));
END;
$function$;

-- Accept (creating the link and both grants), decline, or decline and block.
CREATE OR REPLACE FUNCTION public.people_respond(p_user_id uuid, p_token_hash text, p_invite_id uuid, p_accept boolean,
  p_block boolean, p_can_log boolean, p_share_all boolean) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE invite public."LinkInvite"%ROWTYPE;
  link uuid;
  other uuid;
BEGIN
  SELECT * INTO invite FROM public."LinkInvite" WHERE id = (public.people_find_invite(p_user_id, p_token_hash, p_invite_id)).id FOR UPDATE;
  IF invite.id IS NULL OR invite."revokedAt" IS NOT NULL OR invite."declinedAt" IS NOT NULL OR invite."expiresAt" < now()
    OR public.blocked_between(p_user_id, invite."inviterId") OR (invite."inviteeId" IS NOT NULL AND invite."inviteeId" <> p_user_id)
    OR (invite."acceptedAt" IS NOT NULL AND invite."acceptedBy" IS DISTINCT FROM p_user_id)
  THEN RAISE EXCEPTION 'invite_unavailable' USING ERRCODE = 'P0001'; END IF;
  IF invite."inviterId" = p_user_id THEN RAISE EXCEPTION 'own_invite' USING ERRCODE = 'P0001'; END IF;
  other := invite."inviterId";
  IF NOT coalesce(p_accept, false) THEN
    UPDATE public."LinkInvite" SET "declinedAt" = now() WHERE id = invite.id;
    IF coalesce(p_block, false) THEN PERFORM public.people_block(p_user_id, other); END IF;
    RETURN jsonb_build_object('status', 'declined');
  END IF;
  IF invite."acceptedAt" IS NOT NULL THEN RETURN jsonb_build_object('status', 'linked', 'linkId', invite."linkId", 'otherId', other); END IF;
  IF public.person_name(p_user_id) IS NULL THEN RAISE EXCEPTION 'name_required' USING ERRCODE = 'P0001'; END IF;
  -- Both people inviting each other at once: the second accept finds the first link.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('link:' || LEAST(p_user_id, other)::text || GREATEST(p_user_id, other)::text, 0));
  link := public.active_link(p_user_id, other);
  IF link IS NULL THEN
    INSERT INTO public."UserLink" ("userLow", "userHigh", kind, "trainerId", "createdBy")
    VALUES (LEAST(p_user_id, other), GREATEST(p_user_id, other), CASE WHEN invite.kind = 'client' THEN 'trainer' ELSE invite.kind END,
      CASE invite.kind WHEN 'trainer' THEN other WHEN 'client' THEN p_user_id END, p_user_id)
    RETURNING id INTO link;
    INSERT INTO public."LinkGrant" ("linkId", "grantorId", "granteeId") VALUES (link, p_user_id, other), (link, other, p_user_id);
  END IF;
  -- Only the accepting person's own grant: an invite never carries the inviter's.
  UPDATE public."LinkGrant" SET "canLogForMe" = "canLogForMe" OR coalesce(p_can_log, false),
    "shareAllFoods" = "shareAllFoods" OR coalesce(p_share_all, false), "updatedAt" = now()
    WHERE "linkId" = link AND "grantorId" = p_user_id;
  UPDATE public."LinkInvite" SET "acceptedAt" = now(), "acceptedBy" = p_user_id, "linkId" = link WHERE id = invite.id;
  PERFORM public.refresh_food_access(p_user_id, other);
  RETURN jsonb_build_object('status', 'accepted', 'linkId', link, 'otherId', other);
END;
$function$;

CREATE OR REPLACE FUNCTION public.people_list(p_user_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $function$
  SELECT jsonb_build_object(
    'name', public.person_name(p_user_id),
    'linked', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', other.id, 'name', public.person_name(other.id), 'kind', public.link_label(l, p_user_id), 'linkedAt', l."createdAt",
        'mine', jsonb_build_object('canLogForMe', mine."canLogForMe", 'shareAllFoods', mine."shareAllFoods"),
        'theirs', jsonb_build_object('canLogForMe', theirs."canLogForMe", 'shareAllFoods', theirs."shareAllFoods"),
        'sharedByMe', (SELECT count(*) FROM public."FoodShare" s WHERE s."ownerId" = p_user_id AND s."recipientId" = other.id
          AND s."revokedAt" IS NULL AND s.reason = 'share'),
        'loggedForThem', (SELECT count(*) FROM public."Message" m WHERE m."userId" = other.id AND m."loggedByUserId" = p_user_id
          AND m."deletedAt" IS NULL))
        ORDER BY public.person_name(other.id))
      FROM public."UserLink" l
      CROSS JOIN LATERAL (SELECT CASE WHEN l."userLow" = p_user_id THEN l."userHigh" ELSE l."userLow" END AS id) other
      JOIN public."LinkGrant" mine ON mine."linkId" = l.id AND mine."grantorId" = p_user_id
      JOIN public."LinkGrant" theirs ON theirs."linkId" = l.id AND theirs."grantorId" = other.id
      WHERE (l."userLow" = p_user_id OR l."userHigh" = p_user_id) AND l."endedAt" IS NULL), '[]'::jsonb),
    'requests', coalesce((SELECT jsonb_agg(jsonb_build_object('id', i.id, 'from', jsonb_build_object('id', i."inviterId",
        'name', public.person_name(i."inviterId")), 'kind', i.kind, 'asksToLog', i."asksToLog", 'sentAt', i."createdAt")
        ORDER BY i."createdAt" DESC)
      FROM public."LinkInvite" i
      WHERE i."inviteeId" = p_user_id AND i."inviterId" <> p_user_id AND i.channel = 'email' AND i."acceptedAt" IS NULL
        AND i."declinedAt" IS NULL AND i."revokedAt" IS NULL AND i."expiresAt" > now()
        AND NOT public.blocked_between(p_user_id, i."inviterId") AND public.active_link(p_user_id, i."inviterId") IS NULL), '[]'::jsonb),
    'blocked', coalesce((SELECT jsonb_agg(jsonb_build_object('id', b."blockedId", 'name', public.person_name(b."blockedId")))
      FROM public."UserBlock" b WHERE b."blockerId" = p_user_id), '[]'::jsonb))
$function$;

-- Changes the user's own grant to a linked person. Turning share-all off (or anything that ends access) detaches.
CREATE OR REPLACE FUNCTION public.people_set_grant(p_user_id uuid, p_other uuid, p_can_log boolean, p_share_all boolean)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE link uuid := public.active_link(p_user_id, p_other);
BEGIN
  IF link IS NULL THEN RAISE EXCEPTION 'not_linked' USING ERRCODE = 'P0001'; END IF;
  UPDATE public."LinkGrant" SET "canLogForMe" = coalesce(p_can_log, "canLogForMe"),
    "shareAllFoods" = coalesce(p_share_all, "shareAllFoods"), "updatedAt" = now()
    WHERE "linkId" = link AND "grantorId" = p_user_id;
  PERFORM public.refresh_food_access(p_user_id, p_other);
  RETURN (SELECT jsonb_build_object('canLogForMe', g."canLogForMe", 'shareAllFoods', g."shareAllFoods")
    FROM public."LinkGrant" g WHERE g."linkId" = link AND g."grantorId" = p_user_id);
END;
$function$;

-- Either person ends the link, silently. Both lose access to the other's foods (keeping copies of what they used);
-- meals each logged for the other stay, still labelled.
CREATE OR REPLACE FUNCTION public.people_end_link(p_user_id uuid, p_other uuid) RETURNS boolean
LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE link uuid;
BEGIN
  SELECT id INTO link FROM public."UserLink" WHERE id = public.active_link(p_user_id, p_other) FOR UPDATE;
  IF link IS NULL THEN RETURN false; END IF;
  UPDATE public."UserLink" SET "endedAt" = now(), "endedBy" = p_user_id WHERE id = link;
  UPDATE public."LinkGrant" SET "canLogForMe" = false, "shareAllFoods" = false, "updatedAt" = now() WHERE "linkId" = link;
  UPDATE public."FoodShare" SET "revokedAt" = now()
    WHERE "revokedAt" IS NULL AND (("ownerId" = p_user_id AND "recipientId" = p_other) OR ("ownerId" = p_other AND "recipientId" = p_user_id));
  PERFORM public.refresh_food_access(p_user_id, p_other);
  PERFORM public.refresh_food_access(p_other, p_user_id);
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.people_block(p_user_id uuid, p_other uuid) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  IF p_user_id IS NULL OR p_other IS NULL OR p_user_id = p_other THEN RAISE EXCEPTION 'invalid_person' USING ERRCODE = '22023'; END IF;
  PERFORM public.people_end_link(p_user_id, p_other);
  INSERT INTO public."UserBlock" ("blockerId", "blockedId") VALUES (p_user_id, p_other) ON CONFLICT DO NOTHING;
  UPDATE public."LinkInvite" SET "revokedAt" = now() WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL
    AND (("inviterId" = p_user_id AND "inviteeId" = p_other) OR ("inviterId" = p_other AND ("inviteeId" = p_user_id OR "inviteeId" IS NULL)));
END;
$function$;

CREATE OR REPLACE FUNCTION public.people_unblock(p_user_id uuid, p_other uuid) RETURNS void
LANGUAGE sql SET search_path = '' AS $function$
  DELETE FROM public."UserBlock" WHERE "blockerId" = p_user_id AND "blockedId" = p_other
$function$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Sharing

-- A lineage's current version (or, when the owner deleted it, its latest).
CREATE OR REPLACE FUNCTION public.lineage_current(p_lineage_id integer) RETURNS public."FoodItem"
LANGUAGE sql STABLE SET search_path = '' AS $function$
  SELECT f.* FROM public."FoodItem" f WHERE f."lineageId" = p_lineage_id
  ORDER BY (f."archivedAt" IS NULL) DESC, f.id DESC LIMIT 1
$function$;

-- Private foods in a food that p_recipient couldn't see if p_owner shared it: another person's foods among a recipe's
-- ingredients. Only the creator shares (plan: re-sharing).
CREATE OR REPLACE FUNCTION public.unshareable_ingredients(p_food_id integer, p_owner uuid, p_recipient uuid)
RETURNS TABLE(id integer, name text) LANGUAGE sql STABLE SET search_path = '' AS $function$
  SELECT f.id, f.name FROM public."RecipeIngredient" r JOIN public."FoodItem" f ON f.id = r."foodItemId"
  WHERE r."recipeFoodItemId" = p_food_id AND f."privateToUserId" IS NOT NULL AND f."privateToUserId" <> p_owner
    AND (p_recipient IS NULL OR NOT public.food_visible(p_recipient, f."privateToUserId", f."lineageId"))
$function$;

-- A free name for a copy among the recipient's current foods: the name, then "name (Sam)", "name (Sam 2)"…
CREATE OR REPLACE FUNCTION public.free_food_name(p_owner uuid, p_name text, p_brand text, p_from text) RETURNS text
LANGUAGE plpgsql STABLE SET search_path = '' AS $function$
DECLARE candidate text := p_name;
  n integer := 1;
BEGIN
  WHILE EXISTS (SELECT 1 FROM public."FoodItem" f WHERE f."privateToUserId" = p_owner AND f."archivedAt" IS NULL
      AND public.food_identity_key(f.name, f.brand) = public.food_identity_key(candidate, p_brand)) LOOP
    candidate := left(p_name, 100) || ' (' || coalesce(left(p_from, 30), 'copy') || CASE WHEN n > 1 THEN ' ' || n ELSE '' END || ')';
    n := n + 1;
  END LOOP;
  RETURN candidate;
END;
$function$;

-- One version copied into p_recipient's private foods, with its servings, nutrients and icon. Ingredients are copied
-- by copy_food_lineage.
CREATE OR REPLACE FUNCTION public.copy_food_version(p_food_id integer, p_recipient uuid, p_lineage integer, p_archived boolean,
  p_name text) RETURNS integer
LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE target integer;
BEGIN
  INSERT INTO public."FoodItem" (name, brand, "defaultServingWeightGram", "defaultServingLiquidMl", "kcalPerServing",
    "proteinPerServing", "carbPerServing", "totalFatPerServing", "fiberPerServing", "sugarPerServing", "addedSugarPerServing",
    "satFatPerServing", "transFatPerServing", "isLiquid", "userId", "foodInfoSource", "bgeBaseEmbedding", description, verified,
    "privateToUserId", "recipePortions", "cookedWeightGram", "lastUpdated", gtin, "UPC", "weightUnknown", "knownAs",
    "partialNutrients", "lineageId", "copiedFromLineageId", "archivedAt")
  SELECT p_name, f.brand, f."defaultServingWeightGram", f."defaultServingLiquidMl", f."kcalPerServing", f."proteinPerServing",
    f."carbPerServing", f."totalFatPerServing", f."fiberPerServing", f."sugarPerServing", f."addedSugarPerServing",
    f."satFatPerServing", f."transFatPerServing", f."isLiquid", p_recipient, 'User', f."bgeBaseEmbedding", f.description, false,
    p_recipient, f."recipePortions", f."cookedWeightGram", now(), f.gtin, f."UPC", f."weightUnknown", f."knownAs",
    f."partialNutrients", p_lineage, f."lineageId", CASE WHEN p_archived THEN now() END
  FROM public."FoodItem" f WHERE f.id = p_food_id
  RETURNING id INTO target;
  INSERT INTO public."Serving" ("foodItemId", "servingName", "servingWeightGram", "defaultServingAmount")
    SELECT target, s."servingName", s."servingWeightGram", s."defaultServingAmount" FROM public."Serving" s
    WHERE s."foodItemId" = p_food_id ORDER BY s.id;
  INSERT INTO public."Nutrient" ("foodItemId", "nutrientName", "nutrientUnit", "nutrientAmountPerDefaultServing")
    SELECT target, n."nutrientName", n."nutrientUnit", n."nutrientAmountPerDefaultServing" FROM public."Nutrient" n
    WHERE n."foodItemId" = p_food_id;
  INSERT INTO public."FoodItemImages" ("foodItemId", "foodImageId", similarity)
    SELECT target, i."foodImageId", i.similarity FROM public."FoodItemImages" i WHERE i."foodItemId" = p_food_id
    ON CONFLICT DO NOTHING;
  RETURN target;
END;
$function$;

-- Copies a lineage into p_recipient's private foods: its current version, plus the older versions in p_versions (the
-- ones their meals point at) as archived versions of the same new lineage. A recipe's private ingredients that aren't
-- the recipient's are copied too (catalogue ingredients stay references). Returns {"<old id>": new id, …}.
-- p_map carries copies already made in this transaction, so an ingredient shared by two recipes is copied once.
CREATE OR REPLACE FUNCTION public.copy_food_lineage(p_lineage_id integer, p_recipient uuid, p_versions integer[] DEFAULT '{}',
  p_map jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE current_row public."FoodItem"%ROWTYPE := public.lineage_current(p_lineage_id);
  map jsonb := coalesce(p_map, '{}');
  from_name text;
  new_lineage integer;
  version_id integer;
  copied integer;
  ingredient record;
BEGIN
  IF current_row.id IS NULL OR current_row."privateToUserId" IS NULL OR current_row."privateToUserId" = p_recipient THEN RETURN map; END IF;
  from_name := public.person_name(current_row."privateToUserId");
  IF NOT map ? current_row.id::text THEN
    copied := public.copy_food_version(current_row.id, p_recipient, NULL, false,
      public.free_food_name(p_recipient, current_row.name, current_row.brand, from_name));
    map := map || jsonb_build_object(current_row.id::text, copied);
  END IF;
  new_lineage := (SELECT "lineageId" FROM public."FoodItem" WHERE id = (map->>current_row.id::text)::integer);
  FOR version_id IN SELECT DISTINCT v FROM unnest(coalesce(p_versions, '{}')) v
      JOIN public."FoodItem" f ON f.id = v AND f."lineageId" = p_lineage_id WHERE NOT map ? v::text LOOP
    copied := public.copy_food_version(version_id, p_recipient, new_lineage, true,
      (SELECT name FROM public."FoodItem" WHERE id = version_id));
    map := map || jsonb_build_object(version_id::text, copied);
  END LOOP;
  -- Ingredients of every copied recipe version.
  FOR ingredient IN
    SELECT r.id, r."recipeFoodItemId", r."foodItemId", f."lineageId" AS lineage, f."archivedAt" IS NOT NULL AS archived
    FROM public."RecipeIngredient" r JOIN public."FoodItem" f ON f.id = r."foodItemId"
    WHERE r."recipeFoodItemId" IN (SELECT key::integer FROM jsonb_object_keys(map) key
                                   JOIN public."FoodItem" src ON src.id = key::integer AND src."lineageId" = p_lineage_id)
  LOOP
    IF ingredient.lineage IS NOT NULL AND (SELECT "privateToUserId" FROM public."FoodItem" WHERE id = ingredient."foodItemId") <> p_recipient
       AND NOT map ? ingredient."foodItemId"::text THEN
      map := public.copy_food_lineage(ingredient.lineage, p_recipient,
        CASE WHEN (public.lineage_current(ingredient.lineage)).id = ingredient."foodItemId" THEN '{}'::integer[]
          ELSE ARRAY[ingredient."foodItemId"] END, map);
    END IF;
  END LOOP;
  INSERT INTO public."RecipeIngredient" ("recipeFoodItemId", "foodItemId", grams, "servingId", "servingAmount", "loggedUnit", position)
  SELECT (map->>r."recipeFoodItemId"::text)::integer,
    coalesce((map->>r."foodItemId"::text)::integer, r."foodItemId"), r.grams,
    CASE WHEN map ? r."foodItemId"::text THEN (
      SELECT s2.id FROM public."Serving" s1 JOIN public."Serving" s2 ON s2."foodItemId" = (map->>r."foodItemId"::text)::integer
        AND s2."servingName" = s1."servingName" WHERE s1.id = r."servingId" LIMIT 1) ELSE r."servingId" END,
    r."servingAmount", r."loggedUnit", r.position
  FROM public."RecipeIngredient" r
  WHERE r."recipeFoodItemId" IN (SELECT key::integer FROM jsonb_object_keys(map) key
                                 JOIN public."FoodItem" src ON src.id = key::integer AND src."lineageId" = p_lineage_id)
    AND NOT EXISTS (SELECT 1 FROM public."RecipeIngredient" done WHERE done."recipeFoodItemId" = (map->>r."recipeFoodItemId"::text)::integer);
  RETURN map;
END;
$function$;

-- When p_recipient loses access to some of p_owner's lineages: whatever they used becomes their own copy, and their
-- meals, favourites and recipes point at it. Logged numbers don't change.
CREATE OR REPLACE FUNCTION public.detach_food_access(p_owner uuid, p_recipient uuid, p_lineages integer[]) RETURNS integer
LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE lineage integer;
  versions integer[];
  used integer[];
  map jsonb := '{}';
  kept integer := 0;
BEGIN
  FOREACH lineage IN ARRAY coalesce(p_lineages, '{}') LOOP
    SELECT coalesce(array_agg(f.id), '{}') INTO versions FROM public."FoodItem" f WHERE f."lineageId" = lineage;
    -- The versions their meals point at (directly, or inside a recipe they logged that is also going).
    SELECT coalesce(array_agg(DISTINCT v), '{}') INTO used FROM (
      SELECT l."foodItemId" v FROM public."LoggedFoodItem" l WHERE l."userId" = p_recipient AND l."foodItemId" = ANY(versions)
      UNION SELECT u."foodItemId" FROM public."UserFavoriteFoodItem" u WHERE u."userId" = p_recipient AND u."foodItemId" = ANY(versions)
      UNION SELECT r."foodItemId" FROM public."RecipeIngredient" r JOIN public."FoodItem" rf ON rf.id = r."recipeFoodItemId"
        WHERE rf."privateToUserId" = p_recipient AND r."foodItemId" = ANY(versions)) x;
    IF cardinality(used) = 0 THEN CONTINUE; END IF;
    map := public.copy_food_lineage(lineage, p_recipient,
      ARRAY(SELECT v FROM unnest(used) v WHERE v <> (public.lineage_current(lineage)).id), map);
    kept := kept + 1;
  END LOOP;
  IF map = '{}'::jsonb THEN RETURN 0; END IF;
  -- Pointing a meal's rows at an identical copy is allowed on meals the operation protocol owns.
  PERFORM pg_catalog.set_config('app.meal_operation_write', 'true', true);
  UPDATE public."LoggedFoodItem" l SET "foodItemId" = (map->>l."foodItemId"::text)::integer,
    "servingId" = CASE WHEN l."servingId" IS NULL THEN NULL ELSE (
      SELECT s2.id FROM public."Serving" s1 JOIN public."Serving" s2 ON s2."foodItemId" = (map->>l."foodItemId"::text)::integer
        AND s2."servingName" = s1."servingName" WHERE s1.id = l."servingId" LIMIT 1) END
    WHERE l."userId" = p_recipient AND map ? l."foodItemId"::text;
  UPDATE public."UserFavoriteFoodItem" u SET "foodItemId" = (map->>u."foodItemId"::text)::integer, "servingId" = NULL
    WHERE u."userId" = p_recipient AND map ? u."foodItemId"::text;
  UPDATE public."RecipeIngredient" r SET "foodItemId" = (map->>r."foodItemId"::text)::integer,
    "servingId" = CASE WHEN r."servingId" IS NULL THEN NULL ELSE (
      SELECT s2.id FROM public."Serving" s1 JOIN public."Serving" s2 ON s2."foodItemId" = (map->>r."foodItemId"::text)::integer
        AND s2."servingName" = s1."servingName" WHERE s1.id = r."servingId" LIMIT 1) END
    FROM public."FoodItem" rf
    WHERE rf.id = r."recipeFoodItemId" AND rf."privateToUserId" = p_recipient AND map ? r."foodItemId"::text;
  RETURN kept;
END;
$function$;

-- Rebuilds what p_recipient can see of p_owner's foods from the sources, and detaches whatever they lose.
CREATE OR REPLACE FUNCTION public.refresh_food_access(p_owner uuid, p_recipient uuid) RETURNS integer
LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE linked boolean := public.active_link(p_owner, p_recipient) IS NOT NULL;
  share_all boolean := coalesce((public.link_grant(p_owner, p_recipient))."shareAllFoods", false);
  lost integer[];
  changed integer;
BEGIN
  IF p_owner IS NULL OR p_recipient IS NULL OR p_owner = p_recipient THEN RETURN 0; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('food_access:' || p_owner::text || ':' || p_recipient::text, 0));
  CREATE TEMP TABLE IF NOT EXISTS desired_access (lineage integer PRIMARY KEY, via_share boolean, via_recipe boolean, via_all boolean)
    ON COMMIT DROP;
  TRUNCATE desired_access;
  IF linked THEN
    -- Explicit shares and "share all": lineages with a current version.
    INSERT INTO desired_access
    SELECT f."lineageId", bool_or(s."lineageId" IS NOT NULL), false, share_all
    FROM public."FoodItem" f
    LEFT JOIN public."FoodShare" s ON s."lineageId" = f."lineageId" AND s."recipientId" = p_recipient AND s."ownerId" = p_owner
      AND s."revokedAt" IS NULL
    WHERE f."privateToUserId" = p_owner AND f."archivedAt" IS NULL AND (s."lineageId" IS NOT NULL
      OR (share_all AND NOT EXISTS (SELECT 1 FROM public.unshareable_ingredients(f.id, p_owner, p_recipient))))
    GROUP BY f."lineageId";
    -- The owner's private ingredients of those recipes.
    INSERT INTO desired_access
    SELECT DISTINCT i."lineageId", false, true, false
    FROM desired_access d
    JOIN public."FoodItem" rf ON rf."lineageId" = d.lineage AND rf."archivedAt" IS NULL AND rf."recipePortions" IS NOT NULL
    JOIN public."RecipeIngredient" r ON r."recipeFoodItemId" = rf.id
    JOIN public."FoodItem" i ON i.id = r."foodItemId" AND i."privateToUserId" = p_owner
    ON CONFLICT (lineage) DO UPDATE SET via_recipe = true;
  END IF;

  SELECT coalesce(array_agg(a."lineageId"), '{}') INTO lost FROM public."FoodAccess" a
    WHERE a."recipientId" = p_recipient AND a."ownerId" = p_owner AND a."revokedAt" IS NULL
      AND NOT EXISTS (SELECT 1 FROM desired_access d WHERE d.lineage = a."lineageId");
  IF cardinality(lost) > 0 THEN
    -- Copy before revoking, while the recipient's meals can still see the versions they point at.
    PERFORM public.detach_food_access(p_owner, p_recipient, lost);
    UPDATE public."FoodAccess" SET "revokedAt" = now(), "updatedAt" = now(), "hiddenAt" = NULL
      WHERE "recipientId" = p_recipient AND "lineageId" = ANY(lost);
  END IF;

  INSERT INTO public."FoodAccess" ("recipientId", "lineageId", "ownerId", "viaShare", "viaRecipe", "viaShareAll")
  SELECT p_recipient, d.lineage, p_owner, d.via_share, d.via_recipe, d.via_all FROM desired_access d
  ON CONFLICT ("recipientId", "lineageId") DO UPDATE SET "viaShare" = excluded."viaShare", "viaRecipe" = excluded."viaRecipe",
    "viaShareAll" = excluded."viaShareAll", "ownerId" = excluded."ownerId", "revokedAt" = NULL, "updatedAt" = now(),
    "grantedAt" = CASE WHEN "FoodAccess"."revokedAt" IS NOT NULL THEN now() ELSE "FoodAccess"."grantedAt" END,
    "hiddenAt" = CASE WHEN "FoodAccess"."revokedAt" IS NOT NULL THEN NULL ELSE "FoodAccess"."hiddenAt" END
  WHERE "FoodAccess"."revokedAt" IS NOT NULL OR ("FoodAccess"."viaShare", "FoodAccess"."viaRecipe", "FoodAccess"."viaShareAll")
    IS DISTINCT FROM (excluded."viaShare", excluded."viaRecipe", excluded."viaShareAll");
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed + cardinality(lost);
END;
$function$;

-- After an owner's food changes (saved, archived): everyone who might see it is refreshed.
CREATE OR REPLACE FUNCTION public.refresh_owner_access(p_owner uuid) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE recipient uuid;
BEGIN
  FOR recipient IN
    SELECT CASE WHEN l."userLow" = p_owner THEN l."userHigh" ELSE l."userLow" END FROM public."UserLink" l
      WHERE (l."userLow" = p_owner OR l."userHigh" = p_owner) AND l."endedAt" IS NULL
    UNION SELECT a."recipientId" FROM public."FoodAccess" a WHERE a."ownerId" = p_owner AND a."revokedAt" IS NULL
  LOOP
    PERFORM public.refresh_food_access(p_owner, recipient);
  END LOOP;
END;
$function$;

-- Shares (or stops sharing) the owner's lineages with linked people. Returns what was refused and why.
CREATE OR REPLACE FUNCTION public.share_foods(p_owner uuid, p_lineages integer[], p_recipients uuid[], p_on boolean,
  p_reason text DEFAULT 'share', p_via text DEFAULT 'app', p_agent text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE recipient uuid;
  lineage integer;
  food public."FoodItem"%ROWTYPE;
  refused jsonb := '[]';
  blocked text;
  shared integer := 0;
BEGIN
  IF p_owner IS NULL OR cardinality(coalesce(p_lineages, '{}')) NOT BETWEEN 1 AND 200
    OR cardinality(coalesce(p_recipients, '{}')) NOT BETWEEN 1 AND 100 OR p_reason NOT IN ('share', 'log')
  THEN RAISE EXCEPTION 'invalid_share' USING ERRCODE = '22023'; END IF;
  FOREACH recipient IN ARRAY p_recipients LOOP
    IF public.active_link(p_owner, recipient) IS NULL THEN
      refused := refused || jsonb_build_object('recipientId', recipient, 'reason', 'not_linked');
      CONTINUE;
    END IF;
    FOREACH lineage IN ARRAY p_lineages LOOP
      food := public.lineage_current(lineage);
      IF food.id IS NULL OR food."privateToUserId" IS DISTINCT FROM p_owner OR food."archivedAt" IS NOT NULL THEN
        refused := refused || jsonb_build_object('recipientId', recipient, 'lineageId', lineage, 'reason', 'not_yours');
        CONTINUE;
      END IF;
      IF p_on THEN
        SELECT string_agg(u.name, ', ') INTO blocked FROM public.unshareable_ingredients(food.id, p_owner, recipient) u;
        IF blocked IS NOT NULL THEN
          refused := refused || jsonb_build_object('recipientId', recipient, 'lineageId', lineage, 'reason', 'not_shareable',
            'foods', blocked);
          CONTINUE;
        END IF;
        INSERT INTO public."FoodShare" ("recipientId", "lineageId", "ownerId", reason, via, "agentClientId")
        VALUES (recipient, lineage, p_owner, p_reason, coalesce(p_via, 'app'), p_agent)
        ON CONFLICT ("recipientId", "lineageId") DO UPDATE SET "revokedAt" = NULL, "ownerId" = excluded."ownerId",
          reason = CASE WHEN "FoodShare"."revokedAt" IS NULL AND "FoodShare".reason = 'share' THEN 'share' ELSE excluded.reason END,
          via = excluded.via, "agentClientId" = excluded."agentClientId",
          "createdAt" = CASE WHEN "FoodShare"."revokedAt" IS NULL THEN "FoodShare"."createdAt" ELSE now() END;
      ELSE
        UPDATE public."FoodShare" SET "revokedAt" = now() WHERE "recipientId" = recipient AND "lineageId" = lineage AND "revokedAt" IS NULL;
      END IF;
      shared := shared + 1;
    END LOOP;
    PERFORM public.refresh_food_access(p_owner, recipient);
  END LOOP;
  RETURN jsonb_build_object('changed', shared, 'refused', refused);
END;
$function$;

-- Who a food is shared with (for the owner's share sheet).
CREATE OR REPLACE FUNCTION public.food_shared_with(p_owner uuid, p_lineage_id integer) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', a."recipientId", 'name', public.person_name(a."recipientId"),
    'explicit', a."viaShare", 'all', a."viaShareAll", 'inRecipe', a."viaRecipe") ORDER BY public.person_name(a."recipientId")), '[]')
  FROM public."FoodAccess" a WHERE a."ownerId" = p_owner AND a."lineageId" = p_lineage_id AND a."revokedAt" IS NULL
$function$;

-- The recipient hides (or brings back) a food shared with them. The owner isn't told.
CREATE OR REPLACE FUNCTION public.hide_shared_food(p_user_id uuid, p_lineage_id integer, p_hidden boolean) RETURNS boolean
LANGUAGE sql SET search_path = '' AS $function$
  WITH changed AS (UPDATE public."FoodAccess" SET "hiddenAt" = CASE WHEN p_hidden THEN now() END, "updatedAt" = now()
    WHERE "recipientId" = p_user_id AND "lineageId" = p_lineage_id AND "revokedAt" IS NULL RETURNING 1)
  SELECT EXISTS (SELECT 1 FROM changed)
$function$;

-- Copy links ------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_food_copy_link(p_owner uuid, p_food_id integer, p_token_hash text) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE food public."FoodItem"%ROWTYPE;
  blocked text;
BEGIN
  SELECT * INTO food FROM public."FoodItem" WHERE id = p_food_id;
  IF food.id IS NULL OR food."privateToUserId" IS DISTINCT FROM p_owner OR food."archivedAt" IS NOT NULL OR length(coalesce(p_token_hash, '')) < 32
  THEN RAISE EXCEPTION 'food_unavailable' USING ERRCODE = 'P0002'; END IF;
  SELECT string_agg(u.name, ', ') INTO blocked FROM public.unshareable_ingredients(food.id, p_owner, NULL) u;
  IF blocked IS NOT NULL THEN RAISE EXCEPTION 'not_shareable' USING ERRCODE = 'P0001', DETAIL = blocked; END IF;
  IF (SELECT count(*) FROM public."FoodCopyLink" WHERE "ownerId" = p_owner AND "createdAt" > now() - interval '1 day') >= 200
  THEN RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public."FoodCopyLink" ("tokenHash", "ownerId", "lineageId") VALUES (p_token_hash, p_owner, food."lineageId");
  RETURN jsonb_build_object('lineageId', food."lineageId");
END;
$function$;

-- What a copy link offers: the current version's id (the server reads its details) and who shared it.
CREATE OR REPLACE FUNCTION public.food_copy_link_preview(p_user_id uuid, p_token_hash text) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = '' AS $function$
DECLARE link public."FoodCopyLink"%ROWTYPE;
  food public."FoodItem"%ROWTYPE;
BEGIN
  SELECT * INTO link FROM public."FoodCopyLink" WHERE "tokenHash" = p_token_hash;
  IF link.id IS NULL OR link."revokedAt" IS NOT NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  food := public.lineage_current(link."lineageId");
  IF food.id IS NULL OR food."archivedAt" IS NOT NULL OR food."privateToUserId" IS DISTINCT FROM link."ownerId"
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  RETURN jsonb_build_object('status', CASE WHEN link."ownerId" = p_user_id THEN 'own' ELSE 'ok' END, 'foodId', food.id,
    'lineageId', link."lineageId", 'from', jsonb_build_object('id', link."ownerId", 'name', public.person_name(link."ownerId")),
    'existingCopyId', (SELECT f.id FROM public."FoodItem" f WHERE f."privateToUserId" = p_user_id AND f."archivedAt" IS NULL
      AND f."copiedFromLineageId" = link."lineageId" ORDER BY f.id DESC LIMIT 1));
END;
$function$;

CREATE OR REPLACE FUNCTION public.copy_food_from_link(p_user_id uuid, p_token_hash text, p_again boolean) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE preview jsonb := public.food_copy_link_preview(p_user_id, p_token_hash);
  map jsonb;
BEGIN
  IF preview->>'status' = 'own' THEN RETURN jsonb_build_object('foodId', (preview->>'foodId')::integer, 'existing', true); END IF;
  IF preview->>'status' <> 'ok' THEN RAISE EXCEPTION 'link_unavailable' USING ERRCODE = 'P0002'; END IF;
  IF preview->>'existingCopyId' IS NOT NULL AND NOT coalesce(p_again, false) THEN
    RETURN jsonb_build_object('foodId', (preview->>'existingCopyId')::integer, 'existing', true);
  END IF;
  IF (SELECT count(*) FROM public."FoodItem" WHERE "privateToUserId" = p_user_id AND "copiedFromLineageId" IS NOT NULL
      AND "createdAtDateTime" > now() - interval '1 hour') >= 60
  THEN RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0001'; END IF;
  -- Ingredients the user already has a copy of are reused.
  SELECT coalesce(jsonb_object_agg(src.id::text, mine.id), '{}') INTO map
  FROM public."RecipeIngredient" r JOIN public."FoodItem" src ON src.id = r."foodItemId"
  JOIN LATERAL (SELECT f.id FROM public."FoodItem" f WHERE f."privateToUserId" = p_user_id AND f."archivedAt" IS NULL
    AND f."copiedFromLineageId" = src."lineageId" ORDER BY f.id DESC LIMIT 1) mine ON true
  WHERE r."recipeFoodItemId" = (preview->>'foodId')::integer AND src."privateToUserId" IS NOT NULL;
  map := public.copy_food_lineage((preview->>'lineageId')::integer, p_user_id, '{}', map);
  UPDATE public."FoodCopyLink" SET copies = copies + 1 WHERE "tokenHash" = p_token_hash;
  RETURN jsonb_build_object('foodId', (map->>(preview->>'foodId'))::integer, 'existing', false);
END;
$function$;

-- "Save a copy" of a food shared with the user: theirs to edit, no longer following the owner's.
CREATE OR REPLACE FUNCTION public.save_food_copy(p_user_id uuid, p_food_id integer) RETURNS integer
LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE food public."FoodItem"%ROWTYPE;
  map jsonb;
BEGIN
  SELECT * INTO food FROM public."FoodItem" WHERE id = p_food_id;
  IF food.id IS NULL OR food."privateToUserId" IS NULL OR food."privateToUserId" = p_user_id
    OR NOT public.food_visible(p_user_id, food."privateToUserId", food."lineageId")
  THEN RAISE EXCEPTION 'food_unavailable' USING ERRCODE = 'P0002'; END IF;
  map := public.copy_food_lineage(food."lineageId", p_user_id);
  RETURN (map->>((public.lineage_current(food."lineageId")).id::text))::integer;
END;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_food_copy_links(p_owner uuid, p_lineage_id integer) RETURNS integer
LANGUAGE sql SET search_path = '' AS $function$
  WITH changed AS (UPDATE public."FoodCopyLink" SET "revokedAt" = now()
    WHERE "ownerId" = p_owner AND "lineageId" = p_lineage_id AND "revokedAt" IS NULL RETURNING 1)
  SELECT count(*)::integer FROM changed
$function$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Existing functions that now know about sharing

-- Archiving a shared food ends access to it: whoever used it keeps a copy.
CREATE OR REPLACE FUNCTION public.archive_user_food(p_user_id uuid, p_food_id integer) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE done boolean;
BEGIN
  UPDATE public."FoodItem" SET "archivedAt" = now(), "lastUpdated" = now()
    WHERE id = p_food_id AND "privateToUserId" = p_user_id AND "archivedAt" IS NULL;
  done := FOUND;
  IF done THEN PERFORM public.refresh_owner_access(p_user_id); END IF;
  RETURN done;
END;
$function$;

-- The user's own foods and recipes that a meal's text names, then foods shared with them (behind
-- shared_foods_in_agent, until the evals have run).
CREATE OR REPLACE FUNCTION public.search_own_foods(p_text text, p_user_id uuid, p_limit integer DEFAULT 5)
RETURNS TABLE(id integer, name text, brand text, score real)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT f.id, f.name, f.brand,
    extensions.word_similarity(public.food_identity_part(f.name), public.food_identity_part(p_text)) AS score
  FROM public."FoodItem" f
  WHERE p_user_id IS NOT NULL AND f."archivedAt" IS NULL
    AND (f."privateToUserId" = p_user_id OR (public.user_flag_enabled('shared_foods_in_agent', p_user_id)
      AND f."lineageId" IN (SELECT a."lineageId" FROM public."FoodAccess" a WHERE a."recipientId" = p_user_id
        AND a."revokedAt" IS NULL AND a."hiddenAt" IS NULL)))
    AND (f."recipePortions" IS NULL OR public.user_flag_enabled('recipes_in_agent', p_user_id))
    AND length(public.food_identity_part(p_text)) BETWEEN 1 AND 2000
    AND extensions.word_similarity(public.food_identity_part(f.name), public.food_identity_part(p_text)) >= 0.6
  ORDER BY score DESC, (f."privateToUserId" = p_user_id) DESC, f."lastUpdated" DESC, f.id DESC
  LIMIT least(greatest(p_limit, 1), 10)
$function$;
INSERT INTO public."FeatureFlag" (name, value) VALUES ('shared_foods_in_agent', 'off'), ('people', 'off')
  ON CONFLICT (name) DO NOTHING;

-- Saving: the one visibility rule (20261015000000), plus sharing.
CREATE OR REPLACE FUNCTION public.save_user_food(p_user_id uuid, p_food_id integer, p_food jsonb, p_servings jsonb,
  p_nutrients jsonb, p_ingredients jsonb)
RETURNS TABLE(food_id integer, created boolean, versioned boolean, previous_id integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  is_recipe boolean := p_ingredients IS NOT NULL AND jsonb_typeof(p_ingredients) <> 'null';
  identity text := public.food_identity_key(p_food->>'name', p_food->>'brand');
  old_row public."FoodItem"%ROWTYPE;
  in_use boolean := false;
  target integer;
  bad integer;
BEGIN
  IF p_user_id IS NULL OR length(public.food_identity_part(p_food->>'name')) < 2 OR
     length(coalesce(p_food->>'name', '')) > 120 OR length(coalesce(p_food->>'brand', '')) > 120 OR
     coalesce((p_food->>'defaultServingWeightGram')::float8, 0) <= 0 OR (p_food->>'defaultServingWeightGram')::float8 > 20000 OR
     coalesce((p_food->>'kcal')::float8, -1) < 0 OR
     jsonb_typeof(p_servings) IS DISTINCT FROM 'array' OR jsonb_array_length(p_servings) > 10 OR
     jsonb_typeof(p_nutrients) IS DISTINCT FROM 'array' OR jsonb_array_length(p_nutrients) > 60 OR
     (is_recipe AND (jsonb_typeof(p_ingredients) <> 'array' OR jsonb_array_length(p_ingredients) NOT BETWEEN 1 AND 50 OR
       coalesce((p_food->>'recipePortions')::numeric, 0) <= 0 OR (p_food->>'recipePortions')::numeric > 1000)) OR
     (NOT is_recipe AND (p_food->>'recipePortions' IS NOT NULL OR p_food->>'cookedWeightGram' IS NOT NULL))
  THEN RAISE EXCEPTION 'Invalid food' USING ERRCODE = '22023'; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('user_food:' || p_user_id::text, 0));
  IF p_food_id IS NOT NULL THEN
    SELECT * INTO old_row FROM public."FoodItem" f
      WHERE f.id = p_food_id AND f."privateToUserId" = p_user_id AND f."archivedAt" IS NULL FOR UPDATE;
    IF old_row.id IS NULL OR (old_row."recipePortions" IS NOT NULL) <> is_recipe
    THEN RAISE EXCEPTION 'food_unavailable' USING ERRCODE = 'P0002'; END IF;
  END IF;

  -- One name per thing the user owns, across foods and recipes, so "Chili" in the Foods tab is never ambiguous. Only
  -- checked when the name is new: the agent may since have made a private estimate with a recipe's name (recipes have
  -- their own index), and that must not stop the user editing their recipe.
  IF (p_food_id IS NULL OR public.food_identity_key(old_row.name, old_row.brand) <> identity) AND
     EXISTS (SELECT 1 FROM public."FoodItem" f WHERE f."privateToUserId" = p_user_id AND f."archivedAt" IS NULL
      AND public.food_identity_key(f.name, f.brand) = identity AND f.id IS DISTINCT FROM p_food_id)
  THEN RAISE EXCEPTION 'name_taken' USING ERRCODE = '23505'; END IF;

  IF is_recipe THEN
    -- Ingredients: foods this user can see, never a recipe (no nesting in v1), never the recipe itself, and a serving
    -- only of that food.
    SELECT count(*) INTO bad FROM jsonb_array_elements(p_ingredients) i
      LEFT JOIN public."FoodItem" f ON f.id = (i->>'foodItemId')::integer
      LEFT JOIN public."Serving" s ON s.id = (i->>'servingId')::integer
      WHERE f.id IS NULL OR f."recipePortions" IS NOT NULL OR f.id IS NOT DISTINCT FROM p_food_id
        OR NOT public.food_visible(p_user_id, f."privateToUserId", f."lineageId")
        OR coalesce((i->>'grams')::float8, 0) <= 0 OR (i->>'grams')::float8 > 20000
        OR (i->>'servingId' IS NOT NULL AND (s.id IS NULL OR s."foodItemId" <> f.id));
    IF bad > 0 THEN RAISE EXCEPTION 'ingredient_unavailable' USING ERRCODE = '42501'; END IF;
    -- Only the creator shares: a recipe shared with someone can't take in another person's food they can't see.
    IF p_food_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public."FoodShare" s JOIN jsonb_array_elements(p_ingredients) i ON true
        JOIN public."FoodItem" f ON f.id = (i->>'foodItemId')::integer
        WHERE s."ownerId" = p_user_id AND s."lineageId" = old_row."lineageId" AND s."revokedAt" IS NULL
          AND f."privateToUserId" IS NOT NULL AND f."privateToUserId" <> p_user_id
          AND NOT public.food_visible(s."recipientId", f."privateToUserId", f."lineageId"))
    THEN RAISE EXCEPTION 'not_shareable' USING ERRCODE = '42501'; END IF;
  END IF;

  IF p_food_id IS NOT NULL THEN
    in_use := EXISTS (SELECT 1 FROM public."LoggedFoodItem" l WHERE l."foodItemId" = p_food_id AND l."deletedAt" IS NULL)
      OR EXISTS (SELECT 1 FROM public."RecipeIngredient" r WHERE r."foodItemId" = p_food_id);
  END IF;

  IF p_food_id IS NOT NULL AND NOT in_use THEN
    target := p_food_id;
    UPDATE public."FoodItem" SET name = pg_catalog.btrim(p_food->>'name'), brand = nullif(pg_catalog.btrim(p_food->>'brand'), ''),
      "defaultServingWeightGram" = (p_food->>'defaultServingWeightGram')::float8,
      "defaultServingLiquidMl" = (p_food->>'defaultServingLiquidMl')::float8,
      "kcalPerServing" = (p_food->>'kcal')::float8, "proteinPerServing" = coalesce((p_food->>'proteinG')::float8, 0),
      "carbPerServing" = coalesce((p_food->>'carbG')::float8, 0), "totalFatPerServing" = coalesce((p_food->>'totalFatG')::float8, 0),
      "fiberPerServing" = (p_food->>'fiberG')::float8, "sugarPerServing" = (p_food->>'sugarG')::float8,
      "addedSugarPerServing" = (p_food->>'addedSugarG')::float8, "satFatPerServing" = (p_food->>'satFatG')::float8,
      "transFatPerServing" = (p_food->>'transFatG')::float8, "isLiquid" = coalesce((p_food->>'isLiquid')::boolean, false),
      "recipePortions" = (p_food->>'recipePortions')::numeric, "cookedWeightGram" = (p_food->>'cookedWeightGram')::float8,
      "bgeBaseEmbedding" = coalesce((p_food->>'bgeBaseEmbedding')::extensions.vector, "bgeBaseEmbedding"),
      description = coalesce(p_food->>'description', description), "weightUnknown" = false, "lastUpdated" = now()
    WHERE id = target;
    -- A favourite keeps its food; a serving that goes away leaves it on the default serving.
    UPDATE public."UserFavoriteFoodItem" SET "servingId" = NULL
      WHERE "servingId" IN (SELECT id FROM public."Serving" WHERE "foodItemId" = target);
    DELETE FROM public."Serving" WHERE "foodItemId" = target;
    DELETE FROM public."Nutrient" WHERE "foodItemId" = target;
    DELETE FROM public."RecipeIngredient" WHERE "recipeFoodItemId" = target;
  ELSE
    -- A new food, or a new version of one that past logs (or recipes) point at. The old version is archived first so
    -- the new one can keep its name.
    IF p_food_id IS NOT NULL THEN
      UPDATE public."FoodItem" SET "archivedAt" = now(), "lastUpdated" = now() WHERE id = p_food_id;
    END IF;
    INSERT INTO public."FoodItem" (name, brand, "defaultServingWeightGram", "defaultServingLiquidMl", "kcalPerServing",
      "proteinPerServing", "carbPerServing", "totalFatPerServing", "fiberPerServing", "sugarPerServing",
      "addedSugarPerServing", "satFatPerServing", "transFatPerServing", "isLiquid", "userId", "foodInfoSource",
      "bgeBaseEmbedding", description, verified, "privateToUserId", "recipePortions", "cookedWeightGram",
      "previousVersionId", "lastUpdated", gtin, "UPC")
    VALUES (pg_catalog.btrim(p_food->>'name'), nullif(pg_catalog.btrim(p_food->>'brand'), ''),
      (p_food->>'defaultServingWeightGram')::float8, (p_food->>'defaultServingLiquidMl')::float8, (p_food->>'kcal')::float8,
      coalesce((p_food->>'proteinG')::float8, 0), coalesce((p_food->>'carbG')::float8, 0),
      coalesce((p_food->>'totalFatG')::float8, 0), (p_food->>'fiberG')::float8, (p_food->>'sugarG')::float8,
      (p_food->>'addedSugarG')::float8, (p_food->>'satFatG')::float8, (p_food->>'transFatG')::float8,
      coalesce((p_food->>'isLiquid')::boolean, false), p_user_id, 'User',
      coalesce((p_food->>'bgeBaseEmbedding')::extensions.vector, old_row."bgeBaseEmbedding"),
      coalesce(p_food->>'description', old_row.description), false, p_user_id,
      (p_food->>'recipePortions')::numeric, (p_food->>'cookedWeightGram')::float8, p_food_id, now(),
      old_row.gtin, old_row."UPC")  -- a barcode moves to the new version; searches skip archived rows
    RETURNING id INTO target;
    IF p_food_id IS NOT NULL THEN
      -- The new version keeps the icon while its name is the same food; a renamed food gets its own from the queue.
      IF public.food_identity_key(old_row.name, old_row.brand) = identity THEN
        INSERT INTO public."FoodItemImages" ("foodItemId", "foodImageId", similarity)
        SELECT target, i."foodImageId", i.similarity FROM public."FoodItemImages" i WHERE i."foodItemId" = p_food_id;
      END IF;
      -- Favourites follow the new version, for the owner and everyone it's shared with.
      UPDATE public."UserFavoriteFoodItem" SET "foodItemId" = target, "servingId" = NULL
        WHERE "foodItemId" = p_food_id AND ("userId" = p_user_id OR "userId" IN (SELECT a."recipientId" FROM public."FoodAccess" a
          WHERE a."lineageId" = old_row."lineageId" AND a."revokedAt" IS NULL));
    END IF;
  END IF;

  INSERT INTO public."Serving" ("foodItemId", "servingName", "servingWeightGram", "defaultServingAmount")
  SELECT target, pg_catalog.btrim(s->>'name'), (s->>'grams')::float8, coalesce(nullif((s->>'amount')::numeric, 0), 1)
    FROM jsonb_array_elements(p_servings) s
    WHERE length(pg_catalog.btrim(coalesce(s->>'name', ''))) > 0 AND (s->>'grams')::float8 > 0;
  INSERT INTO public."Nutrient" ("foodItemId", "nutrientName", "nutrientUnit", "nutrientAmountPerDefaultServing")
  SELECT target, n->>'name', n->>'unit', (n->>'amount')::float8 FROM jsonb_array_elements(p_nutrients) n
    WHERE length(coalesce(n->>'name', '')) > 0 AND (n->>'amount')::float8 >= 0;
  IF is_recipe THEN
    INSERT INTO public."RecipeIngredient" ("recipeFoodItemId", "foodItemId", grams, "servingId", "servingAmount",
      "loggedUnit", position)
    SELECT target, (i->>'foodItemId')::integer, (i->>'grams')::float8, (i->>'servingId')::integer,
      (i->>'servingAmount')::float8, nullif(i->>'loggedUnit', ''), (o - 1)::smallint
      FROM jsonb_array_elements(p_ingredients) WITH ORDINALITY AS e(i, o);
  END IF;

  -- New foods reach partners who share everything; a recipe's new ingredients reach whoever it's shared with.
  PERFORM public.refresh_owner_access(p_user_id);
  RETURN QUERY SELECT target, p_food_id IS NULL, p_food_id IS NOT NULL AND in_use, p_food_id;
END;
$function$;

-- Account deletion ends every link first: everyone keeps copies of the deleted user's foods they used.
CREATE OR REPLACE FUNCTION public.end_all_links(p_user_id uuid) RETURNS integer
LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE other uuid;
  n integer := 0;
BEGIN
  FOR other IN SELECT CASE WHEN l."userLow" = p_user_id THEN l."userHigh" ELSE l."userLow" END FROM public."UserLink" l
      WHERE (l."userLow" = p_user_id OR l."userHigh" = p_user_id) AND l."endedAt" IS NULL LOOP
    PERFORM public.people_end_link(p_user_id, other);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$function$;

-- ---------------------------------------------------------------------------------------------------------------------

DO $$ DECLARE fn text; BEGIN
  FOR fn IN SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('active_link', 'person_name', 'blocked_between', 'link_label', 'link_grant',
      'people_create_invite', 'people_request_by_email', 'people_find_invite', 'people_invite_preview', 'people_respond',
      'people_list', 'people_set_grant', 'people_end_link', 'people_block', 'people_unblock', 'lineage_current',
      'unshareable_ingredients', 'free_food_name', 'copy_food_version', 'copy_food_lineage', 'detach_food_access',
      'refresh_food_access', 'refresh_owner_access', 'share_foods', 'food_shared_with', 'hide_shared_food',
      'create_food_copy_link', 'food_copy_link_preview', 'copy_food_from_link', 'revoke_food_copy_links', 'end_all_links',
      'save_food_copy')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;
