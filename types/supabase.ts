export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
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
          id: number
          textToEmbed: string
        }
        Insert: {
          adaEmbedding?: string | null
          bgeBaseEmbedding?: string | null
          id?: number
          textToEmbed: string
        }
        Update: {
          adaEmbedding?: string | null
          bgeBaseEmbedding?: string | null
          id?: number
          textToEmbed?: string
        }
        Relationships: []
      }
      FoodImage: {
        Row: {
          foodItemId: number
          id: number
          pathToImage: string
          priority: number
        }
        Insert: {
          foodItemId: number
          id?: number
          pathToImage: string
          priority?: number
        }
        Update: {
          foodItemId?: number
          id?: number
          pathToImage?: string
          priority?: number
        }
        Relationships: [
          {
            foreignKeyName: "FoodImage_foodItemId_fkey"
            columns: ["foodItemId"]
            referencedRelation: "FoodItem"
            referencedColumns: ["id"]
          }
        ]
      }
      FoodItem: {
        Row: {
          adaEmbedding: string | null
          addedSugarPerServing: number | null
          bgeBaseEmbedding: string | null
          brand: string | null
          carbPerServing: number
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
      LoggedFoodItem: {
        Row: {
          consumedOn: string
          createdAt: string
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
        Update: {
          consumedOn?: string
          createdAt?: string
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
          calorieGoal: number | null
          carbsGoal: number | null
          dateOfBirth: string | null
          email: string | null
          emailVerified: string | null
          fatGoal: number | null
          firstName: string | null
          fitnessGoal: string | null
          heightCm: number | null
          id: string
          lastName: string | null
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
          calorieGoal?: number | null
          carbsGoal?: number | null
          dateOfBirth?: string | null
          email?: string | null
          emailVerified?: string | null
          fatGoal?: number | null
          firstName?: string | null
          fitnessGoal?: string | null
          heightCm?: number | null
          id: string
          lastName?: string | null
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
          calorieGoal?: number | null
          carbsGoal?: number | null
          dateOfBirth?: string | null
          email?: string | null
          emailVerified?: string | null
          fatGoal?: number | null
          firstName?: string | null
          fitnessGoal?: string | null
          heightCm?: number | null
          id?: string
          lastName?: string | null
          phone?: string | null
          proteinGoal?: number | null
          sendCheckins?: boolean
          sentContact?: boolean
          setupCompleted?: boolean
          tzIdentifier?: string
          unitPreference?: Database["public"]["Enums"]["UnitPreference"] | null
          weightKg?: number | null
        }
        Relationships: []
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
