'use client';

import { useState, useMemo, useEffect } from 'react';
import { collection, setDoc, serverTimestamp, doc, updateDoc, arrayUnion, query, where, getDocs, Timestamp, deleteDoc } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Check, CheckCircle2, Clock, User, Calendar, Beaker, MapPin, Settings2, Plus, Trash2, ChevronDown, ChevronUp, Sigma, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PhotoRegistry } from './photo-registry';
import { TechnicianLink } from './technician-link';
import { getCurrentGPSLocation } from '@/lib/geo-utils';

type MeasurementSystem = 'metric' | 'imperial' | 'local';

interface Reading {
  id: string;
  value: string;
  capturedAt: number;
  isSaved: boolean;
  isSaving: boolean;
}

interface AnalyteConfig {
  name: string;
  metric: string[];
  imperial: string[];
  local: string[];
  category: string;
}

const IN_SITU_CONFIG: AnalyteConfig[] = [
  { name: "Temperatura", metric: ["°C", "K"], imperial: ["°F"], local: [], category: "In Situ" },
  { name: "pH", metric: [], imperial: [], local: ["upH"], category: "In Situ" },
  { name: "pHmV", metric: ["mV", "V"], imperial: [], local: [], category: "In Situ" },
  { name: "Salinidad", metric: ["g/kg", "mg/kg"], imperial: [], local: ["PSU", "‰"], category: "In Situ" },
  { name: "Conductividad", metric: ["mS/cm", "µS/cm", "µS/m", "S/m"], imperial: [], local: [], category: "In Situ" },
  { name: "Solidos Disueltos Totales", metric: ["g/L", "mg/L", "µg/L", "ng/L"], imperial: ["lb/gal", "gpg"], local: ["ppm", "ppb", "ppt"], category: "In Situ" },
  { name: "Oxigeno Disuelto", metric: ["mg/L", "µg/L", "ng/L"], imperial: [], local: ["ppm", "ppb"], category: "In Situ" },
  { name: "Saturacion de oxigeno in situ", metric: [], imperial: [], local: ["%"], category: "In Situ" },
  { name: "Profundidad disco Secchi", metric: ["cm", "m", "mm"], imperial: ["in", "ft"], local: [], category: "In Situ" },
  { name: "Turbiedad", metric: [], imperial: [], local: ["NTU", "FNU", "FTU"], category: "In Situ" },
  { name: "Caudal", metric: ["m³/s", "L/s", "m³/h", "ML/día"], imperial: ["ft³/s (cfs)", "gal/min (gpm)"], local: [], category: "In Situ" },
  { name: "Precipitaciones", metric: ["mm", "cm"], imperial: ["in"], local: [], category: "In Situ" },
  { name: "Q estimado", metric: ["m³/s", "L/s", "m³/h", "ML/día"], imperial: ["ft³/s (cfs)", "gal/min (gpm)"], local: [], category: "In Situ" },
  { name: "Q instantaneo", metric: ["m³/s", "L/s", "m³/h", "ML/día"], imperial: ["ft³/s (cfs)", "gal/min (gpm)"], local: [], category: "In Situ" },
  { name: "Tirante (H)", metric: ["m"], imperial: ["ft"], local: [], category: "In Situ" },
  { name: "Cota", metric: ["m"], imperial: ["ft a.s.l.", "ft AMSL"], local: ["m.s.n.m."], category: "In Situ" },
  { name: "Transparencia", metric: ["cm", "m", "mm"], imperial: ["in", "ft"], local: [], category: "In Situ" },
  { name: "Velocidad de corriente", metric: ["m/s", "km/h"], imperial: ["ft/s", "mph"], local: [], category: "In Situ" },
  { name: "Profundidad", metric: ["m", "cm", "mm"], imperial: ["ft", "in"], local: [], category: "In Situ" },
  { name: "ORP", metric: ["mV", "V"], imperial: [], local: [], category: "In Situ" }
];

const LAB_CONFIG = [
  { name: "Nitrogeno Amoniacal", unit: "mg/l", cat: "Nutrientes" },
  { name: "Nitrogeno total", unit: "mg/l", cat: "Nutrientes" },
  { name: "Fosforo total", unit: "mg/l", cat: "Nutrientes" },
  { name: "DBO5", unit: "mg/l", cat: "Orgánicos" },
  { name: "Coliformes totales", unit: "3NMP/100ml", cat: "Microbiología" },
  { name: "Escherichia coli", unit: "3NMP/100ml", cat: "Microbiología" },
  { name: "Arsenico", unit: "mg/l", cat: "Metales" },
  { name: "Cadmio", unit: "ug/l", cat: "Metales" },
  { name: "Cromo", unit: "mg/l", cat: "Metales" },
  { name: "Plomo", unit: "mg/l", cat: "Metales" }
];

interface SurfaceWaterAnalyteState {
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

export function SurfaceWaterFormIntegrated({ reportId, formId, stationId, onClose }: Props) {
  const { toast } = useToast();
  const db = useFirestore();
  const { user } = useUser();
  
  const [globalSystem, setGlobalSystem] = useState<MeasurementSystem>('metric');
  const [formData, setFormData] = useState<Record<string, SurfaceWaterAnalyteState>>({});
  const [isLoadingExisting, setIsLoadingExisting] = useState(true);
  const [metadata, setMetadata] = useState<{ user?: string, timestamp?: any }>({});
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
        
        const newFormData: Record<string, SurfaceWaterAnalyteState> = {};
        let foundMetadata = { user: user?.email || '', timestamp: null };
        let foundDeferred = false;

        snapshot.docs.forEach(docSnap => {
          const data = docSnap.data();
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
            newFormData[analyte] = { readings: [], unit: unit || "", isExpanded: false };
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

        // Ordenar lecturas por tiempo
        Object.keys(newFormData).forEach(key => {
          newFormData[key].readings.sort((a, b) => a.capturedAt - b.capturedAt);
        });

        setFormData(newFormData);
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

  const handleReadingChange = (analyteName: string, readingId: string, value: string) => {
    setFormData(prev => {
      const analyte = prev[analyteName] || { readings: [], unit: "", isExpanded: true };
      const updatedReadings = analyte.readings.map(r => 
        r.id === readingId ? { ...r, value, isSaved: false } : r
      );
      return { ...prev, [analyteName]: { ...analyte, readings: updatedReadings } };
    });
  };

  const addReading = (analyteName: string, initialUnit: string) => {
    setFormData(prev => {
      const analyte = prev[analyteName] || { readings: [], unit: initialUnit, isExpanded: true };
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

    // Feedback visual optimista
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
          medium: 'agua_superficial',
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
        console.error("Error guardando lectura:", err);
      }
    })();

    toast({ title: "Lectura capturada", description: `${analyteName} sincronizando...` });
  };

  const calculateStats = (readings: Reading[]) => {
    const nums = readings.map(r => parseFloat(r.value)).filter(n => !isNaN(n));
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
    return <div className="p-12 text-center text-xs animate-pulse font-normal uppercase text-black">Iniciando instrumental AS-001...</div>;
  }

  return (
    <div className="mx-auto w-full border border-black bg-white font-body shadow-sm rounded-none overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300 pb-20">
      {/* CABECERA */}
      <div className="border-b border-black bg-neutral-100 px-4 py-4">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-sm font-normal uppercase tracking-tight text-black font-headline">Agua Superficial • AS-001</h1>
            <p className="text-[10px] text-neutral-600 font-normal uppercase leading-none tracking-tight mt-1">Planilla ID: {formId}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-1 bg-white border border-black px-2 py-1">
               <Settings2 className="h-3 w-3 text-primary" />
               <select 
                 value={globalSystem} 
                 onChange={(e) => setGlobalSystem(e.target.value as MeasurementSystem)}
                 className="text-[9px] font-black uppercase bg-transparent border-none outline-none focus:ring-0 p-0"
               >
                 <option value="metric">Sistema Métrico (SI)</option>
                 <option value="imperial">Sistema Imperial</option>
                 <option value="local">Local / Adimensional</option>
               </select>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[9px] text-black font-normal uppercase tracking-tighter mt-3">
          {isDeferred ? (
            <div className="flex items-center gap-1.5 bg-white border border-black px-2 py-0.5 rounded-sm">
              <Calendar className="h-3 w-3 text-red-600" />
              <input 
                type="datetime-local" 
                value={manualDate} 
                onChange={(e) => setManualDate(e.target.value)}
                className="bg-transparent border-none p-0 text-[9px] font-black uppercase outline-none focus:ring-0 w-32"
              />
            </div>
          ) : (
            <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5 text-primary" /> {formatTimestamp(metadata.timestamp)}</span>
          )}
          <button 
            onClick={() => setIsDeferred(!isDeferred)}
            className={cn(
              "flex items-center gap-1 px-1.5 py-0.5 rounded-full border transition-all",
              isDeferred ? "bg-red-50 border-red-200 text-red-600" : "bg-green-50 border-green-200 text-green-600"
            )}
          >
            <CheckCircle2 className="h-2.5 w-2.5" />
            <span className="text-[7px] font-black">{isDeferred ? "DIFERIDA" : "REAL"}</span>
          </button>
          <span className="flex items-center gap-1"><User className="h-2.5 w-2.5 text-primary" /> <TechnicianLink email={metadata.user || user?.email || null} /></span>
        </div>
      </div>

      <div className="p-0">
        {/* SECCIÓN I: IN SITU CON LECTURAS MÚLTIPLES */}
        <div className="bg-black text-white px-4 py-2 flex items-center justify-between">
           <div className="flex items-center gap-2">
             <Sigma className="h-4 w-4" />
             <span className="text-[10px] font-normal uppercase tracking-[0.2em]">Sección I: Mediciones In Situ (Estabilización)</span>
           </div>
           <AlertCircle className="h-3 w-3 text-neutral-400" title="Se recomienda cargar al menos 3 lecturas para estabilizar." />
        </div>
        
        <div className="divide-y divide-neutral-200">
          {IN_SITU_CONFIG.map((analyte) => {
            const units = [...analyte[globalSystem], ...analyte.metric, ...analyte.imperial, ...analyte.local].filter((u, i, self) => u && self.indexOf(u) === i);
            const state = formData[analyte.name] || { readings: [], unit: units[0] || "", isExpanded: false };
            const stats = calculateStats(state.readings);
            
            return (
              <div key={analyte.name} className="flex flex-col bg-white overflow-hidden">
                {/* Cabecera del Analito */}
                <div className="flex items-center justify-between py-3 px-4 hover:bg-neutral-50 transition-colors">
                  <button 
                    onClick={() => setFormData(prev => ({ ...prev, [analyte.name]: { ...state, isExpanded: !state.isExpanded } }))}
                    className="flex-1 text-left flex items-center gap-2"
                  >
                    {state.isExpanded ? <ChevronUp className="h-4 w-4 text-primary" /> : <ChevronDown className="h-4 w-4 text-neutral-400" />}
                    <div className="flex flex-col">
                      <span className="text-[12px] font-normal text-black uppercase tracking-tight">{analyte.name}</span>
                      {stats && (
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-code font-black text-primary">x̄: {stats.mean}</span>
                          <span className="text-[8px] text-neutral-400 uppercase">n={stats.n} lecturas</span>
                        </div>
                      )}
                    </div>
                  </button>

                  <div className="flex items-center gap-3">
                    {stats && (
                       <div className="bg-neutral-100 px-2 py-0.5 rounded-sm border border-neutral-200" title="Error Estándar (SE)">
                          <span className="text-[9px] font-code text-neutral-600">± {stats.error}</span>
                       </div>
                    )}
                    <select 
                      value={state.unit} 
                      onChange={(e) => setFormData(prev => ({ ...prev, [analyte.name]: { ...state, unit: e.target.value } }))}
                      className="text-[9px] font-bold uppercase bg-neutral-50 border border-neutral-300 px-1 py-1 outline-none"
                    >
                      {units.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <button 
                      onClick={() => addReading(analyte.name, units[0])}
                      className="h-8 w-8 flex items-center justify-center bg-black text-white hover:bg-neutral-800 transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Sub-lista de Lecturas */}
                {state.isExpanded && (
                  <div className="bg-neutral-50/50 px-4 pb-4 space-y-2 animate-in slide-in-from-top-2 duration-200">
                    {state.readings.map((reading, idx) => (
                      <div key={reading.id} className="flex items-center justify-between gap-4 p-2 bg-white border border-neutral-200 shadow-sm">
                        <span className="text-[10px] font-normal uppercase text-neutral-400 shrink-0">Lectura {idx + 1}</span>
                        <div className="flex items-center gap-2 flex-1 justify-end">
                          <input 
                            type="number" 
                            step="any"
                            placeholder="Valor..."
                            className="h-8 w-24 border-none bg-neutral-50 px-2 text-[12px] font-code text-black text-right outline-none focus:ring-1 focus:ring-primary/20"
                            value={reading.value}
                            onChange={(e) => handleReadingChange(analyte.name, reading.id, e.target.value)}
                          />
                          <button 
                            onClick={() => saveReading(analyte.name, reading.id, analyte.category)}
                            className={cn("p-1.5 transition-colors", reading.isSaved ? "text-green-600" : "text-neutral-300 hover:text-black")}
                          >
                            {reading.isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          </button>
                          <button 
                            onClick={() => removeReading(analyte.name, reading.id)}
                            className="p-1.5 text-neutral-300 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {state.readings.length === 0 && (
                      <p className="text-[10px] text-center text-neutral-400 py-2 italic">No hay lecturas registradas. Toque (+) para empezar.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* SECCIÓN II: LABORATORIO (DATOS ÚNICOS) */}
        <div className="bg-neutral-800 text-white px-4 py-2 flex items-center gap-2 mt-4">
           <Beaker className="h-4 w-4" />
           <span className="text-[10px] font-normal uppercase tracking-[0.2em]">Sección II: Analitos de Laboratorio</span>
        </div>

        <div className="divide-y divide-neutral-200">
          {LAB_CONFIG.map((param) => {
            const state = formData[param.name] || { readings: [], unit: param.unit, isExpanded: true };
            const currentReading = state.readings[0] || { id: `temp_lab_${param.name}`, value: "", capturedAt: Date.now(), isSaved: false, isSaving: false };
            
            return (
              <div key={param.name} className="flex items-center justify-between py-3 px-4 hover:bg-neutral-50 transition-colors">
                <div className="flex flex-col">
                  <label className="text-[11px] font-normal text-black uppercase tracking-tight">{param.name}</label>
                  <span className="text-[8px] text-neutral-400 uppercase font-normal">{param.cat}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-normal text-neutral-500 uppercase">{param.unit}</span>
                  <input 
                    type="text" 
                    className="h-8 w-24 border-none bg-neutral-50 px-2 text-[12px] font-code text-black text-right outline-none placeholder:text-neutral-300" 
                    value={currentReading.value} 
                    onChange={(e) => {
                      if (state.readings.length === 0) {
                        setFormData(prev => ({ ...prev, [param.name]: { readings: [currentReading], unit: param.unit, isExpanded: true } }));
                      }
                      handleReadingChange(param.name, currentReading.id, e.target.value);
                    }} 
                    placeholder="---"
                  />
                  <button 
                    onClick={() => saveReading(param.name, currentReading.id, param.cat)} 
                    className={cn("p-1 transition-colors", currentReading.isSaved ? "text-green-600" : "text-neutral-300 hover:text-black")}
                  >
                    <Check className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* EVIDENCIA FOTOGRÁFICA */}
        <div className="px-4 py-6 bg-neutral-50 border-t border-neutral-200 mt-6">
          <PhotoRegistry 
            reportId={reportId} 
            formId={formId} 
            stationId={stationId} 
            medium="agua_superficial" 
            analyteTag="Evidencia Agua (AS-001)"
          />
        </div>
      </div>

      <div className="bg-white p-4 border-t border-black">
        <button onClick={onClose} className="w-full bg-black hover:bg-neutral-900 py-4 text-[11px] font-normal uppercase tracking-widest text-white shadow-xl">Finalizar Protocolo AS-001</button>
      </div>
    </div>
  );
}
