import Quagga from "@ericblade/quagga2"
import axios from "axios"
import sharp from "sharp"
import fs from "fs"
import path from "path"
import {
  MultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
  RGBLuminanceSource,
  BinaryBitmap,
  HybridBinarizer,
  NotFoundException
} from "@zxing/library"

// Define a mapping from BarcodeFormat enum to string names
const BarcodeFormatMapping: { [key: number]: string } = {
  [BarcodeFormat.AZTEC]: "AZTEC",
  [BarcodeFormat.CODABAR]: "CODABAR",
  [BarcodeFormat.CODE_39]: "CODE_39",
  [BarcodeFormat.CODE_93]: "CODE_93",
  [BarcodeFormat.CODE_128]: "CODE_128",
  [BarcodeFormat.DATA_MATRIX]: "DATA_MATRIX",
  [BarcodeFormat.EAN_8]: "EAN_8",
  [BarcodeFormat.EAN_13]: "EAN_13",
  [BarcodeFormat.ITF]: "ITF",
  [BarcodeFormat.MAXICODE]: "MAXICODE",
  [BarcodeFormat.PDF_417]: "PDF_417",
  [BarcodeFormat.QR_CODE]: "QR_CODE",
  [BarcodeFormat.RSS_14]: "RSS_14",
  [BarcodeFormat.RSS_EXPANDED]: "RSS_EXPANDED",
  [BarcodeFormat.UPC_A]: "UPC_A",
  [BarcodeFormat.UPC_E]: "UPC_E",
  [BarcodeFormat.UPC_EAN_EXTENSION]: "UPC_EAN_EXTENSION"
};

// Function to downsample the image
async function downsampleImage(imageBuffer: Buffer, maxDimension: number = 1024): Promise<Buffer> {
  const metadata = await sharp(imageBuffer).metadata()
  const { width, height } = metadata

  if (!width || !height) {
    throw new Error("Invalid image dimensions")
  }

  if (maxDimension === 0 || (width <= maxDimension && height <= maxDimension)) {
    // No need to downsample
    return imageBuffer
  }

  const aspectRatio = width / height
  let newWidth, newHeight

  if (width > height) {
    newWidth = Math.min(maxDimension, width)
    newHeight = Math.floor(newWidth / aspectRatio)
  } else {
    newHeight = Math.min(maxDimension, height)
    newWidth = Math.floor(newHeight * aspectRatio)
  }

  return await sharp(imageBuffer).resize(newWidth, newHeight).toBuffer()
}

// Function to decode the barcode using Quagga from an image buffer
async function decodeBarcodeWithQuagga(
  imageBuffer: Buffer,
  patchSize: string = "medium"
): Promise<{ barcode: string; type: string } | null> {
  const base64Image = imageBuffer.toString("base64")
  const dataURL = `data:image/jpeg;base64,${base64Image}`

  return new Promise((resolve) => {
    Quagga.decodeSingle(
      {
        src: dataURL,
        numOfWorkers: 0,
        inputStream: { size: 1024 },
        decoder: {
          readers: ["ean_reader", "ean_8_reader", "upc_reader", "upc_e_reader"],
          multiple: false
        },
        locate: true,
        locator: {
          patchSize: patchSize, // 'x-small', 'small', 'medium', 'large', 'x-large'
          halfSample: true
        }
      },
      function (result) {
        if (result && result.codeResult && result.codeResult.code) {
          resolve({
            barcode: result.codeResult.code!,
            type: result.codeResult.format
          })
        } else {
          resolve(null)
        }
      }
    )
  })
}

// Function to decode the barcode using ZXing from an image buffer
async function decodeBarcodeWithZXing(imageBuffer: Buffer): Promise<{ barcode: string, type: string } | null> {
  try {
    const { width, height, data } = await readImageToRawPixelData(imageBuffer)
    const hints = new Map()
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E
    ])

    hints.set(DecodeHintType.TRY_HARDER, true);

    const reader = new MultiFormatReader()
    reader.setHints(hints)

    const luminanceSource = new RGBLuminanceSource(data, width, height)
    const binaryBitmap = new BinaryBitmap(new HybridBinarizer(luminanceSource))
    const result = reader.decode(binaryBitmap, hints)

    return {
      barcode: result.getText(),
      type: BarcodeFormatMapping[result.getBarcodeFormat()]
    }
  } catch (error) {
    if (error instanceof NotFoundException) {
      // No barcode detected
    } else {
      console.error(`Error detecting barcode: ${error}`)
    }
    return null
  }
}

async function readImageToRawPixelData(
  imageBuffer: Buffer
): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const { data, info } = await sharp(imageBuffer).greyscale().raw().toBuffer({ resolveWithObject: true })

  return {
    width: info.width,
    height: info.height,
    data: new Uint8ClampedArray(data.buffer)
  }
}

// Function to split an image into subquadrants
async function splitImage(
  imageBuffer: Buffer, 
  gridSize: number = 3, 
  includeOverlaps: boolean = false
): Promise<Buffer[]> {
  const metadata = await sharp(imageBuffer).metadata();
  const imageWidth = metadata.width;
  const imageHeight = metadata.height;

  if (!imageWidth || !imageHeight) {
    throw new Error("Invalid image dimensions");
  }

  const cellWidth = Math.floor(imageWidth / gridSize);
  const cellHeight = Math.floor(imageHeight / gridSize);

  const buffers: Buffer[] = [];

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const left = col * cellWidth;
      const top = row * cellHeight;
      const width = col === gridSize - 1 ? imageWidth - left : cellWidth;
      const height = row === gridSize - 1 ? imageHeight - top : cellHeight;

      const cellBuffer = await sharp(imageBuffer).extract({ left, top, width, height }).toBuffer();
      buffers.push(cellBuffer);
    }
  }

  if (includeOverlaps) {
    const overlapBuffers: Buffer[] = [];

    for (let row = 0; row < gridSize - 1; row++) {
      for (let col = 0; col < gridSize - 1; col++) {
        const left = col * cellWidth + cellWidth / 2;
        const top = row * cellHeight + cellHeight / 2;
        const width = col === gridSize - 2 ? imageWidth - left : cellWidth;
        const height = row === gridSize - 2 ? imageHeight - top : cellHeight;

        const overlapBuffer = await sharp(imageBuffer).extract({ left, top, width, height }).toBuffer();
        overlapBuffers.push(overlapBuffer);
      }
    }

    buffers.push(...overlapBuffers);
  }

  return buffers;
}


type PatchSizeOption = "x-small" | "small" | "medium" | "large" | "x-large"
type Decoder = "quagga" | "zxing"
type DecoderOption = { decoder: Decoder, options: PatchSizeOption[] | null }

export async function fetchAndDecodeBarcode(
  url: string,
  decoderOptions: DecoderOption[] = [{ decoder: "quagga", options: ["x-small"] }, {decoder: "zxing", options: null}],
  maxDimension: number = 1024,
  includeRotation: boolean = true
): Promise<{ barcode: string; quadrant: string; type: string }[]> {
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] Start fetching and decoding barcode for URL: ${url}`);

  try {
    let imageBuffer: Buffer;

    // Check if the URL is a remote URL or a local file path
    const fetchStartTime = Date.now();
    if (url.startsWith("http://") || url.startsWith("https://")) {
      const response = await axios.get(url, { responseType: "arraybuffer" });
      imageBuffer = Buffer.from(response.data, "binary");
    } else {
      imageBuffer = fs.readFileSync(path.resolve(url));
    }
    const fetchEndTime = Date.now();
    // console.log(
    //   `[${new Date().toISOString()}] Image fetch completed in ${(fetchEndTime - fetchStartTime) / 1000} seconds`
    // );

    // Detect image format and convert to JPEG if necessary
    const metadata = await sharp(imageBuffer).metadata();
    if (metadata.format !== "jpeg") {
      imageBuffer = await sharp(imageBuffer).jpeg().toBuffer();
      // console.log(`[${new Date().toISOString()}] Image converted to JPEG format`);
    }

    const gridSize = 3;
    let results: { barcode: string; quadrant: string; type: string }[] = [];

    // Function to decode and store results with quadrant info
    async function decodeAndStore(buffer: Buffer, quadrantName: string, decoderOption: DecoderOption) {
      const decodeStartTime = Date.now();
      let result: { barcode: string, type: string } | null = null;

      if (decoderOption.decoder === "quagga") {
        const patchSizePromises = decoderOption.options!.map(patchSize =>
          decodeBarcodeWithQuagga(buffer, patchSize)
        );
        const patchSizeResults = await Promise.all(patchSizePromises);
        result = patchSizeResults.find(res => res && res.type === "ean_13") || patchSizeResults.find(res => res) || null;
      } else if (decoderOption.decoder === "zxing") {
        result = await decodeBarcodeWithZXing(buffer);
      }

      const decodeEndTime = Date.now();
      // console.log(
      //   `[${new Date().toISOString()}] ${quadrantName} decode completed in ${(decodeEndTime - decodeStartTime) / 1000} seconds using ${decoderOption.decoder}`
      // );
      if (result) {
        results.push({
          barcode: result.barcode,
          quadrant: quadrantName,
          type: result.type
        });
      }
    }

    // Split image into quadrants
    const splitStartTime = Date.now();
    const quadrants = await splitImage(imageBuffer, gridSize);
    const splitEndTime = Date.now();
    // console.log(
    //   `[${new Date().toISOString()}] Image splitting completed in ${(splitEndTime - splitStartTime) / 1000} seconds`
    // );

    // Downsample each quadrant and the rotated quadrants in parallel
    const downsampleStartTime = Date.now();
    const downsampledQuadrants = await Promise.all(
      quadrants.map(async (quadrant) => {
        return await downsampleImage(quadrant, maxDimension);
      })
    );
    let downsampledRotatedQuadrants: Buffer[] = [];
    if (includeRotation) {
      downsampledRotatedQuadrants = await Promise.all(
        quadrants.map(async (quadrant) => {
          const rotatedQuadrant = await sharp(quadrant).rotate(90).toBuffer();
          return await downsampleImage(rotatedQuadrant, maxDimension);
        })
      );
    }
    const downsampleEndTime = Date.now();
    // console.log(
    //   `[${new Date().toISOString()}] Downsampling of quadrants and rotated quadrants completed in ${
    //     (downsampleEndTime - downsampleStartTime) / 1000
    //   } seconds`
    // );

    // Downsample the whole image and the rotated whole image
    const downsampledImageBuffer = await downsampleImage(imageBuffer, maxDimension);
    let downsampledRotatedImageBuffer: Buffer | null = null;
    if (includeRotation) {
      downsampledRotatedImageBuffer = await downsampleImage(await sharp(imageBuffer).rotate(90).toBuffer(), maxDimension);
    }

    // Prepare decoding tasks based on decoder options
    let decodingTasks: Promise<void>[] = [];

    for (const decoderOption of decoderOptions) {
      // Decode the whole image
      decodingTasks.push(decodeAndStore(downsampledImageBuffer, "Whole Image", decoderOption));

      // Decode the whole rotated image
      if (includeRotation && downsampledRotatedImageBuffer) {
        decodingTasks.push(decodeAndStore(downsampledRotatedImageBuffer, "Whole Rotated Image", decoderOption));
      }

      // Decode the quadrants
      downsampledQuadrants.forEach((quadrant, index) => {
        decodingTasks.push(
          decodeAndStore(
            quadrant,
            `Quadrant ${Math.floor(index / gridSize) + 1}-${(index % gridSize) + 1}`,
            decoderOption
          )
        );
      });

      // Decode the rotated quadrants
      if (includeRotation) {
        downsampledRotatedQuadrants.forEach((quadrant, index) => {
          decodingTasks.push(
            decodeAndStore(
              quadrant,
              `Rotated Quadrant ${Math.floor(index / gridSize) + 1}-${(index % gridSize) + 1}`,
              decoderOption
            )
          );
        });
      }
    }

    // Run all decoding tasks in parallel
    const decodeStartTime = Date.now();
    await Promise.all(decodingTasks);
    const decodeEndTime = Date.now();
    console.log(
      `[${new Date().toISOString()}] Decoding tasks completed in ${(decodeEndTime - decodeStartTime) / 1000} seconds`
    );

    // Filter for more specific results (remove duplicates, keep more specific quadrant)
    const uniqueResults = results.reduce((acc, curr) => {
      const existingBarcodeIndex = acc.findIndex((item) => 
        item.barcode.replace(/^0+/, '') === curr.barcode.replace(/^0+/, '')
      );

      if (existingBarcodeIndex !== -1) {
        // Duplicate found - prefer to keep the barcode with leading zero
        const existingBarcode = acc[existingBarcodeIndex].barcode;
        if (existingBarcode.length < curr.barcode.length) {
          // Replace with the one that has the leading zero
          acc[existingBarcodeIndex] = curr;
        }
      } else {
        // Not a duplicate, add to the results
        acc.push(curr);
      }

      return acc;
    }, [] as { barcode: string; quadrant: string; type: string }[]);

    const endTime = Date.now();
    console.log(`[${new Date().toISOString()}] Total processing time: ${(endTime - startTime) / 1000} seconds`);
    return uniqueResults;
  } catch (err) {
    console.error("Error fetching image:", err);
    return [];
  }
}



async function testFetchAndDecodeBarcode() {
  const url = "https://i.ibb.co/bK6sqwn/IMG-3067.jpg"
  const result = await fetchAndDecodeBarcode(url, [{ decoder: "quagga", options: ["x-small", "small", "medium"] }, { decoder: "zxing", options: null }])
  console.log(result)
}

async function testFetchAndDecodeBarcodeFolder() {
  const directoryPath = "scripts/barcodescanner/test_files" // Update to your directory path
  const allowedExtensions = [".jpeg", ".jpg", ".png"] // Add more extensions if needed
  const files = fs.readdirSync(directoryPath)

  for (const file of files) {
    const fileExtension = path.extname(file).toLowerCase()
    if (!allowedExtensions.includes(fileExtension)) {
      console.log(`Skipping non-image file: ${file}`)
      continue
    }

    const filePath = path.join(directoryPath, file)
    const result = await fetchAndDecodeBarcode(filePath)
    console.log(`Results for ${file}:`, result)
  }
}

// testFetchAndDecodeBarcodeFolder()
