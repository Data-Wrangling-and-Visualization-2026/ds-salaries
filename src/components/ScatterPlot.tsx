import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

export type ScatterDatum = {
  x: number;
  y: number;
  label: string;
  iso3?: string;
};

type TooltipState = {
  left: number;
  top: number;
  d: ScatterDatum;
} | null;

type Props = {
  data: ScatterDatum[];
  xLabel?: string;
  yLabel?: string;
  formatX?: (v: number) => string;
  formatY?: (v: number) => string;
  height?: number;
  onSelect?: (iso3: string) => void;
};

const WIDTH = 520;

const ScatterPlot = ({
  data,
  xLabel,
  yLabel,
  formatX,
  formatY,
  height = 320,
  onSelect,
}: Props) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState>(null);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const margin = { top: 20, right: 20, bottom: 44, left: 60 };
    const innerWidth = WIDTH - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${WIDTH} ${height}`);

    const xExtent = d3.extent(data, (d) => d.x) as [number, number];
    const yExtent = d3.extent(data, (d) => d.y) as [number, number];

    const xPad = (xExtent[1] - xExtent[0]) * 0.06;
    const yPad = (yExtent[1] - yExtent[0]) * 0.08;

    const x = d3
      .scaleLinear()
      .domain([Math.max(0, xExtent[0] - xPad), xExtent[1] + xPad])
      .range([0, innerWidth]);

    const y = d3
      .scaleLinear()
      .domain([Math.max(0, yExtent[0] - yPad), yExtent[1] + yPad])
      .range([innerHeight, 0]);

    // Trend line (ordinary least squares)
    const mx = d3.mean(data, (d) => d.x)!;
    const my = d3.mean(data, (d) => d.y)!;
    const slope =
      data.reduce((s, d) => s + (d.x - mx) * (d.y - my), 0) /
      data.reduce((s, d) => s + (d.x - mx) ** 2, 0);
    const intercept = my - slope * mx;

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left}, ${margin.top})`);

    // Grid lines
    g.append("g")
      .attr("class", "grid")
      .call(
        d3
          .axisLeft(y)
          .ticks(5)
          .tickSize(-innerWidth)
          .tickFormat(() => "")
      )
      .call((axis) => axis.selectAll("line").attr("stroke", "#1f2b3e").attr("stroke-width", 1))
      .call((axis) => axis.select(".domain").remove());

    // Trend line
    const trendX0 = xExtent[0];
    const trendX1 = xExtent[1];
    g.append("line")
      .attr("x1", x(trendX0))
      .attr("y1", y(slope * trendX0 + intercept))
      .attr("x2", x(trendX1))
      .attr("y2", y(slope * trendX1 + intercept))
      .attr("stroke", "#48a9ff")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "5,4")
      .attr("opacity", 0.45);

    // Dots
    g.selectAll("circle")
      .data(data)
      .join("circle")
      .attr("cx", (d) => x(d.x))
      .attr("cy", (d) => y(d.y))
      .attr("r", 5)
      .attr("fill", "#f9f871")
      .attr("stroke", "#0b1220")
      .attr("stroke-width", 1)
      .attr("opacity", 0.8)
      .style("cursor", (d) => (d.iso3 && onSelect ? "pointer" : "default"))
      .on("mouseover", function (_event, d) {
        d3.select(this).attr("r", 7).attr("opacity", 1);
        const svgEl = svgRef.current!;
        const rect = svgEl.getBoundingClientRect();
        const svgWidth = rect.width;
        const svgHeight = rect.height;
        const scaleX = svgWidth / WIDTH;
        const scaleY = svgHeight / height;
        const dotX = (x(d.x) + margin.left) * scaleX;
        const dotY = (y(d.y) + margin.top) * scaleY;
        setTooltip({ left: dotX, top: dotY, d });
      })
      .on("mouseout", function () {
        d3.select(this).attr("r", 5).attr("opacity", 0.8);
        setTooltip(null);
      })
      .on("click", (_, d) => {
        if (d.iso3 && onSelect) onSelect(d.iso3);
      });

    // Axes
    g.append("g")
      .attr("transform", `translate(0, ${innerHeight})`)
      .call(
        d3
          .axisBottom(x)
          .ticks(5)
          .tickFormat((v) => (formatX ? formatX(v as number) : String(v)))
      )
      .call((axis) =>
        axis.selectAll("text").attr("fill", "#cbd5e1").attr("font-size", 11)
      )
      .call((axis) =>
        axis.selectAll("path, line").attr("stroke", "#334155")
      );

    g.append("g")
      .call(
        d3
          .axisLeft(y)
          .ticks(5)
          .tickFormat((v) => (formatY ? formatY(v as number) : String(v)))
      )
      .call((axis) =>
        axis.selectAll("text").attr("fill", "#cbd5e1").attr("font-size", 11)
      )
      .call((axis) =>
        axis.selectAll("path, line").attr("stroke", "#334155")
      );

    // Axis labels
    if (xLabel) {
      svg
        .append("text")
        .attr("x", margin.left + innerWidth / 2)
        .attr("y", height - 4)
        .attr("text-anchor", "middle")
        .attr("fill", "#94a3b8")
        .attr("font-size", 11)
        .text(xLabel);
    }
    if (yLabel) {
      svg
        .append("text")
        .attr(
          "transform",
          `translate(14, ${margin.top + innerHeight / 2}) rotate(-90)`
        )
        .attr("text-anchor", "middle")
        .attr("fill", "#94a3b8")
        .attr("font-size", 11)
        .text(yLabel);
    }

    // Pearson r label
    const xStd = Math.sqrt(d3.mean(data, (d) => (d.x - mx) ** 2)!);
    const yStd = Math.sqrt(d3.mean(data, (d) => (d.y - my) ** 2)!);
    const r = xStd > 0 && yStd > 0 ? (slope * xStd) / yStd : 0;
    svg
      .append("text")
      .attr("x", WIDTH - margin.right - 4)
      .attr("y", margin.top + 12)
      .attr("text-anchor", "end")
      .attr("fill", "#475569")
      .attr("font-size", 11)
      .text(`r = ${r.toFixed(2)}`);
  }, [data, xLabel, yLabel, formatX, formatY, height, onSelect]);

  return (
    <div style={{ position: "relative" }}>
      <svg ref={svgRef} className="chart" />
      {tooltip && (
        <div
          className="scatter-tooltip"
          style={{ left: tooltip.left + 10, top: tooltip.top - 36 }}
        >
          <strong>{tooltip.d.label}</strong>
          <br />
          {xLabel ?? "X"}: {formatX ? formatX(tooltip.d.x) : tooltip.d.x}
          <br />
          {yLabel ?? "Y"}: {formatY ? formatY(tooltip.d.y) : tooltip.d.y}
        </div>
      )}
    </div>
  );
};

export default ScatterPlot;
