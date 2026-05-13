
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { collection, query, where, addDoc, serverTimestamp, doc } from 'firebase/firestore';
import { useFirestore, useUser, useCollection, useDoc, errorEmitter, FirestorePermissionError } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Plus, Save, FlaskConical, CheckCircle2, User } from 'lucide-react';
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

  // Obtener datos del reporte para mostrar el OID
  const reportRef = useMemo(() => doc(db, 'reports', reportId), [db, reportId]);
  const { data: reportData } = useDoc(reportRef);

  // Consulta simple para analitos
  const samplesQuery = useMemo(() => {
    return query(
      collection(db, 'samples'),
      where('reportId', '==', reportId)
    );
  }, [db, reportId]);

  const { data: samplesData } = useCollection(samplesQuery);

  // Ordenamiento en memoria para asegurar consistencia
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

  // Restaurar borrador de analito tras reinicio de sesión
  useEffect(() => {
    const savedDraft = localStorage.getItem(`dea_draft_${reportId}`);
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft);
        form.reset(parsed);
      } catch (e) {
        console.error('Error al restaurar borrador', e);
      }
    }
  }, [reportId, form]);

  // Guardar borrador en tiempo real
  useEffect(() => {
    const subscription = form.watch((value) => {
      localStorage.setItem(`dea_draft_${reportId}`, JSON.stringify(value));
    });
    return () => subscription.unsubscribe();
  }, [form, reportId]);

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

    const samplesCol = collection(db, 'samples');
    
    addDoc(samplesCol, sampleData)
      .then(() => {
        // Al guardar exitosamente, limpiamos el borrador del analito actual
        localStorage.removeItem(`dea_draft_${reportId}`);
        form.reset({
          medium: data.medium,
          parameterType: data.parameterType,
          analyte: '',
          value: '',
        });
      })
      .catch(async (error) => {
        const permissionError = new FirestorePermissionError({
          path: 'samples',
          operation: 'create',
          requestResourceData: sampleData,
        });
        errorEmitter.emit('permission-error', permissionError);
      });

    toast({
      title: "Analito agregado",
      description: `${data.analyte} registrado correctamente.`,
    });
  };

  const handleFinishSession = () => {
    // Al finalizar sesión de carga, limpiamos los metadatos de borrador
    localStorage.removeItem(`dea_draft_${reportId}`);
    onClose();
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
              <CardTitle className="text-lg">Carga de Analitos</CardTitle>
              <CardDescription>Reporte: <span className="font-bold text-primary">{reportData?.oid || 'Cargando...'}</span></CardDescription>
            </div>
            <Badge variant="outline" className="text-primary border-primary">
              Activo
            </Badge>
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground bg-muted/30 p-2 rounded-md">
            <User className="h-3 w-3" />
            <span>Técnico: <strong>{user?.email}</strong></span>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(handleAddAnalyte)} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Medio</Label>
              <Select 
                onValueChange={(v) => form.setValue('medium', v as any)} 
                value={form.watch('medium')}
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
                placeholder="Ej: Fisicoquímico" 
                {...form.register('parameterType')}
              />
            </div>

            <div className="space-y-2">
              <Label>Analito</Label>
              <Input 
                placeholder="Ej: pH" 
                {...form.register('analyte')}
              />
            </div>

            <div className="space-y-2">
              <Label>Valor / Unidad</Label>
              <Input 
                placeholder="Ej: 7.2" 
                {...form.register('value')}
              />
            </div>

            <div className="md:col-span-2 pt-2">
              <Button type="submit" className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                Agregar Analito
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-md flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-primary" />
            Analitos en este Reporte
          </CardTitle>
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
                      Cargá el primer analito para verlo aquí.
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
                          Registrado
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
        <CardFooter className="pt-6 border-t bg-muted/5 flex justify-end">
          <Button onClick={handleFinishSession} variant="default" className="bg-green-600 hover:bg-green-700">
            <Save className="mr-2 h-4 w-4" />
            Finalizar Sesión de Carga
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
