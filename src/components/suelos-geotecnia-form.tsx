"use client"

import { useState, useMemo, useEffect } from "react"
import { collection, query, where, setDoc, serverTimestamp, doc, updateDoc, arrayUnion, getDocs, Timestamp, deleteDoc } from 'firebase/firestore'
import { useFirestore, useUser, useDoc } from '@/firebase'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from '@/hooks/use-toast'
import { Plus, Trash2, Printer, Check, Loader2, Clock, User, Locate, MapPin, CheckCircle2, Calendar, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from '@/lib/utils'
import { PhotoRegistry } from './photo-registry'
import { TechnicianLink } from './technician-link'
import { getCurrentGPSLocation } from '@/lib/geo-utils'

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

interface CapaSuelo {
  id: string
  profundidadInicio: string
  profundidadFin: string
  nivelFreatico: boolean
  colorColumna: string
  patron: string
  descripcion: string
  clasificacionUSCS: string
  multidata: Record<string, AnalyteState>
  userEmails: Record<string, string>
}

const patronesDisponibles = [
  { value: "none", label: "Sin patrón" },
  { value: "dots", label: "Puntos (arena)" },
  { value: "diagonal", label: "Diagonal (arcilla)" },
  { value: "horizontal", label: "Horizontal (limo)" },
  { value: "cross-hatch", label: "Cruzado (grava)" },
]

const coloresDisponibles = [
  { value: "#FFFFFF", label: "Blanco" },
  { value: "#223322", label: "Verde Oscuro (S. Vegetal)" },
  { value: "#9EB0AF", label: "Gley 1 (Claro)" },
  { value: "#748A89", label: "Gley 2 (Medio)" },
  { value: "#4D5E5D", label: "Gley 3 (Oscuro)" },
  { value: "#D1D1D1", label: "Gris Claro" },
  { value: "#8C8C8C", label: "Gris Medio" },
  { value: "#4F4F4F", label: "Gris Oscuro" },
  { value: "#F5F5DC", label: "Beige" },
  { value: "#D2B48C", label: "Marrón Claro" },
  { value: "#8B4513", label: "Marrón Oscuro" },
]

function PatronSVG({ patron, color }: { patron: string; color: string }) {
  const patternId = `pattern-${patron}-${color.replace("#", "")}`
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
  )
}

interface Props {
  reportId: string;
  formId: string;
  stationId: string;
  onClose?: () => void;
}

export function SuelosGeotecniaFormIntegrated({ reportId, formId, stationId, onClose }: Props) {
  const { toast } = useToast();
  const db = useFirestore();
  const { user } = useUser();
  
  const [formData, setFormData] = useState<Record<string, { value: any; userEmail?: string }>>({
    sondeoNumero: { value: "" },
    ubicacion: { value: "" },
    profundidadTotal: { value: "" },
    observaciones: { value: "" }
  });

  const [capas, setCapas] = useState<CapaSuelo[]>([]);
  const [savedFields, setSavedFields] = useState<Record<string, boolean>>({});
  const [isLoadingExisting, setIsLoadingExisting] = useState(true);
  const [metadata, setMetadata] = useState<{ timestamp?: any }>({});
  const [isDeferred, setIsDeferred] = useState(false);
  const [manualDate, setManualDate] = useState<string>(new Date().toISOString().slice(0, 16));

  const NUMERIC_FIELDS = [
    'golpesSPT', 'limiteLL', 'limiteIP', 'expansionLibre', 'humedadNatural', 
    'pasanteTamiz200', 'densidad', 'cohesion', 'anguloFriccion'
  ];

  useEffect(() => {
    const fetchExistingData = async () => {
      if (!reportId || !formId || !db) return;
      setIsLoadingExisting(true);
      try {
        const q = query(collection(db, 'samples'), where('reportId', '==', reportId), where('formId', '==', formId));
        const snapshot = await getDocs(q);
        
        const newFormData: Record<string, any> = {};
        const newSavedFields: Record<string, boolean> = {};
        const layersMap: Record<string, Partial<CapaSuelo>> = {};
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

          const layerMatch = analyte.match(/^L(\d+): (.*)/);
          if (layerMatch) {
            const lId = layerMatch[1];
            const fieldName = layerMatch[2];
            if (!layersMap[lId]) layersMap[lId] = { id: lId, multidata: {}, userEmails: {} };
            
            if (NUMERIC_FIELDS.includes(fieldName)) {
              if (!layersMap[lId]!.multidata![fieldName]) layersMap[lId]!.multidata![fieldName] = { readings: [], isExpanded: false, userEmail: data.userEmail };
              layersMap[lId]!.multidata![fieldName].readings.push({
                id: docSnap.id, value, capturedAt: data.capturedAt?.toMillis() || Date.now(), isSaved: true, isSaving: false
              });
            } else if (fieldName === 'nivelFreatico') {
              layersMap[lId][fieldName] = value === 'true';
              layersMap[lId]!.userEmails![fieldName] = data.userEmail;
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
          nivelFreatico: l.nivelFreatico || false,
          colorColumna: l.colorColumna || "#F5F5DC",
          patron: l.patron || "none",
          descripcion: l.descripcion || "",
          clasificacionUSCS: l.clasificacionUSCS || "",
          multidata: l.multidata || {},
          userEmails: l.userEmails || {}
        } as CapaSuelo)).sort((a, b) => parseInt(a.id) - parseInt(b.id));

        if (initialCapas.length === 0) initialCapas.push(createEmptyLayer(Date.now().toString(), "0.00"));

        setFormData(prev => ({ ...prev, ...newFormData }));
        setCapas(initialCapas);
        setSavedFields(newSavedFields);
        setMetadata(foundMetadata);
        setIsDeferred(foundDeferred);
      } catch (e) { console.error(e); } finally { setIsLoadingExisting(false); }
    };
    fetchExistingData();
  }, [db, reportId, formId, user?.email]);

  const createEmptyLayer = (id: string, start: string): CapaSuelo => ({
    id, profundidadInicio: start, profundidadFin: "", nivelFreatico: false, colorColumna: "#F5F5DC", patron: "none", descripcion: "", clasificacionUSCS: "", multidata: {}, userEmails: {}
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
      const analyte = `L${layerId}: ${field}`;
      const docId = readingId.startsWith('temp_') ? `${reportId}_${formId}_${analyte.replace(/[: ]/g, '_')}_${reading.capturedAt}` : readingId;
      const payload = {
        medium: 'suelo', parameterType: 'Estratigrafía', analyte, reportId, formId, stationId, value: reading.value,
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

  const handleSimpleFieldSave = (analyte: string, category: string, value: any) => {
    if (!user || !db || value === "") return;
    setSavedFields(prev => ({ ...prev, [analyte]: true }));
    
    const layerMatch = analyte.match(/^L(\d+): (.*)/);
    if (layerMatch) {
      const lId = layerMatch[1];
      const field = layerMatch[2];
      setCapas(prev => prev.map(c => c.id === lId ? { ...c, userEmails: { ...c.userEmails, [field]: user.email! } } : c));
    } else {
      setFormData(prev => ({ ...prev, [analyte]: { ...prev[analyte], userEmail: user.email! } }));
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

  const captureGPS = async () => {
    toast({ title: "Obteniendo coordenadas...", description: "Forzando alta precisión GPS." });
    const location = await getCurrentGPSLocation();
    if (location) {
      const val = `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`;
      handleHeaderChange("ubicacion", val);
      handleSimpleFieldSave("ubicacion", "Encabezado", val);
      toast({ title: "Ubicación capturada", description: val });
    } else {
      toast({ variant: "destructive", title: "Falla de GPS", description: "No se pudo obtener la ubicación física." });
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

  const agregarCapa = () => {
    const last = capas[capas.length - 1];
    setCapas(prev => [...prev, createEmptyLayer(Date.now().toString(), last?.profundidadFin || "0.00")]);
  };

  if (isLoadingExisting) return <div className="p-12 text-center text-xs animate-pulse font-normal uppercase text-black">Cargando Registro Geotécnico...</div>;

  return (
    <div className="mx-auto w-full border border-black bg-white font-body shadow-sm rounded-none overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300 pb-20">
      <div className="border-b-2 border-black bg-neutral-100 px-4 py-4 flex justify-between items-center print:hidden">
        <div>
          <h1 className="text-sm font-normal uppercase tracking-tight text-black font-headline">Mecánica de suelos • MS-001</h1>
          <div className="flex flex-col gap-0.5 mt-2">
            <p className="text-[10px] text-neutral-600 font-normal uppercase leading-tight">Planilla ID: {formId}</p>
            <div className="flex flex-wrap items-center gap-3 text-[9px] text-black font-normal uppercase mt-1">
              {isDeferred ? (
                <div className="flex items-center gap-1.5 bg-white border border-black px-2 py-0.5 rounded-sm">
                  <Calendar className="h-3 w-3 text-red-600" />
                  <input type="datetime-local" value={manualDate} onChange={(e) => setManualDate(e.target.value)} className="bg-transparent border-none p-0 text-[9px] font-black outline-none w-32" />
                </div>
              ) : <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5 text-primary" /> {new Date().toLocaleString()}</span>}
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()} className="h-8 text-[10px] uppercase rounded-none border-black shrink-0"><Printer className="h-3 w-3 mr-1.5" />Imprimir</Button>
      </div>

      <div className="p-0 border-b border-black">
        {[
          { id: "sondeoNumero", label: "Sondeo Nº", cat: "Encabezado" },
          { id: "ubicacion", label: "Ubicación", cat: "Encabezado", gps: true },
          { id: "profundidadTotal", label: "Profundidad (m)", cat: "Encabezado" }
        ].map(f => (
          <div key={f.id} className="flex items-center justify-between py-2 px-4 border-b border-neutral-100 group">
            <div className="flex flex-col">
              <label className="text-[11px] font-normal uppercase text-black">{f.label}</label>
              {savedFields[f.id] && formData[f.id]?.userEmail && (
                <div className="flex items-center gap-1 mt-0.5">
                  <User className="h-2 w-2 text-neutral-300" />
                  <TechnicianLink email={formData[f.id].userEmail!} className="text-[8px] uppercase text-neutral-400 font-normal" />
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input 
                className="h-7 w-32 text-right border-none bg-neutral-50 px-2 text-[12px] font-code text-black focus:ring-0 outline-none"
                value={formData[f.id].value} onChange={(e) => handleHeaderChange(f.id, e.target.value)}
              />
              {f.gps && <button onClick={captureGPS} className="p-1"><Locate className="h-4 w-4 text-primary" /></button>}
              <button onClick={() => handleSimpleFieldSave(f.id, f.cat, formData[f.id].value)} className={cn("p-1", savedFields[f.id] ? "text-green-600" : "text-neutral-300")}><Check className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto relative">
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="bg-neutral-100 font-normal uppercase text-center border-b border-black h-14 text-black">
              <th className="border-r border-black p-1 w-14 leading-tight">Prof.<br/>(m)</th>
              <th className="border-r border-black p-1 w-8 leading-tight">N.F.</th>
              <th className="border-r border-black p-1 w-14 leading-tight">Gráfico</th>
              <th className="border-r border-black p-1 min-w-[140px] leading-tight">Descripción</th>
              <th className="border-r border-black p-1 w-12 leading-tight">SPT</th>
              <th className="border-r border-black p-1 w-10 leading-tight">LL</th>
              <th className="border-r border-black p-1 w-10 leading-tight">IP</th>
              <th className="border-r border-black p-1 w-10 leading-tight">FST<br/>(%)</th>
              <th className="border-r border-black p-1 w-10 leading-tight">W<br/>(%)</th>
              <th className="border-r border-black p-1 w-10 leading-tight">T200</th>
              <th className="border-r border-black p-1 w-12 leading-tight">δH/S</th>
              <th className="border-r border-black p-1 w-12 leading-tight">Cu</th>
              <th className="border-r border-black p-1 w-10 leading-tight">∅u</th>
              <th className="border-r border-black p-1 w-12 leading-tight">USCS</th>
              <th className="p-1 w-8 print:hidden"></th>
            </tr>
          </thead>
          <tbody>
            {capas.map((c) => (
              <tr key={c.id} className="border-b border-black hover:bg-neutral-50 group h-24">
                <td className="border-r border-black p-1 bg-white">
                  <input value={c.profundidadInicio} onBlur={() => handleSimpleFieldSave(`L${c.id}: profundidadInicio`, 'Estratigrafía', c.profundidadInicio)} onChange={(e) => setCapas(prev => prev.map(l => l.id === c.id ? {...l, profundidadInicio: e.target.value} : l))} className="w-full text-center border-none focus:ring-0 p-0 text-[10px] font-code" />
                  <div className="h-[1px] bg-neutral-200 mx-1" />
                  <input value={c.profundidadFin} onBlur={() => handleSimpleFieldSave(`L${c.id}: profundidadFin`, 'Estratigrafía', c.profundidadFin)} onChange={(e) => setCapas(prev => prev.map(l => l.id === c.id ? {...l, profundidadFin: e.target.value} : l))} className="w-full text-center border-none focus:ring-0 p-0 text-[10px] font-code" />
                </td>
                <td className="border-r border-black p-1 text-center bg-white relative">
                   <div className="flex flex-col items-center">
                    <input type="checkbox" checked={c.nivelFreatico} onChange={(e) => { setCapas(prev => prev.map(l => l.id === c.id ? {...l, nivelFreatico: e.target.checked} : l)); handleSimpleFieldSave(`L${c.id}: nivelFreatico`, 'Estratigrafía', e.target.checked); }} className="w-4 h-4" />
                    {c.userEmails['nivelFreatico'] && (
                      <TechnicianLink email={c.userEmails['nivelFreatico']} className="text-[6px] absolute bottom-1 uppercase opacity-40" />
                    )}
                   </div>
                </td>
                <td className="border-r border-black p-0 relative bg-white h-24">
                   <PatronSVG patron={c.patron} color={c.colorColumna} />
                   <div className="absolute inset-0 flex flex-col justify-between p-0.5 opacity-0 group-hover:opacity-100 bg-white/80 transition-opacity">
                      <select value={c.colorColumna} onChange={(e) => { setCapas(p => p.map(l => l.id === c.id ? {...l, colorColumna: e.target.value} : l)); handleSimpleFieldSave(`L${c.id}: colorColumna`, 'Estratigrafía', e.target.value); }} className="text-[8px] border-none p-0 bg-transparent uppercase">
                        {coloresDisponibles.map(col => <option key={col.value} value={col.value}>{col.label}</option>)}
                      </select>
                      <select value={c.patron} onChange={(e) => { setCapas(p => p.map(l => l.id === c.id ? {...l, patron: e.target.value} : l)); handleSimpleFieldSave(`L${c.id}: patron`, 'Estratigrafía', e.target.value); }} className="text-[8px] border-none p-0 bg-transparent uppercase">
                        {patronesDisponibles.map(pat => <option key={pat.value} value={pat.value}>{pat.label}</option>)}
                      </select>
                   </div>
                </td>
                <td className="border-r border-black p-1 bg-white relative">
                   <textarea value={c.descripcion} onBlur={() => handleSimpleFieldSave(`L${c.id}: descripcion`, 'Estratigrafía', c.descripcion)} onChange={(e) => setCapas(p => p.map(l => l.id === c.id ? {...l, descripcion: e.target.value, userEmails: { ...l.userEmails, descripcion: '' }} : l))} className="w-full h-20 text-[9px] border-none resize-none focus:ring-0 p-0 leading-tight" />
                   {c.userEmails['descripcion'] && (
                      <TechnicianLink email={c.userEmails['descripcion']} className="text-[7px] absolute bottom-0.5 left-1 uppercase opacity-30" />
                   )}
                </td>
                <td className="border-r border-black p-0 bg-white">{renderMultidataCell(c.id, 'golpesSPT')}</td>
                <td className="border-r border-black p-0 bg-white">{renderMultidataCell(c.id, 'limiteLL')}</td>
                <td className="border-r border-black p-0 bg-white">{renderMultidataCell(c.id, 'limiteIP')}</td>
                <td className="border-r border-black p-0 bg-white">{renderMultidataCell(c.id, 'expansionLibre', '%')}</td>
                <td className="border-r border-black p-0 bg-white">{renderMultidataCell(c.id, 'humedadNatural', '%')}</td>
                <td className="border-r border-black p-0 bg-white">{renderMultidataCell(c.id, 'pasanteTamiz200')}</td>
                <td className="border-r border-black p-0 bg-white">{renderMultidataCell(c.id, 'densidad', 'gr/cm3')}</td>
                <td className="border-r border-black p-0 bg-white">{renderMultidataCell(c.id, 'cohesion', 'kg/cm2')}</td>
                <td className="border-r border-black p-0 bg-white">{renderMultidataCell(c.id, 'anguloFriccion', '°')}</td>
                <td className="border-r border-black p-1 bg-white relative">
                   <input value={c.clasificacionUSCS} onBlur={() => handleSimpleFieldSave(`L${c.id}: clasificacionUSCS`, 'Estratigrafía', c.clasificacionUSCS)} onChange={(e) => setCapas(p => p.map(l => l.id === c.id ? {...l, clasificacionUSCS: e.target.value.toUpperCase(), userEmails: { ...l.userEmails, clasificacionUSCS: '' }} : l))} className="w-full text-center border-none uppercase font-bold text-primary focus:ring-0 p-0" placeholder="ML" />
                   {c.userEmails['clasificacionUSCS'] && (
                      <TechnicianLink email={c.userEmails['clasificacionUSCS']} className="text-[7px] absolute bottom-0.5 right-1 uppercase opacity-30" />
                   )}
                </td>
                <td className="p-1 text-center print:hidden bg-white">
                   <button onClick={() => setCapas(prev => prev.filter(l => l.id !== c.id))} disabled={capas.length === 1} className="text-neutral-400 hover:text-red-600 transition-colors"><Trash2 className="h-3 w-3" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-3 border-b border-black print:hidden">
        <Button variant="outline" size="sm" onClick={agregarCapa} className="w-full h-10 border-dashed border-neutral-400 font-normal uppercase text-[10px] tracking-widest text-black rounded-none">
          <Plus className="h-4 w-4 mr-2" />Agregar Estrato
        </Button>
      </div>

      <div className="p-4 bg-neutral-50 print:hidden">
        <PhotoRegistry reportId={reportId} formId={formId} stationId={stationId} medium="suelo" />
      </div>

      <div className="p-4 border-t border-black bg-white print:hidden">
        <Button onClick={() => { handleSimpleFieldSave("Fecha_Cierre", "Control", new Date().toLocaleString()); onClose?.(); }} className="w-full h-12 bg-black hover:bg-neutral-900 text-white uppercase tracking-widest text-[11px] shadow-xl rounded-none">Finalizar y Cerrar Sondeo</Button>
      </div>
    </div>
  );
}
