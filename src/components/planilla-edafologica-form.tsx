'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, addDoc, serverTimestamp, doc, updateDoc, arrayUnion, getDocs } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Check, Clock, User, Plus, Trash2, Mountain, ThermometerSun, Layers as LayersIcon, Droplets } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PhotoRegistry } from './photo-registry';
import { TechnicianLink } from './technician-link';

interface Props {
  reportId: string;
  formId: string;
  stationId: string;
  onClose?: () => void;
}

export function PlanillaEdafologicaForm({ reportId, formId, stationId, onClose }: Props) {
  const { toast } = useToast();
  const db = useFirestore();
  const { user } = useUser();
  
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [horizontesCount, setHorizontesCount] = useState(1);
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
        let foundMetadata = { user: user?.email || '', timestamp: null };
        let maxH = 1;

        snapshot.docs.forEach(doc => {
          const data = doc.data();
          newFormData[data.analyte] = data.value;
          newSavedFields[data.analyte] = true;
          
          if (!foundMetadata.timestamp || (data.timestamp && data.timestamp.toMillis() < foundMetadata.timestamp.toMillis())) {
            foundMetadata = { user: data.userEmail || user?.email || '', timestamp: data.timestamp };
          }

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

  const handleInputChange = (name: string, value: any) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    if (savedFields[name]) {
      setSavedFields(prev => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  /**
   * Formateador Munsell inteligente:
   * Hue: 1-2 dígitos + 1-2 letras (ej: 5Y, 10YR, 2.5YR)
   * Value: 1 dígito
   * Chroma: 1 dígito
   * Formato final: [HUE] [VALUE]/[CHROMA] (ej: 10YR 3/2)
   */
  const formatMunsell = (val: string) => {
    // 1. Limpiar caracteres no permitidos y pasar a mayúsculas
    let clean = val.toUpperCase().replace(/[^0-9A-Z/.]/g, '');
    
    // 2. Eliminar barras y espacios existentes para re-procesar la estructura
    let raw = clean.replace(/[\s/]/g, '');
    
    // 3. Regex para capturar las partes: [Hue Num][Hue Letters][Value digit][Chroma digit]
    // El Hue Num puede tener puntos (ej 2.5). El Hue Letters son letras. Los últimos dos son dígitos solos.
    const match = raw.match(/^([0-9.]+)?([A-Z]+)?(\d)?(\d)?/);
    
    if (match) {
      const hueNum = match[1] || "";
      const hueLetters = match[2] || "";
      const value = match[3] || "";
      const chroma = match[4] || "";
      
      let formatted = `${hueNum}${hueLetters}`;
      
      if (value) {
        // Si hay un dígito de Value, insertamos el espacio antes
        formatted += ` ${value}`;
        if (chroma) {
          // Si hay un dígito de Chroma, insertamos la barra antes
          formatted += `/${chroma}`;
        }
      }
      
      return formatted;
    }
    
    return clean;
  };

  const handleMunsellChange = (name: string, val: string) => {
    const formatted = formatMunsell(val);
    handleInputChange(name, formatted);
  };

  const sectionHeaderClass = "flex items-center gap-2 bg-neutral-100 px-3 py-2 border-y border-neutral-400 mt-6 first:mt-0";
  const rowClass = "flex items-center justify-between py-2.5 border-b border-neutral-300 hover:bg-neutral-50 transition-colors group px-3";
  const labelClass = "text-[11px] font-black text-black tracking-tight font-headline leading-none w-1/3";
  const inputClass = "h-7 flex-1 border-none bg-transparent px-2 text-[12px] font-code text-black font-bold text-right rounded-none focus:ring-0 outline-none placeholder:text-neutral-300";

  const renderField = (name: string, label: string, cat: string, placeholder = "---") => (
    <div className={rowClass}>
      <label className={labelClass}>{label}</label>
      <div className="flex items-center gap-2 flex-1 justify-end">
        <input 
          type="text" 
          className={inputClass} 
          value={formData[name] ?? ""} 
          onChange={(e) => handleInputChange(name, e.target.value)} 
          placeholder={placeholder}
        />
        <button onClick={() => saveParam(name, cat)} className={cn("p-1 transition-colors", savedFields[name] ? "text-green-600" : "text-black hover:text-primary")}>
          {savingFields[name] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : savedFields[name] ? <div className="rounded-full bg-green-100 p-0.5"><Check className="h-2.5 w-2.5 text-green-600" /></div> : <Check className="h-3.5 w-3.5" />}
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
          value={formData[name] ?? ""} 
          onChange={(e) => handleMunsellChange(name, e.target.value)} 
          placeholder="10YR 3/2"
        />
        <button onClick={() => saveParam(name, cat)} className={cn("p-1 transition-colors", savedFields[name] ? "text-green-600" : "text-black hover:text-primary")}>
          {savingFields[name] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : savedFields[name] ? <div className="rounded-full bg-green-100 p-0.5"><Check className="h-2.5 w-2.5 text-green-600" /></div> : <Check className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );

  const renderSelect = (name: string, label: string, cat: string, options: {v: string, l: string}[]) => (
    <div className={rowClass}>
      <label className={labelClass}>{label}</label>
      <div className="flex items-center gap-2 flex-1 justify-end">
        <Select 
          value={formData[name] ?? ""} 
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
              <SelectItem key={opt.v} value={opt.v} className="text-xs font-bold">{opt.l}</SelectItem>
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
    return <div className="p-12 text-center text-xs animate-pulse font-bold uppercase">Cargando Planilla Edafologica...</div>;
  }

  return (
    <div className="mx-auto w-full border border-neutral-400 bg-white font-body shadow-sm rounded-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300 pb-20">
      <div className="border-b border-neutral-400 bg-neutral-100 px-4 py-3 flex justify-between items-center">
        <div>
          <h1 className="text-sm font-black uppercase tracking-tight text-black font-headline">Suelos • Planilla Edafológica</h1>
          <div className="flex flex-col gap-0.5 mt-1">
            <p className="text-[10px] text-neutral-600 font-bold uppercase leading-none tracking-tight">ID: {formId.substring(0, 12)}</p>
            <div className="flex items-center gap-3 text-[9px] text-black font-black uppercase tracking-tighter mt-1">
              <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5 text-primary" /> {formatTimestamp(metadata.timestamp)}</span>
              <span className="flex items-center gap-1"><User className="h-2.5 w-2.5 text-primary" /> <TechnicianLink email={metadata.user || user?.email || null} /></span>
            </div>
          </div>
        </div>
      </div>

      <div className={sectionHeaderClass}><Mountain className="h-3.5 w-3.5 text-primary" /><span className="text-[10px] font-black uppercase tracking-wider text-black">1. Identificación y Ubicación</span></div>
      {renderField("Lugar", "Lugar / Localidad", "General")}
      {renderField("Punto_Muestreo", "Punto Específico", "General")}
      {renderField("Serie", "Serie de Suelo", "Clasificación")}
      {renderField("Fase", "Fase", "Clasificación")}
      {renderField("Simbolo", "Símbolo Cartográfico", "Clasificación")}
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
            <div className="bg-neutral-50 px-3 py-1.5 flex justify-between items-center border-y border-neutral-300">
              <span className="text-[11px] font-black uppercase text-primary tracking-widest">Horizonte {hIdx}</span>
              {hIdx > 1 && hIdx === horizontesCount && (
                <button onClick={() => setHorizontesCount(prev => prev - 1)} className="text-destructive p-1 hover:bg-destructive/10 rounded transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
              )}
            </div>
            {renderField(`${hPrefix} Horizonte`, "Denominación (A, Bt, C...)", "Horizontes")}
            {renderField(`${hPrefix} Profundidad`, "Profundidad (cm)", "Horizontes", "0-20")}
            {renderMunsellField(`${hPrefix} Color_Seco`, "Color Munsell (Seco)", "Horizontes")}
            {renderMunsellField(`${hPrefix} Color_Humedo`, "Color Munsell (Húmedo)", "Horizontes")}
            {renderSelect(`${hPrefix} Textura`, "Textura", "Horizontes", [
              {v: "A", l: "Arenosa"}, {v: "AF", l: "Arena Franca"}, {v: "FA", l: "Franco Arenosa"}, {v: "F", l: "Franca"}, {v: "FL", l: "Franco Limosa"}, {v: "L", l: "Limosa"}, {v: "FArA", l: "Franco Arcillo Arenosa"}, {v: "FAr", l: "Franco Arcillosa"}, {v: "FArL", l: "Franco Arcillo Limosa"}, {v: "ArA", l: "Arcillo Arenosa"}, {v: "ArL", l: "Arcillo Limosa"}, {v: "Ar", l: "Arcillosa"}
            ])}
            {renderSelect(`${hPrefix} Estructura`, "Estructura", "Horizontes", [
              {v: "granular", l: "Granular"}, {v: "bloques_ang", l: "Bloques Angulares"}, {v: "bloques_sub", l: "Bloques Subangulares"}, {v: "prismatica", l: "Prismática"}, {v: "columnar", l: "Columnar"}, {v: "laminar", l: "Laminar"}, {v: "sin_estructura", l: "Sin Estructura"}
            ])}
            
            {renderSelect(`${hPrefix} Consistencia_Seco`, "Consistencia (Seco)", "Horizontes", [
              {v: "suelto", l: "Suelto"}, {v: "blando", l: "Blando"}, {v: "m_firme", l: "Moderadamente Firme"}, {v: "firme", l: "Firme"}, {v: "muy_firme", l: "Muy Firme"}, {v: "extrem_firme", l: "Extremadamente Firme"}
            ])}
            {renderSelect(`${hPrefix} Consistencia_Humedo`, "Consistencia (Húmedo)", "Horizontes", [
              {v: "suelto", l: "Suelto"}, {v: "muy_friable", l: "Muy Friable"}, {v: "friable", l: "Friable"}, {v: "firme", l: "Firme"}, {v: "muy_firme", l: "Muy Firme"}, {v: "extrem_firme", l: "Extremadamente Firme"}
            ])}
            {renderSelect(`${hPrefix} Consistencia_Mojado_Adh`, "Consistencia (Mojado): Adherencia", "Horizontes", [
              {v: "no_pegajoso", l: "No pegajoso"}, {v: "l_pegajoso", l: "Ligeramente pegajoso"}, {v: "pegajoso", l: "Pegajoso"}, {v: "m_pegajoso", l: "Muy pegajoso"}
            ])}
            {renderSelect(`${hPrefix} Consistencia_Mojado_Plas`, "Consistencia (Mojado): Plasticidad", "Horizontes", [
              {v: "no_plastico", l: "No plástico"}, {v: "l_plastico", l: "Ligeramente plástico"}, {v: "plastico", l: "Plástico"}, {v: "m_plastico", l: "Muy plástico"}
            ])}

            {renderSelect(`${hPrefix} Limite`, "Límite Inferior", "Horizontes", [
              {v: "abrupto", l: "Abrupto"}, {v: "claro", l: "Claro"}, {v: "gradual", l: "Gradual"}, {v: "difuso", l: "Difuso"}
            ])}
            {renderField(`${hPrefix} pH`, "pH", "Horizontes")}
            {renderSelect(`${hPrefix} Raices`, "Raíces", "Horizontes", [
              {v: "ninguna", l: "Ninguna"}, {v: "pocas", l: "Pocas"}, {v: "frecuentes", l: "Frecuentes"}, {v: "muchas", l: "Muchas"}
            ])}
          </div>
        );
      })}
      <div className="px-3 py-2">
        <Button variant="outline" className="w-full h-10 border-dashed border-neutral-400 text-[11px] font-black uppercase tracking-widest text-neutral-500 hover:bg-neutral-50" onClick={() => setHorizontesCount(prev => prev + 1)}>
          <Plus className="h-4 w-4 mr-2" /> Agregar Horizonte al Perfil
        </Button>
      </div>

      <div className={sectionHeaderClass}><Droplets className="h-3.5 w-3.5 text-primary" /><span className="text-[10px] font-black uppercase tracking-wider text-black">4. Registro Fotográfico</span></div>
      <div className="px-3 py-4">
        <PhotoRegistry reportId={reportId} formId={formId} stationId={stationId} medium="suelo" />
      </div>

      <div className="bg-white p-4 border-t border-neutral-200">
        <button onClick={onClose} className="w-full bg-neutral-900 hover:bg-black py-4 text-[11px] font-black uppercase tracking-widest text-white shadow-xl transition-all active:scale-[0.98]">Finalizar y Cerrar Planilla</button>
      </div>
    </div>
  );
}
