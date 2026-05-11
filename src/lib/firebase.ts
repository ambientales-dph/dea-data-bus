
'use client';

/**
 * Re-exportación desde el sistema central de Firebase para evitar múltiples inicializaciones
 * que causan errores de aserción interna en Firestore.
 */
import { initializeFirebase } from '@/firebase';
import { GoogleAuthProvider } from 'firebase/auth';

const { auth, firestore: db } = initializeFirebase();
const googleProvider = new GoogleAuthProvider();

export { auth, db, googleProvider };
