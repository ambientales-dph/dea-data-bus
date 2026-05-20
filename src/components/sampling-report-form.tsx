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
import { MONITORING_TEMPLATES } from '@/app/lib/monitoring-constants';

const analyteSchema = z.object({
  medium: z.enum(['agua_superficial', 'agua_subterranea', 'suelo', 'sedimentos']),
  parameterType: z.string().min(2, 'Requerido'),
  analyte: z.string().min(1, 'Requerido'),
  value: z.string().min(1, 'Requerido'),
});

type AnalyteValues = z.infer<typeof analyteSchema>;

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
  const [planillaValues, setPlanillaValues] = useState<Record<string, string>>({});
  const [isSavingPlanilla, setIsSavingPlanilla] = useState(false);
  const [metadata, setMetadata] = useState<{ user?: string, timestamp?: any }>({});

  const reportRef = useMemo(() => doc(db, 'reports', reportId), [db, reportId]);

  // Consulta de analitos específicos de ESTA planilla (formId)
  const samplesQuery = useMemo(() => 
    query(collection(db, 'samples'), 
    where('reportId', '==', reportId),
    where('formId', '==', formId)
  ), [db, reportId, formId]);
  const { data: samplesData } = useCollection(samplesQuery);

  useEffect(() => {
    if (samplesData && samplesData.length > 0) {
      const existingValues: Record<string, string> = {};
      let foundMetadata = { user: user?.email || '', timestamp: null };
      
      samplesData.forEach((s: any) => {
        if (s.analyte && s.value) {
          existingValues[s.analyte] = s.value;
        }
        if (!foundMetadata.timestamp || (s.timestamp && s.timestamp.toMillis() < foundMetadata.timestamp.toMillis())) {
          foundMetadata = { user: s.userEmail || user?.email || '', timestamp: s.timestamp };
        }
      });
      setPlanillaValues(existingValues);
      setMetadata(foundMetadata);
    } else {
      setPlanillaValues({});
      setMetadata({ user: user?.email || '', timestamp: null });
    }
  }, [samplesData]);

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

  const handleSavePlanilla = async () => {
    if (!user || !template || !db) return;
    setIsSavingPlanilla(true);

    const samplesCol = collection(db, 'samples');
    let savedCount = 0;
    const activeParams = template.parametros || template.parameters || [];

    try {
      for (const param of activeParams) {
        const val = planillaValues[param.nombre];
        if (val !== undefined && val !== null && val.trim() !== '') {
          const medium = template.medium || param.mediumKey || 'agua_superficial';
          
          const q = query(
            samplesCol,
            where('reportId', '==', reportId),
            where('formId', '==', formId),
            where('analyte', '==', param.nombre)
          );
          const snapshot = await getDocs(q);

          if (!snapshot.empty) {
            await updateDoc(doc(db, 'samples', snapshot.docs[0].id), {
              value: val,
              timestamp: serverTimestamp(),
              userId: user.uid,
              userEmail: user.email
            });
          } else {
            await addDoc(samplesCol, {
              medium,
              parameterType: param.categoria,
              analyte: param.nombre,
              value: val,
              reportId,
              formId,
              stationId,
              userId: user.uid,
              userEmail: user.email,
              timestamp: serverTimestamp(),
            });
          }
          savedCount++;
        }
      }

      if (savedCount > 0 && user.email) await updateDoc(reportRef, { editors: arrayUnion(user.email) });
      toast({ title: "Planilla sincronizada", description: `${savedCount} parámetros guardados.` });
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Error", description: "Falla al guardar." });
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

  // Lógica para detectar el componente técnico adecuado
  const lowerTemplateId = templateId?.toLowerCase() || '';
  const lowerTemplateName = template?.nombre?.toLowerCase() || template?.name?.toLowerCase() || '';

  const isFreatimetro = useMemo(() => {
    return lowerTemplateId.includes('subterranea') || lowerTemplateId.includes('freatimetro') || 
           lowerTemplateName.includes('subterránea') || lowerTemplateName.includes('freatímetro');
  }, [lowerTemplateId, lowerTemplateName]);

  const isAguaSuperficial = useMemo(() => {
    return lowerTemplateId.includes('superficial') || lowerTemplateName.includes('superficial');
  }, [lowerTemplateId, lowerTemplateName]);

  if (isFreatimetro) {
    return <FreatimetroFormIntegrated reportId={reportId} formId={formId} stationId={stationId} onClose={onClose} />;
  }

  if (isAguaSuperficial) {
    return <SurfaceWaterFormIntegrated reportId={reportId} formId={formId} stationId={stationId} onClose={onClose} />;
  }

  return (
    <div className="space-y-4">
      <Card className="border-t-4 border-t-primary shadow-lg overflow-hidden">
        <CardHeader className="p-3 pb-2">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <CardTitle className="text-sm font-black uppercase tracking-tight text-foreground">{template?.nombre || template?.name || 'Carga de Analitos'}</CardTitle>
              <div className="flex flex-col gap-0.5">
                <CardDescription className="text-[10px] font-bold">ID: <span className="text-foreground">{formId.substring(0, 8)}</span></CardDescription>
                <div className="flex items-center gap-3 text-[9px] text-muted-foreground font-black uppercase tracking-tight">
                  <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> {formatTimestamp(metadata.timestamp)}</span>
                  <span className="flex items-center gap-1"><User className="h-2.5 w-2.5" /> {metadata.user || user?.email}</span>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          {template ? (
            <div className="space-y-2 animate-in fade-in duration-300">
              <div className="grid grid-cols-1 gap-1.5">
                {(template.parametros || template.parameters || []).map((param: any) => (
                  <div key={param.nombre} className="flex items-center gap-2 p-2 rounded-sm bg-muted/20 border border-muted-20 hover:border-primary/20 transition-all">
                    <div className="flex-1 min-w-0">
                      <Label className="text-[10px] font-black text-foreground block leading-none truncate">{param.nombre}</Label>
                      <span className="text-[8px] text-muted-foreground uppercase font-bold">{param.categoria} • {param.unidades}</span>
                    </div>
                    <Input 
                      placeholder="Valor" 
                      className="h-8 w-24 text-[11px] font-code py-0 px-2 bg-white text-right border-input font-bold text-foreground"
                      value={planillaValues[param.nombre] || ''}
                      onChange={(e) => setPlanillaValues(prev => ({...prev, [param.nombre]: e.target.value}))}
                    />
                  </div>
                ))}
              </div>
              <Button onClick={handleSavePlanilla} className="w-full h-10 mt-2 bg-primary hover:bg-primary/90 text-[10px] font-black uppercase tracking-widest text-white shadow-md" disabled={isSavingPlanilla}>
                {isSavingPlanilla ? <Loader2 className="animate-spin h-4 w-4" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Guardar Datos
              </Button>
            </div>
          ) : (
            <div className="py-8 flex flex-col items-center justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mb-2" /><p className="text-xs">Cargando protocolo...</p>
            </div>
          )}
        </CardContent>
      </Card>
      
      <div className="flex justify-end">
        <Button onClick={onClose} variant="outline" className="text-[10px] font-black uppercase tracking-widest border-foreground text-foreground hover:bg-foreground/5">Listo / Finalizar</Button>
      </div>
    </div>
  );
}
