import { useEffect, useRef } from "react";
import * as d3 from "d3";

export type LinePoint = { year: number; value: number };

type Props = {
  data: LinePoint[];
  height?: number;
  yLabel?: string;
  formatValue?: (value: number) => string;
};

const LineChart = ({ data, height = 260, yLabel, formatValue }: Props) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const width = 520;
    const margin = { top: 20, right: 20, bottom: 30, left: 48 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const x = d3
      .scaleLinear()
      .domain(d3.extent(data, (d) => d.year) as [number, number])
      .range([0, innerWidth]);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => d.value)! * 1.1])
      .range([innerHeight, 0]);

    const line = d3
      .line<LinePoint>()
      .x((d) => x(d.year))
      .y((d) => y(d.value))
      .curve(d3.curveMonotoneX);

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left}, ${margin.top})`);

    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#48a9ff")
      .attr("stroke-width", 2.5)
      .attr("d", line);

    g.selectAll("circle")
      .data(data)
      .join("circle")
      .attr("cx", (d) => x(d.year))
      .attr("cy", (d) => y(d.value))
      .attr("r", 4)
      .attr("fill", "#f9f871")
      .attr("stroke", "#0b1220")
      .attr("stroke-width", 1);

    const axisBottom = d3.axisBottom(x).ticks(data.length).tickFormat(d3.format("d"));
    const axisLeft = d3.axisLeft(y).ticks(5);

    g.append("g")
      .attr("transform", `translate(0, ${innerHeight})`)
      .call(axisBottom)
      .call((axis) =>
        axis.selectAll("text").attr("fill", "#cbd5e1").attr("font-size", 11)
      )
      .call((axis) => axis.selectAll("path, line").attr("stroke", "#334155"));

    g.append("g")
      .call(axisLeft)
      .call((axis) =>
        axis.selectAll("text").attr("fill", "#cbd5e1").attr("font-size", 11)
      )
      .call((axis) => axis.selectAll("path, line").attr("stroke", "#334155"));

    if (yLabel) {
      g.append("text")
        .attr("x", -margin.left + 6)
        .attr("y", -6)
        .attr("fill", "#94a3b8")
        .attr("font-size", 11)
        .text(yLabel);
    }

    if (formatValue) {
      g.selectAll("circle").append("title").text((d) => formatValue(d.value));
    }
  }, [data, height, yLabel, formatValue]);

  return <svg ref={svgRef} className="chart" />;
};

export default LineChart;
