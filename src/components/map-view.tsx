
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
import { Style, Icon, Text, Fill } from 'ol/style';
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
        center: fromLonLat([-60.0, -34.0]),
        zoom: 4,
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
          image: new Icon({
            anchor: [0.5, 1],
            src: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
            scale: 0.04,
            color: '#4E97CA'
          }),
          text: new Text({
            text: station.name,
            offsetY: -45,
            font: 'bold 12px Inter, sans-serif',
            fill: new Fill({ color: '#1e3a8a' }),
            padding: [2, 5, 2, 5],
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
          image: new Icon({
            anchor: [0.5, 1],
            src: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
            scale: 0.05,
            color: '#ef4444' // Rojo para indicar selección/nuevo
          }),
        })
      );

      selectionSource.current.addFeature(feature);
    }
  }, [selectedPoint]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg shadow-inner bg-muted/20 border-2 border-primary/10">
      <div ref={mapRef} className="absolute inset-0" />
      <div className="absolute top-4 left-4 z-10 rounded-md bg-white/90 p-3 text-xs shadow-lg backdrop-blur-sm border border-primary/20">
        <div className="font-bold text-primary mb-1">Guía del Mapa</div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-3 h-3 rounded-full bg-[#4E97CA]"></div> Estación Existente
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-[#ef4444]"></div> Punto de nueva estación
        </div>
      </div>
    </div>
  );
}
