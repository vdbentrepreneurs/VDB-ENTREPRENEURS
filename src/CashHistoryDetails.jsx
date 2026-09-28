import React, { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Calculator, Calendar, Trash2, Loader2 } from 'lucide-react';
import { deleteDoc, doc } from 'firebase/firestore';
import { db } from './firebase';

export default function CashHistoryDetails() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { id } = useParams();
  const [isDeleting, setIsDeleting] = useState(false);

  const item = state?.item;

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to permanently delete this history record?")) return;
    
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'cashCounts', id));
      navigate('/cash-history');
    } catch (error) {
      console.error("Error deleting record:", error);
      alert("Failed to delete record.");
      setIsDeleting(false);
    }
  };

  if (!item) {
    return (
      <div className="dashboard-container" style={{ textAlign: 'center', padding: '40px' }}>
        <p>Record not found.</p>
        <button onClick={() => navigate('/cash-history')} className="btn">Go Back</button>
      </div>
    );
  }

  const denominations = [1, 2, 5, 10, 20, 50, 100, 200, 500];

  return (
    <div className="dashboard-container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: '24px' }}>
        <button 
          onClick={handleDelete}
          disabled={isDeleting}
          style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: isDeleting ? 'not-allowed' : 'pointer', padding: '8px', display: 'flex', alignItems: 'center', opacity: isDeleting ? 0.7 : 1 }}
          title="Delete Record"
        >
          {isDeleting ? <Loader2 size={24} className="spinner" /> : <Trash2 size={24} />}
        </button>
      </div>

      <div style={{ background: 'linear-gradient(135deg, var(--primary-color), var(--secondary-color))', color: 'white', borderRadius: 'var(--radius)', padding: '32px 24px', boxShadow: 'var(--shadow-md)', display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ fontSize: '1rem', opacity: 0.9, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '600' }}>Total Amount</div>
        <div style={{ fontSize: '3rem', fontWeight: 'bold' }}>₹{item.total.toLocaleString('en-IN')}</div>
      </div>

      <div style={{ backgroundColor: 'var(--surface)', padding: '24px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-sm)', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Calendar size={24} color="var(--primary-color)" />
        <div>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Date & Time</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-main)' }}>
            {item.createdAt ? new Date(item.createdAt.seconds * 1000).toLocaleString('en-IN', {
              day: '2-digit', month: 'long', year: 'numeric',
              hour: '2-digit', minute: '2-digit', hour12: true
            }) : 'Just now'}
          </div>
        </div>
      </div>

      <div style={{ backgroundColor: 'var(--surface)', padding: '24px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
          <Calculator size={20} color="var(--primary-color)" />
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-main)' }}>Denomination Breakdown</h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 100px', gap: '16px', fontWeight: 'bold', borderBottom: '1px solid var(--background)', paddingBottom: '12px', marginBottom: '12px', color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase' }}>
          <div>Note</div>
          <div style={{ textAlign: 'center' }}>Quantity</div>
          <div style={{ textAlign: 'right' }}>Amount</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {denominations.map(denom => {
            const count = item.counts[denom];
            if (!count) return null;
            
            return (
              <div key={denom} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 100px', gap: '16px', alignItems: 'center' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text-main)' }}>₹{denom}</div>
                <div style={{ textAlign: 'center', fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text-main)', background: 'var(--background)', padding: '4px 12px', borderRadius: '6px' }}>
                  {count}
                </div>
                <div style={{ textAlign: 'right', fontSize: '1.2rem', fontWeight: '600', color: 'var(--primary-color)' }}>
                  ₹{(count * denom).toLocaleString('en-IN')}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
