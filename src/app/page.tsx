'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { AuthGuard } from '@/components/auth-guard';
import { MapView } from '@/components/map-view';
import { DataEntryForm, type FormView } from '@/components/data-entry-form';
import { PresenceManager } from '@/components/presence-manager';
import { Button } from '@/components/ui/button';
import { useAuth, useUser, useFirestore, useCollection } from '@/firebase';
import { signOut } from 'firebase/auth';
import { collection, query } from 'firebase/firestore';
import { LogOut, Leaf, GripVertical, Search, Loader2, Database, X, FileText, Settings, User, Cloud, CloudOff } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { SettingsDialog } from '@/components/settings-dialog';
import { cn } from '@/lib/utils';

export interface SelectedPoint {
  lat: number;
  lon: number;
  stationId?: string;
  name?: string;
  basinCode?: string;
  reportId?: string;
}

interface SearchResult {
  type: 'station' | 'place' | 'report';
  display_name: string;
  lat: string;
  lon: string;
  stationId?: string;
  reportId?: string;
  trelloCode?: string;
}

const MIN_SIDEBAR_WIDTH = 320;

const normalizeText = (text: string) => {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};

export default function Home() {
  const [selectedPoint, setSelectedPoint] = useState<SelectedPoint | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(420);
  const [isResizing, setIsResizing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [isDraggable, setIsDraggable] = useState(false);
  
  const auth = useAuth();
  const db = useFirestore();
  const { user } = useUser();

  const [activeLayer, setActiveLayer] = useState<'osm' | 'grayscale' | 'satellite'>('osm');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchIdRef = useRef(0);

  const stationsQuery = useMemo(() => {
    if (!db || !user) return null;
    return query(collection(db, 'stations'));
  }, [db, user]);
  const { data: stations } = useCollection(stationsQuery);

  const reportsQuery = useMemo(() => {
    if (!db || !user) return null;
    return query(collection(db, 'reports'));
  }, [db, user]);
  const { data: reports } = useCollection(reportsQuery);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    setIsOnline(navigator.onLine);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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

  const getProjectCode = (fullName: string) => {
    if (!fullName) return 'S/P';
    const match = fullName.match(/\((.*?)\)/);
    return match ? match[0] : fullName.substring(0, 8);
  };

  useEffect(() => {
    const rawQuery = searchQuery.trim();
    const q = normalizeText(rawQuery);
    
    if (q.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const currentSearchId = ++searchIdRef.current;
    
    const stationResults: SearchResult[] = (stations || [])
      .filter(s => {
        const stationName = normalizeText(String(s.name || ''));
        const basinCode = normalizeText(String(s.basinCode || ''));
        return stationName.includes(q) || basinCode.includes(q);
      })
      .map(s => ({
        type: 'station',
        display_name: String(s.name),
        lat: String(s.latitude),
        lon: String(s.longitude),
        stationId: s.id
      }));

    const reportResults: SearchResult[] = (reports || [])
      .filter(r => {
        const oid = normalizeText(String(r.oid || ''));
        const trello = normalizeText(String(r.trelloCardName || ''));
        return oid.includes(q) || trello.includes(q);
      })
      .map(r => {
        const station = (stations || []).find(s => s.id === r.stationId);
        if (!station) return null;
        return {
          type: 'report',
          display_name: String(r.oid),
          lat: String(station.latitude),
          lon: String(station.longitude),
          stationId: station.id,
          reportId: r.id,
          trelloCode: getProjectCode(r.trelloCardName || '')
        };
      })
      .filter((r): r is SearchResult => r !== null);

    const localResults = [...stationResults, ...reportResults];
    setSearchResults(localResults);

    if (q.length < 3 || !isOnline) {
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setShowResults(true);

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(rawQuery)}&limit=15&countrycodes=ar`,
          { headers: { 'Accept-Language': 'es' } }
        );
        
        if (response.ok && currentSearchId === searchIdRef.current) {
          const osmData = await response.json();
          const placeResults: SearchResult[] = osmData.map((place: any) => ({
            type: 'place',
            display_name: place.display_name,
            lat: place.lat,
            lon: place.lon
          }));

          setSearchResults(prev => {
            const locals = prev.filter(r => r.type !== 'place');
            return [...locals, ...placeResults];
          });
        }
      } catch (error) {
        console.error("OSM Search failed", error);
      } finally {
        if (currentSearchId === searchIdRef.current) {
          setIsSearching(false);
        }
      }
    }, 400);
    
    return () => clearTimeout(timer);
  }, [searchQuery, stations, reports, isOnline]);

  const handleSelectResult = (result: SearchResult) => {
    handlePointSelect({
      lat: parseFloat(result.lat),
      lon: parseFloat(result.lon),
      stationId: result.stationId,
      name: result.type === 'station' ? result.display_name : 
            result.type === 'report' ? (stations?.find(s => s.id === result.stationId)?.name || 'Estación') : undefined,
      reportId: result.reportId
    });
    setSearchQuery('');
    setSearchResults([]);
    setShowResults(false);
  };

  const handleOpenSettings = () => {
    setTimeout(() => {
      setIsSettingsOpen(true);
    }, 100);
  };

  return (
    <AuthGuard>
      <PresenceManager selectedPoint={selectedPoint} />
      <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
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
                <h1 className="text-sm md:text-xl font-bold font-headline text-foreground tracking-tight leading-none">DEA Data Bus</h1>
                <p className="hidden md:block text-[9px] text-muted-foreground uppercase tracking-widest font-semibold mt-0.5">Plataforma de Monitoreo</p>
              </div>
            </div>

            <div ref={searchContainerRef} className="relative flex-1 max-w-xl ml-2 md:ml-4">
              <div className="flex items-center bg-muted/30 hover:bg-muted/50 border border-transparent focus-within:border-primary/30 focus-within:bg-white focus-within:ring-2 focus-within:ring-primary/10 rounded-full overflow-hidden transition-all h-9">
                <div className="pl-3 text-muted-foreground">
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin text-foreground" /> : <Search className="h-4 w-4" />}
                </div>
                <Input 
                  placeholder={isMobile ? "Buscar..." : isOnline ? "Buscar estación, reporte, cuenca o lugar..." : "Buscar estación o reporte (Offline)..."} 
                  className="border-0 focus-visible:ring-0 h-full text-xs bg-transparent placeholder:text-[10px] md:placeholder:text-xs text-foreground font-medium"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setShowResults(true)}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="pr-3 text-muted-foreground hover:text-foreground">
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
                          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-foreground/50" />
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
                              result.type === 'station' ? "bg-primary/10 text-foreground" : 
                              result.type === 'report' ? "bg-accent/10 text-accent" :
                              "bg-muted text-muted-foreground"
                            )}>
                              {result.type === 'station' ? <Database className="h-3.5 w-3.5" /> : 
                               result.type === 'report' ? <FileText className="h-3.5 w-3.5" /> :
                               <MapPin className="h-3.5 w-3.5" />}
                            </div>
                            <div className="flex-1 overflow-hidden">
                              <p className="text-[11px] font-bold leading-tight truncate text-foreground">{result.display_name}</p>
                              <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold">
                                {result.type === 'station' ? 'Estación de Monitoreo' : 
                                 result.type === 'report' ? `Reporte • ${result.trelloCode}` : 
                                 'Lugar / Ubicación'}
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
            <div className="flex items-center gap-2 pr-2">
               {isOnline ? (
                 <Cloud className="h-4 w-4 text-primary" title="Conectado y Sincronizado" />
               ) : (
                 <CloudOff className="h-4 w-4 text-destructive" title="Modo Offline - Datos guardados localmente" />
               )}
            </div>

            <Separator orientation="vertical" className="h-6 hidden sm:block" />

            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button id="user-menu-trigger" className="flex items-center gap-2 hover:bg-primary/5 p-1 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                    <div className="flex flex-col items-end hidden md:flex">
                      <span className="text-[11px] font-bold leading-none text-foreground">{user?.displayName || 'Técnico'}</span>
                      <span className="text-[9px] text-muted-foreground">{user?.email}</span>
                    </div>
                    <Avatar className="h-8 w-8 md:h-9 md:w-9 border-2 border-primary/10 shadow-sm">
                      <AvatarImage src={user?.photoURL || ''} alt={user?.displayName || 'Usuario'} />
                      <AvatarFallback className="bg-primary/5 text-foreground font-bold text-xs">
                        {user?.email?.charAt(0).toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 shadow-2xl border-primary/10">
                  <DropdownMenuLabel className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest px-2 py-1.5 border-b">
                    Mi Cuenta
                  </DropdownMenuLabel>
                  <DropdownMenuItem 
                    onSelect={handleOpenSettings} 
                    className="text-xs font-medium cursor-pointer py-2.5"
                  >
                    <Settings className="mr-2 h-4 w-4 text-foreground" />
                    Configuración de Sesión
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={handleLogout} className="text-xs font-medium cursor-pointer py-2.5 text-destructive focus:text-destructive focus:bg-destructive/5">
                    <LogOut className="mr-2 h-4 w-4" />
                    Cerrar Sesión
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <div className="flex flex-1 flex-col md:flex-row overflow-hidden relative">
          <div className="w-full h-[40vh] md:h-auto md:flex-1 relative overflow-hidden bg-muted/20">
            <div className="absolute inset-0">
              <MapView 
                onPointSelect={handlePointSelect} 
                selectedPoint={selectedPoint} 
                activeLayer={activeLayer}
                onLayerChange={setActiveLayer}
                isMobile={isMobile}
                isDraggable={isDraggable}
              />
            </div>
            {isResizing && <div className="absolute inset-0 z-50 cursor-col-resize" />}
          </div>

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
                  onActiveViewChange={(view: FormView) => setIsDraggable(view === 'create-station' || view === 'edit-station')}
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
