'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, addDoc, serverTimestamp, doc, updateDoc, arrayUnion, getDocs } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Check, Clock, User, Camera, ChevronDown, ChevronUp, ClipboardCheck, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PhotoRegistry } from './photo-registry';
import { TechnicianLink } from './technician-link';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Props {
  reportId: string;
  formId: string;
  stationId: string;
  onClose?: () => void;
}

const PROGRAMS = [
  {
    title: "1. Acuerdos y solicitudes anteriores",
    items: ["Acuerdo A", "Acuerdo B", "Acuerdo C", "Acuerdo D"]
  },
  {
    title: "2. Programa de Manejo de Obrador",
    items: [
      "Orden y Limpieza del obrador",
      "Correcto manejo de RSU en obrador",
      "Correcto manejo de residuos especiales",
      "Correcto manejo de hidrocarburos y derivados",
      "Correcto acopio de materiales inertes en obrador"
    ]
  },
  {
    title: "3. Frente de Obra",
    items: [
      "Orden y Limpieza del frente de obra",
      "Correcto manejo de RSU en frente de obra",
      "Correcto manejo de residuos especiales en frente de obra",
      "Correcto manejo de hidrocarburos y derivados"
    ]
  },
  {
    title: "4. Programa de Comunicación, Difusión y Gestión de Reclamos",
    items: [
      "Existencia de buzones y libros de acta activos",
      "Se han recepcionado reclamos o consultas por los medios oficiales",
      "Carteleria informativa de obra y genero visible y accesible",
      "Existencia de baños discretizados por sexo",
      "Todo el personal afectado a obra ha firmado el código de conducta"
    ]
  },
  {
    title: "5. Programa de Cumplimiento Legal, Permisos y Autorizaciones",
    items: ["Permiso A", "Permiso B"]
  },
  {
    title: "6. Programa de Ordenamiento de la Circulación Vehicular",
    items: ["Se observa buen estado de caminos, se realizan tareas periódicas de mantenimiento"]
  },
  {
    title: "7. Programa de Manejo Suelo / Recinto",
    items: ["Se respeta el sector de disposición final de suelo"]
  },
  {
    title: "8. Programa de Monitoreo Ambiental",
    items: [
      "Se realizan de forma quincenal los monitoreos de agua",
      "Se ha realizado el monitoreo de suelo inicial",
      "Se observa en obra kits para contencion de derrames en lugar accesible"
    ]
  },
  {
    title: "9. Programa de Prevención de Interferencias",
    items: ["¿Se han detectado interferencias con servicios públicos? ¿Se contactó a la empresa prestadora?"]
  },
  {
    title: "10. Programa de Prevención de Contingencias",
    items: ["Control de contingencias y respuesta ante emergencias"]
  }
];

export function PgaysChecklistForm({ reportId, formId, stationId, onClose }: Props) {
  const { toast } = useToast();
  const db = useFirestore();
  const { user } = useUser();
  
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [savingFields, setSavingFields] = useState<Record<string, boolean>>({});
  const [savedFields, setSavedFields] = useState<Record<string, boolean>>({});
  const [openPhotos, setOpenPhotos] = useState<Record<string, boolean>>({});
  const [isLoadingExisting, setIsLoadingExisting] = useState(true);
  const [metadata, setMetadata] = useState<{ user?: string, timestamp?: any }>({});

  useEffect(() => {
    const fetchExistingData = async () => {
      if (!reportId || !formId || !db) return;
      setIsLoadingExisting(true);
      try {
        const q = query(
          collection(db, 'samples'),
          where('reportId', '==', reportId),
          where('formId', '==', formId)
        );
        const snapshot = await getDocs(q);
        
        const newFormData: Record<string, any> = {};
        const newSavedFields: Record<string, boolean> = {};
        let foundMetadata = { user: user?.email || '', timestamp: null };

        snapshot.docs.forEach(doc => {
          const data = doc.data();
          if (data.parameterType === "Fotografía") return; // Las fotos se cargan vía PhotoRegistry

          newFormData[data.analyte] = data.value;
          newSavedFields[data.analyte] = true;
          
          if (!foundMetadata.timestamp || (data.timestamp && data.timestamp.toMillis() < foundMetadata.timestamp.toMillis())) {
            foundMetadata = { user: data.userEmail || user?.email || '', timestamp: data.timestamp };
          }
        });

        setFormData(newFormData);
        setSavedFields(newSavedFields);
        setMetadata(foundMetadata);
      } catch (e) {
        console.error("Error fetching PGAyS data", e);
      } finally {
        setIsLoadingExisting(false);
      }
    };

    fetchExistingData();
  }, [db, reportId, formId, user?.email]);

  const saveParam = async (name: string, category: string, valueOverride?: any) => {
    if (!user || !db) return;
    const value = valueOverride !== undefined ? valueOverride : formData[name];
    if (value === null || value === undefined || value === "") return;

    setSavingFields(prev => ({ ...prev, [name]: true }));
    
    try {
      const q = query(
        collection(db, 'samples'),
        where('reportId', '==', reportId),
        where('formId', '==', formId),
        where('analyte', '==', name)
      );
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        await updateDoc(doc(db, 'samples', snapshot.docs[0].id), {
          value: `${value}`,
          timestamp: serverTimestamp(),
          userId: user.uid,
          userEmail: user.email
        });
      } else {
        await addDoc(collection(db, 'samples'), {
          medium: 'sedimentos',
          parameterType: category,
          analyte: name,
          value: `${value}`,
          reportId,
          formId,
          stationId,
          userId: user.uid,
          userEmail: user.email,
          timestamp: serverTimestamp(),
        });
      }

      await updateDoc(doc(db, 'reports', reportId), { editors: arrayUnion(user.email) });
      setSavedFields(prev => ({ ...prev, [name]: true }));
      toast({ title: "Sincronizado", description: `${name.substring(0, 15)}... guardado.` });
    } catch (error: any) {
      console.error(error);
    } finally {
      setSavingFields(prev => ({ ...prev, [name]: false }));
    }
  };

  const handleInputChange = (name: string, value: any) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    if (savedFields[name]) {
      setSavedFields(prev => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const togglePhotos = (item: string) => {
    setOpenPhotos(prev => ({ ...prev, [item]: !prev[item] }));
  };

  const formatTimestamp = (ts: any) => {
    if (!ts) return new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (isLoadingExisting) {
    return <div className="p-12 text-center text-xs animate-pulse font-normal uppercase text-black">Iniciando Chequeo PGAyS...</div>;
  }

  return (
    <div className="mx-auto w-full border border-black bg-white font-body shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300 pb-24 overflow-hidden">
      {/* Cabecera Técnica */}
      <div className="border-b-2 border-black bg-neutral-100 px-4 py-3">
        <h1 className="text-sm font-normal uppercase tracking-tight text-black font-headline">Chequeo Programas PGAyS • PGAyS-001</h1>
        <div className="flex flex-col gap-0.5 mt-2">
           <p className="text-[10px] text-black font-normal uppercase leading-none tracking-tight">Planilla ID: {formId}</p>
           <div className="flex items-center gap-3 text-[9px] text-black font-normal uppercase tracking-tighter mt-1">
              <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5 text-primary" /> {formatTimestamp(metadata.timestamp)}</span>
              <span className="flex items-center gap-1"><User className="h-2.5 w-2.5 text-primary" /> <TechnicianLink email={metadata.user || user?.email || null} /></span>
           </div>
        </div>
      </div>

      {/* Datos de Encabezado */}
      <div className="p-0 border-b border-black">
        <div className="flex items-center justify-between py-3 px-3 border-b border-neutral-200">
          <label className="text-[11px] font-normal text-black uppercase w-2/3">Personal afectado a obra</label>
          <div className="flex items-center gap-2">
            <input 
              type="number" 
              className="h-8 w-20 border-none bg-neutral-50 px-2 text-[12px] font-code text-black text-right focus:ring-0 outline-none" 
              value={formData["personal_afectado"] ?? ""}
              onChange={(e) => handleInputChange("personal_afectado", e.target.value)}
              placeholder="0"
            />
            <button onClick={() => saveParam("personal_afectado", "General")} className={cn("p-1", savedFields["personal_afectado"] ? "text-green-600" : "text-black")}>
              {savingFields["personal_afectado"] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : savedFields["personal_afectado"] ? <div className="rounded-full bg-green-100 p-0.5"><Check className="h-2.5 w-2.5" /></div> : <Check className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Programas */}
      <div className="space-y-0">
        {PROGRAMS.map((program) => (
          <div key={program.title}>
            <div className="bg-black text-white px-3 py-1.5 flex items-center gap-2">
              <ClipboardCheck className="h-3.5 w-3.5" />
              <span className="text-[10px] font-normal uppercase tracking-widest">{program.title}</span>
            </div>
            <div className="divide-y divide-neutral-200">
              {program.items.map((item) => (
                <div key={item} className="p-3 bg-white hover:bg-neutral-50/50 transition-colors">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-4">
                      <Label className="text-[11px] font-normal text-black leading-tight flex-1 pt-1">{item}</Label>
                      <div className="flex items-center gap-2 shrink-0">
                        <Select 
                          value={formData[`${item}:cumple`] ?? ""} 
                          onValueChange={(val) => {
                            handleInputChange(`${item}:cumple`, val);
                            saveParam(`${item}:cumple`, "Inspección", val);
                          }}
                        >
                          <SelectTrigger className="h-8 w-24 rounded-none border-black text-[10px] uppercase font-normal bg-white">
                            <SelectValue placeholder="CUMPLE" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="SI" className="text-xs">SÍ</SelectItem>
                            <SelectItem value="NO" className="text-xs">NO</SelectItem>
                            <SelectItem value="N/A" className="text-xs">N/A</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className={cn("p-1 shrink-0", savedFields[`${item}:cumple`] ? "text-green-600" : "text-transparent")}>
                          {savingFields[`${item}:cumple`] ? <Loader2 className="h-3.5 w-3.5 animate-spin text-black" /> : <div className="rounded-full bg-green-100 p-0.5"><Check className="h-2.5 w-2.5" /></div>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Textarea 
                          placeholder="Observaciones técnicas..."
                          className="min-h-[40px] text-[11px] rounded-none border-neutral-300 bg-white focus-visible:ring-primary/20 resize-none py-2"
                          value={formData[`${item}:obs`] ?? ""}
                          onChange={(e) => handleInputChange(`${item}:obs`, e.target.value)}
                        />
                        <button 
                          onClick={() => saveParam(`${item}:obs`, "Observación")} 
                          className={cn("absolute right-2 bottom-2 p-1", savedFields[`${item}:obs`] ? "text-green-600" : "text-black hover:text-primary")}
                        >
                          {savingFields[`${item}:obs`] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : savedFields[`${item}:obs`] ? <div className="rounded-full bg-green-100 p-0.5"><Check className="h-2.5 w-2.5" /></div> : <Check className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                      
                      <button 
                        onClick={() => togglePhotos(item)}
                        className={cn(
                          "h-10 w-10 flex items-center justify-center border transition-all shrink-0",
                          openPhotos[item] ? "bg-black text-white border-black" : "bg-neutral-100 text-neutral-600 border-neutral-300 hover:bg-neutral-200"
                        )}
                        title="Evidencia fotográfica por ítem"
                      >
                        <Camera className="h-4 w-4" />
                      </button>
                    </div>

                    {openPhotos[item] && (
                      <div className="animate-in slide-in-from-top-2 duration-300">
                        <PhotoRegistry 
                          reportId={reportId} 
                          formId={formId} 
                          stationId={stationId} 
                          medium="sedimentos" 
                          analyteTag={`PGAyS: ${item}`}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-black shadow-2xl z-[100] md:relative md:mt-10 md:shadow-none">
        <Button onClick={onClose} className="w-full h-12 bg-black hover:bg-neutral-900 text-white font-normal uppercase tracking-widest text-[11px] rounded-none shadow-xl">Finalizar Inspección de Obra</Button>
      </div>
    </div>
  );
}
