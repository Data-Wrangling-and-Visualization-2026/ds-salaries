import { useEffect, useRef } from "react";
import * as d3 from "d3";

export type BubbleDatum = {
  label: string;
  size: number;
  value: number;
};

type Props = {
  data: BubbleDatum[];
  sizeLabel?: string;
  valueLabel?: string;
  formatValue?: (v: number) => string;
  formatSize?: (v: number) => string;
  height?: number;
};

const BubbleChart = ({
  data,
  sizeLabel = "Count",
  valueLabel = "Median Salary",
  formatValue = (v) => `$${v.toLocaleString()}`,
  formatSize = (v) => v.toString(),
  height = 520,
}: Props) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!svgRef.current || !wrapperRef.current || data.length === 0) return;

    const width = wrapperRef.current.clientWidth || 760;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const minVal = d3.min(data, (d) => d.value)!;
    const maxVal = d3.max(data, (d) => d.value)!;
    const minSize = d3.min(data, (d) => d.size)!;
    const maxSize = d3.max(data, (d) => d.size)!;

    const colorScale = d3
      .scaleSequential(d3.interpolateBlues)
      .domain([minVal, maxVal]);

    const radiusScale = d3
      .scaleSqrt()
      .domain([minSize, maxSize])
      .range([18, 60]);

    const nodes = data.map((d) => ({
      ...d,
      r: radiusScale(d.size),
    }));

    const simulation = d3
      .forceSimulation(nodes as d3.SimulationNodeDatum[])
      .force("charge", d3.forceManyBody().strength(5))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force(
        "collision",
        d3.forceCollide((d: any) => d.r + 3)
      )
      .stop();

    for (let i = 0; i < 200; i++) simulation.tick();

    const g = svg.append("g");

    const bubbles = g
      .selectAll("g.bubble")
      .data(nodes)
      .join("g")
      .attr("class", "bubble")
      .attr("transform", (d: any) => `translate(${d.x},${d.y})`);

    bubbles
      .append("circle")
      .attr("r", (d: any) => d.r)
      .attr("fill", (d: any) => colorScale(d.value))
      .attr("fill-opacity", 0.85)
      .attr("stroke", "#1e293b")
      .attr("stroke-width", 1)
      .on("mouseenter", (_event, d: any) => {
        if (!tooltipRef.current) return;
        tooltipRef.current.style.opacity = "1";
        tooltipRef.current.innerHTML = `
          <div class="tooltip-title">${d.label}</div>
          <div>${sizeLabel}: ${formatSize(d.size)}</div>
          <div>${valueLabel}: ${formatValue(d.value)}</div>
        `;
      })
      .on("mousemove", (event) => {
        if (!tooltipRef.current || !wrapperRef.current) return;
        const rect = wrapperRef.current.getBoundingClientRect();
        tooltipRef.current.style.left = `${event.clientX - rect.left + 12}px`;
        tooltipRef.current.style.top = `${event.clientY - rect.top + 12}px`;
      })
      .on("mouseleave", () => {
        if (!tooltipRef.current) return;
        tooltipRef.current.style.opacity = "0";
      });

    bubbles
      .filter((d: any) => d.r >= 30)
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("fill", "#f1f5f9")
      .attr("font-size", (d: any) => Math.min(d.r * 0.28, 13))
      .attr("pointer-events", "none")
      .each(function (d: any) {
        const el = d3.select(this);
        const words = d.label.split(" ");
        const maxLineWidth = d.r * 1.5;
        let line = "";
        let lineNumber = 0;
        const lineHeight = Math.min(d.r * 0.28, 13) * 1.2;
        const dy0 = words.length > 1 ? -lineHeight / 2 : 0;

        words.forEach((word: string, i: number) => {
          const testLine = line ? `${line} ${word}` : word;
          if (testLine.length * (Math.min(d.r * 0.28, 13) * 0.6) > maxLineWidth && i > 0) {
            el.append("tspan")
              .attr("x", 0)
              .attr("dy", lineNumber === 0 ? dy0 : lineHeight)
              .text(line);
            line = word;
            lineNumber++;
          } else {
            line = testLine;
          }
        });
        el.append("tspan")
          .attr("x", 0)
          .attr("dy", lineNumber === 0 ? dy0 : lineHeight)
          .text(line);
      });

    // Color legend
    const legendW = 140;
    const legendH = 10;
    const legendX = width - legendW - 20;
    const legendY = height - 36;

    const defs = svg.append("defs");
    const grad = defs
      .append("linearGradient")
      .attr("id", "bubble-color-grad");
    grad.append("stop").attr("offset", "0%").attr("stop-color", colorScale(minVal));
    grad.append("stop").attr("offset", "100%").attr("stop-color", colorScale(maxVal));

    svg
      .append("rect")
      .attr("x", legendX)
      .attr("y", legendY)
      .attr("width", legendW)
      .attr("height", legendH)
      .attr("rx", 3)
      .attr("fill", "url(#bubble-color-grad)");

    svg
      .append("text")
      .attr("x", legendX)
      .attr("y", legendY - 4)
      .attr("fill", "#94a3b8")
      .attr("font-size", 10)
      .text(formatValue(minVal));

    svg
      .append("text")
      .attr("x", legendX + legendW)
      .attr("y", legendY - 4)
      .attr("text-anchor", "end")
      .attr("fill", "#94a3b8")
      .attr("font-size", 10)
      .text(formatValue(maxVal));
  }, [data, height, sizeLabel, valueLabel, formatValue, formatSize]);

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <svg ref={svgRef} className="chart" style={{ width: "100%", height }} />
      <div ref={tooltipRef} className="map-tooltip hpi-tooltip" />
    </div>
  );
};

export default BubbleChart;
