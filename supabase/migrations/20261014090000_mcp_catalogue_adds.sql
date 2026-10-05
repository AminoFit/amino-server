-- Agents add catalogue foods from a USDA record or a barcode (2026-10-05-mcp-catalogue-adds-plan.md). Every catalogue
-- change an agent causes is recorded here with the user and the agent, so a bad agent's changes can be found and undone:
-- a created food, or an existing food's state before it was enriched (barcode, empty nutrients, servings, an alias),
-- had its estimate replaced, or was given another package's barcode. A lookup that changes nothing writes no row.
CREATE TABLE IF NOT EXISTS public."CatalogueAgentChange" (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "userId" uuid NOT NULL,
  "clientId" text NOT NULL,
  "agentName" text,
  "foodItemId" integer NOT NULL,
  action text NOT NULL CHECK (action IN ('created', 'enriched', 'superseded', 'package_barcode')),
  "sourceKind" text NOT NULL CHECK ("sourceKind" IN ('USDA', 'OpenFoodFacts')),
  "sourceRef" text NOT NULL,
  -- What changed: fields (before and after), and the servings, barcodes and nutrients added.
  changes jsonb,
  -- An existing food before the change: its row, servings, package barcodes and nutrients.
  before jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public."CatalogueAgentChange" IS 'Shared catalogue foods created or changed through MCP, by user and agent, for repair and rollback.';
CREATE INDEX IF NOT EXISTS "CatalogueAgentChange_userId_createdAt_idx" ON public."CatalogueAgentChange"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "CatalogueAgentChange_clientId_idx" ON public."CatalogueAgentChange"("clientId");
CREATE INDEX IF NOT EXISTS "CatalogueAgentChange_foodItemId_idx" ON public."CatalogueAgentChange"("foodItemId");
ALTER TABLE public."CatalogueAgentChange" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."CatalogueAgentChange" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public."CatalogueAgentChange_id_seq" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public."CatalogueAgentChange" TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public."CatalogueAgentChange_id_seq" TO service_role;

-- Rollout and kill switch: the owner first.
INSERT INTO public."FeatureFlag"(name, value) VALUES ('mcp_catalogue_adds', '6b005b82-88a5-457b-a1aa-60ecb1e90e21')
  ON CONFLICT (name) DO NOTHING;
