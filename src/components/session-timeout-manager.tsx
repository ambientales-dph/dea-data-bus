'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { signOut } from 'firebase/auth';
import { useAuth, useUser } from '@/firebase';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Timer } from 'lucide-react';

// Valores de producción: 10 minutos total, advertencia a los 9 minutos
const INACTIVITY_TIMEOUT = 10 * 60 * 1000; 
const WARNING_TIMEOUT = 9 * 60 * 1000; 
const COUNTDOWN_TOTAL = 60;

interface CircularProgressProps {
  remaining: number;
  total: number;
  size?: number;
  strokeWidth?: number;
}

function CircularCountdown({ remaining, total, size = 100, strokeWidth = 8 }: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const progress = (remaining / total) * 100;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center mx-auto my-6" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          className="text-muted/10"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          className="text-primary transition-all duration-1000 ease-linear"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
      </svg>
      <span className="absolute text-2xl font-bold text-primary font-code">
        {remaining}
      </span>
    </div>
  );
}

export function SessionTimeoutManager() {
  const auth = useAuth();
  const { user } = useUser();
  const [showWarning, setShowWarning] = useState(false);
  const [remainingTime, setRemainingTime] = useState(COUNTDOWN_TOTAL);
  const lastActivityRef = useRef<number>(Date.now());
  const wakeLockRef = useRef<any>(null);

  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      } catch (err) {
        // Silencioso
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
      setRemainingTime(COUNTDOWN_TOTAL);
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
        requestWakeLock();
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
      <AlertDialogContent className="border-t-4 border-t-primary max-w-[280px] p-8">
        <AlertDialogHeader className="text-center items-center space-y-4">
          <AlertDialogTitle className="flex items-center gap-2 text-lg font-bold text-primary">
            <Timer className="h-5 w-5 animate-pulse" />
            Sesión a punto de expirar
          </AlertDialogTitle>
          
          <CircularCountdown remaining={remainingTime} total={COUNTDOWN_TOTAL} />
        </AlertDialogHeader>
      </AlertDialogContent>
    </AlertDialog>
  );
}
