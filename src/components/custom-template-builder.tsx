
'use client';

import { useState, useMemo } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, X, Search, Star, Layers } from 'lucide-react';
import { MONITORING_TEMPLATES } from '@/app/lib/monitoring-constants';

interface ParameterOption {
  id: string;
  source: string;
  nombre: string;
  categoria: string;
  unidades: string;
  medium: string;
}

interface Props {
  onTemplateCreated: (templateId: string) => void;
  onCancel: () => void;
}

/**
 * Constructor de planillas personalizadas.
 * Lista todos los analitos disponibles en el sistema DEA con trazabilidad de origen.
 * Tipografía en negro pleno y peso normal.
 */
export function CustomTemplateBuilder({ onTemplateCreated, onCancel }: Props) {
  const { toast } = useToast();
  const db = useFirestore();
  const { user } = useUser();
  const [templateName, setTemplateName] = useState('Nueva Planilla Personalizada');
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Consolidamos todos los analitos disponibles del catálogo expandido
  const allAvailableParameters = useMemo(() => {
    const params: ParameterOption[] = [];

    MONITORING_TEMPLATES.forEach(t => {
      const sourceLabel = t.nombre.split('(')[0].trim();
      (t.parametros || []).forEach(p => {
        params.push({
          id: `${t.id}_${p.nombre}`,
          source: sourceLabel,
          nombre: p.nombre,
          categoria: p.categoria,
          unidades: p.unidades,
          medium: t.medium
        });
      });
    });

    return params;
  }, []);

  const filteredParams = allAvailableParameters.filter(p => 
    p.nombre.toLowerCase().includes(search.toLowerCase()) || 
    p.source.toLowerCase().includes(search.toLowerCase())
  );

  const handleToggle = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleSave = async () => {
    if (!user || !db) return;
    if (selectedIds.length === 0) {
      toast({ variant: "destructive", title: "Planilla vacía", description: "Seleccioná al menos un analito." });
      return;
    }

    setIsSaving(true);
    try {
      const selectedParams = allAvailableParameters
        .filter(p => selectedIds.includes(p.id))
        .map(p => ({
          nombre: p.nombre,
          categoria: p.categoria,
          unidades: p.unidades,
          mediumKey: p.medium
        }));

      const docRef = await addDoc(collection(db, 'custom_templates'), {
        name: templateName,
        parameters: selectedParams,
        userId: user.uid,
        userEmail: user.email,
        createdAt: serverTimestamp(),
        protocol: 'PP-001'
      });

      toast({ title: "Plantilla creada", description: templateName });
      onTemplateCreated(docRef.id);
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Error al guardar" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="border-t-4 border-t-accent shadow-xl rounded-none animate-in fade-in slide-in-from-bottom-4 duration-300">
      <CardHeader className="p-4 pb-2 bg-neutral-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-accent/10 rounded">
              <Star className="h-4 w-4 text-accent fill-accent" />
            </div>
            <div>
              <CardTitle className="text-sm font-normal uppercase tracking-tight text-black">Constructor de Protocolo PP-001</CardTitle>
              <CardDescription className="text-[10px] uppercase font-normal text-black">Diseñá tu propio set de monitoreo</CardDescription>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onCancel} className="h-8 w-8 text-black">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="p-4 space-y-4">
        <div className="space-y-2">
          <Label className="text-[9px] font-normal uppercase text-black">Título de la Planilla</Label>
          <Input 
            value={templateName} 
            onChange={(e) => setTemplateName(e.target.value)}
            className="h-10 text-xs font-normal border-neutral-300 rounded-none focus-visible:ring-accent/30 text-black"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[9px] font-normal uppercase text-black">Seleccionar Analitos ({selectedIds.length})</Label>
            <div className="relative w-48">
              <Search className="absolute left-2 top-1.5 h-3 w-3 text-black" />
              <input 
                placeholder="Buscar..."
                className="w-full pl-7 pr-2 py-1 text-[10px] border border-neutral-200 rounded-full focus:outline-none focus:ring-1 focus:ring-accent/30 text-black font-normal"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          
          <div className="border border-neutral-200 bg-white overflow-hidden">
            <ScrollArea className="h-[300px]">
              <div className="divide-y divide-neutral-100">
                {filteredParams.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 p-2.5 hover:bg-neutral-50 transition-colors">
                    <Checkbox 
                      id={p.id} 
                      checked={selectedIds.includes(p.id)} 
                      onCheckedChange={() => handleToggle(p.id)}
                      className="border-neutral-300 data-[state=checked]:bg-accent data-[state=checked]:border-accent"
                    />
                    <Label htmlFor={p.id} className="flex-1 cursor-pointer">
                      <div className="flex flex-col">
                        <span className="text-[11px] font-normal text-black leading-tight">
                          <span>{p.source}</span>
                          <span className="mx-2 text-accent">---&gt;</span>
                          <span>{p.nombre}</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] text-black font-normal uppercase">{p.categoria}</span>
                          {p.unidades && (
                            <span className="text-[9px] text-black font-normal"> • {p.unidades}</span>
                          )}
                        </div>
                      </div>
                    </Label>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>

        <Button 
          onClick={handleSave} 
          disabled={isSaving || selectedIds.length === 0}
          className="w-full h-12 bg-black hover:bg-neutral-900 text-white font-normal uppercase tracking-widest text-[11px] rounded-none shadow-xl"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Guardar Plantilla y Comenzar Protocolo PP-001
        </Button>
      </CardContent>
    </Card>
  );
}
