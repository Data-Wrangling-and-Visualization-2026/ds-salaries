const AboutPage = () => {
  return (
    <main className="page about-page">
      <section className="panel">
        <h1>About the project</h1>
        <p>
          Data Science Careers Across Countries is an interactive application that evaluates
          whether high salaries in Data Science correspond to a genuinely high standard of living
          across countries and over time.
        </p>
        <p>
          The system integrates Data Science salary data with macroeconomic indicators (inflation,
          unemployment), governance metrics (corruption perception), and well-being indices
          (happiness) to construct a multidimensional view of professional prosperity.
        </p>
        <p>
          Use the interactive world map to compare countries by any metric, click a country to see
          its snapshot, and open the country view for full trend charts from 2020 to 2025.
        </p>
      </section>
    </main>
  );
};

export default AboutPage;
