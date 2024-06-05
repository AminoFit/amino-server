import Quagga from '@ericblade/quagga2';
import axios from 'axios';
import Jimp from 'jimp';

// Function to decode the barcode from an image buffer
async function decodeBarcodeFromBuffer(imageBuffer: Buffer): Promise<string | null> {
  const base64Image = imageBuffer.toString('base64');
  const dataURL = `data:image/jpeg;base64,${base64Image}`;

  return new Promise((resolve) => {
    Quagga.decodeSingle(
      {
        src: dataURL,
        numOfWorkers: 0,
        inputStream: { size: 1024 },
        decoder: {
          readers: [
            'code_128_reader',
            'ean_reader',
            'ean_8_reader',
            'code_39_reader',
            'codabar_reader',
            'upc_reader',
            'upc_e_reader',
            'i2of5_reader',
            '2of5_reader',
            'code_93_reader',
            'code_32_reader',
          ],
          multiple: false,
        },
        locate: true,
        locator: {
          patchSize: 'medium', // 'x-small', 'small', 'medium', 'large', 'x-large'
          halfSample: true,
        },
      },
      function (result) {
        if (result && result.codeResult) {
          resolve(result.codeResult.code);
        } else {
          resolve(null);
        }
      }
    );
  });
}

// Function to split an image into subquadrants
async function splitImage(imageBuffer: Buffer, gridSize: number = 3): Promise<Buffer[]> {
    const jimpImage = await Jimp.read(imageBuffer);
    const width = jimpImage.bitmap.width;
    const height = jimpImage.bitmap.height;
  
    const quadrants: Buffer[] = [];
    const quadrantWidth = width / gridSize;
    const quadrantHeight = height / gridSize;
  
    // Generate subimages from grid
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const x = col * quadrantWidth;
        const y = row * quadrantHeight;
        const quadrant = await jimpImage
          .clone()
          .crop(x, y, quadrantWidth, quadrantHeight)
          .getBufferAsync(Jimp.MIME_JPEG);
        quadrants.push(quadrant);
      }
    }
  
    // Generate overlapping subimages
    for (let row = 1; row < gridSize; row++) {
      for (let col = 1; col < gridSize; col++) {
        const x = col * quadrantWidth - quadrantWidth / 2;
        const y = row * quadrantHeight - quadrantHeight / 2;
        const quadrant = await jimpImage
          .clone()
          .crop(x, y, quadrantWidth, quadrantHeight)
          .getBufferAsync(Jimp.MIME_JPEG);
        quadrants.push(quadrant);
      }
    }
  
    return quadrants;
  }

// Function to fetch image from a URL and decode the barcode
export async function fetchAndDecodeBarcode(url: string): Promise<string | null> {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(response.data, 'binary');

    // Try decoding the full image first
    let barcode = await decodeBarcodeFromBuffer(imageBuffer);
    if (barcode) {
      return barcode;
    }

    // If no barcode found, split the image and try again
    const quadrants = await splitImage(imageBuffer);
    // console.log("searching for barcode in quadrants with this many", quadrants.length)
    for (const quadrant of quadrants) {
      barcode = await decodeBarcodeFromBuffer(quadrant);
      if (barcode) {
        return barcode;
      }
    }

    return null; 
  } catch (err) {
    console.error('Error fetching image:', err);
    return null;
  }
}

async function testFetchAndDecodeBarcode() {
    // const url = 'https://supabase.amino.fit/storage/v1/object/sign/userUploadedImages/6b005b82-88a5-457b-a1aa-60ecb1e90e21/20240605142008236_yeve0ac1.jpg?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1cmwiOiJ1c2VyVXBsb2FkZWRJbWFnZXMvNmIwMDViODItODhhNS00NTdiLWExYWEtNjBlY2IxZTkwZTIxLzIwMjQwNjA1MTQyMDA4MjM2X3lldmUwYWMxLmpwZyIsImlhdCI6MTcxNzU5NzI1MSwiZXhwIjoxNzE3NjAwODUxfQ.fgkqcxzztgDJpuR4v0BN2UQ14ybuqO_Jc7ucok-fsBI'
    const url = 'https://supabase.amino.fit/storage/v1/object/sign/userUploadedImages/9bb16917-a0ba-4191-a9b7-479fec97cb40/20240605003417475_iy2yerlm.jpg?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1cmwiOiJ1c2VyVXBsb2FkZWRJbWFnZXMvOWJiMTY5MTctYTBiYS00MTkxLWE5YjctNDc5ZmVjOTdjYjQwLzIwMjQwNjA1MDAzNDE3NDc1X2l5MnllcmxtLmpwZyIsImlhdCI6MTcxNzU5NTUxNSwiZXhwIjoxNzE3NTk5MTE1fQ.keaeHuPv6Ow1asUV-GUxKU1seNA36RolSXuz7OcKvV4';
    const result = await fetchAndDecodeBarcode(url);
    console.log(result);
}

// testFetchAndDecodeBarcode()