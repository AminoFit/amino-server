-- add_catalogue_food attaches a barcode no database has to the food Amino already has, when the barcode's listings
-- (UPCitemdb, Brave) name that product (2026-10-05-mcp-catalogue-adds-plan.md): recorded with its own source kind.
ALTER TABLE public."CatalogueAgentChange" DROP CONSTRAINT IF EXISTS "CatalogueAgentChange_sourceKind_check";
ALTER TABLE public."CatalogueAgentChange" ADD CONSTRAINT "CatalogueAgentChange_sourceKind_check"
  CHECK ("sourceKind" IN ('USDA', 'OpenFoodFacts', 'BarcodeName'));
