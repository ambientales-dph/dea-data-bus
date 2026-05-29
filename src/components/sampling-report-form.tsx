
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { collection, query, where, addDoc, serverTimestamp, doc, updateDoc, arrayUnion, getDoc, getDocs } from 'firebase/firestore';
import { useFirestore, useUser, useCollection, useDoc } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, Loader2, Clock, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FreatimetroFormIntegrated } from './freatimetro-form-integrated';
import { SurfaceWaterFormIntegrated } from './surface-water-form-integrated';
import { AirQualityFormIntegrated } from './air-quality-form-integrated';
import { PlanillaEdafologicaForm } from './planilla-edafologica-form';
import { SuelosGeotecniaFormIntegrated } from './suelos-geotecnia-form';
import { PgaysChecklistForm } from './pgays-checklist-form';
import { MONITORING_TEMPLATES } from '@/app/lib/monitoring-constants';
import { TechnicianLink } from './technician-link';
import { getCurrentGPSLocation } from '@/lib/geo-utils';

interface ManualEntry {
  value: string;
  capturedAt: number | null;
}

interface SamplingReportFormProps {
  reportId: string;
  formId: string;
  stationId: string;
  onClose: () => void;
  templateId?: string;
}

export function SamplingReportForm({ reportId, formId, stationId, onClose, templateId }: SamplingReportFormProps) {
  const { toast } = useToast();
  const db = useFirestore();
  const { user } = useUser();
  const [template, setTemplate] = useState<any>(null);
  const [planillaValues, setPlanillaValues] = useState<Record<string, ManualEntry>>({});
  const [isSavingPlanilla, setIsSavingPlanilla] = useState(false);
  const [metadata, setMetadata] = useState<{ user?: string, timestamp?: any }>({});
  const [isDeferred, setIsDeferred] = useState(false);

  const reportRef = useMemo(() => {
    if (!db || !reportId) return null;
    return doc(db, 'reports', reportId);
  }, [db, reportId]);

  const samplesQuery = useMemo(() => {
    if (!db || !user || !reportId || !formId) return null;
    return query(
      collection(db, 'samples'), 
      where('reportId', '==', reportId),
      where('formId', '==', formId)
    );
  }, [db, user, reportId, formId]);

  const { data: samplesData } = useCollection(samplesQuery);

  useEffect(() => {
    if (samplesData && samplesData.length > 0) {
      const existingValues: Record<string, ManualEntry> = {};
      let foundMetadata = { user: user?.email || '', timestamp: null };
      let foundDeferred = false;
      
      samplesData.forEach((s: any) => {
        if (s.analyte && s.value) {
          existingValues[s.analyte] = { value: s.value, capturedAt: null };
        }
        if (!foundMetadata.timestamp || (s.timestamp && s.timestamp.toMillis() < foundMetadata.timestamp.toMillis())) {
          foundMetadata = { user: s.userEmail || user?.email || '', timestamp: s.fechaServidor || s.timestamp };
        }
        if (s.isDeferred !== undefined) foundDeferred = s.isDeferred;
      });
      setPlanillaValues(existingValues);
      setMetadata(foundMetadata);
      setIsDeferred(foundDeferred);
    } else {
      setPlanillaValues({});
      setMetadata({ user: user?.email || '', timestamp: null });
    }
  }, [samplesData, user]);

  useEffect(() => {
    if (!templateId || !db) return;

    if (templateId === 'personalizada') {
      setTemplate({ id: 'personalizada', nombre: 'Nueva Planilla Personalizada', parametros: [] });
    } else if (templateId.startsWith('custom_')) {
      const customId = templateId.replace('custom_', '');
      getDoc(doc(db, 'custom_templates', customId)).then(snap => {
        if (snap.exists()) setTemplate(snap.data());
      });
    } else if (templateId !== 'manual') {
      const found = MONITORING_TEMPLATES.find((m: any) => m.id === templateId);
      if (found) {
        setTemplate(found);
      }
    }
  }, [templateId, db]);

  const handleValueChange = (name: string, value: string) => {
    setPlanillaValues(prev => ({
      ...prev,
      [name]: { value, capturedAt: Date.now() }
    }));
  };

  const handleSavePlanilla = async () => {
    if (!user || !template || !db) return;
    setIsSavingPlanilla(true);

    const samplesCol = collection(db, 'samples');
    let savedCount = 0;
    const activeParams = template.parametros || template.parameters || [];

    try {
      // Capturamos GPS una vez por lote de guardado para eficiencia
      const location = await getCurrentGPSLocation();

      for (const param of activeParams) {
        const entry = planillaValues[param.nombre];
        if (entry && entry.value !== undefined && entry.value !== null && entry.value.trim() !== '') {
          const medium = template.medium || param.mediumKey || 'agua_superficial';
          
          // Delta Time Calculation
          const t1 = entry.capturedAt || Date.now();
          const t2 = Date.now();
          const deltaMs = t2 - t1;

          const q = query(
            samplesCol,
            where('reportId', '==', reportId),
            where('formId', '==', formId),
            where('analyte', '==', param.nombre)
          );
          const snapshot = await getDocs(q);

          const payload = {
            value: entry.value,
            latitude: location?.latitude ?? null,
            longitude: location?.longitude ?? null,
            retrasoSincronizacionMs: deltaMs,
            fechaServidor: serverTimestamp(),
            timestamp: serverTimestamp(),
            isDeferred,
            userId: user.uid,
            userEmail: user.email
          };

          if (!snapshot.empty) {
            await updateDoc(doc(db, 'samples', snapshot.docs[0].id), payload);
          } else {
            await addDoc(samplesCol, {
              ...payload,
              medium,
              parameterType: param.categoria,
              analyte: param.nombre,
              reportId,
              formId,
              stationId,
            });
          }
          savedCount++;
        }
      }

      if (savedCount > 0 && user.email && reportRef) await updateDoc(reportRef, { editors: arrayUnion(user.email) });
      toast({ 
        title: "Planilla sincronizada", 
        description: location ? `${savedCount} datos guardados con GPS.` : `${savedCount} datos guardados (Sin señal GPS).` 
      });
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Error", description: "Falla al guardar los datos." });
    } finally {
      setIsSavingPlanilla(false);
    }
  };

  const formatTimestamp = (ts: any) => {
    if (!ts) return new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const isDeferredLocked = samplesData && samplesData.length > 0;

  const lowerTemplateId = templateId?.toLowerCase() || '';
  const lowerTemplateName = template?.nombre?.toLowerCase() || template?.name?.toLowerCase() || '';

  const isFreatimetro = useMemo(() => {
    return lowerTemplateId.includes('subterranea') || lowerTemplateId.includes('freatimetro') || 
           lowerTemplateName.includes('subterránea') || lowerTemplateName.includes('freatímetro');
  }, [lowerTemplateId, lowerTemplateName]);

  const isAguaSuperficial = useMemo(() => {
    return lowerTemplateId.includes('superficial') || lowerTemplateName.includes('superficial');
  }, [lowerTemplateId, lowerTemplateName]);

  const isAirQuality = useMemo(() => {
    return lowerTemplateId === 'calidad_aire' || lowerTemplateName.includes('aire');
  }, [lowerTemplateId, lowerTemplateName]);

  const isSueloEdafologico = useMemo(() => {
    return lowerTemplateId === 'suelo_edafologico' || (lowerTemplateId.includes('suelo') && lowerTemplateId.includes('pe-001'));
  }, [lowerTemplateId]);

  const isSueloGeotecnia = useMemo(() => {
    return lowerTemplateId === 'suelo_geotecnia' || lowerTemplateId.includes('gt-001') || lowerTemplateId.includes('ms-001');
  }, [lowerTemplateId]);

  const isPgays = useMemo(() => {
    return lowerTemplateId.includes('pgays');
  }, [lowerTemplateId]);

  if (isFreatimetro) {
    return <FreatimetroFormIntegrated reportId={reportId} formId={formId} stationId={stationId} onClose={onClose} />;
  }

  if (isAguaSuperficial) {
    return <SurfaceWaterFormIntegrated reportId={reportId} formId={formId} stationId={stationId} onClose={onClose} />;
  }

  if (isAirQuality) {
    return <AirQualityFormIntegrated reportId={reportId} formId={formId} stationId={stationId} onClose={onClose} />;
  }

  if (isSueloEdafologico) {
    return <PlanillaEdafologicaForm reportId={reportId} formId={formId} stationId={stationId} onClose={onClose} />;
  }

  if (isSueloGeotecnia) {
    return <SuelosGeotecniaFormIntegrated reportId={reportId} formId={formId} stationId={stationId} onClose={onClose} />;
  }

  if (isPgays) {
    return <PgaysChecklistForm reportId={reportId} formId={formId} stationId={stationId} onClose={onClose} />;
  }

  return (
    <div className="space-y-4">
      <Card className="border-t-4 border-t-primary shadow-lg overflow-hidden rounded-none">
        <CardHeader className="p-4 pb-2 bg-neutral-50">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <CardTitle className="text-sm font-black uppercase tracking-tight text-foreground">{template?.nombre || template?.name || 'Carga de Analitos'}</CardTitle>
              <div className="flex flex-col gap-0.5">
                <CardDescription className="text-[10px] font-bold uppercase">Planilla ID: <span className="text-foreground">{formId}</span></CardDescription>
                <div className="flex items-center gap-3 text-[9px] text-muted-foreground font-black uppercase tracking-tight">
                  <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5 text-primary" /> {formatTimestamp(metadata.timestamp)}</span>
                  
                  <button 
                    onClick={() => !isDeferredLocked && setIsDeferred(!isDeferred)}
                    disabled={isDeferredLocked}
                    className={cn(
                      "flex items-center gap-1 px-1.5 py-0.5 rounded-full border transition-all",
                      isDeferred 
                        ? "bg-red-50 border-red-200 text-red-600" 
                        : "bg-green-50 border-green-200 text-green-600",
                      isDeferredLocked ? "opacity-100 cursor-default" : "cursor-pointer hover:scale-105 active:scale-95"
                    )}
                  >
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    <span className="text-[7px] font-black">{isDeferred ? "DIFERIDA" : "REAL"}</span>
                  </button>

                  <span className="flex items-center gap-1"><User className="h-2.5 w-2.5 text-primary" /> <TechnicianLink email={metadata.user || user?.email || null} /></span>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {template ? (
            <div className="animate-in fade-in duration-300">
              <div className="divide-y divide-neutral-200">
                {(template.parametros || template.parameters || []).map((param: any) => (
                  <div key={param.nombre} className="flex items-center gap-2 p-3 hover:bg-neutral-50 transition-all">
                    <div className="flex-1 min-w-0">
                      <Label className="text-[11px] font-black text-foreground block leading-tight uppercase">{param.nombre}</Label>
                      <span className="text-[9px] text-muted-foreground uppercase font-bold">{param.categoria} • {param.unidades}</span>
                    </div>
                    <input 
                      placeholder="---" 
                      className="h-8 w-24 text-[12px] font-code py-0 px-2 bg-neutral-100 border-none text-right font-bold text-foreground focus:ring-0 outline-none"
                      value={planillaValues[param.nombre]?.value || ''}
                      onChange={(e) => handleValueChange(param.nombre, e.target.value)}
                    />
                  </div>
                ))}
              </div>
              <div className="p-4 bg-white">
                <Button onClick={handleSavePlanilla} className="w-full h-12 bg-primary hover:bg-primary/90 text-[11px] font-black uppercase tracking-widest text-white shadow-md rounded-none" disabled={isSavingPlanilla}>
                  {isSavingPlanilla ? <Loader2 className="animate-spin h-4 w-4" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  Guardar y Sincronizar (GPS)
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-20 flex flex-col items-center justify-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mb-2" /><p className="text-[10px] font-black uppercase tracking-widest">Cargando protocolo...</p>
            </div>
          )}
        </CardContent>
      </Card>
      
      <div className="flex justify-end">
        <Button onClick={onClose} variant="outline" className="text-[10px] font-black uppercase tracking-widest border-black text-black hover:bg-black/5 rounded-none h-10">Cerrar Planilla</Button>
      </div>
    </div>
  );
}
