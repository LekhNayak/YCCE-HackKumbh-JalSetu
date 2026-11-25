import { ReactNode, useEffect, useRef, useState } from "react";

/** A box that eases to its content's height instead of jumping. Clipped only while it moves, so focus rings stay whole. */
export default function AutoHeight({ children }: { children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ height?: number; moving: boolean }>({ moving: false });

  useEffect(() => {
    const el = inner.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let timer = 0, was: number | null = null, width = el.offsetWidth;
    const ro = new ResizeObserver(() => {
      const h = el.offsetHeight, resized = el.offsetWidth !== width;
      if (h === was) return;
      const moving = was !== null && !resized;               // a window resize is followed at once, not eased
      was = h; width = el.offsetWidth;
      setBox({ height: h, moving });
      window.clearTimeout(timer);
      if (moving) timer = window.setTimeout(() => setBox({ height: h, moving: false }), 420);
    });
    ro.observe(el);
    return () => { ro.disconnect(); window.clearTimeout(timer); };
  }, []);

  return (
    <div className="auto-height" data-moving={box.moving || undefined} style={{ height: box.height }}>
      <div ref={inner}>{children}</div>
    </div>
  );
}
