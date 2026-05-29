
'use client';

/**
 * Utilidades para la gestión de geolocalización de alta precisión.
 */

export interface GeoLocation {
  latitude: number;
  longitude: number;
}

/**
 * Obtiene la ubicación actual utilizando el hardware GPS con alta precisión.
 * Forzamos enableHighAccuracy: true para garantizar el uso de sensores físicos.
 */
export async function getCurrentGPSLocation(): Promise<GeoLocation | null> {
  if (!navigator.geolocation) {
    console.error("Geolocalización no soportada por el navegador.");
    return null;
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
      },
      (error) => {
        console.error("Error obteniendo GPS:", error.message);
        resolve(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  });
}
