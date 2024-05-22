import { Client } from "pg"
import * as fs from "fs"
import * as path from "path"

// Function to read and parse environment variables from a file, removing surrounding quotes if present
const parseEnvFile = (filePath: string): Record<string, string> => {
  const env = fs.readFileSync(filePath, "utf8")
  return env
    .split("\n")
    .filter((line) => line.trim() && !line.startsWith("#"))
    .reduce((acc, line) => {
      let [key, value] = line.split("=")
      key = key.trim()
      value = value.trim().replace(/^"|"$/g, "") // Remove surrounding quotes
      acc[key] = value
      return acc
    }, {} as Record<string, string>)
}

// Load environment variables from .env.local and .env.prod
const localEnv = parseEnvFile(path.resolve(__dirname, "../../.env.local"))
const prodEnv = parseEnvFile(path.resolve(__dirname, "../../.env.prod"))

// Function to verify required environment variables
const verifyEnv = (env: Record<string, string>, envName: string) => {
  const requiredVars = ["SUPABASE_PG_URI"]
  requiredVars.forEach((varName) => {
    if (!env[varName]) {
      throw new Error(`Missing required environment variable ${varName} in ${envName}`)
    }
  })
}

// Verify environment variables for both local and prod
verifyEnv(localEnv, ".env.local")
verifyEnv(prodEnv, ".env.prod")

// Create PostgreSQL clients for local and prod environments
const localClient = new Client({
  connectionString: localEnv.SUPABASE_PG_URI
})

const prodClient = new Client({
  connectionString: prodEnv.SUPABASE_PG_URI
})

const fetchData = async (client: Client, query: string, params: any[] = []) => {
  const res = await client.query(query, params)
  return res.rows
}

const insertData = async (client: Client, query: string, params: any[] = []) => {
  await client.query(query, params)
}

const insertUserIfNotExists = async (prodClient: Client, localClient: Client, userId: string) => {
  const prodUser = await fetchData(prodClient, 'SELECT * FROM "User" WHERE id = $1', [userId]);
  const localUser = await fetchData(localClient, 'SELECT * FROM "User" WHERE id = $1', [userId]);
  const localAuthUser = await fetchData(localClient, "SELECT * FROM auth.users WHERE id = $1", [userId]);

  if (prodUser.length > 0 && localUser.length === 0 && localAuthUser.length === 0) {
    console.log(`Inserting user ${userId} from prod to local...`);
    const authUser = {
      id: prodUser[0].id,
      email: prodUser[0].email,
      encrypted_password: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      instance_id: null,
      aud: null,
      role: null,
      email_confirmed_at: null,
      invited_at: null,
      confirmation_token: null,
      confirmation_sent_at: null,
      recovery_token: null,
      recovery_sent_at: null,
      email_change_token_new: null,
      email_change: null,
      email_change_sent_at: null,
      last_sign_in_at: null,
      raw_app_meta_data: null,
      raw_user_meta_data: null,
      is_super_admin: null,
      phone: null,
      phone_confirmed_at: null,
      phone_change: null,
      phone_change_token: null,
      phone_change_sent_at: null,
      confirmed_at: null,
      email_change_token_current: null,
      email_change_confirm_status: 0,
      banned_until: null,
      reauthentication_token: null,
      reauthentication_sent_at: null,
      is_sso_user: false,
      deleted_at: null,
      is_anonymous: false,
    };

    await insertData(
      localClient,
      `
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, invited_at,
      confirmation_token, confirmation_sent_at, recovery_token, recovery_sent_at, email_change_token_new,
      email_change, email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin,
      created_at, updated_at, phone, phone_confirmed_at, phone_change, phone_change_token, phone_change_sent_at,
      email_change_token_current, email_change_confirm_status, banned_until, reauthentication_token,
      reauthentication_sent_at, is_sso_user, deleted_at, is_anonymous
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
      $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      encrypted_password = EXCLUDED.encrypted_password,
      created_at = EXCLUDED.created_at,
      updated_at = EXCLUDED.updated_at,
      instance_id = EXCLUDED.instance_id,
      aud = EXCLUDED.aud,
      role = EXCLUDED.role,
      email_confirmed_at = EXCLUDED.email_confirmed_at,
      invited_at = EXCLUDED.invited_at,
      confirmation_token = EXCLUDED.confirmation_token,
      confirmation_sent_at = EXCLUDED.confirmation_sent_at,
      recovery_token = EXCLUDED.recovery_token,
      recovery_sent_at = EXCLUDED.recovery_sent_at,
      email_change_token_new = EXCLUDED.email_change_token_new,
      email_change = EXCLUDED.email_change,
      email_change_sent_at = EXCLUDED.email_change_sent_at,
      last_sign_in_at = EXCLUDED.last_sign_in_at,
      raw_app_meta_data = EXCLUDED.raw_app_meta_data,
      raw_user_meta_data = EXCLUDED.raw_user_meta_data,
      is_super_admin = EXCLUDED.is_super_admin,
      phone = EXCLUDED.phone,
      phone_confirmed_at = EXCLUDED.phone_confirmed_at,
      phone_change = EXCLUDED.phone_change,
      phone_change_token = EXCLUDED.phone_change_token,
      phone_change_sent_at = EXCLUDED.phone_change_sent_at,
      email_change_token_current = EXCLUDED.email_change_token_current,
      email_change_confirm_status = EXCLUDED.email_change_confirm_status,
      banned_until = EXCLUDED.banned_until,
      reauthentication_token = EXCLUDED.reauthentication_token,
      reauthentication_sent_at = EXCLUDED.reauthentication_sent_at,
      is_sso_user = EXCLUDED.is_sso_user,
      deleted_at = EXCLUDED.deleted_at,
      is_anonymous = EXCLUDED.is_anonymous;
  `,
      [
        authUser.instance_id,
        authUser.id,
        authUser.aud,
        authUser.role,
        authUser.email,
        authUser.encrypted_password,
        authUser.email_confirmed_at,
        authUser.invited_at,
        authUser.confirmation_token,
        authUser.confirmation_sent_at,
        authUser.recovery_token,
        authUser.recovery_sent_at,
        authUser.email_change_token_new,
        authUser.email_change,
        authUser.email_change_sent_at,
        authUser.last_sign_in_at,
        authUser.raw_app_meta_data,
        authUser.raw_user_meta_data,
        authUser.is_super_admin,
        authUser.created_at,
        authUser.updated_at,
        authUser.phone,
        authUser.phone_confirmed_at,
        authUser.phone_change,
        authUser.phone_change_token,
        authUser.phone_change_sent_at,
        authUser.email_change_token_current,
        authUser.email_change_confirm_status,
        authUser.banned_until,
        authUser.reauthentication_token,
        authUser.reauthentication_sent_at,
        authUser.is_sso_user,
        authUser.deleted_at,
        authUser.is_anonymous,
      ]
    );

    await insertData(
      localClient,
      `
      INSERT INTO "User" (
        id, "fullName", "avatarUrl", email, "emailVerified", phone, "dateOfBirth", "weightKg",
        "heightCm", "calorieGoal", "proteinGoal", "carbsGoal", "fatGoal", "fitnessGoal",
        "unitPreference", "setupCompleted", "sentContact", "tzIdentifier", "sendCheckins",
        "activityLevel", gender, "manualMacroGoals", "subscriptionExpiryDate", "subscriptionType",
        "pushNotificationPreference"
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
        $22, $23, $24, $25
      )
      ON CONFLICT (id) DO UPDATE SET
        "fullName" = EXCLUDED."fullName",
        "avatarUrl" = EXCLUDED."avatarUrl",
        email = EXCLUDED.email,
        "emailVerified" = EXCLUDED."emailVerified",
        phone = EXCLUDED.phone,
        "dateOfBirth" = EXCLUDED."dateOfBirth",
        "weightKg" = EXCLUDED."weightKg",
        "heightCm" = EXCLUDED."heightCm",
        "calorieGoal" = EXCLUDED."calorieGoal",
        "proteinGoal" = EXCLUDED."proteinGoal",
        "carbsGoal" = EXCLUDED."carbsGoal",
        "fatGoal" = EXCLUDED."fatGoal",
        "fitnessGoal" = EXCLUDED."fitnessGoal",
        "unitPreference" = EXCLUDED."unitPreference",
        "setupCompleted" = EXCLUDED."setupCompleted",
        "sentContact" = EXCLUDED."sentContact",
        "tzIdentifier" = EXCLUDED."tzIdentifier",
        "sendCheckins" = EXCLUDED."sendCheckins",
        "activityLevel" = EXCLUDED."activityLevel",
        gender = EXCLUDED.gender,
        "manualMacroGoals" = EXCLUDED."manualMacroGoals",
        "subscriptionExpiryDate" = EXCLUDED."subscriptionExpiryDate",
        "subscriptionType" = EXCLUDED."subscriptionType",
        "pushNotificationPreference" = EXCLUDED."pushNotificationPreference";
    `,
      [
        prodUser[0].id,
        prodUser[0].fullName,
        prodUser[0].avatarUrl,
        prodUser[0].email,
        prodUser[0].emailVerified,
        prodUser[0].phone,
        prodUser[0].dateOfBirth,
        prodUser[0].weightKg,
        prodUser[0].heightCm,
        prodUser[0].calorieGoal,
        prodUser[0].proteinGoal,
        prodUser[0].carbsGoal,
        prodUser[0].fatGoal,
        prodUser[0].fitnessGoal,
        prodUser[0].unitPreference,
        prodUser[0].setupCompleted,
        prodUser[0].sentContact,
        prodUser[0].tzIdentifier,
        prodUser[0].sendCheckins,
        prodUser[0].activityLevel,
        prodUser[0].gender,
        prodUser[0].manualMacroGoals,
        prodUser[0].subscriptionExpiryDate,
        prodUser[0].subscriptionType,
        prodUser[0].pushNotificationPreference,
      ]
    );
  }
};

const upsertMessage = async (prodClient: Client, localClient: Client, messageId: number) => {
  const prodMessage = await fetchData(prodClient, 'SELECT * FROM "Message" WHERE id = $1', [messageId])
  const localMessage = await fetchData(localClient, 'SELECT * FROM "Message" WHERE id = $1', [messageId])

  if (prodMessage.length > 0 && localMessage.length === 0) {
    await insertUserIfNotExists(prodClient, localClient, prodMessage[0].userId)

    await insertData(
      localClient,
      `
      INSERT INTO "Message" (
        id, "createdAt", content, function_name, role, "userId", "itemsProcessed",
        "itemsToProcess", "messageType", "resolvedAt", status, local_id, hasimages,
        "isAudio", "isBadFoodRequest", "consumedOn", "deletedAt"
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
      )
    `,
      [
        prodMessage[0].id,
        prodMessage[0].createdAt,
        prodMessage[0].content,
        prodMessage[0].function_name,
        prodMessage[0].role,
        prodMessage[0].userId,
        prodMessage[0].itemsProcessed,
        prodMessage[0].itemsToProcess,
        prodMessage[0].messageType,
        prodMessage[0].resolvedAt,
        prodMessage[0].status,
        prodMessage[0].local_id,
        prodMessage[0].hasimages,
        prodMessage[0].isAudio,
        prodMessage[0].isBadFoodRequest,
        prodMessage[0].consumedOn,
        prodMessage[0].deletedAt
      ]
    )
  }
}

const addFoodItem = async (prodClient: Client, localClient: Client, foodItemId: number) => {
  console.log(`Adding food item ${foodItemId} from prod to local...`)
  // Fetch the food item from prod
  const foodItem = await fetchData(prodClient, 'SELECT * FROM "FoodItem" WHERE id = $1', [foodItemId])
  if (foodItem.length === 0) {
    throw new Error(`FoodItem with id ${foodItemId} not found in prod`)
  }
  // Upsert the message if it does not exist in the local database
  if (foodItem[0].messageId) {
    await upsertMessage(prodClient, localClient, foodItem[0].messageId)
  }

  // Insert the food item into local
  await insertData(
    localClient,
    `
    INSERT INTO "FoodItem" (
      id, name, brand, "knownAs", description, "defaultServingWeightGram", "kcalPerServing",
      "totalFatPerServing", "satFatPerServing", "transFatPerServing", "carbPerServing",
      "sugarPerServing", "addedSugarPerServing", "proteinPerServing", "lastUpdated", verified,
      "userId", "messageId", "foodInfoSource", "adaEmbedding", "UPC", "defaultServingLiquidMl",
      "externalId", "fiberPerServing", "isLiquid", "weightUnknown", "bgeBaseEmbedding", "createdAtDateTime",
      "foodItemCategoryID", "foodItemCategoryName"
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
      $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30
    )
  `,
    [
      foodItem[0].id,
      foodItem[0].name,
      foodItem[0].brand,
      foodItem[0].knownAs,
      foodItem[0].description,
      foodItem[0].defaultServingWeightGram,
      foodItem[0].kcalPerServing,
      foodItem[0].totalFatPerServing,
      foodItem[0].satFatPerServing,
      foodItem[0].transFatPerServing,
      foodItem[0].carbPerServing,
      foodItem[0].sugarPerServing,
      foodItem[0].addedSugarPerServing,
      foodItem[0].proteinPerServing,
      foodItem[0].lastUpdated,
      foodItem[0].verified,
      foodItem[0].userId,
      foodItem[0].messageId,
      foodItem[0].foodInfoSource,
      foodItem[0].adaEmbedding,
      foodItem[0].UPC,
      foodItem[0].defaultServingLiquidMl,
      foodItem[0].externalId,
      foodItem[0].fiberPerServing,
      foodItem[0].isLiquid,
      foodItem[0].weightUnknown,
      foodItem[0].bgeBaseEmbedding,
      foodItem[0].createdAtDateTime,
      foodItem[0].foodItemCategoryID,
      foodItem[0].foodItemCategoryName
    ]
  )

  // Insert nutrients
  const nutrients = await fetchData(prodClient, 'SELECT * FROM "Nutrient" WHERE "foodItemId" = $1', [foodItemId])
  for (const nutrient of nutrients) {
    await insertData(
      localClient,
      `
      INSERT INTO "Nutrient" (
        id, "nutrientName", "nutrientUnit", "nutrientAmountPerDefaultServing", "foodItemId"
      ) VALUES (
        $1, $2, $3, $4, $5
      )
    `,
      [
        nutrient.id,
        nutrient.nutrientName,
        nutrient.nutrientUnit,
        nutrient.nutrientAmountPerDefaultServing,
        nutrient.foodItemId
      ]
    )
  }

  // Insert servings
  const servings = await fetchData(prodClient, 'SELECT * FROM "Serving" WHERE "foodItemId" = $1', [foodItemId])
  for (const serving of servings) {
    await insertData(
      localClient,
      `
      INSERT INTO "Serving" (
        id, "servingWeightGram", "servingName", "foodItemId", "servingAlternateAmount", "servingAlternateUnit", "defaultServingAmount"
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7
      )
    `,
      [
        serving.id,
        serving.servingWeightGram,
        serving.servingName,
        serving.foodItemId,
        serving.servingAlternateAmount,
        serving.servingAlternateUnit,
        serving.defaultServingAmount
      ]
    )
  }
}

const addLoggedFoodItems = async (prodClient: Client, localClient: Client, messageId: number) => {
  // Fetch the logged food items from prod
  console.log(`Fetching logged food items with messageId ${messageId} from prod...`)
  const loggedFoodItems = await fetchData(prodClient, 'SELECT * FROM "LoggedFoodItem" WHERE "messageId" = $1', [
    messageId
  ])
  if (loggedFoodItems.length === 0) {
    throw new Error(`LoggedFoodItems with messageId ${messageId} not found in prod`)
  }

  for (const loggedFoodItem of loggedFoodItems) {
    const localFoodItem = await fetchData(localClient, 'SELECT * FROM "FoodItem" WHERE id = $1', [
      loggedFoodItem.foodItemId
    ])

    if (localFoodItem.length === 0 && loggedFoodItem.foodItemId !== null) {
      await addFoodItem(prodClient, localClient, loggedFoodItem.foodItemId)
    }

    // Insert the logged food item into local
    await insertData(
      localClient,
      `
      INSERT INTO "LoggedFoodItem" (
        id, "createdAt", "updatedAt", "consumedOn", "foodItemId", grams, "servingId", "servingAmount",
        "loggedUnit", "userId", "messageId", status, "extendedOpenAiData", "embeddingId", "deletedAt",
        local_id, "isBadFoodItemRequest"
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
      )
    `,
      [
        loggedFoodItem.id,
        loggedFoodItem.createdAt,
        loggedFoodItem.updatedAt,
        loggedFoodItem.consumedOn,
        loggedFoodItem.foodItemId,
        loggedFoodItem.grams,
        loggedFoodItem.servingId,
        loggedFoodItem.servingAmount,
        loggedFoodItem.loggedUnit,
        loggedFoodItem.userId,
        loggedFoodItem.messageId,
        loggedFoodItem.status,
        loggedFoodItem.extendedOpenAiData,
        loggedFoodItem.embeddingId,
        loggedFoodItem.deletedAt,
        loggedFoodItem.local_id,
        loggedFoodItem.isBadFoodItemRequest
      ]
    )
  }
}

const migrateData = async () => {
  await prodClient.connect()
  await localClient.connect()

  const prodMessages = await fetchData(prodClient, 'SELECT * FROM "Message" ORDER BY "createdAt" DESC LIMIT 100')

  console.log(`Migrating ${prodMessages.length} messages from prod to local...`)

  for (const message of prodMessages) {
    console.log(`Migrating message ${message.id} from prod to local...`)
    const localMessage = await fetchData(localClient, 'SELECT * FROM "Message" WHERE id = $1', [message.id])

    if (localMessage.length === 0) {
      await insertUserIfNotExists(prodClient, localClient, message.userId)

      await insertData(
        localClient,
        `
        INSERT INTO "Message" (
          id, "createdAt", content, function_name, role, "userId", "itemsProcessed",
          "itemsToProcess", "messageType", "resolvedAt", status, local_id, hasimages,
          "isAudio", "isBadFoodRequest", "consumedOn", "deletedAt"
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
        )
      `,
        [
          message.id,
          message.createdAt,
          message.content,
          message.function_name,
          message.role,
          message.userId,
          message.itemsProcessed,
          message.itemsToProcess,
          message.messageType,
          message.resolvedAt,
          message.status,
          message.local_id,
          message.hasimages,
          message.isAudio,
          message.isBadFoodRequest,
          message.consumedOn,
          message.deletedAt
        ]
      )

      await addLoggedFoodItems(prodClient, localClient, message.id) // Pass only the message id here
    }
  }

  await prodClient.end()
  await localClient.end()
}

const main = async () => {
  try {
    console.log("Starting data migration from prod to local...")
    await migrateData()
    console.log("Data migration completed successfully.")
  } catch (error) {
    console.error("Error during data migration:", error)
  }
}

main()
