import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { localTime, utcInstant } from "@/mealOperations/instant"
import { HISTORY_NUTRIENTS, type HistoryNutrition } from "@/nutrition"
import { getCachedOrFetchEmbeddings } from "@/utils/embeddingsCache/getCachedOrFetchEmbeddings"
import { blendSearch, type SearchRow } from "./searchBlend"
import { userFlagEnabled } from "./fastRouteFlag"
import {catalogueOrOwnFilter,visibleFoodFilter} from "../userFoods/visibility"

/** FeatureFlag that lets the agent and the fast route use the user's recipes (the recipe check gates each use). */
export const RECIPES_FLAG = "recipes_in_agent"

export type CatalogFood = {
  id:number;name:string;brand:string|null;lastUpdated:string;gtin?:string|null;description?:string|null;
  defaultServingWeightGram:number|null;weightUnknown:boolean;
  kcalPerServing:number|null;proteinPerServing:number|null;carbPerServing:number|null;totalFatPerServing:number|null;
  satFatPerServing:number|null;transFatPerServing:number|null;fiberPerServing:number|null;
  sugarPerServing:number|null;addedSugarPerServing:number|null;
  Serving:{id:number;foodItemId:number;servingName:string;servingWeightGram:number|null;defaultServingAmount:number|null}[]
  /** Its vitamins and minerals per default serving (any naming; read through foodResolution/micronutrients). */
  Nutrient?:{nutrientName:string;nutrientUnit:string|null;nutrientAmountPerDefaultServing:number}[]|null
  /** Set when the food is this user's own (their label's values or their recipe). */
  privateToUserId?:string|null
  /** Set for the user's recipe: the portions it makes. Its default serving ("portion") is one portion. */
  recipePortions?:number|null
  /** Its other package barcodes (FoodItem.gtin is the main one), each with the package's serving when known. */
  FoodBarcode?:{gtin:string;servingId:number|null}[]|null
  /** Set on a food found by one of its package barcodes in this meal: that package's serving ("bottle", 414 g). */
  packageServingId?:number|null
}

/** Whether a food carries this barcode, as its main one or as another package size. */
export const carries=(food:Pick<CatalogFood,"gtin"|"FoodBarcode">|null|undefined,gtin:string)=>
  !!food&&(food.gtin===gtin||(food.FoodBarcode??[]).some(row=>row.gtin===gtin))

/** The food as the package this barcode is: its gtin reads as the scanned one, and its package serving is the default
 * amount (the 14 fl oz bottle, not the 8 fl oz one the food's main barcode is). */
export function asScanned(food:CatalogFood,gtin:string):CatalogFood {
  if (food.gtin===gtin) return food
  const row=(food.FoodBarcode??[]).find(barcode=>barcode.gtin===gtin)
  return row?{...food,gtin,packageServingId:row.servingId}:food
}
export type HistoricalFood = {
  id:number;updatedAt:string;foodItemId:number;name:string;brand:string|null;
  grams:number;kcal:number;nutrition:HistoryNutrition;
  servingId:number|null;servingAmount:number|null;loggedUnit:string|null;
  groupId:string|null
}
export type MealEvent = {messageId:number;revision:number;originalText:string;consumedOn:string;consumedOnLocal?:string;
  hasimages:boolean;foods:HistoricalFood[];groups:unknown[]}

const catalogColumns = "id,name,brand,gtin,privateToUserId,recipePortions,description,lastUpdated,defaultServingWeightGram,weightUnknown,kcalPerServing,proteinPerServing,carbPerServing,totalFatPerServing,satFatPerServing,transFatPerServing,fiberPerServing,sugarPerServing,addedSugarPerServing,Serving(id,foodItemId,servingName,servingWeightGram,defaultServingAmount),Nutrient(nutrientName,nutrientUnit,nutrientAmountPerDefaultServing),FoodBarcode(gtin,servingId)"
const historyColumns = `id,updatedAt,foodItemId,grams,${HISTORY_NUTRIENTS.join(",")},servingId,servingAmount,loggedUnit,extendedOpenAiData,FoodItem(id,name,brand)`

// Legacy imports stored some serving sizes as the amount ("355 ml" x355, "1 cup" 240 g x240), which makes one
// unit weigh about a gram. The catalogue audit (A1) repaired the existing rows; any such serving is still never
// offered, so the agent logs by mass or by a sound serving instead.
const GRAM_UNITS=new Set(["g","gram","grams","gr","ml","milliliter","milliliters","millilitre","millilitres"])
export function usableServing(serving:CatalogFood["Serving"][number]) {
  const grams=serving.servingWeightGram??0,amount=Number(serving.defaultServingAmount??0)
  if (!(grams>0)||!(amount>0)) return false
  const leading=/^\s*(\d+(?:\.\d+)?)\s*(.*)$/.exec(serving.servingName??"")
  const unit=(leading?leading[2]:serving.servingName??"").trim().toLowerCase().replace(/\.$/,"")
  // "2 tbsp." x2 = 31 g is 15.5 g per tbsp; "355 ml" x355 reads as one can but is 1 g per unit.
  const restated=leading&&amount>1&&Number(leading[1])===amount
  // A single small unit is real (a tsp of spice, one berry); about a gram per unit only signals the size stored
  // as the amount when the amount is above 1.
  return restated?!GRAM_UNITS.has(unit)&&grams/amount>=2:amount===1||grams/amount>=2||GRAM_UNITS.has(unit)
}

/** Compact, authoritative view of a read food: enough to select it and its serving. */
export const foodSummary=(food:CatalogFood)=>({id:food.id,name:food.name,brand:food.brand,gtin:food.gtin??null,
  ...(food.privateToUserId?{yours:true}:{}),
  // The user's recipe, logged in portions (amount 1.5 of its "portion" serving is 1.5 portions).
  ...(food.recipePortions!=null?{recipe:{portions:Number(food.recipePortions)}}:{}),
  servingGrams:food.defaultServingWeightGram,kcal:food.kcalPerServing,proteinG:food.proteinPerServing,
  carbG:food.carbPerServing,totalFatG:food.totalFatPerServing,
  // Each serving is a unit and the weight of one unit: "pieces" 76 g for 4 is 19 g per piece, so 5 pieces is
  // amount 5. Showing the stored group ("76 g, amount 4") made the model log 5 pieces as 1.25 x 19 g.
  servings:food.Serving.map(s=>({id:s.id,unit:s.servingName,
    gramsPerUnit:s.servingWeightGram&&s.defaultServingAmount?Math.round(s.servingWeightGram/Number(s.defaultServingAmount)*10)/10:null}))})

/** A name as the catalogue search compares it: lower case, accents and punctuation gone (food_identity_part). */
const identityText=(value:string)=>value.toLowerCase().normalize("NFD").replace(/\p{M}+/gu,"")
  .replace(/[^\p{L}\p{N}]+/gu," ").trim()
/** The words a match must carry, as the catalogue search's: 3 or more letters, or a number. */
const identityWords=(value:string)=>[...new Set(identityText(value).split(" ").filter(word=>word.length>=3||/^[0-9]/.test(word)))]
/** A habit food matches a mention when its name and brand carry every word of it, each starting a word that is at most
 * 2 letters longer (a plural: eggs, kefirs, manzanas), so "apple" isn't "Applegate". */
export const carriesEveryWord=(mention:string,name:string,brand:string|null)=>{const words=identityWords(mention)
  const have=identityText(`${name} ${brand??""}`).split(" ")
  return words.length>0&&words.every(word=>have.some(part=>part.startsWith(word)&&part.length<=word.length+2))}
type Habit={foodId:number;name:string;brand:string|null;timesLogged:number;timesLast30Days:number;lastLoggedOn:string|null;favorite:boolean;
  usualServingId:number|null;usualAmount:number|null;usualUnit:string|null}

export function createMealEvidence(userId:string, signal:AbortSignal,
  db = createAdminSupabase(), timezone?:string) {
  // History times go to the model as UTC ("…Z") plus the user's wall clock, so "same as yesterday's lunch" never
  // depends on the model converting zones.
  const when=(value:string)=>{const utc=utcInstant(value)
    return {consumedOn:utc,...(timezone?{consumedOnLocal:localTime(utc,timezone)}:{})}}
  const discovered = new Set<number>()
  // Server reads bypass row security: only foods this user may see are evidence (read once, when first needed). A barcode
  // answers from the catalogue and the user's own foods.
  let visibleRead:Promise<string>|undefined
  // The user's habits (user_food_habits), read once per meal when first needed.
  let habitsRead:Promise<Habit[]>|undefined
  const visible=()=>visibleRead??=visibleFoodFilter(db,userId)
  const barcodeSpace = catalogueOrOwnFilter(userId)
  const foods = new Map<number,CatalogFood>()
  const events = new Map<number,MealEvent>()
  return {
    foods,events,
    /** Foods created or matched by the source tools become readable evidence. */
    discover(id:number) {if (Number.isSafeInteger(id)&&id>0) discovered.add(id)},
    /** Drop a cached food after this meal changed it (a label superseding an estimate), so the next read is fresh. */
    forget(id:number) {foods.delete(id)},
    async searchFoods(query:string,cursor=0) {
      const text=query.trim().slice(0,100)
      if (!text) return {status:"empty" as const,candidates:[],nextCursor:null}
      // The first page blends in the foods nearest by meaning (searchBlend.ts); later pages page the text search.
      const [result,near]=await Promise.all([
        (db as any).rpc("search_meal_food_catalogue",{p_query:text,p_limit:20,p_offset:cursor,p_user_id:userId}).abortSignal(signal),
        cursor>0?Promise.resolve([] as SearchRow[]):getCachedOrFetchEmbeddings("BGE_BASE",[text.toLowerCase()])
          .then(([vector])=>(db as any).rpc("search_food_catalogue_nearest",{p_embedding_cache_id:vector.id,p_limit:12,
            p_user_id:userId}).abortSignal(signal))
          .then((nearest:{data:SearchRow[]|null;error:unknown})=>nearest.error?[]:nearest.data??[])
          // Meaning is an improvement: without it the text search still answers.
          .catch(()=>[] as SearchRow[])])
      if (result.error) throw new Error("catalogue_unavailable")
      const textRows=((result.data??[]) as SearchRow[]).map(row=>({id:row.id,name:row.name,brand:row.brand,knownAs:row.knownAs}))
      const candidates=cursor>0?textRows:blendSearch(text,textRows,near.map(row=>({id:row.id,name:row.name,brand:row.brand,knownAs:row.knownAs})))
      for (const candidate of candidates) discovered.add(candidate.id)
      // Hydrate the best hits so the agent can select without another turn.
      const details=candidates.length?await this.getFoodsAndServings(candidates.slice(0,8).map(c=>c.id)):{foods:[]}
      return {status:candidates.length?"ok" as const:"empty" as const,candidates,
        foods:details.foods.map(foodSummary),nextCursor:textRows.length===20?cursor+20:null}
    },
    /** Catalogue foods carrying a barcode decoded from this meal's photos. */
    async findFoodsByGtin(gtins:string[]) {
      if (!gtins.length) return []
      // Never an archived version of a user's food (recipes carry no barcode). Other package sizes are in FoodBarcode.
      const [result,packages]=await Promise.all([
        db.from("FoodItem").select("id").in("gtin",gtins.slice(0,10)).or(barcodeSpace).is("archivedAt",null)
          .order("privateToUserId",{ascending:true,nullsFirst:false}).order("id").limit(10).abortSignal(signal),
        (db as any).from("FoodBarcode").select("foodItemId").in("gtin",gtins.slice(0,10)).or(barcodeSpace).limit(10).abortSignal(signal)])
      if (result.error||packages.error) throw new Error("catalogue_unavailable")
      const ids=[...new Set([...((result.data??[]) as {id:number}[]).map(row=>row.id),
        ...((packages.data??[]) as {foodItemId:number}[]).map(row=>row.foodItemId)])]
      for (const id of ids) discovered.add(id)
      return ids.length?(await this.getFoodsAndServings(ids)).foods:[]
    },
    /** The user's own foods and recipes whose names appear in the meal text, read before the first model turn: the
     * agent sees them only when relevant (recipes only behind RECIPES_FLAG, which search_own_foods applies). */
    /** Foods this user logs out of habit (the last 180 days, and favourites) whose name and brand carry every word of
     * the mention (3+ letters, or a number), most logged first, each with its history: "blueberry kefir" is the Lifeway
     * Lowfat Blueberry Kefir they log, not another of the catalogue's kefirs; "full fat kefir" matches none of their
     * lowfat ones, so the words win. */
    async usualFoods(query:string,meal?:{before:string;messageId:number},limit=3) {
      const words=identityWords(query)
      if (!words.length) return []
      habitsRead??=Promise.resolve((db as any).rpc("user_food_habits",{p_user_id:userId,p_days:180,
        ...(meal?{p_before:meal.before,p_message_id:meal.messageId}:{})}).abortSignal(signal))
        .then(({data,error}:{data:Habit[]|null;error:unknown})=>error?[]:data??[]).catch(()=>[] as Habit[])
      const matched=(await habitsRead).filter(habit=>carriesEveryWord(query,habit.name,habit.brand)).slice(0,limit)
      if (!matched.length) return []
      for (const habit of matched) discovered.add(habit.foodId)
      const {foods:found}=await this.getFoodsAndServings(matched.map(habit=>habit.foodId))
      const byId=new Map(found.map(food=>[food.id,food]))
      // "My usual" is the clear habit: the most logged match, at least twice and more often than any other match.
      const ranked=[...matched].sort((a,b)=>b.timesLogged-a.timesLogged||String(b.lastLoggedOn).localeCompare(String(a.lastLoggedOn)))
      const usual=ranked[0]&&ranked[0].timesLogged>=2&&(ranked[1]?.timesLogged??0)<ranked[0].timesLogged?ranked[0].foodId:null
      return matched.flatMap(habit=>{const food=byId.get(habit.foodId)
        return food?[{...foodSummary(food),yourHistory:{...(habit.foodId===usual?{yourUsual:true}:{}),timesLogged:habit.timesLogged,
          timesLast30Days:habit.timesLast30Days,lastLoggedOn:habit.lastLoggedOn,favorite:habit.favorite,
          usualServingId:habit.usualServingId,usualAmount:habit.usualAmount,usualUnit:habit.usualUnit}}]:[]})
    },
    async yourFoods(text:string) {
      const query=text.trim().slice(0,2000)
      if (!query) return []
      const result=await (db as any).rpc("search_own_foods",{p_text:query,p_user_id:userId,p_limit:5}).abortSignal(signal)
      if (result.error) throw new Error("catalogue_unavailable")
      const ids=((result.data??[]) as {id:number}[]).map(row=>row.id)
      for (const id of ids) discovered.add(id)
      return ids.length?(await this.getFoodsAndServings(ids)).foods:[]
    },
    /** Semantic catalogue neighbours of the whole meal text, read before the first model turn. */
    async prefetchFoods(text:string,limit=15) {
      const query=text.trim().slice(0,500)
      if (!query) return []
      const [vector]=await getCachedOrFetchEmbeddings("BGE_BASE",[query])
      const near=await (db as any).rpc("get_cosine_results",{p_embedding_cache_id:vector.id,amount_of_results:limit,p_user_id:userId}).abortSignal(signal)
      if (near.error) throw new Error("catalogue_unavailable")
      const ids=((near.data??[]) as {id:number}[]).map(row=>row.id)
      for (const id of ids) discovered.add(id)
      return ids.length?(await this.getFoodsAndServings(ids)).foods:[]
    },
    async getFoodsAndServings(ids:number[]) {
      const allowed=[...new Set(ids)].filter(id=>Number.isSafeInteger(id)&&discovered.has(id)).slice(0,20)
      const missing=allowed.filter(id=>!foods.has(id))
      if (missing.length) {
        const result=await db.from("FoodItem").select(catalogColumns).in("id",missing).or(await visible())
          .limit(31,{foreignTable:"Serving"}).abortSignal(signal)
        if (result.error) throw new Error("food_details_unavailable")
        for (const row of result.data??[]) {
          const food=row as unknown as CatalogFood
          foods.set(food.id,{...food,Serving:food.Serving.filter(usableServing).slice(0,30)})
        }
      }
      return {status:"ok" as const,foods:allowed.flatMap(id=>foods.has(id)?[foods.get(id)!]:[]),
        missingIds:allowed.filter(id=>!foods.has(id))}
    },
    async listMealEvents(from:string,to:string,cursor=0) {
      if (!Number.isInteger(cursor)||cursor<0||cursor>200||!Number.isFinite(Date.parse(from))||
        !Number.isFinite(Date.parse(to))||Date.parse(to)<=Date.parse(from)) throw new Error("invalid_history_window")
      const result=await db.from("Message").select("id,content,consumedOn,itemsToProcess,publishedRevision")
        .eq("userId",userId).eq("status","RESOLVED").is("deletedAt",null)
        .gte("consumedOn",from).lt("consumedOn",to)
        .order("consumedOn",{ascending:false}).order("id",{ascending:false})
        .range(cursor,cursor+20).abortSignal(signal)
      if (result.error) throw new Error("history_unavailable")
      return {status:"ok" as const,events:((result.data??[]) as any[]).slice(0,20).map(row=>({
        messageId:row.id,originalText:row.content,...when(row.consumedOn),
        foodCount:row.itemsToProcess,revision:row.publishedRevision})),
        nextCursor:(result.data?.length??0)>20?cursor+20:null}
    },
    /** Foods this user logged in the last 60 days (distinct, newest first): the text fast route prefers them over a
     * similar variant ("core power vanilla" is the regular shake they log, not the Elite one). */
    async recentFoods() {
      const since=new Date(Date.now()-60*86400000).toISOString()
      const [result,recipes]=await Promise.all([db.from("LoggedFoodItem").select("foodItemId,createdAt,FoodItem(name,brand,archivedAt,recipePortions)")
        .eq("userId",userId).is("deletedAt",null).gte("createdAt",since)
        .order("createdAt",{ascending:false}).limit(400).abortSignal(signal),
        userFlagEnabled(RECIPES_FLAG,userId,db).catch(()=>false)])
      if (result.error) throw new Error("history_unavailable")
      // Archived versions are replaced by their newer version; recipes are candidates only behind RECIPES_FLAG (the
      // recipe check then gates each use). Each food once, newest first, with how often it was logged.
      const rows=((result.data??[]) as any[]).filter(row=>row.foodItemId&&row.FoodItem&&!row.FoodItem.archivedAt&&
        (recipes||row.FoodItem.recipePortions==null))
      const logs=new Map<number,number>()
      for (const row of rows) logs.set(row.foodItemId,(logs.get(row.foodItemId)??0)+1)
      const seen=new Set<number>()
      return rows.filter(row=>!seen.has(row.foodItemId)&&seen.add(row.foodItemId))
        .map(row=>({id:row.foodItemId as number,name:row.FoodItem.name as string,brand:(row.FoodItem.brand??null) as string|null,
          logs:logs.get(row.foodItemId)!}))
    },
    async getMealEvent(messageId:number) {
      if (!Number.isSafeInteger(messageId)||messageId<=0) throw new Error("invalid_history_id")
      if (events.has(messageId)) return {status:"ok" as const,event:events.get(messageId)!}
      const message=await db.from("Message").select("id,userId,content,consumedOn,hasimages,publishedRevision,itemsToProcess,itemsProcessed")
        .eq("id",messageId).eq("userId",userId).eq("status","RESOLVED").is("deletedAt",null)
        .abortSignal(signal).maybeSingle()
      if (message.error) throw new Error("history_unavailable")
      const source=message.data as any
      if (!source||!source.consumedOn||!source.itemsToProcess||source.itemsToProcess!==source.itemsProcessed)
        return {status:"unavailable" as const}
      const logged=await db.from("LoggedFoodItem").select(historyColumns)
        .eq("messageId",messageId).eq("userId",userId).eq("status","Processed")
        .is("deletedAt",null).order("id").limit(31).abortSignal(signal)
      if (logged.error) throw new Error("history_unavailable")
      if (!logged.data||logged.data.length!==source.itemsToProcess||logged.data.length>30)
        return {status:"unavailable" as const}
      const rows=logged.data as unknown as (Omit<HistoricalFood,"name"|"brand"|"groupId">&{
        extendedOpenAiData:Record<string,unknown>|null;FoodItem:{id:number;name:string;brand:string|null}|null})[]
      if (rows.some(row=>!row.FoodItem||!Number.isFinite(row.grams)||row.grams<=0||
        !Number.isFinite(row.kcal)||row.kcal<0)) return {status:"unavailable" as const}
      const foodsForEvent=rows.map(row=>({id:row.id,updatedAt:row.updatedAt,
        foodItemId:row.foodItemId,name:row.FoodItem!.name,brand:row.FoodItem!.brand,
        grams:row.grams,kcal:row.kcal,
        nutrition:Object.fromEntries(HISTORY_NUTRIENTS.map(key=>[key,(row as any)[key]])) as HistoryNutrition,
        servingId:row.servingId,servingAmount:row.servingAmount,loggedUnit:row.loggedUnit,
        groupId:typeof row.extendedOpenAiData?.groupId==="string"?row.extendedOpenAiData.groupId:null}))
      for (const row of foodsForEvent) discovered.add(row.foodItemId)
      let groups:unknown[]=[]
      if (source.publishedRevision>0) {
        const revision=await db.from("MealRevision" as any).select("snapshot")
          .eq("messageId",messageId).eq("revision",source.publishedRevision).maybeSingle()
        if (revision.error) throw new Error("history_revision_unavailable")
        groups=Array.isArray((revision.data as any)?.snapshot?.groups)?(revision.data as any).snapshot.groups:[]
      }
      const event:MealEvent={messageId,revision:source.publishedRevision,originalText:source.content,
        ...when(source.consumedOn),hasimages:source.hasimages,foods:foodsForEvent,groups}
      events.set(messageId,event)
      return {status:"ok" as const,event}
    }
  }
}
