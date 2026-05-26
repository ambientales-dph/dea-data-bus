'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, addDoc, serverTimestamp, doc, updateDoc, arrayUnion, getDocs } from 'firebase/firestore';
import { useFirestore, useUser, useDoc } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Check, Clock, User, Plus, Trash2 } from 'lucide-react';
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

  const saveParam = async (name: string, category: string) => {
    if (!user || !db) return;
    const value = formData[name];
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

  const sectionHeaderClass = "flex items-center bg-neutral-100 px-3 py-1.5 border-y border-neutral-400 mt-4 first:mt-0";
  const rowClass = "flex items-center justify-between py-2.5 border-b border-neutral-300 hover:bg-neutral-50 transition-colors group px-3";
  const labelClass = "text-[11px] font-black text-black tracking-tight font-headline leading-none w-1/2";
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

  const renderRadio = (name: string, label: string, cat: string, options: {v: string, l: string}[]) => (
    <div className="flex flex-col py-3 border-b border-neutral-300 px-3 hover:bg-neutral-50">
      <label className="text-[11px] font-black text-black mb-3">{label}</label>
      <RadioGroup 
        value={formData[name] ?? ""} 
        onValueChange={(val) => { handleInputChange(name, val); saveParam(name, cat); }}
        className="flex flex-wrap gap-x-4 gap-y-2"
      >
        {options.map(opt => (
          <div key={opt.v} className="flex items-center gap-1">
            <RadioGroupItem value={opt.v} id={`${name}-${opt.v}`} className="h-3.5 w-3.5 border-black" />
            <label htmlFor={`${name}-${opt.v}`} className="text-[10px] font-bold cursor-pointer">{opt.l}</label>
          </div>
        ))}
      </RadioGroup>
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
      <div className="border-b border-neutral-400 bg-neutral-100 px-4 py-2 flex justify-between items-center">
        <div>
          <h1 className="text-xs font-black uppercase tracking-tight text-black font-headline">Suelos • Planilla Edafologica</h1>
          <div className="flex flex-col gap-0.5 mt-0.5">
            <p className="text-[9px] text-neutral-600 font-bold uppercase leading-none">ID: {formId.substring(0, 8)}</p>
            <div className="flex items-center gap-3 text-[9px] text-black font-black uppercase tracking-tighter">
              <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> {formatTimestamp(metadata.timestamp)}</span>
              <span className="flex items-center gap-1"><User className="h-2.5 w-2.5" /> <TechnicianLink email={metadata.user || user?.email || null} /></span>
            </div>
          </div>
        </div>
      </div>

      <div className={sectionHeaderClass}><span className="text-[10px] font-black uppercase tracking-wider text-black">1. Datos Generales y Ubicacion</span></div>
      {renderField("Lugar", "Lugar", "General")}
      {renderField("Serie", "Serie", "Clasificacion")}
      {renderField("Fase", "Fase", "Clasificacion")}
      {renderField("Simbolo", "Simbolo", "Clasificacion")}
      {renderField("Paisaje", "Paisaje (Tipo/Forma)", "Entorno")}
      {renderField("Vegetacion", "Vegetacion Natural / Cultivos", "Entorno")}

      <div className={sectionHeaderClass}><span className="text-[10px] font-black uppercase tracking-wider text-black">2. Propiedades del Suelo</span></div>
      {renderRadio("Drenaje", "Drenaje", "Propiedades", [
        {v: "0", l: "0-M.Pobre"}, {v: "1", l: "1-Pobre"}, {v: "2", l: "2-Imperf."}, {v: "3", l: "3-M.Bueno"}, {v: "4", l: "4-Bueno"}, {v: "5", l: "5-Algo Exc."}, {v: "6", l: "6-Exc."}
      ])}
      {renderRadio("Relieve", "Relieve", "Propiedades", [
        {v: "exc", l: "Excesivo"}, {v: "norm", l: "Normal"}, {v: "subn", l: "Subnormal"}, {v: "conc", l: "Concavo"}
      ])}
      {renderRadio("Inundacion", "Peligro de Inundacion", "Propiedades", [
        {v: "1", l: "C1"}, {v: "2", l: "C2"}, {v: "3", l: "C3"}, {v: "4", l: "C4"}, {v: "5", l: "C5"}
      ])}
      {renderField("Pendiente", "Pendiente %", "Propiedades")}
      {renderField("Prof_Napa", "Profundidad Napa (m)", "Propiedades")}

      <div className={sectionHeaderClass}><span className="text-[10px] font-black uppercase tracking-wider text-black">3. Horizontes</span></div>
      {Array.from({ length: horizontesCount }).map((_, i) => {
        const hIdx = i + 1;
        const hPrefix = `H${hIdx}:`;
        return (
          <div key={hIdx} className="mb-4 border-b-2 border-neutral-100 pb-2">
            <div className="bg-neutral-50 px-3 py-1 flex justify-between items-center border-y border-neutral-200">
              <span className="text-[10px] font-black uppercase text-neutral-500">Horizonte {hIdx}</span>
              {hIdx > 1 && hIdx === horizontesCount && (
                <button onClick={() => setHorizontesCount(prev => prev - 1)} className="text-destructive p-1 hover:bg-destructive/10 rounded"><Trash2 className="h-3 w-3" /></button>
              )}
            </div>
            {renderField(`${hPrefix} Horizonte`, "Nombre Horizonte (A, Bt, etc)", "Horizontes")}
            {renderField(`${hPrefix} Profundidad`, "Profundidad (cm)", "Horizontes", "0-20")}
            {renderField(`${hPrefix} Textura`, "Textura", "Horizontes", "Franco-arcilloso")}
            {renderField(`${hPrefix} Estructura`, "Estructura (Tipo/Clase/Grado)", "Horizontes")}
            {renderField(`${hPrefix} Color_Seco`, "Color Munsell (Seco)", "Horizontes")}
            {renderField(`${hPrefix} pH`, "pH", "Horizontes")}
          </div>
        );
      })}
      <div className="px-3 py-2">
        <Button variant="outline" className="w-full h-8 border-dashed border-neutral-400 text-[10px] font-bold uppercase tracking-widest text-neutral-500" onClick={() => setHorizontesCount(prev => prev + 1)}>
          <Plus className="h-3 w-3 mr-2" /> Agregar Horizonte
        </Button>
      </div>

      <div className="px-3 py-4">
        <PhotoRegistry reportId={reportId} formId={formId} stationId={stationId} medium="suelo" />
      </div>

      <div className="bg-white p-4">
        <button onClick={onClose} className="w-full bg-neutral-900 hover:bg-black py-4 text-[11px] font-black uppercase tracking-widest text-white shadow-md">Finalizar y Cerrar Planilla</button>
      </div>
    </div>
  );
}
