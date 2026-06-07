const IDM_PASSWORD = "8832";
const TIMEOUT_MS = 30 * 60 * 1000; // 30 dakika
let inactivityTimer;

function initAuth() {
    const overlay = document.getElementById("login-overlay");
    const passInput = document.getElementById("login-password");
    const loginBtn = document.getElementById("btn-login");
    const errorMsg = document.getElementById("login-error");

    function checkAuth() {
        if (sessionStorage.getItem("idm_auth") === "true") {
            overlay.style.display = "none";
            resetInactivityTimer();
        } else {
            overlay.style.display = "flex";
            clearTimeout(inactivityTimer);
        }
    }

    function doLogin() {
        if (passInput.value === IDM_PASSWORD) {
            sessionStorage.setItem("idm_auth", "true");
            errorMsg.style.display = "none";
            passInput.value = "";
            checkAuth();
        } else {
            errorMsg.style.display = "block";
            passInput.value = "";
            passInput.focus();
        }
    }

    loginBtn.addEventListener("click", doLogin);
    passInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") doLogin();
    });

    checkAuth();
}

function resetInactivityTimer() {
    if (sessionStorage.getItem("idm_auth") !== "true") return;
    
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        // Zaman aşımı doldu
        sessionStorage.removeItem("idm_auth");
        document.getElementById("login-overlay").style.display = "flex";
    }, TIMEOUT_MS);
}

// Etkileşim olduğunda sayacı sıfırla
['mousemove', 'keydown', 'click', 'scroll'].forEach(evt => {
    document.addEventListener(evt, resetInactivityTimer, true);
});

document.addEventListener("DOMContentLoaded", () => {
    initAuth();
    
    // Tarih alanına bugünün tarihini koy
    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById("input-5");
    if (dateInput) {
        dateInput.value = today;
        document.getElementById("out-5").textContent = new Date(today).toLocaleDateString('tr-TR');
    }

    initItemsForm();
    setupEventListeners();
    
    // Firebase bağlantısını başlat
    if (typeof initFirebase === 'function') {
        initFirebase();
    }
    
    // Firebase Config textarea'sını doldur
    const configInput = document.getElementById("firebase-config-input");
    if (configInput) {
        const savedConfig = localStorage.getItem("idm_firebase_config");
        if (savedConfig) {
            configInput.value = savedConfig;
        }
    }
});

let currentItemCount = 0;
let currentCurrencySymbol = "₺"; // Varsayılan: Türk Lirası
let productsCache = [];
let customersCache = [];

// Para birimi değiştirme fonksiyonu
function setCurrency(btn) {
    document.querySelectorAll(".currency-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    currentCurrencySymbol = btn.getAttribute("data-symbol");

    // Tüm önizleme satırlarındaki sembolü güncelle
    document.querySelectorAll(".currency").forEach(el => {
        el.textContent = currentCurrencySymbol;
    });

    // Hesaplamaları yeniden yap
    calculateTotals();
}

// İlgili satırları oluşturmak için (sol form ve sağ tablo)
function addNewItemRow() {
    currentItemCount++;
    const i = currentItemCount;

    // Form tarafı
    const formContainer = document.getElementById("items-container");
    
    // Sabit ürün dropdown listesi seçeneklerini oluştur
    let productOptions = '<option value="">-- Özel / Manuel Ürün Girişi --</option>';
    productsCache.forEach(prod => {
        productOptions += `<option value="${prod.id}">${prod.name} (${prod.price} ${prod.currency})</option>`;
    });

    const formHtml = `
        <div class="item-row" id="form-item-${i}">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h4 style="margin-bottom: 0;"><span class="item-number-badge">${i}</span> Ürün / İş Kalemi</h4>
                <button type="button" class="btn-delete-item" onclick="removeItemRow(${i})">Sil</button>
            </div>
            <div class="form-group">
                <label style="font-size: 11px; margin-bottom: 4px;">Kayıtlı Ürün Seç</label>
                <select id="in-select-prod-${i}" onchange="selectProductRowHandler(${i}, this)" style="padding: 6px 10px; font-size: 13px; margin-bottom: 8px;">
                    ${productOptions}
                </select>
            </div>
            <div class="form-group">
                <textarea id="in-name-${i}" placeholder="İşin Adı / Tanımı" rows="2" style="resize: vertical;"></textarea>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <input type="number" id="in-qty-${i}" placeholder="Miktarı" min="0" step="1">
                </div>
                <div class="form-group">
                    <input type="number" id="in-price-${i}" placeholder="Br. Fiyatı" min="0" step="0.01">
                </div>
            </div>
        </div>
    `;
    formContainer.insertAdjacentHTML('beforeend', formHtml);

    // Önizleme tarafı
    const tbody = document.getElementById("out-items-body");
    const previewHtml = `
        <tr id="preview-item-${i}" class="preview-item-row">
            <td class="preview-number-cell">${i}</td>
            <td id="out-name-${i}"></td>
            <td id="out-qty-${i}"></td>
            <td><span class="currency">${currentCurrencySymbol}</span><span id="out-price-${i}">-</span></td>
            <td><span class="currency">${currentCurrencySymbol}</span><span id="out-total-${i}">-</span></td>
        </tr>
    `;
    tbody.insertAdjacentHTML('beforeend', previewHtml);

    // Event listener'ları bağla
    const nameInput = document.getElementById(`in-name-${i}`);
    const qtyInput = document.getElementById(`in-qty-${i}`);
    const priceInput = document.getElementById(`in-price-${i}`);

    nameInput.addEventListener("input", (e) => document.getElementById(`out-name-${i}`).textContent = e.target.value);
    qtyInput.addEventListener("input", calculateTotals);
    priceInput.addEventListener("input", calculateTotals);

    // Dropdown seçeneklerini diğer satırları dikkate alarak güncelle
    updateProductDropdowns();
    renumberItems(); // Sıralamayı her yeni satır eklendiğinde güncelle
}

// Kalem silme fonksiyonu
function removeItemRow(id) {
    const formRow = document.getElementById(`form-item-${id}`);
    const previewRow = document.getElementById(`preview-item-${id}`);
    
    if (formRow) formRow.remove();
    if (previewRow) previewRow.remove();
    
    renumberItems();
    calculateTotals();
    updateProductDropdowns(); // Satır silindiğinde diğer satırların dropdown'larını güncelle
}

// Kalan satırları yeniden numaralandırma
function renumberItems() {
    const formBadges = document.querySelectorAll(".item-number-badge");
    formBadges.forEach((badge, index) => {
        badge.textContent = index + 1;
    });

    const previewCells = document.querySelectorAll(".preview-number-cell");
    previewCells.forEach((cell, index) => {
        cell.textContent = index + 1;
    });
}

// Başlangıçta 7 kalem ekle
function initItemsForm() {
    for (let i = 0; i < 7; i++) {
        addNewItemRow();
    }
}

// Statik alanların event listener'ları
function setupEventListeners() {
    // Statik alanlar (Müşteri adı, Teklif Veren, Teklif No, Tarih, Ödeme Şekli, Planlanan Teslim)
    const staticFields = [
        { id: 1, outId: "1" },
        { id: 2, outId: "2" },
        { id: 4, outId: "4" },
        { id: 5, outId: "5" },
        { id: 6, outId: "6" },
        { id: 7, outId: "7" }
    ];

    staticFields.forEach(field => {
        const input = document.getElementById(`input-${field.id}`);
        if(input) {
            input.addEventListener("input", (e) => {
                let val = e.target.value;
                if(field.id === 5 && val) {
                    const d = new Date(val);
                    if(!isNaN(d)) {
                        val = d.toLocaleDateString('tr-TR');
                    }
                }
                document.getElementById(`out-${field.outId}`).textContent = val;
            });
        }
    });

    // Telefon ve Email alanları
    const telInput = document.getElementById("input-3-tel");
    if(telInput) {
        telInput.addEventListener("input", (e) => {
            document.getElementById("out-3-tel").textContent = e.target.value || "+90 555 105 91 95";
        });
    }

    const emailInput = document.getElementById("input-3-email");
    if(emailInput) {
        emailInput.addEventListener("input", (e) => {
            document.getElementById("out-3-email").textContent = e.target.value || "serdar@idmmuhendislik.com";
        });
    }

    // Açıklama alanı
    const aciklamaInput = document.getElementById("input-aciklama");
    if(aciklamaInput) {
        aciklamaInput.addEventListener("input", (e) => {
            document.getElementById("out-aciklama").textContent = e.target.value;
        });
    }
}

// Hazır Not Ekleme Fonksiyonu
function addQuickNote(text) {
    const textarea = document.getElementById("input-aciklama");
    if (!textarea) return;
    
    let currentVal = textarea.value.trim();
    if (currentVal) {
        if (!currentVal.includes(text)) {
            textarea.value = currentVal + "\n" + text;
        }
    } else {
        textarea.value = text;
    }
    
    // Değişikliği tetikle
    textarea.dispatchEvent(new Event("input"));
}

// Para birimi formatlama
function formatMoney(amount) {
    if (isNaN(amount) || amount === 0) return "-";
    return amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Tutarları ve KDV'yi hesaplar
function calculateTotals() {
    let subtotal = 0;

    for (let i = 1; i <= currentItemCount; i++) {
        const qtyEl = document.getElementById(`in-qty-${i}`);
        const priceEl = document.getElementById(`in-price-${i}`);
        
        if (!qtyEl || !priceEl) continue; // Silinmiş satırları atla
        
        const qtyStr = qtyEl.value;
        const priceStr = priceEl.value;
        
        const qty = parseFloat(qtyStr) || 0;
        const price = parseFloat(priceStr) || 0;
        
        let rowTotal = 0;
        
        if (qty > 0 && price > 0) {
            rowTotal = qty * price;
            subtotal += rowTotal;
            document.getElementById(`out-qty-${i}`).textContent = qty;
            document.getElementById(`out-price-${i}`).textContent = formatMoney(price);
            document.getElementById(`out-total-${i}`).textContent = formatMoney(rowTotal);
        } else {
            document.getElementById(`out-qty-${i}`).textContent = qtyStr ? qty : "";
            document.getElementById(`out-price-${i}`).textContent = priceStr ? formatMoney(price) : "-";
            document.getElementById(`out-total-${i}`).textContent = "-";
        }
    }

    const kdv = subtotal * 0.20;
    const grandTotal = subtotal + kdv;

    document.getElementById("out-toplam").textContent = formatMoney(subtotal);
    document.getElementById("out-kdv").textContent = formatMoney(kdv);
    document.getElementById("out-genel-toplam").textContent = formatMoney(grandTotal);
}

// Yazdırma Fonksiyonu
function printPage() {
    window.print();
}

// Kaşe/İmza aç/kapat
function toggleKaseSimza() {
    const kaseChecked = document.getElementById("check-kase").checked;
    const simzaChecked = document.getElementById("check-simza").checked;
    
    document.getElementById("out-kase").style.display = kaseChecked ? "block" : "none";
    document.getElementById("out-simza").style.display = simzaChecked ? "block" : "none";
}

// Görseli base64'e dönüştürür (PDF kalitesi ve offline kullanım için)
function getImageAsBase64(imgId) {
    return new Promise((resolve) => {
        const img = document.getElementById(imgId);
        if (!img || img.style.display === "none") { resolve(null); return; }

        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width || 200;
        canvas.height = img.naturalHeight || img.height || 100;
        const ctx = canvas.getContext("2d");
        try {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL("image/png"));
        } catch(e) {
            fetch(img.src)
                .then(r => r.blob())
                .then(blob => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                })
                .catch(() => resolve(null));
        }
    });
}

// PDF İndirme Öncesi Firestore Kaydı Yapıp Sonra İndir
async function triggerProposalSaveAndDownload() {
    const proposalNo = document.getElementById("input-4").value;
    const customerName = document.getElementById("input-1").value;
    const date = document.getElementById("input-5").value;
    
    if (proposalNo && customerName) {
        if (typeof saveProposalToFirebase === 'function') {
            await saveProposalToFirebase({
                id: proposalNo,
                customerName: customerName,
                date: date
            });
        }
    }
    
    await downloadPDF();
}

// PDF İndirme Fonksiyonu
async function downloadPDF() {
    const btn = document.querySelector(".btn-download");
    const originalText = btn.innerHTML;
    btn.innerHTML = "<span>Hazırlanıyor...</span>";
    btn.disabled = true;

    const imgIds = ["company-logo", "out-kase", "out-simza"];
    const originalSrcs = {};
    
    for (const id of imgIds) {
        const imgEl = document.getElementById(id);
        if (imgEl && imgEl.style.display !== "none") {
            try {
                const base64 = await getImageAsBase64(id);
                if (base64) {
                    originalSrcs[id] = imgEl.src;
                    imgEl.src = base64;
                }
            } catch(e) { }
        }
    }

    // Mobil zoom'u geçici olarak sıfırla (html2canvas zoom'u doğru işleyemiyor)
    const a4Page = document.getElementById("pdf-content");
    const originalZoom = a4Page.style.zoom;
    a4Page.style.zoom = "1";
    // Tarayıcının layout'u güncellemesi için kısa bekleme
    await new Promise(r => setTimeout(r, 100));

    const element = a4Page;
    const musteriAdi = document.getElementById("input-1").value || "Musteri";
    const teklifNo = document.getElementById("input-4").value || "Teklif";
    const fileName = `İDM - ${musteriAdi} - ${teklifNo}.pdf`;

    const opt = {
        margin:       0,
        filename:     fileName,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: false, allowTaint: true, logging: false },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
        await html2pdf().set(opt).from(element).save();
    } catch(e) {
        alert("PDF oluşturulurken bir hata oluştu. Yazdır butonunu kullanarak PDF olarak kaydedebilirsiniz.");
    } finally {
        // Zoom'u eski haline getir
        a4Page.style.zoom = originalZoom;
        for (const [id, src] of Object.entries(originalSrcs)) {
            const imgEl = document.getElementById(id);
            if (imgEl) imgEl.src = src;
        }
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ==========================================
// MOBİL ÖNİZLEME VE PAYLAŞMA İŞLEMLERİ
// ==========================================
function openMobilePreview() {
    const previewContainer = document.getElementById("preview-container");
    const fixedBar = document.getElementById("mobile-fixed-bar");
    if (previewContainer) {
        previewContainer.classList.add("mobile-active");
        previewContainer.scrollTop = 0;
    }
    if (fixedBar) fixedBar.style.display = "none";
}

function closeMobilePreview() {
    const previewContainer = document.getElementById("preview-container");
    const fixedBar = document.getElementById("mobile-fixed-bar");
    if (previewContainer) {
        previewContainer.classList.remove("mobile-active");
    }
    if (fixedBar) fixedBar.style.display = "block";
}

async function sharePDFMobile() {
    const btn = document.getElementById("btn-share-preview");
    const originalText = btn.innerHTML;
    btn.innerHTML = "<span>Hazırlanıyor...</span>";
    btn.disabled = true;

    // Teklifi Firestore'a da kaydet
    const proposalNo = document.getElementById("input-4").value;
    const customerName = document.getElementById("input-1").value;
    const date = document.getElementById("input-5").value;
    if (proposalNo && customerName && typeof saveProposalToFirebase === 'function') {
        await saveProposalToFirebase({ id: proposalNo, customerName: customerName, date: date });
    }

    const imgIds = ["company-logo", "out-kase", "out-simza"];
    const originalSrcs = {};
    
    for (const id of imgIds) {
        const imgEl = document.getElementById(id);
        if (imgEl && imgEl.style.display !== "none") {
            try {
                const base64 = await getImageAsBase64(id);
                if (base64) {
                    originalSrcs[id] = imgEl.src;
                    imgEl.src = base64;
                }
            } catch(e) { }
        }
    }

    // Mobil zoom'u geçici olarak sıfırla (html2canvas zoom'u doğru işleyemiyor)
    const a4PageShare = document.getElementById("pdf-content");
    const originalZoomShare = a4PageShare.style.zoom;
    a4PageShare.style.zoom = "1";
    // Tarayıcının layout'u güncellemesi için kısa bekleme
    await new Promise(r => setTimeout(r, 100));

    const element = a4PageShare;
    const musteriAdi = document.getElementById("input-1").value || "Musteri";
    const teklifNo = document.getElementById("input-4").value || "Teklif";
    const fileName = `İDM - ${musteriAdi} - ${teklifNo}.pdf`;

    const opt = {
        margin:       0,
        filename:     fileName,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: false, allowTaint: true, logging: false },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
        const worker = html2pdf().set(opt).from(element);
        const pdfBlob = await worker.output('blob');
        
        const file = new File([pdfBlob], fileName, { type: "application/pdf" });
        
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: 'Fiyat Teklifi',
                text: 'İDM Mühendislik Fiyat Teklifi ektedir.'
            });
        } else {
            alert("Cihazınız bu tür dosya paylaşımını desteklemiyor. PDF İndir butonunu kullanabilirsiniz.");
        }
    } catch(e) {
        console.error(e);
        alert("PDF oluşturulurken veya paylaşılırken bir hata oluştu.");
    } finally {
        // Zoom'u eski haline getir
        a4PageShare.style.zoom = originalZoomShare;
        for (const [id, src] of Object.entries(originalSrcs)) {
            const imgEl = document.getElementById(id);
            if (imgEl) imgEl.src = src;
        }
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ==========================================
// MÜŞTERİ SEÇİMİ VE ÜRÜN DOLDURMA
// ==========================================
function populateCustomersDropdown(customers) {
    customersCache = customers;
    const select = document.getElementById("select-customer");
    if (!select) return;

    // Mevcut değer
    const currentVal = select.value;

    select.innerHTML = '<option value="">-- Yeni / Manuel Giriş --</option>';
    customers.forEach(cust => {
        const option = document.createElement("option");
        option.value = cust.id;
        option.textContent = cust.name;
        select.appendChild(option);
    });

    select.value = currentVal;
    
    // Admin listesini de güncelle
    updateAdminCustomersList(customers);
}

function selectCustomerHandler(select) {
    const customerId = select.value;
    const nameInput = document.getElementById("input-1");
    
    if (customerId) {
        const customer = customersCache.find(c => c.id === customerId);
        if (customer) {
            nameInput.value = customer.name;
            
            // Eğer telefon veya e-posta varsa ve formdakiler boşsa doldur
            if (customer.tel) {
                document.getElementById("input-3-tel").value = customer.tel;
                document.getElementById("out-3-tel").textContent = customer.tel;
            }
            if (customer.email) {
                document.getElementById("input-3-email").value = customer.email;
                document.getElementById("out-3-email").textContent = customer.email;
            }
        }
    } else {
        nameInput.value = "";
    }
    
    // Preview'u güncelle
    nameInput.dispatchEvent(new Event("input"));
}

function updateProductsCache(products) {
    productsCache = products;
    
    // Tüm satırlardaki dropdown'ları güncelle
    updateProductDropdowns();

    // Admin listesini güncelle
    updateAdminProductsList(products);
}

// Tüm satırlarda seçili ürünleri kontrol edip mükerrer seçimi önleyen fonksiyon
function updateProductDropdowns() {
    // Seçili olan ürün ID'lerini ve satır numaralarını topla
    const selectedProdMap = {};
    for (let i = 1; i <= currentItemCount; i++) {
        const select = document.getElementById(`in-select-prod-${i}`);
        if (select && select.value) {
            selectedProdMap[i] = select.value;
        }
    }

    const selectedIds = Object.values(selectedProdMap);

    // Her satırın dropdown'ını yeniden filtreleyerek oluştur
    for (let i = 1; i <= currentItemCount; i++) {
        const select = document.getElementById(`in-select-prod-${i}`);
        if (select) {
            const currentVal = select.value;
            select.innerHTML = '<option value="">-- Özel / Manuel Ürün Girişi --</option>';
            
            productsCache.forEach(prod => {
                // Eğer ürün başka bir satırda seçilmemişse VEYA şu anki satırın kendisinde seçiliyse ekle
                const isSelectedElsewhere = selectedIds.includes(prod.id) && selectedProdMap[i] !== prod.id;
                if (!isSelectedElsewhere) {
                    const option = document.createElement("option");
                    option.value = prod.id;
                    option.textContent = `${prod.name} (${prod.price} ${prod.currency})`;
                    select.appendChild(option);
                }
            });
            
            select.value = currentVal;
        }
    }
}

function selectProductRowHandler(rowIndex, select) {
    const prodId = select.value;
    const nameTextarea = document.getElementById(`in-name-${rowIndex}`);
    const priceInput = document.getElementById(`in-price-${rowIndex}`);
    
    if (prodId) {
        const product = productsCache.find(p => p.id === prodId);
        if (product) {
            nameTextarea.value = product.name;
            priceInput.value = product.price;
            
            // Para birimini de bu ürünün para birimi yap (isteğe bağlı)
            const currencyBtn = document.querySelector(`.currency-btn[data-code="${product.currency}"]`);
            if (currencyBtn) {
                setCurrency(currencyBtn);
            }
        }
    } else {
        nameTextarea.value = "";
        priceInput.value = "";
    }

    // Tetikle
    nameTextarea.dispatchEvent(new Event("input"));
    priceInput.dispatchEvent(new Event("input"));

    // Seçim yapıldıktan sonra diğer tüm satırların dropdown'larını güncelle (mükerrerliği önlemek için)
    updateProductDropdowns();
}

function populateProposalsDropdown(proposals) {
    const select = document.getElementById("select-proposal-no");
    if (!select) return;

    select.innerHTML = '<option value="">-- Yeni Numara Oluştur --</option>';
    proposals.forEach(prop => {
        const option = document.createElement("option");
        option.value = prop.id;
        option.textContent = `${prop.id} (${prop.customerName})`;
        select.appendChild(option);
    });

    // Otomatik teklif numarası önerisi
    if (proposals.length > 0) {
        // En güncel teklif no
        const lastProp = proposals[0]; // orderBy createdAt desc olduğundan
        const idPattern = /İDM-(\d{4})-(\d+)/;
        const match = lastProp.id.match(idPattern);
        
        if (match) {
            const currentYear = new Date().getFullYear();
            const yearInLastId = parseInt(match[1]);
            let nextNum = 1;
            
            if (yearInLastId === currentYear) {
                nextNum = parseInt(match[2]) + 1;
            }
            
            const nextProposalNo = `İDM-${currentYear}-${String(nextNum).padStart(3, '0')}`;
            const propInput = document.getElementById("input-4");
            if (propInput && !propInput.value) {
                propInput.value = nextProposalNo;
                propInput.dispatchEvent(new Event("input"));
            }
        }
    } else {
        // Hiç teklif yoksa varsayılan
        const currentYear = new Date().getFullYear();
        const propInput = document.getElementById("input-4");
        if (propInput && !propInput.value) {
            propInput.value = `İDM-${currentYear}-001`;
            propInput.dispatchEvent(new Event("input"));
        }
    }
}

function selectProposalNoHandler(select) {
    const val = select.value;
    const propInput = document.getElementById("input-4");
    if (val) {
        propInput.value = val;
    } else {
        // Yeniden otomatik öneri tetikle
        if (typeof loadProposalsFromFirebase === 'function') {
            loadProposalsFromFirebase();
        }
    }
    propInput.dispatchEvent(new Event("input"));
}

// ==========================================
// ADMİN MODAL VE CRUD ARABİRİMLERİ
// ==========================================
function openAdminModal() {
    document.getElementById("admin-modal").classList.add("active");
}

function closeAdminModal() {
    document.getElementById("admin-modal").classList.remove("active");
}

function switchTab(evt, tabId) {
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    
    document.getElementById(tabId).classList.add("active");
    evt.currentTarget.classList.add("active");
}

// Müşteri Düzenle Klik
function editCustomerClick(id) {
    const cust = customersCache.find(c => c.id === id);
    if (!cust) return;

    // Formu düzenleme moduna geçir
    document.getElementById('cust-name').value = cust.name || '';
    document.getElementById('cust-tel').value = cust.tel || '';
    document.getElementById('cust-email').value = cust.email || '';

    const form = document.getElementById('form-new-customer');
    form.dataset.editId = id;

    document.querySelector('#tab-customers .split-form h3').textContent = 'Müşteri Düzenle';
    document.querySelector('#form-new-customer button[type="submit"]').textContent = 'Değişiklikleri Kaydet';

    // Vazgeç butonunu göster
    let cancelBtn = document.getElementById('btn-cancel-edit-customer');
    if (!cancelBtn) {
        cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.id = 'btn-cancel-edit-customer';
        cancelBtn.className = 'btn-secondary';
        cancelBtn.style.cssText = 'width:100%; margin-top:8px;';
        cancelBtn.textContent = 'Vazgeç';
        cancelBtn.onclick = cancelCustomerEdit;
        form.appendChild(cancelBtn);
    }
    cancelBtn.style.display = 'block';
}

function cancelCustomerEdit() {
    const form = document.getElementById('form-new-customer');
    delete form.dataset.editId;
    form.reset();
    document.querySelector('#tab-customers .split-form h3').textContent = 'Yeni Müşteri Ekle';
    document.querySelector('#form-new-customer button[type="submit"]').textContent = 'Müşteri Kaydet';
    const cancelBtn = document.getElementById('btn-cancel-edit-customer');
    if (cancelBtn) cancelBtn.style.display = 'none';
}

// Müşteri Sil Klik
async function deleteCustomerClick(id) {
    if (confirm('Bu müşteriy i silmek istediğinizden emin misiniz?')) {
        await deleteCustomerFromFirebase(id);
    }
}

// Müşteri Ekle Submit (ekleme VE düzenelme)
async function addCustomerSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('cust-name').value.trim();
    const tel = document.getElementById('cust-tel').value.trim();
    const email = document.getElementById('cust-email').value.trim();

    if (!name) return;

    const form = document.getElementById('form-new-customer');
    const editId = form.dataset.editId;

    if (editId) {
        // Düzenleme modu
        await updateCustomerInFirebase(editId, { name, tel, email });
        cancelCustomerEdit();
    } else {
        // Ekleme modu
        const id = await addCustomerToFirebase({ name, tel, email });
        if (id) form.reset();
    }
}

// Müşteri Listesi UI Güncelle
function updateAdminCustomersList(customers) {
    const tbody = document.getElementById('admin-customers-list');
    if (!tbody) return;

    if (customers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center">Kayıtlı müşteri bulunamadı.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    customers.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="bold">${c.name}</td>
            <td>
                ${c.tel ? `📞 ${c.tel}<br>` : ''}
                ${c.email ? `✉️ ${c.email}` : ''}
            </td>
            <td class="text-center" style="white-space: nowrap;">
                <button type="button" class="btn-edit-icon" onclick="editCustomerClick('${c.id}')" title="Düzenle" style="color:#2563eb;background:none;border:none;cursor:pointer;padding:4px;border-radius:4px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button type="button" class="btn-delete-icon" onclick="deleteCustomerClick('${c.id}')" title="Sil">
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}


// Ürün Düzenle Klik
function editProductClick(id) {
    const prod = productsCache.find(p => p.id === id);
    if (!prod) return;

    document.getElementById('prod-name').value = prod.name || '';
    document.getElementById('prod-price').value = prod.price || 0;
    document.getElementById('prod-currency').value = prod.currency || 'TL';

    const form = document.getElementById('form-new-product');
    form.dataset.editId = id;

    document.querySelector('#tab-products .split-form h3').textContent = 'Ürün Düzenle';
    document.querySelector('#form-new-product button[type="submit"]').textContent = 'Değişiklikleri Kaydet';

    let cancelBtn = document.getElementById('btn-cancel-edit-product');
    if (!cancelBtn) {
        cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.id = 'btn-cancel-edit-product';
        cancelBtn.className = 'btn-secondary';
        cancelBtn.style.cssText = 'width:100%; margin-top:8px;';
        cancelBtn.textContent = 'Vazgeç';
        cancelBtn.onclick = cancelProductEdit;
        form.appendChild(cancelBtn);
    }
    cancelBtn.style.display = 'block';
}

function cancelProductEdit() {
    const form = document.getElementById('form-new-product');
    delete form.dataset.editId;
    form.reset();
    document.querySelector('#tab-products .split-form h3').textContent = 'Yeni Ürün Ekle';
    document.querySelector('#form-new-product button[type="submit"]').textContent = 'Ürün Kaydet';
    const cancelBtn = document.getElementById('btn-cancel-edit-product');
    if (cancelBtn) cancelBtn.style.display = 'none';
}

// Ürün Sil Klik
async function deleteProductClick(id) {
    if (confirm('Bu ürünü silmek istediğinizden emin misiniz?')) {
        await deleteProductFromFirebase(id);
    }
}

// Ürün Ekle Submit (ekleme VE düzenelme)
async function addProductSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('prod-name').value.trim();
    const price = document.getElementById('prod-price').value;
    const currency = document.getElementById('prod-currency').value;

    if (!name) return;

    const form = document.getElementById('form-new-product');
    const editId = form.dataset.editId;

    if (editId) {
        await updateProductInFirebase(editId, { name, price, currency });
        cancelProductEdit();
    } else {
        const id = await addProductToFirebase({ name, price, currency });
        if (id) form.reset();
    }
}

// Ürün Listesi UI Güncelle
function updateAdminProductsList(products) {
    const tbody = document.getElementById('admin-products-list');
    if (!tbody) return;

    if (products.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center">Kayıtlı ürün bulunamadı.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    products.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="white-space: pre-wrap;">${p.name}</td>
            <td class="bold text-right">${p.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${p.currency}</td>
            <td class="text-center" style="white-space: nowrap;">
                <button type="button" class="btn-edit-icon" onclick="editProductClick('${p.id}')" title="Düzenle" style="color:#2563eb;background:none;border:none;cursor:pointer;padding:4px;border-radius:4px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button type="button" class="btn-delete-icon" onclick="deleteProductClick('${p.id}')" title="Sil">
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}


// Firebase Config Kaydet
function saveFirebaseConfigSubmit() {
    const configVal = document.getElementById("firebase-config-input").value.trim();
    if (!configVal) {
        alert("Lütfen geçerli bir JSON yapılandırması girin.");
        return;
    }
    
    try {
        // Geçerli JSON mu doğrula
        const parsed = JSON.parse(configVal);
        if (!parsed.apiKey || !parsed.projectId) {
            throw new Error("Eksik alanlar var (apiKey ve projectId zorunludur)");
        }
        
        localStorage.setItem("idm_firebase_config", JSON.stringify(parsed));
        alert("Yapılandırma başarıyla kaydedildi. Uygulama yeniden başlatılıyor...");
        window.location.reload();
    } catch(e) {
        alert("Yapılandırma hatası! JSON formatının doğru olduğundan ve apiKey/projectId alanlarının bulunduğundan emin olun. Hata: " + e.message);
    }
}

// Firebase Config Sıfırla
function resetFirebaseConfig() {
    if (confirm("Firebase bağlantı ayarlarını varsayılana sıfırlamak istediğinizden emin misiniz?")) {
        localStorage.removeItem("idm_firebase_config");
        alert("Yapılandırma sıfırlandı. Uygulama yeniden başlatılıyor...");
        window.location.reload();
    }
}
