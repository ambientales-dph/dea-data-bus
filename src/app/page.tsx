
'use client';

import { useState, useCallback, useEffect } from 'react';
import { AuthGuard } from '@/components/auth-guard';
import { MapView } from '@/components/map-view';
import { DataEntryForm } from '@/components/data-entry-form';
import { PresenceManager } from '@/components/presence-manager';
import { Button } from '@/components/ui/button';
import { useAuth, useUser } from '@/firebase';
import { signOut } from 'firebase/auth';
import { LogOut, Leaf } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export interface SelectedPoint {
  lat: number;
  lon: number;
  stationId?: string;
  name?: string;
  basinCode?: string;
}

export default function Home() {
  const [selectedPoint, setSelectedPoint] = useState<SelectedPoint | null>(null);
  const auth = useAuth();
  const { user } = useUser();

  // Restaurar punto seleccionado tras reinicio de sesión
  useEffect(() => {
    const saved = localStorage.getItem('dea_selected_point');
    if (saved) {
      try {
        setSelectedPoint(JSON.parse(saved));
      } catch (e) {
        console.error('Error al restaurar punto seleccionado', e);
      }
    }
  }, []);

  const handlePointSelect = useCallback((point: SelectedPoint) => {
    setSelectedPoint(point);
    localStorage.setItem('dea_selected_point', JSON.stringify(point));
  }, []);

  const handlePointUpdate = useCallback((point: SelectedPoint) => {
    setSelectedPoint(point);
    localStorage.setItem('dea_selected_point', JSON.stringify(point));
  }, []);

  const handleDeselect = useCallback(() => {
    setSelectedPoint(null);
    localStorage.removeItem('dea_selected_point');
    localStorage.removeItem('dea_form_state');
  }, []);

  const handleStationCreated = useCallback((id: string, name: string) => {
    setSelectedPoint(prev => {
      const updated = prev ? { ...prev, stationId: id, name } : null;
      if (updated) localStorage.setItem('dea_selected_point', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const handleLogout = () => {
    signOut(auth);
  };

  return (
    <AuthGuard>
      <PresenceManager selectedPoint={selectedPoint} />
      <div className="flex h-screen w-full flex-col bg-background overflow-hidden">
        {/* Header */}
        <header className="flex h-16 items-center justify-between border-b bg-white px-4 md:px-6 shadow-sm z-20 shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 md:h-10 md:w-10 items-center justify-center rounded-lg bg-primary text-white">
              <Leaf className="h-5 w-5 md:h-6 md:w-6" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold font-headline text-primary tracking-tight leading-none">DEA Data Bus</h1>
              <p className="text-[9px] md:text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Plataforma de Monitoreo</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 md:gap-3">
            <Avatar className="h-8 w-8 md:h-9 md:w-9 border-2 border-primary/10 shadow-sm">
              <AvatarImage src={user?.photoURL || ''} alt={user?.displayName || 'Usuario'} />
              <AvatarFallback className="bg-primary/5 text-primary font-bold text-xs">
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="h-6 w-[1px] bg-border hidden md:block"></div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleLogout} 
              className="h-8 w-8 md:h-9 md:w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex flex-1 flex-col md:flex-row overflow-hidden">
          <div className="w-full h-[40vh] md:h-auto md:flex-[6] p-2 md:p-4 shrink-0 md:shrink">
            <MapView 
              onPointSelect={handlePointSelect} 
              selectedPoint={selectedPoint} 
            />
          </div>

          <div className="flex-1 md:flex-[4] border-t md:border-t-0 md:border-l bg-white shadow-xl flex flex-col w-full md:min-w-[420px] overflow-hidden">
            <ScrollArea className="flex-1">
              <div className="p-4 md:p-6 pb-12">
                <DataEntryForm 
                  selectedPoint={selectedPoint} 
                  onStationCreated={handleStationCreated}
                  onPointUpdate={handlePointUpdate}
                  onDeselect={handleDeselect}
                />
              </div>
            </ScrollArea>
            <footer className="p-3 md:p-4 border-t bg-muted/10 text-center shrink-0">
              <p className="text-[9px] md:text-[10px] text-muted-foreground font-medium uppercase tracking-widest">
                © {new Date().getFullYear()} DEA Data Bus - Sistema de Gestión de Datos
              </p>
            </footer>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
