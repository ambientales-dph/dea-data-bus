
'use client';

import { useEffect } from 'react';

/**
 * Componente para registrar el Service Worker de forma explícita.
 * Esto asegura que la PWA funcione correctamente en entornos de producción.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    // En desarrollo local (especialmente con Turbopack), no se compila el service worker /sw.js
    if (process.env.NODE_ENV === 'development') {
      return;
    }

    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && (window as any).workbox === undefined) {
      const registerSW = async () => {
        try {
          // El archivo /sw.js es generado por @ducanh2912/next-pwa durante el build
          const registration = await navigator.serviceWorker.register('/sw.js');
          console.log('DEA Data Bus: Service Worker registrado con éxito. Scope:', registration.scope);
        } catch (error) {
          console.warn('DEA Data Bus: Service Worker no disponible en este entorno.');
        }
      };

      // Registrar cuando la página esté completamente cargada
      if (document.readyState === 'complete') {
        registerSW();
      } else {
        window.addEventListener('load', registerSW);
        return () => window.removeEventListener('load', registerSW);
      }
    }
  }, []);

  return null;
}
