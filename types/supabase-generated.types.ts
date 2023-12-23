export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          operationName?: string
          query?: string
          variables?: Json
          extensions?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
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
            referencedRelation: "User"
            referencedColumns: ["id"]
          }
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
          pathToImage: string
        }
        Insert: {
          bgeBaseEmbedding?: string | null
          downvotes?: number
          id?: number
          imageDescription?: string | null
          pathToImage: string
        }
        Update: {
          bgeBaseEmbedding?: string | null
          downvotes?: number
          id?: number
          imageDescription?: string | null
          pathToImage?: string
        }
        Relationships: []
      }
      FoodItem: {
        Row: {
          adaEmbedding: string | null
          addedSugarPerServing: number | null
          bgeBaseEmbedding: string | null
          brand: string | null
          carbPerServing: number
          createdAtDateTime: string
          defaultServingLiquidMl: number | null
          defaultServingWeightGram: number | null
          description: string | null
          externalId: string | null
          fiberPerServing: number | null
          foodInfoSource: Database["public"]["Enums"]["FoodInfoSource"]
          id: number
          isLiquid: boolean
          kcalPerServing: number
          knownAs: string[] | null
          lastUpdated: string
          messageId: number | null
          name: string
          proteinPerServing: number
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
          bgeBaseEmbedding?: string | null
          brand?: string | null
          carbPerServing?: number
          createdAtDateTime?: string
          defaultServingLiquidMl?: number | null
          defaultServingWeightGram?: number | null
          description?: string | null
          externalId?: string | null
          fiberPerServing?: number | null
          foodInfoSource?: Database["public"]["Enums"]["FoodInfoSource"]
          id?: number
          isLiquid?: boolean
          kcalPerServing?: number
          knownAs?: string[] | null
          lastUpdated?: string
          messageId?: number | null
          name?: string
          proteinPerServing?: number
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
          bgeBaseEmbedding?: string | null
          brand?: string | null
          carbPerServing?: number
          createdAtDateTime?: string
          defaultServingLiquidMl?: number | null
          defaultServingWeightGram?: number | null
          description?: string | null
          externalId?: string | null
          fiberPerServing?: number | null
          foodInfoSource?: Database["public"]["Enums"]["FoodInfoSource"]
          id?: number
          isLiquid?: boolean
          kcalPerServing?: number
          knownAs?: string[] | null
          lastUpdated?: string
          messageId?: number | null
          name?: string
          proteinPerServing?: number
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
            referencedRelation: "Message"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "FoodItem_userId_fkey"
            columns: ["userId"]
            referencedRelation: "User"
            referencedColumns: ["id"]
          }
        ]
      }
      FoodItemImages: {
        Row: {
          createdAt: string
          foodImageId: number | null
          foodItemId: number | null
          id: number
        }
        Insert: {
          createdAt?: string
          foodImageId?: number | null
          foodItemId?: number | null
          id?: number
        }
        Update: {
          createdAt?: string
          foodImageId?: number | null
          foodItemId?: number | null
          id?: number
        }
        Relationships: [
          {
            foreignKeyName: "FoodItemImages_foodImageId_fkey"
            columns: ["foodImageId"]
            referencedRelation: "FoodImage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "FoodItemImages_foodItemId_fkey"
            columns: ["foodItemId"]
            referencedRelation: "FoodItem"
            referencedColumns: ["id"]
          }
        ]
      }
      IconQueue: {
        Row: {
          created_at: string
          finished_at: string | null
          id: number
          requested_food_string: string
          result: Database["public"]["Enums"]["GenerateIconResult"] | null
          started_at: string | null
        }
        Insert: {
          created_at?: string
          finished_at?: string | null
          id?: number
          requested_food_string?: string
          result?: Database["public"]["Enums"]["GenerateIconResult"] | null
          started_at?: string | null
        }
        Update: {
          created_at?: string
          finished_at?: string | null
          id?: number
          requested_food_string?: string
          result?: Database["public"]["Enums"]["GenerateIconResult"] | null
          started_at?: string | null
        }
        Relationships: []
      }
      LoggedFoodItem: {
        Row: {
          consumedOn: string
          createdAt: string
          deletedAt: string | null
          embeddingId: number | null
          extendedOpenAiData: Json | null
          foodItemId: number | null
          grams: number
          id: number
          loggedUnit: string | null
          messageId: number | null
          servingAmount: number | null
          servingId: number | null
          status: string | null
          updatedAt: string
          userId: string
        }
        Insert: {
          consumedOn?: string
          createdAt?: string
          deletedAt?: string | null
          embeddingId?: number | null
          extendedOpenAiData?: Json | null
          foodItemId?: number | null
          grams?: number
          id?: number
          loggedUnit?: string | null
          messageId?: number | null
          servingAmount?: number | null
          servingId?: number | null
          status?: string | null
          updatedAt?: string
          userId: string
        }
        Update: {
          consumedOn?: string
          createdAt?: string
          deletedAt?: string | null
          embeddingId?: number | null
          extendedOpenAiData?: Json | null
          foodItemId?: number | null
          grams?: number
          id?: number
          loggedUnit?: string | null
          messageId?: number | null
          servingAmount?: number | null
          servingId?: number | null
          status?: string | null
          updatedAt?: string
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "LoggedFoodItem_embeddingId_fkey"
            columns: ["embeddingId"]
            referencedRelation: "foodEmbeddingCache"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "LoggedFoodItem_foodItemId_fkey"
            columns: ["foodItemId"]
            referencedRelation: "FoodItem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "LoggedFoodItem_messageId_fkey"
            columns: ["messageId"]
            referencedRelation: "Message"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "LoggedFoodItem_servingId_fkey"
            columns: ["servingId"]
            referencedRelation: "Serving"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "LoggedFoodItem_userId_fkey"
            columns: ["userId"]
            referencedRelation: "User"
            referencedColumns: ["id"]
          }
        ]
      }
      Message: {
        Row: {
          content: string
          createdAt: string
          function_name: string | null
          id: number
          itemsProcessed: number | null
          itemsToProcess: number | null
          messageType: Database["public"]["Enums"]["MessageType"]
          resolvedAt: string | null
          role: Database["public"]["Enums"]["Role"]
          status: Database["public"]["Enums"]["MessageStatus"]
          userId: string
        }
        Insert: {
          content: string
          createdAt?: string
          function_name?: string | null
          id?: number
          itemsProcessed?: number | null
          itemsToProcess?: number | null
          messageType?: Database["public"]["Enums"]["MessageType"]
          resolvedAt?: string | null
          role: Database["public"]["Enums"]["Role"]
          status?: Database["public"]["Enums"]["MessageStatus"]
          userId: string
        }
        Update: {
          content?: string
          createdAt?: string
          function_name?: string | null
          id?: number
          itemsProcessed?: number | null
          itemsToProcess?: number | null
          messageType?: Database["public"]["Enums"]["MessageType"]
          resolvedAt?: string | null
          role?: Database["public"]["Enums"]["Role"]
          status?: Database["public"]["Enums"]["MessageStatus"]
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "Message_userId_fkey"
            columns: ["userId"]
            referencedRelation: "User"
            referencedColumns: ["id"]
          }
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
            referencedRelation: "FoodItem"
            referencedColumns: ["id"]
          }
        ]
      }
      OpenAiUsage: {
        Row: {
          completionTokens: number
          createdAt: string
          id: number
          modelName: string
          promptTokens: number
          totalTokens: number
          userId: string
        }
        Insert: {
          completionTokens: number
          createdAt?: string
          id?: number
          modelName: string
          promptTokens: number
          totalTokens: number
          userId: string
        }
        Update: {
          completionTokens?: number
          createdAt?: string
          id?: number
          modelName?: string
          promptTokens?: number
          totalTokens?: number
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "OpenAiUsage_userId_fkey"
            columns: ["userId"]
            referencedRelation: "User"
            referencedColumns: ["id"]
          }
        ]
      }
      Serving: {
        Row: {
          foodItemId: number
          id: number
          servingAlternateAmount: number | null
          servingAlternateUnit: string | null
          servingName: string
          servingWeightGram: number | null
        }
        Insert: {
          foodItemId: number
          id?: number
          servingAlternateAmount?: number | null
          servingAlternateUnit?: string | null
          servingName: string
          servingWeightGram?: number | null
        }
        Update: {
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
            referencedRelation: "FoodItem"
            referencedColumns: ["id"]
          }
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
            referencedRelation: "User"
            referencedColumns: ["id"]
          }
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
            referencedRelation: "User"
            referencedColumns: ["id"]
          }
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
            referencedRelation: "User"
            referencedColumns: ["id"]
          }
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
          tzIdentifier?: string
          unitPreference?: Database["public"]["Enums"]["UnitPreference"] | null
          weightKg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "User_id_fkey"
            columns: ["id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
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
            referencedRelation: "FoodItem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "UserFavoriteFoodItem_servingId_fkey"
            columns: ["servingId"]
            referencedRelation: "Serving"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "UserFavoriteFoodItem_userId_fkey"
            columns: ["userId"]
            referencedRelation: "User"
            referencedColumns: ["id"]
          }
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_branded_usda_embedding: {
        Args: {
          embeddingId: number
        }
        Returns: {
          fdcId: number
          foodName: string
          foodBrand: string
          bgeBaseEmbedding: string
          cosineSimilarity: number
        }[]
      }
      get_cosine_results: {
        Args: {
          p_embedding_cache_id: number
        }
        Returns: {
          id: number
          name: string
          brand: string
          embedding: string
          cosine_similarity: number
        }[]
      }
      get_current_timestamp: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      get_top_foodimage_embedding_similarity: {
        Args: {
          p_embedding_cache_id: number
        }
        Returns: {
          food_image_id: number
          image_description: string
          cosine_similarity: number
        }[]
      }
      get_unbranded_usda_embedding: {
        Args: {
          embeddingId: number
        }
        Returns: {
          fdcId: number
          foodName: string
          foodBrand: string
          bgeBaseEmbedding: string
          cosineSimilarity: number
        }[]
      }
      hnswhandler: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      ivfflathandler: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      vector_avg: {
        Args: {
          "": number[]
        }
        Returns: string
      }
      vector_dims: {
        Args: {
          "": string
        }
        Returns: number
      }
      vector_norm: {
        Args: {
          "": string
        }
        Returns: number
      }
      vector_out: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      vector_send: {
        Args: {
          "": string
        }
        Returns: string
      }
      vector_typmod_in: {
        Args: {
          "": unknown[]
        }
        Returns: number
      }
    }
    Enums: {
      ActivityLevel:
        | "None"
        | "Light Exercise"
        | "Moderate Exercise"
        | "Very Active"
        | "Extremely Active"
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
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          updated_at: string | null
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          updated_at?: string | null
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          version: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          version?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_insert_object: {
        Args: {
          bucketid: string
          name: string
          owner: string
          metadata: Json
        }
        Returns: undefined
      }
      extension: {
        Args: {
          name: string
        }
        Returns: string
      }
      filename: {
        Args: {
          name: string
        }
        Returns: string
      }
      foldername: {
        Args: {
          name: string
        }
        Returns: unknown
      }
      get_size_by_bucket: {
        Args: Record<PropertyKey, never>
        Returns: {
          size: number
          bucket_id: string
        }[]
      }
      search: {
        Args: {
          prefix: string
          bucketname: string
          limits?: number
          levels?: number
          offsets?: number
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          name: string
          id: string
          updated_at: string
          created_at: string
          last_accessed_at: string
          metadata: Json
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

