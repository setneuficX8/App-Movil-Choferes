import { supabase } from "../config/constanst";

/**
 * Obtiene todos los recorridos realizados
 */
export async function obtenerRecorridos() {

  const { data, error } = await supabase
    .from("recorridos")
    .select(`
        id,
        estado,
        fecha_inicio,
        fecha_fin,
        distancia_total_km,
        
        ruta_id,

        Rutas(
            id,
            nombre_ruta,
            shape
        ),

        Chofer(
            nombre,
            apellido
        )
    `)
    .order("fecha_inicio", {
      ascending: false
    });

  if (error) {
    throw error;
  }

  return data ?? [];

}


/**
 * Obtiene todas las posiciones GPS de un recorrido
 * y las convierte automáticamente a GeoJSON.
 */
export async function obtenerPosicionesGPS(recorridoId) {

  const { data, error } = await supabase
    .from("posiciones_gps")
    .select(`
      latitud,
      longitud,
      timestamp_captura
    `)
    .eq("recorrido_id", recorridoId)
    .order("timestamp_captura", {
      ascending: true
    });

  if (error) {
    throw error;
  }

  if (!data || data.length === 0) {

    return {

      geojson: null,

      inicio: null,

      fin: null,

      distancia: 0,

      cantidad: 0

    };

  }

  const validData = data.filter(p => p.longitud != null && p.latitud != null);

  if (validData.length === 0) {
    return { geojson: null, inicio: null, fin: null, distancia: 0, cantidad: 0 };
  }

  const coordinates = validData.map(p => [
    p.longitud,
    p.latitud
  ]);

  return {
    geojson: {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates
      }
    },
    inicio: coordinates[0],
    fin: coordinates[coordinates.length - 1],
    cantidad: coordinates.length
  };
}