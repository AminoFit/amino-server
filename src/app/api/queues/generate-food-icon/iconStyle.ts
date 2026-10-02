/** The current icon style starts with the 2026-09-26 redraw (catalogue audit A7, image 13302). Earlier images are older
 * styles: the 2023 Midjourney stickers (ids 12970-13300, "turkey" is a bowl of chili), DALL-E 3 renders and a two-day
 * model test. They are never reused or lent to another food, and a food showing only old ones gets a new icon the next
 * time it is logged. */
export const FIRST_CURRENT_STYLE_IMAGE = 13302

export const isCurrentStyle = (foodImageId: number | null | undefined) =>
  foodImageId != null && foodImageId >= FIRST_CURRENT_STYLE_IMAGE
