
'use client';

/**
 * Re-exportación desde el sistema central de Firebase.
 * Se utilizan funciones de inicialización para asegurar que las instancias
 * se obtengan de forma segura y única.
 */
import { initializeFirebase } from '@/firebase';
import { GoogleAuthProvider } from 'firebase/auth';

const getFirebaseInstances = () => initializeFirebase();

export const auth = getFirebaseInstances().auth;
export const db = getFirebaseInstances().firestore;
export const googleProvider = new GoogleAuthProvider();
