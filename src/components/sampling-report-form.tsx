
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { collection, query, where, addDoc, serverTimestamp, doc, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';
import { useFirestore, useUser, useCollection, useDoc, errorEmitter, FirestorePermissionError } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Plus, Save, FlaskConical, CheckCircle2, Loader2, Star, Search, Check, Info } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

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

  const [allParams, setAllParams] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedParams, setSelectedParams] = useState<any[]>([]);
  const [customTemplateName, setCustomTemplateName] = useState('');
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  const reportRef = useMemo(() => doc(db, 'reports', reportId), [db, reportId]);
  const { data: reportData } = useDoc(reportRef);

  useEffect(() => {
    fetch('/data/parametros_monitoreo.json')
      .then(res => res.json())
      .then(data => {
        const flattened = data.medios.flatMap((m: any) => 
          m.parametros.map((p: any) => ({ ...p, mediumOrigin: m.id, mediumKey: m.medium }))
        );
        const unique = Array.from(new Map(flattened.map((p: any) => [p.nombre, p])).values());
        setAllParams(unique);
      });
  }, []);

  useEffect(() => {
    if (!templateId) return;

    if (templateId === 'personalizada') {
      setTemplate({ id: 'personalizada', nombre: 'Nueva Planilla Personalizada', parametros: [] });
    } else if (templateId.startsWith('custom_')) {
      const customId = templateId.replace('custom_', '');
      getDoc(doc(db, 'custom_templates', customId)).then(snap => {
        if (snap.exists()) {
          setTemplate(snap.data());
        }
      });
    } else if (templateId !== 'manual') {
      fetch('/data/parametros_monitoreo.json')
        .then(res => res.json())
        .then(data => {
          const found = data.medios.find((m: any) => m.id === templateId);
          if (found) {
            setTemplate(found);
            const savedPlanilla = localStorage.getItem(`dea_planilla_${reportId}_${templateId}`);
            if (savedPlanilla) setPlanillaValues(JSON.parse(savedPlanilla));
          }
        });
    }
  }, [templateId, reportId, db]);

  const samplesQuery = useMemo(() => query(collection(db, 'samples'), where('reportId', '==', reportId)), [db, reportId]);
  const { data: samplesData } = useCollection(samplesQuery);
  
  const groupedSamples = useMemo(() => {
    const groups: Record<string, any[]> = {};
    samplesData.forEach((s: any) => {
      const m = s.medium || 'other';
      if (!groups[m]) groups[m] = [];
      groups[m].push(s);
    });
    return groups;
  }, [samplesData]);

  const form = useForm<AnalyteValues>({
    resolver: zodResolver(analyteSchema),
    defaultValues: { medium: 'water', parameterType: '', analyte: '', value: '' },
  });

  const handleSavePlanilla = async () => {
    if (!user || !template) return;
    setIsSavingPlanilla(true);

    const samplesCol = collection(db, 'samples');
    let savedCount = 0;
    const activeParams = templateId === 'personalizada' ? selectedParams : template.parametros;

    try {
      for (const param of activeParams) {
        const val = planillaValues[param.nombre];
        if (val && val.trim() !== '') {
          const sampleData = {
            medium: template.medium || param.mediumKey || 'water',
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

      if (savedCount > 0 && user.email) await updateDoc(reportRef, { editors: arrayUnion(user.email) });
      localStorage.removeItem(`dea_planilla_${reportId}_${templateId}`);
      setPlanillaValues({});
      toast({ title: "Planilla guardada", description: `Se registraron ${savedCount} parámetros.` });
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Error", description: "Falla al guardar planilla." });
    } finally {
      setIsSavingPlanilla(false);
    }
  };

  const handleSaveCustomTemplate = async () => {
    if (!user || !customTemplateName || selectedParams.length === 0) return;
    setIsSavingTemplate(true);
    const templateData = {
      name: customTemplateName,
      medium: 'water',
      userId: user.uid,
      createdAt: serverTimestamp(),
      parameters: selectedParams
    };
    try {
      await addDoc(collection(db, 'custom_templates'), templateData);
      toast({ title: "Plantilla guardada", description: "Ahora puedes usarla en futuros reportes." });
      setTemplate({ ...templateData, parametros: selectedParams });
    } catch (e) {
      console.error(e);
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const filteredParams = allParams.filter(p => 
    p.nombre.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.categoria.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleParam = (param: any) => {
    setSelectedParams(prev => 
      prev.find(p => p.nombre === param.nombre) 
        ? prev.filter(p => p.nombre !== param.nombre) 
        : [...prev, param]
    );
  };

  const mediumLabel = (m: string) => {
    const labels: any = { water: 'Agua', air: 'Aire', soil: 'Suelo/Sedim.', other: 'Otro' };
    return labels[m] || m;
  };

  return (
    <div className="space-y-4">
      <Card className="border-t-4 border-t-primary shadow-lg overflow-hidden">
        <CardHeader className="p-3 pb-2">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                {templateId === 'personalizada' && <Star className="h-4 w-4 text-primary fill-primary" />}
                {template?.nombre || template?.name || 'Carga de Analitos'}
              </CardTitle>
              <CardDescription className="text-[10px]">OID: <span className="font-bold text-primary">{reportData?.oid}</span></CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          {templateId === 'personalizada' && template?.parametros?.length === 0 ? (
            <div className="space-y-3 animate-in fade-in duration-300">
              <div className="space-y-2 bg-primary/5 p-3 rounded-md border border-primary/10">
                <Label className="text-[10px] uppercase font-bold text-primary">Nombre de tu Planilla</Label>
                <Input value={customTemplateName} onChange={(e) => setCustomTemplateName(e.target.value)} placeholder="Ej: Mi Monitoreo de Ríos" className="h-8 text-xs" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground flex items-center justify-between">
                  Elegí Parámetros ({selectedParams.length})
                  <span className="text-[8px] font-normal italic">Buscá entre {allParams.length} parámetros</span>
                </Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Filtrar por nombre o ley..." className="h-8 pl-8 text-xs" />
                </div>
                <ScrollArea className="h-48 border rounded-md p-1 bg-white">
                  <div className="space-y-0.5">
                    {filteredParams.map((p) => {
                      const isSelected = !!selectedParams.find(sp => sp.nombre === p.nombre);
                      return (
                        <div key={p.nombre} onClick={() => toggleParam(p)} className={cn("flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors", isSelected ? "bg-primary/10" : "hover:bg-muted/50")}>
                          <Checkbox checked={isSelected} className="h-3.5 w-3.5" />
                          <div className="flex-1 overflow-hidden">
                            <p className="text-[11px] font-bold truncate leading-none">{p.nombre}</p>
                            <p className="text-[8px] text-muted-foreground uppercase">{p.unidades} • {p.ley || 'Sin ley'}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
              <Button onClick={handleSaveCustomTemplate} className="w-full h-9 bg-accent hover:bg-accent/90 text-xs" disabled={!customTemplateName || selectedParams.length === 0 || isSavingTemplate}>
                {isSavingTemplate ? <Loader2 className="animate-spin h-4 w-4" /> : <Save className="mr-2 h-3.5 w-3.5" />}
                Guardar y Usar Planilla
              </Button>
            </div>
          ) : template ? (
            <div className="space-y-2 animate-in fade-in duration-300">
              <div className="grid grid-cols-1 gap-1.5">
                {(template.parametros || template.parameters).map((param: any) => (
                  <div key={param.nombre} className="flex items-center gap-2 p-2 rounded-sm bg-muted/20 border border-muted/20 group hover:border-primary/20 transition-all">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                         <Label className="text-[10px] font-bold text-primary leading-none truncate" title={param.nombre}>{param.nombre}</Label>
                         <span className="text-[9px] font-code bg-primary/10 text-primary px-1 rounded">{param.unidades}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 opacity-70">
                         <span className="text-[8px] text-muted-foreground uppercase font-bold">{param.categoria}</span>
                         {param.nivelGuia && (
                           <span className="text-[8px] text-destructive flex items-center gap-0.5 font-bold">
                             <Info className="h-2 w-2" /> Guía: {param.nivelGuia}
                           </span>
                         )}
                         {param.ley && <span className="text-[8px] text-muted-foreground italic truncate max-w-[120px]">Norma: {param.ley}</span>}
                      </div>
                    </div>
                    <Input 
                      placeholder="Valor" 
                      className="h-8 w-24 text-[11px] font-code py-0 px-2 bg-white text-right border-primary/20 focus:border-primary"
                      value={planillaValues[param.nombre] || ''}
                      onChange={(e) => setPlanillaValues(prev => ({...prev, [param.nombre]: e.target.value}))}
                    />
                  </div>
                ))}
              </div>
              <Button onClick={handleSavePlanilla} className="w-full h-10 mt-2 bg-primary hover:bg-primary/90 text-xs shadow-md" disabled={isSavingPlanilla || Object.keys(planillaValues).length === 0}>
                {isSavingPlanilla ? <Loader2 className="animate-spin h-4 w-4" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Guardar Datos en el Reporte
              </Button>
            </div>
          ) : templateId === 'manual' ? (
            <form onSubmit={form.handleSubmit((d) => {
              const sampleData = { ...d, reportId, stationId, userId: user?.uid, userEmail: user?.email, timestamp: serverTimestamp() };
              addDoc(collection(db, 'samples'), sampleData).then(() => {
                if (user?.email) updateDoc(reportRef, { editors: arrayUnion(user.email) });
                form.reset({ medium: d.medium, parameterType: d.parameterType, analyte: '', value: '' });
              });
            })} className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label className="text-[10px] uppercase font-bold">Medio</Label>
                <Select onValueChange={(v) => form.setValue('medium', v as any)} value={form.watch('medium')}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="water">Agua</SelectItem><SelectItem value="air">Aire</SelectItem><SelectItem value="soil">Suelo</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label className="text-[10px] uppercase font-bold">Categoría</Label><Input placeholder="Fisicoquímico" {...form.register('parameterType')} className="h-8 text-xs" /></div>
              <div className="space-y-1"><Label className="text-[10px] uppercase font-bold">Analito</Label><Input placeholder="pH" {...form.register('analyte')} className="h-8 text-xs" /></div>
              <div className="space-y-1"><Label className="text-[10px] uppercase font-bold">Valor</Label><Input placeholder="7.5" {...form.register('value')} className="h-8 text-xs" /></div>
              <Button type="submit" className="col-span-2 h-8 text-xs mt-1"><Plus className="h-3.5 w-3.5 mr-1" /> Agregar</Button>
            </form>
          ) : (
            <div className="py-8 flex flex-col items-center justify-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mb-2" /><p className="text-xs">Preparando planilla...</p></div>
          )}
        </CardContent>
      </Card>

      <Card className="border-t shadow-inner">
        <CardHeader className="p-3 pb-1 flex flex-row items-center justify-between">
          <CardTitle className="text-[11px] font-bold uppercase flex items-center gap-1.5 text-muted-foreground">
            <FlaskConical className="h-3.5 w-3.5" /> Analitos ({samplesData.length})
          </CardTitle>
          <Button onClick={onClose} size="sm" className="h-7 text-[10px] px-3 bg-green-600 hover:bg-green-700">Listo</Button>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-40 rounded-md">
            {Object.keys(groupedSamples).length === 0 ? (
              <div className="text-center py-6 text-[10px] italic text-muted-foreground">Sin datos registrados.</div>
            ) : (
              Object.entries(groupedSamples).map(([medium, items]) => (
                <div key={medium} className="mb-2">
                  <div className="bg-muted/40 px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground border-y flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    {mediumLabel(medium)}
                  </div>
                  <Table>
                    <TableBody>
                      {items.map((sample: any) => (
                        <TableRow key={sample.id} className="h-7 border-b-0 hover:bg-muted/30 transition-colors">
                          <TableCell className="text-[10px] py-1 pl-4 font-medium flex items-center gap-2">
                            {sample.analyte}
                            <span className="text-[8px] text-muted-foreground uppercase">({sample.parameterType})</span>
                          </TableCell>
                          <TableCell className="text-[10px] py-1 font-code text-primary font-bold text-right pr-4">
                            {sample.value}
                            <Check className="h-2.5 w-2.5 text-green-500 inline ml-1.5" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
