import axios from "axios";
import sharp from "sharp";

export async function fetchRotateAndConvertToBase64(url: string, rotateDegrees: number = -90): Promise<string | null> {
    try {
      // Fetch the image
      const response = await axios.get(url, { responseType: 'arraybuffer' });
      const imageBuffer = Buffer.from(response.data, 'binary');
  
      // Rotate and convert to base64
      const rotatedImageBuffer = await sharp(imageBuffer)
        .rotate(rotateDegrees)
        .toBuffer();
  
      return rotatedImageBuffer.toString('base64');
    } catch (error) {
      console.error('Error processing image:', error);
      return null;
    }
  }