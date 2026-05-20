'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { collection, doc, setDoc, serverTimestamp, query, where, orderBy, limit, getDocs, addDoc } from 'firebase/firestore';
import { useFirestore, useUser, useDoc, useCollection, errorEmitter, FirestorePermissionError } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { MapPin, Send, PlusCircle, Database, FileText, Search, Loader2, ArrowLeft, Pencil, Check, X, Briefcase, LayoutList, Star, ChevronRight, User, Clock } from 'lucide-react';
import { SelectedPoint } from '@/app/page';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { SamplingReportForm } from './sampling-report-form';
import { ReportList } from './report-list';
import { ReportDetail } from './report-detail';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';

const stationSchema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
});

type StationValues = z.infer<typeof stationSchema>;

type FormView = 'summary' | 'create-station' | 'report-entry' | 'consult' | 'report-view' | 'select-project' | 'select-template';

export function DataEntryForm({ 
  selectedPoint,
  onStationCreated,
  onPointUpdate,
  onDeselect
}: { 
  selectedPoint: SelectedPoint | null;
  onStationCreated: (id: string, name: string) => void;
  onPointUpdate: (point: SelectedPoint) => void;
  onDeselect: () => void;
}) {
  const { toast } = useToast();
  const db = useFirestore();
  const { user } = useUser();
  const [isGeneratingName, setIsGeneratingName] = useState(false);
  const [isStartingReport, setIsStartingReport] = useState(false);
  const [activeView, setActiveView] = useState<FormView>('summary');
  const [currentReportId, setCurrentReportId] = useState<string | null>(null);
  const [activeFormId, setActiveFormId] = useState<string | null>(null);
  const [viewingReportId, setViewingReportId] = useState<string | null>(null);
  
  const [trelloProjects, setTrelloProjects] = useState<string[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [projectSearch, setProjectSearch] = useState<string>('');
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('manual');

  const [isEditingCoords, setIsEditingCoords] = useState(false);
  const [editLat, setEditLat] = useState('');
  const [editLon, setEditLon] = useState('');

  const lastPointKeyRef = useRef<string | null>(null);
  const isInitialLoadRef = useRef(true);

  // Cargar plantillas del sistema y personalizadas
  const customTemplatesQuery = useMemo(() => {
    if (!db || !user) return null;
    return query(collection(db, 'custom_templates'));
  }, [db, user]);
  const { data: customTemplates } = useCollection(customTemplatesQuery);

  // Consulta de analitos del reporte actual para mostrar planillas ya registradas
  const currentReportSamplesQuery = useMemo(() => {
    if (!db || !user || !currentReportId) return null;
    return query(collection(db, 'samples'), where('reportId', '==', currentReportId));
  }, [db, user, currentReportId]);
  const { data: currentReportSamples } = useCollection(currentReportSamplesQuery);

  const existingPlanillas = useMemo(() => {
    const planillasMap = new Map<string, { formId: string, medium: string, userEmail?: string, timestamp?: any }>();
    currentReportSamples.forEach((s: any) => {
      const fId = s.formId || 'legacy';
      const medium = s.medium || 'otro';
      
      const existing = planillasMap.get(fId);
      if (!existing || (s.timestamp && (!existing.timestamp || s.timestamp.toMillis() > existing.timestamp.toMillis()))) {
        planillasMap.set(fId, { 
          formId: fId, 
          medium: medium, 
          userEmail: s.userEmail, 
          timestamp: s.timestamp 
        });
      }
    });
    return Array.from(planillasMap.values());
  }, [currentReportSamples]);

  useEffect(() => {
    fetch('/data/parametros_monitoreo.json')
      .then(res => res.json())
      .then(data => {
        if (data && data.medios) {
          setTemplates(data.medios);
        }
      })
      .catch(err => console.error("Error al cargar plantillas", err));
  }, []);

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
            setViewingReportId(parsed.viewingReportId || null);
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
      if (selectedPoint.stationId) {
        setActiveView('summary');
      } else {
        setActiveView('create-station');
        setEditLat(selectedPoint.lat.toString());
        setEditLon(selectedPoint.lon.toString());
      }
      setCurrentReportId(null);
      setActiveFormId(null);
      setViewingReportId(null);
      setIsEditingCoords(false);
      setSelectedProject('');
      setProjectSearch('');
      setSelectedTemplate('manual');
      
      lastPointKeyRef.current = currentKey;
    }
  }, [selectedPoint?.lat, selectedPoint?.lon, selectedPoint?.stationId]);

  useEffect(() => {
    if (selectedPoint) {
      const state = { activeView, currentReportId, activeFormId, viewingReportId, selectedProject, selectedTemplate };
      localStorage.setItem('dea_form_state', JSON.stringify(state));
    }
  }, [activeView, currentReportId, activeFormId, viewingReportId, selectedProject, selectedTemplate, selectedPoint]);

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
    defaultValues: { name: '' },
  });

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
  }, [selectedPoint, db, stationForm]);

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
      basinCode: selectedPoint.basinCode || '',
      userId: user?.uid,
      userEmail: user?.email,
      createdAt: serverTimestamp(),
    };

    onStationCreated(newStationRef.id, data.name);
    
    setDoc(newStationRef, stationData)
      .catch(async (error) => {
        const permissionError = new FirestorePermissionError({
          path: newStationRef.path,
          operation: 'create',
          requestResourceData: stationData,
        });
        errorEmitter.emit('permission-error', permissionError);
      });

    toast({
      title: "Estación registrada",
      description: `Se guardó el punto: ${data.name}`,
    });
  };

  const handleSaveCoordsEdit = () => {
    const lat = parseFloat(editLat);
    const lon = parseFloat(editLon);
    if (!isNaN(lat) && !isNaN(lon) && selectedPoint) {
      onPointUpdate({ ...selectedPoint, lat, lon });
      setIsEditingCoords(false);
    }
  };

  const handleConfirmTemplate = () => {
    const newFormId = crypto.randomUUID();
    setActiveFormId(newFormId);
    if (currentReportId) {
      setActiveView('report-entry');
    } else {
      handleStartReport(newFormId);
    }
  };

  const handleStartReport = async (formId: string) => {
    if (!selectedPoint?.stationId || !user) return;
    if (!selectedProject) {
      toast({
        variant: "destructive",
        title: "Atención",
        description: "Por favor, seleccioná un proyecto antes de iniciar el reporte.",
      });
      return;
    }

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
        trelloCardName: selectedProject,
        createdAt: serverTimestamp(),
        createdByEmail: user.email,
        status: 'open',
        editors: [user.email]
      };

      await addDoc(reportsCol, reportData)
        .then((docRef) => {
          setCurrentReportId(docRef.id);
          setActiveView('report-entry');
          toast({
            title: "Reporte iniciado",
            description: `Se generó el OID: ${oid}`,
          });
        })
        .catch(async (error) => {
          const permissionError = new FirestorePermissionError({
            path: 'reports',
            operation: 'create',
            requestResourceData: reportData,
          });
          errorEmitter.emit('permission-error', permissionError);
        });
    } catch (e) {
      console.error("Error creating report OID", e);
    } finally {
      setIsStartingReport(false);
    }
  };

  const handleViewReportDetails = (reportId: string) => {
    setViewingReportId(reportId);
    setActiveView('report-view');
  };

  const handleOpenExistingReport = (reportId: string) => {
    setCurrentReportId(reportId);
    setActiveView('select-template'); 
  };

  const handleReopenPlanilla = (planilla: { formId: string, medium: string }) => {
    setActiveFormId(planilla.formId);
    const foundTemplate = templates.find(t => t.medium === planilla.medium);
    if (foundTemplate) {
      setSelectedTemplate(foundTemplate.id);
    } else {
      setSelectedTemplate('manual');
    }
    setActiveView('report-entry');
  };

  if (!selectedPoint) {
    return (
      <div className="flex flex-col items-center pt-8 md:pt-16 min-h-[60vh] text-center space-y-6 px-4">
        <div className="p-8 bg-primary/5 rounded-full shadow-inner border border-primary/5">
          <MapPin className="h-16 w-16 text-foreground/20 animate-pulse" />
        </div>
        <div className="max-w-xs space-y-2">
          <h3 className="text-xl font-bold text-foreground tracking-tight">Iniciá la recolección</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Hacé clic en un punto del mapa para crear una nueva estación o seleccioná una existente para gestionar sus datos.
          </p>
        </div>
      </div>
    );
  }

  if (activeView === 'report-entry' && currentReportId && activeFormId) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setActiveView('select-template')} className="mb-2 text-foreground font-bold">
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
        <Button variant="ghost" size="sm" onClick={() => setActiveView('summary')} className="mb-2 text-foreground font-bold">
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver al resumen
        </Button>
        <ReportList stationId={selectedPoint.stationId} onViewReport={handleViewReportDetails} onOpenReport={handleOpenExistingReport} />
      </div>
    );
  }

  if (activeView === 'report-view' && viewingReportId) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setActiveView('consult')} className="mb-2 text-foreground font-bold">
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver al listado
        </Button>
        <ReportDetail reportId={viewingReportId} onClose={() => setActiveView('consult')} />
      </div>
    );
  }

  if (activeView === 'select-project' && selectedPoint.stationId) {
    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
        <Button variant="ghost" size="sm" onClick={() => setActiveView('summary')} className="mb-2 text-foreground font-bold">
          <ArrowLeft className="mr-2 h-4 w-4" /> Cancelar
        </Button>
        <Card className="border-t-4 border-t-primary shadow-lg overflow-hidden">
          <CardHeader className="pb-4">
            <CardTitle className="text-md flex items-center gap-2 text-foreground">
              <Briefcase className="h-5 w-5 text-foreground" />
              1. Seleccionar Proyecto
            </CardTitle>
            <CardDescription className="text-xs">Asociá este nuevo reporte a un proyecto activo de Trello.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1.5 px-1">Proyecto de Trello</Label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Buscá el proyecto o código..." 
                  className="pl-9 h-11 text-xs font-normal border-input focus-visible:ring-primary/50 text-foreground"
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                />
              </div>
              
              <ScrollArea className="h-[200px] border rounded-md p-1 bg-white">
                <div className="space-y-1">
                  {filteredTrelloProjects.length === 0 ? (
                    <div className="p-4 text-center text-xs text-muted-foreground italic">No se encontraron proyectos.</div>
                  ) : (
                    filteredTrelloProjects.map((item) => (
                      <button
                        key={item.original}
                        onClick={() => {
                          setSelectedProject(item.original);
                          setProjectSearch(item.display);
                        }}
                        className={cn(
                          "w-full text-left px-3 py-2.5 rounded-md text-[11px] font-normal transition-colors flex items-start justify-between gap-2",
                          selectedProject === item.original 
                            ? "bg-primary text-white" 
                            : "hover:bg-primary/5 text-foreground border border-transparent"
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
              className="w-full h-12 text-sm font-black uppercase tracking-widest bg-primary hover:bg-primary/90 shadow-md text-white" 
              disabled={!selectedProject} 
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
        <Button variant="ghost" size="sm" onClick={() => currentReportId ? setActiveView('summary') : setActiveView('select-project')} className="mb-2 text-foreground font-bold">
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver atrás
        </Button>
        <Card className="border-t-4 border-t-accent shadow-lg overflow-hidden">
          <CardHeader className="pb-4">
            <CardTitle className="text-md flex items-center gap-2 text-foreground">
              <LayoutList className="h-5 w-5 text-accent" />
              {currentReportId ? 'Gestión de Planillas' : '2. Elegir Planilla de Carga'}
            </CardTitle>
            <CardDescription className="text-xs">
              {currentReportId ? 'Iniciá una nueva planilla vacía o editá las registradas.' : 'Seleccioná el protocolo de monitoreo para pre-cargar los parámetros.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1.5 px-1">Nueva Planilla</Label>
              <div className="flex gap-2">
                <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                  <SelectTrigger className="h-11 flex-1 text-xs font-bold border-accent/20 bg-accent/5 text-foreground">
                    <SelectValue placeholder="Elegí un protocolo..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual" className="text-xs font-bold">Carga Manual (uno por uno)</SelectItem>
                    <SelectItem value="personalizada" className="text-xs font-bold text-foreground flex items-center gap-1">
                      <Star className="h-3 w-3 inline mr-1 fill-accent" /> Crear Planilla Personalizada
                    </SelectItem>
                    {customTemplates && customTemplates.length > 0 && (
                      <>
                        <Separator className="my-1" />
                        <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase">Tus Planillas</div>
                        {customTemplates.map((ct: any) => (
                          <SelectItem key={ct.id} value={`custom_${ct.id}`} className="text-xs">
                            {ct.name}
                          </SelectItem>
                        ))}
                      </>
                    )}
                    <Separator className="my-1" />
                    <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase">Plantillas del Sistema</div>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id} className="text-xs">{t.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button 
                  className="h-11 px-4 bg-primary hover:bg-primary/90 font-black uppercase tracking-widest text-white" 
                  disabled={isStartingReport} 
                  onClick={handleConfirmTemplate}
                >
                  {isStartingReport ? <Loader2 className="h-4 w-4 animate-spin" /> : "INICIAR CARGA"}
                </Button>
              </div>
            </div>

            {currentReportId && existingPlanillas.length > 0 && (
              <div className="space-y-3 pt-2">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1.5 px-1">Planillas en este reporte (Editar)</Label>
                <div className="grid grid-cols-1 gap-2">
                  {existingPlanillas.map((p) => (
                    <button
                      key={p.formId}
                      onClick={() => handleReopenPlanilla(p)}
                      className="w-full flex items-center justify-between p-3 rounded-md bg-muted/30 border border-muted/50 hover:bg-primary/5 hover:border-primary/30 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded bg-white shadow-sm border">
                          <FileText className="h-3.5 w-3.5 text-foreground" />
                        </div>
                        <div className="text-left">
                          <p className="text-xs font-black capitalize text-foreground">{p.medium.replace('_', ' ')}</p>
                          <div className="flex flex-col mt-0.5">
                            <p className="text-[9px] text-muted-foreground uppercase font-semibold">ID: {p.formId.substring(0, 8)}</p>
                            <div className="flex items-center gap-2 text-[9px] text-foreground font-black uppercase tracking-tight">
                              <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" /> {formatDate(p.timestamp)}</span>
                              <span className="flex items-center gap-0.5"><User className="h-2.5 w-2.5" /> {p.userEmail?.split('@')[0]}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {selectedPoint.stationId ? (
        <Card className="border-primary/20 bg-primary/5 shadow-sm overflow-hidden">
          <CardHeader className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-foreground shrink-0" />
                  <CardTitle className="text-xl font-black text-foreground leading-none tracking-tight">{selectedPoint.name}</CardTitle>
                </div>
                <div className="space-y-0.5 ml-7">
                  <CardDescription className="text-[11px] font-bold text-muted-foreground font-code">
                    {selectedPoint.lat.toFixed(6)}, {selectedPoint.lon.toFixed(6)}
                  </CardDescription>
                  <CardDescription className="text-[11px] font-bold text-muted-foreground font-code">Creación: {formatDate(stationDetails?.createdAt)}</CardDescription>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={onDeselect} className="h-8 w-8 -mt-1 -mr-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"><X className="h-4 w-4" /></Button>
            </div>
          </CardHeader>
        </Card>
      ) : (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="p-4 pb-3">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-lg flex items-center gap-2 text-foreground font-bold tracking-tight"><PlusCircle className="h-5 w-5" />Nuevo Punto</CardTitle>
              <Button variant="ghost" size="icon" onClick={onDeselect} className="h-8 w-8 -mt-1 -mr-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"><X className="h-4 w-4" /></Button>
            </div>
          </CardHeader>
        </Card>
      )}

      {activeView === 'create-station' && (
        <Card className="border-t-4 border-t-accent shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-300">
          <CardHeader>
            <CardTitle className="text-md text-foreground font-black uppercase tracking-widest">Definir Estación</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={stationForm.handleSubmit(handleCreateStation)} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="station-name" className="text-[10px] font-bold uppercase text-muted-foreground">Nombre de la Estación</Label>
                <div className="relative">
                  <Input id="station-name" placeholder="Ej: EMA0001" {...stationForm.register('name')} className="text-foreground font-bold h-11" />
                  {isGeneratingName && <div className="absolute right-3 top-3"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
                </div>
              </div>

              <div className="space-y-3 bg-muted/10 p-4 rounded-md border border-dashed">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-bold uppercase text-muted-foreground">Coordenadas Geográficas</Label>
                  {!isEditingCoords ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditingCoords(true)} className="h-6 px-2 text-[10px] font-bold uppercase hover:bg-primary/10">
                      <Pencil className="mr-1 h-3 w-3" /> Editar
                    </Button>
                  ) : (
                    <div className="flex gap-1">
                      <Button type="button" variant="ghost" size="sm" onClick={handleSaveCoordsEdit} className="h-6 px-2 text-[10px] font-bold uppercase text-green-600 hover:bg-green-50">
                        <Check className="mr-1 h-3 w-3" /> Aplicar
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => {
                        setEditLat(selectedPoint.lat.toString());
                        setEditLon(selectedPoint.lon.toString());
                        setIsEditingCoords(false);
                      }} className="h-6 px-2 text-[10px] font-bold uppercase text-destructive hover:bg-destructive/5">
                        <X className="mr-1 h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-[9px] font-bold text-muted-foreground">Latitud</Label>
                    <Input 
                      type="text" 
                      value={editLat} 
                      onChange={(e) => setEditLat(e.target.value)}
                      disabled={!isEditingCoords}
                      className="h-8 text-[11px] font-code font-bold bg-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px] font-bold text-muted-foreground">Longitud</Label>
                    <Input 
                      type="text" 
                      value={editLon} 
                      onChange={(e) => setEditLon(e.target.value)}
                      disabled={!isEditingCoords}
                      className="h-8 text-[11px] font-code font-bold bg-white"
                    />
                  </div>
                </div>
              </div>

              <Button type="submit" className="w-full h-12 bg-accent hover:bg-accent/90 text-white font-black uppercase tracking-widest" disabled={isGeneratingName || isEditingCoords}>
                <Send className="mr-2 h-4 w-4" /> Guardar punto
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {activeView === 'summary' && selectedPoint.stationId && (
        <div className="space-y-4">
          <Separator />
          <div className="grid grid-cols-1 gap-3 pt-2">
            <Button className="w-full h-14 text-md font-black uppercase tracking-widest flex items-center gap-3 bg-primary hover:bg-primary/90 shadow-md text-white" onClick={() => {
              setCurrentReportId(null);
              setActiveView('select-project');
            }}>
              <FileText className="h-6 w-6" /> Crear reporte
            </Button>
            <Button variant="outline" className="w-full h-14 text-md font-black uppercase tracking-widest flex items-center gap-3 border-foreground text-foreground hover:bg-foreground/5 shadow-sm" onClick={() => setActiveView('consult')}>
              <Search className="h-6 w-6" /> Ver Historial
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}