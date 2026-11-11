import { useContext } from "react";
import { PresentationContext } from "../contexts/PresentationContext";

export const usePresentationMode = () => useContext(PresentationContext);
