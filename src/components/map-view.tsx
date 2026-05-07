
'use client';

import { useEffect, useRef, useState } from 'react';
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
import { Style, Icon } from 'ol/style';

interface MapViewProps {
  onLocationSelect: (lat: number, lon: number) => void;
  selectedLocation: [number, number] | null;
}

export function MapView({ onLocationSelect, selectedLocation }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<Map | null>(null);
  const vectorSource = useRef<VectorSource>(new VectorSource());

  useEffect(() => {
    if (!mapRef.current) return;

    const vectorLayer = new VectorLayer({
      source: vectorSource.current,
    });

    const map = new Map({
      target: mapRef.current,
      layers: [
        new TileLayer({
          source: new OSM(),
        }),
        vectorLayer,
      ],
      view: new View({
        center: fromLonLat([-60.0, -34.0]), // Default center (Argentinaish)
        zoom: 4,
      }),
    });

    map.on('click', (event) => {
      const coords = toLonLat(event.coordinate);
      onLocationSelect(coords[1], coords[0]);
    });

    mapInstance.current = map;

    return () => {
      map.setTarget(undefined);
    };
  }, []);

  useEffect(() => {
    if (!vectorSource.current || !selectedLocation) return;

    vectorSource.current.clear();
    
    const feature = new Feature({
      geometry: new Point(fromLonLat([selectedLocation[1], selectedLocation[0]])),
    });

    feature.setStyle(
      new Style({
        image: new Icon({
          anchor: [0.5, 1],
          src: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
          scale: 0.05,
          color: '#36773A'
        }),
      })
    );

    vectorSource.current.addFeature(feature);
  }, [selectedLocation]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg shadow-inner bg-muted/20">
      <div ref={mapRef} className="absolute inset-0" />
      <div className="absolute bottom-4 left-4 z-10 rounded-md bg-white/90 p-2 text-xs shadow-md backdrop-blur-sm">
        Haga clic en el mapa para situar la muestra
      </div>
    </div>
  );
}
