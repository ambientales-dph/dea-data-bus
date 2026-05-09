
'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { collection, doc, setDoc, addDoc, serverTimestamp, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { useFirestore, useUser, errorEmitter, FirestorePermissionError } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { MapPin, Send, PlusCircle, Database, Beaker, Loader2 } from 'lucide-react';
import { SelectedPoint } from '@/app/page';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

const stationSchema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
});

const sampleSchema = z.object({
  medium: z.enum(['water', 'air', 'soil']),
  parameterType: z.string().min(1, 'Seleccioná un tipo de parámetro'),
  analyte: z.string().min(1, 'Ingresá o seleccioná el analito'),
  value: z.string().min(1, 'Ingresá un valor'),
  unit: z.string().optional(),
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
  const [isGeneratingName, setIsGeneratingName] = useState(false);

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
      unit: '',
    },
  });

  // Lógica de nomenclatura automática: EM + CODIGO + Correlativo (4 dígitos)
  useEffect(() => {
    if (selectedPoint && !selectedPoint.stationId && selectedPoint.basinCode) {
      const generateNextName = async () => {
        setIsGeneratingName(true);
        const prefix = `EM${selectedPoint.basinCode}`;
        
        try {
          const stationsCol = collection(db, 'stations');
          // Buscamos el último punto con este mismo prefijo de cuenca
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
            // Extraer el número del final del nombre (ej: EMA0005 -> 5)
            const numberPart = lastName.substring(prefix.length);
            const parsed = parseInt(numberPart, 10);
            if (!isNaN(parsed)) {
              nextNumber = parsed + 1;
            }
          }

          const formattedName = `${prefix}${nextNumber.toString().padStart(4, '0')}`;
          stationForm.setValue('name', formattedName);
        } catch (error) {
          console.error("Error al generar nombre correlativo:", error);
          stationForm.setValue('name', `${prefix}0001`);
        } finally {
          setIsGeneratingName(false);
        }
      };

      generateNextName();
    } else if (selectedPoint && !selectedPoint.stationId && !selectedPoint.basinCode) {
      stationForm.setValue('name', '');
    }
  }, [selectedPoint, db, stationForm]);

  const handleCreateStation = (data: StationValues) => {
    if (!selectedPoint) return;
    
    const stationRef = doc(collection(db, 'stations'));
    const stationData = {
      name: data.name,
      latitude: selectedPoint.lat,
      longitude: selectedPoint.lon,
      basinCode: selectedPoint.basinCode || '',
      userId: user?.uid,
      userEmail: user?.email,
      createdAt: serverTimestamp(),
    };

    onStationCreated(stationRef.id, data.name);
    toast({
      title: "Estación registrada",
      description: `Se guardó el punto: ${data.name}`,
    });
    stationForm.reset();

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
    
    addDoc(samplesCol, sampleData)
      .then(() => {
        toast({
          title: "Medición guardada",
          description: "Los datos se vincularon correctamente.",
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
          <h3 className="text-lg font-bold text-primary">Iniciá la recolección</h3>
          <p className="text-sm text-muted-foreground">
            Hacé clic en un punto del mapa para crear una nueva estación o seleccioná una existente.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {selectedPoint.stationId ? (
        <Card className="border-primary/20 bg-primary/5 shadow-sm overflow-hidden">
          <CardHeader className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <CardTitle className="text-xl font-bold text-primary leading-tight">
                  {selectedPoint.name}
                </CardTitle>
                <CardDescription className="text-[11px] font-medium text-muted-foreground font-code">
                  {selectedPoint.lat.toFixed(6)}, {selectedPoint.lon.toFixed(6)}
                </CardDescription>
              </div>
              <Database className="h-5 w-5 text-primary/40 mt-1" />
            </div>
          </CardHeader>
        </Card>
      ) : (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2 text-primary">
              <PlusCircle className="h-5 w-5" />
              Nuevo Punto de Muestreo
            </CardTitle>
            <CardDescription className="text-xs font-code">
              {selectedPoint.lat.toFixed(6)}, {selectedPoint.lon.toFixed(6)}
              {selectedPoint.basinCode && ` • Cuenca: ${selectedPoint.basinCode}`}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {!selectedPoint.stationId ? (
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
      ) : (
        <div className="space-y-6">
          <Separator />
          <div className="flex items-center gap-2 mb-2">
            <Beaker className="h-5 w-5 text-primary" />
            <h3 className="font-bold text-primary">Registrar Medición</h3>
          </div>

          <form onSubmit={sampleForm.handleSubmit(onSampleSubmit)} className="space-y-4">
            <div className="space-y-4 bg-muted/20 p-4 rounded-xl border border-muted-foreground/10">
              <div className="space-y-2">
                <Label htmlFor="medium">Medio Ambiental</Label>
                <Select onValueChange={(v) => {
                  sampleForm.setValue('medium', v as any);
                  sampleForm.setValue('analyte', '');
                }} defaultValue="water">
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Seleccioná el medio" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="water">Agua</SelectItem>
                    <SelectItem value="air">Aire</SelectItem>
                    <SelectItem value="soil">Suelo / Sedimento</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="parameterType">Tipo de Parámetro</Label>
                <Select onValueChange={(v) => {
                  sampleForm.setValue('parameterType', v);
                  sampleForm.setValue('analyte', '');
                }}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Seleccioná categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="physicochemical">Fisicoquímico</SelectItem>
                    <SelectItem value="microbiological">Microbiológico</SelectItem>
                    <SelectItem value="metals">Metales Pesados</SelectItem>
                    <SelectItem value="organic">Orgánicos</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="analyte">Analito / Parámetro</Label>
                  <Input id="analyte" className="bg-white" placeholder="Ej: pH" {...sampleForm.register('analyte')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="value">Valor Medido</Label>
                  <Input id="value" className="bg-white" placeholder="Ej: 7.2" {...sampleForm.register('value')} />
                </div>
              </div>
            </div>

            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-white font-bold shadow-md">
              <Send className="mr-2 h-4 w-4" />
              Guardar en la estación
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
