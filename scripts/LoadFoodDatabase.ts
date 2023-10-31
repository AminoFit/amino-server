#!/usr/bin/env ts-node

import * as path from "path";
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

import fs from "fs";

import { program } from "commander";
import csvParser from "csv-parser";

program
  .name("OtterDoc CLI")
  .description("OtterDoc Command Line Interface")
  .version("1.0.0")
  .argument("<path>", "path to the repository to comment");

program.parse();

const databaseUrl = process.env["DATABASE_URL"];

if (!databaseUrl) {
  console.error("No DATABASE_URL in the .env file");
  process.exit(1);
}

const pathToCSVFile = program.args[0];

let rowsViewed = 0;
let rowsSkipped = 0;
let rowsAdded = 0;

async function Go() {
  var data = [];
  console.log("LOADING THE DATABASE");

  const rowsToSave = [];
  const readStream = fs.createReadStream(pathToCSVFile, {
    highWaterMark: 256 * 1024,
  });
  readStream
    .pipe(csvParser({ separator: "\t" }))
    .on("data", async function (row) {
      rowsViewed++;
      // if (
      //   row["countries_en"] !== "United States" &&
      //   parseInt(row["code"]) < 500000
      // ) {
      //   rowsSkipped++;
      //   return;
      // }
      // rowsToSave.push({
      //   code: row["code"],
      //   product_name: row["product_name"],
      //   abbreviated_product_name: row["abbreviated_product_name"],
      //   generic_name: row["generic_name"],
      //   quantity: row["quantity"],
      //   countries_en: row["countries_en"],
      //   serving_size: row["serving_size"],
      //   serving_quantity: row["serving_quantity"],
      //   product_quantity: row["product_quantity"],
      //   image_url: row["image_url"],
      //   energy_kcal_100g: row["energy-kcal_100g"],
      //   energy_100g: row["energy_100g"],
      //   fat_100g: row["fat_100g"],
      //   saturated_fat_100g: row["saturated-fat_100g"],
      //   carbohydrates_100g: row["carbohydrates_100g"],
      //   sugars_100g: row["sugars_100g"],
      //   fiber_100g: row["fiber_100g"],
      //   proteins_100g: row["proteins_100g"],
      //   salt_100g: row["salt_100g"],
      //   sodium_100g: row["sodium_100g"],
      // });
      if (rowsViewed % 1000 === 0) {
        console.log(`rowsViewed ${rowsViewed} rows`);
      }

      //   rowsAdded += rowsToSave.length;
      //   rowsToSave.length = 0;
      //   console.log(
      //     `Rows viewed: ${rowsViewed}, rows skipped: ${rowsSkipped}, rows added: ${rowsAdded}`
      //   );
    })
    .on("end", function () {
      console.log("Data loaded");
    });
}

Go();
