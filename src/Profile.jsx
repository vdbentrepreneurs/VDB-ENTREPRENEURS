import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { auth, db } from './firebase';
import { signOut } from 'firebase/auth';
import { collection, addDoc, serverTimestamp, onSnapshot, query, orderBy, deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { LogOut, User as UserIcon, UserPlus, Trash2, Store, Lock, Fingerprint, Loader2, CheckCircle2 } from 'lucide-react';
import './App.css';

const Profile = () => {
  const user = auth.currentUser;
  const [showShopForm, setShowShopForm] = useState(false);
  const [shopName, setShopName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [shops, setShops] = useState([]);
  
  // Security / PIN state
  const [hasPin, setHasPin] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinMode, setPinMode] = useState('set'); // 'set', 'verify', 'reset'
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [actualPin, setActualPin] = useState(null);
  const [useBiometrics, setUseBiometrics] = useState(false);
  const [isEnablingBiometrics, setIsEnablingBiometrics] = useState(false);
  const [showBiometricsSuccess, setShowBiometricsSuccess] = useState(false);

  useEffect(() => {
    if (!user) return;
    
    // Fetch PIN status
    const fetchPinStatus = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data.pin) {
            setHasPin(true);
            setActualPin(data.pin);
          } else {
            setHasPin(false);
            setActualPin(null);
          }
          if (data.useBiometrics) {
            setUseBiometrics(true);
          } else {
            setUseBiometrics(false);
          }
        } else {
          setHasPin(false);
          setActualPin(null);
          setUseBiometrics(false);
        }
      } catch (error) {
        console.error("Error fetching PIN:", error);
      }
    };
    fetchPinStatus();

    const q = query(collection(db, 'shops'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const shopsArray = [];
      querySnapshot.forEach((document) => {
        if (document.data().userId === user.uid) {
          shopsArray.push({ id: document.id, ...document.data() });
        }
      });
      setShops(shopsArray);
    });
    return () => unsubscribe();
  }, [user]);

  const handleDeleteShop = async (id) => {
    if(window.confirm("Are you sure you want to delete this shop?")) {
      try {
        await deleteDoc(doc(db, 'shops', id));
      } catch(e) {
        console.error(e);
        alert("Failed to delete shop");
      }
    }
  };

  const handleLogout = () => {
    signOut(auth);
  };

  const handleAddShop = async () => {
    if (!shopName.trim()) return;
    setIsSaving(true);
    try {
      await addDoc(collection(db, 'shops'), {
        name: shopName.trim(),
        createdAt: serverTimestamp(),
        userId: user?.uid
      });
      setShowShopForm(false);
      setShopName('');
    } catch (e) {
      console.error(e);
      alert("Failed to add shop.");
    }
    setIsSaving(false);
  };

  const toggleBiometrics = async () => {
    if (isEnablingBiometrics) return;
    try {
      const newVal = !useBiometrics;
      if (newVal) {
        setIsEnablingBiometrics(true);
        setTimeout(async () => {
          await setDoc(doc(db, 'users', user.uid), { useBiometrics: newVal }, { merge: true });
          setUseBiometrics(newVal);
          setIsEnablingBiometrics(false);
          setShowBiometricsSuccess(true);
          setTimeout(() => setShowBiometricsSuccess(false), 3000);
        }, 1500);
      } else {
        await setDoc(doc(db, 'users', user.uid), { useBiometrics: newVal }, { merge: true });
        setUseBiometrics(newVal);
      }
    } catch (e) {
      console.error(e);
      alert("Failed to update biometric settings.");
      setIsEnablingBiometrics(false);
    }
  };

  const handlePinAction = async () => {
    if (pinMode === 'set' || pinMode === 'reset') {
      if (pinInput.length !== 4) {
        setPinError("PIN must be 4 digits.");
        return;
      }
      try {
        await setDoc(doc(db, 'users', user.uid), { pin: pinInput }, { merge: true });
        setHasPin(true);
        setActualPin(pinInput);
        setShowPinModal(false);
        setPinInput('');
        setPinError('');
        alert("App PIN successfully set!");
      } catch (error) {
        console.error("Error saving PIN:", error);
        setPinError("Failed to save PIN.");
      }
    } else if (pinMode === 'verify') {
      if (pinInput === actualPin) {
        setPinError('');
        setPinInput('');
        setPinMode('reset');
      } else {
        setPinError("Incorrect PIN.");
        setPinInput('');
      }
    } else if (pinMode === 'remove') {
      if (pinInput === actualPin) {
        try {
          await setDoc(doc(db, 'users', user.uid), { pin: null }, { merge: true });
          setHasPin(false);
          setActualPin(null);
          setShowPinModal(false);
          setPinInput('');
          setPinError('');
          alert("App PIN successfully removed.");
        } catch (error) {
          console.error("Error removing PIN:", error);
          setPinError("Failed to remove PIN.");
        }
      } else {
        setPinError("Incorrect PIN.");
        setPinInput('');
      }
    }
  };

  return (
    <div className="dashboard-container">
      <div>
        <h2 className="section-title">Profile</h2>
        <p className="sub-title">Manage your account</p>
      </div>

      <div className="metric-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px' }}>
        {user?.photoURL ? (
          <img 
            src={user.photoURL} 
            alt="Profile" 
            style={{ width: '100px', height: '100px', borderRadius: '50%', marginBottom: '16px', border: '2px solid var(--primary-color)' }}
          />
        ) : (
          <div style={{ width: '100px', height: '100px', borderRadius: '50%', marginBottom: '16px', backgroundColor: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-color)' }}>
            <UserIcon size={48} />
          </div>
        )}
        
        <h3 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>{user?.displayName || 'User'}</h3>
        <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>{user?.email}</p>

        <button 
          onClick={handleLogout}
          className="action-btn"
          style={{ width: '100%', maxWidth: '250px', flexDirection: 'row', color: 'var(--danger)', borderColor: 'var(--danger)' }}
        >
          <LogOut size={20} />
          <span>Log Out</span>
        </button>
      </div>
      
      <div style={{ marginTop: '24px' }}>
        <h3 className="sub-title" style={{ margin: '0 0 16px 0' }}>Security</h3>
        <div style={{ backgroundColor: 'var(--surface)', padding: '16px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ backgroundColor: 'var(--primary-light)', padding: '10px', borderRadius: '12px' }}>
                <Lock size={20} color="var(--primary-color)" />
              </div>
              <div>
                <h4 style={{ margin: '0 0 4px 0', fontSize: '1.1rem' }}>App PIN Lock</h4>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {hasPin ? 'PIN is currently active' : 'Secure your app with a 4-digit PIN'}
                </p>
              </div>
            </div>
            
            {!hasPin ? (
              <button 
                onClick={() => { setPinMode('set'); setPinInput(''); setPinError(''); setShowPinModal(true); }}
                className="action-btn" 
                style={{ padding: '8px 16px', fontSize: '0.9rem', backgroundColor: 'var(--primary-color)', color: 'white', whiteSpace: 'nowrap' }}
              >
                Set PIN
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  onClick={() => { setPinMode('verify'); setPinInput(''); setPinError(''); setShowPinModal(true); }}
                  className="action-btn" 
                  style={{ padding: '8px 12px', fontSize: '0.9rem', backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-main)', whiteSpace: 'nowrap' }}
                >
                  Change
                </button>
                <button 
                  onClick={() => { setPinMode('remove'); setPinInput(''); setPinError(''); setShowPinModal(true); }}
                  className="action-btn" 
                  style={{ padding: '8px 12px', fontSize: '0.9rem', backgroundColor: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)', whiteSpace: 'nowrap' }}
                >
                  Remove
                </button>
              </div>
            )}
          </div>
          
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-color)', opacity: hasPin ? 1 : 0.5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ backgroundColor: useBiometrics && hasPin ? 'rgba(22, 163, 74, 0.1)' : 'var(--primary-light)', padding: '10px', borderRadius: '12px' }}>
                <Fingerprint size={20} color={useBiometrics && hasPin ? '#16a34a' : 'var(--text-muted)'} />
              </div>
              <div>
                <h4 style={{ margin: '0 0 4px 0', fontSize: '1.1rem', display: 'flex', alignItems: 'center' }}>
                  Biometric Unlock
                  {isEnablingBiometrics && <Loader2 size={16} className="animate-spin" style={{ marginLeft: '8px', color: 'var(--primary-color)' }} />}
                  {showBiometricsSuccess && <CheckCircle2 size={16} style={{ marginLeft: '8px', color: 'var(--success)' }} />}
                </h4>
                <p style={{ margin: 0, fontSize: '0.85rem', color: showBiometricsSuccess ? 'var(--success)' : 'var(--text-muted)' }}>
                  {isEnablingBiometrics ? 'Enabling biometrics...' : showBiometricsSuccess ? 'Biometrics successfully enabled!' : hasPin ? 'Use fingerprint or Face ID to unlock' : 'Requires App PIN to be set first'}
                </p>
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', cursor: hasPin ? 'pointer' : 'not-allowed' }}>
              <div style={{ width: '44px', height: '24px', backgroundColor: useBiometrics && hasPin ? 'var(--success)' : 'var(--border-color)', borderRadius: '12px', position: 'relative', transition: '0.3s' }} onClick={hasPin ? toggleBiometrics : undefined}>
                <div style={{ width: '18px', height: '18px', backgroundColor: 'white', borderRadius: '50%', position: 'absolute', top: '3px', left: useBiometrics && hasPin ? '23px' : '3px', transition: '0.3s', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}></div>
              </div>
            </label>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 className="sub-title" style={{ margin: 0 }}>My Shops</h3>
          <button 
            onClick={() => setShowShopForm(true)}
            className="action-btn"
            style={{ padding: '8px 16px', flexDirection: 'row', width: 'auto' }}
          >
            <UserPlus size={18} />
            <span>Add Shop</span>
          </button>
        </div>

        <div className="activity-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {shops.length === 0 ? (
            <div className="activity-empty">
              <Store size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
              <p>No shops added yet.</p>
            </div>
          ) : (
            shops.map(shop => (
              <div key={shop.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: 'var(--background)', borderRadius: 'var(--radius)', borderLeft: '4px solid var(--primary-color)' }}>
                <span style={{ fontWeight: '500', fontSize: '1.1rem' }}>{shop.name}</span>
                <button 
                  onClick={() => handleDeleteShop(shop.id)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '8px' }}
                >
                  <Trash2 size={20} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

        {showShopForm && createPortal(
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '24px' }}>
            <div style={{ backgroundColor: 'var(--surface)', padding: '24px', borderRadius: 'var(--radius)', width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--primary-color)' }}>Add New Shop</h3>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Shop Name" 
                value={shopName} 
                onChange={(e) => setShopName(e.target.value)} 
                autoFocus
              />
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button 
                  className="action-btn" 
                  style={{ flex: 1, padding: '12px', border: '1px solid var(--border-color)', backgroundColor: 'transparent', boxShadow: 'none', color: 'var(--text-main)' }}
                  onClick={() => setShowShopForm(false)}
                >
                  Cancel
                </button>
                <button 
                  className="action-btn" 
                  style={{ flex: 1, padding: '12px', backgroundColor: 'var(--primary-color)', color: 'white' }}
                  onClick={handleAddShop}
                  disabled={isSaving || !shopName.trim()}
                >
                  {isSaving ? 'Saving...' : 'Add Shop'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {showPinModal && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '24px' }} onClick={() => setShowPinModal(false)}>
          <div style={{ backgroundColor: 'var(--surface)', padding: '24px', borderRadius: 'var(--radius)', width: '100%', maxWidth: '300px', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, marginBottom: '8px' }}>
              {pinMode === 'set' ? 'Set New App PIN' : pinMode === 'verify' ? 'Verify Current PIN' : pinMode === 'remove' ? 'Remove PIN' : 'Enter New PIN'}
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
              {pinMode === 'set' || pinMode === 'reset' ? 'Enter a 4-digit numeric PIN.' : 'Please enter your current PIN to continue.'}
            </p>
            
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
              placeholder="****"
              style={{ 
                width: '100%', 
                padding: '12px', 
                fontSize: '1.5rem', 
                textAlign: 'center', 
                letterSpacing: '12px', 
                borderRadius: '8px', 
                border: pinError ? '2px solid var(--danger)' : '1px solid var(--border-color)',
                marginBottom: '16px',
                backgroundColor: 'var(--background)'
              }}
              autoFocus
            />
            
            {pinError && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: '-8px', marginBottom: '16px', fontWeight: 'bold', textAlign: 'center' }}>{pinError}</p>}
            
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                className="action-btn" 
                onClick={() => setShowPinModal(false)}
                style={{ flex: 1, backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
              >
                Cancel
              </button>
              <button 
                className="action-btn" 
                onClick={handlePinAction}
                style={{ flex: 1, backgroundColor: pinMode === 'remove' ? 'var(--danger)' : 'var(--primary-color)', color: 'white' }}
              >
                {pinMode === 'set' || pinMode === 'reset' ? 'Save PIN' : pinMode === 'remove' ? 'Remove' : 'Verify'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default Profile;
