
'use client';

import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { collection, query, where, addDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { useFirestore, useUser, useCollection } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Plus, Save, Thermometer, Droplets, FlaskConical, CheckCircle2, User } from 'lucide-react';
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
}

export function SamplingReportForm({ reportId, stationId, onClose }: SamplingReportFormProps) {
  const { toast } = useToast();
  const db = useFirestore();
  const { user } = useUser();
  const [isSaving, setIsSaving] = useState(false);

  // Obtener analitos ya guardados en este reporte
  const samplesQuery = useMemo(() => {
    return query(
      collection(db, 'samples'),
      where('reportId', '==', reportId),
      orderBy('timestamp', 'asc')
    );
  }, [db, reportId]);

  const { data: savedSamples, loading: samplesLoading } = useCollection(samplesQuery);

  const form = useForm<AnalyteValues>({
    resolver: zodResolver(analyteSchema),
    defaultValues: {
      medium: 'water',
      parameterType: '',
      analyte: '',
      value: '',
    },
  });

  const handleAddAnalyte = async (data: AnalyteValues) => {
    if (!user) return;
    setIsSaving(true);

    try {
      const sampleData = {
        ...data,
        reportId,
        stationId,
        userId: user.uid,
        userEmail: user.email,
        timestamp: serverTimestamp(),
      };

      await addDoc(collection(db, 'samples'), sampleData);
      
      form.reset({
        medium: data.medium,
        parameterType: data.parameterType,
        analyte: '',
        value: '',
      });

      toast({
        title: "Analito agregado",
        description: `${data.analyte} registrado correctamente.`,
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo guardar el analito."
      });
    } finally {
      setIsSaving(false);
    }
  };

  const mediumLabel = (m: string) => {
    const labels: any = { water: 'Agua', air: 'Aire', soil: 'Suelo' };
    return labels[m] || m;
  };

  return (
    <div className="space-y-6">
      <Card className="border-t-4 border-t-primary shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Nuevo Reporte de Muestreo</CardTitle>
              <CardDescription>Carga de parámetros físico-químicos y biológicos.</CardDescription>
            </div>
            <Badge variant="outline" className="text-primary border-primary">
              ID: {reportId.substring(0, 8)}
            </Badge>
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground bg-muted/30 p-2 rounded-md">
            <User className="h-3 w-3" />
            <span>Técnico responsable: <strong>{user?.email}</strong></span>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(handleAddAnalyte)} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Medio</Label>
              <Select 
                onValueChange={(v) => form.setValue('medium', v as any)} 
                defaultValue={form.getValues('medium')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar medio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="water">Agua</SelectItem>
                  <SelectItem value="air">Aire</SelectItem>
                  <SelectItem value="soil">Suelo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Categoría / Tipo</Label>
              <Input 
                placeholder="Ej: Fisicoquímico, Metales" 
                {...form.register('parameterType')}
              />
            </div>

            <div className="space-y-2">
              <Label>Analito (Parámetro)</Label>
              <Input 
                placeholder="Ej: pH, Plomo, PM10" 
                {...form.register('analyte')}
              />
            </div>

            <div className="space-y-2">
              <Label>Valor / Resultado</Label>
              <Input 
                placeholder="Ej: 7.2, 0.05 mg/L" 
                {...form.register('value')}
              />
            </div>

            <div className="md:col-span-2 pt-2">
              <Button type="submit" className="w-full" disabled={isSaving}>
                <Plus className="mr-2 h-4 w-4" />
                Agregar Analito al Reporte
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-md flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-primary" />
            Analitos Registrados
          </CardTitle>
          <CardDescription>
            Mediciones guardadas en este reporte. No se pueden modificar una vez registradas.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[300px] rounded-md border-t">
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
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground italic">
                      No hay analitos cargados aún.
                    </TableCell>
                  </TableRow>
                ) : (
                  savedSamples.map((sample: any) => (
                    <TableRow key={sample.id}>
                      <TableCell className="text-xs py-2">{mediumLabel(sample.medium)}</TableCell>
                      <TableCell className="text-xs py-2 font-medium">{sample.analyte}</TableCell>
                      <TableCell className="text-xs py-2 font-code">{sample.value}</TableCell>
                      <TableCell className="text-right py-2">
                        <Badge variant="ghost" className="text-green-600 bg-green-50 gap-1 h-5 px-1.5">
                          <CheckCircle2 className="h-3 w-3" />
                          Guardado
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
        <CardFooter className="pt-6 border-t bg-muted/5 flex justify-between items-center">
          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">
            {savedSamples.length} Analitos en sesión
          </p>
          <Button onClick={onClose} variant="default" className="bg-green-600 hover:bg-green-700">
            <Save className="mr-2 h-4 w-4" />
            Guardar y Cerrar Reporte
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
