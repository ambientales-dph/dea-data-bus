
'use client';

import { useState, useRef, useEffect } from 'react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { useFirestore, useStorage, useUser, errorEmitter, FirestorePermissionError } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Camera, Loader2, X, Upload, Trash2, CloudOff, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { compressImage } from '@/lib/image-processing';
import { offlineStorage, OfflinePhoto } from '@/lib/offline-storage';
import { cn } from '@/lib/utils';

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
  
  const [isCompressing, setIsCompressing] = useState(false);
  const [uploadingIds, setUploadingIds] = useState<string[]>([]);
  const [localPhoto, setLocalPhoto] = useState<{ id: string; file: File; preview: string } | null>(null);
  const [pendingPhotos, setPendingPhotos] = useState<OfflinePhoto[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadPending = async () => {
      try {
        const pending = await offlineStorage.getPendingPhotos(formId);
        setPendingPhotos(pending);
      } catch (e) {
        console.error("Error cargando fotos offline:", e);
      }
    };
    loadPending();
  }, [formId]);

  const handleCaptureClick = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsCompressing(true);
    try {
      const compressed = await compressImage(file);
      const photoId = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(compressed);
      
      const photoObj = {
        id: photoId,
        file: compressed as File,
        preview: previewUrl
      };

      setLocalPhoto(photoObj);
      
      await offlineStorage.savePhoto({
        id: photoId,
        reportId,
        formId,
        stationId,
        medium,
        file: compressed,
        fileName: `${photoId}.jpg`,
        timestamp: Date.now()
      });

      const updatedPending = await offlineStorage.getPendingPhotos(formId);
      setPendingPhotos(updatedPending);
    } catch (error) {
      console.error('Error procesando imagen:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo procesar la imagen.",
      });
    } finally {
      setIsCompressing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleUpload = async (photoId: string, file: Blob, fileName: string) => {
    if (!user || !storage || !db) return;

    setUploadingIds(prev => [...prev, photoId]);

    try {
      const safeReportId = reportId?.trim() || 'unnamed_report';
      const safeFormId = formId?.trim() || 'unnamed_form';
      const storagePath = `reports/${safeReportId}/${safeFormId}/${fileName}`;
      const storageRef = ref(storage, storagePath);

      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on('state_changed', 
        null, 
        (error) => {
          console.error("Error en uploadTask:", error);
          toast({ variant: "destructive", title: "Fallo de subida", description: error.message });
          setUploadingIds(prev => prev.filter(id => id !== photoId));
        }, 
        async () => {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          
          const photoData = {
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

          addDoc(collection(db, 'samples'), photoData)
            .catch(async (error) => {
              const permissionError = new FirestorePermissionError({
                path: 'samples',
                operation: 'create',
                requestResourceData: photoData,
              });
              errorEmitter.emit('permission-error', permissionError);
            });

          updateDoc(doc(db, 'reports', reportId), { editors: arrayUnion(user.email) }).catch(() => {});
          
          await offlineStorage.removePhoto(photoId);
          if (localPhoto?.id === photoId) setLocalPhoto(null);
          setPendingPhotos(prev => prev.filter(p => p.id !== photoId));
          setUploadingIds(prev => prev.filter(id => id !== photoId));

          toast({ title: "Sincronizado", description: "Foto guardada correctamente." });
        }
      );
    } catch (error: any) {
      console.error('Error general en handleUpload:', error);
      setUploadingIds(prev => prev.filter(id => id !== photoId));
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const removePhoto = async (id: string) => {
    await offlineStorage.removePhoto(id);
    if (localPhoto?.id === id) setLocalPhoto(null);
    setPendingPhotos(prev => prev.filter(p => p.id !== id));
  };

  if (authLoading) return null;

  return (
    <Card className="border-t-4 border-t-accent shadow-md overflow-hidden rounded-none mt-6">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-black" />
            <h3 className="text-[11px] font-black uppercase tracking-widest text-black font-headline">Evidencia Visual</h3>
          </div>
          {pendingPhotos.length > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-600 rounded-sm">
              <CloudOff className="h-3 w-3" />
              <span className="text-[9px] font-black uppercase">{pendingPhotos.length} Pendientes</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            {!localPhoto ? (
              <button 
                onClick={handleCaptureClick}
                disabled={isCompressing}
                className={cn(
                  "w-full aspect-video flex flex-col items-center justify-center border-2 border-dashed rounded-none transition-all group",
                  isCompressing ? "bg-neutral-50 cursor-not-allowed" : "border-neutral-300 hover:bg-neutral-50"
                )}
              >
                {isCompressing ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="text-[9px] font-bold uppercase text-primary">Procesando...</span>
                  </div>
                ) : (
                  <>
                    <Camera className="h-8 w-8 text-neutral-400 group-hover:text-primary mb-2" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Tomar Fotografía</span>
                  </>
                )}
              </button>
            ) : (
              <div className="aspect-video relative border-2 border-primary bg-neutral-100 overflow-hidden group">
                <img src={localPhoto.preview} alt="Vista previa" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button 
                    size="sm" 
                    variant="destructive" 
                    disabled={uploadingIds.includes(localPhoto.id)}
                    className="h-8 rounded-none uppercase text-[10px] font-black"
                    onClick={() => removePhoto(localPhoto.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Borrar
                  </Button>
                  <Button 
                    size="sm" 
                    className="h-8 bg-green-600 hover:bg-green-700 rounded-none uppercase text-[10px] font-black text-white"
                    onClick={() => handleUpload(localPhoto.id, localPhoto.file, `${localPhoto.id}.jpg`)}
                    disabled={uploadingIds.includes(localPhoto.id)}
                  >
                    {uploadingIds.includes(localPhoto.id) ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    ) : (
                      <Upload className="h-3.5 w-3.5 mr-1" />
                    )}
                    Subir
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h4 className="text-[9px] font-black uppercase text-neutral-400 tracking-widest flex items-center gap-1.5">
              <ImageIcon className="h-3 w-3" /> Cola de sincronización:
            </h4>
            
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {pendingPhotos.length === 0 && (
                <div className="col-span-full py-8 border border-dashed border-neutral-200 flex flex-col items-center justify-center opacity-30">
                  <span className="text-[8px] font-bold uppercase">Sin archivos</span>
                </div>
              )}
              
              {pendingPhotos.map(photo => {
                const isUploading = uploadingIds.includes(photo.id);
                if (localPhoto?.id === photo.id) return null;

                return (
                  <div key={photo.id} className="relative aspect-square border-2 border-amber-200 bg-amber-50 group overflow-hidden">
                    <img 
                      src={URL.createObjectURL(photo.file)} 
                      alt="Pendiente" 
                      className="w-full h-full object-cover opacity-60" 
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-all">
                      {isUploading ? (
                        <Loader2 className="h-5 w-5 animate-spin text-white" />
                      ) : (
                        <div className="flex gap-1">
                           <button onClick={() => handleUpload(photo.id, photo.file, photo.fileName)} className="p-1.5 bg-white text-primary rounded-none shadow-md">
                            <Upload className="h-4 w-4" />
                          </button>
                          <button onClick={() => removePhoto(photo.id)} className="p-1.5 bg-white text-destructive rounded-none shadow-md">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
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
