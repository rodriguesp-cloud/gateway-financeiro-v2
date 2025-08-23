import { db } from '@/lib/firebase';
import { collection, doc, getDocs, getDoc, setDoc, addDoc, updateDoc, deleteDoc, writeBatch, onSnapshot, query, where, Timestamp } from 'firebase/firestore';

const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`);

const defaultCategorias = [];

const defaultSubcategorias = [];


export class FirestoreService {
    userId: string;
    categoriasCol: any;
    subcategoriasCol: any;

    entriesCol: any;
    accountsCol: any;
    configDoc: any;

    constructor(userId: string) {
        if (!userId) {
            throw new Error("User ID is required to initialize FirestoreService");
        }
        this.userId = userId;
        this.categoriasCol = collection(db, 'users', this.userId, 'categorias');
        this.subcategoriasCol = collection(db, 'users', this.userId, 'subcategorias');
        this.entriesCol = collection(db, 'users', this.userId, 'entries');
        this.accountsCol = collection(db, 'users', this.userId, 'accounts');
        this.configDoc = doc(db, 'users', this.userId, 'config', 'main');
    }

    async initializeDefaultData() {
        const categoriasSnapshot = await getDocs(this.categoriasCol);
        if (categoriasSnapshot.empty) {
            const entriesSnapshot = await getDocs(this.entriesCol);
            if (!entriesSnapshot.empty) {
                const deleteBatch = writeBatch(db);
                entriesSnapshot.docs.forEach(doc => deleteBatch.delete(doc.ref));
                await deleteBatch.commit();
            }
        }
    }
    
    // Accounts
    async getAccounts() {
        const snapshot = await getDocs(this.accountsCol);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    async addAccount(account) {
        const docRef = doc(this.accountsCol, account.id);
        await setDoc(docRef, account);
    }
    
    async updateAccount(id, data) {
        const dataToUpdate = { ...data };
        delete dataToUpdate.id;
        await updateDoc(doc(this.accountsCol, id), dataToUpdate);
    }

    async deleteAccount(id) {
        await deleteDoc(doc(this.accountsCol, id));
    }

    // Categorias
    async getCategorias() {
        const snapshot = await getDocs(this.categoriasCol);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    async addCategoria(categoria) {
        const docRef = doc(this.categoriasCol, categoria.id);
        await setDoc(docRef, categoria);
    }

    async updateCategoria(id, data) {
        const dataToUpdate = { ...data };
        delete dataToUpdate.id;
        await updateDoc(doc(this.categoriasCol, id), dataToUpdate);
    }

    async deleteCategoria(id) {
        await deleteDoc(doc(this.categoriasCol, id));
    }

    // Subcategorias
    async getSubcategorias() {
        const snapshot = await getDocs(this.subcategoriasCol);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    async addSubcategoria(subcategoria) {
        const docRef = doc(this.subcategoriasCol, subcategoria.id);
        await setDoc(docRef, subcategoria);
    }

    async updateSubcategoria(id, data) {
        const dataToUpdate = { ...data };
        delete dataToUpdate.id;
        await updateDoc(doc(this.subcategoriasCol, id), dataToUpdate);
    }
    
    async deleteSubcategoria(id) {
        await deleteDoc(doc(this.subcategoriasCol, id));
    }

    // Entries
    async getEntries() {
        const snapshot = await getDocs(this.entriesCol);
        return snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(entry => entry.id); // Filter out entries without a valid ID
    }

    async addEntry(entry) {
        const docRef = doc(this.entriesCol, entry.id);
        await setDoc(docRef, entry);
    }
    
    async addBatchEntries(entries) {
        const batch = writeBatch(db);
        entries.forEach(entry => {
            const docRef = doc(this.entriesCol, entry.id);
            batch.set(docRef, entry);
        });
        await batch.commit();
    }

    async updateEntry(id, data) {
        const dataToUpdate = { ...data };
        delete dataToUpdate.id;
        await updateDoc(doc(this.entriesCol, id), dataToUpdate);
    }

    async deleteEntry(id) {
        if (!id) {
            console.error("Delete failed: Entry ID is missing.");
            return;
        }
        await deleteDoc(doc(this.entriesCol, id));
    }

    // Config
    async getConfig() {
        const docSnap = await getDoc(this.configDoc);
        if (docSnap.exists()) {
            const config = docSnap.data();
            // Convert Timestamps to Dates if they exist
            if (config.dateRange?.from) {
                config.dateRange.from = config.dateRange.from.toDate();
            }
            if (config.dateRange?.to) {
                config.dateRange.to = config.dateRange.to.toDate();
            }
            return config;
        }
        return null;
    }

    async saveConfig(config) {
        const dataToSave = { ...config };
    
        // This is the fix: check dateRange before saving
        if (dataToSave.dateRange && dataToSave.dateRange.from && dataToSave.dateRange.to) {
          dataToSave.dateRange = {
            from: Timestamp.fromDate(dataToSave.dateRange.from),
            to: Timestamp.fromDate(dataToSave.dateRange.to),
          };
        } else {
          // If range is incomplete, invalid, or undefined, delete it before saving.
          delete dataToSave.dateRange;
        }
        
        await setDoc(this.configDoc, dataToSave, { merge: true });
    }

    // Real-time subscriptions
    subscribeToData(callback) {
        const unsubCategorias = onSnapshot(this.categoriasCol, (snapshot) => {
            const categorias = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback({ type: 'categorias', data: categorias });
        });

        const unsubSubcategorias = onSnapshot(this.subcategoriasCol, (snapshot) => {
            const subcategorias = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback({ type: 'subcategorias', data: subcategorias });
        });

        const unsubEntries = onSnapshot(this.entriesCol, (snapshot) => {
            const entries = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(entry => !!entry.id); // **Rigorously filter out entries without a valid ID.**
            callback({ type: 'entries', data: entries });
        });
        
        const unsubAccounts = onSnapshot(this.accountsCol, (snapshot) => {
            const accounts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback({ type: 'accounts', data: accounts });
        });

        return () => {
            unsubCategorias();
            unsubSubcategorias();
            unsubEntries();
            unsubAccounts();
        };
    }
}
