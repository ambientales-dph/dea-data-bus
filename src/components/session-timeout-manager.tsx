'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { signOut } from 'firebase/auth';
import { useAuth, useUser } from '@/firebase';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Timer } from 'lucide-react';

// Valores temporales para pruebas: 1 minuto total, advertencia a los 30 segundos
const INACTIVITY_TIMEOUT = 60 * 1000; 
const WARNING_TIMEOUT = 30 * 1000; 

export function SessionTimeoutManager() {
  const auth = useAuth();
  const { user } = useUser();
  const [showWarning, setShowWarning] = useState(false);
  const [remainingTime, setRemainingTime] = useState(30);
  const lastActivityRef = useRef<number>(Date.now());
  const wakeLockRef = useRef<any>(null);

  // Función para intentar despertar/mantener la pantalla encendida
  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      } catch (err) {
        // Silencioso: Los navegadores pueden bloquear esto si no hay interacción previa
      }
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current != null) {
      wakeLockRef.current.release().then(() => {
        wakeLockRef.current = null;
      });
    }
  };

  const handleSignOut = useCallback(() => {
    releaseWakeLock();
    setShowWarning(false);
    signOut(auth);
  }, [auth]);

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (showWarning) {
      releaseWakeLock();
      setShowWarning(false);
      setRemainingTime(30);
    }
  }, [showWarning]);

  useEffect(() => {
    if (!user) return;

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    
    const handleActivity = () => resetTimer();

    events.forEach(event => {
      window.addEventListener(event, handleActivity);
    });

    const interval = setInterval(() => {
      const now = Date.now();
      const diff = now - lastActivityRef.current;

      if (diff >= INACTIVITY_TIMEOUT) {
        handleSignOut();
      } else if (diff >= WARNING_TIMEOUT && !showWarning) {
        setShowWarning(true);
        requestWakeLock(); // Solicitar mantener pantalla encendida al mostrar advertencia
      }
    }, 1000);

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
      clearInterval(interval);
      releaseWakeLock();
    };
  }, [user, auth, resetTimer, showWarning, handleSignOut]);

  // Cronómetro del diálogo de advertencia
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showWarning && remainingTime > 0) {
      timer = setInterval(() => {
        setRemainingTime(prev => prev - 1);
      }, 1000);
    } else if (remainingTime === 0 && showWarning) {
      handleSignOut();
    }
    return () => clearInterval(timer);
  }, [showWarning, remainingTime, handleSignOut]);

  if (!showWarning) return null;

  return (
    <AlertDialog open={showWarning}>
      <AlertDialogContent className="border-t-4 border-t-primary">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5 text-primary animate-pulse" />
            Sesión por expirar
          </AlertDialogTitle>
          <AlertDialogDescription className="text-base">
            Tu sesión se cerrará por inactividad en <span className="font-bold text-primary text-lg">{remainingTime}</span> segundos.
            ¿Querés mantener la sesión abierta?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={resetTimer} className="bg-primary hover:bg-primary/90 w-full sm:w-auto">
            Mantener sesión abierta
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
