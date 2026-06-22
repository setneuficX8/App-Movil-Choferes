import { useEffect } from "react";
import * as Network from "expo-network";
import { ejecutarSincronizacionLotes } from "../services/syncService";

export const useNetworkSync = () => {
  useEffect(() => {
    let intervalId;

    const checkAndSync = async () => {
      const state = await Network.getNetworkStateAsync();
      if (state.isConnected && state.isInternetReachable) {
        await ejecutarSincronizacionLotes();
      }
    };

    // Estrategia 1: Suscripción a eventos de red nativos
    const subscription = Network.addNetworkStateListener((state) => {
      if (state.isConnected && state.isInternetReachable) {
        console.log("[NetworkSync] Red recuperada. Disparando lote...");
        ejecutarSincronizacionLotes();
      }
    });

    // Estrategia 2: Polling de seguridad (Fallback para SOs que no emiten el evento correctamente)
    intervalId = setInterval(checkAndSync, 15000); // Evalúa la cola cada 15 segundos

    return () => {
      subscription.remove();
      clearInterval(intervalId);
    };
  }, []);
};
