import { Component, ReactNode } from "react";
import { Routes, Route } from "react-router-dom";
import WelcomePage from "./features/welcome/WelcomePage";
import CountryPage from "./routes/CountryPage";
import ComparisonPage from "./routes/ComparisonPage";
import Header from "./components/Header";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, color: "#f87171", fontFamily: "monospace" }}>
          <h2>Runtime error</h2>
          <pre style={{ whiteSpace: "pre-wrap" }}>{(this.state.error as Error).message}</pre>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, color: "#94a3b8" }}>
            {(this.state.error as Error).stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const App = () => {
  return (
    <ErrorBoundary>
      <Header />
      <Routes>
        <Route path="/" element={<WelcomePage />} />
        <Route path="/country/:iso3" element={<CountryPage />} />
        <Route path="/compare/:iso3a/:iso3b" element={<ComparisonPage />} />
      </Routes>
    </ErrorBoundary>
  );
};

export default App;
