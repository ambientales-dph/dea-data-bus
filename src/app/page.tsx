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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

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
          
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9 border-2 border-primary/10 shadow-sm">
              <AvatarImage src={user?.photoURL || ''} alt={user?.displayName || 'Usuario'} />
              <AvatarFallback className="bg-primary/5 text-primary font-bold text-xs">
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="h-6 w-[1px] bg-border"></div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleLogout} 
              className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
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
