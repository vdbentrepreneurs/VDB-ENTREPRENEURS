import { BrowserRouter as Router, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { Home, Receipt, CreditCard, Landmark, BarChart3, Settings, Menu, LogOut, User, Calculator } from 'lucide-react';
import Dashboard from './Dashboard';
import './App.css';
import Bills from './Bills';
import Credit from './Credit';
import CreditBill from './CreditBill';
import Debt from './Debt';
import DebtDetails from './DebtDetails';
import Reports from './Reports';
import Profile from './Profile';
import CashCounter from './CashCounter';
import CashHistory from './CashHistory';
import CashHistoryDetails from './CashHistoryDetails';
import { useState, useEffect } from 'react';
import { auth, googleProvider, db } from './firebase';
import { signInWithPopup, onAuthStateChanged, signOut, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';
import { StatusBar } from '@capacitor/status-bar';
import { useNavigate } from 'react-router-dom';

const BackButtonListener = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const subscription = CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (location.pathname === '/') {
        CapacitorApp.exitApp();
      } else {
        navigate(-1);
      }
    });

    return () => {
      subscription.then(sub => sub.remove());
    };
  }, [navigate, location]);

  return null;
};

const Header = () => {
  const location = useLocation();
  const path = location.pathname;
  
  let title = "VDB ENTREPRENEURS";
  if (path === '/cash-counter') title = 'Cash Counter';
  else if (path.startsWith('/cash-history')) title = 'Cash History';
  else if (path === '/bills') title = 'Bills';
  else if (path.startsWith('/credit')) title = 'Credit';
  else if (path.startsWith('/debt')) title = 'Debt';
  else if (path === '/reports') title = 'Reports';
  else if (path === '/profile') title = 'Settings & Profile';

  const isDashboard = path === '/';

  return (
    <header className="app-header-mobile">
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {isDashboard && <img src="/logo.png" alt="Logo" style={{ width: '45px', height: '45px', marginRight: '12px', borderRadius: '50%' }} />}
        <h1>{title}</h1>
      </div>
      <NavLink to="/profile" style={{ color: 'white', display: 'flex', alignItems: 'center' }}>
        <User size={24} className="header-icon" />
      </NavLink>
    </header>
  );
};

const Navigation = () => {
  const navItems = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/cash-counter', label: 'Cash', icon: Calculator },
    { path: '/bills', label: 'Bills', icon: Receipt },
    { path: '/credit', label: 'Credit', icon: CreditCard },
    { path: '/debt', label: 'Debt', icon: Landmark },
    { path: '/reports', label: 'Reports', icon: BarChart3 },
  ];

  return (
    <nav className="nav-menu">
      <div className="nav-brand-desktop">
        <img src="/logo.png" alt="Logo" style={{ width: '50px', height: '50px', marginRight: '12px', borderRadius: '50%' }} />
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
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showLogin, setShowLogin] = useState(false);
  
  const [appPin, setAppPin] = useState(null);
  const [isPinAuthenticated, setIsPinAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      StatusBar.hide().catch(err => console.log('StatusBar error:', err));
      GoogleAuth.initialize({
        clientId: '471668083493-jhsr9ag19ko1rnr99ateerk240mj70h8.apps.googleusercontent.com',
        scopes: ['profile', 'email'],
        grantOfflineAccess: true,
      });
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          if (userDoc.exists() && userDoc.data().pin) {
            setAppPin(userDoc.data().pin);
            setIsPinAuthenticated(false);
            
            // Trigger biometrics if enabled
            if (userDoc.data().useBiometrics && Capacitor.isNativePlatform()) {
              setTimeout(async () => {
                try {
                  const result = await NativeBiometric.isAvailable();
                  if (result.isAvailable) {
                    await NativeBiometric.verifyIdentity({
                      reason: "Unlock VDB Entrepreneurs",
                      title: "App Unlock"
                    });
                    setIsPinAuthenticated(true);
                    setPinError(false);
                  }
                } catch (err) {
                  console.error("Biometric error:", err);
                }
              }, 500);
            }
          } else {
            setAppPin(null);
            setIsPinAuthenticated(true);
          }
        } catch (e) {
          console.error("Error fetching PIN:", e);
          setIsPinAuthenticated(true);
        }
      } else {
        setAppPin(null);
        setIsPinAuthenticated(false);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handlePinSubmit = (e) => {
    e.preventDefault();
    if (pinInput === appPin) {
      setIsPinAuthenticated(true);
      setPinError(false);
    } else {
      setPinError(true);
      setPinInput('');
    }
  };

  const handleLogin = async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        // 1. Attempt Native Capacitor Google Login first (in-app popup)
        const googleUser = await GoogleAuth.signIn();
        if (googleUser && googleUser.authentication && googleUser.authentication.idToken) {
          const credential = GoogleAuthProvider.credential(googleUser.authentication.idToken);
          await signInWithCredential(auth, credential);
        }
      } else {
        // 2. Standard web popup if on desktop/web browser
        await signInWithPopup(auth, googleProvider);
      }
    } catch (error) {
      console.error(error);
      alert("Login Failed: " + error.message);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', backgroundColor: 'var(--background)', padding: '24px' }}>
        <img src="/logo.png" alt="App Logo" style={{ width: '80px', height: '80px', borderRadius: '50%', marginBottom: '24px', boxShadow: 'var(--shadow-md)' }} />
        <div className="typing-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div className="animated-loading-text">VANA DURGA BHAVANI ENTREPRENEURS</div>
      </div>
    );
  }

  if (!user && !showLogin) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', backgroundColor: 'var(--background)' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center', overflowY: 'auto' }}>
          
          <img src="/logo.png" alt="App Logo" style={{ width: '100px', height: '100px', borderRadius: '50%', marginBottom: '16px', boxShadow: 'var(--shadow-md)', animation: 'scaleIn 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275) both', flexShrink: 0 }} />
          
          <div className="animated-loading-text" style={{ fontSize: '1.5rem', lineHeight: '1.2', marginBottom: '12px', animation: 'slideInUp 0.8s ease-out 0.2s both' }}>
            VANA DURGA BHAVANI<br/>ENTREPRENEURS
          </div>
          
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '24px', animation: 'slideInUp 0.8s ease-out 0.4s both', maxWidth: '300px' }}>
            Manage your daily business operations, bills, and credit accounts effortlessly.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', maxWidth: '320px', animation: 'slideInUp 0.8s ease-out 0.6s both' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 16px', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-sm)' }}>
              <Receipt size={24} color="var(--primary-color)" />
              <span style={{ fontWeight: '600', color: 'var(--text-main)', fontSize: '1rem' }}>Track Daily Bills</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 16px', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-sm)' }}>
              <CreditCard size={24} color="var(--warning)" />
              <span style={{ fontWeight: '600', color: 'var(--text-main)', fontSize: '1rem' }}>Manage Customer Credit</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 16px', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-sm)' }}>
              <BarChart3 size={24} color="var(--success)" />
              <span style={{ fontWeight: '600', color: 'var(--text-main)', fontSize: '1rem' }}>Monitor Business Growth</span>
            </div>
          </div>

        </div>

        <div style={{ padding: '32px 24px', backgroundColor: 'var(--surface)', borderTopLeftRadius: '32px', borderTopRightRadius: '32px', boxShadow: '0 -4px 10px rgba(0,0,0,0.05)', animation: 'slideInUp 0.8s ease-out 0.8s both' }}>
          <button 
            onClick={() => setShowLogin(true)} 
            className="action-btn" 
            style={{ width: '100%', padding: '16px', fontSize: '1.2rem', backgroundColor: 'var(--primary-color)', color: 'white', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: '16px' }}
          >
            Get Started
          </button>
        </div>
      </div>
    );
  }

  if (!user && showLogin) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: 'var(--background)' }}>
        <div style={{ padding: '24px' }}>
          <button onClick={() => setShowLogin(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            &larr; Back
          </button>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '24px' }}>
          <img src="/logo.png" alt="App Logo" style={{ width: '120px', height: '120px', borderRadius: '50%', marginBottom: '24px', boxShadow: 'var(--shadow-md)', animation: 'scaleIn 0.6s ease-out both' }} />
          <h2 style={{ color: 'var(--text-main)', marginBottom: '48px', fontSize: '1.8rem', fontWeight: '600' }}>Welcome Back</h2>
          <button 
            onClick={handleLogin} 
            className="action-btn" 
            style={{ width: '100%', maxWidth: '320px', padding: '16px', fontSize: '1.1rem', backgroundColor: 'white', color: 'var(--text-main)', border: '1px solid var(--border-color)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: '16px', boxShadow: 'var(--shadow-md)' }}
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G" style={{ width: '28px', marginRight: '16px' }} />
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  if (user && appPin && !isPinAuthenticated) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: 'var(--background)', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <img src="/logo.png" alt="App Logo" style={{ width: '80px', height: '80px', borderRadius: '50%', marginBottom: '24px', boxShadow: 'var(--shadow-md)' }} />
        <h2 style={{ color: 'var(--text-main)', marginBottom: '8px' }}>Enter PIN</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>Please enter your PIN to access the app.</p>
        
        <form onSubmit={handlePinSubmit} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '300px' }}>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
            placeholder="****"
            style={{ 
              width: '100%', 
              padding: '16px', 
              fontSize: '2rem', 
              textAlign: 'center', 
              letterSpacing: '12px', 
              borderRadius: '12px', 
              border: pinError ? '2px solid var(--danger)' : '2px solid var(--primary-color)',
              marginBottom: '16px',
              backgroundColor: 'var(--surface)',
              color: 'var(--text-main)'
            }}
            autoFocus
          />
          {pinError && <p style={{ color: 'var(--danger)', marginBottom: '16px', fontWeight: 'bold' }}>Incorrect PIN. Try again.</p>}
          <button type="submit" className="action-btn" style={{ width: '100%', padding: '16px', fontSize: '1.2rem', backgroundColor: 'var(--primary-color)', color: 'white', borderRadius: '12px' }}>
            Unlock
          </button>
        </form>
        
        {Capacitor.isNativePlatform() && (
          <button 
            onClick={async () => {
              try {
                await NativeBiometric.verifyIdentity({ reason: "Unlock VDB Entrepreneurs", title: "App Unlock" });
                setIsPinAuthenticated(true);
              } catch(e) {}
            }} 
            style={{ marginTop: '16px', background: 'transparent', border: 'none', color: 'var(--primary-color)', fontWeight: 'bold', cursor: 'pointer', fontSize: '1.1rem' }}
          >
            Use Biometrics
          </button>
        )}
        
        <button onClick={() => signOut(auth)} style={{ marginTop: '24px', background: 'transparent', border: 'none', color: 'var(--danger)', fontWeight: 'bold', cursor: 'pointer' }}>
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <Router>
      <BackButtonListener />
      <div className="app-layout">
        <Navigation />
        
        <div className="main-wrapper">
          <Header />
          
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/cash-counter" element={<CashCounter />} />
              <Route path="/cash-history" element={<CashHistory />} />
              <Route path="/cash-history/:id" element={<CashHistoryDetails />} />
              <Route path="/bills" element={<Bills />} />
              <Route path="/credit" element={<Credit />} />
              <Route path="/credit/:id" element={<CreditBill />} />
              <Route path="/debt" element={<Debt />} />
              <Route path="/debt/:id" element={<DebtDetails />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/profile" element={<Profile />} />
            </Routes>
          </main>
        </div>
      </div>
    </Router>
  );
}

export default App;
