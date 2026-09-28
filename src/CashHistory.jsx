import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { History, ChevronRight, Trash2, CheckCircle2, Circle, X, Loader2 } from 'lucide-react';
import { auth, db } from './firebase';
import { collection, query, where, getDocs, doc, deleteDoc } from 'firebase/firestore';

export default function CashHistory() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const navigate = useNavigate();
  const pressTimer = useRef(null);

  const fetchHistory = async () => {
    if (!auth.currentUser) return;
    try {
      setLoading(true);
      const q = query(
        collection(db, 'cashCounts'),
        where('userId', '==', auth.currentUser.uid)
      );
      const snap = await getDocs(q);
      const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      docs.sort((a, b) => {
        const timeA = a.createdAt ? a.createdAt.toMillis() : Date.now();
        const timeB = b.createdAt ? b.createdAt.toMillis() : Date.now();
        return timeB - timeA;
      });
      
      setHistory(docs);
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handlePressStart = (id, item) => {
    if (isSelectionMode) return;
    pressTimer.current = setTimeout(() => {
      setIsSelectionMode(true);
      toggleSelection(id);
      if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
    }, 500); // 500ms for long press
  };

  const handlePressEnd = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
    }
  };

  const toggleSelection = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (next.size === 0) setIsSelectionMode(false);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleClick = (id, item) => {
    if (isSelectionMode) {
      toggleSelection(id);
    } else {
      navigate(`/cash-history/${id}`, { state: { item } });
    }
  };

  const cancelSelection = () => {
    setIsSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.size} record(s)?`)) return;

    setIsDeleting(true);
    try {
      const deletePromises = Array.from(selectedIds).map(id => deleteDoc(doc(db, 'cashCounts', id)));
      await Promise.all(deletePromises);
      
      cancelSelection();
      await fetchHistory();
    } catch (error) {
      console.error("Error bulk deleting:", error);
      alert("Failed to delete selected records.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="dashboard-container">
      {isSelectionMode ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', backgroundColor: 'var(--primary-color)', padding: '12px 16px', borderRadius: '8px', color: 'white', boxShadow: 'var(--shadow-md)', position: 'sticky', top: '16px', zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button onClick={cancelSelection} style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <X size={24} />
            </button>
            <h2 className="section-title" style={{ margin: 0, color: 'white', fontSize: '1.2rem' }}>
              {selectedIds.size} Selected
            </h2>
          </div>
          <button 
            onClick={handleBulkDelete}
            disabled={isDeleting}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'transparent', border: 'none', color: 'white', cursor: isDeleting ? 'not-allowed' : 'pointer', padding: '4px', opacity: isDeleting ? 0.7 : 1, fontWeight: 'bold' }}
          >
            {isDeleting ? <><Loader2 size={24} className="spinner" /> Deleting...</> : <Trash2 size={24} />}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}>
          <h2 className="section-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <History size={28} color="var(--primary-color)" /> Cash History
          </h2>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <div className="typing-dots"><span></span><span></span><span></span></div>
        </div>
      ) : history.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius)' }}>
          <p style={{ color: 'var(--text-muted)' }}>No saved cash counts yet.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {history.map(item => {
            const isSelected = selectedIds.has(item.id);
            return (
              <div 
                key={item.id} 
                onMouseDown={() => handlePressStart(item.id, item)}
                onMouseUp={handlePressEnd}
                onMouseLeave={handlePressEnd}
                onTouchStart={() => handlePressStart(item.id, item)}
                onTouchEnd={handlePressEnd}
                onClick={() => handleClick(item.id, item)}
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  padding: '20px', 
                  background: isSelected ? 'var(--primary-light)' : 'var(--surface)', 
                  borderRadius: 'var(--radius)', 
                  boxShadow: 'var(--shadow-sm)', 
                  cursor: 'pointer', 
                  transition: 'all 0.2s', 
                  borderLeft: `4px solid ${isSelected ? 'transparent' : 'var(--primary-color)'}`,
                  border: isSelected ? '2px solid var(--primary-color)' : 'none'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  {isSelectionMode && (
                    isSelected ? <CheckCircle2 size={24} color="var(--primary-color)" /> : <Circle size={24} color="var(--text-muted)" />
                  )}
                  <div>
                    <div style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '1.4rem', marginBottom: '4px' }}>
                      ₹{item.total.toLocaleString('en-IN')}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                      {item.createdAt ? new Date(item.createdAt.seconds * 1000).toLocaleString('en-IN', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit', hour12: true
                      }) : 'Just now'}
                    </div>
                  </div>
                </div>
                {!isSelectionMode && <ChevronRight size={24} color="var(--text-muted)" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
