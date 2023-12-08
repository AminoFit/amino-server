import pandas as pd
import json

# Load CSV files
food_nutrient = pd.read_csv("/Users/seb/Documents/USDA_Data/legacy/food_nutrient.csv", low_memory=False)
food_portion = pd.read_csv("/Users/seb/Documents/USDA_Data/legacy/food_portion.csv")
food_shortened = pd.read_csv("/Users/seb/Documents/USDA_Data/legacy/food_shortened.csv")

# Parse the 'old_fdc_ids' column in 'food_shortened'
food_shortened['old_fdc_ids'] = food_shortened['old_fdc_ids'].apply(json.loads)

# Mapping nutrient IDs to their names and required units
nutrient_mapping = {
   2047: ("Energy (Atwater General Factors)", "KCAL"),
    2048: ("Energy (Atwater Specific Factors)", "KCAL"),
    1001: ("Solids", "G"),
    1002: ("Nitrogen", "G"),
    1003: ("Protein", "G"),
    1004: ("Total lipid (fat)", "G"),
    1005: ("Carbohydrate, by difference", "G"),
    1008: ("Energy", "KCAL"),
    1062: ("Energy (kJ)", "kJ"),
    1018: ("Alcohol, ethyl", "G"),
    1063: ("Sugars, Total", "G"),
    1050: ("Carbohydrate, by summation", "G"),
    1057: ("Caffeine", "MG"),
    1079: ("Fiber, total dietary", "G"),
    1080: ("Lignin", "G"),
    1081: ("Ribose", "G"),
    1082: ("Fiber, soluble", "G"),
    1083: ("Theophylline", "MG"),
    1084: ("Fiber, insoluble", "G"),
    1085: ("Total fat (NLEA)", "G"),
    1086: ("Total sugar alcohols", "G"),
    1087: ("Calcium, Ca", "MG"),
    1257: ("Fatty acids, total trans", "G"),
    1258: ("Fatty acids, total saturated", "G"),
    1233: ("Glutamine", "G"),
    1234: ("Taurine", "G"),
    1235: ("Sugars, added", "G"),
    1236: ("Sugars, intrinsic", "G"),
    1237: ("Calcium, added", "MG"),
    1238: ("Iron, added", "MG"),
    1239: ("Calcium, intrinsic", "MG"),
    1240: ("Iron, intrinsic", "MG"),
    1241: ("Vitamin C, added", "MG"),
    1242: ("Vitamin E, added", "MG"),
    1243: ("Thiamin, added", "MG"),
    1244: ("Riboflavin, added", "MG"),
    1245: ("Niacin, added", "MG"),
    1246: ("Vitamin B-12, added", "UG"),
    1247: ("Vitamin C, intrinsic", "MG"),
    1248: ("Vitamin E, intrinsic", "MG"),
    1249: ("Thiamin, intrinsic", "MG"),
    1250: ("Riboflavin, intrinsic", "MG"),
    1251: ("Niacin, intrinsic", "MG"),
    1252: ("Vitamin B-12, intrinsic", "UG"),
    1326: ("Fatty acids, total sat., NLEA", "G"),
    1327: ("Fatty acids, total monounsat., NLEA", "G"),
    1328: ("Fatty acids, total polyunsat., NLEA", "G"),
    1329: ("Fatty acids, total trans-monoenoic", "G"),
    1330: ("Fatty acids, total trans-dienoic", "G"),
    1331: ("Fatty acids, total trans-polyenoic", "G"),
    1318: ("Fatty acids, saturated, other", "G"),
    1319: ("Fatty acids, monounsat., other", "G"),
    1320: ("Fatty acids, polyunsat., other", "G"),
    1003: ("Protein", "G"),
    1004: ("Total lipid (fat)", "G"),
    1005: ("Carbohydrate, by difference", "G"),
    1008: ("Energy", "KCAL"),
    1079: ("Fiber, total dietary", "G"),
    1018: ("Alcohol, ethyl", "G"),
    1057: ("Caffeine", "MG"),
    # Vitamins
    1104: ("Vitamin A, IU", "IU"),
    1162: ("Vitamin C, total ascorbic acid", "MG"),
    1109: ("Vitamin E (alpha-tocopherol)", "MG"),
    1110: ("Vitamin D (D2 + D3), International Units", "IU"),
    1185: ("Vitamin K (phylloquinone)", "UG"),

    # Minerals
    1087: ("Calcium, Ca", "MG"),
    1089: ("Iron, Fe", "MG"),
    1090: ("Magnesium, Mg", "MG"),
    1091: ("Phosphorus, P", "MG"),
    1092: ("Potassium, K", "MG"),
    1093: ("Sodium, Na", "MG"),
    1095: ("Zinc, Zn", "MG"),

    # Fats
    1258: ("Fatty acids, total saturated", "G"),
    1292: ("Fatty acids, total monounsaturated", "G"),
    1293: ("Fatty acids, total polyunsaturated", "G"),
    1257: ("Fatty acids, total trans", "G"),
    1253: ("Cholesterol", "MG"),

    # Carbohydrates
    1005: ("Carbohydrate, by difference", "G"),
    1079: ("Fiber, total dietary", "G"),
    1063: ("Sugars, Total", "G"),
    1009: ("Starch", "G"),

    # Proteins and Amino Acids
    1003: ("Protein", "G"),
    # Add individual amino acids if needed

    # Other Components
    1051: ("Water", "G"),
    1018: ("Alcohol, ethyl", "G"),
    1057: ("Caffeine", "MG"),
    1058: ("Theobromine", "MG")
}
# Map nutrient IDs to names
food_nutrient['nutrient_name'] = food_nutrient['nutrient_id'].map(nutrient_mapping).apply(lambda x: x[0] if pd.notnull(x) else None)
food_nutrient = food_nutrient[food_nutrient['nutrient_name'].notnull()]

# Pivot the table to get nutrients as columns
nutrients_pivot = food_nutrient.pivot_table(index='fdc_id', columns='nutrient_name', values='amount', aggfunc='sum')

# Join nutrient data with food_shortened
food_combined = food_shortened.join(nutrients_pivot, on='fdc_id')

# Process and join portion data
food_portion['portion_data'] = food_portion.apply(lambda row: json.dumps({'seq_num': row['seq_num'], 'amount': row['amount'], 'measure_unit_id': row['measure_unit_id'], 'portion_description': row['portion_description'], 'modifier': row['modifier'], 'gram_weight': row['gram_weight']}), axis=1)
portion_json = food_portion.groupby('fdc_id')['portion_data'].apply(list).reset_index()
food_combined = food_combined.merge(portion_json, on='fdc_id', how='left')


# Save to CSV
food_combined.to_csv("/Users/seb/Documents/USDA_Data/legacy/food_joined.csv", index=False)