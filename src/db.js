import Dexie from 'dexie';

export const db = new Dexie('VDBEntrepreneursDB');

db.version(1).stores({
  bills: '++id, shopName, date, amount, paymentType, categoryId, createdAt',
  shops: '++id, name, contactNumber, address, createdAt',
  creditTransactions: '++id, shopId, amount, date, createdAt',
  creditPayments: '++id, shopId, amount, date, createdAt',
  debts: '++id, lenderName, principalAmount, dateBorrowed, interestType, interestRate, createdAt',
  debtPayments: '++id, debtId, totalPayment, principalPaid, interestPaid, date, createdAt',
  categories: '++id, name, type, createdAt'
});

// Seed default categories if none exist
db.on('populate', () => {
  db.categories.bulkAdd([
    { name: 'Stock / Purchases', type: 'expense', createdAt: new Date().toISOString() },
    { name: 'Transport', type: 'expense', createdAt: new Date().toISOString() },
    { name: 'Salaries', type: 'expense', createdAt: new Date().toISOString() },
    { name: 'Rent', type: 'expense', createdAt: new Date().toISOString() },
    { name: 'Electricity', type: 'expense', createdAt: new Date().toISOString() },
    { name: 'Maintenance', type: 'expense', createdAt: new Date().toISOString() },
    { name: 'Other', type: 'expense', createdAt: new Date().toISOString() }
  ]);
});
