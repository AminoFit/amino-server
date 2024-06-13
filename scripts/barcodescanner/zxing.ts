// scripts/barcodescanner/zxing.ts

import { MultiFormatReader, BarcodeFormat, DecodeHintType, RGBLuminanceSource, BinaryBitmap, HybridBinarizer, NotFoundException } from '@zxing/library';
import fs from 'fs';
import sharp from 'sharp';
import path from 'path';

async function readImageToRawPixelData(imageBuffer: Buffer): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
    const { data, info } = await sharp(imageBuffer)
        // .resize({ width: 1024, height: 1024, fit: sharp.fit.inside })
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

    return {
        width: info.width,
        height: info.height,
        data: new Uint8ClampedArray(data.buffer),
    };
}

async function detectBarcodeFromBuffer(imageBuffer: Buffer): Promise<string | null> {
    try {
        const { width, height, data } = await readImageToRawPixelData(imageBuffer);
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
            BarcodeFormat.EAN_13,
            BarcodeFormat.EAN_8,
            BarcodeFormat.UPC_A,
            BarcodeFormat.UPC_E,
        ]);

        const reader = new MultiFormatReader();
        reader.setHints(hints);
        
        const luminanceSource = new RGBLuminanceSource(data, width, height);
        const binaryBitmap = new BinaryBitmap(new HybridBinarizer(luminanceSource));
        const result = reader.decode(binaryBitmap, hints);

        return result.getText();
    } catch (error) {
        if (error instanceof NotFoundException) {
            // console.warn(`No barcode detected: ${error.message}`);
        } else {
            console.error(`Error detecting barcode: ${error}`);
        }
        return null;
    }
}

async function splitImage(imageBuffer: Buffer, rows: number, cols: number): Promise<Buffer[]> {
    const { width, height } = await sharp(imageBuffer).metadata();
    if (!width || !height) {
        throw new Error('Invalid image dimensions');
    }

    const cellWidth = Math.floor(width / cols);
    const cellHeight = Math.floor(height / rows);
    const subImages: Buffer[] = [];

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const left = col * cellWidth;
            const top = row * cellHeight;

            const subImageBuffer = await sharp(imageBuffer)
                .extract({ left, top, width: cellWidth, height: cellHeight })
                .toBuffer();

            subImages.push(subImageBuffer);
        }
    }

    return subImages;
}

async function detectBarcodesInFolder(folderPath: string): Promise<void> {
    try {
        const files = await fs.promises.readdir(folderPath);
        const imageFiles = files.filter(file => /\.(jpe?g|png|gif|bmp)$/i.test(file));

        for (const imageFile of imageFiles) {
            const imagePath = path.join(folderPath, imageFile);
            const imageBuffer = await fs.promises.readFile(imagePath);

            const processImageBuffer = async (buffer: Buffer) => {
                const subImages = await splitImage(buffer, 3, 3);

                for (const subImageBuffer of subImages) {
                    const barcode = await detectBarcodeFromBuffer(subImageBuffer);
                    if (barcode) {
                        console.log(`Barcode detected in ${imageFile}: ${barcode}`);
                    }
                }
            };

            // Process the whole image
            await processImageBuffer(imageBuffer);

            // Rotate image by 90 degrees and process
            const rotatedImageBuffer = await sharp(imageBuffer).rotate(90).toBuffer();
            await processImageBuffer(rotatedImageBuffer);
        }
    } catch (error) {
        console.error(`Error reading folder ${folderPath}: ${error}`);
    }
}

// Example usage
detectBarcodesInFolder('/Users/seb/Documents/GitHub/amino-server/scripts/barcodescanner/test_files');
