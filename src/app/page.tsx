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
import { LogOut, Leaf, GripVertical, GripHorizontal, Search, Loader2, Database, X, FileText, Settings, User, Cloud, CloudOff, MapPin, ListTodo, Clock } from 'lucide-react';
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
import { getUserNameByEmail } from '@/app/lib/auth-config';

export interface SelectedPoint {
  lat: number;
  lon: number;
  stationId?: string;
  name?: string;
  basinCode?: string;
  reportId?: string;
  formId?: string;
  templateId?: string;
}

interface SearchResult {
  type: 'station' | 'place' | 'report' | 'planilla';
  display_name: string;
  lat: string;
  lon: string;
  stationId?: string;
  reportId?: string;
  formId?: string;
  templateId?: string;
  trelloCode?: string;
  date?: any;
  author?: string;
}

const MIN_SIDEBAR_WIDTH = 320;
const HEADER_HEIGHT = 64; // h-16 en píxeles

const normalizeText = (text: string) => {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};

export default function Home() {
  const [selectedPoint, setSelectedPoint] = useState<SelectedPoint | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(420);
  const [mapHeight, setMapHeight] = useState(40); // 40% de altura inicial en móvil
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

  const samplesQuery = useMemo(() => {
    if (!db || !user) return null;
    return query(collection(db, 'samples'));
  }, [db, user]);
  const { data: samples } = useCollection(samplesQuery);

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
    setIsDraggable(false);
    localStorage.removeItem('dea_selected_point');
    localStorage.removeItem('dea_form_state');
  }, []);

  const handleStationCreated = useCallback((id: string, name: string) => {
    setSelectedPoint(prev => {
      const updated = prev ? { ...prev, stationId: id, name } : null;
      if (updated) localStorage.setItem('dea_selected_point', JSON.stringify(updated));
      return updated;
    });
    setIsDraggable(false);
  }, []);

  const handleLogout = () => {
    signOut(auth);
  };

  const startResizing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    // Evitar que el touch scroll del navegador interfiera
    if ('touches' in e) {
      // No hacemos preventDefault aquí para no bloquear el inicio del gesto si el navegador es estricto
    }
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((event: MouseEvent | TouchEvent) => {
    if (!isResizing) return;

    // Obtener coordenadas de mouse o touch
    const clientX = 'touches' in event ? event.touches[0].clientX : (event as MouseEvent).clientX;
    const clientY = 'touches' in event ? event.touches[0].clientY : (event as MouseEvent).clientY;

    if (isMobile) {
      // Lógica de redimensionamiento vertical para móvil
      const availableHeight = window.innerHeight - HEADER_HEIGHT;
      const relativeY = clientY - HEADER_HEIGHT;
      const newHeightPct = (relativeY / availableHeight) * 100;
      
      // Limitar entre 20% y 80% del mapa
      if (newHeightPct >= 20 && newHeightPct <= 80) {
        setMapHeight(newHeightPct);
      }
    } else {
      // Lógica de redimensionamiento horizontal para desktop
      const newWidth = window.innerWidth - clientX;
      const maxWidth = window.innerWidth * 0.95;
      
      if (newWidth >= MIN_SIDEBAR_WIDTH && newWidth <= maxWidth) {
        setSidebarWidth(newWidth);
      }
    }
  }, [isResizing, isMobile]);

  useEffect(() => {
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);
    window.addEventListener("touchmove", resize, { passive: false });
    window.addEventListener("touchend", stopResizing);
    
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
      window.removeEventListener("touchmove", resize);
      window.removeEventListener("touchend", stopResizing);
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

  const formatDateLabel = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
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
    
    // 1. Estaciones
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
        stationId: s.id,
        date: s.createdAt,
        author: s.userEmail
      }));

    // 2. Reportes
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
          trelloCode: getProjectCode(r.trelloCardName || ''),
          date: r.createdAt,
          author: r.createdByEmail
        };
      })
      .filter((r): r is SearchResult => r !== null);

    // 3. Planillas
    const planillaResults: SearchResult[] = [];
    const seenPlanillas = new Set<string>();

    (samples || []).forEach(s => {
      const fid = s.formId;
      if (!fid || seenPlanillas.has(fid)) return;
      
      const fidNormalized = normalizeText(fid);
      if (fidNormalized.includes(q)) {
        seenPlanillas.add(fid);
        const report = (reports || []).find(r => r.id === s.reportId);
        const station = (stations || []).find(st => st.id === s.stationId);
        
        if (report && station) {
          // Detectar protocolo
          let detectedTemplate = 'manual';
          if (s.medium === 'agua_superficial') detectedTemplate = 'agua_superficial';
          else if (s.medium === 'agua_subterranea') detectedTemplate = 'agua_subterranea';
          else if (s.medium === 'sedimentos') detectedTemplate = 'pgays_inspeccion';
          else if (s.medium === 'suelo') {
            if (s.analyte === 'sondeoNumero' || s.parameterType === 'Estratigrafía') detectedTemplate = 'suelo_geotecnia';
            else detectedTemplate = 'suelo_edafologico';
          }

          planillaResults.push({
            type: 'planilla',
            display_name: fid,
            lat: String(station.latitude),
            lon: String(station.longitude),
            stationId: station.id,
            reportId: report.id,
            formId: fid,
            templateId: detectedTemplate,
            trelloCode: getProjectCode(report.trelloCardName || ''),
            date: s.timestamp,
            author: s.userEmail
          });
        }
      }
    });

    const localResults = [...stationResults, ...reportResults, ...planillaResults];
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
  }, [searchQuery, stations, reports, samples, isOnline]);

  const handleSelectResult = (result: SearchResult) => {
    handlePointSelect({
      lat: parseFloat(result.lat),
      lon: parseFloat(result.lon),
      stationId: result.stationId,
      name: result.type === 'station' ? result.display_name : 
            result.type === 'report' ? (stations?.find(s => s.id === result.stationId)?.name || 'Estación') : 
            result.type === 'planilla' ? (stations?.find(s => s.id === result.stationId)?.name || 'Estación') : undefined,
      reportId: result.reportId,
      formId: result.formId,
      templateId: result.templateId
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
        isResizing && "cursor-col-resize md:cursor-col-resize cursor-row-resize select-none"
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
                  placeholder={isMobile ? "Buscar..." : isOnline ? "Buscar estación, reporte, planilla, cuenca o lugar..." : "Buscar local (Offline)..."} 
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
                            className="w-full text-left p-3 hover:bg-primary/5 rounded-md transition-colors flex items-start gap-4 border-b last:border-0"
                          >
                            <div className={cn(
                              "mt-1 p-2 rounded shadow-sm",
                              result.type === 'station' ? "bg-primary/10 text-foreground" : 
                              result.type === 'report' ? "bg-accent/10 text-accent" :
                              result.type === 'planilla' ? "bg-neutral-800 text-white" :
                              "bg-muted text-muted-foreground"
                            )}>
                              {result.type === 'station' ? <Database className="h-4 w-4" /> : 
                               result.type === 'report' ? <FileText className="h-4 w-4" /> :
                               result.type === 'planilla' ? <ListTodo className="h-4 w-4" /> :
                               <MapPin className="h-4 w-4" />}
                            </div>
                            <div className="flex-1 overflow-hidden">
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-[13px] font-normal leading-tight truncate text-black">{result.display_name}</p>
                                  {result.date && (
                                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground whitespace-nowrap bg-muted/30 px-1.5 py-0.5 rounded">
                                      <Clock className="h-2.5 w-2.5" />
                                      {formatDateLabel(result.date)}
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-normal truncate">
                                    {result.type === 'station' ? 'Estación de Monitoreo' : 
                                     result.type === 'report' ? `Reporte • ${result.trelloCode}` : 
                                     result.type === 'planilla' ? `Planilla • ${result.trelloCode}` : 
                                     'Lugar / Ubicación'}
                                  </p>
                                  {result.author && (
                                    <div className="flex items-center gap-1 text-[10px] text-black font-normal italic shrink-0">
                                      <div className="h-1 w-1 rounded-full bg-primary/40 mr-1" />
                                      <User className="h-2.5 w-2.5" />
                                      {getUserNameByEmail(result.author)}
                                    </div>
                                  )}
                                </div>
                              </div>
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
                      <span className="text-[11px] font-bold leading-none text-foreground">{getUserNameByEmail(user?.email || null)}</span>
                      <span className="text-[9px] text-muted-foreground/60">{user?.email}</span>
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
          <div 
            style={{ 
              height: isMobile ? `${mapHeight}vh` : 'auto' 
            }}
            className="w-full md:h-auto md:flex-1 relative overflow-hidden bg-muted/20"
          >
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
            {isResizing && <div className="absolute inset-0 z-50 md:cursor-col-resize cursor-row-resize" />}
          </div>

          <div 
            onMouseDown={startResizing} 
            onTouchStart={startResizing}
            className={cn(
              "flex w-full md:w-2 h-2 md:h-full items-center justify-center cursor-row-resize md:cursor-col-resize hover:bg-primary/20 transition-colors z-40 relative group", 
              isResizing && "bg-primary/30"
            )}
          >
            {/* Tirador para Desktop (Vertical) */}
            <div className="hidden md:block w-[1px] h-full bg-border group-hover:bg-primary/50" />
            <div className="hidden md:block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white border border-border rounded-full p-0.5 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
              <GripVertical className="h-3 w-3 text-muted-foreground" />
            </div>

            {/* Tirador para Móvil (Horizontal - Tipo Pill) */}
            <div className="md:hidden w-12 h-1 bg-border group-hover:bg-primary/50 rounded-full" />
            <div className="md:hidden absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white border border-border rounded-full p-0.5 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
              <GripHorizontal className="h-3 w-3 text-muted-foreground" />
            </div>
          </div>

          <div 
            style={{ 
              width: !isMobile ? `${sidebarWidth}px` : '100%',
              height: isMobile ? `${100 - mapHeight}vh` : 'auto'
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
