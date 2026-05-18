'use client';

import { useState, useMemo } from 'react';
import { collection, addDoc, serverTimestamp, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { useFirestore, useUser, errorEmitter, FirestorePermissionError } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle2, Info } from 'lucide-react';
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

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);

    try {
      const samplesCol = collection(db, 'samples');
      const reportRef = doc(db, 'reports', reportId);
      
      const mappings = [
        { key: 'nivelEstatico', name: 'Nivel Estático', type: 'Físico', unit: 'm' },
        { key: 'profundidadTotal', name: 'Profundidad Total', type: 'Físico', unit: 'm' },
        { key: 'ph', name: 'pH', type: 'Fisicoquímico', unit: 'pH' },
        { key: 'conductividad', name: 'Conductividad', type: 'Fisicoquímico', unit: 'μS/cm' },
        { key: 'temperatura', name: 'Temperatura', type: 'Fisicoquímico', unit: '°C' },
        { key: 'plomo', name: 'Plomo (Pb)', type: 'Metales', unit: 'mg/L' },
        { key: 'cadmio', name: 'Cadmio (Cd)', type: 'Metales', unit: 'mg/L' },
        { key: 'arsenico', name: 'Arsénico (As)', type: 'Metales', unit: 'mg/L' },
        { key: 'tph', name: 'TPH', type: 'Hidrocarburos', unit: 'mg/L' },
      ];

      let count = 0;
      for (const m of mappings) {
        const val = (formData as any)[m.key];
        if (val !== null && val !== undefined && val !== "") {
          await addDoc(samplesCol, {
            medium: 'agua_subterranea',
            parameterType: m.type,
            analyte: m.name,
            value: `${val}`,
            reportId,
            stationId,
            userId: user.uid,
            userEmail: user.email,
            timestamp: serverTimestamp(),
          });
          count++;
        }
      }

      if (cotaAgua !== null) {
        await addDoc(samplesCol, {
          medium: 'agua_subterranea',
          parameterType: 'Cálculo',
          analyte: 'Cota de Agua',
          value: `${cotaAgua}`,
          reportId,
          stationId,
          userId: user.uid,
          userEmail: user.email,
          timestamp: serverTimestamp(),
        });
        count++;
      }

      if (count > 0) {
        await updateDoc(reportRef, { editors: arrayUnion(user.email) });
        toast({ title: "Datos registrados", description: `Se guardaron ${count} parámetros en el reporte.` });
        setFormData(initialFormData);
        onSuccess?.();
      }
    } catch (e: any) {
      console.error(e);
      toast({ variant: "destructive", title: "Error", description: "No se pudieron guardar los datos." });
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass = "h-9 border-neutral-400 bg-white px-3 text-sm focus:ring-2 focus:ring-primary focus:border-primary font-body transition-all text-black font-bold";
  const labelClass = "text-[11px] font-black text-black uppercase tracking-wider font-headline mb-1 block";
  const sectionHeaderClass = "flex items-center border-b border-neutral-400 bg-neutral-200 px-3 py-2";
  const sectionNumberClass = "mr-2 flex h-6 w-6 items-center justify-center bg-black text-[12px] font-black text-white rounded-full";

  return (
    <div className="mx-auto w-full border-2 border-neutral-500 bg-white font-body shadow-2xl rounded-xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Header - High Contrast */}
      <div className="border-b-2 border-neutral-500 bg-neutral-100 px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black uppercase tracking-tighter text-black font-headline leading-none">
              Planilla Técnica Ambiental
            </h1>
            <p className="text-[12px] text-neutral-800 font-bold uppercase mt-1">
              Muestreo de Freatímetros • Pozos de Monitoreo
            </p>
          </div>
          <div className="text-right text-[10px] text-neutral-700 font-black uppercase leading-tight">
            <p>Formulario FTA-001</p>
            <p>Versión 2024.1</p>
          </div>
        </div>
      </div>

      {/* Sección 1 */}
      <div className="border-b-2 border-neutral-400">
        <div className={sectionHeaderClass}>
          <span className={sectionNumberClass}>1</span>
          <span className="text-[12px] font-black uppercase tracking-widest text-black">Ubicación y Datos de Pozo</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 divide-x-2 divide-neutral-400">
          <div className="p-3 border-b-2 md:border-b-0 border-neutral-400">
            <label className={labelClass}>ID Pozo</label>
            <input type="text" className={cn(inputClass, "w-full border-2 rounded-md")} placeholder="PM-001" value={formData.idPozo} onChange={(e) => handleInputChange("idPozo", e.target.value)} />
          </div>
          <div className="p-3 border-b-2 md:border-b-0 border-neutral-400">
            <label className={labelClass}>Coord. X (UTM)</label>
            <input type="number" step="any" className={cn(inputClass, "w-full border-2 rounded-md font-code")} placeholder="Este" value={formData.coordenadaX ?? ""} onChange={(e) => handleInputChange("coordenadaX", e.target.value)} />
          </div>
          <div className="p-3 border-b-2 md:border-b-0 border-neutral-400">
            <label className={labelClass}>Coord. Y (UTM)</label>
            <input type="number" step="any" className={cn(inputClass, "w-full border-2 rounded-md font-code")} placeholder="Norte" value={formData.coordenadaY ?? ""} onChange={(e) => handleInputChange("coordenadaY", e.target.value)} />
          </div>
          <div className="p-3 border-neutral-400">
            <label className={labelClass}>Cota Brocal</label>
            <input type="number" step="any" className={cn(inputClass, "w-full border-2 rounded-md font-code")} placeholder="m s.n.m." value={formData.cotaBrocal ?? ""} onChange={(e) => handleInputChange("cotaBrocal", e.target.value)} />
          </div>
          <div className="col-span-2 p-3 border-neutral-400">
            <label className={labelClass}>Fecha / Hora</label>
            <input type="datetime-local" className={cn(inputClass, "w-full border-2 rounded-md")} value={formData.fechaHora} onChange={(e) => handleInputChange("fechaHora", e.target.value)} />
          </div>
        </div>
      </div>

      {/* Sección 2 */}
      <div className="border-b-2 border-neutral-400">
        <div className={sectionHeaderClass}>
          <span className={sectionNumberClass}>2</span>
          <span className="text-[12px] font-black uppercase tracking-widest text-black">Mediciones de Campo</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 divide-x-2 divide-neutral-400">
          <div className="p-3 border-b-2 md:border-b-0 border-neutral-400">
            <label className={labelClass}>Nivel Estático</label>
            <input type="number" step="any" className={cn(inputClass, "w-full border-2 rounded-md font-code")} placeholder="m" value={formData.nivelEstatico ?? ""} onChange={(e) => handleInputChange("nivelEstatico", e.target.value)} />
          </div>
          <div className="p-3 border-b-2 md:border-b-0 border-neutral-400">
            <label className={labelClass}>Prof. Total</label>
            <input type="number" step="any" className={cn(inputClass, "w-full border-2 rounded-md font-code")} placeholder="m" value={formData.profundidadTotal ?? ""} onChange={(e) => handleInputChange("profundidadTotal", e.target.value)} />
          </div>
          <div className="p-3 border-b-2 md:border-b-0 border-neutral-400">
            <label className={labelClass}>pH</label>
            <input type="number" step="0.01" min="0" max="14" className={cn(inputClass, "w-full border-2 rounded-md font-code")} placeholder="0-14" value={formData.ph ?? ""} onChange={(e) => handleInputChange("ph", e.target.value)} />
          </div>
          <div className="p-3 border-neutral-400">
            <label className={labelClass}>Conductividad</label>
            <input type="number" step="any" className={cn(inputClass, "w-full border-2 rounded-md font-code")} placeholder="μS/cm" value={formData.conductividad ?? ""} onChange={(e) => handleInputChange("conductividad", e.target.value)} />
          </div>
          <div className="p-3 border-neutral-400">
            <label className={labelClass}>Temperatura</label>
            <input type="number" step="0.1" className={cn(inputClass, "w-full border-2 rounded-md font-code")} placeholder="°C" value={formData.temperatura ?? ""} onChange={(e) => handleInputChange("temperatura", e.target.value)} />
          </div>
        </div>
      </div>

      {/* Sección 3 */}
      <div className="border-b-2 border-neutral-400">
        <div className={sectionHeaderClass}>
          <span className={sectionNumberClass}>3</span>
          <span className="text-[12px] font-black uppercase tracking-widest text-black">Resultados de Laboratorio</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 divide-x-2 divide-neutral-400">
          <div className="p-4 border-b-2 md:border-b-0 border-neutral-400">
            <p className="mb-3 text-[10px] font-black uppercase text-black tracking-[0.2em]">Metales Pesados (mg/L)</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Pb</label>
                <input type="number" step="any" className={cn(inputClass, "w-full border-2 rounded-md font-code")} placeholder="mg/L" value={formData.plomo ?? ""} onChange={(e) => handleInputChange("plomo", e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Cd</label>
                <input type="number" step="any" className={cn(inputClass, "w-full border-2 rounded-md font-code")} placeholder="mg/L" value={formData.cadmio ?? ""} onChange={(e) => handleInputChange("cadmio", e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>As</label>
                <input type="number" step="any" className={cn(inputClass, "w-full border-2 rounded-md font-code")} placeholder="mg/L" value={formData.arsenico ?? ""} onChange={(e) => handleInputChange("arsenico", e.target.value)} />
              </div>
            </div>
          </div>
          <div className="p-4 border-neutral-400">
            <p className="mb-3 text-[10px] font-black uppercase text-black tracking-[0.2em]">Hidrocarburos (mg/L)</p>
            <div>
              <label className={labelClass}>TPH</label>
              <input type="number" step="any" className={cn(inputClass, "w-full border-2 rounded-md font-code")} placeholder="mg/L" value={formData.tph ?? ""} onChange={(e) => handleInputChange("tph", e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {/* Sección 4 - Cálculos Críticos */}
      <div className="border-b-2 border-neutral-500">
        <div className={sectionHeaderClass}>
          <span className={sectionNumberClass}>4</span>
          <span className="text-[12px] font-black uppercase tracking-widest text-black">Cálculos e Indicadores</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x-2 divide-neutral-500 bg-neutral-50">
          <div className="p-3">
            <label className={labelClass}>Cota Brocal</label>
            <div className="h-10 flex items-center bg-white border-2 border-neutral-400 px-3 text-sm font-black font-code rounded-md shadow-sm">
              {formData.cotaBrocal ?? "—"}
            </div>
          </div>
          <div className="p-3">
            <label className={labelClass}>Nivel Estático</label>
            <div className="h-10 flex items-center bg-white border-2 border-neutral-400 px-3 text-sm font-black font-code rounded-md shadow-sm">
              {formData.nivelEstatico ?? "—"}
            </div>
          </div>
          <div className="p-3">
            <label className={labelClass}>Fórmula</label>
            <div className="h-10 flex items-center bg-neutral-100 border-2 border-dashed border-neutral-400 px-3 text-[11px] text-black font-black italic rounded-md">
              CB - NE
            </div>
          </div>
          <div className="p-3 bg-accent/10">
            <label className={cn(labelClass, "text-accent font-black")}>Cota de Agua</label>
            <div className="h-10 flex items-center border-2 border-accent bg-accent/20 px-3 font-code text-sm font-black text-accent rounded-md shadow-[inset_0_1px_4px_rgba(0,0,0,0.1)]">
              {cotaAgua !== null ? `${cotaAgua} m s.n.m.` : "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Footer - Alta visibilidad */}
      <div className="flex flex-col md:flex-row items-center justify-between bg-neutral-200 px-4 py-5 gap-4">
        <div className="flex items-center gap-2 text-[10px] text-black font-black italic">
          <Info className="h-4 w-4 shrink-0" />
          <span>* VALORES DE REFERENCIA SEGÚN NIVEL GUÍA VIGENTE.</span>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full md:w-auto bg-black hover:bg-neutral-800 px-10 py-3 text-[12px] font-black uppercase tracking-[0.2em] text-white transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3 rounded-lg border-2 border-black"
        >
          {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
          Guardar Planilla Técnica
        </button>
      </div>
    </div>
  );
}
