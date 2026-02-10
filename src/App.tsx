import { Route, Routes } from "react-router-dom";
import Header from "./components/Header";
import HomePage from "./routes/HomePage";
import CountryPage from "./routes/CountryPage";
import AboutPage from "./routes/AboutPage";

const App = () => {
  return (
    <div className="app-shell">
      <Header />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/country/:iso3" element={<CountryPage />} />
        <Route path="/about" element={<AboutPage />} />
      </Routes>
    </div>
  );
};

export default App;
