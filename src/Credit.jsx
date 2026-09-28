import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { PlusCircle, CreditCard, ChevronDown } from 'lucide-react';
import { auth, db } from './firebase';
import { collection, addDoc, serverTimestamp, onSnapshot, query, orderBy, doc, updateDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { playSuccessFeedback } from './utils';

export default function Credit() {
  const navigate = useNavigate();
  const [showTxForm, setShowTxForm] = useState(false);
  const [shops, setShops] = useState([]);
  const [formData, setFormData] = useState({ shopName: '', amount: '', date: new Date().toISOString().split('T')[0] });
  const [isSaving, setIsSaving] = useState(false);
  const user = auth.currentUser;

  const [totalCredit, setTotalCredit] = useState(0);
  const [creditsList, setCreditsList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'shops'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const shopsArray = [];
      querySnapshot.forEach((document) => {
        shopsArray.push({ id: document.id, ...document.data() });
      });
      setShops(shopsArray);
    });

    const creditQ = query(collection(db, 'credits'), orderBy('createdAt', 'desc'));
    const unsubscribeCredits = onSnapshot(creditQ, (querySnapshot) => {
      let total = 0;
      const cList = [];
      
      const getFullHistory = (credit) => {
        let fullHistory = credit.history || [];
        const historySum = fullHistory.reduce((sum, tx) => sum + Number(tx.amount), 0);
        if (historySum < Number(credit.amount)) {
          const initialAmount = Number(credit.amount) - historySum;
          fullHistory = [
            { amount: initialAmount, date: credit.date, isInitial: true, status: credit.initialStatus || 'pending' },
            ...fullHistory
          ];
        }
        if (credit.status === 'cleared') {
          return fullHistory.map(tx => ({ ...tx, status: 'cleared' }));
        }
        return fullHistory;
      };

      querySnapshot.forEach((document) => {
        const data = document.data();
        const fullHistory = getFullHistory(data);
        const outstandingAmount = fullHistory
          .filter(tx => tx.status !== 'cleared')
          .reduce((sum, tx) => sum + Number(tx.amount), 0);
          
        total += outstandingAmount;
        cList.push({ id: document.id, outstandingAmount, ...data });
      });

      cList.sort((a, b) => {
        const aCleared = a.outstandingAmount === 0 || a.status === 'cleared';
        const bCleared = b.outstandingAmount === 0 || b.status === 'cleared';
        if (aCleared && !bCleared) return 1;
        if (!aCleared && bCleared) return -1;
        
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.date).getTime();
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.date).getTime();
        return timeB - timeA;
      });

      setTotalCredit(total);
      setCreditsList(cList);
      setLoading(false);
    });

    return () => {
      unsubscribe();
      unsubscribeCredits();
    };
  }, [user]);

  const handleClearCredit = async (id) => {
    try {
      await updateDoc(doc(db, 'credits', id), {
        status: 'cleared'
      });
    } catch (error) {
      console.error("Error clearing credit:", error);
    }
  };

  const handleSaveTx = async () => {
    if (!formData.shopName.trim() || !formData.amount || !formData.date) {
      alert("All fields are mandatory. Please fill in everything.");
      return;
    }
    setIsSaving(true);
    try {
      const newShopName = formData.shopName.trim();
      await addDoc(collection(db, 'credits'), {
        shopName: newShopName,
        amount: Number(formData.amount),
        date: formData.date,
        userId: user.uid,
        createdAt: serverTimestamp(),
        history: [{
          amount: Number(formData.amount),
          date: formData.date,
          addedAt: new Date().toISOString()
        }]
      });
      
      const shopExists = shops.some(s => s.name.toLowerCase() === newShopName.toLowerCase());
      if (!shopExists) {
        await addDoc(collection(db, 'shops'), {
          name: newShopName,
          userId: user.uid,
          createdAt: serverTimestamp()
        });
      }
      
      setFormData({ shopName: '', amount: '', date: new Date().toISOString().split('T')[0] });
      setShowTxForm(false);
      playSuccessFeedback();
      alert("Credit Transaction Added!");
    } catch (e) {
      console.error(e);
      alert("Failed to save transaction.");
    }
    setIsSaving(false);
  };

  const [showDropdown, setShowDropdown] = useState(false);

  // ... (inside the component)

  const filteredShops = shops.filter(shop => 
    shop.name.toLowerCase().includes(formData.shopName.toLowerCase())
  );

  return (
    <div className="dashboard-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="section-title">Credit Accounts</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="action-btn" onClick={() => setShowTxForm(true)} style={{ padding: '8px 16px', flexDirection: 'row' }}>
            <PlusCircle size={20} />
            Add Transaction
          </button>
        </div>
      </div>

      <div className="metrics-grid" style={{ marginBottom: '16px' }}>
        <div className="metric-card success">
          <div className="metric-header">Total Credit Given</div>
          <h3>₹{totalCredit.toLocaleString('en-IN')}</h3>
        </div>
      </div>

      <div className="activity-list">
        <h3 className="sub-title">Shops & Customers</h3>
        {loading ? (
          <div className="activity-empty" style={{ minHeight: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div className="typing-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <div className="animated-loading-text">VANA DURGA BHAVANI ENTREPRENEURS</div>
          </div>
        ) : creditsList.length === 0 ? (
          <div className="activity-empty">
            <CreditCard size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
            <p>No credit accounts added yet.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {creditsList.map(credit => (
              <div 
                key={credit.id} 
                onClick={() => navigate(`/credit/${credit.id}`)}
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  padding: '16px', 
                  backgroundColor: 'var(--background)', 
                  borderRadius: 'var(--radius)', 
                  borderLeft: `4px solid ${credit.outstandingAmount === 0 ? 'var(--success)' : 'var(--warning)'}`, 
                  cursor: 'pointer',
                  opacity: credit.outstandingAmount === 0 ? 0.6 : 1
                }}
              >
                <div>
                  <div style={{ fontWeight: '500', fontSize: '1.1rem', color: 'var(--text-main)', textDecoration: credit.outstandingAmount === 0 ? 'line-through' : 'none' }}>
                    {credit.shopName}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {credit.outstandingAmount === 0 ? 'Cleared' : credit.date}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                  <div style={{ fontWeight: '600', color: credit.outstandingAmount === 0 ? 'var(--success)' : 'var(--warning)', fontSize: '1.1rem' }}>
                    ₹{Number(credit.outstandingAmount).toLocaleString('en-IN')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showTxForm && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '24px' }}>
          <div style={{ backgroundColor: 'var(--surface)', padding: '24px', borderRadius: 'var(--radius)', width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--primary-color)' }}>Add Credit Transaction</h3>
            
            <div style={{ position: 'relative' }}>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Search or Enter Shop Name" 
                value={formData.shopName} 
                onChange={(e) => {
                  setFormData({...formData, shopName: e.target.value});
                  setShowDropdown(true);
                }} 
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                style={{ width: '100%', boxSizing: 'border-box', paddingRight: '40px' }}
              />
              <ChevronDown 
                size={20} 
                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} 
              />
              {showDropdown && filteredShops.length > 0 && (
                <div style={{ 
                  position: 'absolute', top: '100%', left: 0, right: 0, 
                  backgroundColor: 'var(--surface)', border: '1px solid var(--border-color)', 
                  borderRadius: 'var(--radius)', marginTop: '4px', zIndex: 10,
                  maxHeight: '150px', overflowY: 'auto', boxShadow: 'var(--shadow-md)' 
                }}>
                  {filteredShops.map(shop => (
                    <div 
                      key={shop.id} 
                      onClick={() => {
                        setFormData({...formData, shopName: shop.name});
                        setShowDropdown(false);
                      }}
                      style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', cursor: 'pointer', color: 'var(--text-main)' }}
                    >
                      {shop.name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <input 
              type="text" 
              inputMode="numeric"
              className="form-input" 
              placeholder="Credit Amount (₹)" 
              value={formData.amount ? Number(formData.amount).toLocaleString('en-IN') : ''} 
              onChange={(e) => {
                const rawValue = e.target.value.replace(/[^0-9]/g, '');
                setFormData({...formData, amount: rawValue});
              }} 
            />

            <input 
              type="date"
              className="form-input" 
              value={formData.date}
              onChange={(e) => setFormData({...formData, date: e.target.value})}
              style={{ width: '100%', boxSizing: 'border-box', color: 'var(--text-main)' }}
            />

            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button 
                className="action-btn" 
                style={{ flex: 1, padding: '12px', border: '1px solid var(--border-color)', backgroundColor: 'transparent', boxShadow: 'none', color: 'var(--text-main)' }}
                onClick={() => setShowTxForm(false)}
              >
                Cancel
              </button>
              <button 
                className="action-btn" 
                style={{ flex: 1, padding: '12px', backgroundColor: 'var(--primary-color)', color: 'white' }}
                onClick={handleSaveTx}
                disabled={isSaving || !formData.shopName.trim() || !formData.amount || !formData.date}
              >
                {isSaving ? 'Saving...' : 'Save Credit'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
