
'use client';

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore, enableMultiTabIndexedDbPersistence, terminate } from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { firebaseConfig } from './config';

let firebaseApp: FirebaseApp;
let firestore: Firestore;
let auth: Auth;
let storage: FirebaseStorage;
let persistenceStarted = false;

/**
 * Inicializa Firebase de forma segura como un singleton y habilita persistencia offline.
 */
export function initializeFirebase(): {
  firebaseApp: FirebaseApp;
  firestore: Firestore;
  auth: Auth;
  storage: FirebaseStorage;
} {
  if (!firebaseApp) {
    firebaseApp = getApps().length > 0 
      ? getApp() 
      : initializeApp(firebaseConfig);
      
    firestore = getFirestore(firebaseApp);
    auth = getAuth(firebaseApp);
    storage = getStorage(firebaseApp);

    // Habilitar persistencia offline solo en el cliente y una sola vez
    if (typeof window !== 'undefined' && !persistenceStarted) {
      persistenceStarted = true;
      enableMultiTabIndexedDbPersistence(firestore).catch((err) => {
        if (err.code === 'failed-precondition') {
          // Probablemente múltiples pestañas abiertas, lo cual está bien con MultiTab
          console.warn('Persistencia de Firestore: falló precondición (múltiples pestañas).');
        } else if (err.code === 'unimplemented') {
          console.warn('Persistencia de Firestore: el navegador no soporta IndexedDB.');
        } else {
          console.error('Error habilitando persistencia:', err);
        }
      });
    }
  }

  return { firebaseApp, firestore, auth, storage };
}

export * from './provider';
export * from './auth/use-user';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export { FirebaseClientProvider } from './client-provider';
export { errorEmitter } from './error-emitter';
export { FirestorePermissionError } from './errors';
