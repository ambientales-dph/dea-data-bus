
'use client';

import { useEffect, useRef } from 'react';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { SelectedPoint } from '@/app/page';

export function PresenceManager({ selectedPoint }: { selectedPoint: SelectedPoint | null }) {
  const db = useFirestore();
  const { user } = useUser();
  const lastPointRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const updatePresence = async () => {
      const presenceRef = doc(db, 'presence', user.uid);
      const currentPointKey = selectedPoint ? `${selectedPoint.lat}-${selectedPoint.lon}` : null;

      if (currentPointKey === lastPointRef.current) return;

      if (selectedPoint) {
        await setDoc(presenceRef, {
          userId: user.uid,
          userEmail: user.email,
          latitude: selectedPoint.lat,
          longitude: selectedPoint.lon,
          updatedAt: serverTimestamp(),
        }).catch(console.error);
      } else {
        await deleteDoc(presenceRef).catch(console.error);
      }
      
      lastPointRef.current = currentPointKey;
    };

    updatePresence();

    // Limpiar presencia al desmontar o cerrar sesión
    return () => {
      if (user) {
        const presenceRef = doc(db, 'presence', user.uid);
        deleteDoc(presenceRef).catch(console.error);
      }
    };
  }, [selectedPoint, user, db]);

  return null;
}
