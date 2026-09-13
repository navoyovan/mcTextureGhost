export interface DecodedTga {
  width: number;
  height: number;
  imageData: ImageData;
  dataUrl: string;
}

const TGA_TYPE_RGB = 2;
const TGA_TYPE_RLE_RGB = 10;

export function decodeTgaBuffer(buffer: ArrayBuffer): DecodedTga {
  const data = new Uint8Array(buffer);
  if (data.length < 18) {
    throw new Error('TGA data too small to contain header');
  }

  const idLength = data[0]!;
  const colorMapType = data[1]!;
  const imageType = data[2]!;

  const width = data[12]! | (data[13]! << 8);
  const height = data[14]! | (data[15]! << 8);
  const pixelDepth = data[16]!;
  const imageDescriptor = data[17]!;

  if (width <= 0 || height <= 0) {
    throw new Error(`Invalid TGA dimensions: ${width}x${height}`);
  }

  if (colorMapType !== 0 && colorMapType !== 1) {
    throw new Error(`Unsupported TGA colormap type: ${colorMapType}`);
  }

  if (pixelDepth !== 24 && pixelDepth !== 32) {
    throw new Error(`Unsupported TGA bit depth: ${pixelDepth}`);
  }

  if (imageType !== TGA_TYPE_RGB && imageType !== TGA_TYPE_RLE_RGB) {
    throw new Error(`Unsupported TGA image type: ${imageType}`);
  }

  const isRle = imageType === TGA_TYPE_RLE_RGB;
  const isTopDown = (imageDescriptor & 0x20) !== 0;
  const bytesPerPixel = pixelDepth / 8;

  let offset = 18 + idLength;

  if (colorMapType === 1) {
    const colormapLength = data[5]! | (data[6]! << 8);
    const colormapSize = data[7]!;
    offset += colormapLength * (colormapSize >> 3);
  }

  const totalPixels = width * height;
  const pixelBuffer = new Uint8Array(totalPixels * 4);

  let pixelIdx = 0;

  if (!isRle) {
    for (let i = 0; i < totalPixels; i++) {
      const b = data[offset++]!;
      const g = data[offset++]!;
      const r = data[offset++]!;
      const a = bytesPerPixel === 4 ? data[offset++]! : 255;

      const outOffset = i * 4;
      pixelBuffer[outOffset + 0] = r;
      pixelBuffer[outOffset + 1] = g;
      pixelBuffer[outOffset + 2] = b;
      pixelBuffer[outOffset + 3] = a;
    }
  } else {
    while (pixelIdx < totalPixels && offset < data.length) {
      const packetHeader = data[offset++]!;
      const count = (packetHeader & 0x7f) + 1;
      const isRunLength = (packetHeader & 0x80) !== 0;

      if (isRunLength) {
        const b = data[offset++]!;
        const g = data[offset++]!;
        const r = data[offset++]!;
        const a = bytesPerPixel === 4 ? data[offset++]! : 255;

        for (let i = 0; i < count && pixelIdx < totalPixels; i++) {
          const outOffset = pixelIdx * 4;
          pixelBuffer[outOffset + 0] = r;
          pixelBuffer[outOffset + 1] = g;
          pixelBuffer[outOffset + 2] = b;
          pixelBuffer[outOffset + 3] = a;
          pixelIdx++;
        }
      } else {
        for (let i = 0; i < count && pixelIdx < totalPixels; i++) {
          const b = data[offset++]!;
          const g = data[offset++]!;
          const r = data[offset++]!;
          const a = bytesPerPixel === 4 ? data[offset++]! : 255;

          const outOffset = pixelIdx * 4;
          pixelBuffer[outOffset + 0] = r;
          pixelBuffer[outOffset + 1] = g;
          pixelBuffer[outOffset + 2] = b;
          pixelBuffer[outOffset + 3] = a;
          pixelIdx++;
        }
      }
    }
  }

  const finalRgba = new Uint8ClampedArray(totalPixels * 4);
  const rowBytes = width * 4;

  for (let y = 0; y < height; y++) {
    const srcY = isTopDown ? y : (height - 1 - y);
    const srcRowStart = srcY * rowBytes;
    const dstRowStart = y * rowBytes;
    finalRgba.set(pixelBuffer.subarray(srcRowStart, srcRowStart + rowBytes), dstRowStart);
  }

  const imgData = new ImageData(finalRgba, width, height);

  let dataUrl = '';
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.putImageData(imgData, 0, 0);
      dataUrl = canvas.toDataURL('image/png');
    }
  }

  return {
    width,
    height,
    imageData: imgData,
    dataUrl,
  };
}

const tgaCache = new Map<string, Promise<string>>();

export function isTgaUrl(url?: string | null): boolean {
  if (!url) return false;
  const clean = (url.split('?')[0] ?? '').split('#')[0] ?? '';
  return clean.toLowerCase().endsWith('.tga');
}

export async function loadTgaAsDataUrl(url: string): Promise<string> {
  if (tgaCache.has(url)) {
    return tgaCache.get(url)!;
  }

  const promise = (async () => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch TGA: ${response.status} ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();
    const decoded = decodeTgaBuffer(buffer);
    return decoded.dataUrl;
  })();

  tgaCache.set(url, promise);
  return promise;
}
