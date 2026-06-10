// cactnut-design-system examples/web/squircle.js の移植。
// CDN import の代わりに npm の figma-squircle をバンドルする。
import { getSvgPath } from "figma-squircle";

const DEFAULT_RADIUS = 8;
const SMOOTHING = 1.0; // iOS の .continuous は 0.6 前後。それより強めにかける
const SVG_NS = "http://www.w3.org/2000/svg";

function apply(el: HTMLElement) {
  const radius = parseFloat(el.dataset.squircleRadius || String(DEFAULT_RADIUS));
  const wantStroke = el.hasAttribute("data-squircle-stroke");

  let overlay: SVGSVGElement | null = null;
  let strokePath: SVGPathElement | null = null;
  if (wantStroke) {
    if (getComputedStyle(el).position === "static") {
      el.style.position = "relative";
    }
    overlay = document.createElementNS(SVG_NS, "svg");
    overlay.setAttribute("class", "squircle-stroke");
    overlay.setAttribute("aria-hidden", "true");
    strokePath = document.createElementNS(SVG_NS, "path");
    strokePath.setAttribute("fill", "none");
    strokePath.setAttribute("stroke", "currentColor");
    strokePath.setAttribute("stroke-width", "1");
    strokePath.setAttribute("vector-effect", "non-scaling-stroke");
    overlay.appendChild(strokePath);
    el.appendChild(overlay);
  }

  const update = () => {
    const rect = el.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (!w || !h) return;
    const r = Math.min(radius, Math.min(w, h) / 2);

    const d = getSvgPath({
      width: w,
      height: h,
      cornerRadius: r,
      cornerSmoothing: SMOOTHING,
    });
    el.style.clipPath = `path("${d}")`;
    el.dataset.squircleApplied = "1";

    if (overlay && strokePath) {
      overlay.setAttribute("viewBox", `0 0 ${w} ${h}`);
      const dInset = getSvgPath({
        width: Math.max(0, w - 1),
        height: Math.max(0, h - 1),
        cornerRadius: Math.max(0, r - 0.5),
        cornerSmoothing: SMOOTHING,
      });
      strokePath.setAttribute("d", dInset);
      strokePath.setAttribute("transform", "translate(0.5, 0.5)");
    }
  };

  update();
  new ResizeObserver(update).observe(el);
}

export function initSquircle(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>("[data-squircle]").forEach(apply);
}
