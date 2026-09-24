// Synthetic catalogue and history only. Labels are handwritten, never sent to providers.
// Nutrient values are illustrative benchmark data, not additions to the live catalogue.
function food(id,name,kcal,servings=[],extra={}) {
  return {id,name,brand:null,defaultServingWeightGram:100,weightUnknown:false,kcalPerServing:kcal,
    proteinPerServing:null,carbPerServing:null,totalFatPerServing:null,Nutrient:[],
    Serving:servings.map(([unit,weight,amount=1],i)=>({id:id*10+i+1,foodItemId:id,servingName:unit,servingWeightGram:weight,defaultServingAmount:amount})),...extra}
}
const rice=food(11,'White rice, cooked',130,[['cup',158]]), dryRice=food(12,'White rice, dry',365),brownRice=food(13,'Brown rice, cooked',123)
const apple=food(21,'Apple, raw',52,[['apple',182]]),appleJuice=food(22,'Apple juice',46),applePie=food(23,'Apple pie',237)
const egg=food(31,'Egg, boiled',155,[['egg',50]]),friedEgg=food(32,'Egg, fried',196,[['egg',46]])
const bread=food(41,'Whole wheat bread',250,[['slice',30]]),whiteBread=food(42,'White bread',265,[['slice',25]])
const butter=food(51,'Peanut butter, smooth',600,[['tbsp',32,2]]),crunchy=food(52,'Peanut butter, crunchy',600,[['tbsp',32,2]])
const alpha=food(61,'Whey protein powder',400,[['scoop',30]],{brand:'Alpha'}),beta=food(62,'Whey protein powder',380,[['scoop',32]],{brand:'Beta'})
const vanilla=food(71,'Vanilla whey protein powder',400,[['scoop',30]],{brand:'Alpha'}),chocolate=food(72,'Chocolate whey protein powder',400,[['scoop',30]],{brand:'Alpha'})
const greek=food(81,'Plain Greek yogurt, nonfat',59),honey=food(82,'Honey Greek yogurt',95),fullfat=food(83,'Plain Greek yogurt, full fat',97)
const oats=food(91,'Oats, dry',380,[['cup',80]]),cookedOats=food(92,'Oats, cooked',70,[['cup',234]])
const tofu=food(101,'Firm tofu',144),chicken=food(102,'Chicken breast, cooked',165)
const history=(f,days)=>({foodId:f.id,name:f.name,brand:f.brand,occurrenceDays:days,grams:f.Serving[0]?.servingWeightGram??100})
function match(id,group,text,searchName,foods,foodId,grams,kcal,extra={}) {
 return {id,group,item:{food_database_search_name:searchName,full_item_user_message_including_serving:text,branded:false,...extra.item},foods,history:extra.history??[],expected:{foodId,grams,kcal}}
}
function none(id,group,text,searchName,foods,extra={}) {return {...match(id,group,text,searchName,foods,null,null,null,extra),expected:null}}
const cases=[
 match('rice_mass','ordinary','100 g cooked white rice','cooked white rice',[dryRice,brownRice,rice],11,100,130),
 match('rice_kg','ordinary','0.5 kg cooked white rice','cooked white rice',[dryRice,rice],11,500,650),
 match('rice_cup','ordinary','one cup cooked white rice','cooked white rice',[brownRice,rice,dryRice],11,158,205.4),
 match('dry_rice','ordinary','100 g dry white rice','dry white rice',[rice,dryRice],12,100,365),
 match('exact_apple_mass','ordinary','150 g raw apple','Apple, raw',[appleJuice,apple,applePie],21,150,78),
 match('apple_count','ordinary','two apples','apple',[applePie,apple,appleJuice],21,364,189.28),
 match('boiled_eggs','ordinary','2 eggs boiled','boiled eggs',[friedEgg,egg],31,100,155),
 match('bread_slices','ordinary','2 slices whole wheat bread','Whole wheat bread',[whiteBread,bread],41,60,150),
 match('tablespoon','ordinary','one tbsp smooth peanut butter','smooth peanut butter',[crunchy,butter],51,16,96),
 match('half_cup_oats','ordinary','half a cup dry oats','dry oats',[cookedOats,oats],91,40,152),
 match('yogurt_fat','ordinary','200 g nonfat plain Greek yogurt','nonfat plain Greek yogurt',[fullfat,honey,greek],81,200,118),
 match('exact_tofu','ordinary','100 g firm tofu','Firm tofu',[chicken,tofu],101,100,144),
 match('history_powder','personal','one scoop protein powder','whey protein powder',[alpha,beta],62,32,121.6,{history:[history(beta,8),history(alpha,1)]}),
 match('explicit_brand','personal','one scoop Alpha protein powder','whey protein powder',[alpha,beta],61,30,120,{item:{branded:true,brand:'Alpha'},history:[history(beta,8)]}),
 match('explicit_flavor','personal','one scoop Alpha vanilla whey protein powder','vanilla whey protein powder',[chocolate,vanilla],71,30,120,{item:{branded:true,brand:'Alpha'},history:[history(chocolate,10)]}),
 match('unrelated_history','personal','100 g cooked white rice','cooked white rice',[dryRice,rice,beta],11,100,130,{history:[history(beta,9)]}),
 match('quantity_override','personal','two scoops protein powder','whey protein powder',[alpha,beta],62,64,243.2,{history:[history(beta,8)]}),
 match('history_preparation','personal','100 g dry white rice','dry white rice',[rice,dryRice],12,100,365,{history:[history(rice,12)]}),
 none('vague_bowl','abstention','a large bowl cooked white rice','cooked white rice',[rice,dryRice]),
 none('absent_brand','abstention','one scoop Gamma protein powder','whey protein powder',[alpha,beta],{item:{branded:true,brand:'Gamma'},history:[history(beta,8)]}),
 none('absent_food','abstention','100 g raw apple','raw apple',[applePie,appleJuice]),
 none('missing_nutrition','abstention','100 g firm tofu','firm tofu',[food(103,'Firm tofu',null)]),
 none('impossible_nutrition','abstention','100 g firm tofu','firm tofu',[food(104,'Firm tofu',1800)]),
 none('meal_reference','abstention','same smoothie as yesterday','smoothie',[alpha,beta],{history:[history(beta,8)]})
]
module.exports={cases}
