
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { aiGuidedParameterSelection, AiGuidedParameterSelectionOutput } from '@/ai/flows/ai-guided-parameter-selection-flow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Sparkles, MapPin, Send, Loader2, Info } from 'lucide-react';

const formSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  medium: z.enum(['water', 'air', 'soil']),
  parameterType: z.string().min(1, 'Seleccione un tipo de parámetro'),
  analyte: z.string().min(1, 'Ingrese el analito'),
  value: z.string().min(1, 'Ingrese un valor'),
});

type FormValues = z.infer<typeof formSchema>;

export function DataEntryForm({ 
  location 
}: { 
  location: { lat: number, lon: number } | null 
}) {
  const { toast } = useToast();
  const db = useFirestore();
  const { user } = useUser();
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AiGuidedParameterSelectionOutput | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      latitude: location?.lat || 0,
      longitude: location?.lon || 0,
      medium: 'water',
      parameterType: '',
      analyte: '',
      value: '',
    },
  });

  const handleAiSuggest = async () => {
    if (!location) {
      toast({
        title: "Ubicación requerida",
        description: "Seleccione un punto en el mapa primero.",
        variant: "destructive"
      });
      return;
    }

    setAiLoading(true);
    try {
      const result = await aiGuidedParameterSelection({
        latitude: location.lat,
        longitude: location.lon,
        environmentalMedium: form.getValues('medium'),
      });
      setAiSuggestions(result);
    } catch (error) {
      toast({
        title: "Error de IA",
        description: "No se pudieron obtener sugerencias en este momento.",
        variant: "destructive"
      });
    } finally {
      setAiLoading(false);
    }
  };

  const onSubmit = async (data: FormValues) => {
    setLoading(true);
    try {
      addDoc(collection(db, 'samples'), {
        ...data,
        location: { lat: data.latitude, lon: data.longitude },
        timestamp: serverTimestamp(),
        userId: user?.uid,
        userEmail: user?.email,
      });
      toast({
        title: "Éxito",
        description: "Datos guardados correctamente.",
      });
      form.reset({
        ...form.getValues(),
        analyte: '',
        value: '',
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Hubo un problema al guardar los datos.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-none shadow-none bg-transparent">
        <CardHeader className="px-0 pt-0">
          <CardTitle className="text-xl font-headline flex items-center gap-2 text-primary">
            <MapPin className="h-5 w-5" />
            Ubicación de Muestra
          </CardTitle>
          <CardDescription>
            Seleccionada en el panel izquierdo
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Latitud</Label>
              <Input 
                value={location?.lat.toFixed(6) || 'N/A'} 
                readOnly 
                className="bg-muted/30"
              />
            </div>
            <div className="space-y-2">
              <Label>Longitud</Label>
              <Input 
                value={location?.lon.toFixed(6) || 'N/A'} 
                readOnly 
                className="bg-muted/30"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="medium">Medio Ambiental</Label>
            <Select 
              onValueChange={(v) => form.setValue('medium', v as any)} 
              defaultValue="water"
            >
              <SelectTrigger>
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
            <Select onValueChange={(v) => form.setValue('parameterType', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccione categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="physicochemical">Fisicoquímico</SelectItem>
                <SelectItem value="microbiological">Microbiológico</SelectItem>
                <SelectItem value="metals">Metales Pesados</SelectItem>
                <SelectItem value="organic">Compuestos Orgánicos</SelectItem>
                <SelectItem value="flow">Aforo / Caudal</SelectItem>
                <SelectItem value="level">Nivel Freatimétrico</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="analyte">Analito / Parámetro Particular</Label>
              <Input 
                id="analyte" 
                placeholder="Ej: pH, PM2.5, Arsénico"
                {...form.register('analyte')} 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="value">Valor</Label>
              <Input 
                id="value" 
                placeholder="Ej: 7.2 o Limpio"
                {...form.register('value')} 
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Button 
            type="submit" 
            disabled={loading || !location} 
            className="w-full bg-primary hover:bg-primary/90 text-white"
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Guardar Medición
          </Button>

          <Button 
            type="button" 
            variant="outline" 
            onClick={handleAiSuggest}
            disabled={aiLoading || !location}
            className="w-full border-accent text-primary hover:bg-accent/10"
          >
            {aiLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4 text-accent" />}
            Sugerencias de IA
          </Button>
        </div>
      </form>

      {aiSuggestions && (
        <Card className="border-accent bg-accent/5">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              Sugerencias para esta ubicación
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted-foreground italic">{aiSuggestions.overallRationale}</p>
            <div className="space-y-3">
              {aiSuggestions.parameters.map((p, idx) => (
                <div key={idx} className="bg-white rounded p-3 shadow-sm border border-accent/20">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-bold text-primary">{p.name}</span>
                    <span className="text-xs font-mono bg-secondary px-2 py-0.5 rounded">{p.typicalRange}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{p.rationale}</p>
                  <Button 
                    variant="link" 
                    size="sm" 
                    className="h-auto p-0 text-accent font-semibold mt-1"
                    onClick={() => {
                      form.setValue('analyte', p.name);
                    }}
                  >
                    Usar este analito
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!location && (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 p-4 text-amber-800 text-sm border border-amber-200">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <p>Debe seleccionar un punto en el mapa para habilitar la carga de datos.</p>
        </div>
      )}
    </div>
  );
}
