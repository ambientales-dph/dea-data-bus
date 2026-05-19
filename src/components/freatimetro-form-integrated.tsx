'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { collection, addDoc, serverTimestamp, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { useFirestore, useUser, useDoc, errorEmitter, FirestorePermissionError } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle2, Info, Check, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FreatimetroData {
  idPozo: string;
  coordenadaX: number | null;
  coordenadaY: number | null;
  cotaBrocal: number | null;
  fechaHora: string;
  nivelEstatico: number | null;
  profundidadTotal: number | null;
  ph: number | null;
  conductividad: number | null;
  temperatura: number | null;
  plomo: number | null;
  cadmio: number | null;
  arsenico: number | null;
  tph: number | null;
}

const initialFormData: FreatimetroData = {
  idPozo: "",
  coordenadaX: null,
  coordenadaY: null,
  cotaBrocal: null,
  fechaHora: "",
  nivelEstatico: null,
  profundidadTotal: null,
  ph: null,
  conductividad: null,
  temperatura: null,
  plomo: null,
  cadmio: null,
  arsenico: null,
  tph: null,
};

interface Props {
  reportId: string;
  stationId: string;
  onSuccess?: () => void;
}

export function FreatimetroFormIntegrated({ reportId, stationId, onSuccess }: Props) {
  const { toast } = useToast();
  const db = useFirestore();
  const { user } = useUser();
  const [formData, setFormData] = useState<FreatimetroData>(initialFormData);
  const [isSaving, setIsSaving] = useState(false);
  const [savingFields, setSavingFields] = useState<Record<string, boolean>>({});
  const [savedFields, setSavedFields] = useState<Record<string, boolean>>({});
  const hasSetInitialId = useRef(false);

  const stationRef = useMemo(() => doc(db, 'stations', stationId), [db, stationId]);
  const { data: stationData } = useDoc(stationRef);

  useEffect(() => {
    if (stationData?.name && !hasSetInitialId.current) {
      setFormData(prev => ({ ...prev, idPozo: stationData.name }));
      hasSetInitialId.current = true;
    }
  }, [stationData?.name]);

  const cotaAgua = useMemo(() => {
    if (formData.cotaBrocal !== null && formData.nivelEstatico !== null) {
      return Number((formData.cotaBrocal - formData.nivelEstatico).toFixed(3));
    }
    return null;
  }, [formData.cotaBrocal, formData.nivelEstatico]);

  const handleInputChange = (field: keyof FreatimetroData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: field === "idPozo" || field === "fechaHora" 
        ? value 
        : value === "" ? null : parseFloat(value),
    }));
  };

  const saveIndividualParam = async (key: keyof FreatimetroData | 'cotaAgua', label: string, type: string, unit: string) => {
    if (!user) return;
    
    const value = key === 'cotaAgua' ? cotaAgua : formData[key as keyof FreatimetroData];
    if (value === null || value === undefined || value === "") {
      toast({ variant: "destructive", title: "Valor vacío", description: `Por favor, ingresá un valor para ${label}.` });
      return;
    }

    setSavingFields(prev => ({ ...prev, [key]: true }));
    
    const sampleData = {
      medium: 'agua_subterranea',
      parameterType: type,
      analyte: label,
      value: `${value}`,
      reportId,
      stationId,
      userId: user.uid,
      userEmail: user.email,
      timestamp: serverTimestamp(),
    };

    try {
      await addDoc(collection(db, 'samples'), sampleData);
      await updateDoc(doc(db, 'reports', reportId), { editors: arrayUnion(user.email) });
      
      setSavedFields(prev => ({ ...prev, [key]: true }));
      toast({ title: "Guardado", description: `${label} registrado correctamente.` });
    } catch (error: any) {
      const permissionError = new FirestorePermissionError({
        path: 'samples',
        operation: 'create',
        requestResourceData: sampleData,
      });
      errorEmitter.emit('permission-error', permissionError);
    } finally {
      setSavingFields(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleFinalize = async () => {
    if (!user) return;
    setIsSaving(true);

    try {
      const reportRef = doc(db, 'reports', reportId);
      await updateDoc(reportRef, { 
        status: 'closed',
        updatedAt: serverTimestamp(),
        editors: arrayUnion(user.email)
      });
      
      toast({ title: "Reporte Finalizado", description: "Se ha registrado la fecha de cierre y el reporte ha sido guardado." });
      onSuccess?.();
    } catch (e: any) {
      console.error(e);
      toast({ variant: "destructive", title: "Error", description: "No se pudo cerrar el reporte." });
    } finally {
      setIsSaving(false);
    }
  };

  const rowClass = "flex items-center justify-between py-2.5 border-b border-neutral-300 hover:bg-neutral-50 transition-colors group";
  const labelClass = "text-[11px] font-black text-black tracking-tight font-headline leading-none";
  const subLabelClass = "text-[9px] text-neutral-600 font-bold leading-tight mt-1 flex items-center gap-1";
  const inputContainerClass = "flex-1 flex items-center gap-2 justify-end";
  const inputClass = "h-7 w-28 border-none bg-transparent px-2 text-[12px] focus:ring-0 focus:outline-none font-code text-black font-bold text-right rounded-none placeholder:text-neutral-300";
  const sectionHeaderClass = "flex items-center bg-neutral-100 px-3 py-1.5 border-y border-neutral-400 mt-2 first:mt-0";

  return (
    <div className="mx-auto w-full border border-neutral-400 bg-white font-body shadow-sm rounded-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="border-b border-neutral-400 bg-neutral-100 px-4 py-2 flex justify-between items-center">
        <div>
          <h1 className="text-xs font-black uppercase tracking-tight text-black font-headline">
            Planilla Técnica Ambiental
          </h1>
          <p className="text-[9px] text-neutral-600 font-bold uppercase leading-none">
            Monitoreo de Freatímetros • Formulario FTA-001
          </p>
        </div>
        <div className="text-right text-[8px] text-neutral-500 font-black uppercase">
          <p>VERSIÓN 2024.1</p>
        </div>
      </div>

      <div className="p-0">
        <div className={sectionHeaderClass}>
          <span className="text-[10px] font-black uppercase tracking-wider text-black">1. Datos de Identificación</span>
        </div>
        <div className="px-3">
          <div className={rowClass}>
            <div className="flex flex-col flex-1">
              <label className={labelClass}>ID Pozo</label>
              <span className={subLabelClass}>Identificación Técnica de Campo</span>
            </div>
            <div className={inputContainerClass}>
              <input type="text" className={inputClass} placeholder="ID Sugerido" value={formData.idPozo} onChange={(e) => handleInputChange("idPozo", e.target.value)} />
            </div>
          </div>
          <div className={rowClass}>
            <div className="flex flex-col flex-1">
              <label className={labelClass}>Cota Brocal (m s.n.m.)</label>
              <span className={subLabelClass}>Elevación sobre nivel del mar</span>
            </div>
            <div className={inputContainerClass}>
              <input type="number" step="any" className={inputClass} value={formData.cotaBrocal ?? ""} onChange={(e) => handleInputChange("cotaBrocal", e.target.value)} />
              <button 
                onClick={() => saveIndividualParam('cotaBrocal', 'Cota Brocal', 'Identificación', 'm s.n.m.')}
                className={cn("p-1.5 rounded transition-colors", savedFields['cotaBrocal'] ? "text-green-600 bg-green-50" : "text-neutral-300 hover:text-green-600")}
              >
                {savingFields['cotaBrocal'] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          <div className={rowClass}>
            <div className="flex flex-col flex-1 pr-4">
              <label className={labelClass}>Fecha y Hora Campo</label>
              <span className={subLabelClass}>Momento del Muestreo In Situ</span>
            </div>
            <div className="w-48 flex items-center justify-end">
              <input type="datetime-local" className={cn(inputClass, "w-full")} value={formData.fechaHora} onChange={(e) => handleInputChange("fechaHora", e.target.value)} />
            </div>
          </div>
        </div>

        <div className={sectionHeaderClass}>
          <span className="text-[10px] font-black uppercase tracking-wider text-black">2. Mediciones In Situ</span>
        </div>
        <div className="px-3">
          {[
            { key: 'nivelEstatico', name: 'Nivel Estático', unit: 'm', type: 'Físico', guide: 'N/A' },
            { key: 'profundidadTotal', name: 'Profundidad Total', unit: 'm', type: 'Físico', guide: 'N/A' },
            { key: 'ph', name: 'pH', unit: 'pH', type: 'Fisicoquímico', guide: '6.5 - 8.5 (Ley 24.051)' },
            { key: 'conductividad', name: 'Conductividad', unit: 'μS/cm', type: 'Fisicoquímico', guide: 'N/A' },
            { key: 'temperatura', name: 'Temperatura', unit: '°C', type: 'Fisicoquímico', guide: 'N/A' }
          ].map((field) => (
            <div key={field.key} className={rowClass}>
              <div className="flex flex-col flex-1">
                <label className={labelClass}>{field.name} ({field.unit})</label>
                <span className={subLabelClass}>{field.guide !== 'N/A' && <Info className="h-2 w-2" />} {field.guide}</span>
              </div>
              <div className={inputContainerClass}>
                <input 
                  type="number" 
                  step="any" 
                  className={inputClass} 
                  value={(formData as any)[field.key] ?? ""} 
                  onChange={(e) => handleInputChange(field.key as any, e.target.value)} 
                />
                <button 
                  onClick={() => saveIndividualParam(field.key as any, field.name, field.type, field.unit)}
                  className={cn("p-1.5 rounded transition-colors", savedFields[field.key] ? "text-green-600 bg-green-50" : "text-neutral-300 hover:text-green-600")}
                >
                  {savingFields[field.key] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className={sectionHeaderClass}>
          <span className="text-[10px] font-black uppercase tracking-wider text-black">3. Laboratorio</span>
        </div>
        <div className="px-3">
          {[
            { key: 'plomo', name: 'Plomo (Pb)', unit: 'mg/L', type: 'Metales', guide: '0.05 mg/L (Ley 24.051)' },
            { key: 'cadmio', name: 'Cadmio (Cd)', unit: 'mg/L', type: 'Metales', guide: '0.005 mg/L (Ley 24.051)' },
            { key: 'arsenico', name: 'Arsénico (As)', unit: 'mg/L', type: 'Metales', guide: '0.05 mg/L (Ley 24.051)' },
            { key: 'tph', name: 'TPH (Hidrocarburos)', unit: 'mg/L', type: 'Hidrocarburos', guide: '0.1 mg/L (Dec. 831/93)' }
          ].map((field) => (
            <div key={field.key} className={rowClass}>
              <div className="flex flex-col flex-1">
                <label className={labelClass}>{field.name} ({field.unit})</label>
                <span className={subLabelClass}><Info className="h-2 w-2" /> {field.guide}</span>
              </div>
              <div className={inputContainerClass}>
                <input 
                  type="number" 
                  step="any" 
                  className={inputClass} 
                  value={(formData as any)[field.key] ?? ""} 
                  onChange={(e) => handleInputChange(field.key as any, e.target.value)} 
                />
                <button 
                  onClick={() => saveIndividualParam(field.key as any, field.name, field.type, field.unit)}
                  className={cn("p-1.5 rounded transition-colors", savedFields[field.key] ? "text-green-600 bg-green-50" : "text-neutral-300 hover:text-green-600")}
                >
                  {savingFields[field.key] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-black px-4 py-4 flex items-center justify-between mt-2">
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase text-white leading-none">Cota de Agua Estimada</span>
            <span className="text-[8px] text-neutral-400 font-bold italic mt-1">Metodología: CB - NE</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-xl font-black text-white font-code">
              {cotaAgua !== null ? `${cotaAgua} m` : "—"}
            </div>
            <button 
              onClick={() => saveIndividualParam('cotaAgua', 'Cota de Agua', 'Cálculo', 'm s.n.m.')}
              className={cn("p-1.5 rounded transition-colors", savedFields['cotaAgua'] ? "text-green-400" : "text-neutral-600 hover:text-green-400")}
            >
              {savingFields['cotaAgua'] ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white px-4 py-4">
        <button
          onClick={handleFinalize}
          disabled={isSaving}
          className="w-full bg-neutral-900 hover:bg-black py-4 text-[11px] font-black uppercase tracking-widest text-white transition-all flex items-center justify-center gap-3 rounded-none shadow-md"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Finalizar y Registrar Planilla (Cierre de Reporte)
        </button>
      </div>
    </div>
  );
}