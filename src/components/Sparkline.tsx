import { useEffect, useRef } from "react";
import * as d3 from "d3";

type Props = {
  data: { year: number; value: number }[];
  color?: string;
  width?: number;
  height?: number;
};

const Sparkline = ({ data, color = "#94a3b8", width = 180, height = 32 }: Props) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current || data.length < 2) return;

    const arrowW = 8;
    const pad = { top: 4, right: arrowW + 2, bottom: 4, left: 4 };
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const x = d3
      .scaleLinear()
      .domain(d3.extent(data, (d) => d.year) as [number, number])
      .range([pad.left, pad.left + innerW]);

    const [minVal, maxVal] = d3.extent(data, (d) => d.value) as [number, number];
    const yPad = (maxVal - minVal) * 0.15 || 1;
    const y = d3
      .scaleLinear()
      .domain([minVal - yPad, maxVal + yPad])
      .range([pad.top + innerH, pad.top]);

    const line = d3
      .line<{ year: number; value: number }>()
      .x((d) => x(d.year))
      .y((d) => y(d.value))
      .curve(d3.curveMonotoneX);

    const g = svg.append("g");

    // Main line
    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", color)
      .attr("stroke-width", 1.5)
      .attr("stroke-linecap", "round")
      .attr("d", line);

    // Arrow at end
    const last = data[data.length - 1];
    const secondLast = data[data.length - 2];
    const lx = x(last.year);
    const ly = y(last.value);
    const slx = x(secondLast.year);
    const sly = y(secondLast.value);
    const angle = Math.atan2(ly - sly, lx - slx) * (180 / Math.PI);

    g.append("polygon")
      .attr("points", `0,-3.5 ${arrowW},-0 0,3.5`)
      .attr("fill", color)
      .attr(
        "transform",
        `translate(${lx},${ly}) rotate(${angle})`
      );
  }, [data, color, width, height]);

  return (
    <svg
      ref={svgRef}
      style={{ display: "block", width, height }}
      viewBox={`0 0 ${width} ${height}`}
    />
  );
};

export default Sparkline;
