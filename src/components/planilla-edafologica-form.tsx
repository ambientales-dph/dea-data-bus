'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, where, doc, setDoc, serverTimestamp, updateDoc, arrayUnion, getDocs, Timestamp, deleteDoc } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Check, Clock, User, Plus, Trash2, Mountain, ThermometerSun, Layers as LayersIcon, Droplets, Search, Locate, CheckCircle2, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
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

interface CapaEdafologica {
  id: string;
  profundidadInicio: string;
  profundidadFin: string;
  colorColumna: string;
  patron: string;
  denominacion: string;
  textura: string;
  estructura: string;
  consistencia: string;
  multidata: Record<string, AnalyteState>;
  userEmails: Record<string, string>;
}

const patronesDisponibles = [
  { value: "none", label: "Sin patrón" },
  { value: "dots", label: "Puntos (arena)" },
  { value: "diagonal", label: "Diagonal (arcilla)" },
  { value: "horizontal", label: "Horizontal (limo)" },
  { value: "cross-hatch", label: "Cruzado (orgánico)" },
];

const coloresDisponibles = [
  { value: "#FFFFFF", label: "Blanco" },
  { value: "#223322", label: "Negro (Horizonte O/A)" },
  { value: "#8B4513", label: "Marrón Oscuro" },
  { value: "#D2B48C", label: "Marrón Claro" },
  { value: "#F5F5DC", label: "Beige / Arena" },
  { value: "#D1D1D1", label: "Gris Claro" },
  { value: "#8C8C8C", label: "Gris Medio" },
  { value: "#9EB0AF", label: "Gley 1 (Claro)" },
  { value: "#748A89", label: "Gley 2 (Medio)" },
  { value: "#4D5E5D", label: "Gley 3 (Oscuro)" },
];

function PatronSVG({ patron, color }: { patron: string; color: string }) {
  const patternId = `pattern-pe-${patron}-${color.replace("#", "")}`;
  return (
    <svg width="100%" height="100%" className="absolute inset-0">
      <defs>
        {patron === "dots" && (<pattern id={patternId} patternUnits="userSpaceOnUse" width="8" height="8"><rect width="8" height="8" fill={color} /><circle cx="4" cy="4" r="1.5" fill="#333" /></pattern>)}
        {patron === "diagonal" && (<pattern id={patternId} patternUnits="userSpaceOnUse" width="8" height="8"><rect width="8" height="8" fill={color} /><path d="M-2,2 l4,-4 M0,8 l8,-8 M6,10 l4,-4" stroke="#333" strokeWidth="1" /></pattern>)}
        {patron === "horizontal" && (<pattern id={patternId} patternUnits="userSpaceOnUse" width="8" height="4"><rect width="8" height="4" fill={color} /><line x1="0" y1="2" x2="8" y2="2" stroke="#333" strokeWidth="0.5" /></pattern>)}
        {patron === "cross-hatch" && (<pattern id={patternId} patternUnits="userSpaceOnUse" width="8" height="8"><rect width="8" height="8" fill={color} /><path d="M0,0 l8,8 M8,0 l-8,8" stroke="#333" strokeWidth="0.5" /></pattern>)}
      </defs>
      {patron !== "none" ? <rect width="100%" height="100%" fill={`url(#${patternId})`} /> : <rect width="100%" height="100%" fill={color} />}
    </svg>
  );
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
  
  const [formData, setFormData] = useState<Record<string, { value: any; userEmail?: string }>>({});
  const [capas, setCapas] = useState<CapaEdafologica[]>([]);
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
        const q = query(collection(db, 'samples'), where('reportId', '==', reportId), where('formId', '==', formId));
        const snapshot = await getDocs(q);
        
        const newFormData: Record<string, any> = {};
        const newSavedFields: Record<string, boolean> = {};
        const layersMap: Record<string, Partial<CapaEdafologica>> = {};
        let foundMetadata = { timestamp: null };
        let foundDeferred = false;

        snapshot.docs.forEach(docSnap => {
          const data = docSnap.data();
          const analyte = data.analyte;
          const value = data.value;

          if (!foundMetadata.timestamp || (data.timestamp && data.timestamp.toMillis() < foundMetadata.timestamp.toMillis())) {
            foundMetadata = { timestamp: data.fechaServidor || data.timestamp };
            if (data.timestamp) { setManualDate(data.timestamp.toDate().toISOString().slice(0, 16)); }
          }
          if (data.isDeferred !== undefined) foundDeferred = data.isDeferred;

          const layerMatch = analyte.match(/^H(\d+): (.*)/);
          if (layerMatch) {
            const lId = layerMatch[1];
            const fieldName = layerMatch[2];
            if (!layersMap[lId]) layersMap[lId] = { id: lId, multidata: {}, userEmails: {} };
            
            if (fieldName === 'pH') {
              if (!layersMap[lId]!.multidata![fieldName]) layersMap[lId]!.multidata![fieldName] = { readings: [], isExpanded: false, userEmail: data.userEmail };
              layersMap[lId]!.multidata![fieldName].readings.push({
                id: docSnap.id, value, capturedAt: data.capturedAt?.toMillis() || Date.now(), isSaved: true, isSaving: false
              });
            } else {
              (layersMap[lId] as any)[fieldName] = value;
              layersMap[lId]!.userEmails![fieldName] = data.userEmail;
            }
            newSavedFields[analyte] = true;
          } else {
            newFormData[analyte] = { value, userEmail: data.userEmail };
            newSavedFields[analyte] = true;
          }
        });

        const initialCapas = Object.values(layersMap).map(l => ({
          id: l.id!,
          profundidadInicio: l.profundidadInicio || "",
          profundidadFin: l.profundidadFin || "",
          colorColumna: l.colorColumna || "#F5F5DC",
          patron: l.patron || "none",
          denominacion: l.denominacion || "",
          textura: l.textura || "",
          estructura: l.estructura || "",
          consistencia: l.consistencia || "",
          multidata: l.multidata || {},
          userEmails: l.userEmails || {}
        } as CapaEdafologica)).sort((a, b) => parseInt(a.id) - parseInt(b.id));

        if (initialCapas.length === 0) initialCapas.push(createEmptyLayer(Date.now().toString(), "0"));

        setFormData(newFormData);
        setCapas(initialCapas);
        setSavedFields(newSavedFields);
        setMetadata(foundMetadata);
        setIsDeferred(foundDeferred);
        if (newFormData["Lugar"]) setOsmQuery(newFormData["Lugar"].value);
      } catch (e) { console.error(e); } finally { setIsLoadingExisting(false); }
    };
    fetchExistingData();
  }, [db, reportId, formId]);

  const createEmptyLayer = (id: string, start: string): CapaEdafologica => ({
    id, profundidadInicio: start, profundidadFin: "", colorColumna: "#F5F5DC", patron: "none", denominacion: "", textura: "", estructura: "", consistencia: "", multidata: {}, userEmails: {}
  });

  const calculateStats = (readings: Reading[]) => {
    const nums = readings.map(r => parseFloat(r.value.replace(',', '.'))).filter(n => !isNaN(n));
    if (nums.length === 0) return null;
    const n = nums.length;
    const mean = nums.reduce((a, b) => a + b, 0) / n;
    if (n < 2) return { mean: mean.toFixed(2), error: "0.00", n };
    const variance = nums.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (n - 1);
    const sd = Math.sqrt(variance);
    const se = sd / Math.sqrt(n); 
    return { mean: mean.toFixed(2), error: se.toFixed(2), n };
  };

  const handleReadingChange = (layerId: string, field: string, readingId: string, value: string) => {
    setCapas(prev => prev.map(c => {
      if (c.id !== layerId) return c;
      const state = c.multidata[field] || { readings: [], isExpanded: true };
      const readings = state.readings.map(r => r.id === readingId ? { ...r, value, isSaved: false } : r);
      return { ...c, multidata: { ...c.multidata, [field]: { ...state, readings, userEmail: undefined } } };
    }));
  };

  const addReading = (layerId: string, field: string) => {
    setCapas(prev => prev.map(c => {
      if (c.id !== layerId) return c;
      const state = c.multidata[field] || { readings: [], isExpanded: true };
      const newR = { id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, value: "", capturedAt: Date.now(), isSaved: false, isSaving: false };
      return { ...c, multidata: { ...c.multidata, [field]: { ...state, readings: [...state.readings, newR], isExpanded: true } } };
    }));
  };

  const saveReading = (layerId: string, field: string, readingId: string) => {
    if (!user || !db) return;
    const capa = capas.find(c => c.id === layerId);
    const state = capa?.multidata[field];
    const reading = state?.readings.find(r => r.id === readingId);
    if (!reading || reading.value === "") return;

    setCapas(prev => prev.map(c => {
      if (c.id !== layerId) return c;
      const readings = c.multidata[field].readings.map(r => r.id === readingId ? { ...r, isSaved: true } : r);
      return { ...c, multidata: { ...c.multidata, [field]: { ...c.multidata[field], readings, userEmail: user.email! } } };
    }));

    (async () => {
      const location = await getCurrentGPSLocation();
      const analyte = `H${layerId}: ${field}`;
      const docId = readingId.startsWith('temp_') ? `${reportId}_${formId}_${analyte.replace(/[: ]/g, '_')}_${reading.capturedAt}` : readingId;
      const payload = {
        medium: 'suelo', parameterType: 'Horizontes', analyte, reportId, formId, stationId, value: reading.value,
        latitude: location?.latitude || null, longitude: location?.longitude || null, 
        retrasoSincronizacionMs: isDeferred ? 0 : Date.now() - reading.capturedAt,
        fechaServidor: serverTimestamp(), timestamp: isDeferred ? Timestamp.fromDate(new Date(manualDate)) : serverTimestamp(),
        isDeferred, userId: user.uid, userEmail: user.email, capturedAt: Timestamp.fromMillis(reading.capturedAt)
      };
      setDoc(doc(db, 'samples', docId), payload, { merge: true });
      updateDoc(doc(db, 'reports', reportId), { editors: arrayUnion(user.email) });
    })();
  };

  const removeReading = (layerId: string, field: string, readingId: string) => {
    setCapas(prev => prev.map(c => {
      if (c.id !== layerId) return c;
      const state = c.multidata[field];
      if (!readingId.startsWith('temp_')) {
        deleteDoc(doc(db, 'samples', readingId));
      }
      return { ...c, multidata: { ...c.multidata, [field]: { ...state, readings: state.readings.filter(r => r.id !== readingId) } } };
    }));
  };

  const handleSimpleFieldSave = (analyte: string, category: string, value: any) => {
    if (!user || !db || value === "") return;
    setSavedFields(prev => ({ ...prev, [analyte]: true }));
    
    const layerMatch = analyte.match(/^H(\d+): (.*)/);
    if (layerMatch) {
      const lId = layerMatch[1];
      const field = layerMatch[2];
      setCapas(prev => prev.map(c => c.id === lId ? { ...c, userEmails: { ...c.userEmails, [field]: user.email! } } : c));
    } else {
      setFormData(prev => ({ ...prev, [analyte]: { ...prev[analyte], value, userEmail: user.email! } }));
    }

    (async () => {
      const location = await getCurrentGPSLocation();
      const docId = `${reportId}_${formId}_${analyte.replace(/[: ]/g, '_')}`;
      setDoc(doc(db, 'samples', docId), {
        medium: 'suelo', parameterType: category, analyte, reportId, formId, stationId, value: `${value}`,
        latitude: location?.latitude || null, longitude: location?.longitude || null,
        fechaServidor: serverTimestamp(), timestamp: isDeferred ? Timestamp.fromDate(new Date(manualDate)) : serverTimestamp(),
        isDeferred, userId: user.uid, userEmail: user.email
      }, { merge: true });
    })();
  };

  const handleHeaderChange = (id: string, value: any) => {
    setFormData(prev => ({ ...prev, [id]: { ...prev[id], value, userEmail: undefined } }));
    if (savedFields[id]) {
      setSavedFields(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const captureGPS = async () => {
    const location = await getCurrentGPSLocation();
    if (location) {
      const val = `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`;
      handleHeaderChange("Punto_Muestreo", val);
      handleSimpleFieldSave("Punto_Muestreo", "General", val);
      toast({ title: "GPS capturado" });
    }
  };

  const renderMultidataCell = (layerId: string, field: string, unit = "") => {
    const capa = capas.find(c => c.id === layerId);
    const state = capa?.multidata[field] || { readings: [], isExpanded: false };
    const stats = calculateStats(state.readings);

    return (
      <div className="flex flex-col gap-1 py-1">
        <button 
          onClick={() => setCapas(prev => prev.map(c => c.id === layerId ? { ...c, multidata: { ...c.multidata, [field]: { ...state, isExpanded: !state.isExpanded } } } : c))}
          className="w-full text-center hover:bg-neutral-100 transition-colors py-0.5 rounded"
        >
          {stats ? (
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-code font-black text-primary leading-none">{stats.mean}</span>
              <span className="text-[7px] text-neutral-400 font-code leading-tight">±{stats.error}</span>
            </div>
          ) : (
            <span className="text-neutral-300 italic text-[9px]">---</span>
          )}
        </button>

        {state.isExpanded && (
          <div className="absolute z-[60] bg-white border border-neutral-300 shadow-2xl p-2 rounded-sm w-44 animate-in fade-in zoom-in-95 duration-200">
             <div className="flex items-center justify-between mb-1.5 border-b pb-1">
                <span className="text-[8px] font-black uppercase text-neutral-400">{field} ({unit})</span>
                <button onClick={() => setCapas(prev => prev.map(c => c.id === layerId ? { ...c, multidata: { ...c.multidata, [field]: { ...state, isExpanded: false } } } : c))}>
                   <ChevronUp className="h-3 w-3 text-neutral-300" />
                </button>
             </div>
             <div className="space-y-1">
                {state.readings.map((r, i) => (
                  <div key={r.id} className="flex items-center gap-1">
                    <span className="text-[8px] text-neutral-300">L{i+1}</span>
                    <input 
                      className="h-6 w-14 text-[10px] font-code border border-neutral-100 px-1 focus:ring-0 outline-none" 
                      value={r.value} 
                      onChange={(e) => handleReadingChange(layerId, field, r.id, e.target.value)} 
                    />
                    <button onClick={() => saveReading(layerId, field, r.id)} className={cn("p-0.5", r.isSaved ? "text-green-600" : "text-neutral-300")}>
                      <Check className="h-3 w-3" />
                    </button>
                    <button onClick={() => addReading(layerId, field)} className="p-0.5 text-neutral-300 hover:text-black">
                      <Plus className="h-3 w-3" />
                    </button>
                    <button onClick={() => removeReading(layerId, field, r.id)} className="p-0.5 text-neutral-300 hover:text-red-600">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {state.readings.length === 0 && (
                   <button onClick={() => addReading(layerId, field)} className="w-full h-7 text-[8px] uppercase border border-dashed border-neutral-300">Cargar</button>
                )}
             </div>
          </div>
        )}
      </div>
    );
  };

  const handleOSMSearch = async (q: string) => {
    setOsmQuery(q);
    if (q.length < 3) { setOsmResults([]); setShowOSMResults(false); return; }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearchingOSM(true);
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=ar&limit=5`);
        if (res.ok) { setOsmResults(await res.json()); setShowOSMResults(true); }
      } catch (e) { console.error(e); } finally { setIsSearchingOSM(false); }
    }, 500);
  };

  const agregarCapa = () => {
    const last = capas[capas.length - 1];
    setCapas(prev => [...prev, createEmptyLayer(Date.now().toString(), last?.profundidadFin || "0")]);
  };

  if (isLoadingExisting) return <div className="p-12 text-center text-xs animate-pulse font-normal uppercase text-black">Cargando Planilla Edafologica...</div>;

  const sectionHeaderClass = "flex items-center gap-2 bg-neutral-100 px-4 py-2 border-y border-neutral-400 mt-6 first:mt-0";
  const labelClass = "text-[11px] font-normal text-black tracking-tight font-headline uppercase shrink-0";

  return (
    <div className="mx-auto w-full border border-black bg-white font-body shadow-sm rounded-none overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300 pb-20">
      <div className="border-b-2 border-black bg-neutral-100 px-4 py-4">
        <h1 className="text-sm font-normal uppercase tracking-tight text-black font-headline">Suelos • PE-001</h1>
        <div className="flex flex-col gap-0.5 mt-2">
           <p className="text-[10px] text-neutral-600 font-normal uppercase leading-none tracking-tight">Planilla ID: {formId}</p>
           <div className="flex flex-wrap items-center gap-3 text-[9px] text-black font-normal uppercase tracking-tighter mt-1">
              {isDeferred ? (
                <div className="flex items-center gap-1.5 bg-white border border-black px-2 py-0.5 rounded-sm">
                  <Calendar className="h-3 w-3 text-red-600" />
                  <input type="datetime-local" value={manualDate} onChange={(e) => setManualDate(e.target.value)} className="bg-transparent border-none p-0 text-[9px] font-black uppercase outline-none focus:ring-0 w-32" />
                </div>
              ) : <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5 text-primary" /> {new Date().toLocaleString('es-AR')}</span>}
              <button onClick={() => setIsDeferred(!isDeferred)} className={cn("flex items-center gap-1 px-1.5 py-0.5 rounded-full border", isDeferred ? "bg-red-50 border-red-200 text-red-600" : "bg-green-50 border-green-200 text-green-600")}><CheckCircle2 className="h-2.5 w-2.5" /><span className="text-[7px] font-black">{isDeferred ? "DIFERIDA" : "REAL"}</span></button>
           </div>
        </div>
      </div>

      <div className={sectionHeaderClass}><Mountain className="h-3.5 w-3.5 text-primary" /><span className="text-[10px] font-normal uppercase tracking-wider text-black">1. Identificación y Ubicación</span></div>
      
      <div className="px-4 py-2 border-b border-neutral-300 space-y-2">
        <div className="flex items-center justify-between relative">
          <label className={labelClass}>Lugar / Localidad</label>
          <div className="flex items-center gap-2 flex-1 justify-end">
            <input type="text" className="h-7 w-48 text-right border-none bg-neutral-50 px-2 text-[12px] font-code text-black" value={osmQuery} onChange={(e) => handleOSMSearch(e.target.value)} placeholder="Buscar localidad..." />
            {isSearchingOSM ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3 text-neutral-400" />}
            <button onClick={() => handleSimpleFieldSave("Lugar", "General", osmQuery)} className={cn("p-1", savedFields["Lugar"] ? "text-green-600" : "text-neutral-300")}><Check className="h-4 w-4" /></button>
          </div>
          {showOSMResults && (
            <div className="absolute top-full left-0 right-0 z-50 bg-white border shadow-xl mt-1"><ScrollArea className="h-40">{osmResults.map((res, i) => (<button key={i} onClick={() => { setOsmQuery(res.display_name); handleSimpleFieldSave("Lugar", "General", res.display_name); setShowOSMResults(false); }} className="w-full text-left p-2 hover:bg-neutral-50 text-[10px] uppercase">{res.display_name}</button>))}</ScrollArea></div>
          )}
        </div>
        <div className="flex items-center justify-between">
          <label className={labelClass}>Punto Específico (GPS)</label>
          <div className="flex items-center gap-2 flex-1 justify-end">
            <input type="text" className="h-7 w-48 text-right border-none bg-neutral-50 px-2 text-[12px] font-code text-black" value={formData["Punto_Muestreo"]?.value ?? ""} onChange={(e) => handleHeaderChange("Punto_Muestreo", e.target.value)} />
            <button onClick={captureGPS} className="p-1"><Locate className="h-4 w-4 text-primary" /></button>
            <button onClick={() => handleSimpleFieldSave("Punto_Muestreo", "General", formData["Punto_Muestreo"]?.value)} className={cn("p-1", savedFields["Punto_Muestreo"] ? "text-green-600" : "text-neutral-300")}><Check className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      <div className={sectionHeaderClass}><LayersIcon className="h-3.5 w-3.5 text-primary" /><span className="text-[10px] font-normal uppercase tracking-wider text-black">2. Perfil del Suelo (Horizontes)</span></div>
      
      <div className="overflow-x-auto relative">
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="bg-neutral-100 font-normal uppercase text-center border-b border-black h-12 text-black">
              <th className="border-r border-black p-1 w-14">Prof.<br/>(cm)</th>
              <th className="border-r border-black p-1 w-16">Gráfico</th>
              <th className="border-r border-black p-1 w-12">Horiz.</th>
              <th className="border-r border-black p-1 w-12">pH</th>
              <th className="border-r border-black p-1 w-24">Textura</th>
              <th className="border-r border-black p-1 w-24">Estructura</th>
              <th className="border-r border-black p-1 w-24">Consist.</th>
              <th className="p-1 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {capas.map((c) => (
              <tr key={c.id} className="border-b border-black hover:bg-neutral-50 group h-24">
                <td className="border-r border-black p-1 bg-white">
                  <input value={c.profundidadInicio} onBlur={() => handleSimpleFieldSave(`H${c.id}: profundidadInicio`, 'Horizontes', c.profundidadInicio)} onChange={(e) => setCapas(prev => prev.map(l => l.id === c.id ? {...l, profundidadInicio: e.target.value} : l))} className="w-full text-center border-none focus:ring-0 p-0 text-[10px] font-code text-black" />
                  <div className="h-[1px] bg-neutral-200 mx-1" />
                  <input value={c.profundidadFin} onBlur={() => handleSimpleFieldSave(`H${c.id}: profundidadFin`, 'Horizontes', c.profundidadFin)} onChange={(e) => setCapas(prev => prev.map(l => l.id === c.id ? {...l, profundidadFin: e.target.value} : l))} className="w-full text-center border-none focus:ring-0 p-0 text-[10px] font-code text-black" />
                </td>
                <td className="border-r border-black p-0 relative bg-white h-24">
                   <PatronSVG patron={c.patron} color={c.colorColumna} />
                   <div className="absolute inset-0 flex flex-col justify-between p-0.5 opacity-0 group-hover:opacity-100 bg-white/80 transition-opacity">
                      <select value={c.colorColumna} onChange={(e) => { setCapas(p => p.map(l => l.id === c.id ? {...l, colorColumna: e.target.value} : l)); handleSimpleFieldSave(`H${c.id}: colorColumna`, 'Horizontes', e.target.value); }} className="text-[8px] border-none p-0 bg-transparent uppercase text-black">
                        {coloresDisponibles.map(col => <option key={col.value} value={col.value}>{col.label}</option>)}
                      </select>
                      <select value={c.patron} onChange={(e) => { setCapas(p => p.map(l => l.id === c.id ? {...l, patron: e.target.value} : l)); handleSimpleFieldSave(`H${c.id}: patron`, 'Horizontes', e.target.value); }} className="text-[8px] border-none p-0 bg-transparent uppercase text-black">
                        {patronesDisponibles.map(pat => <option key={pat.value} value={pat.value}>{pat.label}</option>)}
                      </select>
                   </div>
                </td>
                <td className="border-r border-black p-1 bg-white relative">
                   <input value={c.denominacion} onBlur={() => handleSimpleFieldSave(`H${c.id}: denominacion`, 'Horizontes', c.denominacion)} onChange={(e) => setCapas(p => p.map(l => l.id === c.id ? {...l, denominacion: e.target.value.toUpperCase()} : l))} className="w-full text-center border-none uppercase font-bold text-primary focus:ring-0 p-0" placeholder="A1" />
                   {c.userEmails['denominacion'] && <TechnicianLink email={c.userEmails['denominacion']} className="text-[6px] absolute bottom-0.5 left-1 uppercase opacity-40" />}
                </td>
                <td className="border-r border-black p-0 bg-white">{renderMultidataCell(c.id, 'pH', 'upH')}</td>
                <td className="border-r border-black p-1 bg-white">
                  <Select value={c.textura} onValueChange={(v) => { setCapas(p => p.map(l => l.id === c.id ? {...l, textura: v} : l)); handleSimpleFieldSave(`H${c.id}: textura`, 'Horizontes', v); }}>
                    <SelectTrigger className="h-full border-none shadow-none text-[9px] uppercase text-black p-1"><SelectValue placeholder="Textura..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A" className="text-xs uppercase">Arenosa</SelectItem>
                      <SelectItem value="F" className="text-xs uppercase">Franca</SelectItem>
                      <SelectItem value="Ar" className="text-xs uppercase">Arcillosa</SelectItem>
                      <SelectItem value="FA" className="text-xs uppercase">Franco-Arenosa</SelectItem>
                      <SelectItem value="FAr" className="text-xs uppercase">Franco-Arcillosa</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="border-r border-black p-1 bg-white">
                  <Select value={c.estructura} onValueChange={(v) => { setCapas(p => p.map(l => l.id === c.id ? {...l, estructura: v} : l)); handleSimpleFieldSave(`H${c.id}: estructura`, 'Horizontes', v); }}>
                    <SelectTrigger className="h-full border-none shadow-none text-[9px] uppercase text-black p-1"><SelectValue placeholder="Estr..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="granular" className="text-xs uppercase">Granular</SelectItem>
                      <SelectItem value="prismatica" className="text-xs uppercase">Prismática</SelectItem>
                      <SelectItem value="bloques" className="text-xs uppercase">Bloques</SelectItem>
                      <SelectItem value="laminar" className="text-xs uppercase">Laminar</SelectItem>
                      <SelectItem value="sin_estructura" className="text-xs uppercase">Sin Estructura</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="border-r border-black p-1 bg-white">
                  <Select value={c.consistencia} onValueChange={(v) => { setCapas(p => p.map(l => l.id === c.id ? {...l, consistencia: v} : l)); handleSimpleFieldSave(`H${c.id}: consistencia`, 'Horizontes', v); }}>
                    <SelectTrigger className="h-full border-none shadow-none text-[9px] uppercase text-black p-1"><SelectValue placeholder="Cons..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="suelta" className="text-xs uppercase">Suelta</SelectItem>
                      <SelectItem value="firme" className="text-xs uppercase">Firme</SelectItem>
                      <SelectItem value="muy_firme" className="text-xs uppercase">Muy Firme</SelectItem>
                      <SelectItem value="plastica" className="text-xs uppercase">Plástica</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-1 text-center bg-white">
                   <button onClick={() => setCapas(prev => prev.filter(l => l.id !== c.id))} disabled={capas.length === 1} className="text-neutral-400 hover:text-red-600 transition-colors"><Trash2 className="h-3 w-3" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-3 border-b border-black">
        <Button variant="outline" size="sm" onClick={agregarCapa} className="w-full h-10 border-dashed border-neutral-400 font-normal uppercase text-[10px] tracking-widest text-black rounded-none">
          <Plus className="h-4 w-4 mr-2" />Agregar Horizonte
        </Button>
      </div>

      <div className={sectionHeaderClass}><Droplets className="h-3.5 w-3.5 text-primary" /><span className="text-[10px] font-normal uppercase tracking-wider text-black">3. Registro Fotográfico</span></div>
      <div className="px-4 py-6 bg-neutral-50"><PhotoRegistry reportId={reportId} formId={formId} stationId={stationId} medium="suelo" /></div>

      <div className="bg-white p-4 border-t border-black">
        <button onClick={onClose} className="w-full bg-black hover:bg-neutral-900 py-4 text-[11px] uppercase tracking-widest text-white shadow-xl transition-all active:scale-[0.98]">Finalizar y Cerrar PE-001</button>
      </div>
    </div>
  );
}
