import Quagga from '@ericblade/quagga2';
import axios from 'axios';

// Function to decode the barcode from an ArrayBuffer input
async function decodeBarcodeFromBuffer(imageBuffer: Buffer) {
    // Convert image buffer to base64 encoded string
    const base64Image = imageBuffer.toString('base64');
    const dataURL = `data:image/jpeg;base64,${base64Image}`;

    // Use Quagga to decode the barcode from the base64 image
    Quagga.decodeSingle({
        src: dataURL,
        numOfWorkers: 0,  // Needs to be 0 when used within node
        inputStream: {
            size: 1024  // restrict input-size to be 800px in width (long-side)
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
        } else {
            console.log('No barcode detected');
        }
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

// Example usage
const imageUrl = 'https://supabase.amino.fit/storage/v1/object/sign/userUploadedImages/6b005b82-88a5-457b-a1aa-60ecb1e90e21/20240529213236655_v35byt5c.jpg?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1cmwiOiJ1c2VyVXBsb2FkZWRJbWFnZXMvNmIwMDViODItODhhNS00NTdiLWExYWEtNjBlY2IxZTkwZTIxLzIwMjQwNTI5MjEzMjM2NjU1X3YzNWJ5dDVjLmpwZyIsImlhdCI6MTcxNzAxODM4NiwiZXhwIjoxNzE3MDIxOTg2fQ.P3H--YxB5GwYrEkeWUXVYVpIFQf4UO0e1M_SYjiamEw';
fetchAndDecodeBarcode(imageUrl);
