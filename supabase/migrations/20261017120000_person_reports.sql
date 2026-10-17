-- Reporting a person (2026-10-17, App Review 1.2: apps with user-generated content let people report abusive users).
-- The app reports someone it shows in People (by their id) or the person behind an invite it opened (QR code, link or
-- email request), before linking. A report is only stored: blocking is a separate choice in the app. The owner reviews
-- reports on /admin/reports and acts within 24 hours (terms of service, section 3.5). Written by the server only.
SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public."PersonReport" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "reporterId" uuid NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  "reportedUserId" uuid NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  "inviteId" uuid REFERENCES public."LinkInvite"(id) ON DELETE SET NULL,
  reason text CHECK (length(reason) <= 1000),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "reviewedAt" timestamptz,
  CHECK ("reporterId" <> "reportedUserId")
);
CREATE INDEX IF NOT EXISTS "PersonReport_created_idx" ON public."PersonReport"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "PersonReport_reporter_idx" ON public."PersonReport"("reporterId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "PersonReport_reported_idx" ON public."PersonReport"("reportedUserId");
ALTER TABLE public."PersonReport" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."PersonReport" FROM anon, authenticated;

-- Stores a report about a person (p_person) or the inviter behind an invite (people_find_invite: a token, or an email
-- request's id for its invitee). Any state of the invite counts (expired, declined), since the reason to report may be
-- why it was declined. At most 20 reports a day per reporter.
CREATE OR REPLACE FUNCTION public.people_report(p_user_id uuid, p_person uuid, p_token_hash text, p_invite_id uuid,
  p_reason text) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE invite public."LinkInvite"%ROWTYPE;
  reported uuid := p_person;
  reason text := nullif(pg_catalog.btrim(p_reason), '');
BEGIN
  IF p_user_id IS NULL OR (p_person IS NULL AND p_token_hash IS NULL AND p_invite_id IS NULL) OR length(reason) > 1000
  THEN RAISE EXCEPTION 'invalid_person' USING ERRCODE = '22023'; END IF;
  IF p_person IS NULL THEN
    invite := public.people_find_invite(p_user_id, p_token_hash, p_invite_id);
    IF invite.id IS NULL THEN RAISE EXCEPTION 'invite_unavailable' USING ERRCODE = 'P0001'; END IF;
    IF invite."inviterId" = p_user_id THEN RAISE EXCEPTION 'own_invite' USING ERRCODE = 'P0001'; END IF;
    reported := invite."inviterId";
  END IF;
  IF reported = p_user_id OR NOT EXISTS (SELECT 1 FROM public."User" WHERE id = reported)
  THEN RAISE EXCEPTION 'invalid_person' USING ERRCODE = '22023'; END IF;
  IF (SELECT count(*) FROM public."PersonReport" WHERE "reporterId" = p_user_id AND "createdAt" > now() - interval '1 day') >= 20
  THEN RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public."PersonReport" ("reporterId", "reportedUserId", "inviteId", reason)
  VALUES (p_user_id, reported, invite.id, reason);
  RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.people_report(uuid, uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.people_report(uuid, uuid, text, uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
