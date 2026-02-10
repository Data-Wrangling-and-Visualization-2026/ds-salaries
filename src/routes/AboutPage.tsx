const AboutPage = () => {
  return (
    <main className="page about-page">
      <section className="panel">
        <h1>About the project</h1>
        <p>
          Data Science Careers Across Countries is an exploratory product to compare
          compensation and macro indicators across the globe. The Sprint 2 prototype
          focuses on the core UX: an interactive world map and country-level trend
          views with realistic, deterministic mock data.
        </p>
        <p>
          The next sprint will connect a FastAPI backend, enable richer filters,
          and add data provenance for every metric.
        </p>
      </section>
    </main>
  );
};

export default AboutPage;
