
'use client';

import { useState, useMemo, useEffect } from 'react';
import { collection, addDoc, serverTimestamp, doc, updateDoc, arrayUnion, query, where, getDocs } from 'firebase/firestore';
import { useFirestore, useUser, useDoc } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Check, Clock, User, Wind } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PhotoRegistry } from './photo-registry';
import { TechnicianLink } from './technician-link';

interface AirQualityData {
  [key: string]: { value: string | null; capturedAt: number | null };
}

interface Props {
  reportId: string;
  formId: string;
  stationId: string;
  onClose?: () => void;
}

export function AirQualityFormIntegrated({ reportId, formId, stationId, onClose }: Props) {
  const { toast } = useToast();
  const db = useFirestore();
  const { user } = useUser();
  const [formData, setFormData] = useState<AirQualityData>({});
  const [savingFields, setSavingFields] = useState<Record<string, boolean>>({});
  const [savedFields, setSavedFields] = useState<Record<string, boolean>>({});
  const [isLoadingExisting, setIsLoadingExisting] = useState(true);
  const [metadata, setMetadata] = useState<{ user?: string, timestamp?: any }>({});

  const params = [
    { name: "PM10", unit: "µg/m³", cat: "Particulado", desc: "Nación/Prov: 150 (24hs) • OMS: 45 (24hs)" },
    { name: "PM2.5", unit: "µg/m³", cat: "Particulado", desc: "OMS: 15 (24hs) • Sin regulación Nac/Prov." },
    { name: "CO", unit: "ppm", cat: "Gases", desc: "Nac/Prov: 50 (1h) / 9 (8h) • OMS: 4 (24hs)" },
    { name: "NO2", unit: "ppm", cat: "Gases", desc: "Nac: 0.15 (24h) • Prov: 0.14 (24h) • OMS: 0.013" },
    { name: "SO2", unit: "ppm", cat: "Gases", desc: "Nac/Prov: 0.14 (24hs) • OMS: 0.015 (24hs)" },
    { name: "O3", unit: "ppm", cat: "Gases", desc: "Nac/Prov: 0.12 (1h) • OMS: 0.05 (8hs)" }
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
        
        const newFormData: AirQualityData = {};
        const newSavedFields: Record<string, boolean> = {};
        let foundMetadata = { user: user?.email || '', timestamp: null };

        snapshot.docs.forEach(doc => {
          const data = doc.data();
          newFormData[data.analyte] = { value: data.value, capturedAt: null };
          newSavedFields[data.analyte] = true;
          
          if (!foundMetadata.timestamp || (data.timestamp && data.timestamp.toMillis() < foundMetadata.timestamp.toMillis())) {
            foundMetadata = { user: data.userEmail || user?.email || '', timestamp: data.fechaServidor || data.timestamp };
          }
        });

        setFormData(newFormData);
        setSavedFields(newSavedFields);
        setMetadata(foundMetadata);
      } catch (e) {
        console.error("Error fetching air data", e);
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
    
    // Delta Time Calculation
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
        retrasoSincronizacionMs: deltaMs,
        fechaServidor: serverTimestamp(),
        timestamp: serverTimestamp(), // Keep for legacy
        userId: user.uid,
        userEmail: user.email
      };

      if (!snapshot.empty) {
        updateDoc(doc(db, 'samples', snapshot.docs[0].id), payload);
      } else {
        addDoc(collection(db, 'samples'), {
          ...payload,
          medium: 'aire',
          parameterType: category,
          analyte: name,
          reportId,
          formId,
          stationId,
        });
      }

      updateDoc(doc(db, 'reports', reportId), { editors: arrayUnion(user.email) });
      setSavedFields(prev => ({ ...prev, [name]: true }));
      toast({ title: "Sincronizado", description: `${name} actualizado.` });
    } catch (error: any) {
      console.error(error);
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
    return <div className="p-12 text-center text-xs animate-pulse font-normal uppercase text-black">Cargando Calidad de Aire...</div>;
  }

  const rowClass = "flex items-center justify-between py-3 border-b border-neutral-200 hover:bg-neutral-50 transition-colors group px-4";
  const labelClass = "text-[12px] font-normal text-black tracking-tight font-headline leading-none uppercase";
  const subLabelClass = "text-[10px] text-neutral-500 font-normal leading-tight mt-1";
  const inputClass = "h-8 w-24 border-none bg-neutral-50 px-2 text-[12px] font-code text-black font-normal text-right focus:ring-0 outline-none";

  return (
    <div className="mx-auto w-full border border-black bg-white font-body shadow-sm rounded-none overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300 pb-20">
      <div className="border-b border-black bg-neutral-100 px-4 py-4 flex justify-between items-center">
        <div>
          <div className="flex items-center gap-2">
            <Wind className="h-4 w-4 text-primary" />
            <h1 className="text-sm font-normal uppercase tracking-tight text-black font-headline">Calidad de Aire • CA-001</h1>
          </div>
          <div className="flex flex-col gap-0.5 mt-2">
            <p className="text-[10px] text-neutral-600 font-normal uppercase leading-none tracking-tight">Planilla ID: {formId}</p>
            <div className="flex items-center gap-3 text-[9px] text-black font-normal uppercase tracking-tighter mt-1">
              <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5 text-primary" /> {formatTimestamp(metadata.timestamp)}</span>
              <span className="flex items-center gap-1"><User className="h-2.5 w-2.5 text-primary" /> <TechnicianLink email={metadata.user || user?.email || null} /></span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-0">
        <div className="bg-neutral-50 px-4 py-2 border-b border-neutral-200">
           <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Analitos y Niveles Guía</span>
        </div>
        
        {params.map((param) => (
          <div key={param.name} className={rowClass}>
            <div className="flex flex-col flex-1 mr-4">
              <label className={labelClass}>{param.name} <span className="text-[10px] opacity-60 ml-1">({param.unit})</span></label>
              <span className={subLabelClass}>{param.desc}</span>
            </div>
            <div className="flex items-center gap-3">
              <input 
                type="text" 
                className={inputClass} 
                value={formData[param.name]?.value ?? ""} 
                onChange={(e) => handleInputChange(param.name, e.target.value)} 
                placeholder="---"
              />
              <button 
                onClick={() => saveIndividualParam(param.name, param.cat)} 
                className={cn("p-1 transition-colors", savedFields[param.name] ? "text-green-600" : "text-neutral-300 hover:text-black")}
              >
                {savingFields[param.name] ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className={cn("h-4 w-4", !savedFields[param.name] && "opacity-20")} />
                )}
              </button>
            </div>
          </div>
        ))}

        <div className="px-4 py-6 bg-neutral-50">
          <PhotoRegistry 
            reportId={reportId} 
            formId={formId} 
            stationId={stationId} 
            medium="aire" 
            analyteTag="Evidencia Aire (CA-001)"
          />
        </div>
      </div>

      <div className="bg-white p-4 border-t border-black">
        <button onClick={onClose} className="w-full bg-black hover:bg-neutral-900 py-4 text-[11px] font-normal uppercase tracking-widest text-white shadow-xl">Finalizar Monitoreo de Aire</button>
      </div>
    </div>
  );
}
