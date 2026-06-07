import apiClient from "../api/client";

export const obtenerCalles = async () => {
    try {
        const response = await apiClient.get("/calles");
        return response.data;
    } catch (error) {       
        console.error("Error al listar las calles:", error);
        throw error;
    }
};