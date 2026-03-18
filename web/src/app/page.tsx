"use client";

import { useEffect, useRef, useState } from "react";
import Head from "next/head";

// Data types based on original code
type DataRow = {
  title: string;
  title_zh?: string;
  slug: string;
  category: string;
  pay: number | null;
  jobs: number | null;
  outlook: number | null;
  outlook_desc: string;
  education: string;
  exposure: number | null;
  exposure_rationale: string;
  url: string;
  value?: number; // Added by squarifier
};

type Rect = DataRow & {
  rx: number;
  ry: number;
  rw: number;
  rh: number;
};

// Squarified treemap layout
function squarify(items: DataRow[], x: number, y: number, w: number, h: number): Rect[] {
  if (items.length === 0) return [];
  if (items.length === 1) return [{ ...items[0], rx: x, ry: y, rw: w, rh: h }];
  const total = items.reduce((s, d) => s + (d.value || 0), 0);
  if (total === 0) return [];
  const results: Rect[] = [];
  let remaining = [...items], cx = x, cy = y, cw = w, ch = h;
  while (remaining.length > 0) {
    const remTotal = remaining.reduce((s, d) => s + (d.value || 0), 0);
    const vertical = cw >= ch;
    const side = vertical ? ch : cw;
    let row = [remaining[0]], rowSum = remaining[0].value || 0;
    for (let i = 1; i < remaining.length; i++) {
      const candidate = [...row, remaining[i]];
      const candidateSum = rowSum + (remaining[i].value || 0);
      if (worstAspect(candidate, candidateSum, side, remTotal, vertical ? cw : ch) <
          worstAspect(row, rowSum, side, remTotal, vertical ? cw : ch)) {
        row = candidate; rowSum = candidateSum;
      } else break;
    }
    const rowFraction = rowSum / remTotal;
    const rowThickness = vertical ? cw * rowFraction : ch * rowFraction;
    let offset = 0;
    for (const item of row) {
      const itemFraction = (item.value || 0) / rowSum;
      const itemLength = side * itemFraction;
      if (vertical) results.push({ ...item, rx: cx, ry: cy + offset, rw: rowThickness, rh: itemLength });
      else results.push({ ...item, rx: cx + offset, ry: cy, rw: itemLength, rh: rowThickness });
      offset += itemLength;
    }
    if (vertical) { cx += rowThickness; cw -= rowThickness; }
    else { cy += rowThickness; ch -= rowThickness; }
    remaining = remaining.slice(row.length);
  }
  return results;
}

function worstAspect(row: DataRow[], rowSum: number, side: number, totalArea: number, availableExtent: number) {
  const rowExtent = availableExtent * (rowSum / totalArea);
  if (rowExtent === 0) return Infinity;
  let worst = 0;
  for (const item of row) {
    const itemLen = side * ((item.value || 0) / rowSum);
    if (itemLen === 0) continue;
    const aspect = Math.max(rowExtent / itemLen, itemLen / rowExtent);
    if (aspect > worst) worst = aspect;
  }
  return worst;
}

const EDU_LEVELS = [
  "No formal educational credential",
  "High school diploma or equivalent",
  "Postsecondary nondegree award",
  "Some college, no degree",
  "Associate's degree",
  "Bachelor's degree",
  "Master's degree",
  "Doctoral or professional degree",
];

const PAY_BANDS = [
  { label: "<$35K", min: 0, max: 35000 },
  { label: "$35–50K", min: 35000, max: 50000 },
  { label: "$50–75K", min: 50000, max: 75000 },
  { label: "$75–100K", min: 75000, max: 100000 },
  { label: "$100K+", min: 100000, max: Infinity },
];

const EDU_GROUPS = [
  { label: "No degree/HS", match: ["No formal educational credential", "High school diploma or equivalent"] },
  { label: "Postsec/Assoc", match: ["Postsecondary nondegree award", "Some college, no degree", "Associate's degree"] },
  { label: "Bachelor's", match: ["Bachelor's degree"] },
  { label: "Master's", match: ["Master's degree"] },
  { label: "Doctoral/Prof", match: ["Doctoral or professional degree"] },
];

const OUTLOOK_TIERS = [
  { label: "Declining (<0%)", min: -Infinity, max: -1 },
  { label: "Slow (0–3%)", min: 0, max: 3 },
  { label: "Average (4–7%)", min: 4, max: 7 },
  { label: "Fast (8–14%)", min: 8, max: 14 },
  { label: "Much faster (15%+)", min: 15, max: Infinity },
];

function boostContrast(t: number) {
  const c = (t - 0.5) * 2;
  const b = Math.sign(c) * Math.pow(Math.abs(c), 0.55);
  return b / 2 + 0.5;
}

function greenRedCSS(t: number, alpha: number) {
  t = boostContrast(Math.max(0, Math.min(1, t)));
  let r, g, b;
  if (t < 0.5) {
    const s = t / 0.5;
    r = Math.round(30 + s * 200);
    g = Math.round(180 - s * 20);
    b = Math.round(40 - s * 20);
  } else {
    const s = (t - 0.5) / 0.5;
    r = Math.round(230 + s * 25);
    g = Math.round(160 - s * 130);
    b = Math.round(20 - s * 5);
  }
  return `rgba(${r},${g},${b},${alpha})`;
}

function outlookColor(v: number | null, a: number) {
  if (v == null) return `rgba(128,128,128,${a})`;
  return greenRedCSS(1 - Math.max(0, Math.min(1, (v + 12) / 24)), a);
}

function payColor(v: number | null, a: number) {
  if (v == null) return `rgba(128,128,128,${a})`;
  const t = 1 - (Math.log(Math.max(25000, Math.min(250000, v))) - Math.log(25000)) / (Math.log(250000) - Math.log(25000));
  return greenRedCSS(t, a);
}

function eduColor(idx: number, a: number) {
  if (idx < 0) return `rgba(128,128,128,${a})`;
  return greenRedCSS(1 - idx / (EDU_LEVELS.length - 1), a);
}

function exposureColor(v: number | null, a: number) {
  if (v == null) return `rgba(128,128,128,${a})`;
  return greenRedCSS(v / 10, a);
}

function formatNumber(n: number | null) {
  if (n == null) return "—";
  if (n >= 1e4) return (n / 1e4).toFixed(1).replace(/\.0$/, "") + "万";
  return n.toLocaleString();
}

function formatPay(n: number | null) {
  return n == null ? "—" : "$" + n.toLocaleString();
}

// Map layer specific stats and components
export default function JobVisualizer() {
  const [data, setData] = useState<DataRow[]>([]);
  const [colorMode, setColorMode] = useState<"outlook" | "pay" | "education" | "exposure">("outlook");
  const [hovered, setHovered] = useState<Rect | null>(null);
  const [rects, setRects] = useState<Rect[]>([]);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Fetch data
  useEffect(() => {
    fetch("/data.json")
      .then((r) => r.json())
      .then((d) => setData(d));
  }, []);

  // Compute Layout when data or colorMode changes
  const computeLayoutAndCanvas = () => {
    if (!canvasRef.current || !wrapperRef.current || data.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const wrapper = wrapperRef.current;
    let dpr = window.devicePixelRatio || 1;
    const w = wrapper.clientWidth;
    const h = Math.round(w * 3 / 4);
    
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";

    const MARGIN = 12, GAP = 1.5;
    const tx = MARGIN, ty = MARGIN, tw = w - MARGIN * 2, th = h - MARGIN * 2;
    
    const byCategory: Record<string, DataRow[]> = {};
    for (const d of data) {
      if (!byCategory[d.category]) byCategory[d.category] = [];
      byCategory[d.category].push(d);
    }
    const categories = Object.keys(byCategory).map(cat => ({
      cat, items: byCategory[cat].sort((a, b) => (b.jobs || 0) - (a.jobs || 0)),
      value: byCategory[cat].reduce((s, d) => s + (d.jobs || 1), 0),
    })).sort((a, b: any) => b.value - (a as any).value) as any;
    
    const catRects: any[] = squarify(categories, tx, ty, tw, th);
    const newRects: Rect[] = [];
    for (const cr of catRects) {
      const items = cr.items.map((d: DataRow) => ({ ...d, value: d.jobs || 1 }));
      const innerRects = squarify(items, cr.rx + GAP, cr.ry + GAP, cr.rw - GAP * 2, cr.rh - GAP * 2);
      for (const ir of innerRects) newRects.push(ir);
    }
    setRects(newRects);
    drawCanvas(ctx, canvas, newRects, hovered, colorMode, dpr, GAP);
  };

  useEffect(() => {
    computeLayoutAndCanvas();
    const handleResize = () => computeLayoutAndCanvas();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [data, hovered, colorMode]); // Note: In a heavily optimized react app, we'd decoupled draw and layout to separate effects. This is simplified.

  const drawCanvas = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, renderRects: Rect[], curHovered: Rect | null, curMode: string, dpr: number, GAP: number) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    for (const r of renderRects) {
      const isHovered = r === curHovered;
      const g = GAP / 2, rx = r.rx + g, ry = r.ry + g, rw = r.rw - g * 2, rh = r.rh - g * 2;
      if (rw <= 0 || rh <= 0) continue;
      
      let fillCSS = `rgba(128,128,128,${isHovered ? 0.8 : 0.5})`;
      if (curMode === "exposure") fillCSS = exposureColor(r.exposure, isHovered ? 0.8 : 0.5);
      else if (curMode === "outlook") fillCSS = outlookColor(r.outlook, isHovered ? 0.8 : 0.5);
      else if (curMode === "pay") fillCSS = payColor(r.pay, isHovered ? 0.8 : 0.5);
      else if (curMode === "education") fillCSS = eduColor(EDU_LEVELS.indexOf(r.education), isHovered ? 0.8 : 0.5);

      ctx.fillStyle = fillCSS;
      ctx.fillRect(rx, ry, rw, rh);
      if (isHovered) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.strokeRect(rx, ry, rw, rh); }
      
      if (rw > 50 && rh > 18) {
        ctx.save(); ctx.beginPath(); ctx.rect(rx + 4, ry + 2, rw - 8, rh - 4); ctx.clip();
        const fontSize = Math.min(13, Math.max(9, Math.min(rw / 10, rh / 3)));
        ctx.font = `500 ${fontSize}px -apple-system, system-ui, sans-serif`;
        ctx.fillStyle = isHovered ? "#fff" : "rgba(255,255,255,0.85)";
        ctx.textBaseline = "top";
        ctx.fillText(r.title_zh || r.title, rx + 5, ry + 4);
        if (rh > 34 && rw > 60) {
          ctx.font = `400 ${Math.max(8, fontSize - 2)}px -apple-system, system-ui, sans-serif`;
          ctx.fillStyle = "rgba(255,255,255,0.5)";
          
          let subInfo = "";
          if (curMode === "exposure") subInfo = (r.exposure != null ? r.exposure + "/10" : "") + (r.jobs ? " · " + formatNumber(r.jobs) + " 个岗位" : "");
          else if (curMode === "outlook") subInfo = (r.outlook != null ? (r.outlook > 0 ? "+" : "") + r.outlook + "%" : "") + (r.jobs ? " · " + formatNumber(r.jobs) + " 个岗位" : "");
          else if (curMode === "pay") subInfo = (r.pay != null ? formatPay(r.pay) : "") + (r.jobs ? " · " + formatNumber(r.jobs) + " 个岗位" : "");
          else if (curMode === "education") {
            const short: Record<string, string> = {
              "No formal educational credential": "无学历要求",
              "High school diploma or equivalent": "高中及同等学历",
              "Postsecondary nondegree award": "大专预科",
              "Some college, no degree": "大学肄业",
              "Associate's degree": "副学士",
              "Bachelor's degree": "学士",
              "Master's degree": "硕士",
              "Doctoral or professional degree": "博士/专业",
            };
            subInfo = (short[r.education] || "") + (r.jobs ? " · " + formatNumber(r.jobs) + " 个岗位" : "");
          }
          ctx.fillText(subInfo, rx + 5, ry + 4 + fontSize + 2);
        }
        ctx.restore();
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    let hit: Rect | null = null;
    for (let i = rects.length - 1; i >= 0; i--) {
      const r = rects[i];
      if (cx >= r.rx && cx < r.rx + r.rw && cy >= r.ry && cy < r.ry + r.rh) {
        hit = r;
        break;
      }
    }
    if (hit !== hovered) setHovered(hit);
    setMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleClick = (e: React.MouseEvent) => {
    if (hovered && hovered.url) window.open(hovered.url, "_blank");
  };

  const handleMouseLeave = () => setHovered(null);

  const totalJobs = data.reduce((s, d) => s + (d.jobs || 0), 0);

  // Gradient helper component
  const GradientLegend = () => {
    const lgRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
      const c = lgRef.current;
      if (!c) return;
      const gctx = c.getContext("2d");
      if (!gctx) return;
      for (let x = 0; x < 80; x++) {
        const t = x / 79;
        gctx.fillStyle = colorMode === "exposure" ? greenRedCSS(t, 1) : greenRedCSS(1 - t, 1);
        gctx.fillRect(x, 0, 1, 8);
      }
    }, [colorMode]);
    const cfg = {
      exposure: { low: "低", high: "高" },
      outlook: { low: "衰退", high: "增长" },
      pay: { low: "$25K", high: "$250K" },
      education: { low: "无学历要求", high: "博士/专业" },
    }[colorMode];
    return (
      <div className="flex items-center gap-[6px] text-[11px] text-[#888894]">
         <span>{cfg.low}</span>
         <canvas ref={lgRef} width={80} height={8} className="rounded-sm"></canvas>
         <span>{cfg.high}</span>
      </div>
    );
  };

  // Tooltip helper formatting
  const renderTooltipHighlight = (d: Rect) => {
    if (colorMode === "exposure" && d.exposure != null) {
      const color = exposureColor(d.exposure, 1);
      return (
        <div>
          <span style={{color, fontWeight: 600}}>AI 暴露度: {d.exposure}/10</span>
          <div className="mt-[3px] h-[4px] bg-[rgba(255,255,255,0.08)] rounded-sm">
            <div style={{height: '100%', width: `${d.exposure * 10}%`, background: color, borderRadius: '2px'}}></div>
          </div>
        </div>
      );
    } else if (colorMode === "outlook" && d.outlook != null) {
      const color = outlookColor(d.outlook, 1);
      return (
        <div>
          <span style={{color, fontWeight: 600}}>增长前景: {d.outlook > 0 ? '+' : ''}{d.outlook}%</span>
          {d.outlook_desc && <span className="text-[#888894]">({d.outlook_desc})</span>}
          <div className="mt-[3px] h-[4px] bg-[rgba(255,255,255,0.08)] rounded-sm">
            <div style={{height: '100%', width: `${Math.min(100, Math.max(0, (d.outlook + 10) / 30 * 100))}%`, background: color, borderRadius: '2px'}}></div>
          </div>
        </div>
      )
    } else if (colorMode === "pay" && d.pay != null) {
      const color = payColor(d.pay, 1);
      return (
        <div>
          <span style={{color, fontWeight: 600}}>中位数薪酬: {formatPay(d.pay)}</span>
          <div className="mt-[3px] h-[4px] bg-[rgba(255,255,255,0.08)] rounded-sm">
            <div style={{height: '100%', width: `${Math.min(100, d.pay / 150000 * 100)}%`, background: color, borderRadius: '2px'}}></div>
          </div>
        </div>
      )
    } else if (colorMode === "education") {
      const idx = EDU_LEVELS.indexOf(d.education);
      const color = idx >= 0 ? eduColor(idx, 1) : "var(--fg)";
      const short: Record<string, string> = {
        "No formal educational credential": "无学历要求",
        "High school diploma or equivalent": "高中及同等学历",
        "Postsecondary nondegree award": "大专预科",
        "Some college, no degree": "大学肄业",
        "Associate's degree": "副学士",
        "Bachelor's degree": "学士",
        "Master's degree": "硕士",
        "Doctoral or professional degree": "博士/专业",
      };
      return <span style={{color, fontWeight: 600}}>学历要求: {short[d.education] || d.education || '—'}</span>;
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e0e0e8] font-sans">
      <div id="wrapper" className="max-w-[1400px] w-full mx-auto pb-[250px]" ref={wrapperRef}>
        <div id="header" className="p-5 px-7 pb-4 shrink-0">
          <div className="mb-4">
            <h1 className="text-[26px] font-bold tracking-tight mb-3 flex items-center gap-3.5 flex-wrap">
              美国就业市场可视化 <a href="https://github.com/karpathy/jobs" className="text-[13px] font-normal text-[#888894] hover:underline">GitHub</a>
            </h1>
            <p className="text-[15px] leading-relaxed text-[#888894] mb-2">
              这是一个研究工具，对来自<a href="https://www.bls.gov/ooh/" className="text-[#888894]">美国劳工统计局职业展望手册</a>的 <strong className="text-[#e0e0e8] font-semibold">342 个职业</strong> 进行可视化，涵盖了美国经济中的 <strong className="text-[#e0e0e8] font-semibold">1.43亿个工作岗位</strong>。每个矩形的<strong className="text-[#e0e0e8] font-semibold">面积</strong>与总就业人数成正比。<strong className="text-[#e0e0e8] font-semibold">颜色</strong>显示所选的指标 &mdash; 可以在美国劳工统计局预计增长前景、中位数薪酬、学历要求和人工智能暴露度之间切换。点击任何方块即可查看其完整的劳工统计局页面。这不是一份报告、论文或严肃的经济出版物 &mdash; 它是一个以可视化方式探索劳工统计局数据的开发工具。
            </p>
          </div>

          <div className="flex items-center gap-3.5 flex-wrap mb-3.5">
            <div className="flex flex-col gap-1">
              <h3 className="text-[11px] font-semibold uppercase tracking-widest text-[#888894]">图层</h3>
              <div className="flex gap-1" id="colorToggle">
                {["outlook", "pay", "education", "exposure"].map((mode) => (
                  <button 
                    key={mode}
                    onClick={() => setColorMode(mode as any)}
                    className={`px-3.5 py-1.5 text-xs font-medium border rounded transition-all duration-150 ${colorMode === mode ? "bg-[rgba(255,255,255,0.08)] text-[#e0e0e8] border-[rgba(255,255,255,0.2)]" : "bg-transparent text-[#888894] border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.04)]"}`}
                  >
                    {mode === 'outlook' ? 'BLS 增长前景' : mode === 'pay' ? '中位数薪酬' : mode === 'education' ? '学历要求' : 'AI 暴露度'}
                  </button>
                ))}
              </div>
            </div>
            <GradientLegend />
          </div>

          <div className="flex flex-wrap gap-x-7 gap-y-5 items-start mb-3">
            <div className="flex flex-col gap-1">
              <h3 className="text-[11px] font-semibold uppercase tracking-widest text-[#888894]">总岗位数</h3>
              <div className="text-[32px] font-bold tracking-tight leading-none">{formatNumber(totalJobs)}</div>
            </div>
          </div>
        </div>

        <canvas 
          ref={canvasRef} 
          id="canvas" 
          className="block w-full cursor-default"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
          style={{ cursor: hovered ? 'pointer' : 'default' }}
        />
      </div>

      {hovered && (
        <div 
          style={{
            left: (mousePos.x + 356 > window.innerWidth ? mousePos.x - 356 : mousePos.x + 16) + 'px', 
            top: (mousePos.y + 200 > window.innerHeight ? mousePos.y - 200 : mousePos.y + 16 < 10 ? mousePos.y + 16 : mousePos.y - 16) + 'px'
          }}
          className="fixed pointer-events-none bg-[#12121a] border border-[rgba(255,255,255,0.12)] rounded-lg p-3 px-4 text-[13px] leading-relaxed max-w-[340px] z-20 shadow-[0_8px_32px_rgba(0,0,0,0.6)]"
        >
          <div className="font-semibold text-[14px] mb-0.5 text-white">{hovered.title_zh || hovered.title}</div>
          <div className="text-[11px] mb-2 text-[#888894] font-medium">{hovered.title}</div>
          <div className="text-[12px] mb-2">{renderTooltipHighlight(hovered)}</div>
          <div className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-[12px]">
            <span className="text-[#888894]">中位数薪酬</span><span className="text-[#e0e0e8] text-right">{formatPay(hovered.pay)}</span>
            <span className="text-[#888894]">岗位数 (2024)</span><span className="text-[#e0e0e8] text-right">{formatNumber(hovered.jobs)}</span>
            <span className="text-[#888894]">增长前景</span><span className="text-[#e0e0e8] text-right">{hovered.outlook != null ? hovered.outlook + '%' : '—'} {hovered.outlook_desc ? '(' + hovered.outlook_desc + ')' : ''}</span>
            <span className="text-[#888894]">学历要求</span><span className="text-[#e0e0e8] text-right">{(() => {
              const short: Record<string, string> = {
                "No formal educational credential": "无学历要求",
                "High school diploma or equivalent": "高中及同等学历",
                "Postsecondary nondegree award": "大专预科",
                "Some college, no degree": "大学肄业",
                "Associate's degree": "副学士",
                "Bachelor's degree": "学士",
                "Master's degree": "硕士",
                "Doctoral or professional degree": "博士/专业",
              };
              return hovered.education ? (short[hovered.education] || hovered.education) : '—';
            })()}</span>
          </div>
          {colorMode === "exposure" && hovered.exposure_rationale && (
            <div className="text-[11px] text-[#888894] mt-2 leading-tight border-t border-[rgba(255,255,255,0.06)] pt-2">
              {hovered.exposure_rationale}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
