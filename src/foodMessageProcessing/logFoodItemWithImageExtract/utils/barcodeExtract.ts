import Quagga from '@ericblade/quagga2';
import axios from 'axios';

// Function to decode the barcode from an ArrayBuffer input
async function decodeBarcodeFromBuffer(imageBuffer: Buffer): Promise<string | null> {
    const base64Image = imageBuffer.toString('base64');
    const dataURL = `data:image/jpeg;base64,${base64Image}`;

    return new Promise((resolve, reject) => {
        Quagga.decodeSingle({
            src: dataURL,
            numOfWorkers: 0,
            inputStream: { size: 1024 },
            decoder: {
                readers: ['code_128_reader', 'ean_reader', 'ean_8_reader', 'code_39_reader',
                          'codabar_reader', 'upc_reader', 'upc_e_reader', 'i2of5_reader', 
                          '2of5_reader', 'code_93_reader', 'code_32_reader'],
            },
            locate: true
        }, function(result) {
            if (result && result.codeResult) {
                resolve(result.codeResult.code);
            } else {
                resolve(null);
            }
        });
    });
}

// Function to fetch image from a URL and decode the barcode
export async function fetchAndDecodeBarcode(url: string): Promise<string | null> {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(response.data, 'binary');
        return await decodeBarcodeFromBuffer(imageBuffer);
    } catch (err) {
        console.error('Error fetching image:', err);
        return null;
    }
}

async function testFetchAndDecodeBarcode() {
    const url = 'https://supabase.amino.fit/storage/v1/object/sign/userUploadedImages/6b005b82-88a5-457b-a1aa-60ecb1e90e21/20240530134559936_qo5zlr0e.jpg?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1cmwiOiJ1c2VyVXBsb2FkZWRJbWFnZXMvNmIwMDViODItODhhNS00NTdiLWExYWEtNjBlY2IxZTkwZTIxLzIwMjQwNTMwMTM0NTU5OTM2X3FvNXpscjBlLmpwZyIsImlhdCI6MTcxNzA3NzExOSwiZXhwIjoxNzE3MDgwNzE5fQ.OR3pzhSl_z_QQTLX1ODa0yloB3wWlNkzUnF_B-kfA5g';
    const result = await fetchAndDecodeBarcode(url);
    console.log(result);
}

// testFetchAndDecodeBarcode()