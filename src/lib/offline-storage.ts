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

export const offlineStorage = {
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

  async getAllPending(): Promise<OfflinePhoto[]> {
    const photos: OfflinePhoto[] = [];
    await offlinePhotosStore.iterate((value: OfflinePhoto) => {
      photos.push(value);
    });
    return photos;
  }
};
