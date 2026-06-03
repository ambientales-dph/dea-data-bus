'use client';

import { useState, useMemo, useEffect } from 'react';
import { collection, setDoc, serverTimestamp, doc, updateDoc, arrayUnion, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Check, CheckCircle2, Clock, User, Calendar, Beaker, MapPin, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PhotoRegistry } from './photo-registry';
import { TechnicianLink } from './technician-link';
import { getCurrentGPSLocation } from '@/lib/geo-utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type MeasurementSystem = 'metric' | 'imperial' | 'local';

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

interface SurfaceWaterEntry {
  value: string;
  unit: string;
  capturedAt: number | null;
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
  const [formData, setFormData] = useState<Record<string, SurfaceWaterEntry>>({});
  const [savingFields, setSavingFields] = useState<Record<string, boolean>>({});
  const [savedFields, setSavedFields] = useState<Record<string, boolean>>({});
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
        
        const newFormData: Record<string, SurfaceWaterEntry> = {};
        const newSavedFields: Record<string, boolean> = {};
        let foundMetadata = { user: user?.email || '', timestamp: null };
        let foundDeferred = false;

        snapshot.docs.forEach(doc => {
          const data = doc.data();
          const analyte = data.analyte;
          const fullValue = data.value || "";
          
          // Intentamos separar valor de unidad si están guardados juntos
          const lastSpaceIdx = fullValue.lastIndexOf(" ");
          let val = fullValue;
          let unit = "";
          
          if (lastSpaceIdx !== -1) {
            val = fullValue.substring(0, lastSpaceIdx);
            unit = fullValue.substring(lastSpaceIdx + 1);
          }

          newFormData[analyte] = { value: val, unit: unit, capturedAt: null };
          newSavedFields[analyte] = true;
          
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
    setFormData(prev => ({
      ...prev,
      [name]: { ...prev[name], value, capturedAt: Date.now() }
    }));
    if (savedFields[name]) {
      setSavedFields(prev => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleUnitChange = (name: string, unit: string) => {
    setFormData(prev => ({
      ...prev,
      [name]: { ...prev[name], unit, capturedAt: Date.now() }
    }));
    if (savedFields[name]) {
      setSavedFields(prev => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const saveIndividualParam = (name: string, category: string) => {
    if (!user || !db) return;
    const entry = formData[name];
    if (!entry || entry.value === null || entry.value === undefined || entry.value === "") return;

    // FEEDBACK INSTANTÁNEO
    setSavedFields(prev => ({ ...prev, [name]: true }));
    
    // Proceso en segundo plano
    (async () => {
      try {
        const location = await getCurrentGPSLocation();
        const t1 = entry.capturedAt || Date.now();
        const deltaMs = Date.now() - t1;

        const safeAnalyte = name.replace(/[^a-zA-Z0-9]/g, '_');
        const docId = `${reportId}_${formId}_${safeAnalyte}`;
        const sampleRef = doc(db, 'samples', docId);

        // Guardamos valor y unidad juntos en el campo value para compatibilidad legacy
        const finalValue = entry.unit ? `${entry.value} ${entry.unit}` : entry.value;

        const payload = {
          medium: 'agua_superficial',
          parameterType: category,
          analyte: name,
          reportId,
          formId,
          stationId,
          value: finalValue,
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
        console.error("Error en guardado:", err);
      }
    })();
    
    toast({ title: "Capturado", description: `${name} sincronizado localmente.` });
  };

  const getAvailableUnits = (analyte: AnalyteConfig) => {
    let units = analyte[globalSystem];
    // Si el sistema actual no tiene unidades, mostramos las de otros sistemas como respaldo
    if (units.length === 0) {
      units = [...analyte.metric, ...analyte.imperial, ...analyte.local];
    }
    return units;
  };

  const formatTimestamp = (ts: any) => {
    if (!ts) return new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (isLoadingExisting) {
    return <div className="p-12 text-center text-xs animate-pulse font-normal uppercase text-black">Cargando protocolo AS-001...</div>;
  }

  const isDeferredLocked = Object.keys(savedFields).length > 0;

  return (
    <div className="mx-auto w-full border border-black bg-white font-body shadow-sm rounded-none overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300 pb-20">
      {/* HEADER */}
      <div className="border-b border-black bg-neutral-100 px-4 py-4">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-sm font-normal uppercase tracking-tight text-black font-headline">Agua Superficial • AS-001</h1>
            <p className="text-[10px] text-neutral-600 font-normal uppercase leading-none tracking-tight mt-1">ID Planilla: {formId}</p>
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
                 <option value="local">Adimensional / Local</option>
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

      <div className="p-0">
        {/* SECCIÓN IN SITU */}
        <div className="bg-black text-white px-4 py-2 flex items-center gap-2">
           <MapPin className="h-4 w-4" />
           <span className="text-[10px] font-normal uppercase tracking-[0.2em]">Sección I: Mediciones In Situ</span>
        </div>
        
        <div className="divide-y divide-neutral-200">
          {IN_SITU_CONFIG.map((analyte) => {
            const units = getAvailableUnits(analyte);
            const currentEntry = formData[analyte.name] || { value: "", unit: units[0] || "", capturedAt: null };
            
            return (
              <div key={analyte.name} className="flex flex-col md:flex-row md:items-center justify-between py-3 px-4 hover:bg-neutral-50 transition-colors group">
                <div className="flex-1 mb-2 md:mb-0">
                  <label className="text-[11px] font-normal text-black uppercase tracking-tight block">{analyte.name}</label>
                </div>
                
                <div className="flex items-center gap-2">
                  {/* Selector de Unidad */}
                  {units.length > 0 && (
                    <div className="bg-neutral-100 px-2 py-1 border border-neutral-300 min-w-[60px] flex justify-center">
                      <select 
                        value={currentEntry.unit || units[0]} 
                        onChange={(e) => handleUnitChange(analyte.name, e.target.value)}
                        className="text-[9px] font-normal uppercase bg-transparent border-none outline-none focus:ring-0 p-0 text-center cursor-pointer"
                      >
                        {units.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                  )}

                  {/* Input de Valor */}
                  <input 
                    type="text" 
                    className="h-8 w-24 border-none bg-neutral-50 px-2 text-[12px] font-code text-black text-right focus:ring-0 outline-none placeholder:text-neutral-300" 
                    value={currentEntry.value} 
                    onChange={(e) => handleInputChange(analyte.name, e.target.value)} 
                    placeholder="---"
                  />

                  {/* Botón Guardar */}
                  <button 
                    onClick={() => saveIndividualParam(analyte.name, analyte.category)} 
                    className={cn(
                      "p-1 transition-colors", 
                      savedFields[analyte.name] ? "text-green-600" : "text-neutral-300 hover:text-black"
                    )}
                  >
                    {savingFields[analyte.name] ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className={cn("h-4 w-4", !savedFields[analyte.name] && "opacity-30")} />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* SECCIÓN LABORATORIO */}
        <div className="bg-neutral-800 text-white px-4 py-2 flex items-center gap-2 mt-4">
           <Beaker className="h-4 w-4" />
           <span className="text-[10px] font-normal uppercase tracking-[0.2em]">Sección II: Analitos de Laboratorio</span>
        </div>

        <div className="divide-y divide-neutral-200">
          {LAB_CONFIG.map((param) => {
            const currentEntry = formData[param.name] || { value: "", unit: param.unit, capturedAt: null };
            
            return (
              <div key={param.name} className="flex items-center justify-between py-3 px-4 hover:bg-neutral-50 transition-colors group">
                <div className="flex-1">
                  <label className="text-[11px] font-normal text-black uppercase tracking-tight block">{param.name}</label>
                  <span className="text-[9px] text-neutral-400 uppercase font-normal">{param.cat}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-normal text-neutral-500 uppercase">{param.unit}</span>
                  <input 
                    type="text" 
                    className="h-8 w-24 border-none bg-neutral-50 px-2 text-[12px] font-code text-black text-right focus:ring-0 outline-none placeholder:text-neutral-300" 
                    value={currentEntry.value} 
                    onChange={(e) => handleInputChange(param.name, e.target.value)} 
                    placeholder="---"
                  />
                  <button 
                    onClick={() => saveIndividualParam(param.name, param.cat)} 
                    className={cn(
                      "p-1 transition-colors", 
                      savedFields[param.name] ? "text-green-600" : "text-neutral-300 hover:text-black"
                    )}
                  >
                    {savingFields[param.name] ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className={cn("h-4 w-4", !savedFields[param.name] && "opacity-30")} />
                    )}
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
