'use client';

import { useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { useToast } from '@/hooks/use-toast';
import { ShieldAlert } from 'lucide-react';

export function FirebaseErrorListener() {
  const { toast } = useToast();

  useEffect(() => {
    const handlePermissionError = (error: any) => {
      // En desarrollo, lanzamos el error para que Next.js muestre el overlay detallado
      if (process.env.NODE_ENV === 'development') {
        throw error;
      }

      // En producción o como fallback, mostramos un toast más descriptivo
      toast({
        variant: "destructive",
        title: "Error de permisos",
        description: "No tenés autorización para realizar esta operación. Verificá las reglas de seguridad.",
      });
    };

    errorEmitter.on('permission-error', handlePermissionError);
    return () => errorEmitter.off('permission-error', handlePermissionError);
  }, [toast]);

  return null;
}
