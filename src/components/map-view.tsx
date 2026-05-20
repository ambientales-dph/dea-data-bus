'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import XYZ from 'ol/source/XYZ';
import { fromLonLat, toLonLat } from 'ol/proj';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Cluster from 'ol/source/Cluster';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import GeoJSON from 'ol/format/GeoJSON';
import { Style, Text, Fill, Circle as CircleStyle, Stroke } from 'ol/style';
import { useFirestore, useCollection, useUser } from '@/firebase';
import { collection, query } from 'firebase/firestore';
import { SelectedPoint } from '@/app/page';

interface MapViewProps {
  onPointSelect: (point: SelectedPoint) => void;
  selectedPoint: SelectedPoint | null;
  activeLayer: 'osm' | 'grayscale' | 'satellite';
  isMobile?: boolean;
}

// Umbral de caducidad para presencia (2 minutos)
const PRESENCE_EXPIRATION_MS = 2 * 60 * 1000;

export function MapView({ onPointSelect, selectedPoint, activeLayer, isMobile }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<Map | null>(null);
  const stationsSource = useRef<VectorSource>(new VectorSource());
  const selectionSource = useRef<VectorSource>(new VectorSource());
  const presenceSource = useRef<VectorSource>(new VectorSource());
  
  const stationsLayerRef = useRef<VectorLayer<any> | null>(null);
  const selectionLayerRef = useRef<VectorLayer<any> | null>(null);
  const presenceLayerRef = useRef<VectorLayer<any> | null>(null);
  const baseLayerRef = useRef<TileLayer<any> | null>(null);
  const basinsLayerRef = useRef<VectorLayer<any> | null>(null);
  const codesLayerRef = useRef<VectorLayer<any> | null>(null);
  
  const basinsSource = useRef<VectorSource>(new VectorSource({
    url: '/data/cuencas_dph.json',
    format: new GeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' })}));
  const codesSource = useRef<VectorSource>(new VectorSource({
    url: '/data/codigos_cuencas.json',
    format: new GeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' })}));

  const onPointSelectRef = useRef(onPointSelect);
  const db = useFirestore();
  const { user } = useUser();

  const [hoveredText, setHoveredText] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number, y: number } | null>(null);

  useEffect(() => {
    onPointSelectRef.current = onPointSelect;
  }, [onPointSelect]);

  const stationsQuery = useMemo(() => query(collection(db, 'stations')), [db]);
  const { data: stations } = useCollection(stationsQuery);

  const presenceQuery = useMemo(() => query(collection(db, 'presence')), [db]);
  const { data: presences } = useCollection(presenceQuery);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const basinsLayer = new VectorLayer({
      source: basinsSource.current,
      zIndex: 5,
      minZoom: 6.5,
    });
    basinsLayerRef.current = basinsLayer;

    const codesLayer = new VectorLayer({
      source: codesSource.current,
      zIndex: 4,
      maxZoom: 6.5,
    });
    codesLayerRef.current = codesLayer;

    const baseLayer = new TileLayer({
      source: new OSM(),
      properties: { id: 'base-layer' }
    });
    baseLayerRef.current = baseLayer;

    const clusterSource = new Cluster({
      distance: 40,
      source: stationsSource.current,
    });

    const stationsLayer = new VectorLayer({
      source: clusterSource,
      zIndex: 10,
    });
    stationsLayerRef.current = stationsLayer;

    const selectionLayer = new VectorLayer({
      source: selectionSource.current,
      zIndex: 20,
    });
    selectionLayerRef.current = selectionLayer;

    const presenceLayer = new VectorLayer({
      source: presenceSource.current,
      zIndex: 15,
    });
    presenceLayerRef.current = presenceLayer;

    const map = new Map({
      target: mapRef.current,
      layers: [baseLayer, basinsLayer, codesLayer, presenceLayer, stationsLayer, selectionLayer],
      view: new View({
        center: fromLonLat([-60.0, -37.0]),
        zoom: 5.5,
      }),
    });

    map.on('click', (event) => {
      const coords = toLonLat(event.coordinate);
      const pixel = event.pixel;
      
      let basinCode = '';
      const featuresAtPoint = codesSource.current.getFeaturesAtCoordinate(event.coordinate);
      if (featuresAtPoint.length > 0) {
        basinCode = featuresAtPoint[0].get('CODIGO') || '';
      }

      const stationFeature = map.forEachFeatureAtPixel(pixel, (f) => {
        const features = f.get('features');
        if (features && features.length === 1) {
          return features[0];
        }
        return null;
      }, {
        hitTolerance: isMobile ? 12 : 4
      });

      if (stationFeature) {
        onPointSelectRef.current?.({
          lat: stationFeature.get('lat'),
          lon: stationFeature.get('lon'),
          stationId: stationFeature.get('stationId'),
          name: stationFeature.get('name'),
          basinCode: basinCode,
        });
      } else {
        onPointSelectRef.current?.({ 
          lat: coords[1], 
          lon: coords[0],
          basinCode: basinCode
        });
      }
    });

    map.on('pointermove', (evt) => {
      if (evt.dragging) return;
      const pixel = map.getEventPixel(evt.originalEvent);
      
      const feature = map.forEachFeatureAtPixel(pixel, (f) => f);

      if (feature) {
        let text = '';
        const features = feature.get('features');

        if (features) {
          const names = features.map((f: any) => f.get('name')).filter(Boolean);
          text = names.join('\n');
        } else {
          const email = feature.get('userEmail');
          const name = feature.get('name');

          if (email && name) text = `${email} - ${name}`;
          else if (email) text = email;
          else if (name) text = name;
        }

        if (text) {
          setHoveredText(text);
          setTooltipPos({ x: evt.originalEvent.clientX, y: evt.originalEvent.clientY });
          map.getTargetElement().style.cursor = 'pointer';
        } else {
          setHoveredText(null);
          setTooltipPos(null);
          map.getTargetElement().style.cursor = '';
        }
      } else {
        setHoveredText(null);
        setTooltipPos(null);
        map.getTargetElement().style.cursor = '';
      }
    });

    mapInstance.current = map;

    return () => {
      map.setTarget(undefined);
      mapInstance.current = null;
    };
  }, [isMobile]);

  useEffect(() => {
    if (!mapInstance.current || !selectedPoint) {
      selectionSource.current.clear();
      return;
    }

    selectionSource.current.clear();
    const selectionFeature = new Feature({
      geometry: new Point(fromLonLat([selectedPoint.lon, selectedPoint.lat])),
      userEmail: user?.email || 'Mi selección',
      name: selectedPoint.name || '',
    });
    selectionSource.current.addFeature(selectionFeature);

    mapInstance.current.getView().animate({
      center: fromLonLat([selectedPoint.lon, selectedPoint.lat]),
      duration: 500
    });
  }, [selectedPoint?.lat, selectedPoint?.lon, selectedPoint?.name, user?.email]);

  useEffect(() => {
    if (!presenceSource.current) return;

    const renderPresence = () => {
      presenceSource.current.clear();
      const now = Date.now();

      presences?.forEach((presence: any) => {
        if (presence.userId === user?.uid) return;
        const updatedAt = presence.updatedAt?.toMillis?.() || (presence.updatedAt instanceof Date ? presence.updatedAt.getTime() : now);
        if (now - updatedAt > PRESENCE_EXPIRATION_MS) return;

        const feature = new Feature({
          geometry: new Point(fromLonLat([presence.longitude, presence.latitude])),
          userEmail: presence.userEmail,
          name: presence.name || '',
        });
        presenceSource.current.addFeature(feature);
      });
    };

    renderPresence();
    const pruneInterval = setInterval(renderPresence, 60000);
    return () => clearInterval(pruneInterval);
  }, [presences, user?.uid]);

  useEffect(() => {
    if (!basinsLayerRef.current || !codesLayerRef.current) return;
    const strokeColor = 'rgba(13, 145, 102, 0.7)';

    basinsLayerRef.current.setStyle((feature, resolution) => {
      const view = mapInstance.current?.getView();
      const zoom = view ? view.getZoomForResolution(resolution) : 0;
      const strokeWidth = (zoom && zoom >= 10) ? 3 : 1;
      
      let textStyle = undefined;
      if (zoom && zoom >= 7) {
        const codLetras = feature.get('cod_letras') || '';
        const subregion = feature.get('subregion') || '';
        const label = `${codLetras} ${subregion}`.trim();
        
        if (label) {
          textStyle = new Text({
            text: label,
            font: '10px "Encode Sans", sans-serif',
            fill: new Fill({ color: activeLayer === 'satellite' ? 'white' : '#0D9166' }),
            stroke: new Stroke({ color: activeLayer === 'satellite' ? 'black' : 'white', width: 3 }),
          });
        }
      }
      
      return new Style({
        stroke: new Stroke({ color: strokeColor, width: strokeWidth }),
        fill: new Fill({ color: 'rgba(0, 0, 0, 0)' }),
        text: textStyle
      });
    });

    codesLayerRef.current.setStyle(() => {
      return new Style({
        stroke: new Stroke({ color: strokeColor, width: 0.5 }),
        fill: new Fill({ color: 'rgba(0, 0, 0, 0)' }),
      });
    });

  }, [activeLayer]);

  useEffect(() => {
    if (!stationsLayerRef.current || !selectionLayerRef.current || !presenceLayerRef.current) return;

    stationsLayerRef.current.setStyle((feature, resolution) => {
      const features = feature.get('features');
      const size = features.length;

      if (size > 1) {
        return new Style({
          image: new CircleStyle({
            radius: 9 + Math.min(size, 5),
            fill: new Fill({ color: 'rgba(78, 151, 202, 0.7)' }),
            stroke: undefined,
          }),
          text: new Text({
            text: size.toString(),
            fill: new Fill({ color: 'white' }),
            font: 'bold 10px "Encode Sans", sans-serif',
          }),
        });
      }

      const view = mapInstance.current?.getView();
      const zoom = view ? view.getZoomForResolution(resolution) : 0;
      const radius = (zoom && zoom > 7) ? 6.5 : 3.5;

      const stationFeature = features[0];
      const isSelected = selectedPoint?.stationId === stationFeature.get('stationId');

      return new Style({
        image: new CircleStyle({
          radius: radius,
          fill: new Fill({ color: isSelected ? '#22c55e' : '#4E97CA' }),
          stroke: new Stroke({ color: 'white', width: 0.8 }),
        })
      });
    });

    selectionLayerRef.current.setStyle(() => {
      return new Style({
        image: new CircleStyle({
          radius: 3,
          stroke: new Stroke({ color: '#22c55e', width: 0.8 }),
          fill: new Fill({ color: 'rgba(34, 197, 94, 0.4)' }),
        })
      });
    });

    presenceLayerRef.current.setStyle(() => {
      return new Style({
        image: new CircleStyle({
          radius: 3,
          stroke: new Stroke({ color: '#ef4444', width: 0.8 }),
          fill: new Fill({ color: 'rgba(239, 68, 68, 0.4)' }),
        })
      });
    });

  }, [activeLayer, selectedPoint?.stationId]);

  useEffect(() => {
    if (!baseLayerRef.current) return;
    const baseLayer = baseLayerRef.current;
    
    if (activeLayer === 'satellite') {
      baseLayer.setSource(new XYZ({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        maxZoom: 19
      }));
    } else {
      baseLayer.setSource(new OSM());
    }

    const listener = (evt: any) => {
      const ctx = evt.context as CanvasRenderingContext2D;
      if (!ctx) return;
      if (activeLayer === 'grayscale') {
        ctx.filter = 'grayscale(100%) brightness(0.9) contrast(1.2)';
      }
    };
    
    const postListener = (evt: any) => {
      const ctx = evt.context as CanvasRenderingContext2D;
      if (!ctx) return;
      if (activeLayer === 'satellite') {
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = '#FF0000';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.globalCompositeOperation = 'saturation';
        ctx.fillStyle = '#000000'; 
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.globalCompositeOperation = 'color-dodge';
        ctx.fillStyle = '#B0B0B0'; 
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = '#A0A0A0';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.restore();
      }
      ctx.filter = 'none';
    };

    baseLayer.on('prerender', listener);
    baseLayer.on('postrender', postListener);

    return () => {
      baseLayer.un('prerender', listener);
      baseLayer.un('postrender', postListener);
    };
  }, [activeLayer]);

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
      stationsSource.current.addFeature(feature);
    });
  }, [stations]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-muted/20 flex flex-col">
      <div ref={mapRef} className="absolute inset-0 z-10" />

      {hoveredText && tooltipPos && (
        <div 
          className="fixed z-[100] pointer-events-none bg-gray-200/30 text-black px-2 py-1 rounded-none text-[9px] font-code shadow-none transform -translate-x-1/2 -translate-y-full mb-4 transition-opacity duration-200 whitespace-pre-line"
          style={{ left: tooltipPos.x, top: tooltipPos.y }}
        >
          {hoveredText}
        </div>
      )}
    </div>
  );
}