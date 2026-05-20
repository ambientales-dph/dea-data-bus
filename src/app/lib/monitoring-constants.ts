/**
 * @fileOverview Definición estática de protocolos y datos geográficos para funcionamiento offline.
 */

export const MONITORING_TEMPLATES = [
  {
    id: "agua_superficial",
    nombre: "Agua Superficial (Protocolo AS-001)",
    medium: "agua_superficial",
    parametros: [
      { nombre: "Turbidez/Turbiedad", categoria: "Fisicoquímico", unidades: "NTU" },
      { nombre: "Sólidos Suspendidos", categoria: "Sólidos", unidades: "mg/l" },
      { nombre: "Nitrógeno Amoniacal", categoria: "Nutrientes", unidades: "mg/l" },
      { nombre: "Fosforo total", categoria: "Nutrientes", unidades: "mg/l" },
      { nombre: "Coliformes totales", categoria: "Microbiología", unidades: "3NMP/100ml" },
      { nombre: "Arsenico", categoria: "Metales", unidades: "mg/l" },
      { nombre: "Plomo", categoria: "Metales", unidades: "mg/l" }
    ]
  },
  {
    id: "agua_subterranea",
    nombre: "Freatímetros (Protocolo FTA-001)",
    medium: "agua_subterranea",
    parametros: [
      { nombre: "Cota Brocal", categoria: "Geometría", unidades: "m s.n.m." },
      { nombre: "Nivel Estático", categoria: "Campo", unidades: "m" },
      { nombre: "pH", categoria: "Campo", unidades: "upH" },
      { nombre: "Conductividad", categoria: "Campo", unidades: "μS/cm" },
      { nombre: "Temperatura", categoria: "Campo", unidades: "°C" }
    ]
  }
];

export const BASIN_CODES_DATA = {
  "type": "FeatureCollection",
  "features": [
    { "type": "Feature", "properties": { "CODIGO": "MAI", "NOMBRE": "Maipu" }, "geometry": { "type": "Point", "coordinates": [-57.88, -36.86] } },
    { "type": "Feature", "properties": { "CODIGO": "SAL", "NOMBRE": "Salado" }, "geometry": { "type": "Point", "coordinates": [-59.98, -35.74] } },
    { "type": "Feature", "properties": { "CODIGO": "Luj", "NOMBRE": "Lujan" }, "geometry": { "type": "Point", "coordinates": [-58.92, -34.45] } },
    { "type": "Feature", "properties": { "CODIGO": "REC", "NOMBRE": "Reconquista" }, "geometry": { "type": "Point", "coordinates": [-58.62, -34.48] } }
  ]
};
