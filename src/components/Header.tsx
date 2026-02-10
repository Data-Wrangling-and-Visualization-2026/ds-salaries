import { NavLink } from "react-router-dom";

const Header = () => {
  return (
    <header className="header">
      <div className="brand">
        <div className="brand-title">DS Careers Atlas</div>
        <div className="brand-subtitle">
          Salary, well-being, and reality across countries
        </div>
      </div>
      <nav className="nav">
        <NavLink to="/" className={({ isActive }) => (isActive ? "active" : "")}
          end
        >
          Home
        </NavLink>
        <NavLink to="/about" className={({ isActive }) => (isActive ? "active" : "")}
        >
          About
        </NavLink>
      </nav>
    </header>
  );
};

export default Header;
