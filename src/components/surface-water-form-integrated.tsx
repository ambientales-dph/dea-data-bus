'use client';

import { useState, useMemo, useEffect } from 'react';
import { collection, addDoc, serverTimestamp, doc, updateDoc, arrayUnion, query, where, getDocs } from 'firebase/firestore';
import { useFirestore, useUser, useDoc } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Check, CheckCircle2, Clock, User } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SurfaceWaterData {
  [key: string]: string | number | null;
}

interface Props {
  reportId: string;
  formId: string;
  stationId: string;
  onClose?: () => void;
}

export function SurfaceWaterFormIntegrated({ reportId, formId, stationId, onClose }: Props) {
  const { toast } = useToast();
  const db = useFirestore();
  const { user } = useUser();
  const [formData, setFormData] = useState<SurfaceWaterData>({});
  const [savingFields, setSavingFields] = useState<Record<string, boolean>>({});
  const [savedFields, setSavedFields] = useState<Record<string, boolean>>({});
  const [isLoadingExisting, setIsLoadingExisting] = useState(true);
  const [metadata, setMetadata] = useState<{ user?: string, timestamp?: any }>({});

  const stationRef = useMemo(() => doc(db, 'stations', stationId), [db, stationId]);
  const { data: stationData } = useDoc(stationRef);

  const sections = [
    {
      title: "1. Fisicoquímicos y Sólidos",
      params: [
        { name: "Turbidez/Turbiedad", unit: "NTU", cat: "Fisicoquímico", desc: "Monitoreo. Ley 24.051 / Dec. 831/93." },
        { name: "Sólidos Suspendidos", unit: "mg/l", cat: "Sólidos", desc: "Nivel Guía: 100 mg/l (Dec. 831/93)." },
        { name: "Sólidos totales", unit: "mg/l", cat: "Sólidos", desc: "Ref. Dec. 831/93 / Res. ADA (Prov. BA)." },
        { name: "Dureza Total", unit: "mg/l", cat: "Fisicoquímico", desc: "Variable segun geología de cuenca." },
        { name: "Alcalinidad Tot", unit: "mg/l", cat: "Fisicoquímico", desc: "Indicador de capacidad tampón del agua." }
      ]
    },
    {
      title: "2. Nutrientes y Materia Orgánica",
      params: [
        { name: "Nitrógeno Amoniacal", unit: "mg/l", cat: "Nutrientes", desc: "Nivel Guía: 0.02 mg/l (Dec. 831/93)." },
        { name: "Nitrógeno total", unit: "mg/l", cat: "Nutrientes", desc: "Indicador de eutrofización. Dec. 831/93." },
        { name: "Fosforo total", unit: "mg/l", cat: "Nutrientes", desc: "Nivel Guía: 0.025 mg/l (lagos) Dec. 831/93." },
        { name: "Clorofila a", unit: "ug/l", cat: "Biología", desc: "Biomasa algal. Ref. ADA (Prov. BA)." },
        { name: "DBO5", unit: "mg/l", cat: "Orgánicos", desc: "Guía: 5 mg/l (Vida acuática) Dec. 831/93." },
        { name: "DQO", unit: "mg/l", cat: "Orgánicos", desc: "Ref: ADA (Prov. BA) / Dec. 831/93." }
      ]
    },
    {
      title: "3. Microbiología y Biología",
      params: [
        { name: "Coliformes totales", unit: "3NMP/100ml", cat: "Microbiología", desc: "Guía: 1000/100ml (Recreativo) Dec. 831/93." },
        { name: "Escherichia coli", unit: "3NMP/100ml", cat: "Microbiología", desc: "Indicador fecal. Dec. 831/93 / Res. ADA." }
      ]
    },
    {
      title: "4. Metales",
      params: [
        { name: "Arsenico", unit: "mg/l", cat: "Metales", desc: "Nivel Guía: 0.05 mg/l. Dec. 831/93." },
        { name: "Cadmio", unit: "ug/l", cat: "Metales", desc: "Nivel Guía: 0.2-2 ug/l según dureza. Dec. 831/93." },
        { name: "Cromo", unit: "mg/l", cat: "Metales", desc: "Nivel Guía: 0.05 mg/l (Cr VI) Dec. 831/93." },
        { name: "Plomo", unit: "mg/l", cat: "Metales", desc: "Nivel Guía: 0.05 mg/l. Dec. 831/93." },
        { name: "Zinc", unit: "mg/l", cat: "Metales", desc: "Nivel Guía: 0.1 mg/l. Dec. 831/93." }
      ]
    },
    {
      title: "5. Iones y Otros",
      params: [
        { name: "Cloruros", unit: "mg/l", cat: "Iones", desc: "Nivel Guía: 250 mg/l (Bebida) Dec. 831/93." },
        { name: "Sulfatos", unit: "mg/l", cat: "Iones", desc: "Nivel Guía: 250 mg/l (Bebida) Dec. 831/93." },
        { name: "Nitratos", unit: "mg/l", cat: "Iones", desc: "Nivel Guía: 10 mg/l (como N) Dec. 831/93." },
        { name: "Nitritos", unit: "mg/l", cat: "Iones", desc: "Nivel Guía: 1 mg/l (como N) Dec. 831/93." },
        { name: "Sodio", unit: "mg/l", cat: "Iones", desc: "Ref. Dec. 831/93 / ADA (Prov. BA)." },
        { name: "Glifosato", unit: "mg/l", cat: "Plaguicidas", desc: "Ref. Dec. 831/93 / Res. ADA." }
      ]
    }
  ];

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
        
        const newFormData: SurfaceWaterData = {};
        const newSavedFields: Record<string, boolean> = {};
        let foundMetadata = { user: user?.email || '', timestamp: null };

        snapshot.docs.forEach(doc => {
          const data = doc.data();
          newFormData[data.analyte] = data.value;
          newSavedFields[data.analyte] = true;
          
          if (!foundMetadata.timestamp || (data.timestamp && data.timestamp.toMillis() < foundMetadata.timestamp.toMillis())) {
            foundMetadata = { user: data.userEmail || user?.email || '', timestamp: data.timestamp };
          }
        });

        setFormData(newFormData);
        setSavedFields(newSavedFields);
        setMetadata(foundMetadata);
      } catch (e) {
        console.error("Error fetching", e);
      } finally {
        setIsLoadingExisting(false);
      }
    };

    fetchExistingData();
  }, [db, reportId, formId]);

  const handleInputChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    if (savedFields[name]) {
      setSavedFields(prev => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const saveIndividualParam = async (name: string, category: string) => {
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
          medium: 'agua_superficial',
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
          <h1 className="text-xs font-black uppercase tracking-tight text-black font-headline">Agua Superficial • AS-001</h1>
          <div className="flex flex-col gap-0.5 mt-0.5">
            <p className="text-[9px] text-neutral-600 font-bold uppercase leading-none">ID: {formId.substring(0, 8)}</p>
            <div className="flex items-center gap-3 text-[9px] text-black font-black uppercase tracking-tighter">
              <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> {formatTimestamp(metadata.timestamp)}</span>
              <span className="flex items-center gap-1"><User className="h-2.5 w-2.5" /> {metadata.user || user?.email}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-0">
        {sections.map((section, sIdx) => (
          <div key={sIdx}>
            <div className={sectionHeaderClass}>
              <span className="text-[10px] font-black uppercase tracking-wider text-black">{section.title}</span>
            </div>
            <div className="px-3">
              {section.params.map((param, pIdx) => (
                <div key={pIdx} className={rowClass}>
                  <div className="flex flex-col flex-1">
                    <label className={labelClass}>{param.name}</label>
                    <span className={subLabelClass}>{param.desc}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input 
                      type="text" 
                      className={inputClass} 
                      value={formData[param.name] ?? ""} 
                      onChange={(e) => handleInputChange(param.name, e.target.value)} 
                      placeholder="---"
                    />
                    <button 
                      onClick={() => saveIndividualParam(param.name, param.cat)} 
                      className={cn("p-1 transition-colors", savedFields[param.name] ? "text-green-600" : "text-black hover:text-primary")}
                    >
                      {savingFields[param.name] ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : savedFields[param.name] ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white p-4">
        <button onClick={onClose} className="w-full bg-neutral-900 hover:bg-black py-4 text-[11px] font-black uppercase tracking-widest text-white shadow-md">Finalizar y Cerrar Planilla</button>
      </div>
    </div>
  );
}
