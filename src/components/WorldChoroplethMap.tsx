import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import { CountryMetricYear, MetricKey } from "../types/metrics";
import { metricMeta } from "../utils/metricMeta";
import { formatCurrency, formatPercent, formatScore } from "../utils/format";

type GeoFeature = {
  type: "Feature";
  geometry: Geometry;
  properties: GeoJsonProperties & { ISO_A3?: string; ADMIN?: string };
};

type Props = {
  data: CountryMetricYear[];
  metric: MetricKey;
  normalizeSalary: boolean;
  selectedIso3: string | null;
  onSelect: (iso3: string, country: string | undefined) => void;
};

const formatValue = (metric: MetricKey, value: number) => {
  if (metric === "avg_salary_usd") {
    return formatCurrency(value, 0);
  }
  if (metric === "inflation" || metric === "unemployment") {
    return formatPercent(value, 1);
  }
  if (metric === "cpi" || metric === "composite_score") {
    return formatScore(value, 1);
  }
  return formatScore(value, 1);
};

const WorldChoroplethMap = ({
  data,
  metric,
  normalizeSalary,
  selectedIso3,
  onSelect
}: Props) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [geoData, setGeoData] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    const loadGeo = async () => {
      const response = await fetch("/world.geojson");
      const json = (await response.json()) as FeatureCollection;
      setGeoData(json);
    };
    loadGeo();
  }, []);

  const valueByIso = useMemo(() => {
    const map = new Map<string, CountryMetricYear>();
    data.forEach((row) => map.set(row.iso3, row));
    return map;
  }, [data]);

  useEffect(() => {
    if (!geoData || !svgRef.current || !wrapperRef.current) {
      return;
    }

    const containerWidth = wrapperRef.current.clientWidth || 960;
    const width = Math.max(containerWidth, 640);
    const height = 520;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const projection = d3.geoNaturalEarth1().fitSize([width, height], geoData);
    const path = d3.geoPath(projection);

    const values = geoData.features
      .map((feature) => {
        const iso3 = (feature as GeoFeature).properties?.ISO_A3;
        if (!iso3) {
          return null;
        }
        const row = valueByIso.get(iso3);
        if (!row) {
          return null;
        }
        const raw =
          metric === "avg_salary_usd" && normalizeSalary
            ? row.avg_salary_usd / (1 + row.inflation / 100)
            : row[metric];
        return raw;
      })
      .filter((value): value is number => value !== null && !Number.isNaN(value));

    const minValue = values.length ? d3.min(values)! : 0;
    const maxValue = values.length ? d3.max(values)! : 1;

    const isPositive = metricMeta[metric].isPositive;
    const colorScale = d3
      .scaleSequential(d3.interpolateYlGnBu)
      .domain(isPositive ? [minValue, maxValue] : [maxValue, minValue]);

    const mapLayer = svg.append("g").attr("class", "map-layer");

    mapLayer
      .selectAll("path")
      .data(geoData.features)
      .join("path")
      .attr("d", (d) => path(d as GeoFeature) || "")
      .attr("fill", (d) => {
        const iso3 = (d as GeoFeature).properties?.ISO_A3;
        if (!iso3) return "#1f2c3a";
        const row = valueByIso.get(iso3);
        if (!row) return "#1f2c3a";
        const value =
          metric === "avg_salary_usd" && normalizeSalary
            ? row.avg_salary_usd / (1 + row.inflation / 100)
            : row[metric];
        if (!Number.isFinite(value)) {
          return "#1f2c3a";
        }
        return colorScale(value);
      })
      .attr("stroke", "#0e1621")
      .attr("stroke-width", 0.6)
      .attr("opacity", (d) => {
        const iso3 = (d as GeoFeature).properties?.ISO_A3;
        return selectedIso3 && iso3 === selectedIso3 ? 1 : 0.95;
      })
      .on("mouseenter", (event, d) => {
        if (!tooltipRef.current) return;
        const iso3 = (d as GeoFeature).properties?.ISO_A3;
        const name = (d as GeoFeature).properties?.ADMIN;
        const row = iso3 ? valueByIso.get(iso3) : undefined;
        const value = row
          ? metric === "avg_salary_usd" && normalizeSalary
            ? row.avg_salary_usd / (1 + row.inflation / 100)
            : row[metric]
          : null;
        tooltipRef.current.style.opacity = "1";
        tooltipRef.current.innerHTML = `
          <div class="tooltip-title">${name || iso3 || "Unknown"}</div>
          <div>${metricMeta[metric].label}: ${
            value !== null && Number.isFinite(value) ? formatValue(metric, value) : "N/A"
          }</div>
        `;
      })
      .on("mousemove", (event) => {
        if (!tooltipRef.current) return;
        tooltipRef.current.style.left = `${event.offsetX + 12}px`;
        tooltipRef.current.style.top = `${event.offsetY + 12}px`;
      })
      .on("mouseleave", () => {
        if (!tooltipRef.current) return;
        tooltipRef.current.style.opacity = "0";
      })
      .on("click", (event, d) => {
        const iso3 = (d as GeoFeature).properties?.ISO_A3;
        const name = (d as GeoFeature).properties?.ADMIN;
        if (!iso3) return;
        onSelect(iso3, name);
      });

    const legendWidth = 200;
    const legendHeight = 10;
    const legendX = width - legendWidth - 24;
    const legendY = height - 40;

    const defs = svg.append("defs");
    const gradientId = "legend-gradient";
    const gradient = defs
      .append("linearGradient")
      .attr("id", gradientId)
      .attr("x1", "0%")
      .attr("x2", "100%");

    const steps = 8;
    d3.range(steps).forEach((i) => {
      const t = i / (steps - 1);
      gradient
        .append("stop")
        .attr("offset", `${t * 100}%`)
        .attr("stop-color", colorScale(isPositive ? minValue + t * (maxValue - minValue) : maxValue - t * (maxValue - minValue)));
    });

    svg
      .append("rect")
      .attr("x", legendX)
      .attr("y", legendY)
      .attr("width", legendWidth)
      .attr("height", legendHeight)
      .attr("fill", `url(#${gradientId})`)
      .attr("rx", 4);

    svg
      .append("text")
      .attr("x", legendX)
      .attr("y", legendY - 6)
      .attr("fill", "#cbd5e1")
      .attr("font-size", 11)
      .text(formatValue(metric, minValue));

    svg
      .append("text")
      .attr("x", legendX + legendWidth)
      .attr("y", legendY - 6)
      .attr("fill", "#cbd5e1")
      .attr("font-size", 11)
      .attr("text-anchor", "end")
      .text(formatValue(metric, maxValue));

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 6])
      .on("zoom", (event) => {
        mapLayer.attr("transform", event.transform.toString());
      });

    svg.call(zoom as unknown as d3.ZoomBehavior<SVGSVGElement, unknown>);
  }, [geoData, metric, normalizeSalary, selectedIso3, valueByIso, onSelect]);

  return (
    <div className="map-wrapper" ref={wrapperRef}>
      <div className="map-title">
        {metricMeta[metric].label}
        {metric === "avg_salary_usd" && normalizeSalary ? " (Real)" : ""}
      </div>
      <svg ref={svgRef} className="world-map" />
      <div ref={tooltipRef} className="map-tooltip" />
    </div>
  );
};

export default WorldChoroplethMap;
