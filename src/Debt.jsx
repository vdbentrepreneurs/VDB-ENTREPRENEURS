import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusCircle, Landmark, Loader2 } from 'lucide-react';
import { db, auth } from './firebase';
import { collection, addDoc, serverTimestamp, query, orderBy, onSnapshot } from 'firebase/firestore';

export default function Debt() {
  const navigate = useNavigate();
  const [showAdd, setShowAdd] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lenders, setLenders] = useState([]);
  const [formData, setFormData] = useState({
    lenderName: '',
    principalAmount: '',
    interestRate: '',
    interestType: 'rs'
  });
  const [showDuePopup, setShowDuePopup] = useState(false);
  const [dueDebts, setDueDebts] = useState([]);
  const [popupDismissed, setPopupDismissed] = useState(false);

  useEffect(() => {
    if (popupDismissed || lenders.length === 0) return;
    const dues = lenders.filter(lender => {
      if (Number(lender.principalAmount) <= 0) return false;
      const startDate = lender.lastClearedDate?.toDate ? lender.lastClearedDate.toDate() : (lender.createdAt?.toDate ? lender.createdAt.toDate() : new Date());
      const diffTime = Math.max(0, new Date().getTime() - startDate.getTime());
      const rawDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      return rawDays >= 30; // 1 month
    });
    if (dues.length > 0) {
      setDueDebts(dues);
      setShowDuePopup(true);
    } else {
      setShowDuePopup(false);
    }
  }, [lenders, popupDismissed]);

  useEffect(() => {
    const q = query(collection(db, 'debts'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const lendersArray = [];
      querySnapshot.forEach((doc) => {
        lendersArray.push({ id: doc.id, ...doc.data() });
      });
      lendersArray.sort((a, b) => {
        const aPaid = Number(a.principalAmount) === 0;
        const bPaid = Number(b.principalAmount) === 0;
        if (aPaid && !bPaid) return 1;
        if (!aPaid && bPaid) return -1;
        return 0;
      });
      setLenders(lendersArray);
    });
    return () => unsubscribe();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'principalAmount' || name === 'interestRate') {
      const rawValue = value.replace(/,/g, '').replace(/[^0-9.]/g, '');
      setFormData(prev => ({ ...prev, [name]: rawValue }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const principal = Number(formData.principalAmount) || 0;
  const rate = Number(formData.interestRate) || 0;
  let monthlyInterest = 0;
  
  if (formData.interestType === 'rs') {
    // Usually means Rs per 100 per month
    monthlyInterest = (principal * rate) / 100;
  } else {
    // Percent per annum
    monthlyInterest = (principal * rate) / (100 * 12);
  }
  const yearlyInterest = monthlyInterest * 12;

  const saveLender = async () => {
    if (!formData.lenderName || !formData.principalAmount || !formData.interestRate) {
      alert("Please fill in all fields.");
      return;
    }
    try {
      setIsSaving(true);
      await addDoc(collection(db, 'debts'), {
        lenderName: formData.lenderName.trim(),
        principalAmount: Number(formData.principalAmount),
        interestRate: Number(formData.interestRate),
        interestType: formData.interestType,
        monthlyInterest: monthlyInterest,
        yearlyInterest: yearlyInterest,
        createdAt: serverTimestamp(),
        userId: auth.currentUser?.uid || ''
      });
      setShowAdd(false);
      setFormData({ lenderName: '', principalAmount: '', interestRate: '', interestType: 'rs' });
    } catch (error) {
      console.error("Error saving lender: ", error);
      alert("Failed to save lender details.");
    } finally {
      setIsSaving(false);
    }
  };

  const totalDebt = lenders.reduce((sum, lender) => sum + (Number(lender.principalAmount) || 0), 0);

  const totalMonthlyInterest = lenders.reduce((sum, lender) => {
    if (Number(lender.principalAmount) > 0) {
      return sum + (Number(lender.monthlyInterest) || 0);
    }
    return sum;
  }, 0);

  return (
    <div className="dashboard-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="section-title">Debt Accounts</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="action-btn" style={{ padding: '8px 16px', flexDirection: 'row' }} onClick={() => setShowAdd(!showAdd)}>
            <PlusCircle size={20} />
            {showAdd ? 'Close' : 'Add Lender'}
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="activity-list" style={{ marginBottom: '24px' }}>
          <h3 className="sub-title">Enter New Lender</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <input type="text" name="lenderName" value={formData.lenderName} onChange={handleInputChange} placeholder="Lender Name" className="form-input" />
            <div style={{ display: 'flex', gap: '16px' }}>
              <input type="text" inputMode="numeric" name="principalAmount" value={formData.principalAmount ? Number(formData.principalAmount).toLocaleString('en-IN') : ''} onChange={handleInputChange} placeholder="Principal Amount (₹)" className="form-input" style={{ flex: 1 }} />
              <div style={{ display: 'flex', flex: 1, gap: '8px' }}>
                <input type="text" inputMode="numeric" name="interestRate" value={formData.interestRate ? Number(formData.interestRate).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : ''} onChange={handleInputChange} placeholder="Interest Rate" className="form-input" style={{ flex: 1 }} />
                <select name="interestType" value={formData.interestType} onChange={handleInputChange} className="form-input" style={{ width: '80px', padding: '8px' }}>
                  <option value="percent">%</option>
                  <option value="rs">₹</option>
                </select>
              </div>
            </div>

            {principal > 0 && rate > 0 && (
              <div style={{ padding: '12px', backgroundColor: 'var(--primary-light)', borderRadius: '8px', color: 'var(--primary-color)', fontSize: '0.9rem' }}>
                <strong>Calculated Interest:</strong><br />
                ₹ {monthlyInterest.toLocaleString('en-IN', { maximumFractionDigits: 2 })} / month<br />
                ₹ {yearlyInterest.toLocaleString('en-IN', { maximumFractionDigits: 2 })} / year
              </div>
            )}
            <button 
              className="action-btn" 
              onClick={saveLender}
              disabled={isSaving}
              style={{ backgroundColor: 'var(--primary-color)', color: 'white', flexDirection: 'row', padding: '16px', fontSize: '1.1rem', marginTop: '8px', opacity: isSaving ? 0.7 : 1 }}
            >
              {isSaving ? <><Loader2 className="animate-spin" size={20} style={{ marginRight: '8px' }} /> Saving...</> : 'Save Lender'}
            </button>
          </div>
        </div>
      )}

      <div className="metrics-grid" style={{ marginBottom: '16px', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
        <div className="metric-card danger" style={{ padding: '12px', minWidth: 0 }}>
          <div className="metric-header" style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Total Debt</div>
          <h3 style={{ fontSize: '1.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>₹{totalDebt.toLocaleString('en-IN')}</h3>
        </div>
        <div className="metric-card neutral" style={{ borderLeftColor: 'var(--warning)', padding: '12px', minWidth: 0 }}>
          <div className="metric-header" style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Paying Monthly Interest</div>
          <h3 style={{ color: 'var(--warning)', fontSize: '1.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>₹{totalMonthlyInterest.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</h3>
        </div>
      </div>

      <div className="activity-list">
        <h3 className="sub-title">Lenders</h3>
        {lenders.length === 0 ? (
          <div className="activity-empty">
            <Landmark size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
            <p>No debt accounts added yet.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {lenders.map(lender => {
              const isPaid = Number(lender.principalAmount) === 0;
              const borderColor = isPaid ? 'var(--success)' : '#f59e0b'; // green or orange
              const displayAmount = isPaid ? (lender.totalPrincipalPaid || 0) : Number(lender.principalAmount);
              
              return (
                <div 
                  key={lender.id} 
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: 'var(--background)', borderRadius: 'var(--radius)', borderLeft: `4px solid ${borderColor}`, boxShadow: 'var(--shadow-sm)', cursor: 'pointer' }}
                  onClick={() => navigate(`/debt/${lender.id}`)}
                >
                  <div>
                    <h4 style={{ margin: '0 0 6px 0', fontSize: '1.1rem', color: 'var(--text-main)' }}>{lender.lenderName || lender.name || 'Unknown Lender'}</h4>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Interest: {lender.interestRate}{lender.interestType === 'percent' ? '% / yr' : '₹ / month'}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <h3 style={{ margin: '0 0 6px 0', color: 'var(--text-main)', fontSize: '1.2rem' }}>₹{displayAmount.toLocaleString('en-IN')}</h3>
                    <span style={{ 
                      fontSize: '0.75rem', 
                      fontWeight: 'bold', 
                      padding: '4px 8px', 
                      borderRadius: '12px', 
                      backgroundColor: isPaid ? '#dcfce7' : '#fef3c7', 
                      color: isPaid ? '#16a34a' : '#d97706' 
                    }}>
                      {isPaid ? 'FULLY PAID' : 'PENDING'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showDuePopup && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ backgroundColor: 'var(--surface)', padding: '24px', borderRadius: '16px', width: '100%', maxWidth: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', color: 'var(--danger)' }}>
              <Landmark size={48} />
            </div>
            <h3 style={{ textAlign: 'center', fontSize: '1.4rem', marginBottom: '8px', color: 'var(--text-main)' }}>Interest Due!</h3>
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '24px', fontSize: '0.95rem' }}>
              The following debts have been pending for 1 month or more. Please pay the monthly interest.
            </p>
            
            <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {dueDebts.map(d => (
                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', backgroundColor: 'var(--background)', borderRadius: '8px', borderLeft: '4px solid var(--danger)' }}>
                  <div>
                    <div style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{d.lenderName || d.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>1 Month Interest</div>
                  </div>
                  <div style={{ fontWeight: 'bold', color: 'var(--danger)' }}>
                    ₹{Number(d.monthlyInterest).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </div>
                </div>
              ))}
            </div>

            <button 
              onClick={() => {
                setShowDuePopup(false);
                setPopupDismissed(true);
              }}
              style={{ width: '100%', padding: '14px', backgroundColor: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '12px', fontSize: '1.1rem', fontWeight: 'bold', cursor: 'pointer' }}
            >
              Okay, Got It
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
