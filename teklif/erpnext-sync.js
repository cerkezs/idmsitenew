// ==========================================
// İDM Teklif Sistemi → ERPNext Entegrasyonu
// ==========================================
// Bu dosya, PDF indirildiğinde teklifi otomatik
// olarak ERPNext'e Satış Teklifi olarak kaydeder.

const ERPNEXT = {
    url: 'https://erp.idmmuhendislik.com',
    api_key: 'db9602718f19168',       // Serdar Şeker API Key
    api_secret: '65e2f99f1c1353c', // Serdar Şeker API Secret
    item_code: 'GENEL-KALEM'             // ERPNext'te oluşturulacak genel kalem
};

// Para birimi haritası
const CURRENCY_MAP = {
    '₺': 'TRY',
    '$': 'USD',
    '€': 'EUR'
};

// Formdaki tüm teklif verilerini toplar
function collectTeklifData() {
    const items = [];
    const rows = document.querySelectorAll('.item-row');

    rows.forEach(row => {
        const rowId = row.id.replace('form-item-', '');
        const nameEl  = document.getElementById(`in-name-${rowId}`);
        const qtyEl   = document.getElementById(`in-qty-${rowId}`);
        const priceEl = document.getElementById(`in-price-${rowId}`);

        if (!nameEl || !qtyEl || !priceEl) return;

        const qty   = parseFloat(qtyEl.value)   || 0;
        const price = parseFloat(priceEl.value) || 0;
        const name  = nameEl.value.trim();

        if (qty > 0 && price > 0 && name) {
            items.push({ name, qty, price });
        }
    });

    const iskontoChecked = document.getElementById('check-iskonto')?.checked;
    const iskontoRate    = parseFloat(document.getElementById('input-iskonto')?.value) || 0;

    return {
        customerName : document.getElementById('input-1')?.value?.trim() || '',
        teklifVeren  : document.getElementById('input-2')?.value?.trim() || '',
        proposalNo   : document.getElementById('input-4')?.value?.trim() || '',
        date         : document.getElementById('input-5')?.value || new Date().toISOString().split('T')[0],
        odeme        : document.getElementById('input-6')?.value?.trim() || '',
        teslim       : document.getElementById('input-7')?.value?.trim() || '',
        notes        : document.getElementById('input-aciklama')?.value?.trim() || '',
        currency     : currentCurrencySymbol || '₺',
        iskonto      : iskontoChecked ? iskontoRate : 0,
        items
    };
}

// ERPNext'te Lead ara, yoksa oluştur
async function getOrCreateLead(customerName) {
    const authHeader = `token ${ERPNEXT.api_key}:${ERPNEXT.api_secret}`;

    // Önce mevcut Lead'i ara
    try {
        const searchUrl = `${ERPNEXT.url}/api/resource/Lead?filters=${encodeURIComponent(JSON.stringify([["lead_name","=",customerName]]))}&fields=["name"]&limit=1`;
        const searchResp = await fetch(searchUrl, {
            headers: { 'Authorization': authHeader }
        });
        if (searchResp.ok) {
            const searchData = await searchResp.json();
            if (searchData.data && searchData.data.length > 0) {
                console.log('ERPNext: Mevcut Lead bulundu →', searchData.data[0].name);
                return searchData.data[0].name;
            }
        }
    } catch(e) { /* sessiz devam */ }

    // Yoksa yeni Lead oluştur
    try {
        const createResp = await fetch(`${ERPNEXT.url}/api/resource/Lead`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader
            },
            body: JSON.stringify({ data: {
                doctype    : 'Lead',
                lead_name  : customerName,
                status     : 'Lead',
                source     : 'Cold Calling'
            }})
        });
        if (createResp.ok) {
            const createData = await createResp.json();
            console.log('ERPNext: Yeni Lead oluşturuldu →', createData.data.name);
            return createData.data.name;
        }
    } catch(e) { /* sessiz devam */ }

    // Her şey başarısız olursa müşteri adını döndür
    return customerName;
}

// ERPNext'e Satış Teklifi olarak kaydeder
async function saveToERPNext(data) {
    // API key ayarlanmamışsa sessizce çık
    if (ERPNEXT.api_key === 'BURAYA_API_KEY_YAZ') {
        console.warn('ERPNext: API key henüz ayarlanmamış, gönderim atlandı.');
        return;
    }

    if (!data.customerName || data.items.length === 0) {
        console.warn('ERPNext: Müşteri adı veya ürün kalemi eksik, gönderim atlandı.');
        return;
    }

    try {
        const currency = CURRENCY_MAP[data.currency] || 'TRY';

        // Lead'i bul veya oluştur
        const leadName = await getOrCreateLead(data.customerName);

        const erpItems = data.items.map(item => ({
            item_code   : ERPNEXT.item_code,
            item_name   : item.name.substring(0, 140),
            description : item.name,
            qty         : item.qty,
            rate        : item.price,
            uom         : 'Adet'
        }));

        const payload = {
            doctype          : 'Quotation',
            title            : data.proposalNo || data.customerName,
            quotation_to     : 'Lead',
            party_name       : leadName,
            transaction_date : data.date,
            currency         : currency,
            items            : erpItems,
            terms            : data.notes || ''
        };

        // Özel alanlar (daha önce ERPNext'e eklemiştik)
        if (data.odeme)  payload.custom_odeme_sekli             = data.odeme;
        if (data.teslim) payload.custom_planlanan_teslim_suresi = data.teslim;

        // İskonto
        if (data.iskonto > 0) {
            payload.additional_discount_percentage = data.iskonto;
        }

        const response = await fetch(`${ERPNEXT.url}/api/resource/Quotation`, {
            method  : 'POST',
            headers : {
                'Content-Type'  : 'application/json',
                'Authorization' : `token ${ERPNEXT.api_key}:${ERPNEXT.api_secret}`
            },
            body: JSON.stringify({ data: payload })
        });

        if (response.ok) {
            const result  = await response.json();
            const docName = result?.data?.name || '';
            showERPNotification('success', `✓ ERP'ye kaydedildi${docName ? ': ' + docName : ''}`);
            console.log('ERPNext: Teklif kaydedildi →', docName);
        } else {
            const errBody = await response.text();
            console.warn('ERPNext API hatası:', response.status, errBody);
            showERPNotification('warn', '⚠ ERP kaydı başarısız (PDF etkilenmedi)');
        }

    } catch (err) {
        // Ağ hatası veya CORS sorunu — PDF indirmeyi asla engelleme
        console.warn('ERPNext bağlantı hatası (PDF etkilenmedi):', err.message);
    }
}

// Ekranda küçük bildirim gösterir (4 saniye sonra kaybolur)
function showERPNotification(type, message) {
    const colors = {
        success : { bg: '#16a34a', border: '#15803d' },
        warn    : { bg: '#d97706', border: '#b45309' }
    };
    const c = colors[type] || colors.success;

    const notif = document.createElement('div');
    notif.style.cssText = `
        position: fixed; bottom: 80px; right: 20px; z-index: 99999;
        background: ${c.bg}; color: white;
        padding: 12px 18px; border-radius: 8px;
        font-size: 13px; font-family: 'Inter', sans-serif; font-weight: 500;
        box-shadow: 0 4px 16px rgba(0,0,0,0.2);
        display: flex; align-items: center; gap: 8px;
        opacity: 0; transform: translateY(10px);
        transition: opacity 0.3s ease, transform 0.3s ease;
    `;
    notif.textContent = message;
    document.body.appendChild(notif);

    // Animasyon
    requestAnimationFrame(() => {
        notif.style.opacity = '1';
        notif.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
        notif.style.opacity = '0';
        notif.style.transform = 'translateY(10px)';
        setTimeout(() => notif.remove(), 300);
    }, 4000);
}
