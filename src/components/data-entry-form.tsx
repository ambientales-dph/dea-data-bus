'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { collection, doc, setDoc, serverTimestamp, query, where, orderBy, limit, getDocs, addDoc } from 'firebase/firestore';
import { useFirestore, useUser, useDoc, errorEmitter, FirestorePermissionError } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { MapPin, Send, PlusCircle, Database, FileText, Search, Loader2, ArrowLeft, Pencil, Check, X } from 'lucide-react';
import { SelectedPoint } from '@/app/page';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { SamplingReportForm } from './sampling-report-form';
import { ReportList } from './report-list';
import { ReportDetail } from './report-detail';

const stationSchema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
});

type StationValues = z.infer<typeof stationSchema>;

type FormView = 'summary' | 'create-station' | 'report-entry' | 'consult' | 'report-view';

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
  const [activeView, setActiveView] = useState<FormView>('summary');
  const [currentReportId, setCurrentReportId] = useState<string | null>(null);
  const [viewingReportId, setViewingReportId] = useState<string | null>(null);
  
  // Estados para edición de coordenadas
  const [isEditingCoords, setIsEditingCoords] = useState(false);
  const [editLat, setEditLat] = useState('');
  const [editLon, setEditLon] = useState('');

  // Obtener detalles de la estación si ya existe
  const stationRef = useMemo(() => {
    if (!selectedPoint?.stationId) return null;
    return doc(db, 'stations', selectedPoint.stationId);
  }, [db, selectedPoint?.stationId]);

  const { data: stationDetails } = useDoc(stationRef);

  const stationForm = useForm<StationValues>({
    resolver: zodResolver(stationSchema),
    defaultValues: { name: '' },
  });

  // Resetear vista cuando cambia el punto seleccionado
  useEffect(() => {
    if (selectedPoint?.stationId) {
      setActiveView('summary');
    } else if (selectedPoint) {
      setActiveView('create-station');
    } else {
      setActiveView('summary');
    }
    setCurrentReportId(null);
    setViewingReportId(null);
    setIsEditingCoords(false);
  }, [selectedPoint?.stationId, selectedPoint]);

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '---';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
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
    
    const newStationRef = doc(collection(db, 'stations'));
    const stationData = {
      name: data.name,
      latitude: selectedPoint.lat,
      longitude: selectedPoint.lon,
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

  const handleStartReport = () => {
    if (!selectedPoint?.stationId || !user) return;

    const reportData = {
      stationId: selectedPoint.stationId,
      createdAt: serverTimestamp(),
      createdByEmail: user.email,
      status: 'open',
      editors: [user.email]
    };

    const reportsCol = collection(db, 'reports');
    
    addDoc(reportsCol, reportData)
      .then((docRef) => {
        setCurrentReportId(docRef.id);
        setActiveView('report-entry');
        toast({
          title: "Reporte iniciado",
          description: "Podés comenzar a cargar los analitos.",
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
  };

  const handleViewReportDetails = (reportId: string) => {
    setViewingReportId(reportId);
    setActiveView('report-view');
  };

  const handleOpenExistingReport = (reportId: string) => {
    setCurrentReportId(reportId);
    setActiveView('report-entry');
    toast({
      title: "Reporte abierto",
      description: "Continuando con la carga de datos.",
    });
  };

  const handleStartEditCoords = () => {
    if (!selectedPoint) return;
    setEditLat(selectedPoint.lat.toString());
    setEditLon(selectedPoint.lon.toString());
    setIsEditingCoords(true);
  };

  const handleSaveEditedCoords = () => {
    if (!selectedPoint) return;
    const lat = parseFloat(editLat);
    const lon = parseFloat(editLon);
    
    if (!isNaN(lat) && !isNaN(lon)) {
      onPointUpdate({ ...selectedPoint, lat, lon });
      setIsEditingCoords(false);
      toast({
        title: "Punto reubicado",
        description: "Las coordenadas han sido actualizadas.",
      });
    } else {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Ingresá valores numéricos válidos.",
      });
    }
  };

  if (!selectedPoint) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4 px-4">
        <div className="p-6 bg-primary/5 rounded-full">
          <MapPin className="h-12 w-12 text-primary/40 animate-pulse" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-primary">Iniciá la recolección</h3>
          <p className="text-sm text-muted-foreground">
            Hacé clic en un punto del mapa para crear una nueva estación o seleccioná una existente.
          </p>
        </div>
      </div>
    );
  }

  // Vistas alternativas
  if (activeView === 'report-entry' && currentReportId) {
    return (
      <div className="space-y-4">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => setActiveView('summary')}
          className="mb-2"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver al resumen
        </Button>
        <SamplingReportForm 
          reportId={currentReportId} 
          stationId={selectedPoint.stationId!}
          onClose={() => setActiveView('summary')}
        />
      </div>
    );
  }

  if (activeView === 'consult' && selectedPoint.stationId) {
    return (
      <div className="space-y-4">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => setActiveView('summary')}
          className="mb-2"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver al resumen
        </Button>
        <ReportList 
          stationId={selectedPoint.stationId} 
          onViewReport={handleViewReportDetails}
          onOpenReport={handleOpenExistingReport}
        />
      </div>
    );
  }

  if (activeView === 'report-view' && viewingReportId) {
    return (
      <div className="space-y-4">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => setActiveView('consult')}
          className="mb-2"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver al listado
        </Button>
        <ReportDetail 
          reportId={viewingReportId} 
          onClose={() => setActiveView('consult')} 
        />
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
                  <Database className="h-5 w-5 text-primary/60 shrink-0" />
                  <CardTitle className="text-xl font-bold text-primary leading-none">
                    {selectedPoint.name}
                  </CardTitle>
                </div>
                <div className="space-y-0.5 ml-7">
                  <div className="flex items-center gap-2">
                    {isEditingCoords ? (
                      <div className="flex items-center gap-1 mt-1">
                        <Input 
                          value={editLat} 
                          onChange={(e) => setEditLat(e.target.value)}
                          className="h-6 w-24 text-[11px] font-code py-0 px-1"
                        />
                        <Input 
                          value={editLon} 
                          onChange={(e) => setEditLon(e.target.value)}
                          className="h-6 w-24 text-[11px] font-code py-0 px-1"
                        />
                        <button onClick={handleSaveEditedCoords} className="text-green-600 hover:text-green-700">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setIsEditingCoords(false)} className="text-destructive hover:text-destructive/80">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <CardDescription className="text-[11px] font-medium text-muted-foreground font-code">
                          {selectedPoint.lat.toFixed(6)}, {selectedPoint.lon.toFixed(6)}
                        </CardDescription>
                        <button 
                          onClick={handleStartEditCoords}
                          className="text-muted-foreground hover:text-primary transition-colors"
                          title="Editar coordenadas"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      </>
                    )}
                  </div>
                  <CardDescription className="text-[11px] font-medium text-muted-foreground font-code">
                    Creación: {formatDate(stationDetails?.createdAt)}
                  </CardDescription>
                  <CardDescription className="text-[11px] font-medium text-muted-foreground font-code">
                    Por: {stationDetails?.userEmail || '---'}
                  </CardDescription>
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={onDeselect}
                className="h-8 w-8 -mt-1 -mr-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Deseleccionar"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
        </Card>
      ) : (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="p-4 pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1 flex-1">
                <CardTitle className="text-lg flex items-center gap-2 text-primary">
                  <PlusCircle className="h-5 w-5" />
                  Nuevo Punto de Muestreo
                </CardTitle>
                <div className="flex items-center gap-2 ml-7">
                  {isEditingCoords ? (
                    <div className="flex items-center gap-1 mt-1">
                      <Input 
                        value={editLat} 
                        onChange={(e) => setEditLat(e.target.value)}
                        className="h-6 w-24 text-[11px] font-code py-0 px-1"
                      />
                      <Input 
                        value={editLon} 
                        onChange={(e) => setEditLon(e.target.value)}
                        className="h-6 w-24 text-[11px] font-code py-0 px-1"
                      />
                      <button onClick={handleSaveEditedCoords} className="text-green-600 hover:text-green-700">
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setIsEditingCoords(false)} className="text-destructive hover:text-destructive/80">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <CardDescription className="text-[11px] font-medium text-muted-foreground font-code">
                        {selectedPoint.lat.toFixed(6)}, {selectedPoint.lon.toFixed(6)}
                        {selectedPoint.basinCode && ` • Cuenca: ${selectedPoint.basinCode}`}
                      </CardDescription>
                      <button 
                        onClick={handleStartEditCoords}
                        className="text-muted-foreground hover:text-primary transition-colors"
                        title="Editar coordenadas"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={onDeselect}
                className="h-8 w-8 -mt-1 -mr-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Cancelar"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
        </Card>
      )}

      {activeView === 'create-station' && (
        <Card className="border-t-4 border-t-accent shadow-lg">
          <CardHeader>
            <CardTitle className="text-md">Definir Estación</CardTitle>
            <CardDescription>Verificá el nombre sugerido antes de guardar.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={stationForm.handleSubmit(handleCreateStation)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="station-name">Nombre de la Estación</Label>
                <div className="relative">
                  <Input 
                    id="station-name" 
                    placeholder="Ej: EMA0001"
                    className={cn(isGeneratingName && "pr-10")}
                    {...stationForm.register('name')} 
                  />
                  {isGeneratingName && (
                    <div className="absolute right-3 top-2.5">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
                {stationForm.formState.errors.name && (
                  <p className="text-xs text-destructive">{stationForm.formState.errors.name.message}</p>
                )}
              </div>
              <Button type="submit" className="w-full bg-accent hover:bg-accent/90 text-white" disabled={isGeneratingName}>
                <Send className="mr-2 h-4 w-4" />
                Guardar punto en el mapa
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {activeView === 'summary' && selectedPoint.stationId && (
        <div className="space-y-4">
          <Separator />
          <div className="grid grid-cols-1 gap-4 pt-2">
            <Button 
              className="w-full h-14 text-md font-bold flex items-center gap-3 bg-primary hover:bg-primary/90"
              onClick={handleStartReport}
            >
              <FileText className="h-5 w-5" />
              Crear reporte de muestreo
            </Button>
            
            <Button 
              variant="outline" 
              className="w-full h-14 text-md font-bold flex items-center gap-3 border-primary text-primary hover:bg-primary/5"
              onClick={() => setActiveView('consult')}
            >
              <Search className="h-5 w-5" />
              Ver
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
