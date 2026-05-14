'use client';

import { useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { collection, query, where, addDoc, serverTimestamp, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { useFirestore, useUser, useCollection, useDoc, errorEmitter, FirestorePermissionError } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Plus, Save, FlaskConical, CheckCircle2, User, LayoutList, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

const analyteSchema = z.object({
  medium: z.enum(['water', 'air', 'soil']),
  parameterType: z.string().min(2, 'Requerido'),
  analyte: z.string().min(1, 'Requerido'),
  value: z.string().min(1, 'Requerido'),
});

type AnalyteValues = z.infer<typeof analyteSchema>;

interface SamplingReportFormProps {
  reportId: string;
  stationId: string;
  onClose: () => void;
  templateId?: string;
}

export function SamplingReportForm({ reportId, stationId, onClose, templateId }: SamplingReportFormProps) {
  const { toast } = useToast();
  const db = useFirestore();
  const { user } = useUser();
  const [template, setTemplate] = useState<any>(null);
  const [planillaValues, setPlanillaValues] = useState<Record<string, string>>({});
  const [isSavingPlanilla, setIsSavingPlanilla] = useState(false);

  // Obtener datos del reporte para mostrar el OID
  const reportRef = useMemo(() => doc(db, 'reports', reportId), [db, reportId]);
  const { data: reportData } = useDoc(reportRef);

  // Carga de plantilla si existe
  useEffect(() => {
    if (templateId && templateId !== 'manual') {
      fetch('/data/parametros_monitoreo.json')
        .then(res => res.json())
        .then(data => {
          const found = data.medios.find((m: any) => m.id === templateId);
          if (found) {
            setTemplate(found);
            // Cargar borrador de planilla si existe
            const savedPlanilla = localStorage.getItem(`dea_planilla_${reportId}_${templateId}`);
            if (savedPlanilla) {
              setPlanillaValues(JSON.parse(savedPlanilla));
            }
          }
        });
    }
  }, [templateId, reportId]);

  // Consulta simple para analitos guardados
  const samplesQuery = useMemo(() => {
    return query(
      collection(db, 'samples'),
      where('reportId', '==', reportId)
    );
  }, [db, reportId]);

  const { data: samplesData } = useCollection(samplesQuery);

  const savedSamples = useMemo(() => {
    return [...samplesData].sort((a: any, b: any) => {
      const timeA = a.timestamp?.toMillis?.() || 0;
      const timeB = b.timestamp?.toMillis?.() || 0;
      return timeA - timeB;
    });
  }, [samplesData]);

  const form = useForm<AnalyteValues>({
    resolver: zodResolver(analyteSchema),
    defaultValues: {
      medium: 'water',
      parameterType: '',
      analyte: '',
      value: '',
    },
  });

  // Persistencia de borrador de planilla
  useEffect(() => {
    if (Object.keys(planillaValues).length > 0 && templateId) {
      localStorage.setItem(`dea_planilla_${reportId}_${templateId}`, JSON.stringify(planillaValues));
    }
  }, [planillaValues, reportId, templateId]);

  const handleAddAnalyte = (data: AnalyteValues) => {
    if (!user) return;
    
    const sampleData = {
      ...data,
      reportId,
      stationId,
      userId: user.uid,
      userEmail: user.email,
      timestamp: serverTimestamp(),
    };

    addDoc(collection(db, 'samples'), sampleData)
      .then(() => {
        if (user.email) {
          updateDoc(reportRef, { editors: arrayUnion(user.email) }).catch(console.error);
        }
        form.reset({
          medium: data.medium,
          parameterType: data.parameterType,
          analyte: '',
          value: '',
        });
      })
      .catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: 'samples',
          operation: 'create',
          requestResourceData: sampleData,
        }));
      });
  };

  const handleSavePlanilla = async () => {
    if (!user || !template) return;
    setIsSavingPlanilla(true);

    const samplesCol = collection(db, 'samples');
    let savedCount = 0;

    try {
      for (const param of template.parametros) {
        const val = planillaValues[param.nombre];
        if (val && val.trim() !== '') {
          const sampleData = {
            medium: template.id.split('_')[0], // ej: 'agua' de 'agua_superficial'
            parameterType: param.categoria,
            analyte: param.nombre,
            value: val,
            reportId,
            stationId,
            userId: user.uid,
            userEmail: user.email,
            timestamp: serverTimestamp(),
          };

          await addDoc(samplesCol, sampleData);
          savedCount++;
        }
      }

      if (savedCount > 0 && user.email) {
        await updateDoc(reportRef, { editors: arrayUnion(user.email) });
      }

      localStorage.removeItem(`dea_planilla_${reportId}_${templateId}`);
      setPlanillaValues({});
      toast({
        title: "Planilla guardada",
        description: `Se registraron ${savedCount} parámetros correctamente.`,
      });
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Error", description: "No se pudieron guardar todos los parámetros." });
    } finally {
      setIsSavingPlanilla(false);
    }
  };

  const handleFinishSession = () => {
    onClose();
  };

  const mediumLabel = (m: string) => {
    const labels: any = { water: 'Agua', air: 'Aire', soil: 'Suelo', agua: 'Agua', suelo: 'Suelo', aire: 'Aire' };
    return labels[m] || m;
  };

  return (
    <div className="space-y-6">
      <Card className="border-t-4 border-t-primary shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">
                {template ? `Planilla: ${template.nombre}` : 'Carga de Analitos'}
              </CardTitle>
              <CardDescription>Reporte: <span className="font-bold text-primary">{reportData?.oid || 'Cargando...'}</span></CardDescription>
            </div>
            <Badge variant="outline" className="text-primary border-primary">Activo</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {template ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4">
                {template.parametros.map((param: any) => (
                  <div key={param.nombre} className="flex flex-col gap-1.5 p-3 rounded-md bg-muted/20 border border-muted/30">
                    <div className="flex justify-between items-center">
                      <Label className="text-xs font-bold text-primary">{param.nombre}</Label>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-tighter">{param.categoria}</span>
                    </div>
                    <Input 
                      placeholder="Valor / Unidad" 
                      className="h-9 bg-white text-xs font-code"
                      value={planillaValues[param.nombre] || ''}
                      onChange={(e) => setPlanillaValues(prev => ({...prev, [param.nombre]: e.target.value}))}
                    />
                  </div>
                ))}
              </div>
              <Button 
                onClick={handleSavePlanilla} 
                className="w-full h-12 bg-accent hover:bg-accent/90 shadow-lg"
                disabled={isSavingPlanilla || Object.keys(planillaValues).length === 0}
              >
                {isSavingPlanilla ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
                Guardar Planilla en el Reporte
              </Button>
            </div>
          ) : (
            <form onSubmit={form.handleSubmit(handleAddAnalyte)} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Medio</Label>
                <Select onValueChange={(v) => form.setValue('medium', v as any)} value={form.watch('medium')}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar medio" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="water">Agua</SelectItem>
                    <SelectItem value="air">Aire</SelectItem>
                    <SelectItem value="soil">Suelo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Categoría / Tipo</Label>
                <Input placeholder="Ej: Fisicoquímico" {...form.register('parameterType')} />
              </div>
              <div className="space-y-2">
                <Label>Analito</Label>
                <Input placeholder="Ej: pH" {...form.register('analyte')} />
              </div>
              <div className="space-y-2">
                <Label>Valor / Unidad</Label>
                <Input placeholder="Ej: 7.2" {...form.register('value')} />
              </div>
              <div className="md:col-span-2 pt-2">
                <Button type="submit" className="w-full"><Plus className="mr-2 h-4 w-4" /> Agregar Analito</Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-md flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-primary" />
            Analitos Registrados ({savedSamples.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[250px] rounded-md border-t">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="text-[11px] uppercase font-bold">Medio</TableHead>
                  <TableHead className="text-[11px] uppercase font-bold">Analito</TableHead>
                  <TableHead className="text-[11px] uppercase font-bold">Valor</TableHead>
                  <TableHead className="text-[11px] uppercase font-bold text-right">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {savedSamples.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground italic text-xs">Aún no hay datos registrados.</TableCell>
                  </TableRow>
                ) : (
                  savedSamples.map((sample: any) => (
                    <TableRow key={sample.id}>
                      <TableCell className="text-xs py-2">{mediumLabel(sample.medium)}</TableCell>
                      <TableCell className="text-xs py-2 font-medium">{sample.analyte}</TableCell>
                      <TableCell className="text-xs py-2 font-code">{sample.value}</TableCell>
                      <TableCell className="text-right py-2"><Badge variant="ghost" className="text-green-600 bg-green-50 gap-1 h-5 px-1.5"><CheckCircle2 className="h-3 w-3" /> OK</Badge></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
        <CardFooter className="pt-6 border-t bg-muted/5 flex justify-end">
          <Button onClick={handleFinishSession} variant="default" className="bg-green-600 hover:bg-green-700">
            <CheckCircle2 className="mr-2 h-4 w-4" /> Finalizar Sesión
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
