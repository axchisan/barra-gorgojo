// Página del cliente para pedir desde la mesa con el QR (docs/20). Liviana y aparte de la
// app del personal: ve la carta, arma su pedido y ve en qué va. No ve cuentas ni nada interno.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Pedir } from "./Pedir";
import "./cliente.css";

createRoot(document.getElementById("raiz")!).render(<StrictMode><Pedir /></StrictMode>);
