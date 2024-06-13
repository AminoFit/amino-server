import Quagga from '@ericblade/quagga2';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

// Function to decode the barcode from an ArrayBuffer input
async function decodeBarcodeFromBuffer(imageBuffer: Buffer) {
    // Convert image buffer to base64 encoded string
    const base64Image = imageBuffer.toString('base64');
    const dataURL = `data:image/jpeg;base64,${base64Image}`;

    // Use Quagga to decode the barcode from the base64 image
    return new Promise((resolve, reject) => {
        Quagga.decodeSingle({
            src: dataURL,
            numOfWorkers: 0,  // Needs to be 0 when used within node
            inputStream: {
                size: 1024  // restrict input-size to be 1024px in width (long-side)
            },
            decoder: {
                readers: ['code_128_reader', 'ean_reader', 'ean_8_reader', 'code_39_reader',
                          'codabar_reader', 'upc_reader', 'upc_e_reader', 'i2of5_reader', 
                          '2of5_reader', 'code_93_reader', 'code_32_reader'], // List of active readers
            },
            locate: true  // try to locate the barcode in the image
        }, function(result) {
            if (result && result.codeResult) {
                console.log('Barcode detected:', result.codeResult.code);
                console.log('Barcode format:', result.codeResult.format);
                resolve(result.codeResult);
            } else {
                console.log('No barcode detected');
                resolve(null);
            }
        });
    });
}

// Function to fetch image from a URL and decode the barcode
async function fetchAndDecodeBarcode(url: string) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(response.data, 'binary');
        await decodeBarcodeFromBuffer(imageBuffer);
    } catch (err) {
        console.error('Error fetching image:', err);
    }
}

// Function to decode the barcode from a local file
async function decodeBarcodeFromFile(filePath: string) {
    try {
        const imageBuffer = fs.readFileSync(filePath);
        await decodeBarcodeFromBuffer(imageBuffer);
    } catch (err) {
        console.error('Error reading file:', err);
    }
}

// Function to process all image files in a directory
async function decodeBarcodesFromDirectory(dirPath: string) {
    fs.readdir(dirPath, async (err, files) => {
        if (err) {
            console.error('Error reading directory:', err);
            return;
        }

        for (const file of files) {
            const filePath = path.join(dirPath, file);
            const fileExt = path.extname(file).toLowerCase();
            if (fileExt === '.jpg' || fileExt === '.jpeg' || fileExt === '.png') {
                console.log(`Processing file: ${filePath}`);
                await decodeBarcodeFromFile(filePath);
            }
        }
    });
}

// Main function to handle different input types
async function main(inputPath: string) {
    if (inputPath.startsWith('http://') || inputPath.startsWith('https://')) {
        // URL input
        await fetchAndDecodeBarcode(inputPath);
    } else {
        // Local file or directory
        const stats = fs.statSync(inputPath);
        if (stats.isFile()) {
            await decodeBarcodeFromFile(inputPath);
        } else if (stats.isDirectory()) {
            await decodeBarcodesFromDirectory(inputPath);
        } else {
            console.error('Invalid input path. Please provide a valid file, directory, or URL.');
        }
    }
}

// Example usage
const inputPath = '/Users/seb/Documents/GitHub/amino-server/scripts/barcodescanner/test_files';
main(inputPath);
