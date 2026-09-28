import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { doc, getDoc, updateDoc, deleteDoc, collection, addDoc, serverTimestamp, arrayUnion, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import { ArrowLeft, CheckCircle, ReceiptText, PlusCircle, Trash2 } from 'lucide-react';
import { playSuccessFeedback } from './utils';

export default function CreditBill() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [credit, setCredit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddCredit, setShowAddCredit] = useState(false);
  const [newCreditData, setNewCreditData] = useState({ amount: '', date: new Date().toISOString().split('T')[0] });
  const [isSaving, setIsSaving] = useState(false);
  const [isClearingTx, setIsClearingTx] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [confirmAction, setConfirmAction] = useState(null);
  const user = auth.currentUser;

  useEffect(() => {
    let unsubscribeDoc = () => {};

    const unsubscribeAuth = auth.onAuthStateChanged((u) => {
      if (u) {
        const docRef = doc(db, 'credits', id);
        unsubscribeDoc = onSnapshot(docRef, (docSnap) => {
          const data = docSnap.exists() ? docSnap.data() : null;
          if (data) {
            setCredit({ id: docSnap.id, ...data });
          } else {
            setCredit(null);
          }
          setLoading(false);
        }, (error) => {
          console.error("Error fetching credit", error);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      unsubscribeDoc();
    };
  }, [id]);

  const handleClear = async () => {
    try {
      await updateDoc(doc(db, 'credits', id), {
        status: 'cleared'
      });
      navigate('/credit');
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddExtraCredit = async () => {
    if (!newCreditData.amount || !newCreditData.date) {
      alert("All fields are mandatory. Please fill in everything.");
      return;
    }
    setIsSaving(true);
    try {
      const extraAmount = Number(newCreditData.amount);
      const newTotal = Number(credit.amount) + extraAmount;
      const transactionObj = {
        amount: extraAmount,
        date: newCreditData.date,
        addedAt: new Date().toISOString()
      };

      await updateDoc(doc(db, 'credits', id), {
        amount: newTotal,
        date: newCreditData.date,
        history: arrayUnion(transactionObj),
        status: 'pending'
      });
      
      setCredit(prev => ({ 
        ...prev, 
        amount: newTotal, 
        date: newCreditData.date,
        history: [...(prev.history || []), transactionObj],
        status: 'pending'
      }));
      setNewCreditData({ amount: '', date: new Date().toISOString().split('T')[0] });
      setShowAddCredit(false);
      playSuccessFeedback();
      alert("Extra Credit Added Successfully!");
    } catch (e) {
      console.error(e);
      alert("Failed to update transaction.");
    }
    setIsSaving(false);
  };

  if (loading) {
    return <div className="dashboard-container"><div style={{textAlign: 'center', marginTop: '50px'}}>Loading...</div></div>;
  }

  if (!credit) {
    return (
      <div className="dashboard-container">
        <button onClick={() => navigate(-1)} className="action-btn" style={{ width: 'fit-content', padding: '8px 16px', marginBottom: '24px', backgroundColor: 'var(--surface)', color: 'var(--text-main)', flexDirection: 'row' }}>
          <ArrowLeft size={20} style={{ marginRight: '8px' }} /> Back
        </button>
        <div style={{ textAlign: 'center', marginTop: '50px' }}>Credit bill not found.</div>
      </div>
    );
  }

  const executeDeleteCredit = async () => {
    setConfirmAction(null);
    try {
      await deleteDoc(doc(db, 'credits', id));
      navigate('/credit');
    } catch (e) {
      console.error("Failed to delete credit", e);
      alert("Failed to delete the credit bill.");
    }
  };

  const handleDeleteCredit = () => {
    setConfirmAction({
      title: "Delete Credit Bill?",
      message: "Are you sure you want to delete this entire credit bill? This action cannot be undone.",
      confirmText: "Delete",
      confirmStyle: "var(--danger)",
      action: () => executeDeleteCredit()
    });
  };

  const executeClearTransaction = async (idx) => {
    setConfirmAction(null);
    setIsClearingTx(idx);
    const fullHistory = getFullHistory();
    const txToClear = fullHistory[idx];
    
    try {
      let docUpdates = {};
      if (txToClear.isInitial) {
        docUpdates.initialStatus = 'cleared';
      } else {
        const historyOffset = fullHistory.length - (credit.history || []).length;
        const historyIdx = idx - historyOffset;
        
        const updatedHistory = [...(credit.history || [])];
        updatedHistory[historyIdx] = { ...updatedHistory[historyIdx], status: 'cleared' };
        docUpdates.history = updatedHistory;
      }

      await updateDoc(doc(db, 'credits', id), docUpdates);
      setCredit(prev => ({ ...prev, ...docUpdates }));
    } catch (e) {
      console.error("Failed to clear transaction", e);
    } finally {
      setIsClearingTx(null);
    }
  };

  const handleClearTransaction = (idx) => {
    setConfirmAction({
      title: "Clear Transaction?",
      message: "Are you sure you want to mark this transaction as cleared?",
      confirmText: "Yes, Clear It",
      confirmStyle: "var(--success)",
      action: () => executeClearTransaction(idx)
    });
  };

  // Calculate full history to handle backward compatibility
  const getFullHistory = () => {
    let fullHistory = credit.history || [];
    
    // Check if the sum of history matches the total amount
    const historySum = fullHistory.reduce((sum, tx) => sum + Number(tx.amount), 0);
    
    if (historySum < Number(credit.amount)) {
      // It means the initial amount is missing from the history array (legacy document)
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

  const fullHistory = getFullHistory();

  const outstandingAmount = fullHistory
    .filter(tx => tx.status !== 'cleared')
    .reduce((sum, tx) => sum + Number(tx.amount), 0);

  const paidAmount = fullHistory
    .filter(tx => tx.status === 'cleared')
    .reduce((sum, tx) => sum + Number(tx.amount), 0);
    
  const totalAmount = outstandingAmount + paidAmount;

  const fullHistoryWithIdx = fullHistory.map((tx, i) => ({ ...tx, originalIdx: i }));
  const sortedHistory = [...fullHistoryWithIdx].sort((a, b) => {
    if (a.status === 'cleared' && b.status !== 'cleared') return 1;
    if (a.status !== 'cleared' && b.status === 'cleared') return -1;
    return 0; // maintain original relative order otherwise
  });

  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.ceil(sortedHistory.length / ITEMS_PER_PAGE);
  const currentHistory = sortedHistory.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div className="dashboard-container">
      <style>{`
        @keyframes spinTx { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes fadeInTx { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
      `}</style>


      <div style={{ backgroundColor: 'var(--surface)', padding: '24px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-md)' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px dashed var(--border-color)' }}>
          <div style={{ display: 'inline-block', padding: '16px', backgroundColor: 'var(--background)', borderRadius: '50%', marginBottom: '16px' }}>
            <ReceiptText size={40} color="var(--primary-color)" />
          </div>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '2.5rem', color: outstandingAmount === 0 ? 'var(--success)' : 'var(--warning)' }}>
            ₹{totalAmount.toLocaleString('en-IN')}
          </h1>
          <p style={{ margin: 0, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.9rem', fontWeight: 'bold' }}>
            {outstandingAmount === 0 ? 'Cleared' : 'Total Credit'}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>Shop / Customer</span>
            <span style={{ fontWeight: '500', color: 'var(--text-main)' }}>{credit.shopName}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>Date Issued</span>
            <span style={{ fontWeight: '500', color: 'var(--text-main)' }}>{credit.date}</span>
          </div>
        </div>

        {sortedHistory.length > 0 && (
          <div style={{ marginBottom: '32px' }}>
            <h4 style={{ color: 'var(--text-muted)', margin: '0 0 12px 0', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>Transactions</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {currentHistory.map((tx) => (
                <div key={tx.originalIdx} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', backgroundColor: 'var(--background)', borderRadius: 'var(--radius)', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ color: 'var(--text-main)', fontSize: '0.9rem' }}>
                      {tx.date} {tx.isInitial && <span style={{fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '8px'}}>(Initial)</span>}
                    </span>
                    {tx.status === 'cleared' && (
                      <span style={{ fontSize: '0.8rem', color: '#10b981', display: 'flex', alignItems: 'center', marginTop: '4px', animation: 'fadeInTx 0.5s ease-in' }}>
                        <CheckCircle size={14} style={{ marginRight: '4px' }} /> Cleared
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontWeight: '500', color: tx.status === 'cleared' ? 'var(--text-muted)' : (tx.isInitial ? 'var(--text-main)' : 'var(--danger)'), textDecoration: tx.status === 'cleared' ? 'line-through' : 'none' }}>
                      + ₹{Number(tx.amount).toLocaleString('en-IN')}
                    </span>
                    {tx.status !== 'cleared' && (
                      <button 
                        onClick={() => handleClearTransaction(tx.originalIdx)}
                        disabled={isClearingTx === tx.originalIdx}
                        style={{ padding: '6px 12px', fontSize: '0.8rem', backgroundColor: 'var(--surface)', color: isClearingTx === tx.originalIdx ? 'var(--text-muted)' : 'var(--primary-color)', border: '1px solid', borderColor: isClearingTx === tx.originalIdx ? 'var(--border-color)' : 'var(--primary-color)', borderRadius: 'var(--radius)', cursor: isClearingTx === tx.originalIdx ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        {isClearingTx === tx.originalIdx ? (
                          <>
                            <span style={{ width: '12px', height: '12px', border: '2px solid', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spinTx 1s linear infinite' }}></span>
                            Clearing...
                          </>
                        ) : 'Clear'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                <button 
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  style={{ padding: '8px 16px', borderRadius: 'var(--radius)', backgroundColor: currentPage === 1 ? 'transparent' : 'var(--surface)', color: currentPage === 1 ? 'var(--text-muted)' : 'var(--primary-color)', border: currentPage === 1 ? '1px solid var(--border-color)' : '1px solid var(--primary-color)', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                >
                  Previous
                </button>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Page {currentPage} of {totalPages}</span>
                <button 
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  style={{ padding: '8px 16px', borderRadius: 'var(--radius)', backgroundColor: currentPage === totalPages ? 'transparent' : 'var(--surface)', color: currentPage === totalPages ? 'var(--text-muted)' : 'var(--primary-color)', border: currentPage === totalPages ? '1px solid var(--border-color)' : '1px solid var(--primary-color)', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button 
            className="action-btn"
            style={{ width: '100%', padding: '12px', fontSize: '1rem', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--surface)', color: 'var(--primary-color)', border: '1px solid var(--primary-color)' }}
            onClick={() => setShowAddCredit(true)}
          >
            <PlusCircle size={20} style={{ marginRight: '8px' }} />
            Add Extra Transaction
          </button>

          <button 
            className="action-btn"
            style={{ width: '100%', padding: '12px', fontSize: '1rem', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--surface)', color: 'var(--danger)', border: '1px solid var(--danger)' }}
            onClick={handleDeleteCredit}
          >
            <Trash2 size={20} style={{ marginRight: '8px' }} />
            Delete Credit Bill
          </button>
        </div>
      </div>

      {showAddCredit && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '24px' }}>
          <div style={{ backgroundColor: 'var(--surface)', padding: '24px', borderRadius: 'var(--radius)', width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--primary-color)' }}>Add Extra Transaction for {credit.shopName}</h3>
            
            <input 
              type="text" 
              inputMode="numeric"
              className="form-input" 
              placeholder="Credit Amount (₹)" 
              value={newCreditData.amount ? Number(newCreditData.amount).toLocaleString('en-IN') : ''} 
              onChange={(e) => {
                const rawValue = e.target.value.replace(/[^0-9]/g, '');
                setNewCreditData({...newCreditData, amount: rawValue});
              }} 
            />

            <input 
              type="date"
              className="form-input" 
              value={newCreditData.date}
              onChange={(e) => setNewCreditData({...newCreditData, date: e.target.value})}
              style={{ width: '100%', boxSizing: 'border-box', color: 'var(--text-main)' }}
            />

            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button 
                className="action-btn" 
                style={{ flex: 1, padding: '12px', border: '1px solid var(--border-color)', backgroundColor: 'transparent', boxShadow: 'none', color: 'var(--text-main)' }}
                onClick={() => setShowAddCredit(false)}
              >
                Cancel
              </button>
              <button 
                className="action-btn" 
                style={{ flex: 1, padding: '12px', backgroundColor: 'var(--primary-color)', color: 'white' }}
                onClick={handleAddExtraCredit}
                disabled={isSaving || !newCreditData.amount || !newCreditData.date}
              >
                {isSaving ? 'Saving...' : 'Save Credit'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {confirmAction && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', backdropFilter: 'blur(2px)' }} onClick={() => setConfirmAction(null)}>
          <div style={{ backgroundColor: 'var(--surface)', padding: '24px', borderRadius: 'var(--radius)', width: '100%', maxWidth: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px 0', color: 'var(--text-main)', fontSize: '1.25rem' }}>{confirmAction.title}</h3>
            <p style={{ margin: '0 0 24px 0', color: 'var(--text-muted)', lineHeight: '1.5' }}>{confirmAction.message}</p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                className="action-btn" 
                style={{ flex: 1, padding: '12px', backgroundColor: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border-color)', boxShadow: 'none' }}
                onClick={() => setConfirmAction(null)}
              >
                Cancel
              </button>
              <button 
                className="action-btn" 
                style={{ flex: 1, padding: '12px', backgroundColor: confirmAction.confirmStyle, color: 'white' }}
                onClick={confirmAction.action}
              >
                {confirmAction.confirmText}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
