import { useEffect, useRef, useState } from "react";

export type NavSection = {
  id: string;
  label: string;
};

type Props = {
  sections: NavSection[];
};

const NavSidebar = ({ sections }: Props) => {
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? "");
  const observersRef = useRef<IntersectionObserver[]>([]);

  useEffect(() => {
    observersRef.current.forEach((o) => o.disconnect());
    observersRef.current = [];

    const idToVisible = new Map<string, number>();

    const update = () => {
      let bestId = "";
      let bestRatio = -1;
      idToVisible.forEach((ratio, id) => {
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestId = id;
        }
      });
      if (bestId) setActiveId(bestId);
    };

    sections.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => {
          idToVisible.set(id, entry.intersectionRatio);
          update();
        },
        { threshold: [0, 0.1, 0.25, 0.5, 0.75, 1.0], rootMargin: "-10% 0px -10% 0px" }
      );
      obs.observe(el);
      observersRef.current.push(obs);
    });

    return () => {
      observersRef.current.forEach((o) => o.disconnect());
    };
  }, [sections]);

  const handleClick = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveId(id);
  };

  return (
    <aside className="nav-sidebar">
      <ul className="nav-sidebar-list">
        {sections.map(({ id, label }) => (
          <li key={id} className={`nav-sidebar-item ${activeId === id ? "active" : ""}`}>
            <button className="nav-sidebar-btn" onClick={() => handleClick(id)}>
              <span className="nav-sidebar-dot" />
              <span className="nav-sidebar-label">{label}</span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
};

export default NavSidebar;
