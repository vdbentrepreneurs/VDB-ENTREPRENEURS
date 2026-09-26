import { BrowserRouter as Router, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { Home, Receipt, CreditCard, Landmark, BarChart3, Settings, Menu } from 'lucide-react';
import './App.css';

// Placeholder Components
const Dashboard = () => <div className="page-content"><h2>Dashboard</h2><p>Overview of business.</p></div>;
const Bills = () => <div className="page-content"><h2>Bills</h2><p>Manage bills and expenses manually.</p></div>;
const Credit = () => <div className="page-content"><h2>Credit</h2><p>Money owed to the business.</p></div>;
const Debt = () => <div className="page-content"><h2>Debt</h2><p>Money the business owes.</p></div>;
const Reports = () => <div className="page-content"><h2>Reports & Graphs</h2><p>Analyze finances.</p></div>;

const Navigation = () => {
  const navItems = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/bills', label: 'Bills', icon: Receipt },
    { path: '/credit', label: 'Credit', icon: CreditCard },
    { path: '/debt', label: 'Debt', icon: Landmark },
    { path: '/reports', label: 'Reports', icon: BarChart3 },
  ];

  return (
    <nav className="nav-menu">
      <div className="nav-brand-desktop">
        <h1>VDB ENTREPRENEURS</h1>
      </div>
      <div className="nav-items-container">
        {navItems.map(item => (
          <NavLink 
            key={item.path} 
            to={item.path} 
            className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <item.icon size={24} className="nav-icon" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
};

function App() {
  return (
    <Router>
      <div className="app-layout">
        <Navigation />
        
        <div className="main-wrapper">
          <header className="app-header-mobile">
            <h1>VDB ENTREPRENEURS</h1>
            <Settings size={24} className="header-icon" />
          </header>
          
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/bills" element={<Bills />} />
              <Route path="/credit" element={<Credit />} />
              <Route path="/debt" element={<Debt />} />
              <Route path="/reports" element={<Reports />} />
            </Routes>
          </main>
        </div>
      </div>
    </Router>
  );
}

export default App;
