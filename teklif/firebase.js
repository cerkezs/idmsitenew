// Firebase Yapılandırması ve Firestore Bağlantısı
// Bu dosya Firebase SDK v10 Compat (CDN) kütüphaneleri ile çalışır.

// Varsayılan Firebase Config (Kendi bilgilerinizi buraya yapıştırabilirsiniz)
const DEFAULT_FIREBASE_CONFIG = {
    apiKey: "AIzaSyDSFCXvUegTNUOncDShgr-pgGjsZBgotlo",
    authDomain: "idm-teklif.firebaseapp.com",
    databaseURL: "https://idm-teklif-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "idm-teklif",
    storageBucket: "idm-teklif.firebasestorage.app",
    messagingSenderId: "143744192307",
    appId: "1:143744192307:web:60029b31b0c7ae864ff846"
};

let db = null;
let firebaseApp = null;

// Firebase'i başlat
function initFirebase() {
    // Önce LocalStorage'dan kullanıcı tarafından kaydedilmiş config var mı kontrol et
    let config = DEFAULT_FIREBASE_CONFIG;
    const savedConfig = localStorage.getItem("idm_firebase_config");
    
    if (savedConfig) {
        try {
            config = JSON.parse(savedConfig);
        } catch (e) {
            console.error("Kayıtlı Firebase yapılandırması ayrıştırılamadı:", e);
        }
    }

    // Geçersiz veya varsayılan config ise uyarı ver
    if (!config.apiKey || config.apiKey.includes("YOUR_API_KEY_HERE")) {
        console.warn("Firebase yapılandırması eksik! Lütfen uygulamadaki Ayarlar menüsünden Firebase bilgilerinizi girin.");
        showFirebaseSetupWarning(true);
        return false;
    }

    try {
        if (firebase.apps.length === 0) {
            firebaseApp = firebase.initializeApp(config);
        } else {
            firebaseApp = firebase.app();
        }
        db = firebase.firestore();
        
        // Firestore offline yeteneğini etkinleştir (PWA için)
        db.enablePersistence().catch((err) => {
            if (err.code == 'failed-precondition') {
                // Birden fazla sekme açık olduğunda oluşabilir
                console.warn("Firestore çevrimdışı kalıcılık etkinleştirilemedi (sekme çakışması)");
            } else if (err.code == 'unimplemented') {
                // Tarayıcı desteklemiyorsa
                console.warn("Tarayıcı Firestore çevrimdışı kalıcılığı desteklemiyor");
            }
        });

        showFirebaseSetupWarning(false);
        console.log("Firebase & Firestore başarıyla başlatıldı.");
        
        // Bağlantı başarılı olunca dropdown'ları doldur
        loadCustomersFromFirebase();
        loadProductsFromFirebase();
        loadProposalsFromFirebase();
        return true;
    } catch (error) {
        console.error("Firebase başlatma hatası:", error);
        showFirebaseSetupWarning(true, error.message);
        return false;
    }
}

// Firebase Kurulum Uyarısı Arayüz Kontrolü
function showFirebaseSetupWarning(show, errorMessage = "") {
    const warningEl = document.getElementById("firebase-connection-warning");
    if (warningEl) {
        warningEl.style.display = show ? "block" : "none";
        if (errorMessage) {
            const errText = warningEl.querySelector(".error-text");
            if (errText) errText.textContent = `Hata: ${errorMessage}`;
        }
    }
}

// ----------------------------------------------------
// MÜŞTERİ YÖNETİMİ (Firestore CRUD)
// ----------------------------------------------------

// Yeni Müşteri Ekle
async function addCustomerToFirebase(customerData) {
    if (!db) return null;
    try {
        const docRef = await db.collection("customers").add({
            name: customerData.name,
            tel: customerData.tel,
            email: customerData.email,
            address: customerData.address || "",
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log("Müşteri eklendi, ID:", docRef.id);
        await loadCustomersFromFirebase(); // Listeyi güncelle
        return docRef.id;
    } catch (error) {
        console.error("Müşteri ekleme hatası:", error);
        alert("Müşteri kaydedilirken bir hata oluştu: " + error.message);
        return null;
    }
}

// Müşteri Sil
async function deleteCustomerFromFirebase(id) {
    if (!db) return false;
    try {
        await db.collection("customers").doc(id).delete();
        console.log("Müşteri silindi, ID:", id);
        await loadCustomersFromFirebase();
        return true;
    } catch (error) {
        console.error("Müşteri silme hatası:", error);
        alert("Müşteri silinirken bir hata oluştu: " + error.message);
        return false;
    }
}

// Müşteri Güncelle
async function updateCustomerInFirebase(id, customerData) {
    if (!db) return false;
    try {
        await db.collection("customers").doc(id).update({
            name: customerData.name,
            tel: customerData.tel,
            email: customerData.email
        });
        console.log("Müşteri güncellendi, ID:", id);
        await loadCustomersFromFirebase();
        return true;
    } catch (error) {
        console.error("Müşteri güncelleme hatası:", error);
        alert("Müşteri güncellenirken bir hata oluştu: " + error.message);
        return false;
    }
}

// Müşterileri Çek
async function loadCustomersFromFirebase() {
    if (!db) return [];
    try {
        const querySnapshot = await db.collection("customers").get();
        const customers = [];
        querySnapshot.forEach((doc) => {
            customers.push({ id: doc.id, ...doc.data() });
        });
        
        // Türkçe alfabetik sıralama
        customers.sort((a, b) => a.name.localeCompare(b.name, 'tr', { sensitivity: 'base' }));
        
        // UI Dropdown'ı güncelle
        populateCustomersDropdown(customers);
        return customers;
    } catch (error) {
        console.error("Müşteriler yüklenemedi:", error);
        return [];
    }
}

// ----------------------------------------------------
// ÜRÜN YÖNETİMİ (Firestore CRUD)
// ----------------------------------------------------

// Yeni Ürün Ekle
async function addProductToFirebase(productData) {
    if (!db) return null;
    try {
        const docRef = await db.collection("products").add({
            name: productData.name,
            price: parseFloat(productData.price) || 0,
            currency: productData.currency || "TL",
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log("Ürün eklendi, ID:", docRef.id);
        await loadProductsFromFirebase(); // Listeyi güncelle
        return docRef.id;
    } catch (error) {
        console.error("Ürün ekleme hatası:", error);
        alert("Ürün kaydedilirken bir hata oluştu: " + error.message);
        return null;
    }
}

// Ürün Sil
async function deleteProductFromFirebase(id) {
    if (!db) return false;
    try {
        await db.collection("products").doc(id).delete();
        console.log("Ürün silindi, ID:", id);
        await loadProductsFromFirebase();
        return true;
    } catch (error) {
        console.error("Ürün silme hatası:", error);
        alert("Ürün silinirken bir hata oluştu: " + error.message);
        return false;
    }
}

// Ürün Güncelle
async function updateProductInFirebase(id, productData) {
    if (!db) return false;
    try {
        await db.collection("products").doc(id).update({
            name: productData.name,
            price: parseFloat(productData.price) || 0,
            currency: productData.currency || "TL"
        });
        console.log("Ürün güncellendi, ID:", id);
        await loadProductsFromFirebase();
        return true;
    } catch (error) {
        console.error("Ürün güncelleme hatası:", error);
        alert("Ürün güncellenirken bir hata oluştu: " + error.message);
        return false;
    }
}

// Ürünleri Çek
async function loadProductsFromFirebase() {
    if (!db) return [];
    try {
        const querySnapshot = await db.collection("products").get();
        const products = [];
        querySnapshot.forEach((doc) => {
            products.push({ id: doc.id, ...doc.data() });
        });
        
        // Türkçe alfabetik sıralama
        products.sort((a, b) => a.name.localeCompare(b.name, 'tr', { sensitivity: 'base' }));
        
        // UI Ürün seçicilerini güncelle
        updateProductsCache(products);
        return products;
    } catch (error) {
        console.error("Ürünler yüklenemedi:", error);
        return [];
    }
}

// ----------------------------------------------------
// TEKLİF NO / GEÇMİŞ YÖNETİMİ
// ----------------------------------------------------

// Yeni Teklif Kaydet
async function saveProposalToFirebase(proposalData) {
    if (!db) return null;
    try {
        // Zaten varsa üzerine yaz veya yenisini oluştur
        await db.collection("proposals").doc(proposalData.id).set({
            customerName: proposalData.customerName,
            date: proposalData.date,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log("Teklif kaydedildi:", proposalData.id);
        await loadProposalsFromFirebase();
        return proposalData.id;
    } catch (error) {
        console.error("Teklif kaydetme hatası:", error);
        return null;
    }
}

// Teklif Numaralarını Çek
async function loadProposalsFromFirebase() {
    if (!db) return [];
    try {
        const querySnapshot = await db.collection("proposals").orderBy("createdAt", "desc").limit(50).get();
        const proposals = [];
        querySnapshot.forEach((doc) => {
            proposals.push({ id: doc.id, ...doc.data() });
        });
        
        // UI Teklif No dropdown'ını güncelle
        populateProposalsDropdown(proposals);
        return proposals;
    } catch (error) {
        console.error("Teklifler yüklenemedi:", error);
        return [];
    }
}
