import sharp from 'sharp';

export const VARIANT_WIDTHS = [400, 800, 1600] as const;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface ImageVariant {
  width: number;
  buffer: Buffer;
}

export interface ProcessedImage {
  original: { buffer: Buffer; width: number; height: number };
  variants: ImageVariant[];
}

export interface UploadValidationInput {
  mimeType: string;
  sizeBytes: number;
}

export type UploadValidationResult = { ok: true } | { ok: false; reason: string };

/** Validates upload type and size before any processing (spec §11.1). */
export function validateImageUpload(input: UploadValidationInput): UploadValidationResult {
  if (input.sizeBytes > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: 'file exceeds the 10MB limit' };
  }
  if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
    return { ok: false, reason: `unsupported file type: ${input.mimeType}` };
  }
  return { ok: true };
}

/**
 * Re-encodes an uploaded image into WebP variants at 400/800/1600px wide,
 * never upscaling, and never carrying source EXIF metadata forward — sharp
 * omits metadata from its output unless `.withMetadata()` is called, which it
 * never is here (spec §11.1).
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  const metadata = await sharp(input).metadata();
  const sourceWidth = metadata.width ?? 0;
  const sourceHeight = metadata.height ?? 0;

  const variants: ImageVariant[] = [];
  for (const width of VARIANT_WIDTHS) {
    if (sourceWidth < width) {
      continue;
    }
    const buffer = await sharp(input).resize({ width }).webp().toBuffer();
    variants.push({ width, buffer });
  }

  return {
    original: { buffer: input, width: sourceWidth, height: sourceHeight },
    variants,
  };
}
