'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { collection, addDoc, serverTimestamp, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { useFirestore, useUser, useDoc, errorEmitter, FirestorePermissionError } from '@/firebase';
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
  const hasSetInitialId = useRef(false);

  // Obtener datos de la estación para el ID de Pozo sugerido
  const stationRef = useMemo(() => doc(db, 'stations', stationId), [db, stationId]);
  const { data: stationData } = useDoc(stationRef);

  // Pre-completar ID Pozo con el nombre de la estación
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
          const sampleData = {
            medium: 'agua_subterranea',
            parameterType: m.type,
            analyte: m.name,
            value: `${val}`,
            reportId,
            stationId,
            userId: user.uid,
            userEmail: user.email,
            timestamp: serverTimestamp(),
          };
          
          addDoc(samplesCol, sampleData).catch(async (error) => {
            const permissionError = new FirestorePermissionError({
              path: 'samples',
              operation: 'create',
              requestResourceData: sampleData,
            });
            errorEmitter.emit('permission-error', permissionError);
          });
          count++;
        }
      }

      if (cotaAgua !== null) {
        const cotaData = {
          medium: 'agua_subterranea',
          parameterType: 'Cálculo',
          analyte: 'Cota de Agua',
          value: `${cotaAgua}`,
          reportId,
          stationId,
          userId: user.uid,
          userEmail: user.email,
          timestamp: serverTimestamp(),
        };
        addDoc(samplesCol, cotaData).catch(async (error) => {
          const permissionError = new FirestorePermissionError({
            path: 'samples',
            operation: 'create',
            requestResourceData: cotaData,
          });
          errorEmitter.emit('permission-error', permissionError);
        });
        count++;
      }

      if (count > 0) {
        await updateDoc(reportRef, { editors: arrayUnion(user.email) });
        toast({ title: "Datos registrados", description: `Se guardaron ${count} parámetros en el reporte.` });
        setFormData({ ...initialFormData, idPozo: stationData?.name || "" });
        onSuccess?.();
      }
    } catch (e: any) {
      console.error(e);
      toast({ variant: "destructive", title: "Error", description: "No se pudieron guardar los datos." });
    } finally {
      setIsSaving(false);
    }
  };

  const rowClass = "flex items-start justify-between py-2.5 border-b border-neutral-300 hover:bg-neutral-50 transition-colors";
  const labelClass = "text-[11px] font-black text-black tracking-tight font-headline leading-none";
  const subLabelClass = "text-[9px] text-neutral-600 font-bold leading-tight mt-1 flex items-center gap-1";
  const inputContainerClass = "w-40 flex items-center gap-1.5 justify-end";
  const inputClass = "h-7 border-none bg-transparent px-2 text-[12px] focus:ring-0 focus:outline-none font-code text-black font-bold text-right rounded-none placeholder:text-neutral-300";
  const sectionHeaderClass = "flex items-center bg-neutral-100 px-3 py-1.5 border-y border-neutral-400 mt-2 first:mt-0";

  return (
    <div className="mx-auto w-full border border-neutral-400 bg-white font-body shadow-sm rounded-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Header Compacto de Alto Contraste */}
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
        {/* Sección 1 */}
        <div className={sectionHeaderClass}>
          <span className="text-[10px] font-black uppercase tracking-wider text-black">1. Datos de Identificación</span>
        </div>
        <div className="px-3">
          <div className={rowClass}>
            <div className="flex flex-col flex-1 pr-4">
              <label className={labelClass}>ID Pozo</label>
              <span className={subLabelClass}>Identificación Técnica de Campo</span>
            </div>
            <div className={inputContainerClass}>
              <input type="text" className={cn(inputClass, "w-full")} placeholder="ID Sugerido" value={formData.idPozo} onChange={(e) => handleInputChange("idPozo", e.target.value)} />
            </div>
          </div>
          <div className={rowClass}>
            <div className="flex flex-col flex-1 pr-4">
              <label className={labelClass}>Coord. X (UTM Este)</label>
              <span className={subLabelClass}>Sistema de Referencia WGS84</span>
            </div>
            <div className={inputContainerClass}>
              <input type="number" step="any" className={cn(inputClass, "w-full")} value={formData.coordenadaX ?? ""} onChange={(e) => handleInputChange("coordenadaX", e.target.value)} />
            </div>
          </div>
          <div className={rowClass}>
            <div className="flex flex-col flex-1 pr-4">
              <label className={labelClass}>Coord. Y (UTM Norte)</label>
              <span className={subLabelClass}>Sistema de Referencia WGS84</span>
            </div>
            <div className={inputContainerClass}>
              <input type="number" step="any" className={cn(inputClass, "w-full")} value={formData.coordenadaY ?? ""} onChange={(e) => handleInputChange("coordenadaY", e.target.value)} />
            </div>
          </div>
          <div className={rowClass}>
            <div className="flex flex-col flex-1 pr-4">
              <label className={labelClass}>Cota Brocal (m s.n.m.)</label>
              <span className={subLabelClass}>Elevación sobre nivel del mar</span>
            </div>
            <div className={inputContainerClass}>
              <input type="number" step="any" className={cn(inputClass, "w-full")} value={formData.cotaBrocal ?? ""} onChange={(e) => handleInputChange("cotaBrocal", e.target.value)} />
            </div>
          </div>
          <div className={rowClass}>
            <div className="flex flex-col flex-1 pr-4">
              <label className={labelClass}>Fecha y Hora</label>
              <span className={subLabelClass}>Momento del Muestreo</span>
            </div>
            <div className="w-48 flex items-center justify-end">
              <input type="datetime-local" className={cn(inputClass, "w-full")} value={formData.fechaHora} onChange={(e) => handleInputChange("fechaHora", e.target.value)} />
            </div>
          </div>
        </div>

        {/* Sección 2 */}
        <div className={sectionHeaderClass}>
          <span className="text-[10px] font-black uppercase tracking-wider text-black">2. Mediciones In Situ</span>
        </div>
        <div className="px-3">
          <div className={rowClass}>
            <div className="flex flex-col flex-1 pr-4">
              <label className={labelClass}>Nivel Estático (m)</label>
              <span className={subLabelClass}>Medición desde brocal</span>
            </div>
            <div className={inputContainerClass}>
              <input type="number" step="any" className={cn(inputClass, "w-full")} value={formData.nivelEstatico ?? ""} onChange={(e) => handleInputChange("nivelEstatico", e.target.value)} />
            </div>
          </div>
          <div className={rowClass}>
            <div className="flex flex-col flex-1 pr-4">
              <label className={labelClass}>Profundidad Total (m)</label>
              <span className={subLabelClass}>Hasta fondo del pozo</span>
            </div>
            <div className={inputContainerClass}>
              <input type="number" step="any" className={cn(inputClass, "w-full")} value={formData.profundidadTotal ?? ""} onChange={(e) => handleInputChange("profundidadTotal", e.target.value)} />
            </div>
          </div>
          <div className={rowClass}>
            <div className="flex flex-col flex-1 pr-4">
              <label className={labelClass}>pH (Unid. pH)</label>
              <span className={subLabelClass}><Info className="h-2 w-2" /> Nivel Guía: 6.5 - 8.5 • Ley 24.051</span>
            </div>
            <div className={inputContainerClass}>
              <input type="number" step="0.01" min="0" max="14" className={cn(inputClass, "w-full")} value={formData.ph ?? ""} onChange={(e) => handleInputChange("ph", e.target.value)} />
            </div>
          </div>
          <div className={rowClass}>
            <div className="flex flex-col flex-1 pr-4">
              <label className={labelClass}>Conductividad (μS/cm)</label>
              <span className={subLabelClass}>Salinidad estimada in situ</span>
            </div>
            <div className={inputContainerClass}>
              <input type="number" step="any" className={cn(inputClass, "w-full")} value={formData.conductividad ?? ""} onChange={(e) => handleInputChange("conductividad", e.target.value)} />
            </div>
          </div>
          <div className={rowClass}>
            <div className="flex flex-col flex-1 pr-4">
              <label className={labelClass}>Temperatura (°C)</label>
              <span className={subLabelClass}>Compensación térmica</span>
            </div>
            <div className={inputContainerClass}>
              <input type="number" step="0.1" className={cn(inputClass, "w-full")} value={formData.temperatura ?? ""} onChange={(e) => handleInputChange("temperatura", e.target.value)} />
            </div>
          </div>
        </div>

        {/* Sección 3 */}
        <div className={sectionHeaderClass}>
          <span className="text-[10px] font-black uppercase tracking-wider text-black">3. Laboratorio</span>
        </div>
        <div className="px-3">
          <div className={rowClass}>
            <div className="flex flex-col flex-1 pr-4">
              <label className={labelClass}>Plomo (Pb) - mg/L</label>
              <span className={subLabelClass}><Info className="h-2 w-2" /> Nivel Guía: 0.05 mg/L • Ley 24.051</span>
            </div>
            <div className={inputContainerClass}>
              <input type="number" step="any" className={cn(inputClass, "w-full")} value={formData.plomo ?? ""} onChange={(e) => handleInputChange("plomo", e.target.value)} />
            </div>
          </div>
          <div className={rowClass}>
            <div className="flex flex-col flex-1 pr-4">
              <label className={labelClass}>Cadmio (Cd) - mg/L</label>
              <span className={subLabelClass}><Info className="h-2 w-2" /> Nivel Guía: 0.005 mg/L • Ley 24.051</span>
            </div>
            <div className={inputContainerClass}>
              <input type="number" step="any" className={cn(inputClass, "w-full")} value={formData.cadmio ?? ""} onChange={(e) => handleInputChange("cadmio", e.target.value)} />
            </div>
          </div>
          <div className={rowClass}>
            <div className="flex flex-col flex-1 pr-4">
              <label className={labelClass}>Arsénico (As) - mg/L</label>
              <span className={subLabelClass}><Info className="h-2 w-2" /> Nivel Guía: 0.05 mg/L • Ley 24.051</span>
            </div>
            <div className={inputContainerClass}>
              <input type="number" step="any" className={cn(inputClass, "w-full")} value={formData.arsenico ?? ""} onChange={(e) => handleInputChange("arsenico", e.target.value)} />
            </div>
          </div>
          <div className={rowClass}>
            <div className="flex flex-col flex-1 pr-4">
              <label className={labelClass}>TPH (Hidrocarburos) - mg/L</label>
              <span className={subLabelClass}><Info className="h-2 w-2" /> Nivel Guía: 0.1 mg/L • Dec. 831/93</span>
            </div>
            <div className={inputContainerClass}>
              <input type="number" step="any" className={cn(inputClass, "w-full")} value={formData.tph ?? ""} onChange={(e) => handleInputChange("tph", e.target.value)} />
            </div>
          </div>
        </div>

        {/* Sección 4 - Resultado */}
        <div className="bg-black px-4 py-4 flex items-center justify-between mt-2">
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase text-white leading-none">Cota de Agua Estimada</span>
            <span className="text-[8px] text-neutral-400 font-bold italic mt-1">Metodología de Cálculo: CB - NE</span>
          </div>
          <div className="text-xl font-black text-white font-code">
            {cotaAgua !== null ? `${cotaAgua} m` : "—"}
          </div>
        </div>
      </div>

      {/* Acción */}
      <div className="bg-white px-4 py-4">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full bg-neutral-900 hover:bg-black py-4 text-[11px] font-black uppercase tracking-widest text-white transition-all flex items-center justify-center gap-3 rounded-none shadow-md"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Finalizar y Registrar Planilla Técnica
        </button>
      </div>
    </div>
  );
}