
'use client';

import { useEffect, useRef } from 'react';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { SelectedPoint } from '@/app/page';

/**
 * Gestiona la presencia del usuario en tiempo real.
 * Incluye un sistema de "latido" (heartbeat) para mantener la presencia activa 
 * y evitar puntos huérfanos si el navegador se cierra inesperadamente.
 */
export function PresenceManager({ selectedPoint }: { selectedPoint: SelectedPoint | null }) {
  const db = useFirestore();
  const { user } = useUser();
  const lastPointRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const updatePresence = async () => {
      const presenceRef = doc(db, 'presence', user.uid);
      const currentPointKey = selectedPoint ? `${selectedPoint.lat}-${selectedPoint.lon}` : null;

      if (selectedPoint) {
        // Actualizamos o creamos la presencia con un timestamp del servidor
        await setDoc(presenceRef, {
          userId: user.uid,
          userEmail: user.email,
          name: selectedPoint.name || '',
          latitude: selectedPoint.lat,
          longitude: selectedPoint.lon,
          updatedAt: serverTimestamp(),
        }).catch(console.error);
      } else if (lastPointRef.current !== null) {
        // Solo borramos si antes teníamos algo seleccionado
        await deleteDoc(presenceRef).catch(console.error);
      }
      
      lastPointRef.current = currentPointKey;
    };

    updatePresence();

    // Sistema de latido (Heartbeat): Si hay un punto seleccionado, actualizamos el timestamp cada 60s
    // Esto permite que los demás usuarios sepan que seguimos activos aunque no movamos la selección.
    const heartbeatInterval = setInterval(() => {
      if (selectedPoint && user) {
        const presenceRef = doc(db, 'presence', user.uid);
        setDoc(presenceRef, {
          updatedAt: serverTimestamp(),
        }, { merge: true }).catch(console.error);
      }
    }, 60000); // 1 minuto

    return () => {
      clearInterval(heartbeatInterval);
      if (user) {
        const presenceRef = doc(db, 'presence', user.uid);
        deleteDoc(presenceRef).catch(console.error);
      }
    };
  }, [selectedPoint, user, db]);

  return null;
}
