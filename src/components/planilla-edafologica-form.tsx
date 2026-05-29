'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, where, addDoc, serverTimestamp, doc, updateDoc, arrayUnion, getDocs, orderBy, limit, Timestamp } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Check, Clock, User, Plus, Trash2, Mountain, ThermometerSun, Layers as LayersIcon, Droplets, Search, MapPin, Locate, Tag, CheckCircle2, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PhotoRegistry } from './photo-registry';
import { TechnicianLink } from './technician-link';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getCurrentGPSLocation } from '@/lib/geo-utils';

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

interface SoilEntry {
  value: any;
  capturedAt: number | null;
}

export function PlanillaEdafologicaForm({ reportId, formId, stationId, onClose }: Props) {
  const { toast } = useToast();
  const db = useFirestore();
  const { user } = useUser();
  
  const [formData, setFormData] = useState<Record<string, SoilEntry>>({});
  const [horizontesCount, setHorizontesCount] = useState(1);
  const [savingFields, setSavingFields] = useState<Record<string, boolean>>({});
  const [savedFields, setSavedFields] = useState<Record<string, boolean>>({});
  const [isLoadingExisting, setIsLoadingExisting] = useState(true);
  const [metadata, setMetadata] = useState<{ user?: string, timestamp?: any }>({});
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
        const newSavedFields: Record<string, boolean> = {};
        let foundMetadata = { user: user?.email || '', timestamp: null };
        let foundDeferred = false;
        let maxH = 1;

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

          const hMatch = data.analyte.match(/^H(\d+):/);
          if (hMatch) {
            const hNum = parseInt(hMatch[1]);
            if (hNum > maxH) maxH = hNum;
          }
        });

        setFormData(newFormData);
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

  const saveParam = async (name: string, category: string, valueOverride?: any) => {
    if (!user || !db) return;
    const entry = formData[name];
    const value = valueOverride !== undefined ? valueOverride : entry?.value;
    if (value === null || value === undefined || value === "") return;

    setSavingFields(prev => ({ ...prev, [name]: true }));
    
    const location = await getCurrentGPSLocation();
    const t1 = (valueOverride !== undefined ? Date.now() : entry?.capturedAt) || Date.now();
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
        value: `${value}`,
        latitude: location?.latitude || null,
        longitude: location?.longitude || null,
        retrasoSincronizacionMs: isDeferred ? 0 : deltaMs,
        fechaServidor: serverTimestamp(),
        timestamp: isDeferred ? Timestamp.fromDate(new Date(manualDate)) : serverTimestamp(),
        isDeferred,
        userId: user.uid,
        userEmail: user.email
      };

      if (!snapshot.empty) {
        updateDoc(doc(db, 'samples', snapshot.docs[0].id), payload);
      } else {
        addDoc(collection(db, 'samples'), {
          ...payload,
          medium: 'suelo',
          parameterType: category,
          analyte: name,
          reportId,
          formId,
          stationId,
        });
      }

      updateDoc(doc(db, 'reports', reportId), { editors: arrayUnion(user.email) });
      setSavedFields(prev => ({ ...prev, [name]: true }));
      toast({ title: "Sincronizado", description: location ? "Dato con GPS." : "Dato guardado." });
    } catch (error: any) {
      console.error(error);
    } finally {
      setSavingFields(prev => ({ ...prev, [name]: false }));
    }
  };

  const handleInputChange = (name: string, value: any) => {
    setFormData(prev => ({ ...prev, [name]: { value, capturedAt: Date.now() } }));
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

  const handleMunsellChange = (name: string, val: string) => {
    const formatted = val.toUpperCase();
    handleInputChange(name, formatted);
  };

  const sectionHeaderClass = "flex items-center gap-2 bg-neutral-100 px-4 py-2 border-y border-neutral-400 mt-6 first:mt-0";
  const rowClass = "flex items-center justify-between py-2.5 border-b border-neutral-300 hover:bg-neutral-50 transition-colors group px-4";
  const labelClass = "text-[11px] font-black text-black tracking-tight font-headline leading-none w-1/3 shrink-0 uppercase";
  const inputClass = "h-7 flex-1 border-none bg-transparent px-2 text-[12px] font-code text-black font-bold text-right rounded-none focus:ring-0 outline-none placeholder:text-neutral-300";

  const renderField = (name: string, label: string, cat: string, placeholder = "---") => (
    <div className={rowClass}>
      <label className={labelClass}>{label}</label>
      <div className="flex items-center gap-2 flex-1 justify-end">
        <input 
          type="text" 
          className={inputClass} 
          value={formData[name]?.value ?? ""} 
          onChange={(e) => handleInputChange(name, e.target.value)} 
          placeholder={placeholder}
        />
        <button onClick={() => saveParam(name, cat)} className={cn("p-1 transition-colors", savedFields[name] ? "text-green-600" : "text-black hover:text-primary")}>
          {savingFields[name] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : savedFields[name] ? <div className="rounded-full bg-green-100 p-0.5"><Check className="h-2.5 w-2.5 text-green-600" /></div> : <Check className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );

  const renderMunsellField = (name: string, label: string, cat: string) => (
    <div className={rowClass}>
      <label className={labelClass}>{label}</label>
      <div className="flex items-center gap-2 flex-1 justify-end">
        <input 
          type="text" 
          className={cn(inputClass, "uppercase")}
          value={formData[name]?.value ?? ""} 
          onChange={(e) => handleMunsellChange(name, e.target.value)} 
          placeholder="10YR 3/2"
        />
        <button onClick={() => saveParam(name, cat)} className={cn("p-1 transition-colors", savedFields[name] ? "text-green-600" : "text-black hover:text-primary")}>
          {savingFields[name] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : savedFields[name] ? <div className="rounded-full bg-green-100 p-0.5"><Check className="h-2.5 w-2.5 text-green-600" /></div> : <Check className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );

  const renderSelect = (name: string, label: string, cat: string, options: {v: string, l: string}[]) => (
    <div className={rowClass}>
      <label className={labelClass}>{label}</label>
      <div className="flex items-center gap-2 flex-1 justify-end">
        <Select 
          value={formData[name]?.value ?? ""} 
          onValueChange={(val) => {
            handleInputChange(name, val);
            saveParam(name, cat, val);
          }}
        >
          <SelectTrigger className="h-7 border-none bg-transparent shadow-none focus:ring-0 text-[11px] font-bold text-black text-right flex-row-reverse p-0 w-full justify-start gap-2">
            <SelectValue placeholder="Seleccionar..." />
          </SelectTrigger>
          <SelectContent>
            {options.map(opt => (
              <SelectItem key={opt.v} value={opt.v} className="text-xs font-bold uppercase">{opt.l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className={cn("p-1", savedFields[name] ? "text-green-600" : "text-transparent")}>
          {savingFields[name] ? <Loader2 className="h-3.5 w-3.5 animate-spin text-black" /> : <div className="rounded-full bg-green-100 p-0.5"><Check className="h-2.5 w-2.5" /></div>}
        </div>
      </div>
    </div>
  );

  const formatTimestamp = (ts: any) => {
    if (!ts) return new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (isLoadingExisting) {
    return <div className="p-12 text-center text-xs animate-pulse font-bold uppercase text-black">Cargando Planilla Edafologica...</div>;
  }

  const isDeferredLocked = Object.keys(savedFields).length > 0;

  return (
    <div className="mx-auto w-full border border-neutral-400 bg-white font-body shadow-sm rounded-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300 pb-20">
      <div className="border-b border-neutral-400 bg-neutral-100 px-4 py-3 flex justify-between items-center">
        <div>
          <h1 className="text-sm font-black uppercase tracking-tight text-black font-headline">Suelos • PE-001</h1>
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

      <div className={sectionHeaderClass}><Mountain className="h-3.5 w-3.5 text-primary" /><span className="text-[10px] font-black uppercase tracking-wider text-black">1. Identificación y Ubicación</span></div>
      
      <div className={cn(rowClass, "relative")}>
        <label className={labelClass}>Lugar / Localidad</label>
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
            {isSearchingOSM ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin absolute right-0 top-2 text-neutral-400" />
            ) : (
              <Search className="h-3.5 w-3.5 absolute right-0 top-2 text-neutral-400" />
            )}
          </div>
          <button onClick={() => saveParam("Lugar", "General", osmQuery)} className={cn("p-1 transition-colors", savedFields["Lugar"] ? "text-green-600" : "text-black")}>
            {savingFields["Lugar"] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : savedFields["Lugar"] ? <div className="rounded-full bg-green-100 p-0.5"><Check className="h-2.5 w-2.5 text-green-600" /></div> : <Check className="h-4 w-4" />}
          </button>
        </div>
        
        {showOSMResults && osmResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-50 bg-white border border-neutral-300 shadow-xl mt-1 max-h-48 overflow-hidden rounded-sm">
            <ScrollArea className="h-full">
              {osmResults.map((res, idx) => (
                <button 
                  key={idx} 
                  onClick={() => selectOSMLocation(res)}
                  className="w-full text-left p-2 hover:bg-neutral-50 border-b last:border-0 text-[10px] font-bold uppercase text-black"
                >
                  {res.display_name}
                </button>
              ))}
            </ScrollArea>
          </div>
        )}
      </div>

      <div className={rowClass}>
        <label className={labelClass}>Punto Específico</label>
        <div className="flex items-center gap-2 flex-1 justify-end">
          <input 
            type="text" 
            className={inputClass} 
            value={formData["Punto_Muestreo"]?.value ?? ""} 
            onChange={(e) => handleInputChange("Punto_Muestreo", e.target.value)} 
            placeholder="Coordenadas o Ref."
          />
          <button onClick={captureGPS} title="Forzar GPS de Alta Precisión" className="p-1 hover:bg-primary/5 rounded transition-colors">
            <Locate className="h-4 w-4 text-primary" />
          </button>
          <button onClick={() => saveParam("Punto_Muestreo", "General")} className={cn("p-1 transition-colors", savedFields["Punto_Muestreo"] ? "text-green-600" : "text-black")}>
            {savingFields["Punto_Muestreo"] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : savedFields["Punto_Muestreo"] ? <div className="rounded-full bg-green-100 p-0.5"><Check className="h-2.5 w-2.5 text-green-600" /></div> : <Check className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {renderField("Paisaje", "Paisaje / Forma", "Entorno")}
      {renderField("Material_Originario", "Material Originario", "Geología")}

      <div className={sectionHeaderClass}><ThermometerSun className="h-3.5 w-3.5 text-primary" /><span className="text-[10px] font-black uppercase tracking-wider text-black">2. Factores Ambientales</span></div>
      {renderField("Clima", "Clima / Región", "Entorno")}
      {renderField("Vegetacion", "Vegetación / Cultivo", "Entorno")}
      {renderSelect("Drenaje", "Drenaje", "Propiedades", [
        {v: "0", l: "0 - Muy Pobre"}, {v: "1", l: "1 - Pobre"}, {v: "2", l: "2 - Imperfecto"}, {v: "3", l: "3 - Moderadamente Bueno"}, {v: "4", l: "4 - Bueno"}, {v: "5", l: "5 - Algo Excesivo"}, {v: "6", l: "6 - Excesivo"}
      ])}
      {renderSelect("Relieve", "Relieve", "Propiedades", [
        {v: "excesivo", l: "Excesivo"}, {v: "normal", l: "Normal"}, {v: "subnormal", l: "Subnormal"}, {v: "concavo", l: "Cóncavo"}
      ])}
      {renderSelect("Inundacion", "Peligro Inundación", "Propiedades", [
        {v: "C1", l: "C1 - Muy Bajo"}, {v: "C2", l: "C2 - Bajo"}, {v: "C3", l: "C3 - Moderado"}, {v: "C4", l: "C4 - Alto"}, {v: "C5", l: "C5 - Muy Alto"}
      ])}
      {renderField("Pendiente", "Pendiente (%)", "Propiedades")}
      {renderField("Prof_Napa", "Profundidad Napa (m)", "Propiedades")}

      <div className={sectionHeaderClass}><LayersIcon className="h-3.5 w-3.5 text-primary" /><span className="text-[10px] font-black uppercase tracking-wider text-black">3. Perfil del Suelo (Horizontes)</span></div>
      {Array.from({ length: horizontesCount }).map((_, i) => {
        const hIdx = i + 1;
        const hPrefix = `H${hIdx}:`;
        return (
          <div key={hIdx} className="mb-6 border-b-2 border-neutral-200 pb-2">
            <div className="bg-neutral-50 px-4 py-1.5 flex justify-between items-center border-y border-neutral-300">
              <span className="text-[11px] font-black uppercase text-primary tracking-widest">Horizonte {hIdx}</span>
              {hIdx > 1 && hIdx === horizontesCount && (
                <button onClick={() => setHorizontesCount(prev => prev - 1)} className="text-destructive p-1 hover:bg-destructive/10 rounded transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
              )}
            </div>
            {renderField(`${hPrefix} Horizonte`, "Denominación", "Horizontes")}
            {renderField(`${hPrefix} Profundidad`, "Profundidad (cm)", "Horizontes", "0-20")}
            {renderMunsellField(`${hPrefix} Color_Seco`, "Munsell (Seco)", "Horizontes")}
            {renderMunsellField(`${hPrefix} Color_Humedo`, "Munsell (Húmedo)", "Horizontes")}
            {renderSelect(`${hPrefix} Textura`, "Textura", "Horizontes", [
              {v: "A", l: "Arenosa"}, {v: "AF", l: "Arena Franca"}, {v: "FA", l: "Franco Arenosa"}, {v: "F", l: "Franca"}, {v: "FL", l: "Franco Limosa"}, {v: "L", l: "Limosa"}, {v: "FArA", l: "Franco Arcillo Arenosa"}, {v: "FAr", l: "Franco Arcillosa"}, {v: "FArL", l: "Franco Arcillo Limosa"}, {v: "ArA", l: "Arcillo Arenosa"}, {v: "ArL", l: "Arcillo Limosa"}, {v: "Ar", l: "Arcillosa"}
            ])}
            {renderSelect(`${hPrefix} Estructura`, "Estructura", "Horizontes", [
              {v: "granular", l: "Granular"}, {v: "bloques_ang", l: "Bloques Angulares"}, {v: "bloques_sub", l: "Bloques Subangulares"}, {v: "prismatica", l: "Prismática"}, {v: "columnar", l: "Columnar"}, {v: "laminar", l: "Laminar"}, {v: "sin_estructura", l: "Sin Estructura"}
            ])}
            {renderSelect(`${hPrefix} Limite`, "Límite Inferior", "Horizontes", [
              {v: "abrupto", l: "Abrupto"}, {v: "claro", l: "Claro"}, {v: "gradual", l: "Gradual"}, {v: "difuso", l: "Difuso"}
            ])}
            {renderField(`${hPrefix} pH`, "pH", "Horizontes")}
          </div>
        );
      })}
      <div className="px-4 py-2">
        <Button variant="outline" className="w-full h-10 border-dashed border-neutral-400 text-[11px] font-black uppercase tracking-widest text-neutral-500 hover:bg-neutral-50 rounded-none" onClick={() => setHorizontesCount(prev => prev + 1)}>
          <Plus className="h-4 w-4 mr-2" /> Agregar Horizonte
        </Button>
      </div>

      <div className={sectionHeaderClass}><Tag className="h-3.5 w-3.5 text-primary" /><span className="text-[10px] font-black uppercase tracking-wider text-black">4. Clasificación</span></div>
      {renderField("Serie", "Serie de Suelo", "Clasificación")}
      {renderField("Fase", "Fase", "Clasificación")}
      {renderField("Simbolo", "Símbolo Cartográfico", "Clasificación")}

      <div className={sectionHeaderClass}><Droplets className="h-3.5 w-3.5 text-primary" /><span className="text-[10px] font-black uppercase tracking-wider text-black">5. Registro Fotográfico</span></div>
      <div className="px-4 py-6">
        <PhotoRegistry reportId={reportId} formId={formId} stationId={stationId} medium="suelo" />
      </div>

      <div className="bg-white p-4 border-t border-neutral-400">
        <button onClick={onClose} className="w-full bg-neutral-900 hover:bg-black py-4 text-[11px] font-black uppercase tracking-widest text-white shadow-xl transition-all active:scale-[0.98]">Finalizar y Cerrar Planilla</button>
      </div>
    </div>
  );
}
