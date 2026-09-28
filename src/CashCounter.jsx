import React, { useState, useMemo } from 'react';
import { Calculator, RefreshCw, Save, History, Coins, Banknote, IndianRupee } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from './firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

const noteColors = {
  1: { bg: 'rgba(166, 123, 91, 0.1)', text: '#A67B5B', border: '#D2B48C' },
  2: { bg: 'rgba(160, 82, 45, 0.1)', text: '#A0522D', border: '#CD853F' },
  5: { bg: 'rgba(46, 139, 87, 0.12)', text: '#2E8B57', border: '#3CB371' },
  10: { bg: 'rgba(139, 69, 19, 0.12)', text: '#8B4513', border: '#A0522D' },
  20: { bg: 'rgba(154, 205, 50, 0.15)', text: '#6B8E23', border: '#9ACD32' },
  50: { bg: 'rgba(0, 191, 255, 0.15)', text: '#008B8B', border: '#00BFFF' },
  100: { bg: 'rgba(147, 112, 219, 0.15)', text: '#7B68EE', border: '#9370DB' },
  200: { bg: 'rgba(255, 140, 0, 0.15)', text: '#FF8C00', border: '#FFA500' },
  500: { bg: 'rgba(105, 105, 105, 0.15)', text: '#696969', border: '#A9A9A9' }
};

export default function CashCounter() {
  const denominations = [1, 2, 5, 10, 20, 50, 100, 200, 500];
  const [counts, setCounts] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const navigate = useNavigate();

  const handleCountChange = (denom, value) => {
    let num = parseInt(value, 10);
    if (isNaN(num)) num = 0;
    if (num > 500) num = 500;
    if (num < 0) num = 0;
    
    setCounts(prev => ({ ...prev, [denom]: num }));
  };

  const total = useMemo(() => {
    return denominations.reduce((acc, denom) => acc + (denom * (counts[denom] || 0)), 0);
  }, [counts, denominations]);

  const resetCounts = () => setCounts({});

  const saveToHistory = async () => {
    if (total === 0) {
      alert("Amount is 0. Enter some notes to save.");
      return;
    }
    if (!auth.currentUser) {
      alert("You must be logged in to save history.");
      return;
    }
    
    setIsSaving(true);
    try {
      const activeCounts = {};
      Object.keys(counts).forEach(denom => {
        if (counts[denom] > 0) activeCounts[denom] = counts[denom];
      });

      await addDoc(collection(db, 'cashCounts'), {
        userId: auth.currentUser.uid,
        total: total,
        counts: activeCounts,
        createdAt: serverTimestamp()
      });
      
      alert("Cash count saved successfully!");
      resetCounts();
    } catch (error) {
      console.error("Error saving cash count:", error);
      alert("Failed to save.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="dashboard-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h2 className="section-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Calculator size={28} color="var(--primary-color)" /> Cash Counter
        </h2>
        <button 
          onClick={resetCounts} 
          style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: '1px solid var(--border-color)', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-muted)', fontWeight: '600' }}
        >
          <RefreshCw size={16} /> Reset
        </button>
      </div>

      <div style={{ background: 'linear-gradient(135deg, var(--primary-color), var(--secondary-color))', color: 'white', borderRadius: 'var(--radius)', padding: '8px 12px', boxShadow: 'var(--shadow-md)', display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ fontSize: '0.8rem', opacity: 0.9, marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '600' }}>Grand Total</div>
        <div style={{ fontSize: '1.8rem', fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
          <IndianRupee size={24} strokeWidth={3} style={{ marginRight: '2px' }} />{total.toLocaleString('en-IN')}
        </div>
      </div>

      <div style={{ backgroundColor: 'var(--surface)', padding: '8px 12px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-sm)', marginBottom: '8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 90px', gap: '8px', fontWeight: 'bold', borderBottom: '2px solid var(--background)', paddingBottom: '4px', marginBottom: '6px', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
          <div>Note</div>
          <div style={{ textAlign: 'center' }}>Quantity</div>
          <div style={{ textAlign: 'right' }}>Amount</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {denominations.map(denom => {
            const colors = noteColors[denom] || { bg: 'transparent', text: 'var(--text-main)', border: 'var(--border-color)' };
            const count = counts[denom] || 0;
            const amount = count * denom;
            const isCoin = denom < 10;
            
            return (
              <div key={denom} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 90px', gap: '8px', alignItems: 'center', backgroundColor: colors.bg, padding: '4px 8px', borderRadius: '8px', border: `1px solid ${colors.border}` }}>
                <div style={{ fontSize: '1rem', fontWeight: 'bold', color: colors.text, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {isCoin ? <Coins size={16} color={colors.border} /> : <Banknote size={16} color={colors.border} />}
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <IndianRupee size={12} strokeWidth={3} />{denom}
                  </div>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <input 
                    type="number" 
                    value={counts[denom] || ''} 
                    onChange={(e) => handleCountChange(denom, e.target.value)} 
                    min="0" 
                    max="500"
                    placeholder="0"
                    className="form-input"
                    style={{ width: '100%', maxWidth: '80px', textAlign: 'center', padding: '4px', fontSize: '1rem', fontWeight: 'bold', border: `1px solid ${colors.border}`, borderRadius: '6px', backgroundColor: '#fff', color: colors.text }}
                  />
                </div>
                
                <div style={{ textAlign: 'right', fontSize: '1rem', fontWeight: 'bold', color: count > 0 ? colors.text : 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                  <IndianRupee size={12} strokeWidth={count > 0 ? 3 : 2} style={{ marginRight: '1px' }} />{amount.toLocaleString('en-IN')}
                </div>
              </div>
            );
          })}
        </div>
        
        <button 
          onClick={saveToHistory}
          disabled={isSaving || total === 0}
          style={{ width: '100%', marginTop: '8px', background: 'var(--success)', color: 'white', border: 'none', padding: '8px', borderRadius: '8px', fontSize: '0.95rem', fontWeight: 'bold', cursor: isSaving || total === 0 ? 'not-allowed' : 'pointer', opacity: isSaving || total === 0 ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
        >
          <Save size={16} /> {isSaving ? 'Saving...' : 'Save to History'}
        </button>
      </div>

      <div style={{ marginTop: '10px' }}>
        <button 
          onClick={() => navigate('/cash-history')}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'var(--surface)', border: '1px solid var(--border-color)', padding: '8px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--text-main)', boxShadow: 'var(--shadow-sm)' }}
        >
          <History size={18} color="var(--primary-color)" /> View Cash History
        </button>
      </div>
    </div>
  );
}
