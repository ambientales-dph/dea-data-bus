'use client';

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore, enableMultiTabIndexedDbPersistence } from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';
import { firebaseConfig } from './config';

/**
 * Inicializa Firebase de forma segura como un singleton y habilita persistencia offline.
 */
export function initializeFirebase(): {
  firebaseApp: FirebaseApp;
  firestore: Firestore;
  auth: Auth;
} {
  const firebaseApp = getApps().length > 0 
    ? getApp() 
    : initializeApp(firebaseConfig);
    
  const firestore = getFirestore(firebaseApp);
  const auth = getAuth(firebaseApp);

  // Habilitar persistencia offline solo en el cliente
  if (typeof window !== 'undefined') {
    enableMultiTabIndexedDbPersistence(firestore).catch((err) => {
      if (err.code === 'failed-precondition') {
        // Múltiples pestañas abiertas, la persistencia solo puede habilitarse en una.
        console.warn('Persistencia de Firestore: falló precondición (múltiples pestañas).');
      } else if (err.code === 'unimplemented') {
        // El navegador no soporta la persistencia.
        console.warn('Persistencia de Firestore: el navegador no soporta IndexedDB.');
      }
    });
  }

  return { firebaseApp, firestore, auth };
}

export * from './provider';
export * from './auth/use-user';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export { FirebaseClientProvider } from './client-provider';
export { errorEmitter } from './error-emitter';
export { FirestorePermissionError } from './errors';
