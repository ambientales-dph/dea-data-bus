
'use client';

import { useState, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
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
import { MapPin, Send, PlusCircle, Database, Beaker } from 'lucide-react';
import { SelectedPoint } from '@/app/page';
import { Separator } from '@/components/ui/separator';

const WATER_ANALYTES = [
  { name: 'Temperatura', unit: '°C' },
  { name: 'Ph', unit: 'upH' },
  { name: 'Salinidad', unit: 'PSU' },
  { name: 'Conductividad', unit: 'mS/cm' },
  { name: 'Solidos Disueltos Totales', unit: 'g/l' },
  { name: 'Oxigeno Disuelto', unit: 'mg/l' },
  { name: 'Saturación de oxigeno in situ', unit: '%' },
  { name: 'Profundidad disco Secchi', unit: 'cm' },
  { name: 'Turbiedad', unit: 'NTU' },
  { name: 'Caudal', unit: 'm3/s' },
  { name: 'Precipitaciones', unit: 'mml' },
  { name: 'Q estimado', unit: 'm3/s' },
  { name: 'Q Instantaneo', unit: 'm3/s' },
  { name: 'H (nivel hidrometrico rio Salado)', unit: 'm IGM' },
  { name: 'H g (nivel del rio Salado)', unit: 'm' },
  { name: 'Transparencia', unit: 'cm' },
  { name: 'Velocidad de corriente', unit: 'm/s' },
  { name: 'Sólidos sedimentables 10m', unit: 'mg/l' },
  { name: 'Sólidos sedimentables 1h', unit: 'mg/l' },
  { name: 'Solidos Suspendidos', unit: 'mg/l' },
  { name: 'Sólidos totales secados a 105°C-180°C', unit: 'mg/l' },
  { name: 'Cloruros', unit: 'mg/l' },
  { name: 'Sulfatos', unit: 'mg/l' },
  { name: 'Nitrogeno Amoniacal', unit: 'mg/l' },
  { name: 'Amonio', unit: 'mg/l' },
  { name: 'Nitrogeno total', unit: 'mg/l' },
  { name: 'Fosforo total', unit: 'mg/l' },
  { name: 'Fosforo reactivo soluble', unit: 'mg/l' },
  { name: 'Clorofila a', unit: 'ug/l' },
  { name: 'Materia organica', unit: 'mg/l' },
  { name: 'DB05', unit: 'mg/l' },
  { name: 'DQO', unit: 'mg/l' },
  { name: 'Dureza Total', unit: 'mg/l' },
  { name: 'Nitratos', unit: 'mg/l' },
  { name: 'Arsenico', unit: 'mg/ml' },
  { name: 'Cadmio', unit: 'ug/l' },
  { name: 'Cobre', unit: 'mg/l' },
  { name: 'Cromo', unit: 'mg/l' },
  { name: 'Hierro', unit: 'mg/l' },
  { name: 'Magnesio', unit: 'mg/l' },
  { name: 'Mercurio', unit: 'mg/l' },
  { name: 'Níquel', unit: 'mg/l' },
  { name: 'Plomo', unit: 'mg/l' },
  { name: 'Zinc', unit: 'mg/l' },
  { name: 'Carbonatos', unit: 'mg/l' },
  { name: 'Bicarbonatos', unit: 'mg/l' },
  { name: 'Amoníaco', unit: 'mg/l' },
  { name: 'Fluoruros', unit: 'mg/l' },
  { name: 'Nitritos', unit: 'mg/l' },
  { name: 'Sodio', unit: 'mg/l' },
  { name: 'Potasio', unit: 'mg/l' },
  { name: 'Glifosato', unit: 'mg/l' },
  { name: 'Alcalinidad Tot', unit: 'mg/l' },
  { name: '% Saturación de O2 a 20°', unit: '%' },
  { name: 'PRS', unit: 'ug/L' },
  { name: 'Solidos Sedimentados', unit: 'mg/l' },
];

const MICROBIOLOGICAL_WATER_ANALYTES = [
  // Fitoplancton
  { name: 'Anabaena sp', unit: 'indiv./litro' },
  { name: 'Aphanizomenon sp', unit: 'indiv./litro' },
  { name: 'aff Aphanocapsa', unit: 'indiv./litro' },
  { name: 'Aphanocapsa/Microcystis', unit: 'indiv./litro' },
  { name: 'Arthrospira sp.', unit: 'indiv./litro' },
  { name: 'aff Coelosphaerium', unit: 'indiv./litro' },
  { name: 'Dolichospermum spiroides', unit: 'indiv./litro' },
  { name: 'Merismopedia aff tenuissima', unit: 'indiv./litro' },
  { name: 'Microcystis aeruginosa', unit: 'indiv./litro' },
  { name: 'Phormidium aff okenii', unit: 'indiv./litro' },
  { name: 'Planktolyngbya sp.', unit: 'indiv./litro' },
  { name: 'Planktothrix sp.', unit: 'indiv./litro' },
  { name: 'Pseudanabaena', unit: 'indiv./litro' },
  { name: 'Raphidiopsis aff mediterranea', unit: 'indiv./litro' },
  { name: 'aff Euglena acus', unit: 'indiv./litro' },
  { name: 'aff Euglena ehrenbergii', unit: 'indiv./litro' },
  { name: 'aff Euglena polymorpha', unit: 'indiv./litro' },
  { name: 'Trachelomonas spp.', unit: 'indiv./litro' },
  { name: 'Peridinium spp.', unit: 'indiv./litro' },
  { name: 'Actinastrum aff hantzschii', unit: 'indiv./litro' },
  { name: 'Closterium sp. 1', unit: 'indiv./litro' },
  { name: 'Coelastrum aff astroideum', unit: 'indiv./litro' },
  { name: 'aff Coelastrum', unit: 'indiv./litro' },
  { name: 'Cosmarium aff phaseolum', unit: 'indiv./litro' },
  { name: 'Desmodesmus aff intermedius', unit: 'indiv./litro' },
  { name: 'Desmodesmus aff spinosus', unit: 'indiv./litro' },
  { name: 'Dictyosphaerium spp.', unit: 'indiv./litro' },
  { name: 'Eudorina sp.', unit: 'indiv./litro' },
  { name: 'Monoraphidium aff arcuatum', unit: 'indiv./litro' },
  { name: 'Monoraphidium "aff griffithii"', unit: 'indiv./litro' },
  { name: 'Monoraphidium aff minutum', unit: 'indiv./litro' },
  { name: 'Oocystis spp', unit: 'indiv./litro' },
  { name: 'Pediastrum boryanum', unit: 'indiv./litro' },
  { name: 'Pediastrum duplex', unit: 'indiv./litro' },
  { name: 'Scenedesmus aff acuminatus', unit: 'indiv./litro' },
  { name: 'Scenedesmus aff quadricauda', unit: 'indiv./litro' },
  { name: 'aff Tetraedron trigonum', unit: 'indiv./litro' },
  { name: 'aff Tetrastrum staurogeniaeforme', unit: 'indiv./litro' },
  { name: 'Tetrastrum triangulare', unit: 'indiv./litro' },
  { name: 'Amphora ovalis', unit: 'indiv./litro' },
  { name: 'Anomoeoneis sp.', unit: 'indiv./litro' },
  { name: 'Aulacoseira granulata', unit: 'indiv./litro' },
  { name: 'Bacillaria sp.', unit: 'indiv./litro' },
  { name: 'Campylodiscus clypeus', unit: 'indiv./litro' },
  { name: 'Cyclotella meneghiniana', unit: 'indiv./litro' },
  { name: 'aff Cyclotella atomus', unit: 'indiv./litro' },
  { name: 'aff Diploneis', unit: 'indiv./litro' },
  { name: 'Entomoneis aff alata', unit: 'indiv./litro' },
  { name: 'Gomphonema augur', unit: 'indiv./litro' },
  { name: 'Gyrosigma sp.', unit: 'indiv./litro' },
  { name: 'Halamphora coffeaeformis', unit: 'indiv./litro' },
  { name: 'aff Hippodonta hungarica', unit: 'indiv./litro' },
  { name: 'Navicula aff cryptocephala', unit: 'indiv./litro' },
  { name: 'Navicula veneta', unit: 'indiv./litro' },
  { name: 'Nitzschia aff acicularis', unit: 'indiv./litro' },
  { name: 'Nitzschia aff linearis', unit: 'indiv./litro' },
  { name: 'Nitzschia aff palea', unit: 'indiv./litro' },
  { name: 'Nitzschia aff reversa', unit: 'indiv./litro' },
  { name: 'aff Nitzschia sigmoidea', unit: 'indiv./litro' },
  { name: 'aff Pleurosira laevis', unit: 'indiv./litro' },
  { name: 'Pseudostaurosira brevistriata', unit: 'indiv./litro' },
  { name: 'Pseudostaurosira subsalina', unit: 'indiv./litro' },
  { name: 'Rhopalodia sp.', unit: 'indiv./litro' },
  { name: 'Surirella striatula', unit: 'indiv./litro' },
  { name: 'Synedra sp.', unit: 'indiv./litro' },
  { name: 'Scenedesmus aff ecornis', unit: 'indiv./litro' },
  { name: 'Scenedesmus aff apoliensis', unit: 'indiv./litro' },
  { name: 'Scenedesmus aff acutus', unit: 'indiv./litro' },
  { name: 'Actinastrum sp', unit: 'indiv./litro' },
  { name: 'aff Golenkinia', unit: 'indiv./litro' },
  { name: 'Amphora sp', unit: 'indiv./litro' },
  { name: 'Anabaena spiroides', unit: 'indiv./litro' },
  { name: 'Anabaenopsis sp', unit: 'indiv./litro' },
  { name: 'Ankistrodesmus sp.', unit: 'indiv./litro' },
  { name: 'Binuclearia sp.', unit: 'indiv./litro' },
  { name: 'Chaetoceros aff muelleri', unit: 'indiv./litro' },
  { name: 'Chorococcal aff Coelup', unit: 'indiv./litro' },
  { name: 'Chroococcus sp', unit: 'indiv./litro' },
  { name: 'Clorofita 1', unit: 'indiv./litro' },
  { name: 'Coelastrum sp.', unit: 'indiv./litro' },
  { name: 'Crucigenia aff quadrata', unit: 'indiv./litro' },
  { name: 'Cyclotella sp', unit: 'indiv./litro' },
  { name: 'diatomea pennada 1', unit: 'indiv./litro' },
  { name: 'Dictyosphaerium aff Eutetramorus', unit: 'indiv./litro' },
  { name: 'Entomoneis sp.', unit: 'indiv./litro' },
  { name: 'Euglena sp. 1', unit: 'indiv./litro' },
  { name: 'Euglena sp', unit: 'indiv./litro' },
  { name: 'Eutetramorus sp.', unit: 'indiv./litro' },
  { name: 'Golenkinia sp.', unit: 'indiv./litro' },
  { name: 'Lyngbya sp.', unit: 'indiv./litro' },
  { name: 'Merismopedia aff minima', unit: 'indiv./litro' },
  { name: 'Merismopedia sp.', unit: 'indiv./litro' },
  { name: 'Microcystis aff aeruginosa', unit: 'indiv./litro' },
  { name: 'Microcystis aff firma', unit: 'indiv./litro' },
  { name: 'Navicula sp', unit: 'indiv./litro' },
  { name: 'Nitzschia aff sigma', unit: 'indiv./litro' },
  { name: 'Oscillatoria aff planktolyngbya', unit: 'indiv./litro' },
  { name: 'Pediastrum aff tetras', unit: 'indiv./litro' },
  { name: 'Phormidium sp', unit: 'indiv./litro' },
  { name: 'Planktothrix', unit: 'indiv./litro' },
  { name: 'Pleurocapsal aff raphidiopsis', unit: 'indiv./litro' },
  { name: 'Raphidiopsis aff curvata', unit: 'indiv./litro' },
  { name: 'Scenedesmus "quadricauda"', unit: 'indiv./litro' },
  { name: 'Scenedesmus sp. 1', unit: 'indiv./litro' },
  { name: 'Scenedesmus sp. 2', unit: 'indiv./litro' },
  { name: 'Surirella aff striatula', unit: 'indiv./litro' },
  { name: 'Tetraedron aff minimum', unit: 'indiv./litro' },
  { name: 'Tetrastrum aff staurogeniaeforme', unit: 'indiv./litro' },
  { name: 'Tetrastrum sp. 2', unit: 'indiv./litro' },
  // Zooplancton
  { name: 'Ciliophora indeterminado', unit: 'indiv./litro' },
  { name: 'Didinium aff. nasatum', unit: 'indiv./litro' },
  { name: 'Epistylis sp.', unit: 'indiv./litro' },
  { name: 'Halteria simplex', unit: 'indiv./litro' },
  { name: 'Litonotus sp.', unit: 'indiv./litro' },
  { name: 'Paramecium caudatum', unit: 'indiv./litro' },
  { name: 'Strobilidium sp.', unit: 'indiv./litro' },
  { name: 'Tokophrya sp.', unit: 'indiv./litro' },
  { name: 'Vorticella campanula', unit: 'indiv./litro' },
  { name: 'Vorticella sp.', unit: 'indiv./litro' },
  { name: 'Zooides libres', unit: 'indiv./litro' },
  { name: 'A. hemisphaerica', unit: 'indiv./litro' },
  { name: 'Bdeloideo', unit: 'indiv./litro' },
  { name: 'Brachionus angularis', unit: 'indiv./litro' },
  { name: 'B. calyciflorus', unit: 'indiv./litro' },
  { name: 'B. caudatus', unit: 'indiv./litro' },
  { name: 'B. ibericus', unit: 'indiv./litro' },
  { name: 'B. plicatilis', unit: 'indiv./litro' },
  { name: 'B. urceolaris', unit: 'indiv./litro' },
  { name: 'Cephalodella sp1', unit: 'indiv./litro' },
  { name: 'Cephalodella sp2', unit: 'indiv./litro' },
  { name: 'Filinia longiseta', unit: 'indiv./litro' },
  { name: 'F. terminalis', unit: 'indiv./litro' },
  { name: 'K. tropica', unit: 'indiv./litro' },
  { name: 'K. quadrata', unit: 'indiv./litro' },
  { name: 'L. patella', unit: 'indiv./litro' },
  { name: 'Notholca acuminata', unit: 'indiv./litro' },
  { name: 'N. squamula', unit: 'indiv./litro' },
  { name: 'Polyarthra vulgaris', unit: 'indiv./litro' },
  { name: 'Proalides sp.', unit: 'indiv./litro' },
  { name: 'Synchaeta sp.', unit: 'indiv./litro' },
  { name: 'Cyclopoida sp 1', unit: 'indiv./litro' },
  { name: 'Cyclopoida sp 2', unit: 'indiv./litro' },
];

const stationSchema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
});

const sampleSchema = z.object({
  medium: z.enum(['water', 'air', 'soil']),
  parameterType: z.string().min(1, 'Seleccione un tipo de parámetro'),
  analyte: z.string().min(1, 'Ingrese o seleccione el analito'),
  value: z.string().min(1, 'Ingrese un valor'),
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

  const selectedMedium = useWatch({
    control: sampleForm.control,
    name: 'medium',
  });

  const selectedParameterType = useWatch({
    control: sampleForm.control,
    name: 'parameterType',
  });

  const selectedAnalyte = useWatch({
    control: sampleForm.control,
    name: 'analyte',
  });

  const availableAnalytes = useMemo(() => {
    if (selectedMedium !== 'water') return [];
    
    if (selectedParameterType === 'microbiological') {
      return MICROBIOLOGICAL_WATER_ANALYTES;
    }
    
    return WATER_ANALYTES;
  }, [selectedMedium, selectedParameterType]);

  const currentUnit = useMemo(() => {
    if (selectedMedium === 'water') {
      const allWaterAnalytes = [...WATER_ANALYTES, ...MICROBIOLOGICAL_WATER_ANALYTES];
      const found = allWaterAnalytes.find(a => a.name === selectedAnalyte);
      return found?.unit || '';
    }
    return '';
  }, [selectedMedium, selectedAnalyte]);

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

    onStationCreated(stationRef.id, data.name);
    toast({
      title: "Estación registrada",
      description: `Se ha iniciado el registro de: ${data.name}`,
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
      unit: currentUnit || data.unit,
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
      {selectedPoint.stationId ? (
        <Card className="border-primary/20 bg-primary/5 shadow-sm overflow-hidden">
          <CardHeader className="p-4 space-y-0">
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
            </CardDescription>
          </CardHeader>
        </Card>
      )}

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
                <Select onValueChange={(v) => {
                  sampleForm.setValue('parameterType', v);
                  sampleForm.setValue('analyte', '');
                }}>
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
                  {availableAnalytes.length > 0 ? (
                    <Select onValueChange={(v) => sampleForm.setValue('analyte', v)}>
                      <SelectTrigger className="bg-white">
                        <SelectValue placeholder="Seleccione el analito" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        {availableAnalytes.map((a) => (
                          <SelectItem key={a.name} value={a.name}>
                            {a.name} ({a.unit})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input 
                      id="analyte" 
                      className="bg-white"
                      placeholder="Ej: pH, Turbiedad, Plomo"
                      {...sampleForm.register('analyte')} 
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="value">Valor Medido {currentUnit && `(${currentUnit})`}</Label>
                  <div className="flex gap-2">
                    <Input 
                      id="value" 
                      className="bg-white flex-1"
                      placeholder="Ej: 7.2"
                      {...sampleForm.register('value')} 
                    />
                    {currentUnit && (
                      <div className="bg-muted px-3 flex items-center rounded-md border text-xs font-bold text-muted-foreground whitespace-nowrap">
                        {currentUnit}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-white font-bold shadow-md">
              <Send className="mr-2 h-4 w-4" />
              Guardar en la Estación
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
