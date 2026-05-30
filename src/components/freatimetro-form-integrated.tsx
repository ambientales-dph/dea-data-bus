'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { collection, setDoc, serverTimestamp, doc, updateDoc, arrayUnion, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { useFirestore, useUser, useDoc, errorEmitter, FirestorePermissionError } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle2, Info, Check, Send, ArrowLeft, Clock, User, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PhotoRegistry } from './photo-registry';
import { TechnicianLink } from './technician-link';
import { getCurrentGPSLocation } from '@/lib/geo-utils';

export interface FreatimetroEntry {
  value: number | string | null;
  capturedAt: number | null;
}

export interface FreatimetroData {
  idPozo: FreatimetroEntry;
  cotaBrocal: FreatimetroEntry;
  nivelEstatico: FreatimetroEntry;
  ph: FreatimetroEntry;
  conductividad: FreatimetroEntry;
  temperatura: FreatimetroEntry;
  plomo: FreatimetroEntry;
  cadmio: FreatimetroEntry;
  arsenico: FreatimetroEntry;
  tph: FreatimetroEntry;
}

const initialFormData: FreatimetroData = {
  idPozo: { value: "", capturedAt: null },
  cotaBrocal: { value: null, capturedAt: null },
  nivelEstatico: { value: null, capturedAt: null },
  ph: { value: null, capturedAt: null },
  conductividad: { value: null, capturedAt: null },
  temperatura: { value: null, capturedAt: null },
  plomo: { value: null, capturedAt: null },
  cadmio: { value: null, capturedAt: null },
  arsenico: { value: null, capturedAt: null },
  tph: { value: null, capturedAt: null },
};

interface Props {
  reportId: string;
  formId: string;
  stationId: string;
  onClose?: () => void;
}

export function FreatimetroFormIntegrated({ reportId, formId, stationId, onClose }: Props) {
  const { toast } = useToast();
  const db = useFirestore();
  const { user } = useUser();
  const [formData, setFormData] = useState<FreatimetroData>(initialFormData);
  const [savingFields, setSavingFields] = useState<Record<string, boolean>>({});
  const [savedFields, setSavedFields] = useState<Record<string, boolean>>({});
  const [isLoadingExisting, setIsLoadingExisting] = useState(true);
  const [metadata, setMetadata] = useState<{ user?: string, timestamp?: any }>({});
  const [isDeferred, setIsDeferred] = useState(false);
  const [manualDate, setManualDate] = useState<string>(new Date().toISOString().slice(0, 16));
  const hasSetInitialId = useRef(false);

  const stationRef = useMemo(() => {
    if (!db || !stationId) return null;
    return doc(db, 'stations', stationId);
  }, [db, stationId]);
  const { data: stationData } = useDoc(stationRef);

  const analyteToKeyMap: Record<string, keyof FreatimetroData> = {
    'Cota Brocal': 'cotaBrocal',
    'Nivel Estático': 'nivelEstatico',
    'pH': 'ph',
    'Conductividad': 'conductividad',
    'Temperatura': 'temperatura',
    'Plomo (Pb)': 'plomo',
    'Cadmio (Cd)': 'cadmio',
    'Arsénico (As)': 'arsenico',
    'TPH (Hidrocarburos)': 'tph'
  };

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
        
        const newFormData = { ...initialFormData };
        const newSavedFields: Record<string, boolean> = {};
        let foundMetadata = { user: user?.email || '', timestamp: null };
        let foundDeferred = false;

        snapshot.docs.forEach(doc => {
          const data = doc.data();
          const analyte = data.analyte;
          const value = data.value;
          
          if (!foundMetadata.timestamp || (data.timestamp && data.timestamp.toMillis() < foundMetadata.timestamp.toMillis())) {
            foundMetadata = { user: data.userEmail || user?.email || '', timestamp: data.fechaServidor || data.timestamp };
            if (data.timestamp) {
               const date = data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
               setManualDate(date.toISOString().slice(0, 16));
            }
          }

          if (data.isDeferred !== undefined) foundDeferred = data.isDeferred;

          const fieldKey = analyteToKeyMap[analyte];
          if (fieldKey) {
            (newFormData as any)[fieldKey] = { value, capturedAt: null };
            newSavedFields[fieldKey] = true;
          }
        });

        setFormData(prev => ({ ...prev, ...newFormData }));
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

  useEffect(() => {
    if (stationData?.name && !hasSetInitialId.current && !formData.idPozo.value) {
      setFormData(prev => ({ ...prev, idPozo: { value: stationData.name, capturedAt: Date.now() } }));
      hasSetInitialId.current = true;
    }
  }, [stationData?.name]);

  const cotaAgua = useMemo(() => {
    const cb = typeof formData.cotaBrocal.value === 'string' ? parseFloat(formData.cotaBrocal.value) : formData.cotaBrocal.value;
    const ne = typeof formData.nivelEstatico.value === 'string' ? parseFloat(formData.nivelEstatico.value) : formData.nivelEstatico.value;
    if (cb !== null && ne !== null && !isNaN(cb as number) && !isNaN(ne as number)) {
      return Number(((cb as number) - (ne as number)).toFixed(3));
    }
    return null;
  }, [formData.cotaBrocal.value, formData.nivelEstatico.value]);

  const handleInputChange = (field: keyof FreatimetroData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: { value, capturedAt: Date.now() }
    }));
    if (savedFields[field]) {
      setSavedFields(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const saveIndividualParam = (key: keyof FreatimetroData | 'cotaAgua', label: string, type: string) => {
    if (!user || !db) return;
    const entry = key === 'cotaAgua' ? { value: cotaAgua, capturedAt: Date.now() } : formData[key as keyof FreatimetroData];
    if (entry.value === null || entry.value === undefined || entry.value === "") return;

    // FEEDBACK INSTANTÁNEO (Escritura Optimista)
    setSavedFields(prev => ({ ...prev, [key]: true }));
    setSavingFields(prev => ({ ...prev, [key]: false }));
    
    // Proceso en segundo plano sin bloquear la UI
    (async () => {
      try {
        const location = await getCurrentGPSLocation();
        const t1 = entry.capturedAt || Date.now();
        const deltaMs = Date.now() - t1;

        const safeAnalyte = label.replace(/[^a-zA-Z0-9]/g, '_');
        const docId = `${reportId}_${formId}_${safeAnalyte}`;
        const sampleRef = doc(db, 'samples', docId);

        const payload = {
          medium: 'agua_subterranea',
          parameterType: type,
          analyte: label,
          reportId,
          formId,
          stationId,
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

        setDoc(sampleRef, payload, { merge: true }).catch(console.error);
        updateDoc(doc(db, 'reports', reportId), { editors: arrayUnion(user.email) }).catch(console.error);
      } catch (err) {
        console.error("Error en guardado de segundo plano:", err);
      }
    })();

    toast({ title: "Sincronizando localmente", description: "El dato fue capturado correctamente." });
  };

  const formatTimestamp = (ts: any) => {
    if (!ts) return new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (isLoadingExisting) {
    return <div className="p-8 text-center text-xs animate-pulse font-normal uppercase text-black">Cargando datos de planilla...</div>;
  }

  const rowClass = "flex items-center justify-between py-2.5 border-b border-neutral-300 hover:bg-neutral-50 transition-colors group px-4";
  const labelClass = "text-[11px] font-normal text-black tracking-tight font-headline leading-none uppercase";
  const subLabelClass = "text-[9px] text-neutral-600 font-normal leading-tight mt-1";
  const inputClass = "h-7 w-28 border-none bg-neutral-50 px-2 text-[12px] font-code text-black font-normal text-right rounded-none focus:ring-0 outline-none";
  const sectionHeaderClass = "flex items-center bg-neutral-100 px-4 py-2 border-y border-neutral-400 mt-2 first:mt-0";

  const isDeferredLocked = Object.keys(savedFields).length > 0;

  return (
    <div className="mx-auto w-full border border-neutral-400 bg-white font-body shadow-sm rounded-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300 pb-20">
      <div className="border-b border-neutral-400 bg-neutral-100 px-4 py-3 flex justify-between items-center">
        <div>
          <h1 className="text-sm font-normal uppercase tracking-tight text-black font-headline">Freatímetros • FTA-001</h1>
          <div className="flex flex-col gap-0.5 mt-1">
            <p className="text-[10px] text-neutral-600 font-normal uppercase leading-none tracking-tight">ID Planilla: {formId}</p>
            <div className="flex flex-wrap items-center gap-3 text-[9px] text-black font-normal uppercase tracking-tighter mt-1">
              {isDeferred ? (
                <div className="flex items-center gap-1.5 bg-white border border-black px-2 py-0.5 rounded-sm">
                  <Calendar className="h-3 w-3 text-red-600" />
                  <input 
                    type="datetime-local" 
                    value={manualDate} 
                    onChange={(e) => setManualDate(e.target.value)}
                    disabled={isDeferredLocked}
                    className="bg-transparent border-none p-0 text-[9px] font-normal uppercase outline-none focus:ring-0 w-32"
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

              <span className="flex items-center gap-1"><User className="h-2.5 w-2.5 text-primary" /> <TechnicianLink email={metadata.user || user?.email || null} /></span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-0">
        <div className={sectionHeaderClass}><span className="text-[10px] font-normal uppercase tracking-wider text-black">1. Identificación y Geometría</span></div>
        <div className="p-0">
          <div className={rowClass}>
            <div className="flex flex-col flex-1"><label className={labelClass}>ID Pozo</label><span className={subLabelClass}>Identificación técnica del freatímetro.</span></div>
            <input type="text" className={inputClass} value={formData.idPozo.value ?? ""} onChange={(e) => handleInputChange("idPozo", e.target.value)} />
          </div>
          <div className={rowClass}>
            <div className="flex flex-col flex-1">
              <label className={labelClass}>Cota Brocal (m s.n.m.)</label>
              <span className={subLabelClass}>Elevación del terreno. Referencia: IGM/IGN.</span>
            </div>
            <div className="flex items-center gap-2">
              <input type="number" step="any" className={inputClass} value={formData.cotaBrocal.value ?? ""} onChange={(e) => handleInputChange("cotaBrocal", e.target.value)} />
              <button onClick={() => saveIndividualParam('cotaBrocal', 'Cota Brocal', 'Geometría')} className={cn("p-1 transition-colors", savedFields['cotaBrocal'] ? "text-green-600" : "text-black")}>
                {savingFields['cotaBrocal'] ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : savedFields['cotaBrocal'] ? (
                  <div className="rounded-full bg-green-100 p-0.5"><Check className="h-3 w-3 text-green-600" /></div>
                ) : (
                  <Check className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>

        <div className={sectionHeaderClass}><span className="text-[10px] font-normal uppercase tracking-wider text-black">2. Mediciones de Campo (In Situ)</span></div>
        <div className="p-0">
          {[
            { key: 'nivelEstatico', name: 'Nivel Estático', unit: 'm', type: 'Campo', desc: 'Profundidad desde brocal. Ley 24.051 / Dec. 831/93.' },
            { key: 'ph', name: 'pH', unit: 'upH', type: 'Campo', desc: 'Guía: 6.5-8.5. Dec. 831/93 (Fuente de agua).' },
            { key: 'conductividad', name: 'Conductividad', unit: 'μS/cm', type: 'Campo', desc: 'Ref: ADA (Prov. BA) / Dec. 831/93.' },
            { key: 'temperatura', name: 'Temperatura', unit: '°C', type: 'Campo', desc: 'Influencia en solubilidad de metales.' }
          ].map((field) => (
            <div key={field.key} className={rowClass}>
              <div className="flex flex-col flex-1">
                <label className={labelClass}>{field.name} ({field.unit})</label>
                <span className={subLabelClass}>{field.desc}</span>
              </div>
              <div className="flex items-center gap-2">
                <input type="number" step="any" className={inputClass} value={(formData as any)[field.key].value ?? ""} onChange={(e) => handleInputChange(field.key as any, e.target.value)} />
                <button onClick={() => saveIndividualParam(field.key as any, field.name, field.type)} className={cn("p-1 transition-colors", savedFields[field.key] ? "text-green-600" : "text-black")}>
                  {savingFields[field.key] ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : savedFields[field.key] ? (
                    <div className="rounded-full bg-green-100 p-0.5"><Check className="h-3 w-3 text-green-600" /></div>
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className={sectionHeaderClass}><span className="text-[10px] font-normal uppercase tracking-wider text-black">3. Resultados de Laboratorio</span></div>
        <div className="p-0">
          {[
            { key: 'plomo', name: 'Plomo (Pb)', unit: 'mg/L', type: 'Laboratorio', desc: 'Nivel Guía: 0.05 mg/L. Dec. 831/93.' },
            { key: 'cadmio', name: 'Cadmio (Cd)', unit: 'mg/L', type: 'Laboratorio', desc: 'Nivel Guía: 0.005 mg/L. Dec. 831/93.' },
            { key: 'arsenico', name: 'Arsénico (As)', unit: 'mg/L', type: 'Laboratorio', desc: 'Nivel Guía: 0.05 mg/L. Dec. 831/93.' },
            { key: 'tph', name: 'TPH (Hidrocarburos)', unit: 'mg/L', type: 'Laboratorio', desc: 'Ref: Res. ADA 618/06.' }
          ].map((field) => (
            <div key={field.key} className={rowClass}>
              <div className="flex flex-col flex-1">
                <label className={labelClass}>{field.name}</label>
                <span className={subLabelClass}>{field.desc}</span>
              </div>
              <div className="flex items-center gap-2">
                <input type="number" step="any" className={inputClass} value={(formData as any)[field.key].value ?? ""} onChange={(e) => handleInputChange(field.key as any, e.target.value)} />
                <button onClick={() => saveIndividualParam(field.key as any, field.name, field.type)} className={cn("p-1 transition-colors", savedFields[field.key] ? "text-green-600" : "text-black")}>
                  {savingFields[field.key] ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : savedFields[field.key] ? (
                    <div className="rounded-full bg-green-100 p-0.5"><Check className="h-3 w-3 text-green-600" /></div>
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-black px-6 py-5 flex items-center justify-between mt-4">
          <div className="flex flex-col">
            <span className="text-[11px] font-normal uppercase text-white tracking-widest">Cota de Agua Estimada</span>
            <span className="text-[9px] font-normal text-neutral-400">Cálculo: CB - NE (m s.n.m.)</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-2xl font-normal text-white font-code">{cotaAgua !== null ? `${cotaAgua} m` : "—"}</span>
            <button onClick={() => saveIndividualParam('cotaAgua', 'Cota de Agua', 'Cálculo')} className={cn("p-1 transition-colors", savedFields['cotaAgua'] ? "text-green-400" : "text-white")}>
              {savingFields['cotaAgua'] ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : savedFields['cotaAgua'] ? (
                <div className="rounded-full bg-green-500 p-1.5"><Check className="h-4 w-4 text-white" /></div>
              ) : (
                <Check className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>

        <div className="px-4 py-6 bg-neutral-50">
          <PhotoRegistry 
            reportId={reportId} 
            formId={formId} 
            stationId={stationId} 
            medium="agua_subterranea" 
          />
        </div>
      </div>

      <div className="bg-white p-4 border-t border-neutral-400">
        <button onClick={onClose} className="w-full bg-neutral-900 hover:bg-black py-4 text-[11px] font-normal uppercase tracking-widest text-white shadow-xl">Finalizar y Cerrar Planilla</button>
      </div>
    </div>
  );
}
