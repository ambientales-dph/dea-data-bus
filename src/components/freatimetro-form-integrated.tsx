
'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { collection, addDoc, serverTimestamp, doc, updateDoc, arrayUnion, query, where, getDocs, orderBy } from 'firebase/firestore';
import { useFirestore, useUser, useDoc, errorEmitter, FirestorePermissionError } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle2, Info, Check, Send, ArrowLeft } from 'lucide-react';
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
  formId: string;
  stationId: string;
  onClose?: () => void;
}

export function FreatimetroFormIntegrated({ reportId, formId, stationId, onClose }: Props) {
  const { toast } = useToast();
  const db = useFirestore();
  const { user } = useUser();
  const [formData, setFormData] = useState<FreatimetroData>(initialFormData);
  const [savingFields, setSavingFields] = useState<Record<string, boolean>>({});
  const [savedFields, setSavedFields] = useState<Record<string, boolean>>({});
  const [isLoadingExisting, setIsLoadingExisting] = useState(true);
  const hasSetInitialId = useRef(false);

  const stationRef = useMemo(() => doc(db, 'stations', stationId), [db, stationId]);
  const { data: stationData } = useDoc(stationRef);

  const analyteToKeyMap: Record<string, keyof FreatimetroData> = {
    'Cota Brocal': 'cotaBrocal',
    'Nivel Estático': 'nivelEstatico',
    'Profundidad Total': 'profundidadTotal',
    'pH': 'ph',
    'Conductividad': 'conductividad',
    'Temperatura': 'temperatura',
    'Plomo (Pb)': 'plomo',
    'Cadmio (Cd)': 'cadmio',
    'Arsénico (As)': 'arsenico',
    'TPH (Hidrocarburos)': 'tph'
  };

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
        
        const newFormData = { ...initialFormData };
        const newSavedFields: Record<string, boolean> = {};

        snapshot.docs.forEach(doc => {
          const data = doc.data();
          const analyte = data.analyte;
          const value = parseFloat(data.value);
          
          const fieldKey = analyteToKeyMap[analyte];
          if (fieldKey && !isNaN(value)) {
            (newFormData as any)[fieldKey] = value;
            newSavedFields[fieldKey] = true;
          }
        });

        setFormData(prev => ({ ...prev, ...newFormData }));
        setSavedFields(newSavedFields);
      } catch (e) {
        console.error("Error fetching", e);
      } finally {
        setIsLoadingExisting(false);
      }
    };

    fetchExistingData();
  }, [db, reportId, formId]);

  useEffect(() => {
    if (stationData?.name && !hasSetInitialId.current && !formData.idPozo) {
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
    if (savedFields[field]) {
      setSavedFields(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const saveIndividualParam = async (key: keyof FreatimetroData | 'cotaAgua', label: string, type: string) => {
    if (!user || !db) return;
    const value = key === 'cotaAgua' ? cotaAgua : formData[key as keyof FreatimetroData];
    if (value === null || value === undefined || value === "") return;

    setSavingFields(prev => ({ ...prev, [key]: true }));
    
    try {
      const q = query(
        collection(db, 'samples'),
        where('reportId', '==', reportId),
        where('formId', '==', formId),
        where('analyte', '==', label)
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
          medium: 'agua_subterranea',
          parameterType: type,
          analyte: label,
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
      setSavedFields(prev => ({ ...prev, [key]: true }));
      toast({ title: "Guardado", description: `${label} actualizado.` });
    } catch (error: any) {
      console.error(error);
    } finally {
      setSavingFields(prev => ({ ...prev, [key]: false }));
    }
  };

  if (isLoadingExisting) {
    return <div className="p-8 text-center text-xs animate-pulse font-bold uppercase">Cargando datos de planilla...</div>;
  }

  const rowClass = "flex items-center justify-between py-2.5 border-b border-neutral-300 hover:bg-neutral-50 transition-colors group";
  const labelClass = "text-[11px] font-black text-black tracking-tight font-headline leading-none";
  const subLabelClass = "text-[9px] text-neutral-600 font-medium leading-tight mt-1";
  const inputClass = "h-7 w-28 border-none bg-transparent px-2 text-[12px] font-code text-black font-bold text-right rounded-none focus:ring-0 outline-none";
  const sectionHeaderClass = "flex items-center bg-neutral-100 px-3 py-1.5 border-y border-neutral-400 mt-2 first:mt-0";

  return (
    <div className="mx-auto w-full border border-neutral-400 bg-white font-body shadow-sm rounded-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="border-b border-neutral-400 bg-neutral-100 px-4 py-2 flex justify-between items-center">
        <div>
          <h1 className="text-xs font-black uppercase tracking-tight text-black font-headline">Freatímetros • FTA-001</h1>
          <p className="text-[9px] text-neutral-600 font-bold uppercase leading-none">Planilla: {formId.substring(0, 8)}</p>
        </div>
      </div>

      <div className="p-0">
        <div className={sectionHeaderClass}><span className="text-[10px] font-black uppercase tracking-wider text-black">1. Identificación y Geometría</span></div>
        <div className="px-3">
          <div className={rowClass}>
            <div className="flex flex-col flex-1"><label className={labelClass}>ID Pozo</label><span className={subLabelClass}>Nombre o identificación técnica</span></div>
            <input type="text" className={inputClass} value={formData.idPozo} onChange={(e) => handleInputChange("idPozo", e.target.value)} />
          </div>
          <div className={rowClass}>
            <div className="flex flex-col flex-1">
              <label className={labelClass}>Cota Brocal (m s.n.m.)</label>
              <span className={subLabelClass}>Elevación del terreno. Referencia: IGM/IGN.</span>
            </div>
            <div className="flex items-center gap-2">
              <input type="number" step="any" className={inputClass} value={formData.cotaBrocal ?? ""} onChange={(e) => handleInputChange("cotaBrocal", e.target.value)} />
              <button onClick={() => saveIndividualParam('cotaBrocal', 'Cota Brocal', 'Geometría')} className={cn("p-1", savedFields['cotaBrocal'] ? "text-green-600" : "text-neutral-300")}>
                {savingFields['cotaBrocal'] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        </div>

        <div className={sectionHeaderClass}><span className="text-[10px] font-black uppercase tracking-wider text-black">2. Mediciones de Campo (In Situ)</span></div>
        <div className="px-3">
          {[
            { key: 'nivelEstatico', name: 'Nivel Estático', unit: 'm', type: 'Campo', desc: 'Profundidad desde brocal. Ley 24.051.' },
            { key: 'ph', name: 'pH', unit: 'upH', type: 'Campo', desc: 'Acidez/Alcalinidad. Dec. 831/93.' },
            { key: 'conductividad', name: 'Conductividad', unit: 'μS/cm', type: 'Campo', desc: 'Salinidad total. Dec. 831/93.' },
            { key: 'temperatura', name: 'Temperatura', unit: '°C', type: 'Campo', desc: 'Temp. del fluido al momento de extracción.' }
          ].map((field) => (
            <div key={field.key} className={rowClass}>
              <div className="flex flex-col flex-1">
                <label className={labelClass}>{field.name} ({field.unit})</label>
                <span className={subLabelClass}>{field.desc}</span>
              </div>
              <div className="flex items-center gap-2">
                <input type="number" step="any" className={inputClass} value={(formData as any)[field.key] ?? ""} onChange={(e) => handleInputChange(field.key as any, e.target.value)} />
                <button onClick={() => saveIndividualParam(field.key as any, field.name, field.type)} className={cn("p-1", savedFields[field.key] ? "text-green-600" : "text-neutral-300")}>
                  {savingFields[field.key] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className={sectionHeaderClass}><span className="text-[10px] font-black uppercase tracking-wider text-black">3. Resultados de Laboratorio</span></div>
        <div className="px-3">
          {[
            { key: 'plomo', name: 'Plomo (Pb)', unit: 'mg/L', type: 'Laboratorio', desc: 'Nivel Guía: 0.05 mg/L. Dec. 831/93.' },
            { key: 'cadmio', name: 'Cadmio (Cd)', unit: 'mg/L', type: 'Laboratorio', desc: 'Nivel Guía: 0.005 mg/L. Dec. 831/93.' },
            { key: 'arsenico', name: 'Arsénico (As)', unit: 'mg/L', type: 'Laboratorio', desc: 'Nivel Guía: 0.05 mg/L. Dec. 831/93.' },
            { key: 'tph', name: 'TPH (Hidrocarburos)', unit: 'mg/L', type: 'Laboratorio', desc: 'Total Petroleum Hydrocarbons. Res. 405/19.' }
          ].map((field) => (
            <div key={field.key} className={rowClass}>
              <div className="flex flex-col flex-1">
                <label className={labelClass}>{field.name}</label>
                <span className={subLabelClass}>{field.desc}</span>
              </div>
              <div className="flex items-center gap-2">
                <input type="number" step="any" className={inputClass} value={(formData as any)[field.key] ?? ""} onChange={(e) => handleInputChange(field.key as any, e.target.value)} />
                <button onClick={() => saveIndividualParam(field.key as any, field.name, field.type)} className={cn("p-1", savedFields[field.key] ? "text-green-600" : "text-neutral-300")}>
                  {savingFields[field.key] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-black px-4 py-4 flex items-center justify-between mt-2">
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase text-white">Cota de Agua Estimada</span>
            <span className="text-[8px] font-bold text-neutral-400">Cálculo: CB - NE (m s.n.m.)</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xl font-black text-white font-code">{cotaAgua !== null ? `${cotaAgua} m` : "—"}</span>
            <button onClick={() => saveIndividualParam('cotaAgua', 'Cota de Agua', 'Cálculo')} className={cn("p-1", savedFields['cotaAgua'] ? "text-green-400" : "text-neutral-600")}>
              {savingFields['cotaAgua'] ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white p-4">
        <button onClick={onClose} className="w-full bg-neutral-900 hover:bg-black py-4 text-[11px] font-black uppercase tracking-widest text-white shadow-md">Finalizar y Cerrar Planilla</button>
      </div>
    </div>
  );
}
