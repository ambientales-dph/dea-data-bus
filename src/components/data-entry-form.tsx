
'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { collection, doc, setDoc, serverTimestamp, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { useFirestore, useUser, errorEmitter, FirestorePermissionError } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { MapPin, Send, PlusCircle, Database, FileText, Search, Loader2 } from 'lucide-react';
import { SelectedPoint } from '@/app/page';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

const stationSchema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
});

type StationValues = z.infer<typeof stationSchema>;

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
        <div className="space-y-4">
          <Separator />
          <div className="grid grid-cols-1 gap-3 pt-2">
            <Button 
              className="w-full h-14 text-md font-bold flex items-center gap-3 bg-primary hover:bg-primary/90"
              onClick={() => toast({ title: "Próximamente", description: "Módulo de reportes en desarrollo" })}
            >
              <FileText className="h-5 w-5" />
              Crear reporte de muestreo
            </Button>
            
            <Button 
              variant="outline" 
              className="w-full h-14 text-md font-bold flex items-center gap-3 border-primary text-primary hover:bg-primary/5"
              onClick={() => toast({ title: "Próximamente", description: "Módulo de consulta en desarrollo" })}
            >
              <Search className="h-5 w-5" />
              Consultar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
