import { getBrandedFoodInfo } from "./getBrandedFoodInfo"
import { getNonBrandedFoodInfo } from "./getNonBrandedFoodInfo"
import { NxFoodItemResponse, mapFoodResponseToFoodItem, isNutritionixBrandedItem } from "./nxInterfaceHelper"
import { foodSearchResultsWithSimilarityAndEmbedding } from "@/FoodDbThirdPty/common/commonFoodInterface"

export async function getNutritionixFoodInfo(
  item: foodSearchResultsWithSimilarityAndEmbedding
): Promise<NxFoodItemResponse[] | null> {
  if (item.externalId && item.foodBrand) {
    const brandedFoodInfo = await getBrandedFoodInfo({
      nix_item_id: item.externalId
    })

    const transformedBrandedItem = mapFoodResponseToFoodItem(brandedFoodInfo)
    return transformedBrandedItem ? transformedBrandedItem : null
  } else if (item.foodSource == "NUTRITIONIX") {
    const nonBrandedFoodInfo = await getNonBrandedFoodInfo({ query: item.foodName })

    const transformedCommonItem = mapFoodResponseToFoodItem(nonBrandedFoodInfo)
    return transformedCommonItem ? transformedCommonItem : null
  }

  return null
}

//const nutritionix_result = JSON.parse(`{"foods":[{"food_name":"Fat Free Ultra-Filtered Milk","brand_name":"Fairlife","serving_qty":1,"serving_unit":"cup","serving_weight_grams":null,"nf_metric_qty":240,"nf_metric_uom":"ml","nf_calories":80,"nf_total_fat":0,"nf_saturated_fat":0,"nf_cholesterol":5,"nf_sodium":120,"nf_total_carbohydrate":6,"nf_dietary_fiber":0,"nf_sugars":6,"nf_protein":13,"nf_potassium":400,"nf_p":null,"full_nutrients":[{"attr_id":203,"value":13},{"attr_id":204,"value":0},{"attr_id":205,"value":6},{"attr_id":208,"value":80},{"attr_id":269,"value":6},{"attr_id":291,"value":0},{"attr_id":301,"value":380},{"attr_id":306,"value":400},{"attr_id":307,"value":120},{"attr_id":324,"value":200},{"attr_id":328,"value":5},{"attr_id":539,"value":0},{"attr_id":601,"value":5},{"attr_id":605,"value":0},{"attr_id":606,"value":0}],"nix_brand_name":"Fairlife","nix_brand_id":"546a0a092bc0b27b2a676b70","nix_item_name":"Fat Free Ultra-Filtered Milk","nix_item_id":"64c6442161f9690007f802d6","metadata":{},"source":8,"ndb_no":null,"tags":null,"alt_measures":null,"lat":null,"lng":null,"photo":{"thumb":"https://nutritionix-api.s3.amazonaws.com/64c6442261f9690007f802d7.jpeg","highres":null,"is_user_uploaded":false},"note":null,"class_code":null,"brick_code":null,"tag_id":null,"updated_at":"2023-07-30T11:06:09+00:00","nf_ingredient_statement":null}]}`)
//console.dir(mapFoodResponseToFoodItem(nutritionix_result), { depth: null })