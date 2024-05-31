// src/FoodDbThirdPty/fatsecret/getFatSecretFoodByUPC.ts
import axios from 'axios';
import { isValidGTIN, removeGTINLeadingZerosToUpcOrGTIN13 } from 'gtin-validator';
import { getFsAccessToken } from './oauthFs';
import { getFatSecretFoodById } from './getFsInfoById';
import { FoodItemWithServings, convertFsToFoodItem } from './fsInterfaceHelper';

// Function to expand UPC-E to UPC-A
const expandUPCEtoUPCA = (upce: string): string => {
    if (upce.length === 8 && (upce[6] === '0' || upce[6] === '1' || upce[6] === '2')) {
        return `${upce.substring(0, 3)}${upce[6]}0000${upce.substring(3, 6)}${upce[7]}`;
    }
    throw new Error('Invalid UPC-E format or unsupported UPC-E for conversion');
};

// Main function to fetch food by UPC and convert it to internal format
export async function getFatSecretFoodByUPC(upc: string): Promise<FoodItemWithServings> {
    if (!isValidGTIN(upc)) {
        throw new Error('Invalid UPC provided');
    }

    const upcA = upc.length === 8 ? expandUPCEtoUPCA(upc) : removeGTINLeadingZerosToUpcOrGTIN13(upc);
    const accessToken = await getFsAccessToken();

    const url = 'https://platform.fatsecret.com/rest/server.api';
    const params = new URLSearchParams({
        method: 'food.find_id_for_barcode',
        format: 'json',
        barcode: upcA.padStart(13, '0')
    });

    const headers = {
        Authorization: `Bearer ${accessToken}`,
    };

    try {
        const response = await axios.post(url, null, { params, headers });
        const foodId = response.data.food_id.value;
        return convertFsToFoodItem(await getFatSecretFoodById(Number(foodId)), Number(upc));
    } catch (error) {
        console.error('Error fetching data from FatSecret API:', error);
        throw error;
    }
};

// Example test to get food information by UPC
const testGetFatSecretFoodByUPC = async () => {
    const upc = "811620021425"; // Test UPC code provided
    try {
        const foodItem = await getFatSecretFoodByUPC(upc);
        console.log("Food Item with Servings:", foodItem);
    } catch (error) {
        console.error("API Request Failed:", error);
    }
};

// testGetFatSecretFoodByUPC();
