import * as readline from 'readline';
import * as fs from 'fs';
import csv from 'csv-parser';

async function printRows(filename: string, numLines: number) {
    const fileStream = fs.createReadStream(filename, { encoding: 'utf8' });

    let lineCount = 0;
    const results: object[] = [];
    const options = { 
        headers: true,
        skipLinesWithError: true, // Corrected the option name (assuming you're using 'csv-parser')
    };

    return new Promise<void>((resolve, reject) => {
        fileStream
            .pipe(csv(options))
            .on('data', (data) => {
                if (lineCount < numLines) {
                    results.push(data);
                    lineCount++;
                }
            })        
            .on('end', () => {
                printTable(results);
                resolve();
            })
            .on('error', (error) => {
                reject(error);
            });
    });
}

function printTable(data: object[]) {
    const columnWidths: {[key: string]: number} = {};

    // Find the maximum length of value in each column
    data.forEach(row => {
        Object.entries(row).forEach(([key, value]) => {
            const length = String(value).length;
            if (!columnWidths[key] || length > columnWidths[key]) {
                columnWidths[key] = length;
            }
        });
    });

    // Print the table
    data.forEach((row, index) => {
        let line = '| ';
        Object.entries(row).forEach(([key, value]) => {
            line += value + ' '.repeat(columnWidths[key] - String(value).length) + ' | ';
        });
        console.log(line);

        // Print the separator line after the header row
        if (index === 0) {
            let separator = '| ';
            Object.values(columnWidths).forEach(width => {
                separator += '-'.repeat(width) + ' | ';
            });
            console.log(separator);
        }
    });
}

async function countLines(filename: string) {
    const fileStream = fs.createReadStream(filename);

    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let lineCount = 0;
    for await (const line of rl) {
        lineCount++;
    }
    return lineCount;
}
async function searchForFdcId(filename: string, targetFdcId: number) {
    const fileStream = fs.createReadStream(filename, { encoding: 'utf8' });

    let found = false;
    const options = { 
        headers: true,
        skipLinesWithError: true,  // replace with your actual option if different
    };

    return new Promise<object | null>((resolve, reject) => {
        fileStream
            .pipe(csv(options))
            .on('data', (data) => {
                const fdcId = Number(data["_0"]);
                if (fdcId === targetFdcId) {
                    found = true;
                    resolve(data);
                }
            })
            .on('end', () => {
                if (!found) {
                    resolve(null);
                }
            })
            .on('error', (error) => {
                reject(error);
            });
    });
}
// searchForFdcId('/Users/seb/Downloads/branded apr 2023/branded_food.csv', 2463678)
//     .then(result => {
//         if (result) {
//             console.log("Found the target fdc_id:", result);
//         } else {
//             console.log("Target fdc_id not found.");
//         }
//     })
//     .catch(error => {
//         console.error("An error occurred:", error);
//     });
//countLines('/Users/seb/Downloads/branded apr 2023/branded_food.csv').then(console.log);

printRows('/Users/seb/Downloads/branded apr 2023/branded_food.csv',2);
printRows('/Users/seb/Downloads/branded apr 2023/food.csv',2);