
'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { AuthGuard } from '@/components/auth-guard';
import { MapView } from '@/components/map-view';
import { DataEntryForm } from '@/components/data-entry-form';
import { PresenceManager } from '@/components/presence-manager';
import { Button } from '@/components/ui/button';
import { useAuth, useUser } from '@/firebase';
import { signOut } from 'firebase/auth';
import { LogOut, Leaf, GripVertical, Search, Loader2, Layers, Map as MapIcon, Satellite, MapPin } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface SelectedPoint {
  lat: number;
  lon: number;
  stationId?: string;
  name?: string;
  basinCode?: string;
}

interface SearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

const MIN_SIDEBAR_WIDTH = 320;
const MAX_SIDEBAR_WIDTH = 800;

export default function Home() {
  const [selectedPoint, setSelectedPoint] = useState<SelectedPoint | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(420);
  const [isResizing, setIsResizing] = useState(false);
  const resizerRef = useRef<HTMLDivElement>(null);
  const auth = useAuth();
  const { user } = useUser();

  // Estados para el Buscador y Capas del Mapa (ahora en page.tsx)
  const [activeLayer, setActiveLayer] = useState<'osm' | 'grayscale' | 'satellite'>('osm');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setSidebarWidth(window.innerWidth / 2);
    }
  }, []);

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

  const startResizing = useCallback(() => {
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((mouseMoveEvent: MouseEvent) => {
    if (isResizing) {
      const newWidth = window.innerWidth - mouseMoveEvent.clientX;
      if (newWidth >= MIN_SIDEBAR_WIDTH && newWidth <= MAX_SIDEBAR_WIDTH) {
        setSidebarWidth(newWidth);
      }
    }
  }, [isResizing]);

  useEffect(() => {
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resize, stopResizing]);

  // Lógica de búsqueda Nominatim (movida desde MapView)
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.length < 3) return;
      setIsSearching(true);
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5&countrycodes=ar`
        );
        const data = await response.json();
        setSearchResults(data);
        setShowResults(true);
      } catch (error) {} finally {
        setIsSearching(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectResult = (result: SearchResult) => {
    handlePointSelect({
      lat: parseFloat(result.lat),
      lon: parseFloat(result.lon)
    });
    setSearchQuery('');
    setSearchResults([]);
    setShowResults(false);
  };

  return (
    <AuthGuard>
      <PresenceManager selectedPoint={selectedPoint} />
      <div className={cn(
        "flex h-screen w-full flex-col bg-background overflow-hidden",
        isResizing && "cursor-col-resize select-none"
      )}>
        <header className="flex h-16 items-center justify-between border-b bg-white px-4 md:px-6 shadow-sm z-30 shrink-0">
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
            <Button variant="ghost" size="icon" onClick={handleLogout} className="h-8 w-8 md:h-9 md:w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="flex flex-1 flex-col md:flex-row overflow-hidden relative">
          {/* Map Clipping Parent - El contenedor de la persiana */}
          <div className="w-full h-[40vh] md:h-auto md:flex-1 relative overflow-hidden bg-muted/20">
            
            {/* UI DE CONTROLES DEL MAPA - Ahora posicionados de forma responsiva al área visible */}
            <div className="absolute top-0 left-0 right-0 z-[30] p-2 flex gap-2 pointer-events-none">
              <div className="relative flex-1 pointer-events-auto max-w-sm">
                <div className="flex items-center bg-white/95 backdrop-blur shadow-sm border border-primary/20 rounded-md overflow-hidden transition-all focus-within:ring-2 focus-within:ring-primary/50">
                  <div className="pl-3 text-primary">
                    {isSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                  </div>
                  <Input 
                    placeholder="Buscá una ubicación..." 
                    className="border-0 focus-visible:ring-0 h-8 text-[11px] bg-transparent w-full"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setShowResults(true)}
                  />
                </div>
                {showResults && searchResults.length > 0 && (
                  <Card className="absolute top-full left-0 right-0 mt-1 shadow-2xl border-primary/10 overflow-hidden z-[40]">
                    <ScrollArea className="max-h-[200px]">
                      <div className="p-1">
                        {searchResults.map((result, idx) => (
                          <button key={idx} onClick={() => handleSelectResult(result)} className="w-full text-left p-2 hover:bg-primary/5 rounded-md transition-colors flex items-start gap-2 border-b last:border-0">
                            <MapPin className="h-3 w-3 mt-0.5 text-primary shrink-0" />
                            <span className="text-[10px] font-medium leading-tight">{result.display_name}</span>
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  </Card>
                )}
              </div>

              <div className="pointer-events-auto">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="icon" className="h-8 w-8 bg-white/95 border-primary/20 shadow-sm text-primary">
                      <Layers className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-2" align="end">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase px-2 py-1">Capas Base</p>
                      <button onClick={() => setActiveLayer('osm')} className={cn("w-full flex items-center gap-2 p-2 rounded-md text-[11px]", activeLayer === 'osm' ? "bg-primary text-white" : "hover:bg-muted")}><MapIcon className="h-3.5 w-3.5" /> OSM</button>
                      <button onClick={() => setActiveLayer('grayscale')} className={cn("w-full flex items-center gap-2 p-2 rounded-md text-[11px]", activeLayer === 'grayscale' ? "bg-primary text-white" : "hover:bg-muted")}><MapIcon className="h-3.5 w-3.5 opacity-50" /> Gris</button>
                      <button onClick={() => setActiveLayer('satellite')} className={cn("w-full flex items-center gap-2 p-2 rounded-md text-[11px]", activeLayer === 'satellite' ? "bg-primary text-white" : "hover:bg-muted")}><Satellite className="h-3.5 w-3.5" /> Satélite</button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* LEYENDA DEL MAPA - También reposicionada */}
            <div className="absolute bottom-2 left-2 z-20 rounded-xl bg-white/95 p-3 shadow-xl border border-primary/10 pointer-events-none">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#ef4444] border border-white"></div> 
                  <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Técnicos Activos</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#22c55e] border border-white"></div> 
                  <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Mi Selección</span>
                </div>
              </div>
            </div>

            {/* fixed-width Map Container - El mapa estático de fondo */}
            <div className="absolute inset-0 md:w-[100vw] md:-left-[25vw]">
              <div className="h-full w-full p-2 md:p-4">
                <MapView 
                  onPointSelect={handlePointSelect} 
                  selectedPoint={selectedPoint} 
                  activeLayer={activeLayer}
                />
              </div>
            </div>
            {isResizing && <div className="absolute inset-0 z-50 cursor-col-resize" />}
          </div>

          <div onMouseDown={startResizing} className={cn("hidden md:flex w-2 items-center justify-center cursor-col-resize hover:bg-primary/20 transition-colors z-40 relative group", isResizing && "bg-primary/30")}>
            <div className="w-[1px] h-full bg-border group-hover:bg-primary/50" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white border border-border rounded-full p-0.5 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
              <GripVertical className="h-3 w-3 text-muted-foreground" />
            </div>
          </div>

          <div style={{ width: typeof window !== 'undefined' && window.innerWidth >= 768 ? `${sidebarWidth}px` : '100%' }} className="flex-1 md:flex-none border-t md:border-t-0 md:border-l bg-white shadow-xl flex flex-col overflow-hidden z-20">
            <ScrollArea className="flex-1">
              <div className="p-4 md:p-6 pb-12">
                <DataEntryForm selectedPoint={selectedPoint} onStationCreated={handleStationCreated} onPointUpdate={handlePointUpdate} onDeselect={handleDeselect} />
              </div>
            </ScrollArea>
            <footer className="p-3 md:p-4 border-t bg-muted/10 text-center shrink-0">
              <p className="text-[9px] md:text-[10px] text-muted-foreground font-medium uppercase tracking-widest">© {new Date().getFullYear()} DEA Data Bus - Sistema de Gestión de Datos</p>
            </footer>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
