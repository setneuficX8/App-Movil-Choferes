import { useState, useEffect } from "react";

export const useChronometer = (fechaInicioISO) => {
  const [tiempo, setTiempo] = useState("00:00:00");

  useEffect(() => {
    if (!fechaInicioISO) {
      setTiempo("00:00:00");
      return;
    }

    const calcularDiferencia = () => {
      const inicio = new Date(fechaInicioISO).getTime();
      const ahora = new Date().getTime();
      const diff = Math.max(0, ahora - inicio); // Prevenir deltas negativos

      const horas = Math.floor(diff / 3600000);
      const minutos = Math.floor((diff % 3600000) / 60000);
      const segundos = Math.floor((diff % 60000) / 1000);

      // Formateo estricto con padding de ceros (00:00:00)
      setTiempo(
        `${horas.toString().padStart(2, "0")}:${minutos.toString().padStart(2, "0")}:${segundos.toString().padStart(2, "0")}`,
      );
    };

    calcularDiferencia(); // Invocación inmediata para evitar 1 segundo de latencia visual
    const intervalo = setInterval(calcularDiferencia, 1000);

    return () => clearInterval(intervalo);
  }, [fechaInicioISO]);

  return tiempo;
};
