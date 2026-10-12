import { useEffect, useState } from "react";

// True on devices without hover (phones, tablets); follows the media query live.
export function useTouchScreen(): boolean {
  const [touch, setTouch] = useState(() => typeof window !== "undefined" && window.matchMedia("(hover: none)").matches);
  useEffect(() => {
    const mql = window.matchMedia("(hover: none)");
    const onChange = () => setTouch(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return touch;
}
