'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { AuthGuard } from '@/components/auth-guard';
import { MapView } from '@/components/map-view';
import { DataEntryForm } from '@/components/data-entry-form';
import { PresenceManager } from '@/components/presence-manager';
import { Button } from '@/components/ui/button';
import { useAuth, useUser, useFirestore, useCollection } from '@/firebase';
import { signOut } from 'firebase/auth';
import { collection, query } from 'firebase/firestore';
import { LogOut, Leaf, GripVertical, Search, Loader2, Layers, Map as MapIcon, Satellite, MapPin, Database, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export interface SelectedPoint {
  lat: number;
  lon: number;
  stationId?: string;
  name?: string;
  basinCode?: string;
}

interface SearchResult {
  type: 'station' | 'place';
  display_name: string;
  lat: string;
  lon: string;
  stationId?: string;
}

const MIN_SIDEBAR_WIDTH = 320;

export default function Home() {
  const [selectedPoint, setSelectedPoint] = useState<SelectedPoint | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(420);
  const [isResizing, setIsResizing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const auth = useAuth();
  const db = useFirestore();
  const { user } = useUser();

  const [activeLayer, setActiveLayer] = useState<'osm' | 'grayscale' | 'satellite'>('osm');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const stationsQuery = useMemo(() => query(collection(db, 'stations')), [db]);
  const { data: stations } = useCollection(stationsQuery);

  // Detectar mobile y setear ancho inicial
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile && sidebarWidth === 420) {
        setSidebarWidth(window.innerWidth / 2);
      }
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [sidebarWidth]);

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
    if (!isMobile) setIsResizing(true);
  }, [isMobile]);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((mouseMoveEvent: MouseEvent) => {
    if (isResizing && !isMobile) {
      const newWidth = window.innerWidth - mouseMoveEvent.clientX;
      const maxWidth = window.innerWidth * 0.95;
      
      if (newWidth >= MIN_SIDEBAR_WIDTH && newWidth <= maxWidth) {
        setSidebarWidth(newWidth);
      }
    }
  }, [isResizing, isMobile]);

  useEffect(() => {
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resize, stopResizing]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Lógica de búsqueda mejorada
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    
    // Búsqueda instantánea en estaciones locales
    const localResults: SearchResult[] = (stations || [])
      .filter(s => {
        const stationName = String(s.name || '').toLowerCase();
        const basinCode = String(s.basinCode || '').toLowerCase();
        return stationName.includes(q) || basinCode.includes(q);
      })
      .map(s => ({
        type: 'station',
        display_name: String(s.name),
        lat: String(s.latitude),
        lon: String(s.longitude),
        stationId: s.id
      }))
      .sort((a, b) => a.display_name.localeCompare(b.display_name));

    setSearchResults(localResults);

    // Búsqueda en OSM con Debounce
    if (q.length < 3) return;

    const timer = setTimeout(async () => {
      setIsSearching(true);
      setShowResults(true);
      
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=20&countrycodes=ar`,
          { headers: { 'Accept-Language': 'es' } }
        );
        
        if (response.ok) {
          const osmData = await response.json();
          const placeResults: SearchResult[] = osmData.map((place: any) => ({
            type: 'place',
            display_name: place.display_name,
            lat: place.lat,
            lon: place.lon
          }));

          setSearchResults(prev => {
            // Mantener las estaciones y agregar lugares sin duplicar
            const currentStations = prev.filter(r => r.type === 'station');
            return [...currentStations, ...placeResults];
          });
        }
      } catch (error) {
        console.error("OSM Search failed", error);
      } finally {
        setIsSearching(false);
      }
    }, 600);
    
    return () => clearTimeout(timer);
  }, [searchQuery, stations]);

  const handleSelectResult = (result: SearchResult) => {
    handlePointSelect({
      lat: parseFloat(result.lat),
      lon: parseFloat(result.lon),
      stationId: result.stationId,
      name: result.type === 'station' ? result.display_name : undefined
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
        <header className="flex h-16 items-center justify-between border-b bg-white px-3 md:px-6 shadow-sm z-[60] shrink-0">
          <div className="flex items-center gap-2 md:gap-4 flex-1">
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex h-9 w-9 md:h-10 md:w-10 items-center justify-center rounded-lg bg-primary text-white shadow-sm">
                <Leaf className="h-5 w-5 md:h-6 md:w-6" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-sm md:text-xl font-bold font-headline text-primary tracking-tight leading-none">DEA Data Bus</h1>
                <p className="hidden md:block text-[9px] text-muted-foreground uppercase tracking-widest font-semibold mt-0.5">Plataforma de Monitoreo</p>
              </div>
            </div>

            <div ref={searchContainerRef} className="relative flex-1 max-w-xl ml-2 md:ml-4">
              <div className="flex items-center bg-muted/30 hover:bg-muted/50 border border-transparent focus-within:border-primary/30 focus-within:bg-white focus-within:ring-2 focus-within:ring-primary/10 rounded-full overflow-hidden transition-all h-9">
                <div className="pl-3 text-muted-foreground">
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Search className="h-4 w-4" />}
                </div>
                <Input 
                  placeholder={isMobile ? "Buscar..." : "Buscar estación, cuenca o lugar..."} 
                  className="border-0 focus-visible:ring-0 h-full text-xs bg-transparent placeholder:text-[10px] md:placeholder:text-xs"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setShowResults(true)}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="pr-3 text-muted-foreground hover:text-primary">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              
              {showResults && searchQuery.trim().length >= 2 && (
                <Card className="absolute top-full left-0 right-0 mt-1 shadow-2xl border-primary/10 overflow-hidden z-[70] animate-in fade-in slide-in-from-top-2 duration-200">
                  <ScrollArea className="h-[400px] w-full bg-white">
                    <div className="p-1">
                      {isSearching && searchResults.length === 0 ? (
                        <div className="p-6 text-center text-xs text-muted-foreground">
                          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-primary/50" />
                          <p className="font-medium">Buscando...</p>
                        </div>
                      ) : searchResults.length > 0 ? (
                        searchResults.map((result, idx) => (
                          <button 
                            key={idx} 
                            onClick={() => handleSelectResult(result)} 
                            className="w-full text-left p-2 hover:bg-primary/5 rounded-md transition-colors flex items-start gap-3 border-b last:border-0"
                          >
                            <div className={cn(
                              "mt-0.5 p-1.5 rounded",
                              result.type === 'station' ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                            )}>
                              {result.type === 'station' ? <Database className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
                            </div>
                            <div className="flex-1 overflow-hidden">
                              <p className="text-[11px] font-bold leading-tight truncate">{result.display_name}</p>
                              <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold">
                                {result.type === 'station' ? 'Estación de Monitoreo' : 'Lugar / Ubicación'}
                              </p>
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="p-6 text-center text-xs text-muted-foreground italic">
                          No se hallaron resultados.
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </Card>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-1 md:gap-4 ml-2 md:ml-4">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-9 gap-1 md:gap-2 text-muted-foreground hover:text-primary hover:bg-primary/5 px-2 md:px-3">
                  <Layers className="h-4 w-4" />
                  <span className="text-xs font-semibold hidden md:inline">Capas</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-2 shadow-2xl border-primary/10" align="end">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase px-2 py-1.5 tracking-widest border-b mb-1">Capas Base</p>
                  <button onClick={() => setActiveLayer('osm')} className={cn("w-full flex items-center justify-between p-2 rounded-md text-[11px] font-medium transition-colors", activeLayer === 'osm' ? "bg-primary text-white" : "hover:bg-muted")}>
                    <div className="flex items-center gap-2"><MapIcon className="h-3.5 w-3.5" /> Estándar OSM</div>
                    {activeLayer === 'osm' && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </button>
                  <button onClick={() => setActiveLayer('grayscale')} className={cn("w-full flex items-center justify-between p-2 rounded-md text-[11px] font-medium transition-colors", activeLayer === 'grayscale' ? "bg-primary text-white" : "hover:bg-muted")}>
                    <div className="flex items-center gap-2"><MapIcon className="h-3.5 w-3.5 opacity-50" /> Escala de Grises</div>
                    {activeLayer === 'grayscale' && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </button>
                  <button onClick={() => setActiveLayer('satellite')} className={cn("w-full flex items-center justify-between p-2 rounded-md text-[11px] font-medium transition-colors", activeLayer === 'satellite' ? "bg-primary text-white" : "hover:bg-muted")}>
                    <div className="flex items-center gap-2"><Satellite className="h-3.5 w-3.5" /> Satélite ArcGIS</div>
                    {activeLayer === 'satellite' && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </button>
                </div>
              </PopoverContent>
            </Popover>

            <Separator orientation="vertical" className="h-6 hidden sm:block" />

            <div className="flex items-center gap-2">
              <div className="flex flex-col items-end hidden md:flex">
                <span className="text-[11px] font-bold leading-none">{user?.displayName || 'Técnico'}</span>
                <span className="text-[9px] text-muted-foreground">{user?.email}</span>
              </div>
              <Avatar className="h-8 w-8 md:h-9 md:w-9 border-2 border-primary/10 shadow-sm">
                <AvatarImage src={user?.photoURL || ''} alt={user?.displayName || 'Usuario'} />
                <AvatarFallback className="bg-primary/5 text-primary font-bold text-xs">
                  {user?.email?.charAt(0).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <Button variant="ghost" size="icon" onClick={handleLogout} className="h-8 w-8 md:h-9 md:w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>

        <div className="flex flex-1 flex-col md:flex-row overflow-hidden relative">
          {/* Contenedor del Mapa */}
          <div className="w-full h-[40vh] md:h-auto md:flex-1 relative overflow-hidden bg-muted/20">
            {/* El efecto persiana solo se aplica en desktop (md:) */}
            <div className={cn(
              "absolute inset-0",
              "md:w-[100vw] md:-left-[25vw]" 
            )}>
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

          {/* Resizer - Solo visible en desktop */}
          <div 
            onMouseDown={startResizing} 
            className={cn(
              "hidden md:flex w-2 items-center justify-center cursor-col-resize hover:bg-primary/20 transition-colors z-40 relative group", 
              isResizing && "bg-primary/30"
            )}
          >
            <div className="w-[1px] h-full bg-border group-hover:bg-primary/50" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white border border-border rounded-full p-0.5 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
              <GripVertical className="h-3 w-3 text-muted-foreground" />
            </div>
          </div>

          {/* Panel de Datos - Sidebar */}
          <div 
            style={{ 
              width: !isMobile ? `${sidebarWidth}px` : '100%' 
            }} 
            className="flex-1 md:flex-none border-t md:border-t-0 md:border-l bg-white shadow-xl flex flex-col overflow-hidden z-20"
          >
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
              <p className="text-[9px] md:text-[10px] text-muted-foreground font-medium uppercase tracking-widest leading-relaxed">
                © {new Date().getFullYear()} DEA Data Bus - Sistema de Gestión de Datos Ambientales<br/>
                <span className="opacity-60">Dirección de Preservación Hidráulica</span>
              </p>
            </footer>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
