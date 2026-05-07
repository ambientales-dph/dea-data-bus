
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { collection, doc, setDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore, useUser, errorEmitter, FirestorePermissionError } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { MapPin, Send, Loader2, PlusCircle, Database } from 'lucide-react';
import { SelectedPoint } from '@/app/page';
import { Separator } from '@/components/ui/separator';

const stationSchema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
});

const sampleSchema = z.object({
  medium: z.enum(['water', 'air', 'soil']),
  parameterType: z.string().min(1, 'Seleccione un tipo de parámetro'),
  analyte: z.string().min(1, 'Ingrese el analito'),
  value: z.string().min(1, 'Ingrese un valor'),
});

type StationValues = z.infer<typeof stationSchema>;
type SampleValues = z.infer<typeof sampleSchema>;

export function DataEntryForm({ 
  selectedPoint,
  onStationCreated
}: { 
  selectedPoint: SelectedPoint | null;
  onStationCreated: (id: string, name: string) => void;
}) {
  const { toast } = useToast();
  const db = useFirestore();
  const { user } = useUser();
  const [loading, setLoading] = useState(false);

  const stationForm = useForm<StationValues>({
    resolver: zodResolver(stationSchema),
    defaultValues: { name: '' },
  });

  const sampleForm = useForm<SampleValues>({
    resolver: zodResolver(sampleSchema),
    defaultValues: {
      medium: 'water',
      parameterType: '',
      analyte: '',
      value: '',
    },
  });

  const handleCreateStation = (data: StationValues) => {
    if (!selectedPoint) return;
    
    const stationRef = doc(collection(db, 'stations'));
    const stationData = {
      name: data.name,
      latitude: selectedPoint.lat,
      longitude: selectedPoint.lon,
      userId: user?.uid,
      userEmail: user?.email,
      createdAt: serverTimestamp(),
    };

    // Respuesta inmediata en la UI
    onStationCreated(stationRef.id, data.name);
    toast({
      title: "Estación registrada",
      description: `Se ha iniciado el registro de: ${data.name}`,
    });
    stationForm.reset();

    // Operación en segundo plano (siguiendo lineamientos de no await)
    setDoc(stationRef, stationData)
      .catch(async (error) => {
        const permissionError = new FirestorePermissionError({
          path: stationRef.path,
          operation: 'create',
          requestResourceData: stationData,
        });
        errorEmitter.emit('permission-error', permissionError);
      });
  };

  const onSampleSubmit = (data: SampleValues) => {
    if (!selectedPoint?.stationId) return;
    
    const sampleData = {
      ...data,
      stationId: selectedPoint.stationId,
      timestamp: serverTimestamp(),
      userId: user?.uid,
      userEmail: user?.email,
    };

    const samplesCol = collection(db, 'samples');
    
    toast({
      title: "Enviando medición",
      description: "Los datos se están procesando...",
    });

    addDoc(samplesCol, sampleData)
      .then(() => {
        toast({
          title: "Medición guardada",
          description: "Los datos se han vinculado correctamente.",
        });
        sampleForm.reset({
          ...sampleForm.getValues(),
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
  };

  if (!selectedPoint) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4 px-4">
        <div className="p-6 bg-primary/5 rounded-full">
          <MapPin className="h-12 w-12 text-primary/40 animate-pulse" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-primary">Inicie la recolección</h3>
          <p className="text-sm text-muted-foreground">
            Haga clic en un punto del mapa para crear una nueva estación o seleccione una existente para cargar datos.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 text-primary">
            {selectedPoint.stationId ? <Database className="h-5 w-5" /> : <PlusCircle className="h-5 w-5" />}
            {selectedPoint.stationId ? 'Estación Seleccionada' : 'Nuevo Punto de Muestreo'}
          </CardTitle>
          <CardDescription>
            {selectedPoint.lat.toFixed(6)}, {selectedPoint.lon.toFixed(6)}
          </CardDescription>
        </CardHeader>
        {selectedPoint.stationId && (
          <CardContent>
            <div className="bg-white rounded-lg border p-3 shadow-sm">
              <p className="text-xs text-muted-foreground uppercase font-bold tracking-tighter">Denominación</p>
              <p className="text-xl font-bold text-primary">{selectedPoint.name}</p>
            </div>
          </CardContent>
        )}
      </Card>

      {!selectedPoint.stationId ? (
        <Card className="border-t-4 border-t-accent shadow-lg">
          <CardHeader>
            <CardTitle className="text-md">Definir Estación</CardTitle>
            <CardDescription>Nombre este punto para guardarlo permanentemente en la base de datos.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={stationForm.handleSubmit(handleCreateStation)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="station-name">Nombre de la Estación</Label>
                <Input 
                  id="station-name" 
                  placeholder="Ej: Estación Río Luján 01"
                  {...stationForm.register('name')} 
                />
                {stationForm.formState.errors.name && (
                  <p className="text-xs text-destructive">{stationForm.formState.errors.name.message}</p>
                )}
              </div>
              <Button type="submit" className="w-full bg-accent hover:bg-accent/90 text-white">
                <Send className="mr-2 h-4 w-4" />
                Guardar Punto en Mapa
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <Separator />
          <div className="flex items-center gap-2 mb-2">
            <Send className="h-5 w-5 text-primary" />
            <h3 className="font-bold text-primary">Registrar Medición</h3>
          </div>

          <form onSubmit={sampleForm.handleSubmit(onSampleSubmit)} className="space-y-4">
            <div className="space-y-4 bg-muted/20 p-4 rounded-xl border border-muted-foreground/10">
              <div className="space-y-2">
                <Label htmlFor="medium">Medio Ambiental</Label>
                <Select onValueChange={(v) => sampleForm.setValue('medium', v as any)} defaultValue="water">
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Seleccione el medio" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="water">Agua (Superficial/Subterránea)</SelectItem>
                    <SelectItem value="air">Aire</SelectItem>
                    <SelectItem value="soil">Suelo / Sedimentos</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="parameterType">Tipo de Parámetro</Label>
                <Select onValueChange={(v) => sampleForm.setValue('parameterType', v)}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Seleccione categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="physicochemical">Fisicoquímico</SelectItem>
                    <SelectItem value="microbiological">Microbiológico</SelectItem>
                    <SelectItem value="metals">Metales Pesados</SelectItem>
                    <SelectItem value="organic">Compuestos Orgánicos</SelectItem>
                    <SelectItem value="flow">Aforo / Caudal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="analyte">Analito / Parámetro</Label>
                  <Input 
                    id="analyte" 
                    className="bg-white"
                    placeholder="Ej: pH, Turbiedad, Plomo"
                    {...sampleForm.register('analyte')} 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="value">Valor Medido</Label>
                  <Input 
                    id="value" 
                    className="bg-white"
                    placeholder="Ej: 7.2"
                    {...sampleForm.register('value')} 
                  />
                </div>
              </div>
            </div>

            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-white font-bold">
              <Send className="mr-2 h-4 w-4" />
              Guardar en la Estación
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
