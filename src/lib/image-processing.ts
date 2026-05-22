
'use client';

import imageCompression from 'browser-image-compression';

/**
 * Utilidad para comprimir imágenes antes de la subida.
 * Objetivo: Max 1024x1024 y ~200KB.
 */
export async function compressImage(imageFile: File): Promise<File> {
  const options = {
    maxSizeMB: 0.2, // ~200KB
    maxWidthOrHeight: 1024,
    useWebWorker: true,
  };

  try {
    const compressedFile = await imageCompression(imageFile, options);
    return compressedFile;
  } catch (error) {
    console.error('Error comprimiendo imagen:', error);
    return imageFile; // Fallback al original si falla
  }
}
