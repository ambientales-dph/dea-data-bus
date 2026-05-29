'use client';

import { useState, useMemo, useEffect } from 'react';
import { collection, addDoc, serverTimestamp, doc, updateDoc, arrayUnion, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { useFirestore, useUser, useDoc } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Check, CheckCircle2, Clock, User, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PhotoRegistry } from './photo-registry';
import { TechnicianLink } from './technician-link';
import { getCurrentGPSLocation } from '@/lib/geo-utils';

export interface SurfaceWaterEntry {
  value: string | number | null;
  capturedAt: number | null;
}

export interface SurfaceWaterData {
  [key: string]: SurfaceWaterEntry;
}

interface Props {
  reportId: string;
  formId: string;
  stationId: string;
  onClose?: () => void;
}

export function SurfaceWaterFormIntegrated({ reportId, formId, stationId, onClose }: Props) {
  const { toast } = useToast();
  const db = useFirestore();
  const { user } = useUser();
  const [formData, setFormData] = useState<SurfaceWaterData>({});
  const [savingFields, setSavingFields] = useState<Record<string, boolean>>({});
  const [savedFields, setSavedFields] = useState<Record<string, boolean>>({});
  const [isLoadingExisting, setIsLoadingExisting] = useState(true);
  const [metadata, setMetadata] = useState<{ user?: string, timestamp?: any }>({});
  const [isDeferred, setIsDeferred] = useState(false);
  const [manualDate, setManualDate] = useState<string>(new Date().toISOString().slice(0, 16));

  const sections = [
    {
      title: "1. Fisicoquímicos y Sólidos",
      params: [
        { name: "Turbidez/Turbiedad", unit: "NTU", cat: "Fisicoquímico", desc: "Monitoreo. Ley 24.051 / Dec. 831/93." },
        { name: "Sólidos Suspendidos", unit: "mg/l", cat: "Sólidos", desc: "Nivel Guía: 100 mg/l (Dec. 831/93)." },
        { name: "Sólidos totales", unit: "mg/l", cat: "Sólidos", desc: "Ref. Dec. 831/93 / Res. ADA (Prov. BA)." },
        { name: "Dureza Total", unit: "mg/l", cat: "Fisicoquímico", desc: "Variable segun geología de cuenca." }
      ]
    },
    {
      title: "2. Nutrientes y Materia Orgánica",
      params: [
        { name: "Nitrógeno Amoniacal", unit: "mg/l", cat: "Nutrientes", desc: "Nivel Guía: 0.02 mg/l (Dec. 831/93)." },
        { name: "Nitrógeno total", unit: "mg/l", cat: "Nutrientes", desc: "Indicador de eutrofización. Dec. 831/93." },
        { name: "Fosforo total", unit: "mg/l", cat: "Nutrientes", desc: "Nivel Guía: 0.025 mg/l (lagos) Dec. 831/93." },
        { name: "DBO5", unit: "mg/l", cat: "Orgánicos", desc: "Guía: 5 mg/l (Vida acuática) Dec. 831/93." }
      ]
    },
    {
      title: "3. Microbiología y Biología",
      params: [
        { name: "Coliformes totales", unit: "3NMP/100ml", cat: "Microbiología", desc: "Guía: 1000/100ml (Recreativo) Dec. 831/93." },
        { name: "Escherichia coli", unit: "3NMP/100ml", cat: "Microbiología", desc: "Indicador fecal. Dec. 831/93 / Res. ADA." }
      ]
    },
    {
      title: "4. Metales",
      params: [
        { name: "Arsenico", unit: "mg/l", cat: "Metales", desc: "Nivel Guía: 0.05 mg/l. Dec. 831/93." },
        { name: "Cadmio", unit: "ug/l", cat: "Metales", desc: "Nivel Guía: 0.2-2 ug/l según dureza." },
        { name: "Cromo", unit: "mg/l", cat: "Metales", desc: "Nivel Guía: 0.05 mg/l (Cr VI) Dec. 831/93." },
        { name: "Plomo", unit: "mg/l", cat: "Metales", desc: "Nivel Guía: 0.05 mg/l. Dec. 831/93." }
      ]
    }
  ];

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
        
        const newFormData: SurfaceWaterData = {};
        const newSavedFields: Record<string, boolean> = {};
        let foundMetadata = { user: user?.email || '', timestamp: null };
        let foundDeferred = false;

        snapshot.docs.forEach(doc => {
          const data = doc.data();
          newFormData[data.analyte] = { value: data.value, capturedAt: null };
          newSavedFields[data.analyte] = true;
          
          if (!foundMetadata.timestamp || (data.timestamp && data.timestamp.toMillis() < foundMetadata.timestamp.toMillis())) {
            foundMetadata = { user: data.userEmail || user?.email || '', timestamp: data.fechaServidor || data.timestamp };
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
        console.error("Error fetching", e);
      } finally {
        setIsLoadingExisting(false);
      }
    };

    fetchExistingData();
  }, [db, reportId, formId, user?.email]);

  const handleInputChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: { value, capturedAt: Date.now() } }));
    if (savedFields[name]) {
      setSavedFields(prev => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const saveIndividualParam = async (name: string, category: string) => {
    if (!user || !db) return;
    const entry = formData[name];
    if (!entry || entry.value === null || entry.value === undefined || entry.value === "") return;

    setSavingFields(prev => ({ ...prev, [name]: true }));
    
    const location = await getCurrentGPSLocation();
    const t1 = entry.capturedAt || Date.now();
    const t2 = Date.now();
    const deltaMs = t2 - t1;

    try {
      const q = query(
        collection(db, 'samples'),
        where('reportId', '==', reportId),
        where('formId', '==', formId),
        where('analyte', '==', name)
      );
      const snapshot = await getDocs(q);

      const payload = {
        value: `${entry.value}`,
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
        retrasoSincronizacionMs: isDeferred ? 0 : deltaMs,
        fechaServidor: serverTimestamp(),
        timestamp: isDeferred ? Timestamp.fromDate(new Date(manualDate)) : serverTimestamp(),
        isDeferred,
        userId: user.uid,
        userEmail: user.email
      };

      if (!snapshot.empty) {
        await updateDoc(doc(db, 'samples', snapshot.docs[0].id), payload);
      } else {
        await addDoc(collection(db, 'samples'), {
          ...payload,
          medium: 'agua_superficial',
          parameterType: category,
          analyte: name,
          reportId,
          formId,
          stationId,
        });
      }

      await updateDoc(doc(db, 'reports', reportId), { editors: arrayUnion(user.email) });
      setSavedFields(prev => ({ ...prev, [name]: true }));
      toast({ 
        title: "Guardado", 
        description: location ? "Dato sincronizado con GPS." : "Guardado (Sin señal de GPS)." 
      });
    } catch (error: any) {
      console.error(error);
      toast({ variant: "destructive", title: "Error al guardar", description: "No se pudo sincronizar el dato." });
    } finally {
      setSavingFields(prev => ({ ...prev, [name]: false }));
    }
  };

  const formatTimestamp = (ts: any) => {
    if (!ts) return new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (isLoadingExisting) {
    return <div className="p-8 text-center text-xs animate-pulse font-bold uppercase text-black">Cargando datos de planilla...</div>;
  }

  const rowClass = "flex items-center justify-between py-2.5 border-b border-neutral-300 hover:bg-neutral-50 transition-colors group px-4";
  const labelClass = "text-[11px] font-black text-black tracking-tight font-headline leading-none uppercase";
  const subLabelClass = "text-[9px] text-neutral-600 font-medium leading-tight mt-1";
  const inputClass = "h-7 w-28 border-none bg-neutral-50 px-2 text-[12px] font-code text-black font-bold text-right rounded-none focus:ring-0 outline-none";
  const sectionHeaderClass = "flex items-center bg-neutral-100 px-4 py-2 border-y border-neutral-400 mt-2 first:mt-0";

  const isDeferredLocked = Object.keys(savedFields).length > 0;

  return (
    <div className="mx-auto w-full border border-neutral-400 bg-white font-body shadow-sm rounded-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300 pb-20">
      <div className="border-b border-neutral-400 bg-neutral-100 px-4 py-3 flex justify-between items-center">
        <div>
          <h1 className="text-sm font-black uppercase tracking-tight text-black font-headline">Agua Superficial • AS-001</h1>
          <div className="flex flex-col gap-0.5 mt-1">
            <p className="text-[10px] text-neutral-600 font-bold uppercase leading-none tracking-tight">ID Planilla: {formId}</p>
            <div className="flex flex-wrap items-center gap-3 text-[9px] text-black font-black uppercase tracking-tighter mt-1">
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
                <span className="text-[7px] font-black">{isDeferred ? "DIFERIDA" : "REAL"}</span>
              </button>

              <span className="flex items-center gap-1"><User className="h-2.5 w-2.5 text-primary" /> <TechnicianLink email={metadata.user || user?.email || null} /></span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-0">
        {sections.map((section, sIdx) => (
          <div key={sIdx}>
            <div className={sectionHeaderClass}>
              <span className="text-[10px] font-black uppercase tracking-wider text-black">{section.title}</span>
            </div>
            <div className="p-0">
              {section.params.map((param, pIdx) => (
                <div key={pIdx} className={rowClass}>
                  <div className="flex flex-col flex-1">
                    <label className={labelClass}>{param.name}</label>
                    <span className={subLabelClass}>{param.desc}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input 
                      type="text" 
                      className={inputClass} 
                      value={formData[param.name]?.value ?? ""} 
                      onChange={(e) => handleInputChange(param.name, e.target.value)} 
                      placeholder="---"
                    />
                    <button 
                      onClick={() => saveIndividualParam(param.name, param.cat)} 
                      className={cn("p-1 transition-colors", savedFields[param.name] ? "text-green-600" : "text-black hover:text-primary")}
                    >
                      {savingFields[param.name] ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : savedFields[param.name] ? (
                        <div className="rounded-full bg-green-100 p-0.5"><Check className="h-2.5 w-2.5 text-green-600" /></div>
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="px-4 py-6 bg-neutral-50">
          <PhotoRegistry 
            reportId={reportId} 
            formId={formId} 
            stationId={stationId} 
            medium="agua_superficial" 
          />
        </div>
      </div>

      <div className="bg-white p-4 border-t border-neutral-400">
        <button onClick={onClose} className="w-full bg-neutral-900 hover:bg-black py-4 text-[11px] font-black uppercase tracking-widest text-white shadow-md">Finalizar y Cerrar Planilla</button>
      </div>
    </div>
  );
}
