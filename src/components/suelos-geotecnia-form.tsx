"use client"

import { useState, useMemo, useEffect } from "react"
import { collection, query, where, addDoc, serverTimestamp, doc, updateDoc, arrayUnion, getDocs } from 'firebase/firestore'
import { useFirestore, useUser, useDoc } from '@/firebase'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from '@/hooks/use-toast'
import { Plus, Trash2, Printer, Save, Loader2, Check, Clock, User, Locate, MapPin } from "lucide-react"
import { cn } from '@/lib/utils'
import { PhotoRegistry } from './photo-registry'
import { TechnicianLink } from './technician-link'

interface CapaSuelo {
  id: string
  profundidadInicio: string
  profundidadFin: string
  longitudTramo: string
  nivelFreatico: boolean
  colorColumna: string
  patron: string
  descripcion: string
  muestras: string
  golpesSPT: string
  limiteLL: string
  limiteIP: string
  humedad: string
  clasificacionUSCS: string
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
  { value: "#F5F5DC", label: "Beige claro" },
  { value: "#D2B48C", label: "Marrón claro" },
  { value: "#A0522D", label: "Marrón" },
  { value: "#8B4513", label: "Marrón oscuro" },
  { value: "#696969", label: "Gris" },
  { value: "#A9A9A9", label: "Gris claro" },
  { value: "#E6D5AC", label: "Arena" },
  { value: "#C4A77D", label: "Limo" },
  { value: "#8B7355", label: "Arcilla" },
  { value: "#4169E1", label: "Azulado" },
]

function PatronSVG({ patron, color }: { patron: string; color: string }) {
  const patternId = `pattern-${patron}-${color.replace("#", "")}`
  
  return (
    <svg width="100%" height="100%" className="absolute inset-0">
      <defs>
        {patron === "dots" && (
          <pattern id={patternId} patternUnits="userSpaceOnUse" width="8" height="8">
            <rect width="8" height="8" fill={color} />
            <circle cx="4" cy="4" r="1.5" fill="#333" />
          </pattern>
        )}
        {patron === "diagonal" && (
          <pattern id={patternId} patternUnits="userSpaceOnUse" width="8" height="8">
            <rect width="8" height="8" fill={color} />
            <path d="M-2,2 l4,-4 M0,8 l8,-8 M6,10 l4,-4" stroke="#333" strokeWidth="1" />
          </pattern>
        )}
        {patron === "horizontal" && (
          <pattern id={patternId} patternUnits="userSpaceOnUse" width="8" height="4">
            <rect width="8" height="4" fill={color} />
            <line x1="0" y1="2" x2="8" y2="2" stroke="#333" strokeWidth="0.5" />
          </pattern>
        )}
        {patron === "cross-hatch" && (
          <pattern id={patternId} patternUnits="userSpaceOnUse" width="8" height="8">
            <rect width="8" height="8" fill={color} />
            <path d="M0,0 l8,8 M8,0 l-8,8" stroke="#333" strokeWidth="0.5" />
          </pattern>
        )}
      </defs>
      {patron !== "none" ? (
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      ) : (
        <rect width="100%" height="100%" fill={color} />
      )}
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
  
  const [formData, setFormData] = useState<Record<string, any>>({
    sondeoNumero: "",
    ubicacion: "",
    profundidadTotal: "",
    observaciones: ""
  });

  const [capas, setCapas] = useState<CapaSuelo[]>([]);
  const [savingFields, setSavingFields] = useState<Record<string, boolean>>({});
  const [savedFields, setSavedFields] = useState<Record<string, boolean>>({});
  const [isLoadingExisting, setIsLoadingExisting] = useState(true);
  const [metadata, setMetadata] = useState<{ user?: string, timestamp?: any }>({});

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
        
        const newFormData: Record<string, any> = {};
        const newSavedFields: Record<string, boolean> = {};
        const layersMap: Record<string, Partial<CapaSuelo>> = {};
        let foundMetadata = { user: user?.email || '', timestamp: null };

        snapshot.docs.forEach(doc => {
          const data = doc.data();
          const analyte = data.analyte;
          const value = data.value;

          if (!foundMetadata.timestamp || (data.timestamp && data.timestamp.toMillis() < foundMetadata.timestamp.toMillis())) {
            foundMetadata = { user: data.userEmail || user?.email || '', timestamp: data.timestamp };
          }

          const layerMatch = analyte.match(/^L(\d+): (.*)/);
          if (layerMatch) {
            const lId = layerMatch[1];
            const field = layerMatch[2] as keyof CapaSuelo;
            if (!layersMap[lId]) layersMap[lId] = { id: lId };
            
            if (field === 'nivelFreatico') {
              layersMap[lId][field] = value === 'true';
            } else {
              (layersMap[lId] as any)[field] = value;
            }
            newSavedFields[analyte] = true;
          } else {
            newFormData[analyte] = value;
            newSavedFields[analyte] = true;
          }
        });

        const initialCapas = Object.values(layersMap).map(l => ({
          id: l.id!,
          profundidadInicio: l.profundidadInicio || "",
          profundidadFin: l.profundidadFin || "",
          longitudTramo: l.longitudTramo || "",
          nivelFreatico: l.nivelFreatico || false,
          colorColumna: l.colorColumna || "#F5F5DC",
          patron: l.patron || "none",
          descripcion: l.descripcion || "",
          muestras: l.muestras || "",
          golpesSPT: l.golpesSPT || "",
          limiteLL: l.limiteLL || "",
          limiteIP: l.limiteIP || "",
          humedad: l.humedad || "",
          clasificacionUSCS: l.clasificacionUSCS || ""
        } as CapaSuelo)).sort((a, b) => parseInt(a.id) - parseInt(b.id));

        if (initialCapas.length === 0) {
          initialCapas.push({
            id: Date.now().toString(),
            profundidadInicio: "0.00",
            profundidadFin: "",
            longitudTramo: "",
            nivelFreatico: false,
            colorColumna: "#F5F5DC",
            patron: "none",
            descripcion: "",
            muestras: "",
            golpesSPT: "",
            limiteLL: "",
            limiteIP: "",
            humedad: "",
            clasificacionUSCS: ""
          });
        }

        setFormData(prev => ({ ...prev, ...newFormData }));
        setCapas(initialCapas);
        setSavedFields(newSavedFields);
        setMetadata(foundMetadata);
      } catch (e) {
        console.error("Error fetching geotech data", e);
      } finally {
        setIsLoadingExisting(false);
      }
    };

    fetchExistingData();
  }, [db, reportId, formId, user?.email]);

  const saveParam = async (name: string, category: string, valueOverride?: any) => {
    if (!user || !db) return;
    const value = valueOverride !== undefined ? valueOverride : formData[name];
    if (value === null || value === undefined || value === "") return;

    setSavingFields(prev => ({ ...prev, [name]: true }));
    
    try {
      const q = query(
        collection(db, 'samples'),
        where('reportId', '==', reportId),
        where('formId', '==', formId),
        where('analyte', '==', name)
      );
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        await updateDoc(doc(db, 'samples', snapshot.docs[0].id), {
          value: `${value}`,
          timestamp: serverTimestamp(),
          userId: user.uid,
          userEmail: user.email
        });
      } else {
        await addDoc(collection(db, 'samples'), {
          medium: 'suelo',
          parameterType: category,
          analyte: name,
          value: `${value}`,
          reportId,
          formId,
          stationId,
          userId: user.uid,
          userEmail: user.email,
          timestamp: serverTimestamp(),
        });
      }

      await updateDoc(doc(db, 'reports', reportId), { editors: arrayUnion(user.email) });
      setSavedFields(prev => ({ ...prev, [name]: true }));
      toast({ title: "Guardado", description: `${name} actualizado.` });
    } catch (error: any) {
      console.error(error);
    } finally {
      setSavingFields(prev => ({ ...prev, [name]: false }));
    }
  };

  const handleCerrarPlanilla = async () => {
    if (!user || !db) return;
    const fechaCierre = new Date().toLocaleString('es-AR');
    await saveParam("Fecha Cierre de Sondeo", "Control", fechaCierre);
    onClose?.();
  };

  const handleFormChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (savedFields[field]) {
      setSavedFields(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const captureGPS = () => {
    if (!navigator.geolocation) {
      toast({ variant: "destructive", title: "GPS no disponible", description: "Tu navegador no soporta geolocalización." });
      return;
    }

    toast({ title: "Obteniendo coordenadas...", description: "Por favor, espera." });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const val = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;
        handleFormChange("ubicacion", val);
        saveParam("ubicacion", "Encabezado", val);
        toast({ title: "Ubicación capturada", description: val });
      },
      (err) => {
        toast({ variant: "destructive", title: "Error de GPS", description: "No se pudo obtener la ubicación." });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const saveLayerField = async (layerId: string, field: keyof CapaSuelo, value: any) => {
    if (!user || !db) return;
    const analyteName = `L${layerId}: ${field}`;
    
    setSavingFields(prev => ({ ...prev, [analyteName]: true }));
    
    try {
      const q = query(
        collection(db, 'samples'),
        where('reportId', '==', reportId),
        where('formId', '==', formId),
        where('analyte', '==', analyteName)
      );
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        await updateDoc(doc(db, 'samples', snapshot.docs[0].id), {
          value: `${value}`,
          timestamp: serverTimestamp(),
          userId: user.uid,
          userEmail: user.email
        });
      } else {
        await addDoc(collection(db, 'samples'), {
          medium: 'suelo',
          parameterType: 'Estratigrafía',
          analyte: analyteName,
          value: `${value}`,
          reportId,
          formId,
          stationId,
          userId: user.uid,
          userEmail: user.email,
          timestamp: serverTimestamp(),
        });
      }

      setSavedFields(prev => ({ ...prev, [analyteName]: true }));
    } catch (error: any) {
      console.error(error);
    } finally {
      setSavingFields(prev => ({ ...prev, [analyteName]: false }));
    }
  };

  const handleCapaChange = (id: string, field: keyof CapaSuelo, value: string | boolean) => {
    setCapas((prev) =>
      prev.map((capa) => (capa.id === id ? { ...capa, [field]: value } : capa))
    );
    const analyteName = `L${id}: ${field}`;
    if (savedFields[analyteName]) {
      setSavedFields(prev => {
        const next = { ...prev };
        delete next[analyteName];
        return next;
      });
    }
  };

  const agregarCapa = () => {
    const ultimaCapa = capas[capas.length - 1];
    const nuevaProfundidadInicio = ultimaCapa ? ultimaCapa.profundidadFin : "0.00";
    
    setCapas((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        profundidadInicio: nuevaProfundidadInicio,
        profundidadFin: "",
        longitudTramo: "",
        nivelFreatico: false,
        colorColumna: "#F5F5DC",
        patron: "none",
        descripcion: "",
        muestras: "",
        golpesSPT: "",
        limiteLL: "",
        limiteIP: "",
        humedad: "",
        clasificacionUSCS: "",
      },
    ]);
  };

  const eliminarCapa = async (id: string) => {
    if (capas.length > 1) {
      setCapas((prev) => prev.filter((capa) => capa.id !== id));
    }
  };

  const formatTimestamp = (ts: any) => {
    if (!ts) return new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoadingExisting) {
    return <div className="p-12 text-center text-xs animate-pulse font-bold uppercase">Cargando Registro de Sondeo...</div>;
  }

  const rowClass = "flex items-center justify-between py-2.5 border-b border-neutral-300 hover:bg-neutral-50 transition-colors group px-3";
  const labelClass = "text-[11px] font-black text-black tracking-tight font-headline leading-none w-1/3 shrink-0 uppercase";
  const inputClass = "h-7 flex-1 border-none bg-transparent px-2 text-[12px] font-code text-black font-bold text-right rounded-none focus:ring-0 outline-none placeholder:text-neutral-300";

  return (
    <div className="mx-auto w-full border border-black bg-white font-body shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300 pb-20 overflow-hidden">
      {/* Header técnico DPH */}
      <div className="border-b-2 border-black bg-neutral-100 px-4 py-3 flex justify-between items-center print:hidden">
        <div>
          <h1 className="text-sm font-black uppercase tracking-tight text-black font-headline">Geotecnia • GT-001</h1>
          <div className="flex flex-col gap-0.5 mt-1">
            <p className="text-[10px] text-neutral-600 font-bold uppercase leading-none tracking-tight">ID Planilla: {formId}</p>
            <div className="flex items-center gap-3 text-[9px] text-black font-black uppercase tracking-tighter mt-1">
              <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5 text-primary" /> {formatTimestamp(metadata.timestamp)}</span>
              <span className="flex items-center gap-1"><User className="h-2.5 w-2.5 text-primary" /> <TechnicianLink email={metadata.user || user?.email || null} /></span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()} className="h-8 text-[10px] font-black uppercase rounded-none border-black"><Printer className="h-3 w-3 mr-1.5" />Imprimir</Button>
        </div>
      </div>

      <div className="p-0 border-b border-black">
        {/* Sondeo Nro */}
        <div className={rowClass}>
          <label className={labelClass}>Sondeo Nº</label>
          <div className="flex items-center gap-2 flex-1 justify-end">
            <Input
              value={formData.sondeoNumero}
              onChange={(e) => handleFormChange("sondeoNumero", e.target.value)}
              className={inputClass}
              placeholder="Ej: S-01"
            />
            <button onClick={() => saveParam("sondeoNumero", 'Encabezado')} className={cn("p-1 transition-colors", savedFields["sondeoNumero"] ? "text-green-600" : "text-black hover:text-primary")}>
              {savingFields["sondeoNumero"] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : savedFields["sondeoNumero"] ? <div className="rounded-full bg-green-100 p-0.5"><Check className="h-2.5 w-2.5 text-green-600" /></div> : <Save className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* Ubicación con GPS */}
        <div className={rowClass}>
          <label className={labelClass}>Ubicación</label>
          <div className="flex items-center gap-2 flex-1 justify-end">
            <Input
              value={formData.ubicacion}
              onChange={(e) => handleFormChange("ubicacion", e.target.value)}
              className={inputClass}
              placeholder="Coordenadas o Ref."
            />
            <button onClick={captureGPS} title="Capturar GPS" className="p-1 hover:bg-primary/5 rounded transition-colors">
              <Locate className="h-4 w-4 text-primary" />
            </button>
            <button onClick={() => saveParam("ubicacion", "Encabezado")} className={cn("p-1 transition-colors", savedFields["ubicacion"] ? "text-green-600" : "text-black hover:text-primary")}>
              {savingFields["ubicacion"] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : savedFields["ubicacion"] ? <div className="rounded-full bg-green-100 p-0.5"><Check className="h-2.5 w-2.5 text-green-600" /></div> : <Save className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* Profundidad Total */}
        <div className={rowClass}>
          <label className={labelClass}>Profundidad (m)</label>
          <div className="flex items-center gap-2 flex-1 justify-end">
            <Input
              value={formData.profundidadTotal}
              onChange={(e) => handleFormChange("profundidadTotal", e.target.value)}
              className={inputClass}
              placeholder="Total perforado"
            />
            <button onClick={() => saveParam("profundidadTotal", 'Encabezado')} className={cn("p-1 transition-colors", savedFields["profundidadTotal"] ? "text-green-600" : "text-black hover:text-primary")}>
              {savingFields["profundidadTotal"] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : savedFields["profundidadTotal"] ? <div className="rounded-full bg-green-100 p-0.5"><Check className="h-2.5 w-2.5 text-green-600" /></div> : <Save className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Tabla de Estratos */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="bg-neutral-100 font-black uppercase text-center border-b border-black h-12">
              <th className="border-r border-black p-1 w-14">Prof. (m)</th>
              <th className="border-r border-black p-1 w-10">N.F.</th>
              <th className="border-r border-black p-1 w-16">Columna</th>
              <th className="border-r border-black p-1 min-w-[150px]">Descripción</th>
              <th className="border-r border-black p-1 w-14">SPT</th>
              <th className="border-r border-black p-1 w-20" colSpan={2}>Lím. Atterberg</th>
              <th className="border-r border-black p-1 w-10">Hum (%)</th>
              <th className="border-r border-black p-1 w-14">USCS</th>
              <th className="p-1 w-8 print:hidden"></th>
            </tr>
            <tr className="bg-neutral-50 text-[8px] font-black border-b border-black text-center">
              <th colSpan={5}></th>
              <th className="border-x border-black">LL</th>
              <th className="border-r border-black">IP</th>
              <th colSpan={3}></th>
            </tr>
          </thead>
          <tbody>
            {capas.map((capa) => (
              <tr key={capa.id} className="border-b border-black hover:bg-neutral-50 group">
                <td className="border-r border-black p-1 bg-white">
                  <div className="flex flex-col gap-0.5">
                    <input value={capa.profundidadInicio} onChange={(e) => handleCapaChange(capa.id, "profundidadInicio", e.target.value)} onBlur={() => saveLayerField(capa.id, "profundidadInicio", capa.profundidadInicio)} className="w-full text-center font-bold border-none outline-none focus:ring-0 p-0" />
                    <div className="h-[1px] bg-neutral-200 mx-1" />
                    <input value={capa.profundidadFin} onChange={(e) => handleCapaChange(capa.id, "profundidadFin", e.target.value)} onBlur={() => saveLayerField(capa.id, "profundidadFin", capa.profundidadFin)} className="w-full text-center font-bold border-none outline-none focus:ring-0 p-0" />
                  </div>
                </td>
                <td className="border-r border-black p-1 text-center bg-white">
                  <input type="checkbox" checked={capa.nivelFreatico} onChange={(e) => { handleCapaChange(capa.id, "nivelFreatico", e.target.checked); saveLayerField(capa.id, "nivelFreatico", e.target.checked); }} className="w-4 h-4 rounded-none" />
                </td>
                <td className="border-r border-black p-0 relative bg-white h-20">
                   <PatronSVG patron={capa.patron} color={capa.colorColumna} />
                   <div className="absolute inset-0 flex flex-col justify-between p-0.5 opacity-0 group-hover:opacity-100 bg-white/80 transition-opacity">
                      <select value={capa.colorColumna} onChange={(e) => { handleCapaChange(capa.id, "colorColumna", e.target.value); saveLayerField(capa.id, "colorColumna", e.target.value); }} className="text-[8px] border-none p-0 bg-transparent uppercase font-bold">
                        {coloresDisponibles.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                      <select value={capa.patron} onChange={(e) => { handleCapaChange(capa.id, "patron", e.target.value); saveLayerField(capa.id, "patron", e.target.value); }} className="text-[8px] border-none p-0 bg-transparent uppercase font-bold">
                        {patronesDisponibles.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                      </select>
                   </div>
                </td>
                <td className="border-r border-black p-1 bg-white">
                  <Textarea value={capa.descripcion} onChange={(e) => handleCapaChange(capa.id, "descripcion", e.target.value)} onBlur={() => saveLayerField(capa.id, "descripcion", capa.descripcion)} className="border-none text-[10px] min-h-[70px] p-1 font-bold resize-none leading-tight" />
                </td>
                <td className="border-r border-black p-1 bg-white">
                  <input value={capa.golpesSPT} onChange={(e) => handleCapaChange(capa.id, "golpesSPT", e.target.value)} onBlur={() => saveLayerField(capa.id, "golpesSPT", capa.golpesSPT)} className="w-full text-center border-none font-bold font-code" placeholder="N" />
                </td>
                <td className="border-r border-black p-1 bg-white">
                  <input value={capa.limiteLL} onChange={(e) => handleCapaChange(capa.id, "limiteLL", e.target.value)} onBlur={() => saveLayerField(capa.id, "limiteLL", capa.limiteLL)} className="w-full text-center border-none font-bold" />
                </td>
                <td className="border-r border-black p-1 bg-white">
                  <input value={capa.limiteIP} onChange={(e) => handleCapaChange(capa.id, "limiteIP", e.target.value)} onBlur={() => saveLayerField(capa.id, "limiteIP", capa.limiteIP)} className="w-full text-center border-none font-bold" />
                </td>
                <td className="border-r border-black p-1 bg-white">
                  <input value={capa.humedad} onChange={(e) => handleCapaChange(capa.id, "humedad", e.target.value)} onBlur={() => saveLayerField(capa.id, "humedad", capa.humedad)} className="w-full text-center border-none font-bold" />
                </td>
                <td className="border-r border-black p-1 bg-white">
                  <input value={capa.clasificacionUSCS} onChange={(e) => handleCapaChange(capa.id, "clasificacionUSCS", e.target.value)} onBlur={() => saveLayerField(capa.id, "clasificacionUSCS", capa.clasificacionUSCS)} className="w-full text-center border-none uppercase font-black text-primary" placeholder="ML" />
                </td>
                <td className="p-1 text-center print:hidden bg-white">
                  <Button variant="ghost" size="icon" onClick={() => eliminarCapa(capa.id)} disabled={capas.length === 1} className="h-6 w-6 text-destructive hover:bg-destructive/10"><Trash2 className="h-3 w-3" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-3 border-b border-black print:hidden">
        <Button variant="outline" size="sm" onClick={agregarCapa} className="w-full h-10 border-dashed border-neutral-400 font-black uppercase text-[10px] tracking-widest"><Plus className="h-4 w-4 mr-2" />Agregar Estrato al Perfil</Button>
      </div>

      {/* Referencias Técnicas */}
      <div className="grid grid-cols-2 border-b border-black text-[9px] font-bold bg-neutral-50">
        <div className="p-2 border-r border-black space-y-0.5">
          <p><span className="font-black">MI:</span> Muestra inalterada</p>
          <p><span className="font-black">MA:</span> Muestra alterada</p>
          <p><span className="font-black">SPT:</span> Ensayo de penetración estándar</p>
        </div>
        <div className="p-2 space-y-0.5">
          <p><span className="font-black">MNC:</span> Muestra no conseguida</p>
          <p><span className="font-black">TP:</span> Testigo parafinado</p>
          <p><span className="font-black">N.F.:</span> Nivel freático</p>
        </div>
      </div>

      <div className="border-b border-black">
        <div className="bg-neutral-100 p-2 border-b border-black flex items-center gap-2">
           <span className="font-black text-[10px] uppercase">Observaciones:</span>
        </div>
        <div className="flex">
          <Textarea value={formData.observaciones} onChange={(e) => handleFormChange("observaciones", e.target.value)} className="border-0 font-bold text-xs min-h-[80px] p-3 resize-none rounded-none" />
          <button onClick={() => saveParam("observaciones", 'General')} className={cn("p-4 bg-white border-l border-black hover:bg-neutral-50 transition-colors", savedFields["observaciones"] ? "text-green-600" : "text-black")}>
            {savingFields["observaciones"] ? <Loader2 className="h-4 w-4 animate-spin" /> : savedFields["observaciones"] ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="p-4 bg-neutral-50 print:hidden">
        <PhotoRegistry reportId={reportId} formId={formId} stationId={stationId} medium="suelo" />
      </div>

      <div className="p-4 border-t border-black bg-white print:hidden">
        <Button onClick={handleCerrarPlanilla} className="w-full h-12 bg-black hover:bg-neutral-900 text-white font-black uppercase tracking-widest text-[11px] shadow-xl">Finalizar y Cerrar Sondeo</Button>
      </div>

      <style jsx global>{`
        @media print {
          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
