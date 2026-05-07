'use client';

import { useEffect, useRef } from 'react';
import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import { fromLonLat, toLonLat } from 'ol/proj';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { Style, Text, Fill, Circle as CircleStyle, Stroke } from 'ol/style';
import { useFirestore, useCollection } from '@/firebase';
import { collection, query } from 'firebase/firestore';
import { SelectedPoint } from '@/app/page';

interface MapViewProps {
  onPointSelect: (point: SelectedPoint) => void;
  selectedPoint: SelectedPoint | null;
}

export function MapView({ onPointSelect, selectedPoint }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<Map | null>(null);
  const stationsSource = useRef<VectorSource>(new VectorSource());
  const selectionSource = useRef<VectorSource>(new VectorSource());
  const db = useFirestore();

  // Escuchar todas las estaciones de Firestore
  const { data: stations } = useCollection(query(collection(db, 'stations')));

  useEffect(() => {
    if (!mapRef.current) return;

    const stationsLayer = new VectorLayer({
      source: stationsSource.current,
    });

    const selectionLayer = new VectorLayer({
      source: selectionSource.current,
    });

    const map = new Map({
      target: mapRef.current,
      layers: [
        new TileLayer({
          source: new OSM(),
        }),
        stationsLayer,
        selectionLayer,
      ],
      view: new View({
        center: fromLonLat([-60.0, -37.0]), // Centrado en Provincia de Buenos Aires
        zoom: 6, // Zoom para ver toda la provincia
      }),
    });

    map.on('click', (event) => {
      const feature = map.forEachFeatureAtPixel(event.pixel, (f) => f);
      
      if (feature && feature.get('stationId')) {
        // Clic en estación existente
        onPointSelect({
          lat: feature.get('lat'),
          lon: feature.get('lon'),
          stationId: feature.get('stationId'),
          name: feature.get('name'),
        });
      } else {
        // Clic en nuevo punto
        const coords = toLonLat(event.coordinate);
        onPointSelect({ lat: coords[1], lon: coords[0] });
      }
    });

    mapInstance.current = map;

    return () => {
      map.setTarget(undefined);
    };
  }, []);

  // Actualizar estaciones en el mapa cuando cambian en Firestore
  useEffect(() => {
    if (!stationsSource.current) return;
    stationsSource.current.clear();

    stations?.forEach((station: any) => {
      const feature = new Feature({
        geometry: new Point(fromLonLat([station.longitude, station.latitude])),
        name: station.name,
        stationId: station.id,
        lat: station.latitude,
        lon: station.longitude,
      });

      feature.setStyle(
        new Style({
          image: new CircleStyle({
            radius: 5, // Tamaño reducido de 7 a 5
            fill: new Fill({ color: '#4E97CA' }),
            stroke: new Stroke({ color: 'white', width: 1.5 }),
          }),
          text: new Text({
            text: station.name,
            offsetY: -12,
            font: 'bold 10px Inter, sans-serif',
            fill: new Fill({ color: '#1e3a8a' }),
            padding: [2, 4, 2, 4],
          })
        })
      );

      stationsSource.current.addFeature(feature);
    });
  }, [stations]);

  // Mostrar el punto de selección actual (mientras se crea o selecciona)
  useEffect(() => {
    if (!selectionSource.current || !selectedPoint) return;
    selectionSource.current.clear();
    
    // Solo mostramos un marcador de selección diferente si es un punto NUEVO
    if (!selectedPoint.stationId) {
      const feature = new Feature({
        geometry: new Point(fromLonLat([selectedPoint.lon, selectedPoint.lat])),
      });

      feature.setStyle(
        new Style({
          image: new CircleStyle({
            radius: 6, // Tamaño reducido de 8 a 6
            fill: new Fill({ color: '#ef4444' }),
            stroke: new Stroke({ color: 'white', width: 1.5 }),
          }),
        })
      );

      selectionSource.current.addFeature(feature);
    }
  }, [selectedPoint]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg shadow-inner bg-muted/20 border-2 border-primary/10">
      <div ref={mapRef} className="absolute inset-0" />
      
      {/* Leyenda movida a la derecha inferior */}
      <div className="absolute bottom-4 right-4 z-10 rounded-xl bg-white/95 p-4 shadow-xl backdrop-blur-md border border-primary/10 min-w-[180px]">
        <div className="font-bold text-primary text-sm mb-3 text-right">Guía del Mapa</div>
        <div className="space-y-2">
          <div className="flex items-center justify-end gap-3">
            <span className="text-xs font-medium text-muted-foreground">Estación Existente</span>
            <div className="w-3 h-3 rounded-full bg-[#4E97CA] border-2 border-white shadow-sm"></div> 
          </div>
          <div className="flex items-center justify-end gap-3">
            <span className="text-xs font-medium text-muted-foreground">Punto de selección</span>
            <div className="w-3 h-3 rounded-full bg-[#ef4444] border-2 border-white shadow-sm"></div> 
          </div>
        </div>
      </div>
    </div>
  );
}
