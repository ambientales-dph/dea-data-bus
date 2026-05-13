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

const INACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 minutos
const WARNING_TIMEOUT = 9 * 60 * 1000; // 9 minutos (aparece 1 minuto antes)

export function SessionTimeoutManager() {
  const auth = useAuth();
  const { user } = useUser();
  const [showWarning, setShowWarning] = useState(false);
  const [remainingTime, setRemainingTime] = useState(60);
  const lastActivityRef = useRef<number>(Date.now());
  const warningTimerRef = useRef<NodeJS.Timeout | null>(null);

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (showWarning) {
      setShowWarning(false);
      setRemainingTime(60);
    }
  }, [showWarning]);

  useEffect(() => {
    if (!user) return;

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    
    const handleActivity = () => resetTimer();

    events.forEach(event => {
      window.addEventListener(event, handleActivity);
    });

    // Verificador de inactividad (robusto ante hibernación)
    const interval = setInterval(() => {
      const now = Date.now();
      const diff = now - lastActivityRef.current;

      if (diff >= INACTIVITY_TIMEOUT) {
        signOut(auth);
      } else if (diff >= WARNING_TIMEOUT && !showWarning) {
        setShowWarning(true);
      }
    }, 1000);

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
      clearInterval(interval);
    };
  }, [user, auth, resetTimer, showWarning]);

  // Cronómetro del diálogo de advertencia
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showWarning && remainingTime > 0) {
      timer = setInterval(() => {
        setRemainingTime(prev => prev - 1);
      }, 1000);
    } else if (remainingTime === 0) {
      signOut(auth);
    }
    return () => clearInterval(timer);
  }, [showWarning, remainingTime, auth]);

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
