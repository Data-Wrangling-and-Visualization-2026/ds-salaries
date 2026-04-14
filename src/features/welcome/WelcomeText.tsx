interface WelcomeTextProps {
  onExploreClick?: () => void;
}

const WelcomeText = ({ onExploreClick }: WelcomeTextProps) => {
  return (
    <div className="welcome-text">
      <h1>Global Metrics Dashboard</h1>
      <p>
        Explore economic and social indicators from countries around the world.
        Our interactive globe and detailed maps help you visualize and compare
        metrics like happiness, salary, inflation, unemployment, and corruption.
      </p>
      
      <div className="features">
        <div className="feature">
          <span className="emoji">🌍</span>
          <span>3D Interactive Globe</span>
        </div>
        <div className="feature">
          <span className="emoji">🗺️</span>
          <span>Detailed Country Maps</span>
        </div>
        <div className="feature">
          <span className="emoji">📊</span>
          <span>Real-time Data Comparison</span>
        </div>
        <div className="feature">
          <span className="emoji">📈</span>
          <span>Trend Analysis & Rankings</span>
        </div>
      </div>

      <button className="explore-button" onClick={onExploreClick}>
        Explore Data →
      </button>
    </div>
  );
};

export default WelcomeText;