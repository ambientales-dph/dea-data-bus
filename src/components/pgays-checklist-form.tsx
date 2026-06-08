'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, setDoc, serverTimestamp, doc, updateDoc, arrayUnion, getDocs, Timestamp } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Check, Clock, User, Camera, ClipboardCheck, PenTool, CheckCircle2, Calendar, HardHat, Recycle, Truck, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PhotoRegistry } from './photo-registry';
import { TechnicianLink } from './technician-link';
import { getCurrentGPSLocation } from '@/lib/geo-utils';

interface Props {
  reportId: string;
  formId: string;
  stationId: string;
  onClose?: () => void;
}

const SECTIONS = [
  {
    title: "1. Compromisos y Acuerdos Anteriores",
    icon: Clock,
    items: [
      { id: "acuerdo_1", label: "", dynamic: true },
      { id: "acuerdo_2", label: "", dynamic: true }
    ]
  },
  {
    title: "2. Higiene y Seguridad en Obra",
    icon: HardHat,
    items: [
      { id: "hs_vallado", label: "Cerramiento y Vallado perimetral de obra" },
      { id: "hs_carteleria", label: "Señalética y Cartelería de seguridad visible" },
      { id: "hs_epp", label: "Uso correcto de EPP por parte del personal" },
      { id: "hs_orden", label: "Orden y limpieza general de los frentes" }
    ]
  },
  {
    title: "3. Gestión Ambiental de Obrador",
    icon: Recycle,
    items: [
      { id: "obrador_limpieza", label: "Orden y Limpieza del obrador" },
      { id: "obrador_rsu", label: "Correcto manejo de RSU (Contenedores)" },
      { id: "obrador_hazmat", label: "Contención de hidrocarburos / Aceites" },
      { id: "obrador_banos", label: "Estado y limpieza de baños químicos" }
    ]
  },
  {
    title: "4. Gestión en Frente de Obra",
    icon: Truck,
    items: [
      { id: "frente_polvo", label: "Control de polvo y material particulado" },
      { id: "frente_ruido", label: "Control de ruidos molestos / Horarios" },
      { id: "frente_barros", label: "Manejo de barros y sedimentos en calzada" },
      { id: "frente_arbolado", label: "Protección de vegetación y arbolado" }
    ]
  },
  {
    title: "5. Entorno y Comunidad",
    icon: MessageSquare,
    items: [
      { id: "comunidad_accesos", label: "Mantenimiento de accesos vehiculares/peatonales" },
      { id: "comunidad_limpieza", label: "Limpieza de calles periféricas al frente" },
      { id: "comunidad_reclamos", label: "Gestión / Atención de reclamos de vecinos" }
    ]
  }
];

interface PgaysEntry {
  value: any;
  capturedAt: number | null;
  userEmail?: string;
}

export function PgaysChecklistForm({ reportId, formId, stationId, onClose }: Props) {
  const { toast } = useToast();
  const db = useFirestore();
  const { user } = useUser();
  
  const [formData, setFormData] = useState<Record<string, PgaysEntry>>({});
  const [savingFields, setSavingFields] = useState<Record<string, boolean>>({});
  const [savedFields, setSavedFields] = useState<Record<string, boolean>>({});
  const [openPhotos, setOpenPhotos] = useState<Record<string, boolean>>({});
  const [isLoadingExisting, setIsLoadingExisting] = useState(true);
  const [metadata, setMetadata] = useState<{ timestamp?: any }>({});
  const [isDeferred, setIsDeferred] = useState(false);
  const [manualDate, setManualDate] = useState<string>(new Date().toISOString().slice(0, 16));

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
        
        const newFormData: Record<string, PgaysEntry> = {};
        const newSavedFields: Record<string, boolean> = {};
        let foundMetadata = { timestamp: null };
        let foundDeferred = false;

        snapshot.docs.forEach(docSnap => {
          const data = docSnap.data();
          if (data.parameterType === "Fotografía") return;

          newFormData[data.analyte] = { value: data.value, capturedAt: null, userEmail: data.userEmail };
          newSavedFields[data.analyte] = true;
          
          if (!foundMetadata.timestamp || (data.timestamp && data.timestamp.toMillis() < foundMetadata.timestamp.toMillis())) {
            foundMetadata = { timestamp: data.fechaServidor || data.timestamp };
            if (data.timestamp) {
               const date = data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
               setManualDate(date.toISOString().slice(0, 16));
            }
          }
          if (data.isDeferred !== undefined) foundDeferred = data.isDeferred;
        });

        setFormData(newFormData);
        setSavedFields(newSavedFields);
        setMetadata(foundMetadata);
        setIsDeferred(foundDeferred);
      } catch (e) {
        console.error("Error fetching PGAyS data", e);
      } finally {
        setIsLoadingExisting(false);
      }
    };

    fetchExistingData();
  }, [db, reportId, formId, user?.email]);

  const saveParam = (name: string, category: string, valueOverride?: any) => {
    if (!user || !db) return;
    const entry = formData[name];
    const value = valueOverride !== undefined ? valueOverride : entry?.value;
    if (value === null || value === undefined || value === "") return;

    setSavedFields(prev => ({ ...prev, [name]: true }));
    setSavingFields(prev => ({ ...prev, [name]: false }));
    setFormData(prev => ({ ...prev, [name]: { ...prev[name], userEmail: user.email! } }));
    
    (async () => {
      try {
        const location = await getCurrentGPSLocation();
        const t1 = (valueOverride !== undefined ? Date.now() : entry?.capturedAt) || Date.now();

        const safeAnalyte = name.replace(/[^a-zA-Z0-9]/g, '_');
        const docId = `${reportId}_${formId}_${safeAnalyte}`;
        const sampleRef = doc(db, 'samples', docId);

        const payload = {
          medium: 'sedimentos',
          parameterType: category,
          analyte: name,
          reportId,
          formId,
          stationId,
          value: `${value}`,
          latitude: location?.latitude || null,
          longitude: location?.longitude || null,
          retrasoSincronizacionMs: isDeferred ? 0 : Date.now() - t1,
          fechaServidor: serverTimestamp(),
          timestamp: isDeferred ? Timestamp.fromDate(new Date(manualDate)) : serverTimestamp(),
          isDeferred,
          userId: user.uid,
          userEmail: user.email
        };

        setDoc(sampleRef, payload, { merge: true }).catch(console.error);
        updateDoc(doc(db, 'reports', reportId), { editors: arrayUnion(user.email) }).catch(console.error);
      } catch (err) {
        console.error("Error en guardado de PGAyS:", err);
      }
    })();
    
    toast({ title: "Sincronizando localmente", description: "Capturado." });
  };

  const handleInputChange = (name: string, value: any) => {
    setFormData(prev => ({ ...prev, [name]: { ...prev[name], value, capturedAt: Date.now() } }));
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
    return <div className="p-12 text-center text-xs animate-pulse font-normal uppercase text-black">Cargando Inspección PGAyS...</div>;
  }

  const isDeferredLocked = Object.keys(savedFields).length > 0;

  const renderItem = (item: { id: string, label: string, dynamic?: boolean }) => {
    const customLabelKey = `${item.id}:custom_label`;
    const labelToUse = item.dynamic ? (formData[customLabelKey]?.value || item.label) : item.label;
    const isLabelSaved = savedFields[customLabelKey];
    const isItemSaved = savedFields[`${labelToUse}:cumple`];

    return (
      <div key={item.id} className="p-4 bg-white border-b border-neutral-100 last:border-0 hover:bg-neutral-50/30 transition-colors">
        <div className="flex flex-col gap-3">
          {item.dynamic ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 group/label">
                <Input 
                  value={formData[customLabelKey]?.value ?? ""}
                  onChange={(e) => handleInputChange(customLabelKey, e.target.value)}
                  placeholder="................................................................................"
                  className="h-9 text-[13px] font-normal border-none border-b border-dotted border-neutral-300 bg-transparent focus-visible:ring-0 p-0 rounded-none w-full placeholder:text-neutral-300"
                />
                <button 
                  onClick={() => saveParam(customLabelKey, "Etiqueta")}
                  className={cn("p-1 transition-colors shrink-0", isLabelSaved ? "text-green-600" : "text-neutral-400 group-hover/label:text-black")}
                >
                  {savingFields[customLabelKey] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className={cn("h-4 w-4", !isLabelSaved && "opacity-20")} />}
                </button>
              </div>
              {isLabelSaved && formData[customLabelKey]?.userEmail && (
                <div className="flex items-center gap-1">
                  <User className="h-2 w-2 text-neutral-300" />
                  <TechnicianLink email={formData[customLabelKey].userEmail!} className="text-[8px] uppercase text-neutral-400 font-normal" />
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col">
              <Label className="text-[13px] font-normal text-black leading-tight flex-1 uppercase tracking-tight">{item.label}</Label>
              {isItemSaved && formData[`${labelToUse}:cumple`]?.userEmail && (
                <div className="flex items-center gap-1 mt-0.5">
                  <User className="h-2 w-2 text-neutral-300" />
                  <TechnicianLink email={formData[`${labelToUse}:cumple`].userEmail!} className="text-[8px] uppercase text-neutral-400 font-normal" />
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1 shrink-0">
              <Select 
                value={formData[`${labelToUse}:cumple`]?.value ?? ""} 
                onValueChange={(val) => {
                  handleInputChange(`${labelToUse}:cumple`, val);
                  saveParam(`${labelToUse}:cumple`, "Inspección", val);
                }}
              >
                <SelectTrigger className="h-8 w-24 border-none bg-neutral-50 shadow-none px-2 text-[10px] uppercase font-bold text-black focus:ring-0 rounded-sm">
                  <SelectValue placeholder="CUMPLE" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SI" className="text-xs font-bold">SÍ</SelectItem>
                  <SelectItem value="NO" className="text-xs font-bold text-destructive">NO</SelectItem>
                  <SelectItem value="N/A" className="text-xs">N/A</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center gap-3 flex-1">
              <div className="relative flex-1">
                <Input 
                  placeholder="Observaciones..."
                  className="h-8 text-[12px] border-none bg-neutral-50 focus-visible:ring-0 px-2 font-body placeholder:text-neutral-400 rounded-sm"
                  value={formData[`${labelToUse}:obs`]?.value ?? ""}
                  onChange={(e) => handleInputChange(`${labelToUse}:obs`, e.target.value)}
                />
                <button 
                  onClick={() => saveParam(`${labelToUse}:obs`, "Observación")} 
                  className={cn("absolute right-1 top-1/2 -translate-y-1/2 p-1", savedFields[`${labelToUse}:obs`] ? "text-green-600" : "text-neutral-400 hover:text-black")}
                >
                  {savingFields[`${labelToUse}:obs`] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </button>
              </div>
              <button 
                onClick={() => togglePhotos(item.id)}
                className={cn(
                  "h-8 w-8 flex items-center justify-center border transition-all shrink-0 rounded-sm",
                  openPhotos[item.id] ? "bg-black text-white border-black" : "bg-neutral-50 text-neutral-400 border-neutral-200 hover:border-black hover:text-black"
                )}
              >
                <Camera className="h-4 w-4" />
              </button>
            </div>
          </div>

          {openPhotos[item.id] && (
            <div className="animate-in slide-in-from-top-2 duration-300 border-t border-neutral-100 mt-1 pt-3">
              <PhotoRegistry 
                reportId={reportId} 
                formId={formId} 
                stationId={stationId} 
                medium="sedimentos" 
                analyteTag={`PGAyS: ${labelToUse}`}
              />
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto w-full border border-black bg-white font-body shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300 pb-24 overflow-hidden">
      <div className="border-b-2 border-black bg-neutral-100 px-4 py-4">
        <h1 className="text-sm font-normal uppercase tracking-tight text-black font-headline">Inspección de Obra • PGAyS-001</h1>
        <div className="flex flex-col gap-0.5 mt-2">
           <p className="text-[10px] text-neutral-600 font-normal uppercase leading-none tracking-tight">Planilla ID: {formId}</p>
           <div className="flex flex-wrap items-center gap-3 text-[9px] text-black font-normal uppercase tracking-tighter mt-1">
              {isDeferred ? (
                <div className="flex items-center gap-1.5 bg-white border border-black px-2 py-0.5 rounded-sm">
                  <Calendar className="h-3 w-3 text-red-600" />
                  <input 
                    type="datetime-local" 
                    value={manualDate} 
                    onChange={(e) => setManualDate(e.target.value)}
                    disabled={isDeferredLocked}
                    className="bg-transparent border-none p-0 text-[9px] font-black uppercase outline-none focus:ring-0 w-32"
                  />
                </div>
              ) : (
                <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5 text-primary" /> {formatTimestamp(metadata.timestamp)}</span>
              )}
              
              <button 
                onClick={() => !isDeferredLocked && setIsDeferred(!isDeferred)}
                disabled={isDeferredLocked}
                className={cn(
                  "flex items-center gap-1 px-1.5 py-0.5 rounded-full border transition-all",
                  isDeferred 
                    ? "bg-red-50 border-red-200 text-red-600" 
                    : "bg-green-50 border-green-200 text-green-600",
                  isDeferredLocked ? "opacity-100 cursor-default" : "cursor-pointer hover:scale-105 active:scale-95"
                )}
              >
                <CheckCircle2 className="h-2.5 w-2.5" />
                <span className="text-[7px] font-normal">{isDeferred ? "DIFERIDA" : "REAL"}</span>
              </button>
           </div>
        </div>
      </div>

      <div className="p-0 border-b border-black">
        <div className="bg-neutral-50 px-4 py-2 border-b border-neutral-200">
           <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Encabezado y Contexto</span>
        </div>
        {[
          { id: "contratista", label: "Empresa Contratista", cat: "General" },
          { id: "avance_obra", label: "% Avance Aproximado", cat: "General" },
          { id: "personal_afectado", label: "Personal en Obra", cat: "General" },
          { id: "estado_clima", label: "Condiciones Climáticas", cat: "General" }
        ].map(item => (
          <div key={item.id} className="flex items-center justify-between py-2.5 px-4 border-b border-neutral-100 group/header">
            <div className="flex flex-col flex-1">
              <label className="text-[11px] font-normal text-black uppercase tracking-tight">{item.label}</label>
              {savedFields[item.label] && formData[item.label]?.userEmail && (
                <div className="flex items-center gap-1 mt-0.5">
                  <User className="h-2 w-2 text-neutral-300" />
                  <TechnicianLink email={formData[item.label].userEmail!} className="text-[8px] uppercase text-neutral-400 font-normal" />
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input 
                type="text" 
                className="h-7 w-32 border-none bg-neutral-50 px-2 text-[12px] font-code text-black text-right focus:ring-0 outline-none rounded-sm" 
                value={formData[item.label]?.value ?? ""}
                onChange={(e) => handleInputChange(item.label, e.target.value)}
                placeholder="---"
              />
              <button 
                onClick={() => saveParam(item.label, item.cat)} 
                className={cn("p-1", savedFields[item.label] ? "text-green-600" : "text-neutral-400")}
              >
                {savingFields[item.label] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-0">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <div className="bg-black text-white px-4 py-2 flex items-center gap-2 sticky top-0 z-10">
              <section.icon className="h-4 w-4" />
              <span className="text-[10px] font-normal uppercase tracking-widest">{section.title}</span>
            </div>
            <div className="divide-y divide-neutral-100">
              {section.items.map((item) => renderItem(item))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 border-t-2 border-black">
        <div className="bg-neutral-900 text-white px-4 py-2.5 flex items-center gap-2">
          <PenTool className="h-4 w-4" />
          <span className="text-[10px] font-normal uppercase tracking-widest">Registro de Firmas</span>
        </div>
        <div className="p-6 bg-neutral-50">
          <p className="text-[11px] text-neutral-600 mb-4 italic leading-relaxed">Capture fotografía del acta original firmada por el inspector y el responsable de obra.</p>
          <PhotoRegistry 
            reportId={reportId} 
            formId={formId} 
            stationId={stationId} 
            medium="sedimentos" 
            analyteTag="Acta Firmada (PGAyS)"
          />
        </div>
      </div>

      <div className="p-4 bg-white border-t border-black">
        <Button onClick={onClose} className="w-full h-14 bg-black hover:bg-neutral-900 text-white font-normal uppercase tracking-widest text-[11px] rounded-none shadow-xl transition-all active:scale-[0.98]">Finalizar Inspección y Cerrar Acta</Button>
      </div>
    </div>
  );
}
