import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import { CountryMetricYear, MetricKey } from "../types/metrics";
import { metricMeta } from "../utils/metricMeta";

const COLOR_BINS = ["#7f1d1d", "#dc2626", "#f59e0b", "#84cc16", "#15803d"];
const NO_DATA_COLOR = "#e5e7eb";

const formatValue = (metric: MetricKey, value: number) =>
  metricMeta[metric].format(value);

type GeoFeature = {
  type: "Feature";
  geometry: Geometry;
  properties: GeoJsonProperties & { ISO_A3?: string; ADMIN?: string };
};

type Props = {
  data: CountryMetricYear[];
  metric: MetricKey;
  selectedIso3: string | null;
  onSelect: (iso3: string, country: string | undefined) => void;
};

const WorldMapHPI = ({ data, metric, selectedIso3, onSelect }: Props) => {
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
    if (!geoData || !svgRef.current || !wrapperRef.current) return;

    const containerWidth = wrapperRef.current.clientWidth || 960;
    const width = Math.max(containerWidth, 640);
    const height = 520;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const projection = d3.geoNaturalEarth1().fitSize([width, height], geoData);
    const path = d3.geoPath(projection);

    const accessor = metricMeta[metric].accessor;
    const values = geoData.features
      .map((feature) => {
        const iso3 = (feature as GeoFeature).properties?.ISO_A3;
        if (!iso3) return null;
        const row = valueByIso.get(iso3);
        if (!row) return null;
        const value = accessor(row as unknown as Record<string, number>);
        return Number.isFinite(value) ? value : null;
      })
      .filter((value): value is number => value !== null);

    const minValue = values.length ? d3.min(values)! : 0;
    const maxValue = values.length ? d3.max(values)! : 1;
    const domainMax = minValue === maxValue ? minValue + 1 : maxValue;

    const isPositive = metricMeta[metric].isPositive;
    const legendColors = COLOR_BINS;
    const scaleColors = isPositive ? legendColors : [...legendColors].reverse();

    const colorScale = d3
      .scaleQuantize<string>()
      .domain([minValue, domainMax])
      .range(scaleColors);

    const mapLayer = svg.append("g").attr("class", "map-layer");

    mapLayer
      .selectAll("path")
      .data(geoData.features)
      .join("path")
      .attr("d", (d) => path(d as GeoFeature) || "")
      .attr("fill", (d) => {
        const iso3 = (d as GeoFeature).properties?.ISO_A3;
        if (!iso3) return NO_DATA_COLOR;
        const row = valueByIso.get(iso3);
        if (!row) return NO_DATA_COLOR;
        const value = accessor(row as unknown as Record<string, number>);
        if (!Number.isFinite(value)) return NO_DATA_COLOR;
        return colorScale(value);
      })
      .attr("stroke", (d) => {
        const iso3 = (d as GeoFeature).properties?.ISO_A3;
        return selectedIso3 && iso3 === selectedIso3 ? "#0f172a" : "#ffffff";
      })
      .attr("stroke-width", (d) => {
        const iso3 = (d as GeoFeature).properties?.ISO_A3;
        return selectedIso3 && iso3 === selectedIso3 ? 1.4 : 0.6;
      })
      .attr("stroke-linejoin", "round")
      .attr("opacity", 1)
      .on("mouseenter", (event, d) => {
        if (!tooltipRef.current) return;
        const iso3 = (d as GeoFeature).properties?.ISO_A3;
        const name = (d as GeoFeature).properties?.ADMIN;
        const row = iso3 ? valueByIso.get(iso3) : undefined;
        const value = row ? accessor(row as unknown as Record<string, number>) : null;
        tooltipRef.current.style.opacity = "1";
        tooltipRef.current.innerHTML = `
          <div class="tooltip-title">${name || iso3 || "Unknown"}</div>
          <div>${metricMeta[metric].label}: ${
            value !== null && Number.isFinite(value) ? formatValue(metric, value) : "No data"
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

    const legend = svg.append("g").attr("class", "map-legend");
    const legendX = 24;
    const legendY = height - 42;
    const swatchSize = 16;
    const swatchGap = 6;

    legend
      .append("text")
      .attr("x", legendX)
      .attr("y", legendY - 10)
      .attr("class", "legend-label")
      .text("BAD");

    legend
      .append("text")
      .attr("x", legendX + legendColors.length * (swatchSize + swatchGap) - swatchGap)
      .attr("y", legendY - 10)
      .attr("text-anchor", "end")
      .attr("class", "legend-label")
      .text("GOOD");

    legendColors.forEach((color, idx) => {
      legend
        .append("rect")
        .attr("x", legendX + idx * (swatchSize + swatchGap))
        .attr("y", legendY)
        .attr("width", swatchSize)
        .attr("height", swatchSize)
        .attr("rx", 3)
        .attr("fill", color)
        .attr("stroke", "#ffffff")
        .attr("stroke-width", 0.8);
    });
  }, [geoData, metric, selectedIso3, valueByIso, onSelect]);

  return (
    <div className="map-wrapper hpi-map" ref={wrapperRef}>
      <div className="map-title">{metricMeta[metric].label}</div>
      <svg ref={svgRef} className="world-map" />
      <div ref={tooltipRef} className="map-tooltip hpi-tooltip" />
    </div>
  );
};

export default WorldMapHPI;
