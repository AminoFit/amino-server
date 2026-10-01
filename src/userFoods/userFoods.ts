// A user's own foods and recipes (plan: 2026-09-30-custom-foods-and-recipes-plan.md). The server prices everything;
// save_user_food decides in one transaction whether an edit is in place or a new version (edits only apply going
// forward), and log_food_as_meal writes a logged row with the nutrients priced here. Logged meals are never rewritten.
import { z } from "zod"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { getCachedOrFetchEmbeddings } from "@/utils/embeddingsCache/getCachedOrFetchEmbeddings"
import { COLUMN_NUTRIENTS, MICRO_KEYS, columnValues, nutrientRows, nutrientsAt, recipeValues, validNutrition,
  type Amounts, type FoodBasis } from "@/nutrition"
import { normalizeGtin } from "@/mealResolution/barcode"

type Db = ReturnType<typeof createAdminSupabase>

/** A failure the caller shows as is: HTTP status plus a stable code. */
export class UserFoodError extends Error {
  constructor(readonly code:string,readonly status:number) {super(code)}
}
const fail=(code:string,status:number):never=>{throw new UserFoodError(code,status)}

/** Database errors from the user-food functions, by SQLSTATE. */
function rpcFailure(error:{code?:string;message?:string}):never {
  const known:Record<string,[string,number]>={"22023":["invalid_food",422],P0002:[error.message??"food_unavailable",404],
    "23505":["name_taken",409],"42501":["ingredient_unavailable",422],"40001":["meal_changed",409],"55000":["meal_busy",409]}
  const hit=error.code?known[error.code]:undefined
  if (hit) fail(hit[0],hit[1])
  throw new Error(`user_food_write_failed: ${error.message??"unknown"}`)
}

const text=(max:number)=>z.string().trim().min(1).max(max)
const amount=z.number().finite().nonnegative().max(45000)
const servingInput=z.object({unit:text(40),amount:z.number().finite().positive().max(1000),grams:z.number().finite().positive().max(5000)}).strict()
const microKeys=MICRO_KEYS as unknown as [string,...string[]]

export const customFoodInput=z.object({
  name:z.string().trim().min(2).max(120),brand:z.string().trim().max(120).nullable().optional(),
  /** The serving the values are for, e.g. 1 bar = 45 g. For a drink, grams are its millilitres. */
  serving:servingInput,isLiquid:z.boolean().optional(),
  kcal:amount,proteinG:amount,carbG:amount,totalFatG:amount,
  fiberG:amount.nullable().optional(),sugarG:amount.nullable().optional(),addedSugarG:amount.nullable().optional(),
  satFatG:amount.nullable().optional(),transFatG:amount.nullable().optional(),
  /** Other nutrients for the same serving, by logged-nutrient key (e.g. sodiumMg). */
  nutrients:z.partialRecord(z.enum(microKeys),amount).optional(),
  extraServings:z.array(servingInput).max(8).optional(),
  /** The package's barcode (scanned from its label, or typed); null clears it. Checked by its check digit. */
  gtin:z.string().trim().max(20).nullable().optional()
}).strict()
export type CustomFoodInput = z.infer<typeof customFoodInput>

const ingredientInput=z.object({foodItemId:z.number().int().positive(),
  grams:z.number().finite().positive().max(20000).optional(),
  servingId:z.number().int().positive().nullable().optional(),amount:z.number().finite().positive().max(10000).optional()})
  .strict().refine(i=>i.servingId!=null?i.amount!=null&&i.grams==null:i.grams!=null,"Give grams, or a serving and an amount")
export const recipeInput=z.object({
  name:z.string().trim().min(2).max(120),portions:z.number().finite().positive().max(1000),
  cookedWeightGram:z.number().finite().positive().max(50000).nullable().optional(),
  ingredients:z.array(ingredientInput).min(1).max(50)
}).strict()
export type RecipeInput = z.infer<typeof recipeInput>

/** A food or a recipe, as the Foods tab saves it. */
export const userFoodBody=z.discriminatedUnion("kind",[customFoodInput.extend({kind:z.literal("food")}),
  recipeInput.extend({kind:z.literal("recipe")})])

/** Creates (foodId null) or edits a food or recipe from the Foods tab. */
export function saveUserFood(userId:string,foodId:number|null,body:z.infer<typeof userFoodBody>) {
  const {kind,...input}=body
  return kind==="food"?saveCustomFood(userId,foodId,input as CustomFoodInput):saveRecipe(userId,foodId,input as RecipeInput)
}

/** How much of a food to log: a number of its servings, grams, or portions (recipes: its default serving). */
export const quantityInput=z.union([
  z.object({servingId:z.number().int().positive(),amount:z.number().finite().positive().max(1000)}).strict(),
  z.object({grams:z.number().finite().positive().max(5000)}).strict(),
  z.object({portions:z.number().finite().positive().max(1000)}).strict()])
export type QuantityInput = z.infer<typeof quantityInput>

const foodColumns=`id,name,brand,gtin,privateToUserId,archivedAt,recipePortions,cookedWeightGram,previousVersionId,
  defaultServingWeightGram,weightUnknown,isLiquid,lastUpdated,${Object.values(COLUMN_NUTRIENTS).join(",")},
  Serving(id,servingName,servingWeightGram,defaultServingAmount),Nutrient(nutrientName,nutrientAmountPerDefaultServing,nutrientUnit)`
type ServingRow = {id:number;servingName:string;servingWeightGram:number|null;defaultServingAmount:number|null}
export type PricedFood = FoodBasis & {id:number;name:string;brand:string|null;privateToUserId:string|null;archivedAt:string|null;
  recipePortions:number|null;cookedWeightGram:number|null;isLiquid:boolean;Serving:ServingRow[]}

/** Foods this user may use: shared foods and their own. Archived versions only when asked (past logs, old recipes). */
async function loadFoods(db:Db,userId:string,ids:number[],{archived=false}={}):Promise<Map<number,PricedFood>> {
  const unique=[...new Set(ids)]
  if (!unique.length) return new Map()
  let query=db.from("FoodItem").select(foodColumns).in("id",unique).or(`privateToUserId.is.null,privateToUserId.eq.${userId}`)
  if (!archived) query=query.is("archivedAt",null)
  const {data,error}=await query
  if (error) throw error
  return new Map(((data??[]) as unknown as PricedFood[]).map(food=>[food.id,food]))
}

const gramsPerUnit=(serving:ServingRow)=>Number(serving.servingWeightGram)/Number(serving.defaultServingAmount||1)
function servingOf(food:PricedFood,servingId:number) {
  const serving=food.Serving.find(row=>row.id===servingId)
  if (!serving||!(gramsPerUnit(serving)>0)) fail("serving_unavailable",422)
  return serving!
}

async function embedding(name:string,brand:string|null|undefined) {
  const [vector]=await getCachedOrFetchEmbeddings("BGE_BASE",[brand?`${name} - ${brand}`:name])
  return JSON.stringify(vector.embedding)
}

/** A new food (or a renamed version, which doesn't keep the old icon) gets a category and an icon from the queues. */
async function enrich(db:Db,foodId:number) {
  const {data}=await db.from("FoodItemImages").select("foodItemId").eq("foodItemId",foodId).limit(1)
  const [{classifyFoodCategoryQueue},{generateFoodIconQueue}]=await Promise.all([
    import("@/app/api/queues/classify-food-category/classify-food-category"),
    import("@/app/api/queues/generate-food-icon/generate-food-icon")])
  await Promise.all([
    classifyFoodCategoryQueue.enqueue(String(foodId)),
    ...(data?.length?[]:[generateFoodIconQueue.enqueue(String(foodId),{id:`icon-${foodId}`})])
  ]).catch(error=>console.error("User food saved, but enrichment could not be queued",{foodId,error}))
}

async function save(db:Db,userId:string,foodId:number|null,food:Record<string,unknown>,
  servings:{name:string;grams:number;amount:number}[],nutrients:{name:string;unit:string;amount:number}[],
  ingredients:Record<string,unknown>[]|null) {
  const {data,error}=await (db as any).rpc("save_user_food",{p_user_id:userId,p_food_id:foodId,p_food:food,
    p_servings:servings,p_nutrients:nutrients,p_ingredients:ingredients})
  if (error) rpcFailure(error)
  const row=(data as {food_id:number;created:boolean;versioned:boolean;previous_id:number|null}[])[0]
  if (row.created||row.versioned) await enrich(db,row.food_id)
  return {foodId:row.food_id,created:row.created,versioned:row.versioned,previousId:row.previous_id}
}

/** Creates (foodId null) or edits a custom food. */
export async function saveCustomFood(userId:string,foodId:number|null,input:CustomFoodInput,db:Db=createAdminSupabase()) {
  const grams=input.serving.grams
  if (!validNutrition(grams,{kcal:input.kcal,proteinG:input.proteinG,carbG:input.carbG,totalFatG:input.totalFatG}))
    fail("values_do_not_fit_serving",422)
  const unit=(s:{unit:string;amount:number;grams:number})=>({name:s.unit,grams:s.grams,amount:s.amount})
  const servings=[unit(input.serving),...(input.extraServings??[]).map(unit)]
  const food={name:input.name,brand:input.brand??null,defaultServingWeightGram:grams,
    defaultServingLiquidMl:input.isLiquid?grams:null,isLiquid:input.isLiquid??false,
    kcal:input.kcal,proteinG:input.proteinG,carbG:input.carbG,totalFatG:input.totalFatG,
    fiberG:input.fiberG??null,sugarG:input.sugarG??null,addedSugarG:input.addedSugarG??null,
    satFatG:input.satFatG??null,transFatG:input.transFatG??null,description:"Added by the user",
    bgeBaseEmbedding:await embedding(input.name,input.brand)}
  const gtin=input.gtin?normalizeGtin(input.gtin):null
  if (input.gtin&&!gtin) fail("invalid_barcode",422)
  const saved=await save(db,userId,foodId,food,servings,nutrientRows((input.nutrients??{}) as Amounts),null)
  // The barcode is set on the saved version (a new version is a new row): the user's own food then answers that barcode
  // ahead of the shared catalogue's.
  if (input.gtin!==undefined) {
    const {error}=await db.from("FoodItem").update({gtin,UPC:gtin?Number(gtin):null}).eq("id",saved.foodId).eq("privateToUserId",userId)
    if (error) throw error
  }
  return saved
}

/** Creates (foodId null) or edits a recipe: per-portion values from its ingredients, priced now. */
export async function saveRecipe(userId:string,foodId:number|null,input:RecipeInput,db:Db=createAdminSupabase()) {
  // An edit may keep an ingredient that has since been replaced by a newer version (archived).
  const foods=await loadFoods(db,userId,input.ingredients.map(i=>i.foodItemId),{archived:foodId!==null})
  const priced=input.ingredients.map(ingredient=>{
    const food=foods.get(ingredient.foodItemId)
    if (!food||food.recipePortions!==null) fail("ingredient_unavailable",422)
    const serving=ingredient.servingId!=null?servingOf(food!,ingredient.servingId):null
    const grams=serving?ingredient.amount!*gramsPerUnit(serving):ingredient.grams!
    if (!(grams>0&&grams<=20000)) fail("invalid_ingredient_amount",422)
    if (!nutrientsAt(food!,grams)) fail("ingredient_nutrition_unavailable",422)
    return {food:food!,grams,servingId:serving?.id??null,servingAmount:serving?ingredient.amount!:grams,
      loggedUnit:serving?.servingName??"g"}
  })
  const values=recipeValues(priced,input.portions,input.cookedWeightGram)
  if (!(values.portionGrams>0&&values.portionGrams<=20000)) fail("invalid_portion_weight",422)
  const food={name:input.name,brand:null,defaultServingWeightGram:values.portionGrams,isLiquid:false,
    ...columnValues(values.perPortion),recipePortions:input.portions,cookedWeightGram:input.cookedWeightGram??null,
    description:"Recipe",bgeBaseEmbedding:await embedding(input.name,null)}
  // Recipes are thought of in portions only (owner): a "whole recipe" serving was the same as a portion for a
  // one-portion recipe and only confused the picker. Grams remain for logging by weight.
  const servings=[{name:"portion",grams:values.portionGrams,amount:1}]
  return save(db,userId,foodId,food,servings,nutrientRows(values.perPortion),priced.map(item=>({foodItemId:item.food.id,
    grams:item.grams,servingId:item.servingId,servingAmount:item.servingAmount,loggedUnit:item.loggedUnit})))
}

export async function archiveUserFood(userId:string,foodId:number,db:Db=createAdminSupabase()) {
  const {data,error}=await (db as any).rpc("archive_user_food",{p_user_id:userId,p_food_id:foodId})
  if (error) throw error
  if (data!==true) fail("food_unavailable",404)
}

/** A food with its servings, nutrients and (for a recipe) ingredients. Archived versions too, so past logs open. */
export async function getUserFood(userId:string,foodId:number,db:Db=createAdminSupabase()) {
  const food=(await loadFoods(db,userId,[foodId],{archived:true})).get(foodId)
  if (!food) fail("food_unavailable",404)
  let ingredients:unknown[]=[]
  if (food!.recipePortions!==null) {
    // Generated types predate RecipeIngredient.
    const {data,error}=await (db as any).from("RecipeIngredient")
      .select("id,foodItemId,grams,servingId,servingAmount,loggedUnit,position,FoodItem!RecipeIngredient_foodItemId_fkey(id,name,brand,archivedAt)")
      .eq("recipeFoodItemId",foodId).order("position")
    if (error) throw error
    ingredients=data??[]
  }
  // Values per default serving by logged-nutrient key (sodiumMg…), so an editor can keep the ones it doesn't show.
  const perServing=food!.defaultServingWeightGram?nutrientsAt(food!,food!.defaultServingWeightGram):null
  return {...food!,perServing,ingredients}
}

/** Grams, serving and unit for a quantity of a food. */
export function quantityOf(food:PricedFood,quantity:QuantityInput) {
  if ("servingId" in quantity) {
    const serving=servingOf(food,quantity.servingId)
    return {grams:quantity.amount*gramsPerUnit(serving),servingId:serving.id,servingAmount:quantity.amount,loggedUnit:serving.servingName}
  }
  if ("grams" in quantity) return {grams:quantity.grams,servingId:null,servingAmount:quantity.grams,loggedUnit:"g"}
  const base=Number(food.defaultServingWeightGram)
  if (!(base>0)) fail("serving_unavailable",422)
  const portion=food.recipePortions!==null?food.Serving.find(row=>row.servingName==="portion"):undefined
  return {grams:quantity.portions*base,servingId:portion?.id??null,servingAmount:quantity.portions,
    loggedUnit:food.recipePortions!==null?"portion":"serving"}
}

/** A logged row priced from the food as it is now. */
export function pricedItem(food:PricedFood,quantity:QuantityInput) {
  const amount=quantityOf(food,quantity)
  const nutrition=nutrientsAt(food,amount.grams)
  if (!nutrition||!validNutrition(amount.grams,{kcal:nutrition.kcal??0,proteinG:nutrition.proteinG??null,
    carbG:nutrition.carbG??null,totalFatG:nutrition.totalFatG??null})) fail("invalid_nutrition",422)
  return {foodItemId:food.id,...amount,nutrition}
}

const describe=(food:PricedFood,item:{servingAmount:number;loggedUnit:string})=>{
  const n=Math.round(item.servingAmount*100)/100
  const unit=item.loggedUnit==="portion"?(n===1?"portion":"portions"):item.loggedUnit
  return `${food.name} (${n} ${unit})`
}
/** Postgres timestamp (UTC wall clock, as Message.consumedOn stores it) for an ISO instant. */
const utcWallClock=(instant:string)=>new Date(instant).toISOString().replace("T"," ").replace("Z","")

/** Logs a food as a new meal. localId (from the app) makes a retry return the meal already created. */
export async function logFoodAsMeal(userId:string,foodId:number,quantity:QuantityInput,consumedOn:string,localId:string,
  db:Db=createAdminSupabase()) {
  const food=(await loadFoods(db,userId,[foodId])).get(foodId)
  if (!food) fail("food_unavailable",404)
  const item=pricedItem(food!,quantity)
  const {data,error}=await (db as any).rpc("log_food_as_meal",{p_user_id:userId,p_local_id:localId,
    p_consumed_on:utcWallClock(consumedOn),p_content:describe(food!,item),p_item:item})
  if (error) rpcFailure(error)
  const row=(data as {message_id:number;logged_food_item_id:number;created:boolean}[])[0]
  return {messageId:row.message_id,loggedFoodItemId:row.logged_food_item_id,created:row.created}
}

/** Logs foods the user picked themselves (Add Food's tray) as one new meal, each priced here. localId makes a retry
 * return the meal already created. */
export async function logFoodsAsMeal(userId:string,items:{foodItemId:number;quantity:QuantityInput}[],consumedOn:string,
  localId:string,db:Db=createAdminSupabase()) {
  if (!items.length||items.length>50) fail("invalid_meal",422)
  const foods=await loadFoods(db,userId,[...new Set(items.map(item=>item.foodItemId))])
  const priced=items.map(item=>{
    const food=foods.get(item.foodItemId)
    if (!food) fail("food_unavailable",404)
    return {food:food!,item:pricedItem(food!,item.quantity)}
  })
  const {data,error}=await (db as any).rpc("log_foods_as_meal",{p_user_id:userId,p_local_id:localId,
    p_consumed_on:utcWallClock(consumedOn),p_content:priced.map(entry=>describe(entry.food,entry.item)).join(", "),
    p_items:priced.map(entry=>entry.item)})
  if (error) rpcFailure(error)
  const row=(data as {message_id:number;logged_food_item_ids:number[];created:boolean}[])[0]
  return {messageId:row.message_id,loggedFoodItemIds:row.logged_food_item_ids,created:row.created}
}

/** A recipe draft from a past meal: its foods and amounts as logged. The user says in the app how many portions those
 * amounts make, and names it, before saving. */
export async function recipeDraftFromMeal(userId:string,messageId:number,db:Db=createAdminSupabase()) {
  const meal=await db.from("Message").select("id,content").eq("id",messageId).eq("userId",userId).is("deletedAt",null).maybeSingle()
  if (meal.error) throw meal.error
  if (!meal.data) fail("meal_unavailable",404)
  const rows=await db.from("LoggedFoodItem")
    .select("id,foodItemId,grams,servingId,servingAmount,loggedUnit,FoodItem(id,name,brand,recipePortions,privateToUserId)")
    .eq("messageId",messageId).eq("userId",userId).is("deletedAt",null).order("id").limit(51)
  if (rows.error) throw rows.error
  // A recipe logged in the meal can't be an ingredient (no nested recipes): it is reported, not silently dropped.
  const logged=(rows.data??[]) as any[]
  const skipped=logged.filter(row=>!row.FoodItem||row.FoodItem.recipePortions!==null)
    .map(row=>({loggedFoodItemId:row.id as number,name:(row.FoodItem?.name??null) as string|null}))
  const ingredients=logged.filter(row=>row.FoodItem&&row.FoodItem.recipePortions===null).map(row=>({
    foodItemId:row.foodItemId as number,name:row.FoodItem.name as string,brand:(row.FoodItem.brand??null) as string|null,
    grams:row.grams as number,
    ...(row.servingId&&row.servingAmount?{servingId:row.servingId as number,amount:row.servingAmount as number,unit:row.loggedUnit as string|null}:{})}))
  if (!ingredients.length) fail("meal_has_no_foods",422)
  const content=(meal.data!.content??"").trim()
  // A short meal text is usually a dish name ("Chicken pasta"); a long one is a description, so the first food names it.
  return {messageId,
    name:content.length>=2&&content.length<=40?content:ingredients[0].name,ingredients,skipped}
}
