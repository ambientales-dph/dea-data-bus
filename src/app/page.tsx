'use client';

import { useState, useCallback } from 'react';
import { AuthGuard } from '@/components/auth-guard';
import { MapView } from '@/components/map-view';
import { DataEntryForm } from '@/components/data-entry-form';
import { Button } from '@/components/ui/button';
import { useAuth, useUser } from '@/firebase';
import { signOut } from 'firebase/auth';
import { LogOut, Leaf } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface SelectedPoint {
  lat: number;
  lon: number;
  stationId?: string;
  name?: string;
}

export default function Home() {
  const [selectedPoint, setSelectedPoint] = useState<SelectedPoint | null>(null);
  const auth = useAuth();
  const { user } = useUser();

  const handlePointSelect = useCallback((point: SelectedPoint) => {
    setSelectedPoint(point);
  }, []);

  const handleStationCreated = useCallback((id: string, name: string) => {
    setSelectedPoint(prev => prev ? { ...prev, stationId: id, name } : null);
  }, []);

  const handleLogout = () => {
    signOut(auth);
  };

  return (
    <AuthGuard>
      <div className="flex h-screen w-full flex-col bg-background overflow-hidden">
        {/* Header */}
        <header className="flex h-16 items-center justify-between border-b bg-white px-6 shadow-sm z-20">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-white">
              <Leaf className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-headline text-primary tracking-tight">DEA Data Bus</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Plataforma de Monitoreo</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden md:flex flex-col items-end">
              <span className="text-sm font-medium">{user?.displayName || 'Usuario'}</span>
              <span className="text-xs text-muted-foreground">{user?.email}</span>
            </div>
            <div className="h-8 w-[1px] bg-border hidden md:block"></div>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Cerrar sesión
            </Button>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Panel: Map */}
          <div className="relative flex-[7] p-4">
            <MapView 
              onPointSelect={handlePointSelect} 
              selectedPoint={selectedPoint} 
            />
          </div>

          {/* Right Panel: Form */}
          <div className="flex-[3] border-l bg-white shadow-xl flex flex-col min-w-[420px]">
            <ScrollArea className="flex-1">
              <div className="p-6">
                <DataEntryForm 
                  selectedPoint={selectedPoint} 
                  onStationCreated={handleStationCreated}
                />
              </div>
            </ScrollArea>
            <footer className="p-4 border-t bg-muted/10 text-center">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">
                © {new Date().getFullYear()} DEA Data Bus - Sistema de Gestión de Datos
              </p>
            </footer>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
