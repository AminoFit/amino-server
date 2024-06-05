import Quagga from "@ericblade/quagga2"
import axios from "axios"
import Jimp from "jimp"
import sharp from "sharp"

// Function to decode the barcode from an image buffer
async function decodeBarcodeFromBuffer(imageBuffer: Buffer): Promise<{ barcode: string, type: string } | null> {
    const base64Image = imageBuffer.toString("base64")
  const dataURL = `data:image/jpeg;base64,${base64Image}`

  return new Promise((resolve) => {
    Quagga.decodeSingle(
      {
        src: dataURL,
        numOfWorkers: 0,
        inputStream: { size: 1024 },
        decoder: {
            readers: [
                "ean_reader",
                "ean_8_reader",
                "upc_reader",
                "upc_e_reader"
              ],              
          multiple: false
        },
        locate: true,
        locator: {
          patchSize: "medium", // 'x-small', 'small', 'medium', 'large', 'x-large'
          halfSample: true
        }
      },
      function (result) {
        if (result && result.codeResult && result.codeResult.code) {
          resolve({ 
            barcode: result.codeResult.code!, 
            type: result.codeResult.format 
          });
        } else {
          resolve(null);
        }
      }
    )
  })
}

// Function to split an image into subquadrants
async function splitImage(imageBuffer: Buffer, gridSize: number = 3): Promise<Buffer[]> {
  const jimpImage = await Jimp.read(imageBuffer)
  const width = jimpImage.bitmap.width
  const height = jimpImage.bitmap.height

  const quadrants: Buffer[] = []
  const quadrantWidth = width / gridSize
  const quadrantHeight = height / gridSize

  // Generate subimages from grid
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const x = col * quadrantWidth
      const y = row * quadrantHeight
      const quadrant = await jimpImage.clone().crop(x, y, quadrantWidth, quadrantHeight).getBufferAsync(Jimp.MIME_JPEG)
      quadrants.push(quadrant)
    }
  }

  // Generate overlapping subimages
  for (let row = 1; row < gridSize; row++) {
    for (let col = 1; col < gridSize; col++) {
      const x = col * quadrantWidth - quadrantWidth / 2
      const y = row * quadrantHeight - quadrantHeight / 2
      const quadrant = await jimpImage.clone().crop(x, y, quadrantWidth, quadrantHeight).getBufferAsync(Jimp.MIME_JPEG)
      quadrants.push(quadrant)
    }
  }

  return quadrants
}

// Function to fetch image from a URL and decode the barcode
export async function fetchAndDecodeBarcode(
    url: string
  ): Promise<{ barcode: string; quadrant: string; type: string }[]> {
    try {
      const response = await axios.get(url, { responseType: "arraybuffer" });
      const imageBuffer = Buffer.from(response.data, "binary");
      const gridSize = 4;
  
      const results: { barcode: string; quadrant: string; type: string }[] = [];
  
      // Function to decode and store results with quadrant info
      async function decodeAndStore(buffer: Buffer, quadrantName: string) {
        const result = await decodeBarcodeFromBuffer(buffer);
        if (result) {
          results.push({
            barcode: result.barcode,
            quadrant: quadrantName,
            type: result.type
          });
        }
      }
  
      // Prepare all decoding tasks
      const decodingTasks: Promise<void>[] = [
        // Note: We're using Promise<void> here because decodeAndStore doesn't return a value
        decodeAndStore(imageBuffer, "Full Image") // Original image
      ];
  
      // Add tasks for original quadrants
      const quadrants = await splitImage(imageBuffer, gridSize);
      quadrants.forEach((quadrant, index) => {
        decodingTasks.push(
          decodeAndStore(
            quadrant,
            `Quadrant ${Math.floor(index / gridSize) + 1}-${
              (index % gridSize) + 1
            }`
          )
        );
      });
  
      // Rotate image
      const rotatedImageBuffer = await sharp(imageBuffer).rotate(90).toBuffer();
  
      // Add tasks for rotated image and its quadrants
      decodingTasks.push(decodeAndStore(rotatedImageBuffer, "Rotated Full Image"));
      const rotatedQuadrants = await splitImage(rotatedImageBuffer, gridSize);
      rotatedQuadrants.forEach((quadrant, index) => {
        decodingTasks.push(
          decodeAndStore(
            quadrant,
            `Rotated Quadrant ${Math.floor(index / gridSize) + 1}-${
              (index % gridSize) + 1
            }`
          )
        );
      });
  
      // Run all decoding tasks in parallel
      await Promise.all(decodingTasks);
  
      // 5. Filter for more specific results (remove duplicates, keep more specific quadrant)
      const uniqueResults = results.reduce(
        (acc, curr) => {
          const existingBarcodeIndex = acc.findIndex(
            (item) => item.barcode === curr.barcode
          );
  
          if (existingBarcodeIndex !== -1) {
            // Duplicate found - check which quadrant is more specific
            const existingQuadrant = acc[existingBarcodeIndex].quadrant;
            if (
              curr.quadrant.includes("Quadrant") &&
              !existingQuadrant.includes("Quadrant")
            ) {
              // Current quadrant is more specific, replace the existing one
              acc[existingBarcodeIndex] = curr;
            }
            // If the existing one is more specific or equally specific, do nothing
          } else {
            // Not a duplicate, add to the results
            acc.push(curr);
          }
  
          return acc;
        },
        [] as { barcode: string; quadrant: string; type: string }[]
      ); // Make sure the type here includes 'type'
  
      return uniqueResults;
    } catch (err) {
      console.error("Error fetching image:", err);
      return [];
    }
  }

async function testFetchAndDecodeBarcode() {
const url = 'https://supabase.amino.fit/storage/v1/object/sign/userUploadedImages/6b005b82-88a5-457b-a1aa-60ecb1e90e21/20240605144241574_h9qsaw99.jpg?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1cmwiOiJ1c2VyVXBsb2FkZWRJbWFnZXMvNmIwMDViODItODhhNS00NTdiLWExYWEtNjBlY2IxZTkwZTIxLzIwMjQwNjA1MTQ0MjQxNTc0X2g5cXNhdzk5LmpwZyIsImlhdCI6MTcxNzYwMjI0NiwiZXhwIjoxNzE3NjA1ODQ2fQ.QbkFiMLKvEyd0nJ2UL6ky4NknDvfynLlYsWh5ae_pBU'
  // const url = 'https://supabase.amino.fit/storage/v1/object/sign/userUploadedImages/9bb16917-a0ba-4191-a9b7-479fec97cb40/20240605003417475_iy2yerlm.jpg?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1cmwiOiJ1c2VyVXBsb2FkZWRJbWFnZXMvOWJiMTY5MTctYTBiYS00MTkxLWE5YjctNDc5ZmVjOTdjYjQwLzIwMjQwNjA1MDAzNDE3NDc1X2l5MnllcmxtLmpwZyIsImlhdCI6MTcxNzU5NTUxNSwiZXhwIjoxNzE3NTk5MTE1fQ.keaeHuPv6Ow1asUV-GUxKU1seNA36RolSXuz7OcKvV4';
  // const url = "https://supabase.amino.fit/storage/v1/object/sign/userUploadedImages/6b005b82-88a5-457b-a1aa-60ecb1e90e21/20240605144241574_h9qsaw99.jpg?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1cmwiOiJ1c2VyVXBsb2FkZWRJbWFnZXMvNmIwMDViODItODhhNS00NTdiLWExYWEtNjBlY2IxZTkwZTIxLzIwMjQwNjA1MTQ0MjQxNTc0X2g5cXNhdzk5LmpwZyIsImlhdCI6MTcxNzU5ODU5MCwiZXhwIjoxNzE3NjAyMTkwfQ.YX35UOD0nBAKyR45aOYDSjqnzl-Ftd5_k2fNzlPHzsw"
  const result = await fetchAndDecodeBarcode(url)
  console.log(result)
}

// testFetchAndDecodeBarcode()
