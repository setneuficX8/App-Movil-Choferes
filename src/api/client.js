import axios from "axios";

const apiClient = axios.create({
  baseURL: "https://apirecoleccion.gonzaloandreslucio.com/api",

  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },

  timeout: 10000,
});

export default apiClient;