'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp, query, where, orderBy, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { useFirestore, useStorage, useUser, useCollection } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Camera, Image as ImageIcon, Loader2, Trash2, CloudOff, Cloud, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { compressImage } from '@/lib/image-processing';
import { offlineStorage, OfflinePhoto } from '@/lib/offline-storage';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface PhotoRegistryProps {
  reportId: string;
  formId: string;
  stationId: string;
  medium: string;
}

export function PhotoRegistry({ reportId, formId, stationId, medium }: PhotoRegistryProps) {
  const db = useFirestore();
  const storage = useStorage();
  const { user, loading: authLoading } = useUser();
  const { toast } = useToast();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingPhotos, setPendingPhotos] = useState<OfflinePhoto[]>([]);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Bloqueo estricto de la consulta hasta que la auth esté lista
  const photosQuery = useMemo(() => {
    // Si estamos cargando auth o no hay usuario, devolvemos null para pausar el hook useCollection
    if (!db || authLoading || !user || !reportId || !formId) return null;
    
    return query(
      collection(db, 'samples'),
      where('reportId', '==', reportId),
      where('formId', '==', formId),
      where('parameterType', '==', 'Fotografía'),
      orderBy('timestamp', 'desc')
    );
  }, [db, user, authLoading, reportId, formId]);

  const { data: uploadedPhotos, loading: loadingPhotos } = useCollection(photosQuery);

  useEffect(() => {
    const handleStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', handleStatus);
    window.addEventListener('offline', handleStatus);
    
    const loadPending = async () => {
      const pending = await offlineStorage.getPendingPhotos(formId);
      setPendingPhotos(pending);
    };
    loadPending();

    return () => {
      window.removeEventListener('online', handleStatus);
      window.removeEventListener('offline', handleStatus);
    };
  }, [formId]);

  // 2. Early Return: Si la auth está cargando, mostramos un estado neutro
  if (authLoading) {
    return (
      <div className="mt-6 space-y-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded-full" />
          <Skeleton className="h-3 w-32" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Skeleton className="aspect-square w-full" />
          <Skeleton className="aspect-square w-full" />
        </div>
      </div>
    );
  }

  const handleCaptureClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsProcessing(true);
    try {
      const compressed = await compressImage(file);
      const fileName = `${Date.now()}_${file.name}`;
      const photoId = crypto.randomUUID();

      if (navigator.onLine) {
        await uploadAndRegister(compressed, fileName, photoId);
      } else {
        const offlinePhoto: OfflinePhoto = {
          id: photoId,
          reportId,
          formId,
          stationId,
          medium,
          file: compressed,
          fileName,
          timestamp: Date.now()
        };
        await offlineStorage.savePhoto(offlinePhoto);
        setPendingPhotos(prev => [...prev, offlinePhoto]);
        toast({
          title: "Modo Offline",
          description: "Foto guardada localmente. Se subirá cuando recuperes señal.",
        });
      }
    } catch (error) {
      console.error('Error en proceso de foto:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo procesar la fotografía.",
      });
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const uploadAndRegister = async (file: Blob, fileName: string, id: string) => {
    if (!user || !storage || !db) return;

    const storagePath = `reports/${reportId}/${formId}/${fileName}`;
    const storageRef = ref(storage, storagePath);
    const uploadResult = await uploadBytes(storageRef, file);
    const downloadUrl = await getDownloadURL(uploadResult.ref);

    const photoDoc = {
      reportId,
      formId,
      stationId,
      medium,
      parameterType: "Fotografía",
      analyte: "Evidencia Visual",
      value: downloadUrl,
      timestamp: serverTimestamp(),
      userId: user.uid,
      userEmail: user.email
    };

    // No bloqueamos la UI esperando Firestore
    addDoc(collection(db, 'samples'), photoDoc)
      .then(() => {
        updateDoc(doc(db, 'reports', reportId), { editors: arrayUnion(user.email) });
      })
      .catch(console.error);
    
    await offlineStorage.removePhoto(id);
    setPendingPhotos(prev => prev.filter(p => p.id !== id));
    
    toast({
      title: "Foto sincronizada",
      description: "La evidencia visual se guardó correctamente.",
    });
  };

  const syncPending = async () => {
    if (!navigator.onLine || pendingPhotos.length === 0) return;
    
    setIsProcessing(true);
    let successCount = 0;
    
    for (const photo of pendingPhotos) {
      try {
        await uploadAndRegister(photo.file, photo.fileName, photo.id);
        successCount++;
      } catch (e) {
        console.error('Fallo sincronización de foto:', photo.id, e);
      }
    }
    
    setIsProcessing(false);
    if (successCount > 0) {
      toast({ title: "Sincronización completa", description: `${successCount} fotos subidas.` });
    }
  };

  const removePending = async (id: string) => {
    await offlineStorage.removePhoto(id);
    setPendingPhotos(prev => prev.filter(p => p.id !== id));
    toast({ description: "Foto pendiente eliminada." });
  };

  return (
    <Card className="border-t-4 border-t-accent shadow-md overflow-hidden rounded-none mt-6">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-black" />
            <h3 className="text-[11px] font-black uppercase tracking-widest text-black font-headline">Registro Fotográfico</h3>
          </div>
          
          <div className="flex items-center gap-2">
            {!isOnline && pendingPhotos.length > 0 && (
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 text-[9px] font-bold uppercase border-amber-500 text-amber-600 bg-amber-50 rounded-none"
                onClick={() => toast({ title: "Sin señal", description: "Buscá conexión para subir las fotos." })}
              >
                <CloudOff className="h-3 w-3 mr-1" /> {pendingPhotos.length} Pendientes
              </Button>
            )}
            
            {isOnline && pendingPhotos.length > 0 && (
              <Button 
                variant="secondary" 
                size="sm" 
                className="h-7 text-[9px] font-bold uppercase bg-primary/10 text-primary hover:bg-primary/20 rounded-none"
                onClick={syncPending}
                disabled={isProcessing}
              >
                {isProcessing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                Sincronizar {pendingPhotos.length}
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <button 
            onClick={handleCaptureClick}
            disabled={isProcessing}
            className={cn(
              "aspect-square flex flex-col items-center justify-center border-2 border-dashed border-neutral-300 rounded-none hover:bg-neutral-50 hover:border-primary/50 transition-all group",
              isProcessing && "opacity-50 cursor-not-allowed"
            )}
          >
            {isProcessing ? (
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            ) : (
              <>
                <Camera className="h-6 w-6 text-neutral-400 group-hover:text-primary mb-2" />
                <span className="text-[9px] font-black uppercase tracking-tight text-neutral-500">Tomar Foto</span>
              </>
            )}
          </button>

          {pendingPhotos.map(photo => (
            <div key={photo.id} className="aspect-square relative border border-amber-200 bg-amber-50/30">
              <img 
                src={URL.createObjectURL(photo.file)} 
                alt="Pendiente" 
                className="w-full h-full object-cover opacity-60 grayscale" 
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <CloudOff className="h-5 w-5 text-amber-600 mb-1" />
                <span className="text-[8px] font-bold uppercase text-amber-600">Pendiente</span>
              </div>
              <button 
                onClick={() => removePending(photo.id)}
                className="absolute top-1 right-1 p-1 bg-white/80 rounded-none text-destructive hover:bg-white"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}

          {loadingPhotos ? (
             <div className="aspect-square flex items-center justify-center bg-muted/20">
               <Loader2 className="h-4 w-4 animate-spin text-neutral-300" />
             </div>
          ) : (
            uploadedPhotos?.map((photo: any) => (
              <div key={photo.id} className="aspect-square relative border border-neutral-200 group overflow-hidden">
                <img 
                  src={photo.value} 
                  alt="Evidencia" 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                />
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-1">
                  <p className="text-[7px] text-white uppercase font-bold truncate">
                    {photo.userEmail?.split('@')[0]} • {new Date(photo.timestamp?.toMillis?.() || Date.now()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </p>
                </div>
                <a 
                  href={photo.value} 
                  target="_blank" 
                  rel="noreferrer"
                  className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/20 transition-opacity"
                >
                  <ImageIcon className="h-5 w-5 text-white" />
                </a>
              </div>
            ))
          )}
        </div>

        <input 
          type="file" 
          ref={fileInputRef}
          accept="image/*" 
          capture="environment" 
          onChange={handleFileChange}
          className="hidden" 
        />
      </CardContent>
    </Card>
  );
}
