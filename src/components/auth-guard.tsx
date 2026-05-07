
'use client';

import { useState, useEffect } from 'react';
import { signInWithPopup, signOut, GoogleAuthProvider } from 'firebase/auth';
import { useAuth, useUser } from '@/firebase';
import { isUserWhitelisted } from '@/app/lib/auth-config';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LogIn, ShieldAlert, Leaf, Loader2, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const { user, loading: authLoading } = useUser();
  const [error, setError] = useState<string | null>(null);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (user && !isUserWhitelisted(user.email)) {
      signOut(auth);
      setError('Acceso denegado: Su correo electrónico no está en la lista de permitidos.');
    }
  }, [user, auth]);

  const handleLogin = async () => {
    setIsAuthorizing(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      if (!isUserWhitelisted(result.user.email)) {
        await signOut(auth);
        setError('Acceso denegado: Su correo electrónico no está en la lista de permitidos.');
      }
    } catch (err: any) {
      console.error("Auth Error:", err);
      if (err.code === 'auth/operation-not-allowed') {
        setError('Error: El proveedor de Google no está habilitado en Firebase Console (Authentication > Sign-in method).');
      } else if (err.code === 'auth/popup-blocked') {
        setError('Error: El navegador bloqueó la ventana emergente. Por favor, permita las ventanas emergentes.');
      } else if (err.code === 'auth/unauthorized-domain') {
        const domain = typeof window !== 'undefined' ? window.location.hostname : '';
        setError(`Error: El dominio "${domain}" no está autorizado en Firebase Console.`);
      } else {
        setError(`Error al iniciar sesión: ${err.message || 'Error desconocido'}`);
      }
    } finally {
      setIsAuthorizing(false);
    }
  };

  const copyDomain = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.hostname);
      toast({
        title: "Copiado",
        description: "Dominio copiado al portapapeles. Pégalo en Authorized Domains.",
      });
    }
  };

  if (authLoading || isAuthorizing) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Leaf className="h-12 w-12 animate-bounce text-primary" />
          <p className="text-muted-foreground animate-pulse font-medium">
            {isAuthorizing ? 'Autenticando...' : 'Cargando GeoDatos Ambiental...'}
          </p>
        </div>
      </div>
    );
  }

  if (!user || (user && !isUserWhitelisted(user.email))) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full shadow-xl border-t-4 border-t-primary">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Leaf className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold font-headline">GeoDatos Ambiental</CardTitle>
            <CardDescription>
              Plataforma de gestión de datos ambientales.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="space-y-3">
                <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive border border-destructive/20">
                  <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
                  <span className="leading-tight">{error}</span>
                </div>
                {error.includes('no está autorizado') && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full text-xs" 
                    onClick={copyDomain}
                  >
                    <Copy className="mr-2 h-3 w-3" />
                    Copiar dominio actual
                  </Button>
                )}
              </div>
            )}
            <Button 
              onClick={handleLogin} 
              disabled={isAuthorizing}
              className="w-full bg-primary hover:bg-primary/90 text-white font-medium"
              size="lg"
            >
              {isAuthorizing ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <LogIn className="mr-2 h-5 w-5" />
              )}
              Ingresar con Google
            </Button>
            <p className="text-xs text-center text-muted-foreground mt-4">
              Solo personal autorizado tiene acceso.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
