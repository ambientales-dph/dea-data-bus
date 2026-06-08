'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, where, doc, setDoc, serverTimestamp, updateDoc, arrayUnion, getDocs, Timestamp, deleteDoc } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Check, Clock, User, Plus, Trash2, Mountain, ThermometerSun, Layers as LayersIcon, Droplets, Search, MapPin, Locate, Tag, CheckCircle2, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PhotoRegistry } from './photo-registry';
import { TechnicianLink } from './technician-link';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getCurrentGPSLocation } from '@/lib/geo-utils';

interface Reading {
  id: string;
  value: string;
  capturedAt: number;
  isSaved: boolean;
  isSaving: boolean;
}

interface AnalyteState {
  readings: Reading[];
  isExpanded: boolean;
  userEmail?: string;
}

interface SoilEntry {
  value: any;
  capturedAt: number | null;
  userEmail?: string;
}

interface Props {
  reportId: string;
  formId: string;
  stationId: string;
  onClose?: () => void;
}

interface OSMResult {
  display_name: string;
  lat: string;
  lon: string;
}

export function PlanillaEdafologicaForm({ reportId, formId, stationId, onClose }: Props) {
  const { toast } = useToast();
  const db = useFirestore();
  const { user } = useUser();
  
  const [formData, setFormData] = useState<Record<string, SoilEntry>>({});
  const [multidata, setMultidata] = useState<Record<string, AnalyteState>>({});
  const [horizontesCount, setHorizontesCount] = useState(1);
  const [savingFields, setSavingFields] = useState<Record<string, boolean>>({});
  const [savedFields, setSavedFields] = useState<Record<string, boolean>>({});
  const [isLoadingExisting, setIsLoadingExisting] = useState(true);
  const [metadata, setMetadata] = useState<{ timestamp?: any }>({});
  const [isDeferred, setIsDeferred] = useState(false);
  const [manualDate, setManualDate] = useState<string>(new Date().toISOString().slice(0, 16));

  const [osmQuery, setOsmQuery] = useState('');
  const [osmResults, setOsmResults] = useState<OSMResult[]>([]);
  const [isSearchingOSM, setIsSearchingOSM] = useState(false);
  const [showOSMResults, setShowOSMResults] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
        
        const newFormData: Record<string, SoilEntry> = {};
        const newMultidata: Record<string, AnalyteState> = {};
        const newSavedFields: Record<string, boolean> = {};
        let foundMetadata = { timestamp: null };
        let foundDeferred = false;
        let maxH = 1;

        snapshot.docs.forEach(docSnap => {
          const data = docSnap.data();
          const analyte = data.analyte;
          const value = data.value;

          if (!foundMetadata.timestamp || (data.timestamp && data.timestamp.toMillis() < foundMetadata.timestamp.toMillis())) {
            foundMetadata = { timestamp: data.fechaServidor || data.timestamp };
            if (data.timestamp) {
               const date = data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
               setManualDate(date.toISOString().slice(0, 16));
            }
          }
          if (data.isDeferred !== undefined) foundDeferred = data.isDeferred;

          const isMultidataField = analyte === 'Pendiente' || analyte === 'Prof_Napa' || analyte.endsWith(' pH');
          
          if (isMultidataField) {
            if (!newMultidata[analyte]) {
              newMultidata[analyte] = { readings: [], isExpanded: false, userEmail: data.userEmail };
            }
            newMultidata[analyte].readings.push({
              id: docSnap.id,
              value: value,
              capturedAt: data.capturedAt?.toMillis?.() || Date.now(),
              isSaved: true,
              isSaving: false
            });
            newSavedFields[analyte] = true;
          } else {
            newFormData[analyte] = { value, capturedAt: null, userEmail: data.userEmail };
            newSavedFields[analyte] = true;
          }

          const hMatch = analyte.match(/^H(\d+):/);
          if (hMatch) {
            const hNum = parseInt(hMatch[1]);
            if (hNum > maxH) maxH = hNum;
          }
        });

        Object.keys(newMultidata).forEach(key => {
          newMultidata[key].readings.sort((a, b) => a.capturedAt - b.capturedAt);
        });

        setFormData(newFormData);
        setMultidata(newMultidata);
        setSavedFields(newSavedFields);
        setMetadata(foundMetadata);
        setHorizontesCount(maxH);
        setIsDeferred(foundDeferred);
        if (newFormData["Lugar"]) setOsmQuery(newFormData["Lugar"].value);
      } catch (e) {
        console.error("Error fetching soil data", e);
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
          medium: 'suelo',
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
        console.error("Error en guardado:", err);
      }
    })();
    
    toast({ title: "Sincronizando localmente", description: "Dato capturado." });
  };

  const handleReadingChange = (analyteName: string, readingId: string, value: string) => {
    setMultidata(prev => {
      const analyte = prev[analyteName] || { readings: [], isExpanded: true };
      const updatedReadings = analyte.readings.map(r => 
        r.id === readingId ? { ...r, value, isSaved: false } : r
      );
      return { ...prev, [analyteName]: { ...analyte, readings: updatedReadings } };
    });
  };

  const addReading = (analyteName: string) => {
    setMultidata(prev => {
      const analyte = prev[analyteName] || { readings: [], isExpanded: true };
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
    setMultidata(prev => {
      const analyte = prev[analyteName];
      if (!analyte) return prev;
      const toDelete = analyte.readings.find(r => r.id === readingId);
      if (toDelete?.isSaved && !readingId.startsWith('temp_')) {
        deleteDoc(doc(db, 'samples', readingId)).catch(console.error);
      }
      return { 
        ...prev, 
        [analyteName]: { ...analyte, readings: analyte.readings.filter(r => r.id !== readingId) } 
      };
    });
  };

  const saveReading = (analyteName: string, readingId: string, category: string) => {
    if (!user || !db) return;
    const state = multidata[analyteName];
    const reading = state.readings.find(r => r.id === readingId);
    if (!reading || reading.value === "") return;

    setMultidata(prev => ({
      ...prev,
      [analyteName]: {
        ...prev[analyteName],
        userEmail: user.email!,
        readings: prev[analyteName].readings.map(r => 
          r.id === readingId ? { ...r, isSaved: true, isSaving: false } : r
        )
      }
    }));

    (async () => {
      try {
        const location = await getCurrentGPSLocation();
        const docId = readingId.startsWith('temp_') 
          ? `${reportId}_${formId}_${analyteName.replace(/\s+/g, '_')}_${reading.capturedAt}`
          : readingId;

        const sampleRef = doc(db, 'samples', docId);
        const payload = {
          medium: 'suelo',
          parameterType: category,
          analyte: analyteName,
          reportId,
          formId,
          stationId,
          value: reading.value,
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

  const handleOSMSearch = async (q: string) => {
    setOsmQuery(q);
    if (q.length < 3) {
      setOsmResults([]);
      setShowOSMResults(false);
      return;
    }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearchingOSM(true);
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=ar&limit=5`);
        if (res.ok) {
          const data = await res.json();
          setOsmResults(data);
          setShowOSMResults(true);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsSearchingOSM(false);
      }
    }, 500);
  };

  const selectOSMLocation = (res: OSMResult) => {
    const val = res.display_name;
    setOsmQuery(val);
    handleInputChange("Lugar", val);
    saveParam("Lugar", "General", val);
    setShowOSMResults(false);
  };

  const captureGPS = async () => {
    toast({ title: "Obteniendo coordenadas...", description: "Forzando alta precisión GPS." });
    const location = await getCurrentGPSLocation();
    if (location) {
      const val = `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`;
      handleInputChange("Punto_Muestreo", val);
      saveParam("Punto_Muestreo", "General", val);
      toast({ title: "Ubicación capturada", description: val });
    } else {
      toast({ variant: "destructive", title: "Falla de GPS", description: "No se pudo obtener la ubicación física." });
    }
  };

  const sectionHeaderClass = "flex items-center gap-2 bg-neutral-100 px-4 py-2 border-y border-neutral-400 mt-6 first:mt-0";
  const rowClass = "flex items-center justify-between py-2.5 border-b border-neutral-300 hover:bg-neutral-50 transition-colors group px-4";
  const labelClass = "text-[11px] font-normal text-black tracking-tight font-headline leading-none w-1/3 shrink-0 uppercase";
  const inputClass = "h-7 flex-1 border-none bg-transparent px-2 text-[12px] font-code text-black font-normal text-right rounded-none focus:ring-0 outline-none placeholder:text-neutral-300";

  const renderField = (name: string, label: string, cat: string, placeholder = "---") => {
    const entry = formData[name];
    const isSaved = savedFields[name];
    return (
      <div className={rowClass}>
        <div className="flex flex-col flex-1">
          <label className={labelClass}>{label}</label>
          {isSaved && entry?.userEmail && (
            <div className="flex items-center gap-1 mt-0.5">
              <User className="h-2.5 w-2.5 text-neutral-300" />
              <TechnicianLink email={entry.userEmail} className="text-[8px] uppercase text-neutral-400 font-normal hover:text-primary transition-colors" />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-1 justify-end">
          <input 
            type="text" 
            className={inputClass} 
            value={formData[name]?.value ?? ""} 
            onChange={(e) => handleInputChange(name, e.target.value)} 
            placeholder={placeholder}
          />
          <button onClick={() => saveParam(name, cat)} className={cn("p-1 transition-colors", isSaved ? "text-green-600" : "text-black hover:text-primary")}>
            {savingFields[name] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isSaved ? <div className="rounded-full bg-green-100 p-0.5"><Check className="h-2.5 w-2.5 text-green-600" /></div> : <Check className="h-4 w-4" />}
          </button>
        </div>
      </div>
    );
  };

  const renderMultidataField = (name: string, label: string, cat: string, unit = "") => {
    const state = multidata[name] || { readings: [], isExpanded: false };
    const stats = calculateStats(state.readings);
    const hasSavedValue = state.readings.some(r => r.isSaved);

    return (
      <div key={name} className="flex flex-col bg-white overflow-hidden border-b border-neutral-300">
        <div className="flex items-center justify-between py-2.5 px-4 hover:bg-neutral-50 transition-colors">
          <button 
            onClick={() => setMultidata(prev => ({ ...prev, [name]: { ...state, isExpanded: !state.isExpanded } }))}
            className="flex-1 text-left flex items-center gap-2"
          >
            {state.isExpanded ? <ChevronUp className="h-4 w-4 text-primary" /> : <ChevronDown className="h-4 w-4 text-neutral-400" />}
            <div className="flex flex-col">
              <span className={labelClass}>{label}</span>
              {hasSavedValue && state.userEmail && (
                <div className="flex items-center gap-1 mt-0.5">
                  <User className="h-2.5 w-2.5 text-neutral-300" />
                  <TechnicianLink email={state.userEmail} className="text-[8px] uppercase text-neutral-400 font-normal hover:text-primary transition-colors" />
                </div>
              )}
            </div>
          </button>

          <div className="flex items-center gap-3">
            {stats && (
              <div className="bg-neutral-100 px-3 py-1 rounded-sm border border-neutral-200 flex items-center gap-1.5" title="Media ± SE">
                <span className="text-[10px] font-code font-black text-primary">x̄: {stats.mean} ± {stats.error}</span>
                <span className="text-[8px] text-neutral-400 ml-1 font-normal">{unit}</span>
              </div>
            )}
            {!stats && unit && <span className="text-[9px] font-bold text-neutral-300">{unit}</span>}
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
                    onChange={(e) => handleReadingChange(name, reading.id, e.target.value)}
                  />
                  <div className="flex items-center gap-1 border-l border-neutral-100 pl-2 ml-2">
                    <button 
                      onClick={() => saveReading(name, reading.id, cat)}
                      className={cn("p-1 transition-colors", reading.isSaved ? "text-green-600" : "text-neutral-300 hover:text-black")}
                    >
                      {reading.isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className={cn("h-3.5 w-3.5", !reading.isSaved && "opacity-30")} />}
                    </button>
                    <button 
                      onClick={() => addReading(name)}
                      className="p-1 text-neutral-300 hover:text-black transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button 
                      onClick={() => removeReading(name, reading.id)}
                      className="p-1 text-neutral-300 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {state.readings.length === 0 && (
              <div className="p-4 text-center">
                <button 
                  onClick={() => addReading(name)}
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
  };

  const renderSelect = (name: string, label: string, cat: string, options: {v: string, l: string}[]) => {
    const isSaved = savedFields[name];
    const entry = formData[name];
    return (
      <div className={rowClass}>
        <div className="flex flex-col flex-1">
          <label className={labelClass}>{label}</label>
          {isSaved && entry?.userEmail && (
            <div className="flex items-center gap-1 mt-0.5">
              <User className="h-2.5 w-2.5 text-neutral-300" />
              <TechnicianLink email={entry.userEmail} className="text-[8px] uppercase text-neutral-400 font-normal hover:text-primary transition-colors" />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-1 justify-end">
          <Select 
            value={formData[name]?.value ?? ""} 
            onValueChange={(val) => {
              handleInputChange(name, val);
              saveParam(name, cat, val);
            }}
          >
            <SelectTrigger className="h-7 border-none bg-transparent shadow-none focus:ring-0 text-[11px] font-normal text-black text-right flex-row-reverse p-0 w-full justify-start gap-2">
              <SelectValue placeholder="Seleccionar..." />
            </SelectTrigger>
            <SelectContent>
              {options.map(opt => (
                <SelectItem key={opt.v} value={opt.v} className="text-xs font-normal uppercase">{opt.l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className={cn("p-1", isSaved ? "text-green-600" : "text-transparent")}>
            {savingFields[name] ? <Loader2 className="h-3.5 w-3.5 animate-spin text-black" /> : <div className="rounded-full bg-green-100 p-0.5"><Check className="h-2.5 w-2.5" /></div>}
          </div>
        </div>
      </div>
    );
  };

  const formatTimestamp = (ts: any) => {
    if (!ts) return new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (isLoadingExisting) {
    return <div className="p-12 text-center text-xs animate-pulse font-normal uppercase text-black">Cargando Planilla Edafologica...</div>;
  }

  const isDeferredLocked = Object.keys(savedFields).length > 0;

  return (
    <div className="mx-auto w-full border border-neutral-400 bg-white font-body shadow-sm rounded-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300 pb-20">
      <div className="border-b border-neutral-400 bg-neutral-100 px-4 py-3 flex justify-between items-center">
        <div>
          <h1 className="text-sm font-normal uppercase tracking-tight text-black font-headline">Suelos • PE-001</h1>
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
            </div>
          </div>
        </div>
      </div>

      <div className={sectionHeaderClass}><Mountain className="h-3.5 w-3.5 text-primary" /><span className="text-[10px] font-normal uppercase tracking-wider text-black">1. Identificación y Ubicación</span></div>
      
      <div className={cn(rowClass, "relative")}>
        <div className="flex flex-col flex-1">
          <label className={labelClass}>Lugar / Localidad</label>
          {savedFields["Lugar"] && formData["Lugar"]?.userEmail && (
            <div className="flex items-center gap-1 mt-0.5">
              <User className="h-2.5 w-2.5 text-neutral-300" />
              <TechnicianLink email={formData["Lugar"].userEmail} className="text-[8px] uppercase text-neutral-400 font-normal" />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-1 justify-end">
          <div className="relative flex-1 flex justify-end">
            <input 
              type="text" 
              className={cn(inputClass, "pr-6")} 
              value={osmQuery} 
              onChange={(e) => handleOSMSearch(e.target.value)} 
              onFocus={() => osmResults.length > 0 && setShowOSMResults(true)}
              placeholder="Buscar localidad..."
            />
            {isSearchingOSM ? <Loader2 className="h-3.5 w-3.5 animate-spin absolute right-0 top-2 text-neutral-400" /> : <Search className="h-3.5 w-3.5 absolute right-0 top-2 text-neutral-400" />}
          </div>
          <button onClick={() => saveParam("Lugar", "General", osmQuery)} className={cn("p-1", savedFields["Lugar"] ? "text-green-600" : "text-black")}>
            <Check className="h-4 w-4" />
          </button>
        </div>
        {showOSMResults && (
          <div className="absolute top-full left-0 right-0 z-50 bg-white border shadow-xl mt-1 rounded-sm"><ScrollArea className="h-48">{osmResults.map((res, i) => (<button key={i} onClick={() => selectOSMLocation(res)} className="w-full text-left p-2 hover:bg-neutral-50 text-[10px] uppercase">{res.display_name}</button>))}</ScrollArea></div>
        )}
      </div>

      <div className={rowClass}>
        <div className="flex flex-col flex-1">
          <label className={labelClass}>Punto Específico</label>
          {savedFields["Punto_Muestreo"] && formData["Punto_Muestreo"]?.userEmail && (
            <div className="flex items-center gap-1 mt-0.5">
              <User className="h-2.5 w-2.5 text-neutral-300" />
              <TechnicianLink email={formData["Punto_Muestreo"].userEmail} className="text-[8px] uppercase text-neutral-400 font-normal" />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-1 justify-end">
          <input type="text" className={inputClass} value={formData["Punto_Muestreo"]?.value ?? ""} onChange={(e) => handleInputChange("Punto_Muestreo", e.target.value)} />
          <button onClick={captureGPS} className="p-1"><Locate className="h-4 w-4 text-primary" /></button>
          <button onClick={() => saveParam("Punto_Muestreo", "General")} className={cn("p-1", savedFields["Punto_Muestreo"] ? "text-green-600" : "text-black")}><Check className="h-4 w-4" /></button>
        </div>
      </div>

      {renderField("Paisaje", "Paisaje / Forma", "Entorno")}
      {renderField("Material_Originario", "Material Originario", "Geología")}

      <div className={sectionHeaderClass}><ThermometerSun className="h-3.5 w-3.5 text-primary" /><span className="text-[10px] font-normal uppercase tracking-wider text-black">2. Factores Ambientales</span></div>
      {renderField("Clima", "Clima / Región", "Entorno")}
      {renderField("Vegetacion", "Vegetación / Cultivo", "Entorno")}
      {renderSelect("Drenaje", "Drenaje", "Propiedades", [{v: "0", l: "0 - Muy Pobre"}, {v: "6", l: "6 - Excesivo"}])}
      {renderMultidataField("Pendiente", "Pendiente", "Propiedades", "%")}
      {renderMultidataField("Prof_Napa", "Profundidad Napa", "Propiedades", "m")}

      <div className={sectionHeaderClass}><LayersIcon className="h-3.5 w-3.5 text-primary" /><span className="text-[10px] font-normal uppercase tracking-wider text-black">3. Perfil del Suelo (Horizontes)</span></div>
      {Array.from({ length: horizontesCount }).map((_, i) => {
        const hIdx = i + 1;
        const hPrefix = `H${hIdx}:`;
        return (
          <div key={hIdx} className="mb-6 border-b-2 border-neutral-200 pb-2">
            <div className="bg-neutral-50 px-4 py-1.5 flex justify-between items-center border-y border-neutral-300">
              <span className="text-[11px] font-normal uppercase text-primary tracking-widest">Horizonte {hIdx}</span>
              {hIdx > 1 && hIdx === horizontesCount && (<button onClick={() => setHorizontesCount(prev => prev - 1)} className="text-destructive p-1"><Trash2 className="h-3.5 w-3.5" /></button>)}
            </div>
            {renderField(`${hPrefix} Horizonte`, "Denominación", "Horizontes")}
            {renderField(`${hPrefix} Profundidad`, "Profundidad (cm)", "Horizontes")}
            {renderMultidataField(`${hPrefix} pH`, "pH", "Horizontes", "upH")}
            {renderSelect(`${hPrefix} Textura`, "Textura", "Horizontes", [{v: "F", l: "Franca"}, {v: "Ar", l: "Arcillosa"}])}
          </div>
        );
      })}
      <div className="px-4 py-2"><Button variant="outline" className="w-full h-10 border-dashed border-neutral-400 text-[11px] uppercase tracking-widest text-neutral-500 rounded-none" onClick={() => setHorizontesCount(prev => prev + 1)}><Plus className="h-4 w-4 mr-2" /> Agregar Horizonte</Button></div>

      <div className={sectionHeaderClass}><Tag className="h-3.5 w-3.5 text-primary" /><span className="text-[10px] font-normal uppercase tracking-wider text-black">4. Clasificación</span></div>
      {renderField("Serie", "Serie de Suelo", "Clasificación")}

      <div className={sectionHeaderClass}><Droplets className="h-3.5 w-3.5 text-primary" /><span className="text-[10px] font-normal uppercase tracking-wider text-black">5. Registro Fotográfico</span></div>
      <div className="px-4 py-6"><PhotoRegistry reportId={reportId} formId={formId} stationId={stationId} medium="suelo" /></div>

      <div className="bg-white p-4 border-t border-neutral-400"><button onClick={onClose} className="w-full bg-neutral-900 hover:bg-black py-4 text-[11px] uppercase tracking-widest text-white shadow-xl transition-all active:scale-[0.98]">Finalizar y Cerrar Planilla</button></div>
    </div>
  );
}
