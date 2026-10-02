export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "11.2.0 (c820efb)"
  }
  public: {
    Tables: {
      _prisma_migrations: {
        Row: {
          applied_steps_count: number
          checksum: string
          finished_at: string | null
          id: string
          logs: string | null
          migration_name: string
          rolled_back_at: string | null
          started_at: string
        }
        Insert: {
          applied_steps_count?: number
          checksum: string
          finished_at?: string | null
          id: string
          logs?: string | null
          migration_name: string
          rolled_back_at?: string | null
          started_at?: string
        }
        Update: {
          applied_steps_count?: number
          checksum?: string
          finished_at?: string | null
          id?: string
          logs?: string | null
          migration_name?: string
          rolled_back_at?: string | null
          started_at?: string
        }
        Relationships: []
      }
      Account: {
        Row: {
          access_token: string | null
          expires_at: number | null
          id: string
          id_token: string | null
          provider: string
          providerAccountId: string
          refresh_token: string | null
          scope: string | null
          session_state: string | null
          token_type: string | null
          type: string
          userId: string
        }
        Insert: {
          access_token?: string | null
          expires_at?: number | null
          id: string
          id_token?: string | null
          provider: string
          providerAccountId: string
          refresh_token?: string | null
          scope?: string | null
          session_state?: string | null
          token_type?: string | null
          type: string
          userId: string
        }
        Update: {
          access_token?: string | null
          expires_at?: number | null
          id?: string
          id_token?: string | null
          provider?: string
          providerAccountId?: string
          refresh_token?: string | null
          scope?: string | null
          session_state?: string | null
          token_type?: string | null
          type?: string
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "Account_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
        ]
      }
      ApiCalls: {
        Row: {
          apiName: string
          count: number
          id: number
          queryType: string
          timestamp: string
        }
        Insert: {
          apiName: string
          count: number
          id?: number
          queryType: string
          timestamp?: string
        }
        Update: {
          apiName?: string
          count?: number
          id?: number
          queryType?: string
          timestamp?: string
        }
        Relationships: []
      }
      ApiTokens: {
        Row: {
          apiName: string
          expires: string
          id: number
          timestamp: string
          token: string
        }
        Insert: {
          apiName: string
          expires: string
          id?: number
          timestamp?: string
          token: string
        }
        Update: {
          apiName?: string
          expires?: string
          id?: number
          timestamp?: string
          token?: string
        }
        Relationships: []
      }
      CatalogueAuditBackup: {
        Row: {
          audit: string
          before: Json
          createdAt: string
          id: number
          rowId: number
          tableName: string
        }
        Insert: {
          audit: string
          before: Json
          createdAt?: string
          id?: number
          rowId: number
          tableName: string
        }
        Update: {
          audit?: string
          before?: Json
          createdAt?: string
          id?: number
          rowId?: number
          tableName?: string
        }
        Relationships: []
      }
      ExpoPushTokens: {
        Row: {
          created_at: string
          id: number
          key: string
          userId: string
        }
        Insert: {
          created_at?: string
          id?: number
          key: string
          userId: string
        }
        Update: {
          created_at?: string
          id?: number
          key?: string
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "ExpoPushTokens_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
        ]
      }
      FeatureFlag: {
        Row: {
          name: string
          updatedAt: string
          value: string
        }
        Insert: {
          name: string
          updatedAt?: string
          value: string
        }
        Update: {
          name?: string
          updatedAt?: string
          value?: string
        }
        Relationships: []
      }
      foodEmbeddingCache: {
        Row: {
          adaEmbedding: string | null
          bgeBaseEmbedding: string | null
          createdAt: string
          id: number
          textToEmbed: string
        }
        Insert: {
          adaEmbedding?: string | null
          bgeBaseEmbedding?: string | null
          createdAt?: string
          id?: number
          textToEmbed: string
        }
        Update: {
          adaEmbedding?: string | null
          bgeBaseEmbedding?: string | null
          createdAt?: string
          id?: number
          textToEmbed?: string
        }
        Relationships: []
      }
      FoodImage: {
        Row: {
          bgeBaseEmbedding: string | null
          downvotes: number
          id: number
          imageDescription: string | null
          originalPath: string | null
          pathToImage: string
        }
        Insert: {
          bgeBaseEmbedding?: string | null
          downvotes?: number
          id?: number
          imageDescription?: string | null
          originalPath?: string | null
          pathToImage: string
        }
        Update: {
          bgeBaseEmbedding?: string | null
          downvotes?: number
          id?: number
          imageDescription?: string | null
          originalPath?: string | null
          pathToImage?: string
        }
        Relationships: []
      }
      FoodItem: {
        Row: {
          adaEmbedding: string | null
          addedSugarPerServing: number | null
          archivedAt: string | null
          bgeBaseEmbedding: string | null
          brand: string | null
          carbPerServing: number
          cookedWeightGram: number | null
          createdAtDateTime: string
          defaultServingLiquidMl: number | null
          defaultServingWeightGram: number | null
          description: string | null
          externalId: string | null
          fiberPerServing: number | null
          foodInfoSource: Database["public"]["Enums"]["FoodInfoSource"]
          foodItemCategoryID: string | null
          foodItemCategoryName: string | null
          gtin: string | null
          id: number
          isLiquid: boolean
          kcalPerServing: number
          knownAs: string[] | null
          lastUpdated: string
          messageId: number | null
          name: string
          previousVersionId: number | null
          privateToUserId: string | null
          proteinPerServing: number
          recipePortions: number | null
          satFatPerServing: number | null
          sugarPerServing: number | null
          totalFatPerServing: number
          transFatPerServing: number | null
          UPC: number | null
          userId: string | null
          verified: boolean
          weightUnknown: boolean
        }
        Insert: {
          adaEmbedding?: string | null
          addedSugarPerServing?: number | null
          archivedAt?: string | null
          bgeBaseEmbedding?: string | null
          brand?: string | null
          carbPerServing?: number
          cookedWeightGram?: number | null
          createdAtDateTime?: string
          defaultServingLiquidMl?: number | null
          defaultServingWeightGram?: number | null
          description?: string | null
          externalId?: string | null
          fiberPerServing?: number | null
          foodInfoSource?: Database["public"]["Enums"]["FoodInfoSource"]
          foodItemCategoryID?: string | null
          foodItemCategoryName?: string | null
          gtin?: string | null
          id?: number
          isLiquid?: boolean
          kcalPerServing?: number
          knownAs?: string[] | null
          lastUpdated?: string
          messageId?: number | null
          name?: string
          previousVersionId?: number | null
          privateToUserId?: string | null
          proteinPerServing?: number
          recipePortions?: number | null
          satFatPerServing?: number | null
          sugarPerServing?: number | null
          totalFatPerServing?: number
          transFatPerServing?: number | null
          UPC?: number | null
          userId?: string | null
          verified?: boolean
          weightUnknown?: boolean
        }
        Update: {
          adaEmbedding?: string | null
          addedSugarPerServing?: number | null
          archivedAt?: string | null
          bgeBaseEmbedding?: string | null
          brand?: string | null
          carbPerServing?: number
          cookedWeightGram?: number | null
          createdAtDateTime?: string
          defaultServingLiquidMl?: number | null
          defaultServingWeightGram?: number | null
          description?: string | null
          externalId?: string | null
          fiberPerServing?: number | null
          foodInfoSource?: Database["public"]["Enums"]["FoodInfoSource"]
          foodItemCategoryID?: string | null
          foodItemCategoryName?: string | null
          gtin?: string | null
          id?: number
          isLiquid?: boolean
          kcalPerServing?: number
          knownAs?: string[] | null
          lastUpdated?: string
          messageId?: number | null
          name?: string
          previousVersionId?: number | null
          privateToUserId?: string | null
          proteinPerServing?: number
          recipePortions?: number | null
          satFatPerServing?: number | null
          sugarPerServing?: number | null
          totalFatPerServing?: number
          transFatPerServing?: number | null
          UPC?: number | null
          userId?: string | null
          verified?: boolean
          weightUnknown?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "FoodItem_messageId_fkey"
            columns: ["messageId"]
            isOneToOne: false
            referencedRelation: "Message"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "FoodItem_previousVersionId_fkey"
            columns: ["previousVersionId"]
            isOneToOne: false
            referencedRelation: "FoodItem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "FoodItem_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
        ]
      }
      FoodItemConflict: {
        Row: {
          createdAt: string
          existing: Json
          foodItemId: number
          id: number
          proposed: Json
          source: string
        }
        Insert: {
          createdAt?: string
          existing: Json
          foodItemId: number
          id?: number
          proposed: Json
          source: string
        }
        Update: {
          createdAt?: string
          existing?: Json
          foodItemId?: number
          id?: number
          proposed?: Json
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "FoodItemConflict_foodItemId_fkey"
            columns: ["foodItemId"]
            isOneToOne: false
            referencedRelation: "FoodItem"
            referencedColumns: ["id"]
          },
        ]
      }
      FoodItemImages: {
        Row: {
          createdAt: string
          foodImageId: number | null
          foodItemId: number | null
          id: number
          similarity: number
        }
        Insert: {
          createdAt?: string
          foodImageId?: number | null
          foodItemId?: number | null
          id?: number
          similarity?: number
        }
        Update: {
          createdAt?: string
          foodImageId?: number | null
          foodItemId?: number | null
          id?: number
          similarity?: number
        }
        Relationships: [
          {
            foreignKeyName: "FoodItemImages_foodImageId_fkey"
            columns: ["foodImageId"]
            isOneToOne: false
            referencedRelation: "FoodImage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "FoodItemImages_foodItemId_fkey"
            columns: ["foodItemId"]
            isOneToOne: false
            referencedRelation: "FoodItem"
            referencedColumns: ["id"]
          },
        ]
      }
      FoodMicroFill: {
        Row: {
          createdAt: string
          foodItemId: number
          id: number
          keys: string[]
          source: string
        }
        Insert: {
          createdAt?: string
          foodItemId: number
          id?: number
          keys: string[]
          source: string
        }
        Update: {
          createdAt?: string
          foodItemId?: number
          id?: number
          keys?: string[]
          source?: string
        }
        Relationships: []
      }
      IconQueue: {
        Row: {
          created_at: string
          finished_at: string | null
          id: number
          requested_food_item_id: number | null
          result: Database["public"]["Enums"]["GenerateIconResult"] | null
          started_at: string | null
        }
        Insert: {
          created_at?: string
          finished_at?: string | null
          id?: number
          requested_food_item_id?: number | null
          result?: Database["public"]["Enums"]["GenerateIconResult"] | null
          started_at?: string | null
        }
        Update: {
          created_at?: string
          finished_at?: string | null
          id?: number
          requested_food_item_id?: number | null
          result?: Database["public"]["Enums"]["GenerateIconResult"] | null
          started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "IconQueue_requested_food_item_id_fkey"
            columns: ["requested_food_item_id"]
            isOneToOne: false
            referencedRelation: "FoodItem"
            referencedColumns: ["id"]
          },
        ]
      }
      LoggedFoodItem: {
        Row: {
          addedSugarG: number | null
          alcoholG: number | null
          caffeineMg: number | null
          calciumMg: number | null
          carbG: number | null
          cholesterolMg: number | null
          consumedOn: string
          copperMg: number | null
          createdAt: string
          deletedAt: string | null
          embeddingId: number | null
          extendedOpenAiData: Json | null
          fiberG: number | null
          foodItemId: number | null
          grams: number
          id: number
          iodineMcg: number | null
          ironMg: number | null
          isBadFoodItemRequest: boolean | null
          kcal: number | null
          local_id: string | null
          loggedUnit: string | null
          logicalItemId: string | null
          magnesiumMg: number | null
          manganeseMg: number | null
          messageId: number | null
          monounsatFatG: number | null
          omega3Mg: number | null
          omega6Mg: number | null
          phosphorusMg: number | null
          polyunsatFatG: number | null
          potassiumMg: number | null
          proteinG: number | null
          publishedRevision: number
          satFatG: number | null
          seleniumMcg: number | null
          servingAmount: number | null
          servingId: number | null
          sodiumMg: number | null
          status: string | null
          sugarG: number | null
          totalFatG: number | null
          transFatG: number | null
          unsatFatG: number | null
          updatedAt: string
          userId: string
          vitaminAMcg: number | null
          vitaminB12Mcg: number | null
          vitaminB1Mg: number | null
          vitaminB2Mg: number | null
          vitaminB3Mg: number | null
          vitaminB5Mg: number | null
          vitaminB6Mg: number | null
          vitaminB7Mcg: number | null
          vitaminB9Mcg: number | null
          vitaminCMg: number | null
          vitaminDMcg: number | null
          vitaminEMg: number | null
          vitaminKMcg: number | null
          waterMl: number | null
          zincMg: number | null
        }
        Insert: {
          addedSugarG?: number | null
          alcoholG?: number | null
          caffeineMg?: number | null
          calciumMg?: number | null
          carbG?: number | null
          cholesterolMg?: number | null
          consumedOn?: string
          copperMg?: number | null
          createdAt?: string
          deletedAt?: string | null
          embeddingId?: number | null
          extendedOpenAiData?: Json | null
          fiberG?: number | null
          foodItemId?: number | null
          grams?: number
          id?: number
          iodineMcg?: number | null
          ironMg?: number | null
          isBadFoodItemRequest?: boolean | null
          kcal?: number | null
          local_id?: string | null
          loggedUnit?: string | null
          logicalItemId?: string | null
          magnesiumMg?: number | null
          manganeseMg?: number | null
          messageId?: number | null
          monounsatFatG?: number | null
          omega3Mg?: number | null
          omega6Mg?: number | null
          phosphorusMg?: number | null
          polyunsatFatG?: number | null
          potassiumMg?: number | null
          proteinG?: number | null
          publishedRevision?: number
          satFatG?: number | null
          seleniumMcg?: number | null
          servingAmount?: number | null
          servingId?: number | null
          sodiumMg?: number | null
          status?: string | null
          sugarG?: number | null
          totalFatG?: number | null
          transFatG?: number | null
          unsatFatG?: number | null
          updatedAt?: string
          userId: string
          vitaminAMcg?: number | null
          vitaminB12Mcg?: number | null
          vitaminB1Mg?: number | null
          vitaminB2Mg?: number | null
          vitaminB3Mg?: number | null
          vitaminB5Mg?: number | null
          vitaminB6Mg?: number | null
          vitaminB7Mcg?: number | null
          vitaminB9Mcg?: number | null
          vitaminCMg?: number | null
          vitaminDMcg?: number | null
          vitaminEMg?: number | null
          vitaminKMcg?: number | null
          waterMl?: number | null
          zincMg?: number | null
        }
        Update: {
          addedSugarG?: number | null
          alcoholG?: number | null
          caffeineMg?: number | null
          calciumMg?: number | null
          carbG?: number | null
          cholesterolMg?: number | null
          consumedOn?: string
          copperMg?: number | null
          createdAt?: string
          deletedAt?: string | null
          embeddingId?: number | null
          extendedOpenAiData?: Json | null
          fiberG?: number | null
          foodItemId?: number | null
          grams?: number
          id?: number
          iodineMcg?: number | null
          ironMg?: number | null
          isBadFoodItemRequest?: boolean | null
          kcal?: number | null
          local_id?: string | null
          loggedUnit?: string | null
          logicalItemId?: string | null
          magnesiumMg?: number | null
          manganeseMg?: number | null
          messageId?: number | null
          monounsatFatG?: number | null
          omega3Mg?: number | null
          omega6Mg?: number | null
          phosphorusMg?: number | null
          polyunsatFatG?: number | null
          potassiumMg?: number | null
          proteinG?: number | null
          publishedRevision?: number
          satFatG?: number | null
          seleniumMcg?: number | null
          servingAmount?: number | null
          servingId?: number | null
          sodiumMg?: number | null
          status?: string | null
          sugarG?: number | null
          totalFatG?: number | null
          transFatG?: number | null
          unsatFatG?: number | null
          updatedAt?: string
          userId?: string
          vitaminAMcg?: number | null
          vitaminB12Mcg?: number | null
          vitaminB1Mg?: number | null
          vitaminB2Mg?: number | null
          vitaminB3Mg?: number | null
          vitaminB5Mg?: number | null
          vitaminB6Mg?: number | null
          vitaminB7Mcg?: number | null
          vitaminB9Mcg?: number | null
          vitaminCMg?: number | null
          vitaminDMcg?: number | null
          vitaminEMg?: number | null
          vitaminKMcg?: number | null
          waterMl?: number | null
          zincMg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "LoggedFoodItem_embeddingId_fkey"
            columns: ["embeddingId"]
            isOneToOne: false
            referencedRelation: "foodEmbeddingCache"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "LoggedFoodItem_foodItemId_fkey"
            columns: ["foodItemId"]
            isOneToOne: false
            referencedRelation: "FoodItem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "LoggedFoodItem_messageId_fkey"
            columns: ["messageId"]
            isOneToOne: false
            referencedRelation: "Message"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "LoggedFoodItem_servingId_fkey"
            columns: ["servingId"]
            isOneToOne: false
            referencedRelation: "Serving"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "LoggedFoodItem_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
        ]
      }
      LoggedFoodItemMicroFill: {
        Row: {
          createdAt: string
          filled: Json
          id: number
          loggedFoodItemId: number
        }
        Insert: {
          createdAt?: string
          filled: Json
          id?: number
          loggedFoodItemId: number
        }
        Update: {
          createdAt?: string
          filled?: Json
          id?: number
          loggedFoodItemId?: number
        }
        Relationships: []
      }
      McpRequest: {
        Row: {
          clientId: string | null
          createdAt: string
          durationMs: number
          errorCode: string | null
          id: number
          ok: boolean
          rows: number | null
          tool: string
          userId: string
        }
        Insert: {
          clientId?: string | null
          createdAt?: string
          durationMs: number
          errorCode?: string | null
          id?: never
          ok: boolean
          rows?: number | null
          tool: string
          userId: string
        }
        Update: {
          clientId?: string | null
          createdAt?: string
          durationMs?: number
          errorCode?: string | null
          id?: never
          ok?: boolean
          rows?: number | null
          tool?: string
          userId?: string
        }
        Relationships: []
      }
      MealChange: {
        Row: {
          changedAt: string
          messageId: number
          userId: string
        }
        Insert: {
          changedAt?: string
          messageId: number
          userId: string
        }
        Update: {
          changedAt?: string
          messageId?: number
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "MealChange_messageId_fkey"
            columns: ["messageId"]
            isOneToOne: true
            referencedRelation: "Message"
            referencedColumns: ["id"]
          },
        ]
      }
      MealOperation: {
        Row: {
          action: string
          answers: Json
          attempts: number
          clientMealId: string
          completedAt: string | null
          createdAt: string
          errorCode: string | null
          expectedPublishedRevision: number | null
          generation: number
          id: string
          input: Json
          leaseUntil: string | null
          messageId: number
          nextAttemptAt: string | null
          payloadHash: string
          plan: Json | null
          result: Json | null
          state: string
          updatedAt: string
          userId: string
          version: number
          workerToken: string | null
        }
        Insert: {
          action: string
          answers?: Json
          attempts?: number
          clientMealId: string
          completedAt?: string | null
          createdAt?: string
          errorCode?: string | null
          expectedPublishedRevision?: number | null
          generation: number
          id: string
          input: Json
          leaseUntil?: string | null
          messageId: number
          nextAttemptAt?: string | null
          payloadHash: string
          plan?: Json | null
          result?: Json | null
          state?: string
          updatedAt?: string
          userId: string
          version?: number
          workerToken?: string | null
        }
        Update: {
          action?: string
          answers?: Json
          attempts?: number
          clientMealId?: string
          completedAt?: string | null
          createdAt?: string
          errorCode?: string | null
          expectedPublishedRevision?: number | null
          generation?: number
          id?: string
          input?: Json
          leaseUntil?: string | null
          messageId?: number
          nextAttemptAt?: string | null
          payloadHash?: string
          plan?: Json | null
          result?: Json | null
          state?: string
          updatedAt?: string
          userId?: string
          version?: number
          workerToken?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "MealOperation_messageId_fkey"
            columns: ["messageId"]
            isOneToOne: false
            referencedRelation: "Message"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "MealOperation_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
        ]
      }
      MealOutbox: {
        Row: {
          attempts: number
          availableAt: string
          createdAt: string
          generation: number
          id: number
          kind: string
          operationId: string
          state: string
        }
        Insert: {
          attempts?: number
          availableAt?: string
          createdAt?: string
          generation: number
          id?: never
          kind: string
          operationId: string
          state?: string
        }
        Update: {
          attempts?: number
          availableAt?: string
          createdAt?: string
          generation?: number
          id?: never
          kind?: string
          operationId?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "MealOutbox_operationId_fkey"
            columns: ["operationId"]
            isOneToOne: false
            referencedRelation: "MealOperation"
            referencedColumns: ["id"]
          },
        ]
      }
      MealRevision: {
        Row: {
          messageId: number
          operationId: string
          publishedAt: string
          revision: number
          snapshot: Json
          userId: string
        }
        Insert: {
          messageId: number
          operationId: string
          publishedAt?: string
          revision: number
          snapshot: Json
          userId: string
        }
        Update: {
          messageId?: number
          operationId?: string
          publishedAt?: string
          revision?: number
          snapshot?: Json
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "MealRevision_messageId_fkey"
            columns: ["messageId"]
            isOneToOne: false
            referencedRelation: "Message"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "MealRevision_operationId_fkey"
            columns: ["operationId"]
            isOneToOne: true
            referencedRelation: "MealOperation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "MealRevision_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
        ]
      }
      MealRun: {
        Row: {
          action: string
          attempt: number
          completionTokens: number
          costUsd: number | null
          createdAt: string
          durationMs: number
          errorCode: string | null
          id: number
          itemCount: number | null
          messageId: number
          modelCalls: number
          models: Json
          operationId: string
          photoCount: number
          promptTokens: number
          resolutions: Json
          route: string | null
          state: string
          toolCalls: number
          tools: Json
          userId: string
        }
        Insert: {
          action: string
          attempt: number
          completionTokens?: number
          costUsd?: number | null
          createdAt?: string
          durationMs: number
          errorCode?: string | null
          id?: never
          itemCount?: number | null
          messageId: number
          modelCalls?: number
          models?: Json
          operationId: string
          photoCount?: number
          promptTokens?: number
          resolutions?: Json
          route?: string | null
          state: string
          toolCalls?: number
          tools?: Json
          userId: string
        }
        Update: {
          action?: string
          attempt?: number
          completionTokens?: number
          costUsd?: number | null
          createdAt?: string
          durationMs?: number
          errorCode?: string | null
          id?: never
          itemCount?: number | null
          messageId?: number
          modelCalls?: number
          models?: Json
          operationId?: string
          photoCount?: number
          promptTokens?: number
          resolutions?: Json
          route?: string | null
          state?: string
          toolCalls?: number
          tools?: Json
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "MealRun_operationId_fkey"
            columns: ["operationId"]
            isOneToOne: false
            referencedRelation: "MealOperation"
            referencedColumns: ["id"]
          },
        ]
      }
      Message: {
        Row: {
          activeOperationId: string | null
          consumedOn: string | null
          content: string
          createdAt: string
          deletedAt: string | null
          function_name: string | null
          hasimages: boolean
          id: number
          isAudio: boolean | null
          isBadFoodRequest: boolean | null
          itemsProcessed: number | null
          itemsToProcess: number | null
          local_id: string | null
          messageType: Database["public"]["Enums"]["MessageType"]
          operationGeneration: number
          operationOwned: boolean
          progress: Json | null
          publishedRevision: number
          resolvedAt: string | null
          role: Database["public"]["Enums"]["Role"]
          status: Database["public"]["Enums"]["MessageStatus"]
          userId: string
        }
        Insert: {
          activeOperationId?: string | null
          consumedOn?: string | null
          content: string
          createdAt?: string
          deletedAt?: string | null
          function_name?: string | null
          hasimages?: boolean
          id?: number
          isAudio?: boolean | null
          isBadFoodRequest?: boolean | null
          itemsProcessed?: number | null
          itemsToProcess?: number | null
          local_id?: string | null
          messageType?: Database["public"]["Enums"]["MessageType"]
          operationGeneration?: number
          operationOwned?: boolean
          progress?: Json | null
          publishedRevision?: number
          resolvedAt?: string | null
          role: Database["public"]["Enums"]["Role"]
          status?: Database["public"]["Enums"]["MessageStatus"]
          userId: string
        }
        Update: {
          activeOperationId?: string | null
          consumedOn?: string | null
          content?: string
          createdAt?: string
          deletedAt?: string | null
          function_name?: string | null
          hasimages?: boolean
          id?: number
          isAudio?: boolean | null
          isBadFoodRequest?: boolean | null
          itemsProcessed?: number | null
          itemsToProcess?: number | null
          local_id?: string | null
          messageType?: Database["public"]["Enums"]["MessageType"]
          operationGeneration?: number
          operationOwned?: boolean
          progress?: Json | null
          publishedRevision?: number
          resolvedAt?: string | null
          role?: Database["public"]["Enums"]["Role"]
          status?: Database["public"]["Enums"]["MessageStatus"]
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "Message_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
        ]
      }
      Nutrient: {
        Row: {
          foodItemId: number
          id: number
          nutrientAmountPerDefaultServing: number
          nutrientName: string
          nutrientUnit: string
        }
        Insert: {
          foodItemId: number
          id?: number
          nutrientAmountPerDefaultServing: number
          nutrientName: string
          nutrientUnit: string
        }
        Update: {
          foodItemId?: number
          id?: number
          nutrientAmountPerDefaultServing?: number
          nutrientName?: string
          nutrientUnit?: string
        }
        Relationships: [
          {
            foreignKeyName: "Nutrient_foodItemId_fkey"
            columns: ["foodItemId"]
            isOneToOne: false
            referencedRelation: "FoodItem"
            referencedColumns: ["id"]
          },
        ]
      }
      OAuthConsentHandoff: {
        Row: {
          authorizationId: string
          createdAt: string
          redirectUrl: string
        }
        Insert: {
          authorizationId: string
          createdAt?: string
          redirectUrl: string
        }
        Update: {
          authorizationId?: string
          createdAt?: string
          redirectUrl?: string
        }
        Relationships: []
      }
      OpenAiUsage: {
        Row: {
          completionTimeMs: number | null
          completionTokens: number
          createdAt: string
          id: number
          modelName: string
          promptTokens: number
          provider: string | null
          totalTokens: number
          userId: string
        }
        Insert: {
          completionTimeMs?: number | null
          completionTokens: number
          createdAt?: string
          id?: number
          modelName: string
          promptTokens: number
          provider?: string | null
          totalTokens: number
          userId: string
        }
        Update: {
          completionTimeMs?: number | null
          completionTokens?: number
          createdAt?: string
          id?: number
          modelName?: string
          promptTokens?: number
          provider?: string | null
          totalTokens?: number
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "OpenAiUsage_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
        ]
      }
      RecipeIngredient: {
        Row: {
          createdAt: string
          foodItemId: number
          grams: number
          id: number
          loggedUnit: string | null
          position: number
          recipeFoodItemId: number
          servingAmount: number | null
          servingId: number | null
        }
        Insert: {
          createdAt?: string
          foodItemId: number
          grams: number
          id?: number
          loggedUnit?: string | null
          position?: number
          recipeFoodItemId: number
          servingAmount?: number | null
          servingId?: number | null
        }
        Update: {
          createdAt?: string
          foodItemId?: number
          grams?: number
          id?: number
          loggedUnit?: string | null
          position?: number
          recipeFoodItemId?: number
          servingAmount?: number | null
          servingId?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "RecipeIngredient_foodItemId_fkey"
            columns: ["foodItemId"]
            isOneToOne: false
            referencedRelation: "FoodItem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "RecipeIngredient_recipeFoodItemId_fkey"
            columns: ["recipeFoodItemId"]
            isOneToOne: false
            referencedRelation: "FoodItem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "RecipeIngredient_servingId_fkey"
            columns: ["servingId"]
            isOneToOne: false
            referencedRelation: "Serving"
            referencedColumns: ["id"]
          },
        ]
      }
      Serving: {
        Row: {
          defaultServingAmount: number | null
          foodItemId: number
          id: number
          servingAlternateAmount: number | null
          servingAlternateUnit: string | null
          servingName: string
          servingWeightGram: number | null
        }
        Insert: {
          defaultServingAmount?: number | null
          foodItemId: number
          id?: number
          servingAlternateAmount?: number | null
          servingAlternateUnit?: string | null
          servingName: string
          servingWeightGram?: number | null
        }
        Update: {
          defaultServingAmount?: number | null
          foodItemId?: number
          id?: number
          servingAlternateAmount?: number | null
          servingAlternateUnit?: string | null
          servingName?: string
          servingWeightGram?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "Serving_foodItemId_fkey"
            columns: ["foodItemId"]
            isOneToOne: false
            referencedRelation: "FoodItem"
            referencedColumns: ["id"]
          },
        ]
      }
      Session: {
        Row: {
          expires: string
          id: string
          sessionToken: string
          userId: string
        }
        Insert: {
          expires: string
          id: string
          sessionToken: string
          userId: string
        }
        Update: {
          expires?: string
          id?: string
          sessionToken?: string
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "Session_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
        ]
      }
      SmsAuthCode: {
        Row: {
          code: string
          createdAt: string
          expiresAt: string
          id: string
          userId: string
        }
        Insert: {
          code: string
          createdAt?: string
          expiresAt?: string
          id: string
          userId: string
        }
        Update: {
          code?: string
          createdAt?: string
          expiresAt?: string
          id?: string
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "SmsAuthCode_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
        ]
      }
      SmsMessage: {
        Row: {
          content: string
          createdAt: string
          direction: Database["public"]["Enums"]["MessageDirection"]
          id: number
          userId: string
        }
        Insert: {
          content: string
          createdAt?: string
          direction: Database["public"]["Enums"]["MessageDirection"]
          id?: number
          userId: string
        }
        Update: {
          content?: string
          createdAt?: string
          direction?: Database["public"]["Enums"]["MessageDirection"]
          id?: number
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "SmsMessage_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
        ]
      }
      UsdaFoodItemEmbedding: {
        Row: {
          bgeBaseEmbedding: string | null
          bgeLargeEmbedding: string | null
          brandOwner: string | null
          fdcId: number
          foodBrand: string | null
          foodName: string
          id: number
        }
        Insert: {
          bgeBaseEmbedding?: string | null
          bgeLargeEmbedding?: string | null
          brandOwner?: string | null
          fdcId: number
          foodBrand?: string | null
          foodName: string
          id?: number
        }
        Update: {
          bgeBaseEmbedding?: string | null
          bgeLargeEmbedding?: string | null
          brandOwner?: string | null
          fdcId?: number
          foodBrand?: string | null
          foodName?: string
          id?: number
        }
        Relationships: []
      }
      User: {
        Row: {
          activityLevel: Database["public"]["Enums"]["ActivityLevel"] | null
          avatarUrl: string | null
          calorieGoal: number | null
          carbsGoal: number | null
          dateOfBirth: string | null
          email: string | null
          emailVerified: string | null
          fatGoal: number | null
          fitnessGoal: string | null
          fullName: string | null
          gender: Database["public"]["Enums"]["gender_enum"] | null
          heightCm: number | null
          id: string
          manualMacroGoals: boolean
          phone: string | null
          proteinGoal: number | null
          sendCheckins: boolean
          sentContact: boolean
          setupCompleted: boolean
          subscriptionExpiryDate: string | null
          subscriptionType: string | null
          tzIdentifier: string
          unitPreference: Database["public"]["Enums"]["UnitPreference"] | null
          weightKg: number | null
        }
        Insert: {
          activityLevel?: Database["public"]["Enums"]["ActivityLevel"] | null
          avatarUrl?: string | null
          calorieGoal?: number | null
          carbsGoal?: number | null
          dateOfBirth?: string | null
          email?: string | null
          emailVerified?: string | null
          fatGoal?: number | null
          fitnessGoal?: string | null
          fullName?: string | null
          gender?: Database["public"]["Enums"]["gender_enum"] | null
          heightCm?: number | null
          id: string
          manualMacroGoals?: boolean
          phone?: string | null
          proteinGoal?: number | null
          sendCheckins?: boolean
          sentContact?: boolean
          setupCompleted?: boolean
          subscriptionExpiryDate?: string | null
          subscriptionType?: string | null
          tzIdentifier?: string
          unitPreference?: Database["public"]["Enums"]["UnitPreference"] | null
          weightKg?: number | null
        }
        Update: {
          activityLevel?: Database["public"]["Enums"]["ActivityLevel"] | null
          avatarUrl?: string | null
          calorieGoal?: number | null
          carbsGoal?: number | null
          dateOfBirth?: string | null
          email?: string | null
          emailVerified?: string | null
          fatGoal?: number | null
          fitnessGoal?: string | null
          fullName?: string | null
          gender?: Database["public"]["Enums"]["gender_enum"] | null
          heightCm?: number | null
          id?: string
          manualMacroGoals?: boolean
          phone?: string | null
          proteinGoal?: number | null
          sendCheckins?: boolean
          sentContact?: boolean
          setupCompleted?: boolean
          subscriptionExpiryDate?: string | null
          subscriptionType?: string | null
          tzIdentifier?: string
          unitPreference?: Database["public"]["Enums"]["UnitPreference"] | null
          weightKg?: number | null
        }
        Relationships: []
      }
      UserFavoriteFoodItem: {
        Row: {
          createdAt: string
          foodItemId: number
          id: number
          preferredAmount: number
          preferredUnit: string | null
          servingId: number | null
          userId: string
        }
        Insert: {
          createdAt?: string
          foodItemId: number
          id?: number
          preferredAmount: number
          preferredUnit?: string | null
          servingId?: number | null
          userId: string
        }
        Update: {
          createdAt?: string
          foodItemId?: number
          id?: number
          preferredAmount?: number
          preferredUnit?: string | null
          servingId?: number | null
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "UserFavoriteFoodItem_foodItemId_fkey"
            columns: ["foodItemId"]
            isOneToOne: false
            referencedRelation: "FoodItem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "UserFavoriteFoodItem_servingId_fkey"
            columns: ["servingId"]
            isOneToOne: false
            referencedRelation: "Serving"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "UserFavoriteFoodItem_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
        ]
      }
      UserGoalHistory: {
        Row: {
          calorieGoal: number | null
          carbsGoal: number | null
          createdAt: string
          effectiveOn: string
          fatGoal: number | null
          id: number
          proteinGoal: number | null
          updatedAt: string
          userId: string
        }
        Insert: {
          calorieGoal?: number | null
          carbsGoal?: number | null
          createdAt?: string
          effectiveOn: string
          fatGoal?: number | null
          id?: never
          proteinGoal?: number | null
          updatedAt?: string
          userId: string
        }
        Update: {
          calorieGoal?: number | null
          carbsGoal?: number | null
          createdAt?: string
          effectiveOn?: string
          fatGoal?: number | null
          id?: never
          proteinGoal?: number | null
          updatedAt?: string
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "UserGoalHistory_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
        ]
      }
      UserMessageImages: {
        Row: {
          id: number
          imagePath: string
          messageId: number | null
          uploadedAt: string | null
          userId: string
        }
        Insert: {
          id?: number
          imagePath: string
          messageId?: number | null
          uploadedAt?: string | null
          userId: string
        }
        Update: {
          id?: number
          imagePath?: string
          messageId?: number | null
          uploadedAt?: string | null
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "UserMessageImages_messageId_fkey"
            columns: ["messageId"]
            isOneToOne: false
            referencedRelation: "Message"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usermessageimages_userid_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
        ]
      }
      userSubmittedBug: {
        Row: {
          bug_type: Database["public"]["Enums"]["bug_type_enum"] | null
          created_at: string
          created_by_user: string
          extra_details: string | null
          food_item_id: number | null
          id: number
          logged_food_id: number | null
          message_id: number | null
        }
        Insert: {
          bug_type?: Database["public"]["Enums"]["bug_type_enum"] | null
          created_at?: string
          created_by_user?: string
          extra_details?: string | null
          food_item_id?: number | null
          id?: number
          logged_food_id?: number | null
          message_id?: number | null
        }
        Update: {
          bug_type?: Database["public"]["Enums"]["bug_type_enum"] | null
          created_at?: string
          created_by_user?: string
          extra_details?: string | null
          food_item_id?: number | null
          id?: number
          logged_food_id?: number | null
          message_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "userSubmittedBug_food_item_id_fkey"
            columns: ["food_item_id"]
            isOneToOne: false
            referencedRelation: "FoodItem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "userSubmittedBug_logged_food_id_fkey"
            columns: ["logged_food_id"]
            isOneToOne: false
            referencedRelation: "LoggedFoodItem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "userSubmittedBug_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "Message"
            referencedColumns: ["id"]
          },
        ]
      }
      VerificationToken: {
        Row: {
          expires: string
          identifier: string
          token: string
        }
        Insert: {
          expires: string
          identifier: string
          token: string
        }
        Update: {
          expires?: string
          identifier?: string
          token?: string
        }
        Relationships: []
      }
      WebSignIn: {
        Row: {
          browser: string | null
          browserSecretHash: string
          code: string
          createdAt: string
          decidedAt: string | null
          id: string
          place: string | null
          status: string
          tokenHash: string | null
          userId: string | null
        }
        Insert: {
          browser?: string | null
          browserSecretHash: string
          code: string
          createdAt?: string
          decidedAt?: string | null
          id: string
          place?: string | null
          status?: string
          tokenHash?: string | null
          userId?: string | null
        }
        Update: {
          browser?: string | null
          browserSecretHash?: string
          code?: string
          createdAt?: string
          decidedAt?: string | null
          id?: string
          place?: string | null
          status?: string
          tokenHash?: string | null
          userId?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_meal_operation: {
        Args: {
          p_action: string
          p_client_meal_id: string
          p_expected_revision: number
          p_input: Json
          p_message_id: number
          p_operation_id: string
          p_payload_hash: string
          p_user_id: string
        }
        Returns: Json
      }
      admin_catalogue_stats: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      admin_food_usage: { Args: { p_food_id: number }; Returns: Json }
      admin_meal_stats: {
        Args: { p_from: string; p_to: string; p_user_id?: string }
        Returns: Json
      }
      admin_meals: {
        Args: {
          p_date_field?: string
          p_deleted?: string
          p_from?: string
          p_kind?: string
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_route?: string
          p_sort?: string
          p_state?: string
          p_to?: string
          p_user_id?: string
        }
        Returns: {
          attempts: number
          consumedOn: string
          content: string
          createdAt: string
          deletedAt: string
          durationMs: number
          edits: number
          email: string
          errorCode: string
          foods: Json
          hasImages: boolean
          id: number
          isAudio: boolean
          itemCount: number
          kcal: number
          opAction: string
          operations: number
          opId: string
          opState: string
          photos: number
          resolvedAt: string
          route: string
          status: string
          total: number
          userId: string
        }[]
      }
      admin_overview: { Args: never; Returns: Json }
      admin_search_foods: {
        Args: {
          p_filter?: string
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_sort?: string
          p_source?: string
        }
        Returns: {
          brand: string
          carbPerServing: number
          createdAtDateTime: string
          defaultServingWeightGram: number
          foodInfoSource: string
          gtin: string
          icon: string
          id: number
          kcalPerServing: number
          lastLogged: string
          logs: number
          logs30d: number
          name: string
          privateToUserId: string
          proteinPerServing: number
          total: number
          totalFatPerServing: number
          users: number
          verified: boolean
        }[]
      }
      admin_similar_foods: {
        Args: { p_food_id: number; p_limit?: number }
        Returns: {
          brand: string
          defaultServingWeightGram: number
          foodInfoSource: string
          id: number
          kcalPerServing: number
          name: string
          privateToUserId: string
          similarity: number
        }[]
      }
      admin_users: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_sort?: string
        }
        Returns: {
          email: string
          failed30d: number
          firstMessageAt: string
          foods30d: number
          fullName: string
          id: string
          lastMessageAt: string
          meals30d: number
          meals7d: number
          subscriptionType: string
          total: number
          totalFoods: number
          totalMeals: number
          tzIdentifier: string
        }[]
      }
      answer_meal_operation: {
        Args: {
          p_answer: string
          p_expected_version: number
          p_operation_id: string
          p_user_id: string
        }
        Returns: Json
      }
      archive_user_food: {
        Args: { p_food_id: number; p_user_id: string }
        Returns: boolean
      }
      calculate_user_streak: {
        Args: { user_id: string }
        Returns: {
          dailycount: number
          localdate: string
        }[]
      }
      cancel_meal_operation: {
        Args: {
          p_expected_version: number
          p_operation_id: string
          p_user_id: string
        }
        Returns: Json
      }
      claim_meal_operation: {
        Args: {
          p_lease_seconds?: number
          p_operation_id: string
          p_worker_token: string
        }
        Returns: Json
      }
      create_catalogue_food: {
        Args: {
          p_food: Json
          p_message_id: number
          p_private?: boolean
          p_servings: Json
          p_user_id: string
          p_variant?: boolean
        }
        Returns: {
          created: boolean
          enrichment: Json
          food_id: number
        }[]
      }
      enrich_catalogue_food: {
        Args: { p_food: Json; p_food_id: number; p_servings: Json }
        Returns: Json
      }
      fill_logged_micronutrients: { Args: { p_rows: Json }; Returns: number }
      finish_meal_operation: {
        Args: {
          p_error_code: string
          p_next_attempt?: string
          p_operation_id: string
          p_result?: Json
          p_state: string
          p_worker_token: string
        }
        Returns: Json
      }
      food_icon_candidates: {
        Args: { p_embedding_cache_id: number; p_limit?: number }
        Returns: {
          cosine_similarity: number
          food_image_id: number
          image_description: string
        }[]
      }
      food_identity_key: {
        Args: { p_brand: string; p_name: string }
        Returns: string
      }
      food_identity_part: { Args: { p_value: string }; Returns: string }
      food_identity_parts: { Args: { p_values: string[] }; Returns: string[] }
      get_branded_usda_embedding: {
        Args: { embeddingId: number }
        Returns: {
          bgeBaseEmbedding: string
          cosineSimilarity: number
          fdcId: number
          foodBrand: string
          foodName: string
        }[]
      }
      get_cosine_results: {
        Args: {
          amount_of_results?: number
          p_embedding_cache_id: number
          p_include_recipes?: boolean
          p_user_id?: string
        }
        Returns: {
          brand: string
          cosine_similarity: number
          embedding: string
          externalId: string
          foodInfoSource: string
          id: number
          name: string
        }[]
      }
      get_current_timestamp: { Args: never; Returns: Json }
      get_top_foodimage_embedding_similarity: {
        Args: { p_embedding_cache_id: number }
        Returns: {
          cosine_similarity: number
          food_image_id: number
          image_description: string
        }[]
      }
      get_top_foodimage_foodid_similarity: {
        Args: { food_item_id: number }
        Returns: {
          cosine_similarity: number
          food_icon_id: number
        }[]
      }
      get_unbranded_usda_embedding: {
        Args: { embeddingId: number }
        Returns: {
          bgeBaseEmbedding: string
          cosineSimilarity: number
          fdcId: number
          foodBrand: string
          foodName: string
        }[]
      }
      gtin14: { Args: { p_code: string }; Returns: string }
      insert_priced_food_row: {
        Args: {
          p_consumed_on: string
          p_item: Json
          p_local_id: string
          p_message_id: number
          p_revision: number
          p_user_id: string
        }
        Returns: number
      }
      log_food_as_meal: {
        Args: {
          p_consumed_on: string
          p_content: string
          p_item: Json
          p_local_id: string
          p_user_id: string
        }
        Returns: {
          created: boolean
          logged_food_item_id: number
          message_id: number
        }[]
      }
      log_foods_as_meal: {
        Args: {
          p_consumed_on: string
          p_content: string
          p_items: Json
          p_local_id: string
          p_user_id: string
        }
        Returns: {
          created: boolean
          logged_food_item_ids: number[]
          message_id: number
        }[]
      }
      mcp_daily_summary: {
        Args: { p_all?: boolean; p_from: string; p_to: string }
        Returns: Json
      }
      mcp_get_meals: { Args: { p_ids: number[] }; Returns: Json[] }
      mcp_is_meal: {
        Args: { m: Database["public"]["Tables"]["Message"]["Row"] }
        Returns: boolean
      }
      mcp_list_meals: {
        Args: {
          p_after_eaten?: string
          p_after_id?: number
          p_all?: boolean
          p_from: string
          p_limit?: number
          p_to: string
        }
        Returns: {
          eaten: string
          id: number
          meal: Json
        }[]
      }
      mcp_meal_changes: {
        Args: {
          p_after_at?: string
          p_after_id?: number
          p_all?: boolean
          p_limit?: number
        }
        Returns: {
          changedAt: string
          id: number
          meal: Json
        }[]
      }
      mcp_meal_json: {
        Args: {
          m: Database["public"]["Tables"]["Message"]["Row"]
          p_all: boolean
          p_tz: string
        }
        Returns: Json
      }
      mcp_user_timezone: { Args: never; Returns: string }
      merge_catalogue_food: {
        Args: { p_audit: string; p_drop: number; p_keep: number }
        Returns: Json
      }
      nutrition_day_totals: {
        Args: { p_from: string; p_to: string; p_zone: string }
        Returns: {
          day: string
          foods: number
          meals: number
          totals: Json
        }[]
      }
      nutrition_fill_keys: { Args: never; Returns: string[] }
      nutrition_keys: { Args: never; Returns: string[] }
      nutrition_round: {
        Args: { p_key: string; p_value: number }
        Returns: number
      }
      prune_mcp_requests: { Args: never; Returns: number }
      prune_meal_runs: { Args: never; Returns: number }
      publish_meal_operation: {
        Args: { p_operation_id: string; p_plan: Json; p_worker_token: string }
        Returns: Json
      }
      replace_food_from_history: {
        Args: {
          p_consumed_on: string
          p_expected: Json
          p_food_ids: number[]
          p_message_id: number
          p_source: Json
          p_user_id: string
        }
        Returns: Json
      }
      report_meal_operation_progress: {
        Args: {
          p_operation_id: string
          p_progress: Json
          p_worker_token: string
        }
        Returns: boolean
      }
      save_user_food: {
        Args: {
          p_food: Json
          p_food_id: number
          p_ingredients: Json
          p_nutrients: Json
          p_servings: Json
          p_user_id: string
        }
        Returns: {
          created: boolean
          food_id: number
          previous_id: number
          versioned: boolean
        }[]
      }
      search_food_catalogue_nearest: {
        Args: {
          p_embedding_cache_id: number
          p_include_recipes?: boolean
          p_limit?: number
          p_user_id?: string
        }
        Returns: {
          brand: string
          id: number
          knownAs: string[]
          name: string
        }[]
      }
      search_meal_food_catalogue: {
        Args: {
          p_include_recipes?: boolean
          p_limit?: number
          p_offset?: number
          p_query: string
          p_threshold?: number
          p_user_id?: string
        }
        Returns: {
          brand: string
          id: number
          knownAs: string[]
          name: string
        }[]
      }
      search_own_foods: {
        Args: { p_limit?: number; p_text: string; p_user_id: string }
        Returns: {
          brand: string
          id: number
          name: string
          score: number
        }[]
      }
      search_usda_database: {
        Args: { embedding_id: number; limit_amount?: number }
        Returns: {
          brandOwner: string
          cosineSimilarity: number
          fdcId: number
          foodBrand: string
          foodName: string
        }[]
      }
      serving_repeats_builtin_unit: {
        Args: { p_amount: number; p_grams: number; p_name: string }
        Returns: boolean
      }
      supersede_catalogue_estimate: {
        Args: { p_food: Json; p_food_id: number; p_servings: Json }
        Returns: Json
      }
      user_flag_enabled: {
        Args: { p_flag: string; p_user_id: string }
        Returns: boolean
      }
      valid_timezone: { Args: { p_name: string }; Returns: string }
      web_agent_usage: { Args: { p_days?: number }; Returns: Json }
      web_dashboard: { Args: { p_date?: string }; Returns: Json }
      web_day: { Args: { p_date: string }; Returns: Json }
      web_days: { Args: { p_from: string; p_to: string }; Returns: Json }
      web_food_icon: { Args: { p_food_id: number }; Returns: string }
      web_me: {
        Args: never
        Returns: {
          email: string
          goals: Json
          name: string
          today: string
          tz: string
        }[]
      }
      web_stats: { Args: never; Returns: Json }
    }
    Enums: {
      ActivityLevel:
        | "None"
        | "Light Exercise"
        | "Moderate Exercise"
        | "Very Active"
        | "Extremely Active"
      bug_type_enum: "bad_match" | "bad_food_icon" | "bad_food_info"
      FoodInfoSource:
        | "User"
        | "Online"
        | "GPT3"
        | "GPT4"
        | "LLAMA"
        | "LLAMA2"
        | "USDA"
        | "FATSECRET"
        | "NUTRITIONIX"
        | "AgentEstimate"
        | "Label"
      gender_enum: "male" | "female" | "other"
      GenerateIconResult: "NOT_STARTED" | "STARTED" | "FAILED" | "SUCCESS"
      MessageDirection: "Inbound" | "Outbound"
      MessageStatus: "RECEIVED" | "PROCESSING" | "RESOLVED" | "FAILED"
      MessageType:
        | "CONVERSATION"
        | "ASSISTANT"
        | "FOOD_LOG_REQUEST"
        | "SHOW_FOOD_LOG"
        | "LOG_EXERCISE"
        | "UPDATE_USER_INFO"
      Role: "Assistant" | "User" | "System" | "Function"
      UnitPreference: "IMPERIAL" | "METRIC"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      ActivityLevel: [
        "None",
        "Light Exercise",
        "Moderate Exercise",
        "Very Active",
        "Extremely Active",
      ],
      bug_type_enum: ["bad_match", "bad_food_icon", "bad_food_info"],
      FoodInfoSource: [
        "User",
        "Online",
        "GPT3",
        "GPT4",
        "LLAMA",
        "LLAMA2",
        "USDA",
        "FATSECRET",
        "NUTRITIONIX",
        "AgentEstimate",
        "Label",
      ],
      gender_enum: ["male", "female", "other"],
      GenerateIconResult: ["NOT_STARTED", "STARTED", "FAILED", "SUCCESS"],
      MessageDirection: ["Inbound", "Outbound"],
      MessageStatus: ["RECEIVED", "PROCESSING", "RESOLVED", "FAILED"],
      MessageType: [
        "CONVERSATION",
        "ASSISTANT",
        "FOOD_LOG_REQUEST",
        "SHOW_FOOD_LOG",
        "LOG_EXERCISE",
        "UPDATE_USER_INFO",
      ],
      Role: ["Assistant", "User", "System", "Function"],
      UnitPreference: ["IMPERIAL", "METRIC"],
    },
  },
} as const
