# Contexto Técnico: DEA Data Bus (DPH)

Este documento sirve como prompt de referencia para que cualquier IA entienda la arquitectura y el propósito de la aplicación.

## 🇦🇷 Trasfondo y ADN
DEA Data Bus es la herramienta central de la **Dirección de Preservación Hidráulica (DPH)** para el monitoreo de cuencas hídricas en la provincia de Buenos Aires. No es una app de consumo masivo, es un instrumento técnico para ingenieros y técnicos de campo.

## 🛠 Stack Tecnológico
- **Core:** Next.js 15 (App Router) + TypeScript.
- **UI:** Tailwind CSS + ShadCN UI + Lucide Icons.
- **GIS:** OpenLayers (con soporte para GeoJSON locales y offline).
- **Backend-as-a-Service:** Firebase (Auth, Firestore, Storage).
- **Gestión de Proyectos:** Sincronización bidireccional con la API de Trello mediante Server Actions.

## 📊 Estructura de Datos (Modelado Firestore)
- `stations`: Puntos de muestreo georreferenciados. Nomenclatura: `EM` (Estación Monitoreo) + `CÓDIGO_CUENCA` (ej: MAI) + `NÚMERO`.
- `reports`: Cabeceras de expedientes de monitoreo. Usan un `OID` (ID de Objeto) con formato `RM` (Reporte Monitoreo) + `CUENCA` + `NÚMERO`.
- `samples`: Resultados de laboratorio o mediciones de campo (analitos).
- `presence`: Señal de presencia en tiempo real (GPS Heartbeat) para técnicos activos.
- `custom_templates`: Plantillas de parámetros personalizadas por los técnicos.

## 🚀 Flujo de Laburo
1. **Login:** Restringido por `AUTH_WHITELIST`.
2. **GIS:** El técnico se ubica en el mapa. Selecciona una estación o crea una con el GPS.
3. **Reporte:** Crea un reporte (`RM...`) y lo vincula a una tarjeta de Trello (Proyecto).
4. **Carga:** Completa protocolos específicos (AS-001 para superficial, FTA-001 para freatímetros).
5. **Offline:** Los datos se guardan localmente si no hay señal y se sincronizan apenas vuelve el 4G/Wi-Fi.

## 🎨 Identidad Visual
- **Colores:** Azul Petróleo (`#327787`) como color primario.
- **Fuentes:** Encode Sans para la interfaz, tipografía de ancho fijo para datos numéricos.
- **UX:** Pensada para el sol y el barro (alto contraste, botones grandes, feedback inmediato de guardado).