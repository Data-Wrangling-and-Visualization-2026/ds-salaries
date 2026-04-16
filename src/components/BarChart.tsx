import { useEffect, useRef } from "react";
import * as d3 from "d3";

export type BarDatum = {
  label: string;
  value: number;
  iso3?: string;
};

type Props = {
  data: BarDatum[];
  formatValue?: (v: number) => string;
  color?: string;
  onSelect?: (iso3: string) => void;
};

const BAR_HEIGHT = 22;
const MARGIN = { top: 8, right: 90, bottom: 28, left: 130 };
const WIDTH = 520;

const BarChart = ({ data, formatValue, color = "#48a9ff", onSelect }: Props) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const sliced = data.slice(0, 10);
    const innerHeight = sliced.length * BAR_HEIGHT;
    const totalHeight = innerHeight + MARGIN.top + MARGIN.bottom;
    const innerWidth = WIDTH - MARGIN.left - MARGIN.right;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${WIDTH} ${totalHeight}`);

    const maxVal = d3.max(sliced, (d) => d.value) ?? 1;

    const x = d3
      .scaleLinear()
      .domain([0, maxVal * 1.08])
      .range([0, innerWidth]);

    const y = d3
      .scaleBand()
      .domain(sliced.map((d) => d.label))
      .range([0, innerHeight])
      .padding(0.28);

    const g = svg
      .append("g")
      .attr("transform", `translate(${MARGIN.left}, ${MARGIN.top})`);

    // Grid lines
    g.selectAll(".grid-line")
      .data(x.ticks(5))
      .join("line")
      .attr("class", "grid-line")
      .attr("x1", (v) => x(v))
      .attr("x2", (v) => x(v))
      .attr("y1", 0)
      .attr("y2", innerHeight)
      .attr("stroke", "#1f2b3e")
      .attr("stroke-width", 1);

    // Bars
    g.selectAll(".bar")
      .data(sliced)
      .join("rect")
      .attr("class", "bar")
      .attr("y", (d) => y(d.label)!)
      .attr("height", y.bandwidth())
      .attr("x", 0)
      .attr("width", (d) => x(d.value))
      .attr("fill", color)
      .attr("rx", 4)
      .attr("opacity", 0.82)
      .style("cursor", (d) => (d.iso3 && onSelect ? "pointer" : "default"))
      .on("click", (_, d) => {
        if (d.iso3 && onSelect) onSelect(d.iso3);
      })
      .on("mouseover", function () {
        d3.select(this).attr("opacity", 1);
      })
      .on("mouseout", function () {
        d3.select(this).attr("opacity", 0.82);
      });

    // Country name labels (left)
    g.selectAll(".bar-label")
      .data(sliced)
      .join("text")
      .attr("class", "bar-label")
      .attr("x", -8)
      .attr("y", (d) => y(d.label)! + y.bandwidth() / 2 + 4)
      .attr("text-anchor", "end")
      .attr("fill", "#cbd5e1")
      .attr("font-size", 11)
      .style("cursor", (d) => (d.iso3 && onSelect ? "pointer" : "default"))
      .text((d) =>
        d.label.length > 17 ? d.label.slice(0, 16) + "…" : d.label
      )
      .on("click", (_, d) => {
        if (d.iso3 && onSelect) onSelect(d.iso3);
      });

    // Rank labels (far left)
    g.selectAll(".rank-label")
      .data(sliced)
      .join("text")
      .attr("class", "rank-label")
      .attr("x", -MARGIN.left + 6)
      .attr("y", (d) => y(d.label)! + y.bandwidth() / 2 + 4)
      .attr("fill", "#475569")
      .attr("font-size", 11)
      .text((_, i) => `#${i + 1}`);

    // Value labels (right of bar)
    g.selectAll(".value-label")
      .data(sliced)
      .join("text")
      .attr("class", "value-label")
      .attr("x", (d) => x(d.value) + 7)
      .attr("y", (d) => y(d.label)! + y.bandwidth() / 2 + 4)
      .attr("fill", "#94a3b8")
      .attr("font-size", 11)
      .text((d) => (formatValue ? formatValue(d.value) : String(d.value)));

    // X axis
    g.append("g")
      .attr("transform", `translate(0, ${innerHeight})`)
      .call(
        d3
          .axisBottom(x)
          .ticks(5)
          .tickFormat((v) =>
            formatValue ? formatValue(v as number) : String(v)
          )
      )
      .call((axis) =>
        axis.selectAll("text").attr("fill", "#94a3b8").attr("font-size", 10)
      )
      .call((axis) =>
        axis.selectAll("path, line").attr("stroke", "#334155")
      );
  }, [data, formatValue, color, onSelect]);

  return <svg ref={svgRef} className="chart" />;
};

export default BarChart;
