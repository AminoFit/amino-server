import axios from 'axios';
import path from "path";
import dotenv from "dotenv";

const envPath = path.resolve(__dirname, "../../../.env.local");
dotenv.config({ path: envPath });

const USDA_API_KEY = process.env.USDA_API_KEY;

export interface UsdaSearchParams {
  query: string;
  branded?: boolean; // Indicates whether to filter by branded foods
}

export interface FoodNutrient {
  number: number;
  name: string;
  amount: number;
  unitName: string;
  derivationCode: string;
  derivationDescription: string;
}

export interface FoodItem {
  fdcId: number;
  dataType: string;
  description: string;
  foodNutrients: FoodNutrient[];
  // Additional properties can be added here as needed
}

export interface UsdaSearchResponse {
  foods: FoodItem[];
}

export async function searchFoodIds(params: UsdaSearchParams): Promise<UsdaSearchResponse> {
  const API_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';

  // Create request parameters
  const requestParams = {
    query: params.query,
    pageSize: 10, // Limit to the top 10 items
    dataType: params.branded ? 'Branded' : 'Foundation',
    api_key: USDA_API_KEY
  };

  try {
    const response = await axios.get<UsdaSearchResponse>(API_URL, { params: requestParams });
    return response.data;
  } catch (error) {
    throw new Error(`Error fetching data from USDA API: ${error}`);
  }
}


function runTests() {
    searchFoodIds({
      query: "Burrito Chipotle",
      branded: true
    })
      .then((response) => {
        console.log(response)
      })
      .catch((error) => {
        console.error(`Error: ${error}`)
      })
  
    searchFoodIds({
      query: "Apple",
      branded: false
    })
      .then((response) => {
        console.log(response)
      })
      .catch((error) => {
        console.error(`Error: ${error}`)
      })
  }

  runTests();