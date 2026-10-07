-- People and sharing (2026-10-07, plan: 2026-10-07-people-and-sharing-plan.md): the app shows a QR code per kind of link
-- (partner, friend, your client, your trainer), made together when the sheet opens, so switching between them is
-- instant. Showing a new code no longer retires the last: QR invites already expire after 15 minutes and work once.

CREATE OR REPLACE FUNCTION public.people_create_invite(p_user_id uuid, p_token_hash text, p_kind text,
  p_asks_to_log boolean, p_channel text) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE invite public."LinkInvite"%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_token_hash IS NULL OR length(p_token_hash) < 32 OR p_kind NOT IN ('friend', 'partner', 'trainer', 'client')
    OR p_channel NOT IN ('qr', 'link') THEN RAISE EXCEPTION 'invalid_invite' USING ERRCODE = '22023'; END IF;
  IF public.person_name(p_user_id) IS NULL THEN RAISE EXCEPTION 'name_required' USING ERRCODE = 'P0001'; END IF;
  IF (SELECT count(*) FROM public."LinkInvite" WHERE "inviterId" = p_user_id AND "createdAt" > now() - interval '1 day') >= 100
  THEN RAISE EXCEPTION 'too_many_invites' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public."LinkInvite" ("tokenHash", "inviterId", kind, "asksToLog", channel, "expiresAt")
  VALUES (p_token_hash, p_user_id, p_kind, coalesce(p_asks_to_log, false), p_channel,
    now() + CASE WHEN p_channel = 'qr' THEN interval '15 minutes' ELSE interval '7 days' END)
  RETURNING * INTO invite;
  RETURN jsonb_build_object('id', invite.id, 'expiresAt', invite."expiresAt");
END;
$function$;

NOTIFY pgrst, 'reload schema';
