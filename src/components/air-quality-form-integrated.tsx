'use client';

import { useState, useMemo, useEffect } from 'react';
import { collection, setDoc, serverTimestamp, doc, updateDoc, arrayUnion, query, where, getDocs, Timestamp, deleteDoc } from 'firebase/firestore';
import { useFirestore, useUser, useDoc } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Check, Clock, User, Wind, CheckCircle2, Calendar, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PhotoRegistry } from './photo-registry';
import { TechnicianLink } from './technician-link';
import { getCurrentGPSLocation } from '@/lib/geo-utils';

interface Reading {
  id: string;
  value: string;
  capturedAt: number;
  isSaved: boolean;
  isSaving: boolean;
}

interface AirAnalyteState {
  readings: Reading[];
  unit: string;
  isExpanded: boolean;
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
  const [formData, setFormData] = useState<Record<string, AirAnalyteState>>({});
  const [isLoadingExisting, setIsLoadingExisting] = useState(true);
  const [metadata, setMetadata] = useState<{ user?: string, timestamp?: any }>({});
  const [isDeferred, setIsDeferred] = useState(false);
  const [manualDate, setManualDate] = useState<string>(new Date().toISOString().slice(0, 16));

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
        
        const newFormData: Record<string, AirAnalyteState> = {};
        let foundMetadata = { user: user?.email || '', timestamp: null };
        let foundDeferred = false;

        snapshot.docs.forEach(docSnap => {
          const data = docSnap.data();
          if (data.parameterType === 'Fotografía') return;

          const analyte = data.analyte;
          const fullValue = data.value || "";
          const lastSpaceIdx = fullValue.lastIndexOf(" ");
          
          let val = fullValue;
          let unit = "";
          if (lastSpaceIdx !== -1) {
            val = fullValue.substring(0, lastSpaceIdx);
            unit = fullValue.substring(lastSpaceIdx + 1);
          }

          if (!newFormData[analyte]) {
            const config = params.find(p => p.name === analyte);
            newFormData[analyte] = { readings: [], unit: unit || config?.unit || "", isExpanded: false };
          }

          newFormData[analyte].readings.push({
            id: docSnap.id,
            value: val,
            capturedAt: data.capturedAt?.toMillis?.() || Date.now(),
            isSaved: true,
            isSaving: false
          });
          
          if (!foundMetadata.timestamp || (data.timestamp && data.timestamp.toMillis() < foundMetadata.timestamp.toMillis())) {
            foundMetadata = { user: data.userEmail || user?.email || '', timestamp: data.fechaServidor || data.timestamp };
            if (data.timestamp) {
               const date = data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
               setManualDate(date.toISOString().slice(0, 16));
            }
          }
          if (data.isDeferred !== undefined) foundDeferred = data.isDeferred;
        });

        // Ordenar lecturas por tiempo de captura
        Object.keys(newFormData).forEach(key => {
          newFormData[key].readings.sort((a, b) => a.capturedAt - b.capturedAt);
        });

        setFormData(newFormData);
        setMetadata(foundMetadata);
        setIsDeferred(foundDeferred);
      } catch (e) {
        console.error("Error fetching air data", e);
      } finally {
        setIsLoadingExisting(false);
      }
    };

    fetchExistingData();
  }, [db, reportId, formId, user?.email]);

  const handleReadingChange = (analyteName: string, readingId: string, value: string) => {
    setFormData(prev => {
      const analyte = prev[analyteName] || { readings: [], unit: "", isExpanded: true };
      const updatedReadings = analyte.readings.map(r => 
        r.id === readingId ? { ...r, value, isSaved: false } : r
      );
      return { ...prev, [analyteName]: { ...analyte, readings: updatedReadings } };
    });
  };

  const addReading = (analyteName: string, unit: string) => {
    setFormData(prev => {
      const analyte = prev[analyteName] || { readings: [], unit, isExpanded: true };
      const newReading: Reading = {
        id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        value: "",
        capturedAt: Date.now(),
        isSaved: false,
        isSaving: false
      };
      return { 
        ...prev, 
        [analyteName]: { 
          ...analyte, 
          readings: [...analyte.readings, newReading],
          isExpanded: true 
        } 
      };
    });
  };

  const removeReading = (analyteName: string, readingId: string) => {
    setFormData(prev => {
      const analyte = prev[analyteName];
      if (!analyte) return prev;
      
      const toDelete = analyte.readings.find(r => r.id === readingId);
      if (toDelete?.isSaved && !readingId.startsWith('temp_')) {
        deleteDoc(doc(db, 'samples', readingId)).catch(console.error);
      }

      return { 
        ...prev, 
        [analyteName]: { 
          ...analyte, 
          readings: analyte.readings.filter(r => r.id !== readingId) 
        } 
      };
    });
  };

  const saveReading = (analyteName: string, readingId: string, category: string) => {
    if (!user || !db) return;
    const analyteState = formData[analyteName];
    const reading = analyteState.readings.find(r => r.id === readingId);
    
    if (!reading || reading.value === "") return;

    // Optimistic UI update
    setFormData(prev => ({
      ...prev,
      [analyteName]: {
        ...prev[analyteName],
        readings: prev[analyteName].readings.map(r => 
          r.id === readingId ? { ...r, isSaved: true, isSaving: false } : r
        )
      }
    }));

    (async () => {
      try {
        const location = await getCurrentGPSLocation();
        const finalValue = analyteState.unit ? `${reading.value} ${analyteState.unit}` : reading.value;
        
        const docId = readingId.startsWith('temp_') 
          ? `${reportId}_${formId}_${analyteName.replace(/\s+/g, '_')}_${reading.capturedAt}`
          : readingId;

        const sampleRef = doc(db, 'samples', docId);
        const payload = {
          medium: 'aire',
          parameterType: category,
          analyte: analyteName,
          reportId,
          formId,
          stationId,
          value: finalValue,
          latitude: location?.latitude ?? null,
          longitude: location?.longitude ?? null,
          retrasoSincronizacionMs: isDeferred ? 0 : Date.now() - reading.capturedAt,
          fechaServidor: serverTimestamp(),
          timestamp: isDeferred ? Timestamp.fromDate(new Date(manualDate)) : serverTimestamp(),
          isDeferred,
          userId: user.uid,
          userEmail: user.email,
          capturedAt: Timestamp.fromMillis(reading.capturedAt)
        };

        setDoc(sampleRef, payload, { merge: true }).catch(console.error);
        updateDoc(doc(db, 'reports', reportId), { editors: arrayUnion(user.email) }).catch(console.error);
      } catch (err) {
        console.error("Error guardando lectura de aire:", err);
      }
    })();

    toast({ title: "Lectura de aire capturada", description: `${analyteName} sincronizando...` });
  };

  const calculateStats = (readings: Reading[]) => {
    const nums = readings.map(r => parseFloat(r.value.replace(',', '.'))).filter(n => !isNaN(n));
    if (nums.length === 0) return null;
    
    const n = nums.length;
    const mean = nums.reduce((a, b) => a + b, 0) / n;
    
    if (n < 2) return { mean: mean.toFixed(3), error: "0.000", n };

    const variance = nums.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (n - 1);
    const sd = Math.sqrt(variance);
    const se = sd / Math.sqrt(n); 

    return { mean: mean.toFixed(3), error: se.toFixed(3), n };
  };

  const formatTimestamp = (ts: any) => {
    if (!ts) return new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (isLoadingExisting) {
    return <div className="p-12 text-center text-xs animate-pulse font-normal uppercase text-black">Iniciando instrumental CA-001...</div>;
  }

  const isDeferredLocked = Object.keys(formData).some(k => formData[k].readings.some(r => r.isSaved));

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
                <span className="text-[7px] font-black">{isDeferred ? "DIFERIDA" : "REAL"}</span>
              </button>

              <span className="flex items-center gap-1"><User className="h-2.5 w-2.5 text-primary" /> <TechnicianLink email={metadata.user || user?.email || null} /></span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-0">
        <div className="bg-neutral-50 px-4 py-2 border-b border-neutral-200">
           <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Analitos y Niveles Guía de Referencia</span>
        </div>
        
        <div className="divide-y divide-neutral-200">
          {params.map((param) => {
            const state = formData[param.name] || { readings: [], unit: param.unit, isExpanded: false };
            const stats = calculateStats(state.readings);
            
            return (
              <div key={param.name} className="flex flex-col bg-white overflow-hidden">
                <div className="flex items-center justify-between py-3 px-4 hover:bg-neutral-50 transition-colors">
                  <button 
                    onClick={() => setFormData(prev => ({ ...prev, [param.name]: { ...state, isExpanded: !state.isExpanded } }))}
                    className="flex-1 text-left flex items-center gap-2"
                  >
                    {state.isExpanded ? <ChevronUp className="h-4 w-4 text-primary" /> : <ChevronDown className="h-4 w-4 text-neutral-400" />}
                    <div className="flex flex-col">
                      <span className="text-[12px] font-normal text-black uppercase tracking-tight">{param.name}</span>
                      <div className="flex items-center gap-1 mt-0.5">
                        <User className="h-2.5 w-2.5 text-neutral-300" />
                        <TechnicianLink email={metadata.user || user?.email || null} className="text-[8px] uppercase text-neutral-400 font-normal hover:text-primary transition-colors" />
                      </div>
                      <span className="text-[10px] text-neutral-500 font-normal leading-tight mt-1">{param.desc}</span>
                    </div>
                  </button>

                  <div className="flex items-center gap-3">
                    {stats && (
                       <div className="bg-neutral-100 px-3 py-1 rounded-sm border border-neutral-200 flex items-center gap-1.5" title="Media ± SE">
                          <span className="text-[10px] font-code font-black text-primary">x̄: {stats.mean} ± {stats.error}</span>
                       </div>
                    )}
                    <span className="text-[9px] font-bold uppercase text-neutral-300 px-2">{param.unit}</span>
                  </div>
                </div>

                {state.isExpanded && (
                  <div className="bg-white pb-2 animate-in slide-in-from-top-1 duration-200 divide-y divide-neutral-50 border-t border-neutral-100">
                    {state.readings.map((reading, idx) => (
                      <div key={reading.id} className="flex items-center justify-between gap-2 py-1 px-4 border-b border-neutral-50 last:border-0 hover:bg-neutral-50/50 transition-colors group">
                        <span className="text-[9px] font-normal uppercase text-neutral-300 group-hover:text-neutral-500 transition-colors shrink-0">L{idx + 1}</span>
                        <div className="flex items-center gap-2 flex-1 justify-end">
                          <input 
                            type="text" 
                            placeholder="0.00"
                            className="h-7 w-20 border-none bg-transparent px-1 text-[11px] font-code text-black text-right outline-none focus:ring-0"
                            value={reading.value}
                            onChange={(e) => handleReadingChange(param.name, reading.id, e.target.value)}
                          />
                          <div className="flex items-center gap-1 border-l border-neutral-100 pl-2 ml-2">
                            <button 
                              onClick={() => saveReading(param.name, reading.id, param.cat)}
                              className={cn("p-1 transition-colors", reading.isSaved ? "text-green-600" : "text-neutral-300 hover:text-black")}
                              title="Guardar lectura"
                            >
                              {reading.isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className={cn("h-3.5 w-3.5", !reading.isSaved && "opacity-30")} />}
                            </button>
                            <button 
                              onClick={() => addReading(param.name, param.unit)}
                              className="p-1 text-neutral-300 hover:text-black transition-colors"
                              title="Agregar otra lectura"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                            <button 
                              onClick={() => removeReading(param.name, reading.id)}
                              className="p-1 text-neutral-300 hover:text-red-600 transition-colors"
                              title="Eliminar lectura"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {state.readings.length === 0 && (
                      <div className="p-4 text-center">
                        <p className="text-[9px] text-neutral-400 mb-2 uppercase tracking-wider italic">Sin lecturas para {param.name}</p>
                        <button 
                          onClick={() => addReading(param.name, param.unit)}
                          className="h-8 px-4 text-[9px] uppercase tracking-widest border border-dashed border-neutral-300 hover:bg-neutral-50 transition-colors"
                        >
                          <Plus className="h-3 w-3 inline mr-1" /> Comenzar carga
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="px-4 py-6 bg-neutral-50 border-t border-neutral-200 mt-6">
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
