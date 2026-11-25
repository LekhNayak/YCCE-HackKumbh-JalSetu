import { useEffect } from "react";

/** The browser tab and screen readers name the page. */
export function useTitle(title: string) {
  useEffect(() => { document.title = `${title} · JalSetu`; }, [title]);
}
