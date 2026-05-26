'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { collection, doc, setDoc, updateDoc, serverTimestamp, query, where, orderBy, limit, getDocs, addDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { useFirestore, useUser, useDoc, useCollection, errorEmitter, FirestorePermissionError, useStorage } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { MapPin, Send, PlusCircle, Database, FileText, Search, Loader2, ArrowLeft, Check, X, Briefcase, LayoutList, Star, ChevronRight, User, Clock, Navigation, FolderOpen, Pencil, Settings, Trash2 } from 'lucide-react';
import { SelectedPoint } from '@/app/page';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { SamplingReportForm } from './sampling-report-form';
import { ReportList } from './report-list';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { MONITORING_TEMPLATES, BASIN_CODES_DATA } from '@/app/lib/monitoring-constants';
import { isUserAdmin } from '@/app/lib/auth-config';
import { AdminDeleteDialog } from './admin-delete-dialog';
import { ref, listAll, deleteObject } from 'firebase/storage';

function isPointInPoly(pt: [number, number], poly: [number, number][][]) {
  for (let i = 0; i < poly.length; i++) {
    let inside = false;
    const ring = poly[i];
    for (let j = 0, k = ring.length - 1; j < ring.length; k = j++) {
      if (((ring[j][1] > pt[1]) !== (ring[k][1] > pt[1])) &&
        (pt[0] < (ring[k][0] - ring[j][0]) * (pt[1] - ring[j][1]) / (ring[k][1] - ring[j][1]) + ring[j][0])) {
        inside = !inside;
      }
    }
    if (inside) return true;
  }
  return false;
}

const stationSchema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  description: z.string().optional(),
});

type StationValues = z.infer<typeof stationSchema>;

export type FormView = 'summary' | 'create-station' | 'edit-station' | 'report-entry' | 'consult' | 'select-project' | 'select-template';

function DataExplorer({ 
  onSelectStation,
  onSelectReport,
  onSelectPlanilla
}: { 
  onSelectStation: (point: SelectedPoint) => void,
  onSelectReport: (station: any, reportId: string) => void,
  onSelectPlanilla: (station: any, reportId: string, formId: string, templateId: string) => void
}) {
  const db = useFirestore();
  const [dynamicBasinNames, setDynamicBasinNames] = useState<Record<string, string>>({});

  const stationsQuery = useMemo(() => query(collection(db, 'stations'), orderBy('name', 'asc')), [db]);
  const { data: stations, loading: stationsLoading } = useCollection(stationsQuery);

  const reportsQuery = useMemo(() => query(collection(db, 'reports')), [db]);
  const { data: reports, loading: reportsLoading } = useCollection(reportsQuery);

  const samplesQuery = useMemo(() => query(collection(db, 'samples')), [db]);
  const { data: samples, loading: samplesLoading } = useCollection(samplesQuery);

  useEffect(() => {
    fetch('/data/codigos_cuencas.json')
      .then(res => res.json())
      .then(data => {
        const map: Record<string, string> = {};
        if (data.features) {
          data.features.forEach((f: any) => {
            const code = f.properties.CODIGO;
            const name = f.properties.nombre_2 || f.properties.NOMBRE || code;
            map[code] = name;
          });
        }
        setDynamicBasinNames(map);
      })
      .catch(err => {
        console.error("Error cargando cuencas dinámicas:", err);
      });
  }, []);

  const getBasinCodeFromStationName = (name: string) => {
    const match = name.match(/^EM([A-Za-z]{2,4})\d{4}$/);
    return match ? match[1] : null;
  };

  const stationsByBasin = useMemo(() => {
    const groups: Record<string, any[]> = {};
    stations.forEach(s => {
      let bCode = getBasinCodeFromStationName(s.name || '');
      if (!bCode) bCode = s.basinCode || 'S/C';
      
      if (!groups[bCode]) groups[bCode] = [];
      groups[bCode].push(s);
    });
    return groups;
  }, [stations]);

  const getBasinLabel = (code: string) => {
    if (code === 'S/C') return 'Otras Ubicaciones';
    const name = dynamicBasinNames[code];
    return name ? `${name} (${code})`.toUpperCase() : `(${code})`.toUpperCase();
  };

  if (stationsLoading || reportsLoading || samplesLoading) {
    return (
      <div className="flex flex-col items-center justify-center pt-20 space-y-4">
        <Loader2 className="h-6 w-6 animate-spin text-black" />
        <p className="text-[10px] uppercase font-normal tracking-widest text-black">Sincronizando base de datos...</p>
      </div>
    );
  }

  const getReportsByStation = (stationId: string) => reports.filter((r: any) => r.stationId === stationId);
  
  const getPlanillasByReport = (reportId: string) => {
    const rSamples = samples.filter((s: any) => s.reportId === reportId);
    const planillasMap = new Map<string, { medium: string, timestamp: any, count: number, templateId: string }>();
    
    rSamples.forEach((s: any) => {
      const fId = s.formId || 'legacy';
      const existing = planillasMap.get(fId);
      
      let detectedTemplate = 'manual';
      if (s.medium === 'agua_superficial') detectedTemplate = 'agua_superficial';
      else if (s.medium === 'agua_subterranea') detectedTemplate = 'agua_subterranea';
      else if (s.medium === 'suelo') {
        if (s.analyte === 'sondeoNumero' || s.parameterType === 'Estratigrafía') detectedTemplate = 'suelo_geotecnia';
        else detectedTemplate = 'suelo_edafologico';
      }

      if (!existing) {
        planillasMap.set(fId, { 
          medium: s.medium || 'otro', 
          timestamp: s.timestamp,
          count: 1,
          templateId: detectedTemplate
        });
      } else {
        existing.count += 1;
        if (s.timestamp && (!existing.timestamp || s.timestamp.toMillis() > existing.timestamp.toMillis())) {
          existing.timestamp = s.timestamp;
        }
        if (detectedTemplate !== 'manual') existing.templateId = detectedTemplate;
      }
    });

    return Array.from(planillasMap.entries()).map(([formId, data]) => ({ 
      formId, 
      medium: data.medium,
      timestamp: data.timestamp,
      count: data.count,
      templateId: data.templateId
    }));
  };

  const formatDateShort = (timestamp: any) => {
    if (!timestamp) return 'S/F';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
  };

  const getProtocolLabel = (templateId: string, medium: string) => {
    if (templateId === 'suelo_geotecnia') return 'Mecánica de suelos (MS-001)';
    if (templateId === 'suelo_edafologico') return 'Perfil Edafológico (PE-001)';
    if (medium === 'agua_superficial') return 'Agua Superficial (AS-001)';
    if (medium === 'agua_subterranea') return 'Freatímetro (FTA-001)';
    return medium.replace('_', ' ');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="space-y-4">
        <h2 className="text-[10px] font-normal uppercase tracking-[0.2em] text-black flex items-center gap-2">
          EXPLORADOR DE DATOS
        </h2>
        
        <div className="flex items-start gap-12 px-1">
          <div className="flex flex-col">
            <span className="text-3xl font-normal text-black leading-none">{stations.length}</span>
            <span className="text-[8px] font-normal uppercase tracking-wider text-black mt-1.5">Estaciones</span>
          </div>
          <div className="flex flex-col">
            <span className="text-3xl font-normal text-black leading-none">{reports.length}</span>
            <span className="text-[8px] font-normal uppercase tracking-wider text-black mt-1.5">Reportes</span>
          </div>
          <div className="flex flex-col">
            <span className="text-3xl font-normal text-black leading-none">{samples.length}</span>
            <span className="text-[8px] font-normal uppercase tracking-wider text-black mt-1.5">Registros</span>
          </div>
        </div>
        
        <Separator className="bg-neutral-200 h-[1px]" />
      </div>

      <ScrollArea className="h-[calc(100vh-280px)] pr-2">
        <div className="space-y-0">
          {stations.length === 0 ? (
            <div className="py-20 text-center opacity-40">
              <MapPin className="h-8 w-8 mx-auto mb-2" />
              <p className="text-[8px] uppercase tracking-widest text-black">Sin datos</p>
            </div>
          ) : (
            <Accordion type="multiple" className="w-full">
              {Object.entries(stationsByBasin).map(([basinCode, basinStations]) => (
                <AccordionItem key={basinCode} value={`basin-${basinCode}`} className="border-none">
                  <AccordionTrigger className="py-1 px-1 hover:no-underline hover:bg-neutral-50 rounded-none group transition-colors [&>svg]:hidden">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-black uppercase font-normal tracking-widest group-hover:text-primary transition-colors text-left">
                        {getBasinLabel(basinCode)} <span className="text-[9px] opacity-60 font-normal ml-1">({basinStations.length})</span>
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-0 pt-0 pl-3 border-l border-neutral-100 ml-2">
                    <Accordion type="multiple" className="w-full">
                      {basinStations.map((station: any) => {
                        const stationReports = getReportsByStation(station.id);
                        return (
                          <AccordionItem key={station.id} value={station.id} className="border-none">
                            <AccordionTrigger className="py-0.5 px-2 hover:no-underline hover:bg-neutral-50 rounded-none group transition-colors [&>svg]:hidden">
                              <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 bg-primary shrink-0" />
                                <span 
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectStation({
                                      lat: station.latitude,
                                      lon: station.longitude,
                                      stationId: station.id,
                                      name: station.name,
                                      basinCode: station.basinCode
                                    });
                                  }}
                                  className="text-[11px] text-black font-normal truncate text-left hover:underline underline-offset-4 decoration-primary/30 group-hover:text-primary transition-colors cursor-pointer focus:outline-none"
                                >
                                  {station.name} <span className="text-[9px] opacity-60 font-normal ml-1">({stationReports.length})</span>
                                </span>
                              </div>
                            </AccordionTrigger>

                            <AccordionContent className="pb-0 pl-4 border-l border-neutral-100 ml-2.5">
                              {stationReports.length === 0 ? (
                                <p className="text-[8px] uppercase text-neutral-300 italic py-1">Sin reportes</p>
                              ) : (
                                <Accordion type="multiple" className="w-full">
                                  {stationReports.map((report: any) => {
                                    const planillas = getPlanillasByReport(report.id);
                                    return (
                                      <AccordionItem key={report.id} value={report.id} className="border-none">
                                        <AccordionTrigger className="py-0.5 px-2 hover:no-underline hover:bg-neutral-50 rounded-none group transition-colors [&>svg]:hidden">
                                          <div className="flex items-center gap-2">
                                            <FileText className="h-2.5 w-2.5 text-neutral-400 group-hover:text-primary shrink-0" />
                                            <span 
                                              role="button"
                                              tabIndex={0}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                onSelectReport(station, report.id);
                                              }}
                                              className="text-[10px] text-black uppercase font-normal tracking-tight text-left hover:underline group-hover:text-primary transition-colors cursor-pointer focus:outline-none"
                                            >
                                              {report.oid} <span className="text-[9px] opacity-60 font-normal ml-1">({planillas.length})</span>
                                            </span>
                                          </div>
                                        </AccordionTrigger>
                                        
                                        <AccordionContent className="pb-1 pl-4 border-l border-neutral-100 ml-3">
                                          {planillas.length > 0 ? (
                                            <div className="space-y-0.5">
                                              {planillas.map((p) => (
                                                <div 
                                                  role="button"
                                                  tabIndex={0}
                                                  key={p.formId} 
                                                  onClick={() => onSelectPlanilla(station, report.id, p.formId, p.templateId)}
                                                  className="flex items-center gap-1.5 text-[9px] text-black uppercase hover:text-primary transition-colors group w-full text-left py-0.5 cursor-pointer focus:outline-none"
                                                >
                                                  <div className="w-1 h-1 rounded-full bg-primary/40 shrink-0 group-hover:bg-primary" />
                                                  <span className="hover:underline underline-offset-2 truncate">
                                                    {getProtocolLabel(p.templateId, p.medium)} • {formatDateShort(p.timestamp)} <span className="opacity-60 font-normal ml-1">({p.count})</span>
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          ) : (
                                            <p className="text-[8px] text-neutral-300 uppercase italic">Sin planillas</p>
                                          )}
                                        </AccordionContent>
                                      </AccordionItem>
                                    );
                                  })}
                                </Accordion>
                              )}
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                    </Accordion>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export function DataEntryForm({ 
  selectedPoint,
  onStationCreated,
  onPointUpdate,
  onDeselect,
  onActiveViewChange
}: { 
  selectedPoint: SelectedPoint | null;
  onStationCreated: (id: string, name: string) => void;
  onPointUpdate: (point: SelectedPoint) => void;
  onDeselect: () => void;
  onActiveViewChange?: (view: FormView) => void;
}) {
  const { toast } = useToast();
  const db = useFirestore();
  const storage = useStorage();
  const { user } = useUser();
  const [isGeneratingName, setIsGeneratingName] = useState(false);
  const [isStartingReport, setIsStartingReport] = useState(false);
  const [isDeletingStation, setIsDeletingStation] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [activeView, setActiveView] = useState<FormView>('summary');
  const [currentReportId, setCurrentReportId] = useState<string | null>(null);
  const [activeFormId, setActiveFormId] = useState<string | null>(null);
  
  const [trelloProjects, setTrelloProjects] = useState<string[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [projectSearch, setProjectSearch] = useState<string>('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('manual');

  const [editLat, setEditLat] = useState('');
  const [editLon, setEditLon] = useState('');

  const [deletingPlanilla, setDeletingPlanilla] = useState<{fid: string, label: string} | null>(null);
  const [isDeletingPlanilla, setIsDeletingPlanilla] = useState(false);

  const lastPointKeyRef = useRef<string | null>(null);
  const isInitialLoadRef = useRef(true);

  const isAdmin = useMemo(() => isUserAdmin(user?.email || null), [user?.email]);

  useEffect(() => {
    onActiveViewChange?.(activeView);
  }, [activeView, onActiveViewChange]);

  const customTemplatesQuery = useMemo(() => {
    if (!db || !user) return null;
    return query(collection(db, 'custom_templates'));
  }, [db, user]);
  const { data: customTemplates } = useCollection(customTemplatesQuery);

  const currentReportSamplesQuery = useMemo(() => {
    if (!db || !user || !currentReportId) return null;
    return query(collection(db, 'samples'), where('reportId', '==', currentReportId));
  }, [db, user, currentReportId]);
  const { data: currentReportSamples } = useCollection(currentReportSamplesQuery);

  const reportRef = useMemo(() => {
    if (!db || !currentReportId) return null;
    return doc(db, 'reports', currentReportId);
  }, [db, currentReportId]);
  const { data: currentReportData } = useDoc(reportRef);

  const [reportEditDesc, setReportEditDesc] = useState('');

  useEffect(() => {
    if (currentReportData) {
      if (currentReportData.trelloCardName && !selectedProject) {
        setSelectedProject(currentReportData.trelloCardName);
        setProjectSearch(currentReportData.trelloCardName);
      }
      setReportEditDesc(currentReportData.description || '');
    }
  }, [currentReportData]);

  const existingPlanillas = useMemo(() => {
    const planillasMap = new Map<string, { formId: string, medium: string, userEmail?: string, timestamp?: any, count: number, protocol?: string }>();
    currentReportSamples.forEach((s: any) => {
      const fId = s.formId || 'legacy';
      const medium = s.medium || 'otro';
      
      const existing = planillasMap.get(fId);
      
      let detectedProtocol = undefined;
      if (medium === 'suelo') {
        if (s.analyte === 'sondeoNumero' || s.parameterType === 'Estratigrafía') detectedProtocol = 'suelo_geotecnia';
        else if (s.analyte === 'Material_Originario' || s.analyte === 'Paisaje') detectedProtocol = 'suelo_edafologico';
      } else if (medium === 'agua_superficial') {
        detectedProtocol = 'agua_superficial';
      } else if (medium === 'agua_subterranea') {
        detectedProtocol = 'agua_subterranea';
      }

      if (!existing) {
        planillasMap.set(fId, { 
          formId: fId, 
          medium: medium, 
          userEmail: s.userEmail, 
          timestamp: s.timestamp,
          count: 1,
          protocol: detectedProtocol
        });
      } else {
        existing.count += 1;
        if (s.timestamp && (!existing.timestamp || s.timestamp.toMillis() > existing.timestamp.toMillis())) {
          existing.timestamp = s.timestamp;
          existing.userEmail = s.userEmail;
        }
        if (detectedProtocol && !existing.protocol) {
          existing.protocol = detectedProtocol;
        }
      }
    });
    return Array.from(planillasMap.values());
  }, [currentReportSamples]);

  useEffect(() => {
    if (selectedPoint && isInitialLoadRef.current) {
      const savedState = localStorage.getItem('dea_form_state');
      const savedPointStr = localStorage.getItem('dea_selected_point');
      
      if (savedState && savedPointStr) {
        try {
          const savedPoint = JSON.parse(savedPointStr);
          if (savedPoint.lat === selectedPoint.lat && savedPoint.lon === selectedPoint.lon) {
            const parsed = JSON.parse(savedState);
            setActiveView(parsed.activeView || 'summary');
            setCurrentReportId(parsed.currentReportId || null);
            setActiveFormId(parsed.activeFormId || null);
            setSelectedProject(parsed.selectedProject || '');
            setSelectedTemplate(parsed.selectedTemplate || 'manual');
          } else {
            setActiveView(selectedPoint.stationId ? 'summary' : 'create-station');
          }
        } catch (e) {
          setActiveView(selectedPoint.stationId ? 'summary' : 'create-station');
        }
      } else {
        setActiveView(selectedPoint.stationId ? 'summary' : 'create-station');
      }
      
      if (!selectedPoint.stationId) {
        setEditLat(selectedPoint.lat.toString());
        setEditLon(selectedPoint.lon.toString());
      }
      
      lastPointKeyRef.current = `${selectedPoint.lat}-${selectedPoint.lon}-${selectedPoint.stationId}`;
      isInitialLoadRef.current = false;
    }
  }, [selectedPoint]);

  useEffect(() => {
    if (!selectedPoint) {
      lastPointKeyRef.current = null;
      return;
    }

    const currentKey = `${selectedPoint.lat}-${selectedPoint.lon}-${selectedPoint.stationId}`;

    if (!isInitialLoadRef.current && lastPointKeyRef.current !== currentKey) {
      if (activeView !== 'create-station' && activeView !== 'edit-station') {
        if (selectedPoint.stationId) {
          setActiveView('summary');
        } else {
          setActiveView('create-station');
          setEditLat(selectedPoint.lat.toString());
          setEditLon(selectedPoint.lon.toString());
        }
        setCurrentReportId(null);
        setActiveFormId(null);
        setSelectedProject('');
        setProjectSearch('');
        setSelectedTemplate('manual');
      } else {
        setEditLat(selectedPoint.lat.toString());
        setEditLon(selectedPoint.lon.toString());
      }
      
      lastPointKeyRef.current = currentKey;
    }
  }, [selectedPoint?.lat, selectedPoint?.lon, selectedPoint?.stationId, activeView]);

  useEffect(() => {
    if (selectedPoint) {
      const state = { activeView, currentReportId, activeFormId, selectedProject, selectedTemplate };
      localStorage.setItem('dea_form_state', JSON.stringify(state));
    }
  }, [activeView, currentReportId, activeFormId, selectedProject, selectedTemplate, selectedPoint]);

  useEffect(() => {
    const stored = localStorage.getItem('trello_cards_sync');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setTrelloProjects(parsed.cards || []);
      } catch (e) {}
    }
  }, []);

  const filteredTrelloProjects = useMemo(() => {
    const transformed = trelloProjects.map(p => {
      const match = p.match(/\((.*?)\)$/);
      const display = match ? `${match[0]} ${p.replace(match[0], '').trim()}` : p;
      return { original: p, display };
    });

    let filtered = transformed;
    if (projectSearch) {
      const searchLower = projectSearch.toLowerCase();
      filtered = transformed.filter(item => 
        item.display.toLowerCase().includes(searchLower) ||
        item.original.toLowerCase().includes(searchLower)
      );
    }

    return filtered.sort((a, b) => a.display.localeCompare(b.display));
  }, [trelloProjects, projectSearch]);

  const stationRef = useMemo(() => {
    if (!db || !selectedPoint?.stationId) return null;
    return doc(db, 'stations', selectedPoint.stationId);
  }, [db, selectedPoint?.stationId]);

  const { data: stationDetails } = useDoc(stationRef);

  const stationForm = useForm<StationValues>({
    resolver: zodResolver(stationSchema),
    defaultValues: { name: '', description: '' },
  });

  useEffect(() => {
    if (stationDetails) {
      stationForm.reset({
        name: (stationDetails as any).name || '',
        description: (stationDetails as any).description || '',
      });
      setEditLat((stationDetails as any).latitude.toString());
      setEditLon((stationDetails as any).longitude.toString());
    }
  }, [stationDetails, stationForm]);

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '---';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  useEffect(() => {
    if (selectedPoint && !selectedPoint.stationId && selectedPoint.basinCode) {
      const generateNextName = async () => {
        setIsGeneratingName(true);
        const prefix = `EM${selectedPoint.basinCode}`;
        
        try {
          const stationsCol = collection(db, 'stations');
          const q = query(
            stationsCol,
            where('name', '>=', prefix),
            where('name', '<=', prefix + '\uf8ff'),
            orderBy('name', 'desc'),
            limit(1)
          );
          
          const querySnapshot = await getDocs(q);
          let nextNumber = 1;

          if (!querySnapshot.empty) {
            const lastStation = querySnapshot.docs[0].data();
            const lastName = lastStation.name as string;
            const numberPart = lastName.substring(prefix.length);
            const parsed = parseInt(numberPart, 10);
            if (!isNaN(parsed)) {
              nextNumber = parsed + 1;
            }
          }

          const formattedName = `${prefix}${nextNumber.toString().padStart(4, '0')}`;
          stationForm.setValue('name', formattedName);
        } catch (error) {
          stationForm.setValue('name', `${prefix}0001`);
        } finally {
          setIsGeneratingName(false);
        }
      };

      generateNextName();
    }
  }, [selectedPoint?.lat, selectedPoint?.lon, selectedPoint?.basinCode, db, stationForm]);

  const handleManualCoordChange = (type: 'lat' | 'lon', val: string) => {
    if (type === 'lat') {
      setEditLat(val);
      const lat = parseFloat(val);
      if (!isNaN(lat) && selectedPoint) {
        onPointUpdate({ ...selectedPoint, lat });
      }
    } else {
      setEditLon(val);
      const lon = parseFloat(val);
      if (!isNaN(lon) && selectedPoint) {
        onPointUpdate({ ...selectedPoint, lon });
      }
    }
  };

  const handleCaptureGPS = async () => {
    if (!navigator.geolocation) {
      toast({
        variant: "destructive",
        title: "GPS no disponible",
        description: "Tu navegador no soporta geolocalización.",
      });
      return;
    }

    toast({ title: "Obteniendo ubicación...", description: "Por favor, esperá un momento." });
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setEditLat(latitude.toString());
        setEditLon(longitude.toString());
        
        let detectedBasin = '';
        const features = BASIN_CODES_DATA.features;
        for (const feature of features) {
          const geometry = feature.geometry;
          if (geometry.type === 'Polygon') {
            if (isPointInPoly([longitude, latitude], geometry.coordinates as any)) {
              detectedBasin = feature.properties.CODIGO || '';
              break;
            }
          } else if (geometry.type === 'MultiPolygon') {
            for (const poly of geometry.coordinates) {
              if (isPointInPoly([longitude, latitude], poly as any)) {
                detectedBasin = feature.properties.CODIGO || '';
                break;
              }
            }
          }
        }

        if (selectedPoint) {
          onPointUpdate({ 
            ...selectedPoint, 
            lat: latitude, 
            lon: longitude,
            basinCode: detectedBasin
          });
        }
        
        toast({ 
          title: "Ubicación capturada", 
          description: `Cuenca detectada: ${detectedBasin || 'Desconocida'}. Coordenadas: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}` 
        });
      },
      (error) => {
        console.error("GPS Error", error);
        toast({
          variant: "destructive",
          title: "Error de GPS",
          description: "No se pudo obtener la ubicación. Verificá los permisos de tu navegador.",
        });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const handleCreateStation = (data: StationValues) => {
    if (!selectedPoint) return;
    
    const finalLat = parseFloat(editLat);
    const finalLon = parseFloat(editLon);

    if (isNaN(finalLat) || isNaN(finalLon)) {
      toast({
        variant: "destructive",
        title: "Error de coordenadas",
        description: "Por favor ingresá valores numéricos válidos para latitud y longitud.",
      });
      return;
    }

    const newStationRef = doc(collection(db, 'stations'));
    const stationData = {
      name: data.name,
      latitude: finalLat,
      longitude: finalLon,
      description: data.description || '',
      basinCode: selectedPoint.basinCode || '',
      userId: user?.uid,
      userEmail: user?.email,
      createdAt: serverTimestamp(),
    };

    setDoc(newStationRef, stationData)
      .then(() => {
        onStationCreated(newStationRef.id, data.name);
        setActiveView('summary');
        toast({
          title: "Estación registrada",
          description: `Se guardó el punto: ${data.name}`,
        });
      })
      .catch(async (error) => {
        const permissionError = new FirestorePermissionError({
          path: newStationRef.path,
          operation: 'create',
          requestResourceData: stationData,
        });
        errorEmitter.emit('permission-error', permissionError);
      });
  };

  const handleUpdateStation = (data: StationValues) => {
    if (!selectedPoint?.stationId) return;
    
    const finalLat = parseFloat(editLat);
    const finalLon = parseFloat(editLon);

    if (isNaN(finalLat) || isNaN(finalLon)) {
      toast({
        variant: "destructive",
        title: "Error de coordenadas",
        description: "Por favor ingresá valores numéricos válidos para latitud y longitud.",
      });
      return;
    }

    const currentStationRef = doc(db, 'stations', selectedPoint.stationId);
    const updateData = {
      name: data.name,
      latitude: finalLat,
      longitude: finalLon,
      description: data.description || '',
    };

    updateDoc(currentStationRef, updateData)
      .then(() => {
        onPointUpdate({
          ...selectedPoint,
          lat: finalLat,
          lon: finalLon,
          name: data.name,
        });
        setActiveView('summary');
        toast({
          title: "Estación actualizada",
          description: `Se guardaron los cambios de: ${data.name}`,
        });
      })
      .catch(async (error) => {
        const permissionError = new FirestorePermissionError({
          path: currentStationRef.path,
          operation: 'update',
          requestResourceData: updateData,
        });
        errorEmitter.emit('permission-error', permissionError);
      });
  };

  const handleDeleteStation = async () => {
    if (!selectedPoint?.stationId || !db) return;
    setIsDeletingStation(true);
    try {
      await deleteDoc(doc(db, 'stations', selectedPoint.stationId));
      onDeselect();
      setActiveView('summary');
      toast({ title: "Estación eliminada", description: "El punto ha sido removido del sistema." });
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Error", description: "No se pudo eliminar la estación." });
    } finally {
      setIsDeletingStation(false);
      setShowDeleteDialog(false);
    }
  };

  const handleConfirmTemplate = async () => {
    if (!selectedPoint) return;
    setIsStartingReport(true);
    
    try {
      const basinCode = (stationDetails as any)?.basinCode || selectedPoint.basinCode || 'XXX';
      const prefix = `PL${basinCode}`;
      let nextNumber = 1;

      const samplesCol = collection(db, 'samples');
      const q = query(
        samplesCol,
        where('formId', '>=', prefix),
        where('formId', '<=', prefix + '\uf8ff'),
        orderBy('formId', 'desc'),
        limit(1)
      );
      
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const lastFormId = snapshot.docs[0].data().formId as string;
        const numPart = lastFormId.substring(prefix.length);
        const lastNum = parseInt(numPart, 10);
        if (!isNaN(lastNum)) {
          nextNumber = lastNum + 1;
        }
      }

      const newFormId = `${prefix}${nextNumber.toString().padStart(4, '0')}`;
      
      setActiveFormId(newFormId);
      if (currentReportId) {
        setActiveView('report-entry');
      } else {
        await handleStartReport(newFormId);
      }
    } catch (e) {
      console.error("Error generating Planilla OID", e);
      const fallbackId = `PL-ERR-${crypto.randomUUID().substring(0,8)}`;
      setActiveFormId(fallbackId);
      if (currentReportId) {
        setActiveView('report-entry');
      } else {
        await handleStartReport(fallbackId);
      }
    } finally {
      setIsStartingReport(false);
    }
  };

  const handleStartReport = async (formId: string) => {
    if (!selectedPoint?.stationId || !user) return;

    setIsStartingReport(true);

    const basinCode = (stationDetails as any)?.basinCode || selectedPoint.basinCode || 'XXX';
    const prefix = `RM${basinCode}`;
    let nextNumber = 1;

    try {
      const reportsCol = collection(db, 'reports');
      const q = query(
        reportsCol,
        where('oid', '>=', prefix),
        where('oid', '<=', prefix + '\uf8ff'),
        orderBy('oid', 'desc'),
        limit(1)
      );
      
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const lastOid = snapshot.docs[0].data().oid as string;
        const numPart = lastOid.substring(prefix.length);
        const lastNum = parseInt(numPart, 10);
        if (!isNaN(lastNum)) {
          nextNumber = lastNum + 1;
        }
      }

      const oid = `${prefix}${nextNumber.toString().padStart(4, '0')}`;

      const reportData = {
        oid,
        stationId: selectedPoint.stationId,
        trelloCardName: selectedProject || '',
        description: reportEditDesc || '',
        createdAt: serverTimestamp(),
        createdByEmail: user.email,
        status: 'open',
        editors: [user.email]
      };

      const docRef = await addDoc(reportsCol, reportData);
      setCurrentReportId(docRef.id);
      setActiveView('report-entry');
      toast({
        title: "Reporte iniciado",
        description: `Se generó el OID: ${oid}`,
      });
    } catch (e) {
      console.error("Error creating report OID", e);
    } finally {
      setIsStartingReport(false);
    }
  };

  const handleSaveReportEdits = async () => {
    if (!reportRef) return;
    const updateData = {
      trelloCardName: selectedProject || '',
      description: reportEditDesc || '',
    };
    updateDoc(reportRef, updateData)
      .then(() => {
        toast({ title: "Reporte actualizado", description: "Cambios guardados con éxito." });
      })
      .catch(console.error);
  };

  const handleOpenExistingReport = (reportId: string) => {
    setCurrentReportId(reportId);
    setActiveView('select-template'); 
  };

  const handleReopenPlanilla = (planilla: { formId: string, medium: string, protocol?: string }) => {
    setActiveFormId(planilla.formId);
    let templateId = 'manual';
    
    if (planilla.protocol) {
      templateId = planilla.protocol;
    } else {
      const foundTemplate = MONITORING_TEMPLATES.find(t => t.medium === planilla.medium);
      if (foundTemplate) templateId = foundTemplate.id;
    }
    
    setSelectedTemplate(templateId);
    setActiveView('report-entry');
  };

  const handleDeletePlanilla = async () => {
    if (!deletingPlanilla || !db || !currentReportId) return;
    setIsDeletingPlanilla(true);
    try {
      const q = query(
        collection(db, 'samples'), 
        where('reportId', '==', currentReportId),
        where('formId', '==', deletingPlanilla.fid)
      );
      const snap = await getDocs(q);

      for (const sDoc of snap.docs) {
        await deleteDoc(doc(db, 'samples', sDoc.id));
      }

      if (storage) {
        const planillaStorageRef = ref(storage, `reports/${currentReportId}/${deletingPlanilla.fid}`);
        try {
          const listRes = await listAll(planillaStorageRef);
          for (const item of listRes.items) {
            await deleteObject(item);
          }
        } catch (storageErr) {}
      }

      toast({ title: "Planilla borrada", description: "Se eliminaron los datos y las evidencias visuales." });
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Error", description: "No se pudo borrar la planilla." });
    } finally {
      setIsDeletingPlanilla(false);
      setDeletingPlanilla(null);
    }
  };

  const handleExplorerSelectStation = (point: SelectedPoint) => {
    onPointUpdate(point);
    lastPointKeyRef.current = `${point.lat}-${point.lon}-${point.stationId}`;
    setActiveView('summary');
  };

  const handleExplorerSelectReport = (station: any, reportId: string) => {
    const point = {
      lat: station.latitude,
      lon: station.longitude,
      stationId: station.id,
      name: station.name,
      basinCode: station.basinCode
    };
    onPointUpdate(point);
    lastPointKeyRef.current = `${point.lat}-${point.lon}-${point.stationId}`;
    setCurrentReportId(reportId);
    setActiveView('select-template');
  };

  const handleExplorerSelectPlanilla = (station: any, reportId: string, formId: string, templateId: string) => {
    const point = {
      lat: station.latitude,
      lon: station.longitude,
      stationId: station.id,
      name: station.name,
      basinCode: station.basinCode
    };
    onPointUpdate(point);
    lastPointKeyRef.current = `${point.lat}-${point.lon}-${point.stationId}`;
    setCurrentReportId(reportId);
    setActiveFormId(formId);
    setSelectedTemplate(templateId);
    setActiveView('report-entry');
  };

  if (!selectedPoint) {
    return (
      <DataExplorer 
        onSelectStation={handleExplorerSelectStation} 
        onSelectReport={handleExplorerSelectReport}
        onSelectPlanilla={handleExplorerSelectPlanilla}
      />
    );
  }

  const getProtocolLabel = (protocolId: string | undefined, medium: string) => {
    if (protocolId === 'suelo_geotecnia') return 'Mecánica de suelos (MS-001)';
    if (protocolId === 'suelo_edafologico') return 'Perfil Edafológico (PE-001)';
    if (medium === 'agua_superficial') return 'Agua Superficial (AS-001)';
    if (medium === 'agua_subterranea') return 'Freatímetro (FTA-001)';
    return medium.replace('_', ' ');
  };

  if (activeView === 'report-entry' && currentReportId && activeFormId) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setActiveView('select-template')} className="mb-2 text-black font-normal">
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver a planillas
        </Button>
        <SamplingReportForm 
          reportId={currentReportId} 
          formId={activeFormId}
          stationId={selectedPoint.stationId!} 
          onClose={() => setActiveView('summary')} 
          templateId={selectedTemplate}
        />
      </div>
    );
  }

  if (activeView === 'consult' && selectedPoint.stationId) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setActiveView('summary')} className="mb-2 text-black font-normal">
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver al resumen
        </Button>
        <ReportList stationId={selectedPoint.stationId} onOpenReport={handleOpenExistingReport} />
      </div>
    );
  }

  if (activeView === 'select-project' && selectedPoint.stationId) {
    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
        <Button variant="ghost" size="sm" onClick={() => setActiveView('summary')} className="mb-2 text-black font-normal">
          <ArrowLeft className="mr-2 h-4 w-4" /> Cancelar
        </Button>
        <Card className="border-t-4 border-t-primary shadow-lg overflow-hidden rounded-none">
          <CardHeader className="pb-4">
            <CardTitle className="text-md flex items-center gap-2 text-black font-normal uppercase tracking-tight">
              <Briefcase className="h-5 w-5 text-black" />
              1. Seleccionar Proyecto (Opcional)
            </CardTitle>
            <CardDescription className="text-xs text-neutral-600">Asociá este nuevo reporte a un proyecto activo de Trello o continuá sin proyecto.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <Label className="text-[10px] uppercase font-normal text-black flex items-center gap-1.5 px-1">Proyecto de Trello</Label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-black" />
                <Input 
                  placeholder="Buscá el proyecto o código..." 
                  className="pl-9 h-11 text-xs font-normal border-input focus-visible:ring-primary/50 text-black rounded-none"
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                />
              </div>
              
              <ScrollArea className="h-[200px] border rounded-none p-1 bg-white">
                <div className="space-y-1">
                  {filteredTrelloProjects.length === 0 ? (
                    <div className="p-4 text-center text-xs text-neutral-600 italic">No se encontraron proyectos.</div>
                  ) : (
                    filteredTrelloProjects.map((item) => (
                      <button
                        key={item.original}
                        onClick={() => {
                          setSelectedProject(item.original);
                          setProjectSearch(item.display);
                        }}
                        className={cn(
                          "w-full text-left px-3 py-2.5 rounded-none text-[11px] font-normal transition-colors flex items-start justify-between gap-2",
                          selectedProject === item.original 
                            ? "bg-primary text-white" 
                            : "hover:bg-primary/5 text-black border border-transparent"
                        )}
                      >
                        <span className="flex-1 break-words">{item.display}</span>
                        {selectedProject === item.original && <Check className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
            <Button 
              className="w-full h-12 text-sm font-normal uppercase tracking-widest bg-primary hover:bg-primary/90 shadow-md text-white rounded-none" 
              onClick={() => setActiveView('select-template')}
            >
              Siguiente: Elegir Planilla <ArrowLeft className="ml-2 h-4 w-4 rotate-180" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (activeView === 'select-template' && selectedPoint.stationId) {
    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
        <Button variant="ghost" size="sm" onClick={() => currentReportId ? setActiveView('summary') : setActiveView('select-project')} className="mb-2 text-black font-normal">
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver atrás
        </Button>
        <Card className="border-t-4 border-t-accent shadow-lg overflow-hidden rounded-none">
          <CardHeader className="pb-4">
            <CardTitle className="text-md flex items-center gap-2 text-black font-normal uppercase tracking-tight">
              <LayoutList className="h-5 w-5 text-black" />
              {currentReportId ? `Reporte: ${currentReportData?.oid || 'Cargando...'}` : '2. Elegir Planilla de Carga'}
            </CardTitle>
            <CardDescription className="text-xs text-neutral-600">
              {currentReportId ? 'Gestión de planillas y edición de datos del reporte.' : 'Seleccioná el protocolo de monitoreo para pre-cargar los parámetros.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {currentReportId && (
              <Accordion type="single" collapsible className="w-full border rounded-none overflow-hidden">
                <AccordionItem value="edit-report" className="border-none">
                  <AccordionTrigger className="px-4 py-2 hover:bg-neutral-50 hover:no-underline text-xs font-normal uppercase text-black">
                    <div className="flex items-center gap-2"><Settings className="h-4 w-4" /> Ajustes del Reporte</div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 py-3 bg-neutral-50 border-t space-y-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase font-normal text-black">Proyecto Asociado</Label>
                      <Select 
                        value={selectedProject} 
                        onValueChange={(val) => {
                          setSelectedProject(val);
                          setProjectSearch(val);
                        }}
                      >
                        <SelectTrigger className="h-10 text-xs rounded-none bg-white">
                          <SelectValue placeholder="Sin proyecto" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sin-proyecto" className="text-xs">Sin Proyecto</SelectItem>
                          {trelloProjects.map((p) => (
                            <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase font-normal text-black">Descripción / Notas</Label>
                      <Textarea 
                        placeholder="Notas sobre el monitoreo..."
                        className="text-xs rounded-none min-h-[80px] bg-white"
                        value={reportEditDesc}
                        onChange={(e) => setReportEditDesc(e.target.value)}
                      />
                    </div>
                    <Button 
                      className="w-full h-10 bg-black text-white rounded-none text-[10px] font-normal uppercase tracking-widest"
                      onClick={handleSaveReportEdits}
                    >
                      Guardar Ajustes
                    </Button>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}

            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-normal text-black flex items-center gap-1.5 px-1">Nueva Planilla</Label>
              <div className="flex gap-2">
                <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                  <SelectTrigger className="h-11 flex-1 text-xs font-normal border-accent/20 bg-accent/5 text-black rounded-none">
                    <SelectValue placeholder="Elegí un protocolo..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual" className="text-xs font-normal">Carga Manual (uno por uno)</SelectItem>
                    <SelectItem value="personalizada" className="text-xs font-normal text-black flex items-center gap-1">
                      <Star className="h-3 w-3 inline mr-1 fill-accent" /> Crear Planilla Personalizada
                    </SelectItem>
                    {customTemplates && customTemplates.length > 0 && (
                      <>
                        <Separator className="my-1" />
                        <div className="px-2 py-1.5 text-[10px] font-normal text-black uppercase">Tus Planillas</div>
                        {customTemplates.map((ct: any) => (
                          <SelectItem key={ct.id} value={`custom_${ct.id}`} className="text-xs">
                            {ct.name}
                          </SelectItem>
                        ))}
                      </>
                    )}
                    <Separator className="my-1" />
                    <div className="px-2 py-1.5 text-[10px] font-normal text-black uppercase">Plantillas del Sistema</div>
                    {MONITORING_TEMPLATES.map((t) => (
                      <SelectItem key={t.id} value={t.id} className="text-xs">{t.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button 
                  className="h-11 px-4 bg-primary hover:bg-primary/90 font-normal uppercase tracking-widest text-white rounded-none" 
                  disabled={isStartingReport} 
                  onClick={handleConfirmTemplate}
                >
                  {isStartingReport ? <Loader2 className="h-4 w-4 animate-spin" /> : "INICIAR CARGA"}
                </Button>
              </div>
            </div>

            {currentReportId && existingPlanillas.length > 0 && (
              <div className="space-y-3 pt-2">
                <Label className="text-[10px] uppercase font-normal text-black flex items-center gap-1.5 px-1">Planillas en este reporte (Editar)</Label>
                <div className="grid grid-cols-1 gap-2">
                  {existingPlanillas.map((p) => {
                    const protocolLabel = getProtocolLabel(p.protocol, p.medium);
                    return (
                      <div key={p.formId} className="group relative">
                        <button
                          onClick={() => handleReopenPlanilla(p)}
                          className="w-full flex items-center justify-between p-3 rounded-none bg-neutral-100 border border-neutral-300 hover:bg-primary/5 hover:border-primary/30 transition-all"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-1.5 rounded-none bg-white shadow-sm border">
                              <FileText className="h-3.5 w-3.5 text-black" />
                            </div>
                            <div className="text-left">
                              <p className="text-xs text-black uppercase tracking-tight font-normal">{p.formId}</p>
                              <div className="flex flex-col mt-0.5">
                                <p className="text-[9px] text-black uppercase font-normal">
                                    {protocolLabel} <span className="opacity-60 font-normal ml-1">({p.count})</span>
                                </p>
                                <div className="flex items-center gap-2 text-[9px] text-black font-normal uppercase tracking-tighter mt-1">
                                  <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" /> {formatDate(p.timestamp)}</span>
                                  <span className="flex items-center gap-0.5"><User className="h-2.5 w-2.5" /> {p.userEmail?.split('@')[0]}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-black group-hover:translate-x-1 transition-all" />
                        </button>
                        {isAdmin && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeletingPlanilla({ fid: p.formId, label: protocolLabel }); }}
                            className="absolute -top-2 -right-2 h-6 w-6 bg-destructive text-white rounded-full flex items-center justify-center shadow-md z-10"
                            title="BORRAR PLANILLA"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {deletingPlanilla && (
          <AdminDeleteDialog 
            open={!!deletingPlanilla}
            onOpenChange={(o) => !o && setDeletingPlanilla(null)}
            onConfirm={handleDeletePlanilla}
            title={`Borrar Planilla ${deletingPlanilla.label}`}
            description={`Vas a eliminar todos los registros de la planilla ${deletingPlanilla.fid} y sus fotos.`}
            isLoading={isDeletingPlanilla}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {selectedPoint.stationId ? (
        <Card className="border-primary/20 bg-primary/5 shadow-sm overflow-hidden rounded-none">
          <CardHeader className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-black shrink-0" />
                  <CardTitle className="text-lg font-normal text-black leading-none tracking-tight">{selectedPoint.name}</CardTitle>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => setActiveView('edit-station')}
                    className="h-6 w-6 ml-1 text-black hover:bg-primary/10 transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {isAdmin && (
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => setShowDeleteDialog(true)}
                      className="h-6 w-6 ml-1 text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <div className="space-y-0.5 ml-6">
                  <CardDescription className="text-[10px] font-normal text-black font-body">
                    {selectedPoint.lat.toFixed(6)}, {selectedPoint.lon.toFixed(6)}
                  </CardDescription>
                  <CardDescription className="text-[10px] font-normal text-black font-body">Creación: {formatDate(stationDetails?.createdAt)}</CardDescription>
                  {stationDetails?.description && (
                    <CardDescription className="text-[11px] font-normal text-black mt-2 italic leading-relaxed">
                      {stationDetails.description}
                    </CardDescription>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => { onDeselect(); setActiveView('summary'); }} className="h-8 w-8 -mt-1 -mr-1 text-black hover:text-destructive hover:bg-destructive/10 transition-colors"><X className="h-4 w-4" /></Button>
            </div>
          </CardHeader>
          <AdminDeleteDialog 
            open={showDeleteDialog}
            onOpenChange={setShowDeleteDialog}
            onConfirm={handleDeleteStation}
            title={`Eliminar Estación ${selectedPoint.name}`}
            description="Estás por borrar una ubicación fija de monitoreo."
            isLoading={isDeletingStation}
          />
        </Card>
      ) : (
        <Card className="border-primary/20 bg-primary/5 shadow-sm rounded-none">
          <CardHeader className="p-3">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-md flex items-center gap-2 text-black font-normal uppercase tracking-tight"><PlusCircle className="h-5 w-5" />NUEVO PUNTO</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => { onDeselect(); setActiveView('summary'); }} className="h-8 w-8 -mt-1 -mr-1 text-black hover:text-destructive hover:bg-destructive/10 transition-colors"><X className="h-4 w-4" /></Button>
            </div>
          </CardHeader>
        </Card>
      )}

      {(activeView === 'create-station' || activeView === 'edit-station') && (
        <Card className="border-none bg-transparent shadow-none animate-in fade-in slide-in-from-bottom-2 duration-300 overflow-hidden rounded-none">
          <CardContent className="p-0 space-y-2">
            <form onSubmit={stationForm.handleSubmit(activeView === 'edit-station' ? handleUpdateStation : handleCreateStation)} className="space-y-4">
              <div className="space-y-0">
                <div className="flex items-center justify-between py-2 border-b border-neutral-200">
                  <Label htmlFor="station-name" className="text-[10px] font-normal uppercase text-black shrink-0">ETIQUETA</Label>
                  <div className="relative flex-1 flex justify-end">
                    <Input 
                      id="station-name" 
                      placeholder="EMA0000" 
                      {...stationForm.register('name')} 
                      className="text-black font-body text-[12px] h-8 border-none shadow-none focus-visible:ring-0 rounded-none bg-transparent text-right pr-0 w-full" 
                    />
                    {isGeneratingName && <div className="absolute right-0 top-2"><Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-400" /></div>}
                  </div>
                </div>

                <div className="flex items-center justify-between py-2 border-b border-neutral-200">
                  <Label className="text-[10px] font-normal uppercase text-black shrink-0">LATITUD</Label>
                  <Input 
                    type="text" 
                    value={editLat} 
                    onChange={(e) => handleManualCoordChange('lat', e.target.value)}
                    className="h-8 text-[12px] font-body text-black border-none shadow-none focus-visible:ring-0 rounded-none bg-transparent text-right pr-0 w-full"
                  />
                </div>

                <div className="flex items-center justify-between py-2 border-b border-neutral-200">
                  <Label className="text-[10px] font-normal uppercase text-black shrink-0">LONGITUD</Label>
                  <Input 
                    type="text" 
                    value={editLon} 
                    onChange={(e) => handleManualCoordChange('lon', e.target.value)}
                    className="h-8 text-[12px] font-body text-black border-none shadow-none focus-visible:ring-0 rounded-none bg-transparent text-right pr-0 w-full"
                  />
                </div>

                <div className="py-3 border-b border-neutral-200 space-y-2">
                  <Label htmlFor="description" className="text-[10px] font-normal uppercase text-black">DESCRIPCIÓN / NOTAS</Label>
                  <Textarea 
                    id="description" 
                    {...stationForm.register('description')}
                    placeholder="Detalles sobre el acceso, entorno o estado del punto..."
                    className="min-h-[80px] text-[12px] font-body text-black border-neutral-200 focus-visible:ring-primary/50 rounded-none bg-neutral-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleCaptureGPS}
                  className="w-full h-11 border-primary/20 text-primary hover:bg-primary/5 font-normal uppercase tracking-widest text-[10px] rounded-none"
                >
                  <Navigation className="mr-2 h-4 w-4" /> CAPTURAR MI UBICACIÓN (GPS)
                </Button>
                <div className="flex gap-2">
                   {activeView === 'edit-station' && (
                     <Button 
                       type="button" 
                       variant="ghost"
                       onClick={() => setActiveView('summary')}
                       className="flex-1 h-12 text-black font-normal uppercase tracking-widest text-[10px] rounded-none border border-neutral-300"
                     >
                       CANCELAR
                     </Button>
                   )}
                   <Button 
                     type="submit" 
                     className="flex-[2] h-12 bg-primary hover:bg-primary/90 text-white font-normal uppercase tracking-widest shadow-md rounded-none" 
                     disabled={isGeneratingName}
                   >
                     <Send className="mr-2 h-4 w-4" /> {activeView === 'edit-station' ? 'ACTUALIZAR DATOS' : 'GUARDAR PUNTO'}
                   </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {activeView === 'summary' && selectedPoint.stationId && (
        <div className="space-y-3 pt-2">
          <Separator className="bg-neutral-200" />
          <div className="grid grid-cols-1 gap-2 pt-1">
            <Button 
              variant="outline"
              className="w-full h-14 text-md font-normal uppercase tracking-widest flex items-center gap-3 border-neutral-300 bg-neutral-100 text-black hover:bg-neutral-200 shadow-sm rounded-none" 
              onClick={() => setActiveView('consult')}
            >
              <Search className="h-6 w-6" /> REPORTES
            </Button>
            <Button 
              className="w-full h-14 text-md font-normal uppercase tracking-widest flex items-center gap-3 bg-primary hover:bg-primary/90 shadow-md text-white rounded-none" 
              onClick={() => {
                setCurrentReportId(null);
                setActiveView('select-project');
              }}
            >
              <FolderOpen className="h-6 w-6" /> Crear reporte
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
