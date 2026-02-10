import { useEffect, useRef } from "react";
import * as d3 from "d3";

export type Series = {
  label: string;
  color: string;
  values: { year: number; value: number }[];
};

type Props = {
  series: Series[];
  height?: number;
};

const MultiLineChart = ({ series, height = 260 }: Props) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current || series.length === 0) return;

    const width = 520;
    const margin = { top: 20, right: 40, bottom: 30, left: 48 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const allValues = series.flatMap((s) => s.values);
    const years = allValues.map((d) => d.year);
    const values = allValues.map((d) => d.value);

    const x = d3
      .scaleLinear()
      .domain([Math.min(...years), Math.max(...years)])
      .range([0, innerWidth]);

    const y = d3
      .scaleLinear()
      .domain([0, Math.max(...values) * 1.1])
      .range([innerHeight, 0]);

    const line = d3
      .line<{ year: number; value: number }>()
      .x((d) => x(d.year))
      .y((d) => y(d.value))
      .curve(d3.curveMonotoneX);

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left}, ${margin.top})`);

    series.forEach((s) => {
      g.append("path")
        .datum(s.values)
        .attr("fill", "none")
        .attr("stroke", s.color)
        .attr("stroke-width", 2.2)
        .attr("d", line);

      g.selectAll(`circle-${s.label}`)
        .data(s.values)
        .join("circle")
        .attr("cx", (d) => x(d.year))
        .attr("cy", (d) => y(d.value))
        .attr("r", 3.5)
        .attr("fill", s.color)
        .attr("stroke", "#0b1220")
        .attr("stroke-width", 0.8);
    });

    const axisBottom = d3.axisBottom(x).ticks(series[0].values.length).tickFormat(d3.format("d"));
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

    const legend = svg.append("g").attr("transform", `translate(${width - 140}, 18)`);

    series.forEach((s, idx) => {
      const yOffset = idx * 18;
      legend
        .append("rect")
        .attr("x", 0)
        .attr("y", yOffset - 8)
        .attr("width", 10)
        .attr("height", 10)
        .attr("fill", s.color);
      legend
        .append("text")
        .attr("x", 16)
        .attr("y", yOffset + 1)
        .attr("fill", "#cbd5e1")
        .attr("font-size", 11)
        .text(s.label);
    });
  }, [series, height]);

  return <svg ref={svgRef} className="chart" />;
};

export default MultiLineChart;
