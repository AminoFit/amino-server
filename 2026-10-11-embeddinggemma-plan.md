# EmbeddingGemma for food search (plan, 2026-10-11)

Replace bge-base-en-v1.5 (English-only) with Google's EmbeddingGemma-300m for every food embedding: catalogue
foods, USDA records, search queries and icon matching. Same 768 dimensions, so the vector columns and HNSW
indexes keep their shape.

## Why

Quality test on 2026-10-11 (scratchpad `embedtest/`, about $0.02). The corpus was 14,127 shared catalogue foods,
embedded as production does. The queries were 1,500 real search names whose text differs from the logged food's
name, plus 250 of them translated into French, Spanish and German. A hit is the logged food or one with the same
name+brand identity.

| Model (Cloudflare) | English @1 | English @5 | FR/ES/DE @1 | FR/ES/DE @5 |
|---|---|---|---|---|
| bge-base (today) | 53.4% | 88.2% | 32.7% | 55.7% |
| bge-m3 1024 | 43.2% | 72.3% | 32.5% | 58.0% |
| bge-m3 → PCA 768 / random 768 | 43.7 / 42.8% | 72.8 / 72.6% | 31.9 / 32.1% | 58.3 / 58.0% |
| qwen3-embedding-0.6b | 34.3% | 61.9% | 25.3% | 50.3% |
| **embeddinggemma-300m** | 43.1% | 72.7% | **39.9%** | **68.8%** |

- **The answer key favours bge-base.** It comes from the old pipeline, which found candidates with bge-base, so
  bge-base's English lead is largely that pipeline's picks echoed back. Read by hand, its "wins" are mostly odd
  USDA records the old pipeline chose ("half boiled corn" → "Corn, Sweet, White, Cooked, Boiled, Drained…").
- **Gemma's wins are real understanding:** "2 cups of water" → water (bge-base: coffee with cream), "60g de
  cerises" → cherries (bge-base: Capri Sun), "tranche de pain blanc" → white bread.
- **bge-m3 is better at exact branded products** (McDonald's double cheeseburger, Hawaiian Punch). Text search
  already covers those, so vectors are left with the meaning and language cases, which is where Gemma leads.
- **Cutting 1024 → 768 costs nothing:** PCA and random projection both land within noise.

## Speed and cost

- **Single text:** median 311 ms, p90 617 ms (bge-base: 183 ms, p90 270 ms), so about 130 ms slower for each
  embedding that isn't already cached.
- **Batches:** 100 texts take about 0.9 s, the same as bge-base.
- **Search time:** unchanged, since the vectors are the same size.
- **Watch after the switch:** meal timings on the existing dashboards. Most query embeddings hit
  `foodEmbeddingCache`.
- **Fallback:** Deep Infra hosts the same model, and its vectors match Cloudflare's exactly (cosine 1.0000 on three
  texts), so the current Cloudflare → Deep Infra fallback carries over.
- **Price:** Cloudflare lists no price for the model; check the dashboard after the backfill. Deep Infra charged
  $2.8e-8 for one short text. The backfill is about 6M tokens either way: cents.

## Prompts (Gemma is asymmetric)

- **Queries:** `task: search result | query: {text}`
- **Foods (documents):** `title: none | text: {name - brand}`

Food names stay embedded as `getFoodEmbedding` builds them. Icon matching compares a food name (query) with icon
descriptions (documents). Duplicate checks between two foods (`admin_similar_foods`, merges) compare documents with
documents.

## Where bge-base is used

- **Columns:**
  - `FoodItem.bgeBaseEmbedding`: 14k rows, HNSW 55 MB.
  - `UsdaFoodItemEmbedding.bgeBaseEmbedding`: 470k rows, HNSW 1.8 GB.
  - `foodEmbeddingCache.bgeBaseEmbedding`: 187k query texts, no index.
  - `FoodImage.bgeBaseEmbedding`: 1.4k icons.
- **SQL functions:** admin_similar_foods, copy_food_version, create_catalogue_food, food_icon_candidates,
  get_branded_usda_embedding, get_cosine_results, get_top_foodimage_embedding_similarity,
  get_top_foodimage_foodid_similarity, get_unbranded_usda_embedding, merge_catalogue_food, save_user_food,
  search_food_catalogue_nearest, search_usda_database, supersede_catalogue_estimate.
- **Code:** `getCachedOrFetchEmbeddings` and `getFoodEmbedding` (every caller goes through these), plus searchFoods,
  evidence, foodSources, usda, userFoods, search-images and generate-food-icon. The app doesn't use embeddings.

## Steps

1. **Columns.** Add `gemmaEmbedding vector(768)` to FoodItem, UsdaFoodItemEmbedding and FoodImage. Add
   `gemmaQueryEmbedding` and `gemmaDocEmbedding` to foodEmbeddingCache, since one text can be embedded in both
   roles. Adding nullable columns doesn't rewrite the table. Run with `lock_timeout` (the stored identity columns
   on 2026-10-10 held FoodItem for 2 minutes).
2. **Write both.** `getCachedOrFetchEmbeddings` takes a role (query / document) and returns both models' vectors
   while the switch is under way. Every write path stores both: create_catalogue_food, save_user_food,
   copy_food_version, the USDA add, userFoods and icons.
3. **Backfill.** Batches of 100 through Cloudflare, with Deep Infra as fallback. That's about 4,900 calls for
   FoodItem, USDA and FoodImage, under an hour. The cache refills itself as people search. Rewriting the USDA rows
   also frees the dropped bge-large space after vacuum.
4. **Indexes.** HNSW on the new columns with `CREATE INDEX CONCURRENTLY`, which takes no lock on reads or writes.
   The USDA index build takes about 10–30 minutes.
   - **Disk:** about +1.4 GB of vectors and +1.8 GB of index while both models are stored, minus the ~1.2 GB of
     bge-large vectors already dropped. About 6.1 → 8 GB, back to today's size after step 6.
5. **Switch reads.** One migration repoints the 14 functions at the Gemma columns, and one deploy switches the
   query prompts. No flag: if it goes wrong, revert the deploy and the migration, because the bge-base columns are
   still written. Check before and after with the replay eval and the search timings (2026-10-08-search-speed.md).
6. **Remove bge-base.** About a week later: stop writing it, drop the columns and indexes, and repack USDA to give
   the disk back.

## Before step 1 (optional, about $0.05)

The answer key above is biased towards bge-base. For an unbiased English number, Gemini Flash Lite would judge each
model's top result for 300 queries (acceptable match or not), with Gemini Embedding 2 added as one more contender.
