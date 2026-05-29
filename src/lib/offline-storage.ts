'use client';

import localforage from 'localforage';

/**
 * Configuración de almacenamiento local para fotos pendientes.
 */
const offlinePhotosStore = localforage.createInstance({
  name: 'DEADataBus',
  storeName: 'offline_photos',
  description: 'Fotos capturadas sin conexión pendientes de sincronización'
});

/**
 * Almacén para borrados pendientes (IDs de documentos y rutas de storage).
 */
const pendingDeletionsStore = localforage.createInstance({
  name: 'DEADataBus',
  storeName: 'pending_deletions',
  description: 'Registros y archivos pendientes de eliminar en la nube'
});

export interface OfflinePhoto {
  id: string;
  reportId: string;
  formId: string;
  stationId: string;
  medium: string;
  file: Blob;
  fileName: string;
  timestamp: number;
  syncRequested?: boolean; // Indica si el usuario ya ordenó la subida
}

export interface PendingDeletion {
  id: string; // ID del documento en Firestore
  storagePath?: string; // Ruta en Firebase Storage
}

export const offlineStorage = {
  // --- GESTIÓN DE FOTOS ---
  async savePhoto(photo: OfflinePhoto) {
    return await offlinePhotosStore.setItem(photo.id, {
      ...photo,
      syncRequested: photo.syncRequested ?? false
    });
  },

  async markForSync(id: string) {
    const photo = await offlinePhotosStore.getItem(id) as OfflinePhoto;
    if (photo) {
      photo.syncRequested = true;
      return await offlinePhotosStore.setItem(id, photo);
    }
  },

  async getPendingPhotos(formId: string): Promise<OfflinePhoto[]> {
    const photos: OfflinePhoto[] = [];
    await offlinePhotosStore.iterate((value: OfflinePhoto) => {
      if (value.formId === formId) {
        photos.push(value);
      }
    });
    return photos;
  },

  async removePhoto(id: string) {
    return await offlinePhotosStore.removeItem(id);
  },

  // --- GESTIÓN DE BORRADOS ---
  async queueDeletion(id: string, storagePath?: string) {
    return await pendingDeletionsStore.setItem(id, { id, storagePath });
  },

  async getPendingDeletions(): Promise<PendingDeletion[]> {
    const deletions: PendingDeletion[] = [];
    await pendingDeletionsStore.iterate((value: PendingDeletion) => {
      deletions.push(value);
    });
    return deletions;
  },

  async removePendingDeletion(id: string) {
    return await pendingDeletionsStore.removeItem(id);
  }
};
