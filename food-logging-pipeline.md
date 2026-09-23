# Food Logging LLM Pipeline - Optimized Design

## Complete System Diagram

```mermaid
flowchart TB
    subgraph Entry["Entry"]
        MSG["User Message + Images?"]
        NORM["Normalize input: lowercase, trim, fix typos"]
    end

    subgraph FastCheck["Fast Path Check - under 50ms"]
        HIST_LOOKUP[("user_food_history lookup")]
        CONF{"Confidence > 0.8?"}
        INSTANT["Return cached food_id + serving_id"]
    end

    subgraph Triage["Smart Triage"]
        HAS_IMG{"Has images?"}
        MULTI{"Multiple items?"}
    end

    subgraph Barcode["Barcode Detection"]
        BC_WHOLE["Whole image via Quagga"]
        BC_ROT{"Found?"}
        BC_90["Rotate 90 deg via Quagga"]
        BC_ZXING{"Found?"}
        BC_FALLBACK["ZXing fallback both orientations"]
        BC_RESULT{"Valid UPC?"}
        UPC_FAST["UPC Fast Path: Direct DB lookup"]
    end

    subgraph Vision["Vision Processing"]
        V1["GPT-4o Vision: Original orientation"]
        V1_CHECK{"Items found?"}
        V2["Rotate 90 deg + retry"]
        V2_CHECK{"Items found?"}
        V3["Rotate 180 deg + retry"]
        V3_CHECK{"Items found?"}
        V_FAIL["Fall back to text-only"]
    end

    subgraph Text["Text Extraction"]
        STREAM["GPT-4o-mini Streaming JSON"]
        PARSE["extractLatestValidJSON via bracket matching"]
        COMBINED["Combined prompt: food items, time/date, serving hints"]
    end

    subgraph PerItem["Per-Item Processing"]
        ITEM["Next food item"]
        ITEM_HIST{"In user history?"}
        ITEM_FAST["Use cached match"]

        subgraph Matching["Full Matching"]
            EMBED["Generate embedding via BGE_BASE"]
            VECTOR["Vector search: top 20, threshold 0.7"]
            RANK["GPT-4o-mini re-rank candidates"]
            RANK_CONF{"High confidence?"}
            USDA["USDA API"]
            USDA_FOUND{"Found?"}
            ONLINE["Online search as last resort"]
        end

        subgraph Serving["Serving Calculation"]
            SERVE_HIST{"Serving cached?"}
            SERVE_LLM["GPT-4o-mini: NL to grams"]
            NUTRIENTS["Scale 40+ nutrients"]
        end
    end

    subgraph Persist["Save and Learn"]
        SAVE["Save LoggedFoodItem"]
        UPDATE_HIST["Update user_food_history: +1 times_logged"]
        TRACK["Track resolution_path for analytics"]
    end

    subgraph Errors["Error Recovery"]
        ERR_VIS["Vision failed all rotations"]
        ERR_EXT["No items extracted"]
        ERR_MATCH["No match found"]
        ERR_SERVE["Serving parse failed"]

        REC_TEXT["Text-only fallback"]
        REC_BAD["isBadFoodLogRequest"]
        REC_GENERIC["Create generic entry"]
        REC_DEFAULT["Default serving x 1"]
    end

    subgraph Feedback["Learning Loop"]
        CORRECT["User corrects item"]
        WAS_CACHED{"From cache?"}
        PENALTY["Decrement confidence: times_corrected++"]
        LEARN["Update history with correct mapping"]
    end

    %% MAIN FLOW

    MSG --> NORM

    %% Fast path check first for text-only single item
    NORM --> HAS_IMG
    HAS_IMG -->|No text only| MULTI
    MULTI -->|No single item| HIST_LOOKUP
    HIST_LOOKUP --> CONF
    CONF -->|Yes| INSTANT --> SAVE
    CONF -->|No| STREAM
    MULTI -->|Yes multiple| STREAM

    %% Image path
    HAS_IMG -->|Yes| BC_WHOLE

    %% Barcode detection chain
    BC_WHOLE --> BC_ROT
    BC_ROT -->|No| BC_90 --> BC_ZXING
    BC_ROT -->|Yes| BC_RESULT
    BC_ZXING -->|No| BC_FALLBACK --> BC_RESULT
    BC_ZXING -->|Yes| BC_RESULT

    BC_RESULT -->|Yes| UPC_FAST --> SERVE_HIST
    BC_RESULT -->|No| V1

    %% Vision rotation chain
    V1 --> V1_CHECK
    V1_CHECK -->|No| V2 --> V2_CHECK
    V1_CHECK -->|Yes| COMBINED
    V2_CHECK -->|No| V3 --> V3_CHECK
    V2_CHECK -->|Yes| COMBINED
    V3_CHECK -->|No| V_FAIL --> ERR_VIS
    V3_CHECK -->|Yes| COMBINED

    %% Text extraction
    STREAM --> PARSE --> COMBINED

    %% Per-item loop
    COMBINED --> ITEM
    ITEM --> ITEM_HIST
    ITEM_HIST -->|Yes| ITEM_FAST --> SERVE_HIST
    ITEM_HIST -->|No| EMBED

    %% Full matching
    EMBED --> VECTOR --> RANK --> RANK_CONF
    RANK_CONF -->|Yes| SERVE_HIST
    RANK_CONF -->|No| USDA --> USDA_FOUND
    USDA_FOUND -->|Yes| SERVE_HIST
    USDA_FOUND -->|No| ONLINE --> SERVE_HIST

    %% Serving calculation
    SERVE_HIST -->|Yes| NUTRIENTS
    SERVE_HIST -->|No| SERVE_LLM --> NUTRIENTS

    %% Persist
    NUTRIENTS --> SAVE --> UPDATE_HIST --> TRACK

    %% More items check
    TRACK --> MORE{"More items?"}
    MORE -->|Yes| ITEM
    MORE -->|No| DONE["Message RESOLVED"]

    %% Error recovery
    ERR_VIS --> REC_TEXT --> STREAM
    ERR_EXT --> REC_BAD
    ERR_MATCH --> REC_GENERIC --> SERVE_HIST
    ERR_SERVE --> REC_DEFAULT --> NUTRIENTS

    %% Learning loop
    CORRECT --> WAS_CACHED
    WAS_CACHED -->|Yes| PENALTY --> LEARN
    WAS_CACHED -->|No| LEARN
    LEARN -.->|Improves| HIST_LOOKUP
```

---

## Speed Comparison

| Path | Steps | Latency | When Used |
|------|-------|---------|-----------|
| History Fast Path | 1 DB lookup | ~50ms | Repeat foods, high confidence |
| UPC Fast Path | Barcode + 1 DB lookup | ~200ms | Valid barcode detected |
| Item History | Per-item DB lookup | ~50ms/item | Known items in multi-food message |
| Serving Cache | 1 DB lookup | ~20ms | Same food+serving combo |
| Full Text Path | LLM + Match + Serve | ~3-5s | New foods, text only |
| Full Vision Path | Barcode + Vision + Match | ~5-8s | New foods with images |
| Vision + Rotation | Up to 3 vision calls | ~10-15s | Difficult images |

---

## Fast Path Coverage Over Time

```
Week 1:   ####................ 20% fast path
Week 2:   ########............ 40% fast path
Week 4:   ############........ 60% fast path
Week 8:   ################.... 80% fast path
Week 12+: #################### 85%+ fast path
```

---

## All Edge Cases Handled

| Edge Case | Handling | Fast Path? |
|-----------|----------|------------|
| Rotated food photo | Try 0 -> 90 -> 180 -> text fallback | No |
| Barcode anywhere in image | Quagga -> ZXing, both orientations | UPC lookup |
| UPC-A vs EAN-13 leading zeros | Normalize before lookup | Yes |
| Streaming partial JSON | Bracket-counting parser | N/A |
| My usual coffee | Normalize + history lookup | Yes |
| Multiple items in one message | Per-item history check | Per item |
| Explicit nutrition like 200 kcal | LLM extraction, cannot skip | No |
| Unusual serving like half a handful | LLM serving estimation | No |
| No match in any database | Create generic entry | No |
| User corrects wrong match | Update history, decay confidence | Learns |
| Old preferences over 90 days | Confidence decay via cron | Auto-clean |
| New user with no history | Full path, builds history | Builds over time |
| Image completely unusable | Fall back to text extraction | Degrades gracefully |

---

## LLM Calls: Before vs After

| Scenario | Before | After with history |
|----------|--------|----------------------|
| banana 10th time | 3 LLM calls | 0 LLM calls |
| 2 eggs, toast, coffee usual breakfast | 9+ LLM calls | 0 LLM calls |
| Photo of Starbucks cup with barcode | 1 vision + 2 LLM | 0 LLM calls |
| New food, text only | 3 LLM calls | 3 LLM calls then cached |
| New food, with image | 1 vision + 2 LLM | 1 vision + 2 LLM then cached |

**Expected savings: 70-85% reduction in LLM costs for active users**

---

## LLM Provider Consolidation

| Task | Before | After |
|------|--------|-------|
| Time extraction | Claude Haiku | Merged into food extraction |
| Food extraction text | GPT-4o-mini | GPT-4o-mini unchanged |
| Food extraction images | GPT-4o | GPT-4o unchanged |
| Food matching re-rank | Various | GPT-4o-mini |
| Serving estimation | Gemini 1.5 Pro | GPT-4o-mini |

**Providers reduced from 4 to 1 (OpenAI only)**

---

## Database Schema Addition

```sql
CREATE TABLE user_food_history (
    id                  UUID PRIMARY KEY,
    user_id             UUID NOT NULL REFERENCES users(id),

    -- Matching keys
    normalized_input    TEXT NOT NULL,
    input_variants      TEXT[],
    upc_code            TEXT,

    -- Cached result
    food_item_id        UUID REFERENCES food_items(id),
    serving_id          UUID REFERENCES servings(id),
    default_amount      DECIMAL,

    -- Confidence signals
    times_logged        INT DEFAULT 1,
    times_confirmed     INT DEFAULT 0,
    times_corrected     INT DEFAULT 0,
    confidence_score    DECIMAL GENERATED ALWAYS AS (
        (times_confirmed::decimal - times_corrected * 2) / NULLIF(times_logged, 0)
    ) STORED,

    -- Context
    last_logged_at      TIMESTAMP,
    created_at          TIMESTAMP DEFAULT NOW(),

    UNIQUE(user_id, normalized_input),
    INDEX(user_id, confidence_score DESC)
);

-- Track resolution path for analytics
ALTER TABLE logged_food_items ADD COLUMN resolution_path TEXT;
-- Values: fast_history, upc_lookup, vector_match, llm_rank, usda, online, manual
```

---

## Key Optimizations Summary

1. **User food history** - Skip entire pipeline for repeat foods
2. **UPC fast path** - Barcode goes straight to DB lookup
3. **Per-item history check** - Even in multi-item messages, known items skip matching
4. **Serving cache** - Same food + serving combo is instant
5. **Merged time extraction** - One LLM call instead of two parallel
6. **Provider consolidation** - Single provider simplifies ops
7. **Learning loop** - System improves with every correction
