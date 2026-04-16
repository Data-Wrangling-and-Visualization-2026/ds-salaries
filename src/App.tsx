import { Routes, Route } from "react-router-dom";
import WelcomePage from "./features/welcome/WelcomePage";
import CountryPage from "./routes/CountryPage";
import ComparisonPage from "./routes/ComparisonPage";
import Header from "./components/Header";

const App = () => {
  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={<WelcomePage />} />
        <Route path="/country/:iso3" element={<CountryPage />} />
        <Route path="/compare/:iso3a/:iso3b" element={<ComparisonPage />} />
      </Routes>
    </>
  );
};

export default App;
