import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useRef, useEffect, useState, useMemo } from "react";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import {MetricKey} from "./../../types/metrics"

// lat/lon in 3D coord
const latLonToVector3 = (lat: number, lon: number, radius = 2) => {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
};

// pulsular point
const DataPoint = ({ position, color, value, iso3, metric }: any) => {
  const ref = useRef<any>();
  const [hovered, setHovered] = useState(false);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const scale = 1 + Math.sin(t * 3) * 0.3;
    if (ref.current) {
      ref.current.scale.set(scale, scale, scale);
    }
  });

  // Форматирование названия метрики для отображения
  const getMetricLabel = (metric: string) => {
    const labels: Record<string, string> = {
      happiness: "😊 Happiness",
      salary: "💰 Salary",
      inflation: "📈 Inflation",
      unemployment: "📉 Unemployment",
      corruption: "⚠️ Corruption"
    };
    return labels[metric] || metric;
  };

  return (
    <mesh
      ref={ref}
      position={position}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <sphereGeometry args={[0.06, 16, 16]} />
      <meshStandardMaterial 
        emissive={color} 
        emissiveIntensity={1.5}
        color={color}
      />

      {hovered && (
        <Html distanceFactor={8} center>
          <div
            style={{
              background: "rgba(15, 23, 42, 0.95)",
              backdropFilter: "blur(8px)",
              padding: "10px 14px",
              borderRadius: "12px",
              fontSize: "13px",
              boxShadow: "0 8px 20px rgba(0,0,0,0.3)",
              whiteSpace: "nowrap",
              color: "#f1f5f9",
              border: `1px solid ${color}`,
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            <div style={{ 
              fontWeight: "bold", 
              fontSize: "15px", 
              marginBottom: "6px",
              color: color,
              borderBottom: `1px solid ${color}50`,
              paddingBottom: "4px"
            }}>
              {iso3}
            </div>
            <div style={{ marginBottom: "4px" }}>
              {getMetricLabel(metric)}:
            </div>
            <div style={{ 
              fontSize: "18px", 
              fontWeight: "bold",
              color: color,
              textAlign: "center"
            }}>
              {value?.toFixed(2)}
            </div>
            <div style={{ 
              fontSize: "10px", 
              opacity: 0.6, 
              marginTop: "6px",
              textAlign: "center"
            }}>
              Data: 2024
            </div>
          </div>
        </Html>
      )}
    </mesh>
  );
};

const CountryBorders = () => {
  const [lines, setLines] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/world.geojson");
        const data = await res.json();

        const newLines: any[] = [];

        data.features.forEach((feature: any) => {
          const coords = feature.geometry.coordinates;
          
          const processPolygon = (polygon: any) => {
            polygon.forEach((ring: any) => {
              const points = ring.map(([lon, lat]: number[]) =>
                latLonToVector3(lat, lon, 2.01)
              );
              if (points.length > 2) {
                newLines.push(points);
              }
            });
          };

          if (feature.geometry.type === "Polygon") {
            processPolygon(coords);
          } else if (feature.geometry.type === "MultiPolygon") {
            coords.forEach(processPolygon);
          }
        });

        setLines(newLines);
      } catch (error) {
        console.error("error GeoJSON loading:", error);
      }
    };

    load();
  }, []);

  return (
    <group>
      {lines.map((points, i) => {
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        return (
          <line key={i} geometry={geometry}>
            <lineBasicMaterial 
              color="#e2e8f0"
              transparent 
              opacity={0.6}
              linewidth={1}
            />
          </line>
        );
      })}
    </group>
  );
};

const Globe = () => {
  const groupRef = useRef<any>();

  const [geoData, setGeoData] = useState<any[]>([]);
  const [metricsData, setMetricsData] = useState<any[]>([]);
  const [metric, setMetric] = useState<MetricKey>("happiness");
  const [shuffleTick, setShuffleTick] = useState(0);

  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.002;
      const t = clock.getElapsedTime();
      groupRef.current.rotation.x = Math.sin(t * 0.1) * 0.03;
    }
  });

  // GeoJSON loading
  useEffect(() => {
    const loadGeo = async () => {
      const res = await fetch("/world.geojson");
      const data = await res.json();

      const countries = data.features.map((f: any) => {
        let lon = 0;
        let lat = 0;

        try {
          if (f.geometry.type === "Polygon") {
            [lon, lat] = f.geometry.coordinates[0][0];
          } else {
            [lon, lat] = f.geometry.coordinates[0][0][0];
          }
        } catch {}

        return {
          iso3: f.properties.ADM0_A3,
          lat,
          lon,
        };
      });

      setGeoData(countries);
    };

    loadGeo();
  }, []);

  useEffect(() => {
    const loadMetrics = async () => {
      try {
        const res = await fetch("http://localhost:8000/metrics?year=2024");
        const data = await res.json();

        setMetricsData(data.data || []);
      } catch (e) {
        console.error("metrics error", e);
      }
    };

    loadMetrics();
  }, []);

  useEffect(() => {
    const metrics: MetricKey[] = [
      "happiness",
      "salary",
      "inflation",
      "unemployment",
      "corruption",
    ];

    const interval = setInterval(() => {
      setMetric((prev) => {
        const idx = metrics.indexOf(prev);
        return metrics[(idx + 1) % metrics.length];
      });
    }, 8000);

    const shuffleInterval = setInterval(() => {
      setShuffleTick((t) => t + 1);
    }, 15000);

    return () => {
      clearInterval(interval);
      clearInterval(shuffleInterval);
    };
  }, []);

  const metricsMap = useMemo(() => {
    const map = new Map();
    metricsData.forEach((d: any) => map.set(d.iso3, d));
    return map;
  }, [metricsData]);

  // All geo points that have any metric data — does NOT depend on metric
  const candidateIso3s = useMemo(() => {
    return geoData
      .filter((g) => metricsMap.has(g.iso3))
      .map((g) => g.iso3);
  }, [geoData, metricsMap]);

  // Stable selection of 10 iso3s — only reshuffles on shuffleTick
  const visibleIso3s = useMemo(() => {
    if (candidateIso3s.length === 0) return [];
    const shuffled = [...candidateIso3s].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 10);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shuffleTick, candidateIso3s.length]);

  // Build visible points using current metric values for the stable selection
  const visiblePoints = useMemo(() => {
    const iso3Set = new Set(visibleIso3s);
    return geoData
      .filter((g) => iso3Set.has(g.iso3))
      .map((g) => {
        const m = metricsMap.get(g.iso3);
        const value = m?.[metric];
        if (value == null) return null;
        return { ...g, value };
      })
      .filter(Boolean);
  }, [visibleIso3s, geoData, metricsMap, metric]);

  const getColor = (value: number) => {
    if (!value) return "#ccc";
    if (value < 3) return "#38bdf8";
    if (value < 6) return "#facc15";
    return "#ef4444";
  };

  return (
    <group ref={groupRef}>
      <mesh>
        <sphereGeometry args={[2, 128, 128]} />
        <meshStandardMaterial
          color="#1e293b"
          roughness={0.7}
          metalness={0.1}
          emissive="#0f172a"
          emissiveIntensity={0.3}
        />
      </mesh>

      <CountryBorders />

      {visiblePoints.map((p: any) => {
        const pos = latLonToVector3(p.lat, p.lon, 2.15);

        return (
          <DataPoint
            key={p.iso3}
            position={pos}
            color={getColor(p.value)}
            value={p.value}
            iso3={p.iso3}
            metric={metric}
          />
        );
      })}

      {/* glow */}
      <mesh>
        <sphereGeometry args={[2.05, 64, 64]} />
        <meshBasicMaterial
          color="#3b82f6"
          transparent
          opacity={0.06}
          side={THREE.BackSide}
        />
      </mesh>
    </group>
  );
};

const GlobeScene = () => {
  return (
    <Canvas 
        camera={{ position: [0, 0, 6], fov: 45 }}
        gl={{ antialias: true }}
    >
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 3, 5]} intensity={1.2} />
      <pointLight position={[-3, 0, 0]} intensity={0.3} />

      <Globe />

      <OrbitControls 
          enableZoom={false}
          enablePan={false}
          autoRotate={false}
          rotateSpeed={0.5}
        />
    </Canvas>
  );
};

export default GlobeScene;