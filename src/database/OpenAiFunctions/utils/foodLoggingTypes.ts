export type FoodItemIdAndEmbedding = {
  id?: number;
  name: string;
  brand: string;
  cosine_similarity: number;
  embedding?: string | null;
  foodInfoSource?: string;
  externalId?: string;
};