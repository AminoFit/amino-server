-- Manual Pro grants (2026-10-17). A RevenueCat sync used to write RevenueCat's latest expiry over "User"
-- ."subscriptionExpiryDate", so an account given Pro by hand (the App Review demo account, the owner's own accounts)
-- lost it after a sandbox purchase or any webhook. A grant here is a floor: the sync stores the later of RevenueCat's
-- expiry and grantedUntil (src/subscription/getUserInfoFromRevenueCat.ts). Everyone else's expiry still follows
-- RevenueCat, so renewals, cancellations and refunds work as before. Server only: users can't grant themselves Pro.
SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public."SubscriptionGrant" (
  "userId" uuid PRIMARY KEY REFERENCES public."User"(id) ON DELETE CASCADE,
  "grantedUntil" timestamp without time zone NOT NULL,
  note text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public."SubscriptionGrant" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."SubscriptionGrant" FROM anon, authenticated;

-- Today's hand-set expiries (no RevenueCat purchase behind them) become grants, so the next sync keeps them.
INSERT INTO public."SubscriptionGrant" ("userId", "grantedUntil", note)
SELECT id, "subscriptionExpiryDate", 'Set by hand before 2026-10-17'
FROM public."User" WHERE id IN ('90af0633-bb7e-4978-8aaf-36f15cce9e05', 'e1000e7c-3730-4588-9172-26c107d5dceb',
  '6b005b82-88a5-457b-a1aa-60ecb1e90e21', '37a45ce0-2623-49ab-b63a-bab4f218afa3')
  AND "subscriptionExpiryDate" > now()
ON CONFLICT ("userId") DO NOTHING;

NOTIFY pgrst, 'reload schema';
