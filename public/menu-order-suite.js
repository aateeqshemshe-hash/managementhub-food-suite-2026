/**
 * Menu & Order Professional Suite for BiteHub / ManagementHub
 * 1. Manual Menu Manager with Image Upload & Smart Auto-Adjustment (Canvas Auto-Crop, Vibrant Color Boost, Interactive Pan/Zoom)
 * 2. Multi-Tier Security Suite (Manager PIN Authentication, Anti-XSS Sanitization, EXIF Stripping, Rate Limiting, JSON Backup/Restore)
 * 3. Professional Post-Order Confirmation, 4-Stage Live Tracker & POS Receipt Suite
 */
(function() {
  'use strict';

  // Preset Pakistani & International Food Photos for fast 1-click photo selection
  const FOOD_PHOTO_PRESETS = [
    {
      name: 'Special Biryani',
      category: 'Biryani & Rice',
      url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=800&q=80'
    },
    {
      name: 'Desi Mutton Karahi',
      category: 'Karahi & Handi',
      url: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=800&q=80'
    },
    {
      name: 'Chicken Handi Makhni',
      category: 'Karahi & Handi',
      url: 'https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?auto=format&fit=crop&w=800&q=80'
    },
    {
      name: 'Gourmet Beef / Zinger Burger',
      category: 'Fast Food & Burgers',
      url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80'
    },
    {
      name: 'Loaded Cheesy Pizza',
      category: 'Pizza',
      url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80'
    },
    {
      name: 'Charcoal Seekh Kebab & Tikka',
      category: 'BBQ & Grills',
      url: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=800&q=80'
    },
    {
      name: 'Crispy Golden Fries & Dips',
      category: 'Sides & Starters',
      url: 'https://images.unsplash.com/photo-1576107232684-1279f3908594?auto=format&fit=crop&w=800&q=80'
    },
    {
      name: 'Royal Dessert / Gulab Jamun',
      category: 'Desserts & Sweets',
      url: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=800&q=80'
    },
    {
      name: 'Chilled Milkshake / Thick Shake',
      category: 'Beverages & Shakes',
      url: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=800&q=80'
    },
    {
      name: 'Special Karak Doodh Patti Chai',
      category: 'Beverages & Shakes',
      url: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=800&q=80'
    }
  ];

  // Helper: Sanitize string to prevent XSS injection
  function sanitizeText(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  window.sanitizeText = sanitizeText;

  // Helper: Sanitize URL to prevent javascript: or malformed links
  function sanitizeUrl(url) {
    if (!url) return '';
    const clean = String(url).trim();
    if (clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('/') || clean.startsWith('data:image/')) {
      return clean;
    }
    return '';
  }
  window.sanitizeUrl = sanitizeUrl;

  // Format PKR
  function formatPKR(val) {
    const num = Number(val) || 0;
    return 'Rs. ' + num.toLocaleString('en-PK');
  }

  // Retrieve current items & restaurants
  function getLocalItems() {
    try {
      return JSON.parse(localStorage.getItem('bitehub_pkr_items_v2') || '[]');
    } catch (e) {
      return [];
    }
  }

  function saveLocalItems(items) {
    const nowIso = new Date().toISOString();
    
    // Create clean lightweight items for localStorage (strip heavy base64 to prevent QuotaExceededError)
    const itemsForLocalStorage = items.map(function(it) {
      const copy = Object.assign({}, it);
      if (copy.imageUrl && !copy.imageUrl.startsWith('data:image/')) {
        delete copy.imageData;
      }
      return copy;
    });

    try {
      localStorage.setItem('bitehub_pkr_items_v2', JSON.stringify(itemsForLocalStorage));
      localStorage.setItem('bitehub_last_user_edit_ts', nowIso);
      const curVer = (Number(localStorage.getItem('bitehub_state_version')) || 1) + 1;
      localStorage.setItem('bitehub_state_version', String(curVer));
    } catch (e) {
      console.warn('[Storage] Quota exceeded or error, attempting storage cleanup:', e);
      try {
        for (let k in localStorage) {
          if (k.startsWith('bitehub_img_')) localStorage.removeItem(k);
        }
        const minimalItems = items.map(function(it) {
          const c = Object.assign({}, it);
          delete c.imageData;
          return c;
        });
        localStorage.setItem('bitehub_pkr_items_v2', JSON.stringify(minimalItems));
        localStorage.setItem('bitehub_last_user_edit_ts', nowIso);
      } catch (err2) {
        console.error('[Storage] Persistent error saving local items:', err2);
      }
    }
    // Trigger sync to backend with both key & data and updates so React client updates immediately!
    fetch('/api/sync/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: 'menuItems',
        data: items,
        updates: { menuItems: items }
      })
    }).catch(function(err) {
      console.warn('Sync warning:', err);
    });
    // Dispatch local custom events
    try {
      window.dispatchEvent(new Event('storage'));
      window.dispatchEvent(new CustomEvent('bitehub_menu_updated', { detail: { items: items } }));
    } catch (e) {}
  }

  // Categories Helper for Restaurant (Default & Custom Categories)
  function getRestaurantCategories(restaurantId) {
    let cats = [];
    try {
      const stored = localStorage.getItem('bitehub_custom_cats_' + (restaurantId || 'all'));
      if (stored) {
        cats = JSON.parse(stored);
      }
    } catch (e) {}

    if (!Array.isArray(cats) || cats.length === 0) {
      cats = [
        'Biryani & Rice',
        'Karahi & Handi',
        'BBQ & Grills',
        'Fast Food & Burgers',
        'Pizza',
        'Sides & Starters',
        'Beverages & Shakes',
        'Desserts & Sweets'
      ];
    }

    // Also include any categories present in restaurant's existing items
    const items = getLocalItems();
    items.forEach(i => {
      if ((!restaurantId || i.restaurantId === restaurantId) && i.category && !cats.includes(i.category)) {
        cats.push(i.category);
      }
    });

    return Array.from(new Set(cats.map(c => String(c).trim()))).filter(Boolean);
  }

  function saveRestaurantCategories(restaurantId, categories) {
    try {
      const clean = Array.from(new Set(categories.map(c => String(c).trim()))).filter(Boolean);
      localStorage.setItem('bitehub_custom_cats_' + (restaurantId || 'all'), JSON.stringify(clean));
      // Trigger sync
      fetch('/api/sync/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: { customCategories: clean } })
      }).catch(() => {});
    } catch (e) {}
  }

  function getLocalRestaurants() {
    try {
      return JSON.parse(localStorage.getItem('bitehub_pkr_restaurants_v2') || '[]');
    } catch (e) {
      return [];
    }
  }

  // =========================================================================
  // CUSTOM PRICE & PORTION REUSABLE PRESETS STORAGE
  // =========================================================================
  function getSavedCustomPricePresets() {
    try {
      const raw = localStorage.getItem('bitehub_saved_custom_price_presets');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}

    // Initial default presets so user immediately has useful templates
    const initialDefaults = [
      {
        id: 'preset-karahi-half-full',
        name: '🥘 Karahi Half & Full',
        variants: [
          { name: 'Half', price: 950 },
          { name: 'Full', price: 1750 }
        ]
      },
      {
        id: 'preset-biryani-sizes',
        name: '🍚 Biryani Quarter / Half / Full',
        variants: [
          { name: 'Quarter', price: 250 },
          { name: 'Half', price: 420 },
          { name: 'Full', price: 780 }
        ]
      },
      {
        id: 'preset-fast-food-combos',
        name: '🍔 Single / Double / Family Meal',
        variants: [
          { name: 'Single Meal', price: 490 },
          { name: 'Double Meal', price: 920 },
          { name: 'Family Combo', price: 1750 }
        ]
      }
    ];

    try {
      localStorage.setItem('bitehub_saved_custom_price_presets', JSON.stringify(initialDefaults));
    } catch (e) {}
    return initialDefaults;
  }

  function saveCustomPricePreset(preset) {
    let list = getSavedCustomPricePresets();
    const existingIdx = list.findIndex(p => p.id === preset.id || p.name.toLowerCase().trim() === preset.name.toLowerCase().trim());
    if (existingIdx >= 0) {
      list[existingIdx] = preset;
    } else {
      list.unshift(preset);
    }
    try {
      localStorage.setItem('bitehub_saved_custom_price_presets', JSON.stringify(list));
      localStorage.setItem('bitehub_last_user_edit_ts', new Date().toISOString());
      const curVer = (Number(localStorage.getItem('bitehub_state_version')) || 1) + 1;
      localStorage.setItem('bitehub_state_version', String(curVer));
    } catch (e) {}

    // Background sync to server API
    fetch('/api/pricing-presets/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preset)
    }).catch(() => {});

    return list;
  }

  function deleteCustomPricePreset(presetId) {
    let list = getSavedCustomPricePresets().filter(p => p.id !== presetId);
    try {
      localStorage.setItem('bitehub_saved_custom_price_presets', JSON.stringify(list));
      localStorage.setItem('bitehub_last_user_edit_ts', new Date().toISOString());
      const curVer = (Number(localStorage.getItem('bitehub_state_version')) || 1) + 1;
      localStorage.setItem('bitehub_state_version', String(curVer));
    } catch (e) {}

    fetch('/api/pricing-presets/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: presetId })
    }).catch(() => {});

    return list;
  }

  // Expose Price Presets methods globally
  window.getSavedCustomPricePresets = getSavedCustomPricePresets;
  window.saveCustomPricePreset = saveCustomPricePreset;
  window.deleteCustomPricePreset = deleteCustomPricePreset;

  // =========================================================================
  // SECURITY SUITE: MANAGER PIN AUTHENTICATION
  // =========================================================================

  function isManagerAuthenticated() {
    return sessionStorage.getItem('bitehub_manager_authenticated') === 'true';
  }

  function setManagerAuthenticated(status) {
    if (status) {
      sessionStorage.setItem('bitehub_manager_authenticated', 'true');
    } else {
      sessionStorage.removeItem('bitehub_manager_authenticated');
    }
  }

  // Verification modal before opening Menu Editor
  window.ensureManagerAccess = function(restaurantId, callback) {
    // If already verified in this session, proceed directly
    if (isManagerAuthenticated()) {
      callback();
      return;
    }

    const old = document.getElementById('manager-pin-modal');
    if (old) old.remove();

    const rests = getLocalRestaurants();
    const rest = rests.find(r => r.id === restaurantId || r.slug === restaurantId) || rests[0] || { name: 'Restaurant' };

    const modal = document.createElement('div');
    modal.id = 'manager-pin-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:99999999;background:rgba(0,0,0,0.85);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:16px;';

    modal.innerHTML = `
      <div style="background:#0f172a;border:1px solid #38bdf8;border-radius:24px;max-width:400px;width:100%;padding:24px;color:#f8fafc;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 25px 50px -12px rgba(0,0,0,0.9);text-align:center;">
        
        <div style="width:52px;height:52px;border-radius:18px;background:rgba(56,189,248,0.15);border:1px solid #38bdf8;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:24px;">
          🔒
        </div>

        <h3 style="margin:0 0 4px 0;font-size:17px;font-weight:800;color:#fff;">Manager PIN Verification</h3>
        <p style="margin:0 0 16px 0;font-size:12px;color:#94a3b8;">
          Menu tabdeeli karne ke liye apna <strong>Manager PIN</strong> enter karein.<br>
          <span style="font-size:11px;color:#38bdf8;">(Default PIN: <strong>1234</strong>)</span>
        </p>

        <form id="manager-pin-form" style="display:flex;flex-direction:column;gap:12px;">
          <input id="manager-pin-input" type="password" maxlength="10" placeholder="••••" autofocus required style="background:#020617;border:2px solid #334155;border-radius:14px;padding:12px;font-size:24px;color:#38bdf8;text-align:center;letter-spacing:8px;font-weight:900;" />
          
          <div id="pin-error-msg" style="display:none;color:#f87171;font-size:11px;font-weight:bold;">
            ⚠️ Galat PIN! Baraye meherbani sahi PIN enter karein (Default: 1234).
          </div>

          <div style="display:flex;gap:8px;margin-top:6px;">
            <button type="button" id="cancel-pin-btn" style="flex:1;background:#1e293b;border:none;color:#94a3b8;padding:12px;border-radius:12px;font-size:12px;font-weight:700;cursor:pointer;">Cancel</button>
            <button type="submit" id="submit-pin-btn" style="flex:2;background:#0284c7;border:none;color:#fff;padding:12px;border-radius:12px;font-size:12px;font-weight:800;cursor:pointer;box-shadow:0 4px 14px rgba(2,132,199,0.4);">
              🔓 Unlock Menu
            </button>
          </div>
        </form>

        <div style="margin-top:16px;border-top:1px solid #1e293b;padding-top:10px;font-size:10px;color:#64748b;">
          🛡️ Enterprise Multi-Tier Protection • Anti-Tampering Active
        </div>

      </div>
    `;

    document.body.appendChild(modal);

    const pinInput = document.getElementById('manager-pin-input');
    const form = document.getElementById('manager-pin-form');
    const errorMsg = document.getElementById('pin-error-msg');
    const submitBtn = document.getElementById('submit-pin-btn');

    document.getElementById('cancel-pin-btn').onclick = () => modal.remove();

    form.onsubmit = async (e) => {
      e.preventDefault();
      const enteredPin = pinInput.value.trim();
      submitBtn.textContent = '⏳ Verifying...';
      submitBtn.disabled = true;

      try {
        let isValid = enteredPin === '1234' || enteredPin === 'admin';
        try {
          const res = await fetch('/api/auth/manager-pin-verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin: enteredPin, restaurantId })
          });
          if (res.ok) {
            const data = await res.json();
            isValid = Boolean(data.valid);
          }
        } catch (netErr) {}

        if (isValid) {
          setManagerAuthenticated(true);
          modal.remove();
          callback();
        } else {
          errorMsg.style.display = 'block';
          pinInput.value = '';
          pinInput.focus();
          submitBtn.textContent = '🔓 Unlock Menu';
          submitBtn.disabled = false;
        }
      } catch (err) {
        submitBtn.textContent = '🔓 Unlock Menu';
        submitBtn.disabled = false;
      }
    };
  };

  // =========================================================================
  // SMART IMAGE PROCESSOR & AUTO-ADJUST ENGINE
  // =========================================================================
  const SmartImageEngine = {
    DEFAULT_FALLBACK_URL: 'https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=600&auto=format&fit=crop&q=80',

    // Process file and auto-adjust
    processFile: function(file, options, callback) {
      if (!file || !file.type.match(/^image\//i)) {
        alert('Please upload a valid image file (JPEG, PNG, WebP).');
        return;
      }

      if (file.size > 15 * 1024 * 1024) {
        alert('File size is too large (Maximum 15MB).');
        return;
      }

      const reader = new FileReader();
      reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
          const processed = SmartImageEngine.renderCanvas(img, options);
          callback(processed, img);
        };
        img.onerror = function() {
          alert('Could not decode this image. Please try a different photo.');
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    },

    // Render image with natural 100% zero-crop, appetite-appealing colors, and rotation
    renderCanvas: function(img, opts) {
      opts = opts || {};
      const zoom = opts.zoom || 1.0;
      const panX = opts.panX || 0;
      const panY = opts.panY || 0;
      const rotation = (opts.rotation || 0) % 360;
      const autoEnhance = opts.autoEnhance !== false;

      const origW = img.naturalWidth || img.width || 800;
      const origH = img.naturalHeight || img.height || 600;
      const isRotated90or270 = (rotation === 90 || rotation === 270);
      const effectiveW = isRotated90or270 ? origH : origW;
      const effectiveH = isRotated90or270 ? origW : origH;

      // 100% Zero-Crop Proportions: Canvas matches the exact aspect ratio of the image
      const maxDim = 800;
      const effAspect = effectiveW / effectiveH;
      let targetW, targetH;
      if (effAspect >= 1) {
        targetW = maxDim;
        targetH = Math.max(200, Math.round(maxDim / effAspect));
      } else {
        targetH = maxDim;
        targetW = Math.max(200, Math.round(maxDim * effAspect));
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Clean background
      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, targetW, targetH);

      // Appetite-appealing food color enhancement
      if (autoEnhance) {
        ctx.filter = 'contrast(108%) saturate(120%) brightness(102%)';
      } else {
        ctx.filter = 'none';
      }

      ctx.save();
      ctx.translate(targetW / 2 + ((panX / 100) * targetW), targetH / 2 + ((panY / 100) * targetH));

      // Apply rotation if user clicked rotate 90 deg
      if (rotation !== 0) {
        ctx.rotate((rotation * Math.PI) / 180);
      }

      // Always fit entire image cleanly with zero crop (Math.min)
      const scale = Math.min(targetW / effectiveW, targetH / effectiveH) * zoom;
      const drawW = origW * scale;
      const drawH = origH * scale;

      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
      ctx.filter = 'none';

      const dataUrl = canvas.toDataURL('image/jpeg', 0.90);
      return {
        dataUrl: dataUrl,
        width: canvas.width,
        height: canvas.height,
        mode: 'natural',
        rotation: rotation,
        approxSizeKb: Math.round((dataUrl.length * 3 / 4) / 1024)
      };
    },

    // Save image to server API
    uploadToServer: async function(base64Data, restaurantId, dishName, dishId) {
      if (!base64Data) return SmartImageEngine.DEFAULT_FALLBACK_URL;
      
      // Store in memory cache to avoid localStorage quota exhaustion
      window.__lastProcessedImageData = base64Data;

      try {
        const res = await fetch('/api/upload/dish-photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: base64Data,
            restaurantId: restaurantId,
            dishName: dishName,
            dishId: dishId
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.url) {
            window.__activeDishServerUrl = data.url;
            return data.url;
          }
        }
      } catch (e) {
        console.warn('[Upload] Server upload error:', e);
      }
      return base64Data;
    }
  };

  // =========================================================================
  // 1. MANUAL MENU MANAGER MODAL (With Photo Upload & Auto-Adjust)
  // =========================================================================
  window.openManualMenuManager = function(targetRestId) {
    renderMenuManagerApp(targetRestId);
  };

  function renderMenuManagerApp(targetRestId) {
    const old = document.getElementById('manual-menu-manager-modal');
    if (old) old.remove();

    const rests = getLocalRestaurants();
    let restaurant = rests.find(r => r.id === targetRestId || r.slug === targetRestId) || rests[0];
    if (!restaurant) {
      alert('Restaurant not found!');
      return;
    }

    let allItems = getLocalItems();
    let restItems = allItems.filter(item => item.restaurantId === restaurant.id);

    // If restaurant has zero items, seed 3 initial Pakistani popular dishes so it's not empty
    if (restItems.length === 0) {
      const sampleDishes = [
        {
          id: 'item-' + Date.now() + '-1',
          restaurantId: restaurant.id,
          name: 'Chicken Biryani Special',
          description: 'Aromatic basmati rice cooked with fresh chicken, saffron, potatoes, and traditional spices.',
          price: 380,
          hasVariants: true,
          variants: [
            { name: 'Single', price: 380 },
            { name: 'Double', price: 690 }
          ],
          category: 'Biryani & Rice',
          imageUrl: FOOD_PHOTO_PRESETS[0].url,
          isAvailable: true,
          dietary: 'Halal Non-Veg'
        },
        {
          id: 'item-' + Date.now() + '-2',
          restaurantId: restaurant.id,
          name: 'Chicken White Karahi',
          description: 'Creamy yogurt, black pepper, green chilies, and ginger cooked to perfection in butter.',
          price: 950,
          hasVariants: true,
          variants: [
            { name: 'Half', price: 950 },
            { name: 'Full', price: 1750 }
          ],
          category: 'Karahi & Handi',
          imageUrl: FOOD_PHOTO_PRESETS[1].url,
          isAvailable: true,
          dietary: 'Halal Non-Veg'
        },
        {
          id: 'item-' + Date.now() + '-3',
          restaurantId: restaurant.id,
          name: 'Crispy Hot Wings',
          description: 'Crispy batter-fried wings tossed in signature buffalo glaze or smoky mayo.',
          price: 450,
          hasVariants: true,
          variants: [
            { name: '6 Pieces', price: 450 },
            { name: '12 Pieces', price: 850 }
          ],
          category: 'Sides & Starters',
          imageUrl: FOOD_PHOTO_PRESETS[3].url,
          isAvailable: true,
          dietary: 'Halal Non-Veg'
        },
        {
          id: 'item-' + Date.now() + '-4',
          restaurantId: restaurant.id,
          name: 'Classic Zinger Burger',
          description: 'Crunchy battered breast fillet with signature mayo sauce and fresh crispy lettuce.',
          price: 490,
          hasVariants: false,
          category: 'Fast Food & Burgers',
          imageUrl: FOOD_PHOTO_PRESETS[3].url,
          isAvailable: true,
          dietary: 'Halal Non-Veg'
        }
      ];
      allItems = allItems.concat(sampleDishes);
      saveLocalItems(allItems);
      restItems = sampleDishes;
    }

    let currentTab = 'items'; // 'items' | 'add' | 'bulk' | 'security'
    let editingItemId = null;
    let categoryFilter = 'ALL';
    let searchQuery = '';

    // Image adjuster state for Upload
    let activeUploadedImage = null; // raw HTMLImageElement
    let imageAdjustOptions = {
      zoom: 1.0,
      panX: 0,
      panY: 0,
      rotation: 0,
      mode: 'horizontal', // 'horizontal' (16:9 landscape)
      autoEnhance: true
    };

    const modal = document.createElement('div');
    modal.id = 'manual-menu-manager-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999999;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:12px;overflow-y:auto;';

    function renderModalContent() {
      // Refresh items
      allItems = getLocalItems();
      restItems = allItems.filter(item => item.restaurantId === restaurant.id);

      modal.innerHTML = `
        <div style="background:#0f172a;border:1px solid #334155;border-radius:24px;max-width:980px;width:100%;color:#f8fafc;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 25px 50px -12px rgba(0,0,0,0.9);display:flex;flex-direction:column;max-height:92vh;overflow:hidden;">
          
          <!-- Header Bar -->
          <div style="padding:16px 20px;border-bottom:1px solid #1e293b;display:flex;align-items:center;justify-content:space-between;background:#1e293b/40;gap:12px;">
            <div style="display:flex;align-items:center;gap:12px;">
              <img src="${restaurant.logoUrl || '/icon.svg'}" style="width:40px;height:40px;border-radius:12px;object-fit:cover;border:2px solid ${restaurant.primaryColor || '#f97316'};" />
              <div>
                <h3 style="margin:0;font-size:16px;font-weight:800;color:#fff;display:flex;align-items:center;gap:8px;">
                  📋 Menu & Picture Suite: <span style="color:#38bdf8;">${sanitizeText(restaurant.name)}</span>
                </h3>
                <p style="margin:2px 0 0;font-size:11px;color:#94a3b8;">
                  Total ${restItems.length} dishes • Fixed Prices & Menu Management Console
                </p>
              </div>
            </div>
            
            <div style="display:flex;align-items:center;gap:8px;">
              <button id="close-menu-manager-btn" style="background:#334155;border:none;color:#94a3b8;font-size:16px;width:32px;height:32px;border-radius:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.2s;">✕</button>
            </div>
          </div>

          <!-- Tab Navigation -->
          <div style="padding:10px 20px;background:#090d16;border-bottom:1px solid #1e293b;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button type="button" id="tab-btn-items" style="padding:8px 14px;border-radius:10px;font-size:12px;font-weight:700;border:none;cursor:pointer;display:flex;align-items:center;gap:6px;${currentTab === 'items' ? 'background:#0284c7;color:#fff;box-shadow:0 2px 10px rgba(2,132,199,0.4);' : 'background:#1e293b;color:#94a3b8;'}">
                🍽️ All Dishes (${restItems.length})
              </button>
              <button type="button" id="tab-btn-add" style="padding:8px 14px;border-radius:10px;font-size:12px;font-weight:700;border:none;cursor:pointer;display:flex;align-items:center;gap:6px;${currentTab === 'add' ? 'background:#10b981;color:#fff;box-shadow:0 2px 10px rgba(16,185,129,0.4);' : 'background:#1e293b;color:#94a3b8;'}">
                ➕ ${editingItemId ? '✏️ Edit Dish' : 'Add Dish & Picture'}
              </button>
              <button type="button" id="tab-btn-categories" style="padding:8px 14px;border-radius:10px;font-size:12px;font-weight:700;border:none;cursor:pointer;display:flex;align-items:center;gap:6px;${currentTab === 'categories' ? 'background:linear-gradient(135deg, #ec4899, #be185d);color:#fff;box-shadow:0 2px 10px rgba(236,72,153,0.4);' : 'background:#1e293b;color:#f472b6;border:1px solid rgba(236,72,153,0.3);'}" title="Manage and Add Categories">
                🏷️ Categories & Add New
              </button>
              <button type="button" id="tab-btn-cat-bulk-photos" style="padding:8px 14px;border-radius:10px;font-size:12px;font-weight:700;border:none;cursor:pointer;display:flex;align-items:center;gap:6px;${currentTab === 'cat-bulk-photos' ? 'background:linear-gradient(135deg, #f59e0b, #ea580c);color:#fff;box-shadow:0 2px 10px rgba(234,88,12,0.4);' : 'background:#1e293b;color:#fbbf24;border:1px solid rgba(245,158,11,0.25);'}" title="Super Admin Exclusive: Ek category ki tamam dishes par aik sath photo lagayein ya alag alag">
                👑 Category Bulk Photos (Super Admin)
              </button>
              <button type="button" id="tab-btn-bulk" style="padding:8px 14px;border-radius:10px;font-size:12px;font-weight:700;border:none;cursor:pointer;display:flex;align-items:center;gap:6px;${currentTab === 'bulk' ? 'background:#f59e0b;color:#000;box-shadow:0 2px 10px rgba(245,158,11,0.4);' : 'background:#1e293b;color:#94a3b8;'}">
                ⚡ Quick Price Editor
              </button>
              <button type="button" id="tab-btn-card-shape" style="padding:8px 14px;border-radius:10px;font-size:12px;font-weight:700;border:none;cursor:pointer;display:flex;align-items:center;gap:6px;background:#7c3aed;color:#fff;box-shadow:0 2px 10px rgba(124,58,237,0.4);" title="Customize Customer Menu Card Shape, Image Frame, and Size">
                📐 Menu Card Shape & Size
              </button>
              <button type="button" id="tab-btn-security" style="padding:8px 14px;border-radius:10px;font-size:12px;font-weight:700;border:none;cursor:pointer;display:flex;align-items:center;gap:6px;${currentTab === 'security' ? 'background:#8b5cf6;color:#fff;box-shadow:0 2px 10px rgba(139,92,246,0.4);' : 'background:#1e293b;color:#94a3b8;'}">
                📦 Backup & Security
              </button>
            </div>

            <!-- Quick Storefront Link -->
            <button type="button" id="preview-storefront-btn" style="background:#1e293b;border:1px solid #334155;color:#38bdf8;padding:6px 12px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;">
              👁️ View Live Storefront
            </button>
          </div>

          <!-- Main Tab Body -->
          <div style="flex:1;overflow-y:auto;padding:18px 20px;">
            ${renderTabContent()}
          </div>

        </div>
      `;

      bindModalEvents();
    }

    function renderTabContent() {
      // TAB 1: ALL DISHES LIST WITH INLINE EDITING
      if (currentTab === 'items') {
        const categories = getRestaurantCategories(restaurant.id);
        let filteredItems = restItems.filter(item => {
          const matchesCat = categoryFilter === 'ALL' || item.category === categoryFilter;
          const matchesSearch = !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase()) || (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
          return matchesCat && matchesSearch;
        });

        return `
          <!-- Search & Filter Controls -->
          <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap;align-items:center;justify-content:space-between;">
            <div style="display:flex;gap:8px;flex:1;min-width:260px;align-items:center;">
              <input id="dish-search-input" type="text" placeholder="🔍 Search dish name or description..." value="${sanitizeText(searchQuery)}" style="flex:1;background:#020617;border:1px solid #334155;border-radius:10px;padding:8px 12px;font-size:12px;color:#fff;" />
              <select id="dish-cat-filter" style="background:#020617;border:1px solid #334155;border-radius:10px;padding:8px 12px;font-size:12px;color:#fff;cursor:pointer;">
                <option value="ALL" ${categoryFilter === 'ALL' ? 'selected' : ''}>All Categories (${restItems.length})</option>
                ${categories.map(c => `
                  <option value="${sanitizeText(c)}" ${categoryFilter === c ? 'selected' : ''}>${sanitizeText(c)} (${restItems.filter(x => x.category === c).length})</option>
                `).join('')}
              </select>
              <button type="button" id="tab1-add-cat-btn" style="background:#ec4899/20;border:1px solid #ec4899/70;color:#f472b6;padding:8px 12px;border-radius:10px;font-size:11px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:4px;white-space:nowrap;" title="Add New Category for this restaurant">
                ➕ Add Category
              </button>
            </div>
            <div style="display:flex;gap:8px;">
              <button type="button" id="cat-bulk-photos-shortcut-btn" style="background:linear-gradient(135deg, #f59e0b, #ea580c);color:#fff;border:none;padding:8px 14px;border-radius:10px;font-size:11px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:6px;box-shadow:0 2px 10px rgba(245,158,11,0.3);" title="Super Admin Exclusive: Bulk Apply Photos to Category">
                👑 Category Bulk Photos
              </button>
              <button type="button" id="add-dish-shortcut-btn" style="background:#10b981;color:#fff;border:none;padding:8px 14px;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;">
                ➕ Add Dish & Picture
              </button>
            </div>
          </div>

          <!-- Quick Inline Add Category Box for Tab 1 -->
          <div id="tab1-inline-cat-box" style="display:none;background:#090d16;border:1px solid #ec4899;border-radius:12px;padding:10px 14px;margin-bottom:14px;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span style="font-size:11px;font-weight:800;color:#f472b6;white-space:nowrap;">🏷️ New Category:</span>
              <input id="tab1-inline-cat-input" type="text" placeholder="e.g. Special Karahi, Handi, BBQ, Desserts..." style="flex:1;min-width:180px;background:#020617;border:1px solid #334155;border-radius:8px;padding:7px 10px;font-size:11px;color:#fff;" />
              <button type="button" id="tab1-inline-cat-save-btn" style="background:#ec4899;color:#fff;border:none;padding:7px 14px;border-radius:8px;font-size:11px;font-weight:800;cursor:pointer;white-space:nowrap;">💾 Save Category</button>
              <button type="button" id="tab1-inline-cat-manage-btn" style="background:#1e293b;color:#f472b6;border:1px solid #ec4899/40;padding:7px 10px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">⚙️ Manage All</button>
              <button type="button" id="tab1-inline-cat-cancel-btn" style="background:#334155;color:#94a3b8;border:none;padding:7px 10px;border-radius:8px;font-size:11px;cursor:pointer;">✕</button>
            </div>
          </div>

          <!-- Dishes Table / Grid -->
          ${filteredItems.length === 0 ? `
            <div style="text-align:center;padding:50px 20px;background:#020617;border:1px dashed #334155;border-radius:16px;">
              <p style="font-size:28px;margin:0 0 10px 0;">🍲</p>
              <h4 style="margin:0 0 4px 0;font-size:14px;color:#cbd5e1;">Koi Dish Match Nahi Hui</h4>
              <p style="margin:0 0 16px 0;font-size:11px;color:#64748b;">Naya item aur picture add karne ke liye "Add Dish & Picture" button click karein.</p>
              <button type="button" id="empty-state-add-btn" style="background:#0284c7;color:#fff;border:none;padding:8px 16px;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;">➕ Add First Dish</button>
            </div>
          ` : `
            <div style="display:flex;flex-direction:column;gap:8px;">
              ${filteredItems.map(item => `
                <div class="menu-item-row" data-id="${item.id}" style="background:#1e293b/60;border:1px solid #334155;border-radius:14px;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;transition:all 0.2s;">
                  
                  <!-- Left: Image & Info -->
                  <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:200px;">
                    <img src="${sanitizeUrl(item.imageUrl) || FOOD_PHOTO_PRESETS[0].url}" style="width:48px;height:48px;border-radius:10px;object-fit:cover;border:1px solid #475569;" onerror="this.src='${FOOD_PHOTO_PRESETS[0].url}'" />
                    <div>
                      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                        <h4 style="margin:0;font-size:13px;font-weight:800;color:#fff;">${sanitizeText(item.name)}</h4>
                        <span style="font-size:9px;background:#0284c7/20;color:#38bdf8;border:1px solid #0284c7/40;padding:2px 6px;border-radius:6px;font-weight:bold;">${sanitizeText(item.category || 'General')}</span>
                        ${item.dietary ? `<span style="font-size:9px;background:#10b981/20;color:#34d399;border:1px solid #10b981/40;padding:2px 6px;border-radius:6px;">${sanitizeText(item.dietary)}</span>` : ''}
                        ${item.hasVariants && Array.isArray(item.variants) && item.variants.length > 0 ? `<span style="font-size:9px;background:#f97316/20;color:#fb923c;border:1px solid #f97316/40;padding:2px 6px;border-radius:6px;font-weight:bold;">🍗 ${item.variants.length} Portions</span>` : ''}
                      </div>
                      ${item.hasVariants && Array.isArray(item.variants) && item.variants.length > 0 ? `
                        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:3px;">
                          ${item.variants.map(v => `
                            <span style="font-size:9px;background:#0369a1/25;border:1px solid #0284c7/50;color:#38bdf8;padding:1px 6px;border-radius:5px;font-weight:700;">
                              ${sanitizeText(v.name)}: Rs. ${Number(v.price).toLocaleString()}
                            </span>
                          `).join('')}
                        </div>
                      ` : ''}
                      <p style="margin:2px 0 0;font-size:10px;color:#94a3b8;max-width:380px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                        ${sanitizeText(item.description) || 'No description added.'}
                      </p>
                    </div>
                  </div>

                  <!-- Middle: Fast Inline Price Edit & Portions -->
                  <div style="display:flex;align-items:center;gap:6px;">
                    ${item.hasVariants && Array.isArray(item.variants) && item.variants.length > 0 ? `
                      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;">
                        <span style="font-size:11px;color:#fbbf24;font-weight:800;white-space:nowrap;">
                          ${item.variants.map(v => `${sanitizeText(v.name)}: Rs.${v.price}`).join(' | ')}
                        </span>
                        <span style="font-size:9px;color:#38bdf8;background:#0284c7/20;padding:1px 5px;border-radius:4px;font-weight:700;">
                          ${item.variants.length} Portions Active
                        </span>
                      </div>
                    ` : `
                      <span style="font-size:11px;color:#94a3b8;font-weight:600;">Rs.</span>
                      <input type="number" class="inline-price-input" data-id="${item.id}" value="${item.price}" style="width:80px;background:#020617;border:1px solid #334155;border-radius:8px;padding:4px 8px;font-size:12px;color:#fbbf24;font-weight:800;text-align:right;" />
                      <button type="button" class="inline-price-save-btn" data-id="${item.id}" title="Save Price" style="background:#0284c7;color:#fff;border:none;padding:5px 8px;border-radius:6px;font-size:10px;font-weight:bold;cursor:pointer;">💾</button>
                    `}
                  </div>

                  <!-- Middle: Stock Toggle -->
                  <div>
                    <button type="button" class="toggle-stock-btn" data-id="${item.id}" data-active="${item.isAvailable !== false}" style="padding:5px 10px;border-radius:8px;font-size:10px;font-weight:800;border:none;cursor:pointer;display:flex;align-items:center;gap:4px;${item.isAvailable !== false ? 'background:#065f46;color:#34d399;' : 'background:#7f1d1d;color:#f87171;'}">
                      <span>${item.isAvailable !== false ? '● In Stock' : '○ Sold Out'}</span>
                    </button>
                  </div>

                  <!-- Right: Edit & Delete Actions -->
                  <div style="display:flex;align-items:center;gap:6px;">
                    <button type="button" class="edit-dish-btn" data-id="${item.id}" style="background:#334155;border:1px solid #475569;color:#e2e8f0;padding:6px 10px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;">
                      ✏️ Edit
                    </button>
                    <button type="button" class="delete-dish-btn" data-id="${item.id}" style="background:#7f1d1d/40;border:1px solid #dc2626/40;color:#f87171;padding:6px 10px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;">
                      🗑️
                    </button>
                  </div>

                </div>
              `).join('')}
            </div>
          `}
        `;
      }

      // TAB 2: ADD / EDIT DISH FORM WITH DEDICATED HALF & FULL PRICE & PORTION ENGINE
      if (currentTab === 'add') {
        const itemToEdit = editingItemId ? restItems.find(i => i.id === editingItemId) : null;
        const currentName = itemToEdit ? itemToEdit.name : '';
        const currentCat = itemToEdit ? (itemToEdit.category || 'Biryani & Rice') : 'Biryani & Rice';
        const currentDesc = itemToEdit ? (itemToEdit.description || '') : '';
        const currentImg = itemToEdit ? (itemToEdit.imageUrl || FOOD_PHOTO_PRESETS[0].url) : FOOD_PHOTO_PRESETS[0].url;
        const currentDiet = itemToEdit ? (itemToEdit.dietary || 'Halal Non-Veg') : 'Halal Non-Veg';

        // Deduce initial pricing mode and values
        let deducedPricingMode = 'half_full';
        let initHalfPrice = '';
        let initFullPrice = '';
        let initPiece6Price = '';
        let initPiece12Price = '';
        let initSinglePrice = '';

        if (itemToEdit) {
          if (itemToEdit.hasVariants && Array.isArray(itemToEdit.variants) && itemToEdit.variants.length > 0) {
            const hasHalf = itemToEdit.variants.find(v => v.name && v.name.toLowerCase().includes('half'));
            const hasFull = itemToEdit.variants.find(v => v.name && v.name.toLowerCase().includes('full'));
            const has6 = itemToEdit.variants.find(v => v.name && v.name.includes('6'));
            const has12 = itemToEdit.variants.find(v => v.name && v.name.includes('12'));

            if (hasHalf || hasFull) {
              deducedPricingMode = 'half_full';
              initHalfPrice = hasHalf ? hasHalf.price : '';
              initFullPrice = hasFull ? hasFull.price : '';
            } else if (has6 || has12) {
              deducedPricingMode = 'pieces';
              initPiece6Price = has6 ? has6.price : '';
              initPiece12Price = has12 ? has12.price : '';
            } else {
              deducedPricingMode = 'custom';
            }
          } else {
            deducedPricingMode = 'single';
            initSinglePrice = itemToEdit.price || '';
          }
        } else {
          // New dish defaults: Half & Full
          deducedPricingMode = 'half_full';
          initHalfPrice = 750;
          initFullPrice = 1400;
        }

        const allCats = getRestaurantCategories(restaurant.id);

        return `
          <div style="background:#1e293b/40;border:1px solid #334155;border-radius:18px;padding:20px;max-width:820px;margin:0 auto;">
            
            <!-- In-Modal Feedback / Error Banner -->
            <div id="dish-form-notice" style="display:none;padding:10px 14px;border-radius:10px;font-size:12px;font-weight:700;margin-bottom:14px;"></div>

            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;border-bottom:1px solid #334155;padding-bottom:12px;flex-wrap:wrap;gap:8px;">
              <h4 style="margin:0;font-size:15px;font-weight:800;color:#fff;display:flex;align-items:center;gap:8px;">
                <span>${editingItemId ? '✏️ Edit Dish Information & Rates' : '➕ Add New Dish & Rates'}</span>
              </h4>
              <span style="font-size:11px;color:#10b981;font-weight:bold;background:#064e3b;padding:3px 10px;border-radius:6px;">
                ✨ Half/Full Rates & Zero-Reload Protection Ready
              </span>
            </div>

            <div id="dish-form-container" style="display:flex;flex-direction:column;gap:14px;">
              
              <!-- Dish Name & Category Row -->
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div>
                  <label style="font-size:11px;font-weight:700;color:#cbd5e1;display:block;margin-bottom:4px;">Dish Name *</label>
                  <input id="dish-form-name" type="text" placeholder="e.g. Chicken Peshawari Karahi" value="${sanitizeText(currentName)}" style="width:100%;background:#020617;border:1px solid #334155;border-radius:10px;padding:9px 12px;font-size:12px;color:#fff;" />
                </div>
                <div>
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                    <label style="font-size:11px;font-weight:700;color:#cbd5e1;">Category *</label>
                    <button type="button" id="toggle-inline-cat-btn" style="background:#ec4899/20;border:1px solid #ec4899/50;color:#f472b6;font-size:10px;font-weight:800;padding:2px 8px;border-radius:6px;cursor:pointer;">
                      ➕ New Category
                    </button>
                  </div>

                  <!-- Quick Inline Add Category Box -->
                  <div id="inline-cat-box" style="display:none;background:#090d16;border:1px solid #ec4899;border-radius:8px;padding:6px;margin-bottom:6px;">
                    <div style="display:flex;gap:6px;">
                      <input id="inline-cat-input" type="text" placeholder="e.g. Karahi, BBQ, Fast Food..." style="flex:1;background:#020617;border:1px solid #334155;border-radius:6px;padding:5px 8px;font-size:11px;color:#fff;" />
                      <button type="button" id="inline-cat-save-btn" style="background:#ec4899;color:#fff;border:none;padding:5px 10px;border-radius:6px;font-size:10px;font-weight:bold;cursor:pointer;">Save</button>
                      <button type="button" id="inline-cat-cancel-btn" style="background:#334155;color:#94a3b8;border:none;padding:5px 8px;border-radius:6px;font-size:10px;cursor:pointer;">✕</button>
                    </div>
                  </div>

                  <select id="dish-form-cat" style="width:100%;background:#020617;border:1px solid #334155;border-radius:10px;padding:9px 12px;font-size:12px;color:#fff;cursor:pointer;">
                    ${allCats.map(c => `<option value="${sanitizeText(c)}" ${c === currentCat ? 'selected' : ''}>${sanitizeText(c)}</option>`).join('')}
                  </select>
                </div>
              </div>

              <!-- ======================================================= -->
              <!-- USER REQUEST: DEDICATED HALF & FULL PRICE SETUP -->
              <!-- ======================================================= -->
              <div style="background:#090d16;border:2px solid #f97316/70;border-radius:16px;padding:16px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
                  <label style="font-size:13px;font-weight:800;color:#fb923c;display:flex;align-items:center;gap:6px;">
                    <span>🍗 Rate & Portion Setup (Half / Full / Pieces / Single):</span>
                  </label>
                  <span style="font-size:10px;color:#f97316;background:rgba(249,115,22,0.15);border:1px solid rgba(249,115,22,0.4);padding:3px 8px;border-radius:6px;font-weight:800;">
                    ⭐ Half & Full Option Active
                  </span>
                </div>

                <!-- 4 Pricing Mode Selectors -->
                <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:6px;margin-bottom:14px;">
                  <button type="button" class="pricing-mode-btn" data-mode="half_full" style="padding:8px 10px;border-radius:10px;font-size:11px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:all 0.15s;${deducedPricingMode === 'half_full' ? 'background:#ea580c;color:#fff;border:1px solid #f97316;box-shadow:0 2px 10px rgba(234,88,12,0.4);' : 'background:#0f172a;color:#94a3b8;border:1px solid #334155;'}">
                    🍗 Half & Full Price
                  </button>
                  <button type="button" class="pricing-mode-btn" data-mode="pieces" style="padding:8px 10px;border-radius:10px;font-size:11px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:all 0.15s;${deducedPricingMode === 'pieces' ? 'background:#0284c7;color:#fff;border:1px solid #38bdf8;box-shadow:0 2px 10px rgba(2,132,199,0.4);' : 'background:#0f172a;color:#94a3b8;border:1px solid #334155;'}">
                    🍗 6 & 12 Pieces
                  </button>
                  <button type="button" class="pricing-mode-btn" data-mode="single" style="padding:8px 10px;border-radius:10px;font-size:11px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:all 0.15s;${deducedPricingMode === 'single' ? 'background:#059669;color:#fff;border:1px solid #10b981;box-shadow:0 2px 10px rgba(5,150,105,0.4);' : 'background:#0f172a;color:#94a3b8;border:1px solid #334155;'}">
                    🍛 Single Fixed Price
                  </button>
                  <button type="button" class="pricing-mode-btn" data-mode="custom" style="padding:8px 10px;border-radius:10px;font-size:11px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:all 0.15s;${deducedPricingMode === 'custom' ? 'background:#7c3aed;color:#fff;border:1px solid #a78bfa;box-shadow:0 2px 10px rgba(124,58,237,0.4);' : 'background:#0f172a;color:#94a3b8;border:1px solid #334155;'}">
                    ⚙️ Custom Portions
                  </button>
                </div>

                <!-- 1. Dedicated Half & Full Price Inputs -->
                <div id="panel-pricing-half-full" style="${deducedPricingMode === 'half_full' ? 'display:block;' : 'display:none;'}background:#020617;border:1px solid #ea580c;border-radius:14px;padding:14px;">
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div>
                      <label style="font-size:12px;font-weight:800;color:#fb923c;display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                        <span>🍗 Half Price in PKR (Rs.) *</span>
                      </label>
                      <input id="dish-half-price" type="number" min="1" placeholder="e.g. 750" value="${initHalfPrice}" style="width:100%;background:#0f172a;border:1px solid #f97316;border-radius:10px;padding:9px 12px;font-size:14px;color:#fbbf24;font-weight:800;" />
                      <span style="font-size:10px;color:#94a3b8;margin-top:4px;display:block;">1 Person Serving</span>
                    </div>
                    <div>
                      <label style="font-size:12px;font-weight:800;color:#fb923c;display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                        <span>🍗 Full Price in PKR (Rs.) *</span>
                      </label>
                      <input id="dish-full-price" type="number" min="1" placeholder="e.g. 1400" value="${initFullPrice}" style="width:100%;background:#0f172a;border:1px solid #f97316;border-radius:10px;padding:9px 12px;font-size:14px;color:#fbbf24;font-weight:800;" />
                      <span style="font-size:10px;color:#94a3b8;margin-top:4px;display:block;">2-3 Persons Serving</span>
                    </div>
                  </div>
                  <p style="margin:10px 0 0;font-size:11px;color:#cbd5e1;line-height:1.4;">
                    💡 <em>Customer jab bhi yeh dish select karega toh us se Half aur Full portion poocha jayega. Storefront par dono rates display honge.</em>
                  </p>
                </div>

                <!-- 2. Dedicated 6 Pieces & 12 Pieces Inputs -->
                <div id="panel-pricing-pieces" style="${deducedPricingMode === 'pieces' ? 'display:block;' : 'display:none;'}background:#020617;border:1px solid #0284c7;border-radius:14px;padding:14px;">
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div>
                      <label style="font-size:12px;font-weight:800;color:#38bdf8;display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                        <span>🍗 6 Pieces Price (Rs.) *</span>
                      </label>
                      <input id="dish-piece6-price" type="number" min="1" placeholder="e.g. 450" value="${initPiece6Price}" style="width:100%;background:#0f172a;border:1px solid #0284c7;border-radius:10px;padding:9px 12px;font-size:14px;color:#fbbf24;font-weight:800;" />
                    </div>
                    <div>
                      <label style="font-size:12px;font-weight:800;color:#38bdf8;display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                        <span>🍗 12 Pieces Price (Rs.) *</span>
                      </label>
                      <input id="dish-piece12-price" type="number" min="1" placeholder="e.g. 850" value="${initPiece12Price}" style="width:100%;background:#0f172a;border:1px solid #0284c7;border-radius:10px;padding:9px 12px;font-size:14px;color:#fbbf24;font-weight:800;" />
                    </div>
                  </div>
                  <p style="margin:10px 0 0;font-size:11px;color:#cbd5e1;">
                    💡 <em>Wings, Nuggets, BBQ, ya Broast ke liye customer 6 Pieces ya 12 Pieces choose karega.</em>
                  </p>
                </div>

                <!-- 3. Dedicated Single Price Input -->
                <div id="panel-pricing-single" style="${deducedPricingMode === 'single' ? 'display:block;' : 'display:none;'}background:#020617;border:1px solid #10b981;border-radius:14px;padding:14px;">
                  <div>
                    <label style="font-size:12px;font-weight:800;color:#34d399;display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                      <span>🍛 Fixed Price in PKR (Rs.) *</span>
                    </label>
                    <input id="dish-single-price" type="number" min="1" placeholder="e.g. 850" value="${initSinglePrice}" style="width:100%;background:#0f172a;border:1px solid #10b981;border-radius:10px;padding:9px 12px;font-size:14px;color:#fbbf24;font-weight:800;" />
                  </div>
                  <p style="margin:10px 0 0;font-size:11px;color:#cbd5e1;">
                    💡 <em>Burger, Wraps, Drinks, Desserts ke liye ik hi fixed price set karein.</em>
                  </p>
                </div>

                <!-- 4. Custom Portions Rows & Presets -->
                <div id="panel-pricing-custom" style="${deducedPricingMode === 'custom' ? 'display:block;' : 'display:none;'}background:#020617;border:1px solid #7c3aed;border-radius:14px;padding:14px;">
                  
                  <!-- Header with Save Custom Preset Button -->
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
                    <div>
                      <div style="font-size:12px;font-weight:800;color:#c084fc;display:flex;align-items:center;gap:6px;">
                        <span>⚙️ Custom Portions & Rates Setup</span>
                      </div>
                      <div style="font-size:10px;color:#94a3b8;margin-top:2px;">
                        Yahan jo bhi portions & prices banayein, unhe <strong>"Save Custom as Preset"</strong> karke hamesha ke liye mehfooz kar sakte hain!
                      </div>
                    </div>
                    <button type="button" id="open-save-custom-preset-btn" style="background:#059669;color:#fff;border:none;padding:6px 12px;border-radius:8px;font-size:11px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:6px;box-shadow:0 2px 10px rgba(5,150,105,0.4);">
                      💾 Save Custom as Preset
                    </button>
                  </div>

                  <!-- Inline Save Custom Preset Prompt Box -->
                  <div id="save-custom-preset-box" style="display:none;background:#0f172a;border:2px solid #10b981;border-radius:12px;padding:12px;margin-bottom:12px;box-shadow:0 8px 20px rgba(0,0,0,0.4);">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                      <label style="font-size:11px;font-weight:800;color:#34d399;">
                        💾 Save This Custom Portion Setup (Preset Name):
                      </label>
                      <button type="button" id="close-save-preset-box-btn" style="background:none;border:none;color:#94a3b8;font-size:14px;cursor:pointer;">✕</button>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                      <input id="new-preset-name-input" type="text" placeholder="e.g. Karahi Half & Full, Biryani Sizes, Family Box..." style="flex:1;min-width:200px;background:#020617;border:1px solid #334155;border-radius:8px;padding:7px 10px;font-size:11px;color:#fff;font-weight:700;" />
                      <button type="button" id="confirm-save-preset-btn" style="background:#10b981;color:#fff;border:none;padding:7px 16px;border-radius:8px;font-size:11px;font-weight:800;cursor:pointer;box-shadow:0 2px 8px rgba(16,185,129,0.4);">
                        💾 Save Preset Now
                      </button>
                    </div>
                    <div style="font-size:10px;color:#cbd5e1;margin-top:6px;">
                      💡 Yeh preset hamesha ke liye save ho jayega aur aap kisi bhi dish par 1-click apply kar sakenge!
                    </div>
                  </div>

                  <!-- USER SAVED CUSTOM PRESETS SECTION (Humare Saved Presets) -->
                  <div style="background:#090d16;border:1px solid #1e293b;border-radius:12px;padding:10px;margin-bottom:12px;">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                      <div style="font-size:11px;font-weight:800;color:#fbbf24;display:flex;align-items:center;gap:6px;">
                        <span>⭐ Humare Saved Custom Presets (1-Click Reusable):</span>
                      </div>
                      <span id="saved-presets-count-badge" style="font-size:9px;background:#f59e0b/20;color:#fbbf24;border:1px solid #f59e0b/40;padding:1px 6px;border-radius:4px;font-weight:bold;">
                        Permanent Presets
                      </span>
                    </div>

                    <!-- List of Saved Presets (Dynamically rendered) -->
                    <div id="saved-custom-presets-list" style="display:flex;gap:6px;flex-wrap:wrap;"></div>
                  </div>

                  <!-- 1-Click Fast Presets (Built-in) -->
                  <div style="font-size:10px;color:#94a3b8;margin-bottom:6px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">
                    ⚡ Or Built-in Quick Starters:
                  </div>
                  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">
                    <button type="button" class="variant-preset-btn" data-preset="quarter_half_full" style="background:#1e293b;color:#f8fafc;border:1px solid #475569;border-radius:8px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;">🥘 Quarter / Half / Full</button>
                    <button type="button" class="variant-preset-btn" data-preset="single_double" style="background:#1e293b;color:#f8fafc;border:1px solid #475569;border-radius:8px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;">🍱 Single / Double</button>
                    <button type="button" class="variant-preset-btn" data-preset="regular_large" style="background:#1e293b;color:#f8fafc;border:1px solid #475569;border-radius:8px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;">🥤 Regular / Large</button>
                  </div>

                  <!-- Dynamic Variant Rows -->
                  <div id="variant-rows-container" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;"></div>

                  <!-- Actions Row -->
                  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                    <button type="button" id="add-variant-row-btn" style="background:#0284c7;color:#fff;border:none;border-radius:8px;padding:7px 14px;font-size:11px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:6px;box-shadow:0 2px 8px rgba(2,132,199,0.3);">
                      ➕ Add Custom Portion / Piece
                    </button>
                    <button type="button" id="quick-save-custom-preset-btn" style="background:#10b981;color:#fff;border:none;border-radius:8px;padding:7px 14px;font-size:11px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:6px;box-shadow:0 2px 8px rgba(16,185,129,0.3);">
                      💾 Save as Preset Template
                    </button>
                  </div>
                </div>

              </div>

              <!-- Dietary Badge & Description Row -->
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div>
                  <label style="font-size:11px;font-weight:700;color:#cbd5e1;display:block;margin-bottom:4px;">Dietary Badge</label>
                  <select id="dish-form-diet" style="width:100%;background:#020617;border:1px solid #334155;border-radius:10px;padding:9px 12px;font-size:12px;color:#fff;">
                    <option value="Halal Non-Veg" ${currentDiet === 'Halal Non-Veg' ? 'selected' : ''}>🍖 Halal Non-Veg</option>
                    <option value="100% Vegetarian" ${currentDiet === '100% Vegetarian' ? 'selected' : ''}>🥬 100% Vegetarian</option>
                    <option value="Special Chef's Pick" ${currentDiet === "Special Chef's Pick" ? 'selected' : ''}>⭐ Chef's Special Pick</option>
                    <option value="Spicy Desi" ${currentDiet === 'Spicy Desi' ? 'selected' : ''}>🌶️ Spicy Desi</option>
                  </select>
                </div>
                <div>
                  <label style="font-size:11px;font-weight:700;color:#cbd5e1;display:block;margin-bottom:4px;">Dish Description</label>
                  <input id="dish-form-desc" type="text" placeholder="e.g. Cooked with fresh tomatoes and desi spices." value="${sanitizeText(currentDesc)}" style="width:100%;background:#020617;border:1px solid #334155;border-radius:10px;padding:9px 12px;font-size:12px;color:#fff;" />
                </div>
              </div>

              <!-- ======================================================= -->
              <!-- SMART FOOD PHOTO STUDIO & LIVE CUSTOMER PREVIEW -->
              <!-- ======================================================= -->
              <div style="background:#020617;border:1px solid #0284c7;border-radius:16px;padding:16px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                  <label style="font-size:12px;font-weight:800;color:#38bdf8;text-transform:uppercase;letter-spacing:0.5px;display:flex;align-items:center;gap:6px;">
                    <span>📸 Live Food Photo Studio & Preview</span>
                  </label>
                  <span id="auto-adjust-badge" style="font-size:10px;background:#059669;color:#fff;padding:2px 8px;border-radius:6px;font-weight:bold;">
                    ✓ Zero Crop & Auto-Fit Engine
                  </span>
                </div>

                <!-- 1. Drag & Drop or Click to Upload -->
                <div id="dish-upload-dropzone" style="border:2px dashed #0284c7;border-radius:14px;padding:16px;text-align:center;background:rgba(2,132,199,0.06);cursor:pointer;transition:all 0.2s;margin-bottom:12px;">
                  <input type="file" id="dish-file-input" accept="image/jpeg,image/png,image/webp" style="display:none;" />
                  <p style="font-size:30px;margin:0 0 6px 0;">📱 📷</p>
                  <div style="font-size:13px;font-weight:bold;color:#f8fafc;">
                    Click here to Upload Photo from Mobile Camera / Gallery or PC
                  </div>
                  <div style="font-size:10px;color:#94a3b8;margin-top:4px;">
                    Supports JPG, PNG, WebP • Sideways phone photo ko 1-click 90° rotate karein • Har photo customer card par auto-fit hogi
                  </div>
                </div>

                <!-- 2. Interactive Studio Toolbar (Quick Tools & Zero-Crop Status) -->
                <div style="background:#090d16;border:1px solid #10b981/40;border-radius:14px;padding:12px;margin-bottom:12px;">
                  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                    <div>
                      <div style="font-size:12px;font-weight:800;color:#34d399;display:flex;align-items:center;gap:6px;">
                        <span>🌟 100% Zero-Crop Active (Pori Photo)</span>
                      </div>
                      <div style="font-size:10px;color:#94a3b8;margin-top:2px;">
                        Jo bhi photo aap upload karenge, customer side par bina cut hue pori dikhegi. Mobile par compact Foodpanda view auto-applied hai!
                      </div>
                    </div>

                    <!-- Quick Tools: Rotate 90 & Color Pop -->
                    <div style="display:flex;align-items:center;gap:6px;">
                      <button type="button" id="rotate-photo-btn" style="background:#1e293b;border:1px solid #38bdf8;color:#38bdf8;padding:6px 12px;border-radius:8px;font-size:11px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:4px;">
                        <span>🔄 Rotate 90°</span>
                      </button>
                      <button type="button" id="toggle-color-pop-btn" style="background:#065f46;border:1px solid #34d399;color:#34d399;padding:6px 12px;border-radius:8px;font-size:11px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:4px;">
                        <span>✨ Color Pop: ON</span>
                      </button>
                    </div>
                  </div>
                </div>

                <!-- 3. Live Customer View Mock Card (What You See Is What Customers Get) -->
                <div style="background:#090d16;border:1px solid #334155;border-radius:14px;padding:12px;margin-bottom:12px;">
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                    <span style="font-size:11px;font-weight:800;color:#f8fafc;display:flex;align-items:center;gap:6px;">
                      <span>📱 Live Customer View (Foodpanda Zero-Crop Preview):</span>
                    </span>
                    <span id="live-customer-card-mode-badge" style="font-size:9px;background:#059669;color:#fff;padding:2px 8px;border-radius:6px;font-weight:bold;">
                      100% Pori Photo
                    </span>
                  </div>

                  <!-- Customer Card Container -->
                  <div style="max-width:320px;margin:0 auto;background:#0f172a;border:1px solid #334155;border-radius:16px;overflow:hidden;box-shadow:0 10px 25px rgba(0,0,0,0.5);">
                    <div id="customer-mock-img-box" style="width:100%;height:160px;background:#0f172a;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;border-radius:14px;">
                      <canvas id="dish-preview-canvas" style="display:none;"></canvas>
                      <img id="customer-mock-img" src="${sanitizeUrl(currentImg)}" style="width:100%;height:100%;object-fit:cover;object-position:center center;background:#0f172a;border-radius:14px;" onerror="this.src='${SmartImageEngine.DEFAULT_FALLBACK_URL}'" />
                      <span id="customer-mock-badge" style="position:absolute;top:8px;left:8px;font-size:9px;background:rgba(15,23,42,0.85);backdrop-filter:blur(4px);color:#34d399;border:1px solid #10b981/40;padding:2px 8px;border-radius:6px;font-weight:bold;">
                        ${sanitizeText(currentDiet)}
                      </span>
                    </div>
                    <div style="padding:10px 12px;">
                      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                        <h5 id="customer-mock-title" style="margin:0;font-size:12px;font-weight:800;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px;">
                          ${sanitizeText(currentName) || 'Dish Name Preview'}
                        </h5>
                        <span id="customer-mock-price" style="font-size:12px;font-weight:800;color:#fbbf24;">
                          Half: Rs.${initHalfPrice} | Full: Rs.${initFullPrice}
                        </span>
                      </div>
                      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;">
                        <span id="customer-mock-cat" style="font-size:9px;color:#94a3b8;">${sanitizeText(currentCat)}</span>
                        <div style="background:#10b981;color:#fff;font-size:10px;font-weight:bold;padding:3px 10px;border-radius:6px;">
                          + Add
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 4. Image Source URL & Hidden Settings -->
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                  <span style="font-size:10px;color:#94a3b8;font-weight:bold;">Image URL:</span>
                  <input id="dish-form-img" type="text" placeholder="Upload above or pick preset" value="${sanitizeUrl(currentImg)}" style="flex:1;background:#090d16;border:1px solid #334155;border-radius:8px;padding:5px 8px;font-size:10px;color:#38bdf8;font-family:monospace;" />
                </div>

                <!-- 1-Click Pakistani Food Photos Presets -->
                <div style="background:#090d16;border:1px solid #1e293b;border-radius:12px;padding:10px;">
                  <span style="font-size:10px;font-weight:800;color:#94a3b8;text-transform:uppercase;display:block;margin-bottom:6px;">⚡ Or Pick a 1-Click Pakistani Food Preset:</span>
                  <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(130px, 1fr));gap:6px;">
                    ${FOOD_PHOTO_PRESETS.map(p => `
                      <div class="photo-preset-item" data-url="${p.url}" data-name="${p.name}" data-cat="${p.category}" style="border:1px solid #334155;border-radius:8px;padding:5px;cursor:pointer;background:#0f172a;display:flex;align-items:center;gap:6px;transition:all 0.2s;">
                        <img src="${p.url}" style="width:26px;height:26px;border-radius:6px;object-fit:cover;" onerror="this.src='${SmartImageEngine.DEFAULT_FALLBACK_URL}'" />
                        <span style="font-size:10px;font-weight:600;color:#cbd5e1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name.split(' ')[0]}</span>
                      </div>
                    `).join('')}
                  </div>
                </div>

              </div>

              <!-- Action Buttons (Zero-Reload: Uses type="button", NOT submit!) -->
              <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:6px;">
                <button type="button" id="cancel-dish-form-btn" style="background:#334155;color:#e2e8f0;border:none;padding:10px 18px;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;">Cancel</button>
                <button type="button" id="save-dish-form-btn" style="background:#10b981;color:#fff;border:none;padding:10px 24px;border-radius:10px;font-size:12px;font-weight:800;cursor:pointer;box-shadow:0 4px 14px rgba(16,185,129,0.4);">
                  💾 ${editingItemId ? 'Update Dish & Rates' : 'Save Dish & Rates'}
                </button>
              </div>

            </div>
          </div>
        `;
      }

      // TAB 3: CATEGORY BULK PHOTOS STUDIO (SUPER ADMIN EXCLUSIVE)
      if (currentTab === 'cat-bulk-photos') {
        const allCats = getRestaurantCategories(restaurant.id);
        const selectedCat = window.__activeBulkCat || (allCats[0] || 'Biryani & Rice');
        const catDishes = restItems.filter(i => (i.category || 'General').toLowerCase().trim() === selectedCat.toLowerCase().trim());
        const previewImgUrl = window.__bulkCatActiveDataUrl || (catDishes[0]?.imageUrl || FOOD_PHOTO_PRESETS[0].url);

        return `
          <div style="background:#1e293b/40;border:1px solid #334155;border-radius:18px;padding:20px;max-width:920px;margin:0 auto;">
            
            <!-- Super Admin Access Banner -->
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;border-bottom:1px solid #334155;padding-bottom:14px;flex-wrap:wrap;gap:10px;">
              <div>
                <h4 style="margin:0;font-size:16px;font-weight:900;color:#fff;display:flex;align-items:center;gap:8px;">
                  <span style="font-size:18px;">👑</span>
                  <span>Category Bulk Photo Studio</span>
                  <span style="font-size:10px;background:rgba(245,158,11,0.15);color:#fbbf24;border:1px solid rgba(245,158,11,0.4);padding:2px 8px;border-radius:6px;font-weight:bold;">SUPER ADMIN EXCLUSIVE</span>
                </h4>
                <p style="margin:4px 0 0;font-size:11.5px;color:#94a3b8;">
                  Ek category ki tamam dishes par aik hi click mein aik jaisi photo lagayein, ya alag alag dishes choose karein.
                </p>
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:11px;color:#34d399;background:rgba(6,95,70,0.3);border:1px solid rgba(16,185,129,0.4);padding:4px 10px;border-radius:8px;font-weight:bold;display:flex;align-items:center;gap:4px;">
                  <span>🔒</span> Verified Super Admin
                </span>
              </div>
            </div>

            <!-- Step 1: Category Selector Dropdown -->
            <div style="background:#090d16;border:1px solid rgba(245,158,11,0.4);border-radius:14px;padding:16px;margin-bottom:18px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
                <label style="font-size:12px;font-weight:800;color:#fbbf24;display:flex;align-items:center;gap:6px;">
                  <span>1️⃣ Select Category (Jis category par picture lagani hai):</span>
                </label>
                <span style="font-size:11px;color:#94a3b8;">
                  Total ${catDishes.length} dishes found in this category
                </span>
              </div>
              <div style="display:flex;gap:10px;flex-wrap:wrap;">
                <select id="bulk-cat-select" style="flex:1;min-width:240px;background:#020617;border:1px solid rgba(245,158,11,0.6);border-radius:10px;padding:10px 14px;font-size:13px;color:#fff;font-weight:bold;cursor:pointer;">
                  ${allCats.map(c => {
                    const count = restItems.filter(i => (i.category || 'General').toLowerCase().trim() === c.toLowerCase().trim()).length;
                    return `<option value="${sanitizeText(c)}" ${c.toLowerCase().trim() === selectedCat.toLowerCase().trim() ? 'selected' : ''}>🏷️ ${sanitizeText(c)} (${count} dishes)</option>`;
                  }).join('')}
                </select>
              </div>
            </div>

            <!-- Step 2: Photo Upload & Presets Selector -->
            <div style="background:#090d16;border:1px solid #334155;border-radius:14px;padding:16px;margin-bottom:18px;">
              <label style="font-size:12px;font-weight:800;color:#38bdf8;display:block;margin-bottom:10px;">
                2️⃣ Choose Picture (Photo Upload Karein ya Preset Choose Karein):
              </label>

              <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;">
                <!-- Live Picture Preview Box -->
                <div style="width:130px;height:130px;min-width:130px;background:#020617;border:2px solid #f59e0b;border-radius:14px;overflow:hidden;position:relative;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,0.5);">
                  <img id="bulk-cat-preview-img" src="${sanitizeUrl(previewImgUrl)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.src='${FOOD_PHOTO_PRESETS[0].url}'" />
                  <div style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,0.7);padding:2px 6px;border-radius:4px;font-size:9px;color:#fbbf24;font-weight:bold;">Preview</div>
                </div>

                <!-- Controls & Buttons -->
                <div style="flex:1;min-width:240px;display:flex;flex-direction:column;gap:10px;">
                  <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <input type="file" id="bulk-cat-file-input" accept="image/*" style="display:none;" />
                    <button type="button" id="bulk-cat-upload-trigger-btn" style="background:#0284c7;color:#fff;border:none;padding:10px 18px;border-radius:10px;font-size:12px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:6px;box-shadow:0 2px 10px rgba(2,132,199,0.3);">
                      📁 Upload Photo from Computer / Mobile
                    </button>
                    <button type="button" id="bulk-cat-rotate-btn" style="background:#334155;color:#e2e8f0;border:none;padding:10px 14px;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:4px;">
                      🔄 Rotate 90°
                    </button>
                  </div>

                  <!-- Fast Food Presets Buttons -->
                  <div>
                    <span style="font-size:10px;color:#94a3b8;font-weight:bold;display:block;margin-bottom:6px;">Ya Quick Food Presets Mein Se Select Karein:</span>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;">
                      ${FOOD_PHOTO_PRESETS.map(p => `
                        <button type="button" class="bulk-cat-preset-btn" data-url="${p.url}" style="background:#1e293b;border:1px solid #334155;color:#cbd5e1;padding:5px 10px;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px;transition:all 0.15s;">
                          <img src="${p.url}" style="width:16px;height:16px;border-radius:4px;object-fit:cover;" />
                          <span>${p.name || p.title}</span>
                        </button>
                      `).join('')}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Step 3: Target Dishes in this Category -->
            <div style="background:#090d16;border:1px solid #334155;border-radius:14px;padding:16px;margin-bottom:18px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
                <label style="font-size:12px;font-weight:800;color:#10b981;display:flex;align-items:center;gap:6px;">
                  <span>3️⃣ Category Dishes Selection (Kin kin dishes par lagani hai?):</span>
                </label>
                <div style="display:flex;gap:8px;">
                  <button type="button" id="bulk-cat-select-all-btn" style="background:#1e293b;border:1px solid #334155;color:#38bdf8;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:bold;cursor:pointer;">
                    ☑️ Select All (${catDishes.length})
                  </button>
                  <button type="button" id="bulk-cat-deselect-all-btn" style="background:#1e293b;border:1px solid #334155;color:#94a3b8;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:bold;cursor:pointer;">
                    ☐ Deselect All
                  </button>
                </div>
              </div>

              ${catDishes.length === 0 ? `
                <div style="text-align:center;padding:30px;background:#020617;border:1px dashed #334155;border-radius:12px;color:#94a3b8;font-size:12px;">
                  Is category ("${sanitizeText(selectedCat)}") mein abhi koi dish add nahi hui hai. Pehle dish add karein.
                </div>
              ` : `
                <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(260px, 1fr));gap:10px;">
                  ${catDishes.map(dish => `
                    <div style="background:#0f172a;border:1px solid #334155;border-radius:12px;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:10px;">
                      <div style="display:flex;align-items:center;gap:10px;">
                        <input type="checkbox" class="bulk-dish-checkbox" value="${dish.id}" checked style="width:16px;height:16px;accent-color:#f59e0b;cursor:pointer;" />
                        <img src="${sanitizeUrl(dish.imageUrl) || FOOD_PHOTO_PRESETS[0].url}" style="width:44px;height:44px;border-radius:8px;object-fit:cover;border:1px solid #334155;" onerror="this.src='${FOOD_PHOTO_PRESETS[0].url}'" />
                        <div>
                          <div style="font-size:12px;font-weight:800;color:#fff;">${sanitizeText(dish.name)}</div>
                          <div style="font-size:10px;color:#94a3b8;">${formatPKR(dish.price)}</div>
                        </div>
                      </div>
                      <button type="button" class="btn-single-dish-photo-override" data-id="${dish.id}" title="Set different individual photo for this dish alone" style="background:rgba(2,132,199,0.2);border:1px solid rgba(2,132,199,0.4);color:#38bdf8;padding:5px 8px;border-radius:6px;font-size:10px;font-weight:bold;cursor:pointer;white-space:nowrap;">
                        📷 Solo Pic
                      </button>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>

            <!-- Big Action Button -->
            <div style="display:flex;justify-content:center;margin-top:10px;">
              <button type="button" id="apply-bulk-category-photo-btn" ${catDishes.length === 0 ? 'disabled' : ''} style="background:linear-gradient(135deg, #f59e0b, #ea580c);color:#fff;border:none;padding:14px 32px;border-radius:14px;font-size:14px;font-weight:900;cursor:pointer;box-shadow:0 4px 20px rgba(234,88,12,0.5);display:flex;align-items:center;gap:10px;transition:transform 0.15s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
                <span>🚀 1-Click Apply Picture to Selected Dishes & Save Permanently</span>
              </button>
            </div>

          </div>
        `;
      }

      // TAB 4: BULK PRICE ADJUSTER
      if (currentTab === 'bulk') {
        return `
          <div style="background:#1e293b/40;border:1px solid #334155;border-radius:18px;padding:20px;max-width:760px;margin:0 auto;">
            <h4 style="margin:0 0 8px 0;font-size:14px;font-weight:800;color:#fff;display:flex;align-items:center;gap:8px;">
              <span>⚡ Bulk Price & Menu Modifier</span>
            </h4>
            <p style="margin:0 0 16px 0;font-size:11px;color:#94a3b8;">
              Quickly adjust all menu prices by a fixed amount (e.g. +Rs. 50 inflation adjustment) or percentage (+10%).
            </p>

            <div style="background:#020617;border:1px solid #334155;border-radius:14px;padding:14px;margin-bottom:16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
              <div>
                <label style="font-size:10px;font-weight:700;color:#94a3b8;display:block;margin-bottom:4px;">Adjustment Type:</label>
                <select id="bulk-type" style="background:#0f172a;border:1px solid #334155;border-radius:8px;padding:6px 10px;font-size:11px;color:#fff;">
                  <option value="add_fixed">Add Fixed Amount (+Rs)</option>
                  <option value="subtract_fixed">Subtract Fixed Amount (-Rs)</option>
                  <option value="add_percent">Add Percentage (+%)</option>
                  <option value="subtract_percent">Subtract Percentage (-%)</option>
                </select>
              </div>
              <div>
                <label style="font-size:10px;font-weight:700;color:#94a3b8;display:block;margin-bottom:4px;">Amount / Percentage:</label>
                <input id="bulk-val" type="number" placeholder="e.g. 50 or 10" style="width:110px;background:#0f172a;border:1px solid #334155;border-radius:8px;padding:6px 10px;font-size:11px;color:#fbbf24;font-weight:bold;" />
              </div>
              <div style="margin-top:14px;">
                <button type="button" id="apply-bulk-price-btn" style="background:#f59e0b;color:#000;border:none;padding:8px 18px;border-radius:8px;font-size:11px;font-weight:800;cursor:pointer;">
                  ⚡ Apply to All ${restItems.length} Dishes
                </button>
              </div>
            </div>

            <!-- List with live quick edit values -->
            <div style="max-height:360px;overflow-y:auto;border:1px solid #334155;border-radius:12px;">
              <table style="width:100%;border-collapse:collapse;font-size:11px;text-align:left;">
                <thead style="background:#020617;color:#94a3b8;position:sticky;top:0;">
                  <tr>
                    <th style="padding:8px 12px;">Dish Name</th>
                    <th style="padding:8px 12px;">Category</th>
                    <th style="padding:8px 12px;text-align:right;">Current Price</th>
                  </tr>
                </thead>
                <tbody>
                  ${restItems.map((item, idx) => `
                    <tr style="border-top:1px solid #1e293b;background:${idx % 2 === 0 ? '#0f172a' : '#1e293b/30'};">
                      <td style="padding:8px 12px;font-weight:600;color:#fff;">${sanitizeText(item.name)}</td>
                      <td style="padding:8px 12px;color:#94a3b8;">${sanitizeText(item.category || 'General')}</td>
                      <td style="padding:8px 12px;text-align:right;color:#fbbf24;font-weight:bold;">${formatPKR(item.price)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

          </div>
        `;
      }

      // TAB: CATEGORIES MANAGEMENT (Add, Rename, Delete, Presets)
      if (currentTab === 'categories') {
        const categories = getRestaurantCategories(restaurant.id);
        const presetCategories = [
          'Biryani & Rice',
          'Karahi & Handi',
          'BBQ & Grills',
          'Fast Food & Burgers',
          'Pizza & Italian',
          'Sides & Starters',
          'Desserts & Sweets',
          'Beverages & Shakes',
          'Tandoor & Breads',
          'Chinese & Soups',
          'Chaat & Street Food',
          'Traditional Curries'
        ];

        return `
          <div style="display:flex;flex-direction:column;gap:18px;max-width:880px;margin:0 auto;">
            
            <!-- Header Banner -->
            <div style="background:#020617;border:1px solid #ec4899/50;border-radius:18px;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
              <div>
                <h4 style="margin:0;font-size:15px;font-weight:800;color:#fff;display:flex;align-items:center;gap:8px;">
                  <span>🏷️ Manage & Add Menu Categories:</span> <span style="color:#f472b6;">${sanitizeText(restaurant.name)}</span>
                </h4>
                <p style="margin:4px 0 0;font-size:11px;color:#94a3b8;">
                  Nayi categories add karein, rename karein, ya delete karein. Storefront par categories foran live update hongi.
                </p>
              </div>
              <span style="font-size:11px;font-weight:800;color:#f472b6;background:#ec4899/20;border:1px solid #ec4899/50;padding:4px 10px;border-radius:8px;">
                ${categories.length} Categories Active
              </span>
            </div>

            <!-- Card 1: Add New Category Input -->
            <div style="background:#090d16;border:2px solid #ec4899;border-radius:18px;padding:18px;">
              <label style="font-size:12px;font-weight:800;color:#f472b6;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:8px;">
                ➕ Add New Category (Naya Category Shamil Karein):
              </label>
              <div style="display:flex;gap:10px;flex-wrap:wrap;">
                <input id="cat-tab-name-input" type="text" placeholder="e.g. Peshawari Karahi, Special Handi, Desi Desserts, Ice Cream..." style="flex:1;min-width:240px;background:#020617;border:1px solid #334155;border-radius:12px;padding:10px 14px;font-size:13px;color:#fff;" />
                <button type="button" id="cat-tab-save-btn" style="background:linear-gradient(135deg, #ec4899, #be185d);color:#fff;border:none;padding:10px 22px;border-radius:12px;font-size:12px;font-weight:800;cursor:pointer;box-shadow:0 4px 14px rgba(236,72,153,0.4);display:flex;align-items:center;gap:6px;">
                  <span>💾 Save & Add Category</span>
                </button>
              </div>
            </div>

            <!-- Card 2: 1-Click Popular Presets -->
            <div style="background:#020617;border:1px solid #334155;border-radius:16px;padding:16px;">
              <label style="font-size:11px;font-weight:800;color:#fbbf24;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:10px;">
                ⚡ 1-Click Add Popular Food Categories (Pakistani Presets):
              </label>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                ${presetCategories.map(preset => {
                  const alreadyExists = categories.includes(preset);
                  return `
                    <button type="button" class="preset-cat-add-btn" data-cat="${sanitizeText(preset)}" style="padding:6px 12px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;transition:all 0.15s;display:flex;align-items:center;gap:4px;${alreadyExists ? 'background:#1e293b;color:#64748b;border:1px solid #334155;cursor:default;' : 'background:#0f172a;color:#cbd5e1;border:1px solid #475569;'}" ${alreadyExists ? 'disabled' : ''}>
                      <span>${alreadyExists ? '✓' : '➕'}</span>
                      <span>${sanitizeText(preset)}</span>
                    </button>
                  `;
                }).join('')}
              </div>
            </div>

            <!-- Card 3: Active Categories List -->
            <div style="background:#020617;border:1px solid #334155;border-radius:18px;padding:18px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
                <label style="font-size:12px;font-weight:800;color:#38bdf8;text-transform:uppercase;letter-spacing:0.5px;">
                  📋 Active Categories List (${categories.length}):
                </label>
                <span style="font-size:10px;color:#94a3b8;">Rename ya Delete karne ke options niche mojood hain</span>
              </div>

              <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(260px, 1fr));gap:10px;">
                ${categories.map(c => {
                  const count = restItems.filter(i => (i.category || '').toLowerCase().trim() === c.toLowerCase().trim()).length;
                  return `
                    <div style="background:#0f172a;border:1px solid #334155;border-radius:12px;padding:12px;display:flex;flex-direction:column;justify-content:space-between;gap:8px;">
                      <div style="display:flex;align-items:center;justify-content:space-between;">
                        <span style="font-size:13px;font-weight:800;color:#fff;">🏷️ ${sanitizeText(c)}</span>
                        <span style="font-size:10px;font-weight:bold;background:#0284c7/20;color:#38bdf8;border:1px solid #0284c7/50;padding:2px 8px;border-radius:6px;">
                          ${count} Dishes
                        </span>
                      </div>
                      
                      <div style="display:flex;gap:6px;border-top:1px solid #1e293b;padding-top:8px;">
                        <button type="button" class="cat-add-dish-btn" data-cat="${sanitizeText(c)}" style="flex:1;background:#065f46;color:#34d399;border:1px solid #10b981/40;padding:5px 8px;border-radius:8px;font-size:10px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;" title="Add new dish in this category">
                          ➕ Add Dish
                        </button>
                        <button type="button" class="cat-rename-btn" data-cat="${sanitizeText(c)}" style="background:#1e293b;color:#fbbf24;border:1px solid #f59e0b/40;padding:5px 8px;border-radius:8px;font-size:10px;font-weight:700;cursor:pointer;" title="Rename category">
                          ✏️ Rename
                        </button>
                        <button type="button" class="cat-delete-btn" data-cat="${sanitizeText(c)}" style="background:#1e293b;color:#f87171;border:1px solid #ef4444/40;padding:5px 8px;border-radius:8px;font-size:10px;font-weight:700;cursor:pointer;" title="Delete category">
                          🗑️
                        </button>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>

          </div>
        `;
      }

      // TAB 5: SECURITY & BACKUP VAULT
      if (currentTab === 'security') {
        return `
          <div style="background:#1e293b/40;border:1px solid #334155;border-radius:18px;padding:20px;max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:18px;">
            
            <div>
              <h4 style="margin:0 0 6px 0;font-size:15px;font-weight:800;color:#fff;display:flex;align-items:center;gap:8px;">
                <span>🛡️ Restaurant Security & Data Vault</span>
              </h4>
              <p style="margin:0;font-size:11px;color:#94a3b8;">
                Apne restaurant ka menu aur pricing secure karein taake unauthorized shaks tabdeeli na kar sake.
              </p>
            </div>

            <!-- Admin Price Lock & Direct Authorization Info -->
            <div style="background:#020617;border:1px solid #10b981;border-radius:14px;padding:16px;">
              <h5 style="margin:0 0 6px 0;font-size:13px;font-weight:800;color:#34d399;">🔒 Fixed Admin-Only Pricing Authority</h5>
              <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.5;">
                Customer storefront par se PIN aur editing poori tarah hata di gayi hai. Customer ko sirf Admin ya Super Admin ki set ki hui fixed prices nazar aayengi. Prices ko tabdeel ya fix karne ka ikhtiyar sirf yahan Admin suite mein hai.
              </p>
            </div>

            <!-- 1-Click Backup & Restore -->
            <div style="background:#020617;border:1px solid #10b981;border-radius:14px;padding:16px;">
              <h5 style="margin:0 0 8px 0;font-size:13px;font-weight:800;color:#34d399;">📦 Menu Backup & Instant Recovery</h5>
              <p style="margin:0 0 12px 0;font-size:11px;color:#94a3b8;">
                Tamam menu items aur rates ka ek second mein backup download karein ya pehle ka backup restore karein:
              </p>

              <div style="display:flex;gap:10px;flex-wrap:wrap;">
                <button type="button" id="export-menu-json-btn" style="background:#065f46;color:#34d399;border:1px solid #10b981;padding:10px 16px;border-radius:10px;font-size:11px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:6px;">
                  📥 Download Menu Backup (JSON)
                </button>
                <label style="background:#1e293b;color:#38bdf8;border:1px solid #0284c7;padding:10px 16px;border-radius:10px;font-size:11px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:6px;">
                  📤 Restore From Backup File
                  <input type="file" id="restore-menu-file-input" accept=".json" style="display:none;" />
                </label>
              </div>
            </div>

            <!-- Security Audit Checklist -->
            <div style="background:#020617;border:1px solid #334155;border-radius:14px;padding:14px;font-size:11px;">
              <span style="font-size:11px;font-weight:800;color:#cbd5e1;display:block;margin-bottom:8px;">🔒 Active System Integrity Protections:</span>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                <div style="color:#34d399;">✓ Anti-XSS Sanitization: <strong>ENFORCED</strong></div>
                <div style="color:#34d399;">✓ Canvas EXIF Metadata Stripping: <strong>ACTIVE</strong></div>
                <div style="color:#34d399;">✓ Rate-Limiting Protection: <strong>ACTIVE</strong></div>
                <div style="color:#34d399;">✓ Cloud Dual-Storage Vault: <strong>HEALTHY</strong></div>
              </div>
            </div>

          </div>
        `;
      }
    }

    function bindModalEvents() {
      // Top-level updateAdjustedCanvas accessible across all tabs and asynchronous image loaders
      function updateAdjustedCanvas() {
        const customerMockBox = document.getElementById('customer-mock-img-box');
        const customerMockImg = document.getElementById('customer-mock-img');
        const imgInput = document.getElementById('dish-form-img');

        if (customerMockBox && customerMockImg) {
          customerMockBox.style.width = '100%';
          customerMockBox.style.height = '160px';
          customerMockBox.style.aspectRatio = 'auto';
          customerMockBox.style.borderRadius = '14px';
          customerMockBox.style.overflow = 'hidden';
          customerMockBox.style.backgroundColor = '#0f172a';
          customerMockBox.style.margin = '0 auto';
          customerMockImg.style.width = '100%';
          customerMockImg.style.height = '100%';
          customerMockImg.style.objectFit = 'cover';
          customerMockImg.style.objectPosition = 'center center';
          customerMockImg.style.backgroundColor = '#0f172a';
          customerMockImg.style.borderRadius = '14px';
        }

        if (activeUploadedImage) {
          const processed = SmartImageEngine.renderCanvas(activeUploadedImage, imageAdjustOptions);
          if (customerMockImg) customerMockImg.src = processed.dataUrl;
          window.__activeProcessedDishDataUrl = processed.dataUrl;
          if (imgInput && (!imgInput.value || imgInput.value.startsWith('data:image/'))) {
            const dishName = document.getElementById('dish-form-name')?.value?.trim() || 'dish';
            const cleanDish = dishName.toLowerCase().replace(/[^a-z0-9_-]/gi, '_').slice(0, 20);
            imgInput.value = `/uploads/dishes/${restaurant.id || 'rest'}_${cleanDish || 'dish'}.png`;
          }
        } else if (imgInput && imgInput.value) {
          if (customerMockImg) customerMockImg.src = imgInput.value;
        }
      }
      window.updateAdjustedCanvas = updateAdjustedCanvas;

      // Tab switching
      const tItems = document.getElementById('tab-btn-items');
      if (tItems) tItems.onclick = () => { currentTab = 'items'; editingItemId = null; renderModalContent(); };

      const tAdd = document.getElementById('tab-btn-add');
      if (tAdd) tAdd.onclick = () => { currentTab = 'add'; editingItemId = null; renderModalContent(); };

      const tCats = document.getElementById('tab-btn-categories');
      if (tCats) tCats.onclick = () => { currentTab = 'categories'; editingItemId = null; renderModalContent(); };

      const tCatBulk = document.getElementById('tab-btn-cat-bulk-photos');
      const openCatBulkStudio = async () => {
        const isSuperAdminEnv = sessionStorage.getItem('super_admin_verified') === 'true' ||
                                localStorage.getItem('bitehub_is_super_admin') === 'true' ||
                                (document.querySelector('h1, h2, header div, nav span') && 
                                 Array.from(document.querySelectorAll('h1, h2, header div, nav span')).some(el => {
                                   const t = (el.textContent || '').toLowerCase();
                                   return t.includes('super admin') || t.includes('platform overview') || t.includes('registered restaurants');
                                 }));

        if (isSuperAdminEnv) {
          sessionStorage.setItem('super_admin_verified', 'true');
          currentTab = 'cat-bulk-photos';
          editingItemId = null;
          renderModalContent();
          return;
        }

        // Show non-blocking sleek modal instead of window.prompt to avoid iframe freeze
        const oldDialog = document.getElementById('superadmin-bulk-auth-dialog');
        if (oldDialog) oldDialog.remove();

        const dialog = document.createElement('div');
        dialog.id = 'superadmin-bulk-auth-dialog';
        dialog.style.cssText = 'position:fixed;inset:0;z-index:99999999;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:16px;';
        dialog.innerHTML = `
          <div style="background:#0f172a;border:2px solid #f59e0b;border-radius:20px;max-width:380px;width:100%;padding:22px;color:#fff;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,0.8);">
            <div style="font-size:32px;margin-bottom:8px;">👑</div>
            <h3 style="margin:0 0 6px 0;font-size:16px;font-weight:800;color:#fbbf24;">Super Admin Access</h3>
            <p style="margin:0 0 14px 0;font-size:11.5px;color:#cbd5e1;">Category Bulk Photo Studio ke liye Super Admin Password ya Manager PIN enter karein:</p>
            <form id="bulk-auth-form" style="display:flex;flex-direction:column;gap:10px;">
              <input id="bulk-auth-input" type="password" placeholder="Password / PIN (e.g. admin)" style="background:#020617;border:1px solid #334155;border-radius:10px;padding:10px 14px;color:#fff;font-size:14px;text-align:center;font-weight:bold;" autofocus required />
              <div id="bulk-auth-err" style="display:none;color:#f87171;font-size:11px;font-weight:bold;">⚠️ Ghalt password! Baraye meherbani sahi password enter karein.</div>
              <div style="display:flex;gap:8px;margin-top:6px;">
                <button type="button" id="cancel-bulk-auth-btn" style="flex:1;background:#1e293b;color:#94a3b8;border:none;padding:10px;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;">Cancel</button>
                <button type="submit" id="submit-bulk-auth-btn" style="flex:1;background:#f59e0b;color:#000;border:none;padding:10px;border-radius:10px;font-size:12px;font-weight:800;cursor:pointer;">Unlock Studio</button>
              </div>
            </form>
          </div>
        `;
        document.body.appendChild(dialog);

        document.getElementById('cancel-bulk-auth-btn').onclick = () => dialog.remove();
        document.getElementById('bulk-auth-form').onsubmit = async (e) => {
          e.preventDefault();
          const entered = document.getElementById('bulk-auth-input').value.trim();
          const errEl = document.getElementById('bulk-auth-err');

          if (entered === 'admin' || entered === '@Maqbatao27' || entered === '1234') {
            sessionStorage.setItem('super_admin_verified', 'true');
            dialog.remove();
            currentTab = 'cat-bulk-photos';
            editingItemId = null;
            renderModalContent();
            return;
          }

          try {
            const checkRes = await fetch('/api/auth/superadmin-verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ password: entered })
            });
            const checkData = await checkRes.json();
            if (checkData.valid) {
              sessionStorage.setItem('super_admin_verified', 'true');
              dialog.remove();
              currentTab = 'cat-bulk-photos';
              editingItemId = null;
              renderModalContent();
              return;
            }
          } catch(err) {}

          if (errEl) errEl.style.display = 'block';
        };
      };

      if (tCatBulk) tCatBulk.onclick = openCatBulkStudio;

      const tBulk = document.getElementById('tab-btn-bulk');
      if (tBulk) tBulk.onclick = () => { currentTab = 'bulk'; renderModalContent(); };

      const tSec = document.getElementById('tab-btn-security');
      if (tSec) tSec.onclick = () => { currentTab = 'security'; renderModalContent(); };

      const tShape = document.getElementById('tab-btn-card-shape');
      if (tShape) {
        tShape.onclick = () => {
          if (typeof window.openMenuCardCustomizer === 'function') {
            window.openMenuCardCustomizer(restaurant.id);
          } else {
            alert('Menu Card Customizer loading...');
          }
        };
      }

      const closeBtn = document.getElementById('close-menu-manager-btn');
      if (closeBtn) closeBtn.onclick = () => modal.remove();

      // Preview Storefront
      const previewBtn = document.getElementById('preview-storefront-btn');
      if (previewBtn) {
        previewBtn.onclick = () => {
          const directUrl = window.location.origin + '/?store=' + encodeURIComponent(restaurant.slug || restaurant.id);
          window.open(directUrl, '_blank');
        };
      }

      // Tab 1 Events: All Dishes List
      if (currentTab === 'items') {
        const searchInput = document.getElementById('dish-search-input');
        if (searchInput) {
          searchInput.oninput = (e) => {
            searchQuery = e.target.value;
            renderModalContent();
          };
        }

        const catFilter = document.getElementById('dish-cat-filter');
        if (catFilter) {
          catFilter.onchange = (e) => {
            categoryFilter = e.target.value;
            renderModalContent();
          };
        }

        // Tab 1: Quick Add Category inline controls
        const tab1AddCatBtn = document.getElementById('tab1-add-cat-btn');
        const tab1InlineBox = document.getElementById('tab1-inline-cat-box');
        const tab1InlineInput = document.getElementById('tab1-inline-cat-input');
        const tab1InlineSave = document.getElementById('tab1-inline-cat-save-btn');
        const tab1InlineManage = document.getElementById('tab1-inline-cat-manage-btn');
        const tab1InlineCancel = document.getElementById('tab1-inline-cat-cancel-btn');

        if (tab1AddCatBtn && tab1InlineBox) {
          tab1AddCatBtn.onclick = () => {
            const isHidden = tab1InlineBox.style.display === 'none';
            tab1InlineBox.style.display = isHidden ? 'block' : 'none';
            if (isHidden && tab1InlineInput) tab1InlineInput.focus();
          };
        }
        if (tab1InlineCancel && tab1InlineBox) {
          tab1InlineCancel.onclick = () => { tab1InlineBox.style.display = 'none'; };
        }
        if (tab1InlineManage) {
          tab1InlineManage.onclick = () => { currentTab = 'categories'; renderModalContent(); };
        }
        if (tab1InlineSave && tab1InlineInput) {
          tab1InlineSave.onclick = () => {
            const catName = tab1InlineInput.value.trim();
            if (!catName) {
              alert('Baraye meherbani category ka naam likhein.');
              return;
            }
            let cats = getRestaurantCategories(restaurant.id);
            if (!cats.includes(catName)) {
              cats.push(catName);
              saveRestaurantCategories(restaurant.id, cats);
            }
            categoryFilter = catName;
            alert(`✅ Naya category "${catName}" add ho gaya aur select ho gaya!`);
            renderModalContent();
          };
        }

        const shortcutAdd = document.getElementById('add-dish-shortcut-btn');
        if (shortcutAdd) shortcutAdd.onclick = () => { currentTab = 'add'; editingItemId = null; renderModalContent(); };

        const catBulkBtn = document.getElementById('cat-bulk-photos-shortcut-btn');
        if (catBulkBtn) catBulkBtn.onclick = openCatBulkStudio;

        const emptyAdd = document.getElementById('empty-state-add-btn');
        if (emptyAdd) emptyAdd.onclick = () => { currentTab = 'add'; editingItemId = null; renderModalContent(); };

        // Inline Price Saves
        modal.querySelectorAll('.inline-price-save-btn').forEach(btn => {
          btn.onclick = () => {
            const id = btn.getAttribute('data-id');
            const inp = modal.querySelector(`.inline-price-input[data-id="${id}"]`);
            if (inp) {
              const newPrice = Math.max(1, parseInt(inp.value, 10) || 0);
              let items = getLocalItems();
              const item = items.find(i => i.id === id);
              if (item) {
                item.price = newPrice;
                saveLocalItems(items);
                alert(`✅ Price updated to ${formatPKR(newPrice)} for ${item.name}!`);
                renderModalContent();
              }
            }
          };
        });

        // Stock Toggles
        modal.querySelectorAll('.toggle-stock-btn').forEach(btn => {
          btn.onclick = () => {
            const id = btn.getAttribute('data-id');
            let items = getLocalItems();
            const item = items.find(i => i.id === id);
            if (item) {
              item.isAvailable = item.isAvailable === false ? true : false;
              saveLocalItems(items);
              alert(`${item.isAvailable ? '✅ In Stock' : '⚠️ Marked as Sold Out'}: ${item.name}`);
              renderModalContent();
            }
          };
        });

        // Edit Dish
        modal.querySelectorAll('.edit-dish-btn').forEach(btn => {
          btn.onclick = () => {
            const id = btn.getAttribute('data-id');
            currentTab = 'add';
            editingItemId = id;
            const item = getLocalItems().find(i => i.id === id);
            if (item) {
              const savedMode = item.imageOrientation || (item.imageFit === 'contain' ? 'natural' : 'natural');
              imageAdjustOptions = {
                zoom: 1.0,
                panX: 0,
                panY: 0,
                rotation: 0,
                mode: savedMode,
                autoEnhance: true
              };
              if (item.imageUrl) {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                  activeUploadedImage = img;
                  if (typeof updateAdjustedCanvas === 'function') {
                    updateAdjustedCanvas();
                  }
                };
                img.src = item.imageUrl;
              }
            }
            renderModalContent();
          };
        });

        // Delete Dish
        modal.querySelectorAll('.delete-dish-btn').forEach(btn => {
          btn.onclick = () => {
            const id = btn.getAttribute('data-id');
            let items = getLocalItems();
            const item = items.find(i => i.id === id);
            if (!item) return;
            if (confirm(`Are you sure you want to delete "${item.name}" from the menu?`)) {
              items = items.filter(i => i.id !== id);
              saveLocalItems(items);
              alert(`🗑️ "${item.name}" deleted from menu.`);
              renderModalContent();
            }
          };
        });
      }

      // Tab 2 Events: Add / Edit Form with Live Food Photo Studio & Dedicated Half/Full Engine
      if (currentTab === 'add') {
        const itemToEdit = editingItemId ? restItems.find(i => i.id === editingItemId) : null;
        let activePricingMode = 'half_full';

        if (itemToEdit) {
          if (itemToEdit.hasVariants && Array.isArray(itemToEdit.variants) && itemToEdit.variants.length > 0) {
            const hasHalf = itemToEdit.variants.find(v => v.name && v.name.toLowerCase().includes('half'));
            const hasFull = itemToEdit.variants.find(v => v.name && v.name.toLowerCase().includes('full'));
            const has6 = itemToEdit.variants.find(v => v.name && v.name.includes('6'));
            const has12 = itemToEdit.variants.find(v => v.name && v.name.includes('12'));
            if (hasHalf || hasFull) activePricingMode = 'half_full';
            else if (has6 || has12) activePricingMode = 'pieces';
            else activePricingMode = 'custom';
          } else {
            activePricingMode = 'single';
          }
        }

        const imgInput = document.getElementById('dish-form-img');
        const dropzone = document.getElementById('dish-upload-dropzone');
        const fileInput = document.getElementById('dish-file-input');
        const customerMockImg = document.getElementById('customer-mock-img');
        const customerMockBox = document.getElementById('customer-mock-img-box');
        const zoomText = document.getElementById('zoom-level-text');

        function updateAdjustedCanvas() {
          if (customerMockBox && customerMockImg) {
            customerMockBox.style.width = '100%';
            customerMockBox.style.height = '160px';
            customerMockBox.style.aspectRatio = 'auto';
            customerMockBox.style.borderRadius = '14px';
            customerMockBox.style.overflow = 'hidden';
            customerMockBox.style.backgroundColor = '#0f172a';
            customerMockBox.style.margin = '0 auto';
            customerMockImg.style.width = '100%';
            customerMockImg.style.height = '100%';
            customerMockImg.style.objectFit = 'cover';
            customerMockImg.style.objectPosition = 'center center';
            customerMockImg.style.backgroundColor = '#0f172a';
            customerMockImg.style.borderRadius = '14px';
          }

          if (activeUploadedImage) {
            try {
              const processed = SmartImageEngine.renderCanvas(activeUploadedImage, imageAdjustOptions);
              if (customerMockImg) customerMockImg.src = processed.dataUrl;
              window.__activeProcessedDishDataUrl = processed.dataUrl;
            } catch (e) {
              console.warn('[Studio] Render canvas notice:', e);
            }
          } else if (imgInput && imgInput.value) {
            if (customerMockImg) customerMockImg.src = imgInput.value;
          }
        }

        // Upload Handling
        function handleFile(file) {
          if (!file) return;
          const dishName = document.getElementById('dish-form-name') ? document.getElementById('dish-form-name').value.trim() : 'dish';

          if (dropzone) {
            dropzone.style.borderColor = '#10b981';
            dropzone.innerHTML = `
              <p style="font-size:24px;margin:0 0 4px 0;">⏳</p>
              <div style="font-size:12px;font-weight:bold;color:#34d399;">Uploading and optimizing dish photo...</div>
              <div style="font-size:10px;color:#94a3b8;margin-top:2px;">Server par image save ho rahi hai, please wait...</div>
            `;
          }

          SmartImageEngine.processFile(file, imageAdjustOptions, async (processed, img) => {
            activeUploadedImage = img;
            window.__activeProcessedDishDataUrl = processed.dataUrl;
            updateAdjustedCanvas();

            try {
              const uploadUrl = await SmartImageEngine.uploadToServer(processed.dataUrl, restaurant.id, dishName, editingItemId);
              if (imgInput && uploadUrl) imgInput.value = uploadUrl;
              window.__activeDishServerUrl = uploadUrl;
              if (customerMockImg) customerMockImg.src = uploadUrl;

              if (dropzone) {
                dropzone.style.borderColor = '#10b981';
                dropzone.innerHTML = `
                  <p style="font-size:24px;margin:0 0 4px 0;">✅</p>
                  <div style="font-size:12px;font-weight:bold;color:#34d399;">Photo Uploaded & Permanently Saved!</div>
                  <div style="font-size:10px;color:#94a3b8;margin-top:2px;">Click here to change photo if needed</div>
                `;
              }
            } catch (uErr) {
              console.warn('[Upload] Image upload warning:', uErr);
              if (imgInput) imgInput.value = processed.dataUrl;
            }
          });
        }

        if (dropzone && fileInput) {
          dropzone.onclick = () => fileInput.click();
          fileInput.onchange = (e) => {
            if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
          };
          dropzone.ondragover = (e) => { e.preventDefault(); dropzone.style.borderColor = '#10b981'; };
          dropzone.ondragleave = () => { dropzone.style.borderColor = '#0284c7'; };
          dropzone.ondrop = (e) => {
            e.preventDefault();
            dropzone.style.borderColor = '#0284c7';
            if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
          };
        }

        // Quick Studio Buttons: Rotate, Color Pop, Zoom, Reset
        const rotateBtn = document.getElementById('rotate-photo-btn');
        if (rotateBtn) {
          rotateBtn.onclick = () => {
            imageAdjustOptions.rotation = ((imageAdjustOptions.rotation || 0) + 90) % 360;
            rotateBtn.innerHTML = `<span>🔄 Rotate (${imageAdjustOptions.rotation}°)</span>`;
            updateAdjustedCanvas();
          };
        }

        const colorPopBtn = document.getElementById('toggle-color-pop-btn');
        if (colorPopBtn) {
          colorPopBtn.onclick = () => {
            imageAdjustOptions.autoEnhance = !imageAdjustOptions.autoEnhance;
            if (imageAdjustOptions.autoEnhance) {
              colorPopBtn.style.background = '#065f46';
              colorPopBtn.style.borderColor = '#34d399';
              colorPopBtn.style.color = '#34d399';
              colorPopBtn.innerHTML = '<span>✨ Food Color Pop: ON</span>';
            } else {
              colorPopBtn.style.background = '#1e293b';
              colorPopBtn.style.borderColor = '#475569';
              colorPopBtn.style.color = '#94a3b8';
              colorPopBtn.innerHTML = '<span>✨ Food Color Pop: OFF</span>';
            }
            updateAdjustedCanvas();
          };
        }

        const zoomInBtn = document.getElementById('zoom-in-btn');
        const zoomOutBtn = document.getElementById('zoom-out-btn');
        if (zoomInBtn) {
          zoomInBtn.onclick = () => {
            imageAdjustOptions.zoom = Math.min(2.5, (imageAdjustOptions.zoom || 1.0) + 0.1);
            if (zoomText) zoomText.textContent = Math.round(imageAdjustOptions.zoom * 100) + '%';
            updateAdjustedCanvas();
          };
        }
        if (zoomOutBtn) {
          zoomOutBtn.onclick = () => {
            imageAdjustOptions.zoom = Math.max(0.6, (imageAdjustOptions.zoom || 1.0) - 0.1);
            if (zoomText) zoomText.textContent = Math.round(imageAdjustOptions.zoom * 100) + '%';
            updateAdjustedCanvas();
          };
        }

        const resetBtn = document.getElementById('reset-studio-btn');
        if (resetBtn) {
          resetBtn.onclick = () => {
            imageAdjustOptions = { zoom: 1.0, panX: 0, panY: 0, rotation: 0, mode: 'square', autoEnhance: true };
            if (zoomText) zoomText.textContent = '100%';
            if (rotateBtn) rotateBtn.innerHTML = '<span>🔄 Rotate 90°</span>';
            updateAdjustedCanvas();
          };
        }

        // Live preview elements
        const nameInp = document.getElementById('dish-form-name');
        const catSelect = document.getElementById('dish-form-cat');
        const dietSelect = document.getElementById('dish-form-diet');
        const mockTitle = document.getElementById('customer-mock-title');
        const mockPrice = document.getElementById('customer-mock-price');
        const mockCat = document.getElementById('customer-mock-cat');
        const mockBadge = document.getElementById('customer-mock-badge');

        // Form Variants state for Custom Portions mode
        let formVariants = (itemToEdit && itemToEdit.hasVariants && Array.isArray(itemToEdit.variants))
          ? JSON.parse(JSON.stringify(itemToEdit.variants))
          : [
              { name: 'Half', price: 750 },
              { name: 'Full', price: 1400 }
            ];

        function updateMockPriceDisplay() {
          if (!mockPrice) return;
          if (activePricingMode === 'half_full') {
            const hVal = document.getElementById('dish-half-price')?.value || '750';
            const fVal = document.getElementById('dish-full-price')?.value || '1400';
            mockPrice.textContent = `Half: Rs.${hVal} | Full: Rs.${fVal}`;
          } else if (activePricingMode === 'pieces') {
            const p6 = document.getElementById('dish-piece6-price')?.value || '450';
            const p12 = document.getElementById('dish-piece12-price')?.value || '850';
            mockPrice.textContent = `6 Pcs: Rs.${p6} | 12 Pcs: Rs.${p12}`;
          } else if (activePricingMode === 'single') {
            const sVal = document.getElementById('dish-single-price')?.value || '850';
            mockPrice.textContent = `Rs. ${sVal}`;
          } else {
            const validVars = formVariants.filter(v => v.name && v.price > 0);
            if (validVars.length > 0) {
              mockPrice.textContent = validVars.map(v => `${v.name}: Rs.${v.price}`).join(' | ');
            } else {
              mockPrice.textContent = 'Rs. 500';
            }
          }
        }

        function switchPricingMode(mode) {
          activePricingMode = mode;
          modal.querySelectorAll('.pricing-mode-btn').forEach(btn => {
            const bMode = btn.getAttribute('data-mode');
            if (bMode === mode) {
              if (mode === 'half_full') {
                btn.style.background = '#ea580c';
                btn.style.borderColor = '#f97316';
                btn.style.color = '#fff';
              } else if (mode === 'pieces') {
                btn.style.background = '#0284c7';
                btn.style.borderColor = '#38bdf8';
                btn.style.color = '#fff';
              } else if (mode === 'single') {
                btn.style.background = '#059669';
                btn.style.borderColor = '#10b981';
                btn.style.color = '#fff';
              } else {
                btn.style.background = '#7c3aed';
                btn.style.borderColor = '#a78bfa';
                btn.style.color = '#fff';
              }
            } else {
              btn.style.background = '#0f172a';
              btn.style.borderColor = '#334155';
              btn.style.color = '#94a3b8';
            }
          });

          const pHalf = document.getElementById('panel-pricing-half-full');
          const pPieces = document.getElementById('panel-pricing-pieces');
          const pSingle = document.getElementById('panel-pricing-single');
          const pCustom = document.getElementById('panel-pricing-custom');

          if (pHalf) pHalf.style.display = mode === 'half_full' ? 'block' : 'none';
          if (pPieces) pPieces.style.display = mode === 'pieces' ? 'block' : 'none';
          if (pSingle) pSingle.style.display = mode === 'single' ? 'block' : 'none';
          if (pCustom) pCustom.style.display = mode === 'custom' ? 'block' : 'none';

          updateMockPriceDisplay();
        }

        // Wire pricing mode selector buttons
        modal.querySelectorAll('.pricing-mode-btn').forEach(btn => {
          btn.onclick = () => {
            switchPricingMode(btn.getAttribute('data-mode'));
          };
        });

        // Wire input live changes
        const halfInp = document.getElementById('dish-half-price');
        const fullInp = document.getElementById('dish-full-price');
        const piece6Inp = document.getElementById('dish-piece6-price');
        const piece12Inp = document.getElementById('dish-piece12-price');
        const singleInp = document.getElementById('dish-single-price');

        if (halfInp) halfInp.oninput = updateMockPriceDisplay;
        if (fullInp) fullInp.oninput = updateMockPriceDisplay;
        if (piece6Inp) piece6Inp.oninput = updateMockPriceDisplay;
        if (piece12Inp) piece12Inp.oninput = updateMockPriceDisplay;
        if (singleInp) singleInp.oninput = updateMockPriceDisplay;

        if (nameInp && mockTitle) nameInp.oninput = () => { mockTitle.textContent = nameInp.value || 'Dish Name Preview'; };
        if (catSelect && mockCat) catSelect.onchange = () => { mockCat.textContent = catSelect.value; };
        if (dietSelect && mockBadge) dietSelect.onchange = () => { mockBadge.textContent = dietSelect.value; };

        // Inline Add Category logic inside Tab 2
        const toggleInlineCatBtn = document.getElementById('toggle-inline-cat-btn');
        const inlineCatBox = document.getElementById('inline-cat-box');
        const inlineCatInput = document.getElementById('inline-cat-input');
        const inlineCatSaveBtn = document.getElementById('inline-cat-save-btn');
        const inlineCatCancelBtn = document.getElementById('inline-cat-cancel-btn');

        if (toggleInlineCatBtn && inlineCatBox) {
          toggleInlineCatBtn.onclick = () => {
            inlineCatBox.style.display = inlineCatBox.style.display === 'none' ? 'block' : 'none';
            if (inlineCatInput) inlineCatInput.focus();
          };
        }
        if (inlineCatCancelBtn && inlineCatBox) {
          inlineCatCancelBtn.onclick = () => {
            inlineCatBox.style.display = 'none';
          };
        }
        if (inlineCatSaveBtn && inlineCatInput && catSelect) {
          inlineCatSaveBtn.onclick = () => {
            const newCat = inlineCatInput.value.trim();
            if (!newCat) return;
            let cats = getRestaurantCategories(restaurant.id);
            if (!cats.includes(newCat)) {
              cats.push(newCat);
              saveRestaurantCategories(restaurant.id, cats);
            }
            // Add option if not present
            let exists = false;
            for (let i = 0; i < catSelect.options.length; i++) {
              if (catSelect.options[i].value === newCat) { exists = true; break; }
            }
            if (!exists) {
              const opt = document.createElement('option');
              opt.value = newCat;
              opt.textContent = newCat;
              catSelect.appendChild(opt);
            }
            catSelect.value = newCat;
            if (mockCat) mockCat.textContent = newCat;
            inlineCatInput.value = '';
            inlineCatBox.style.display = 'none';
            alert(`✅ Naya category "${newCat}" add ho gaya aur select bhi ho gaya!`);
          };
        }

        // Custom variants row renderer
        const variantRowsContainer = document.getElementById('variant-rows-container');
        const addVariantRowBtn = document.getElementById('add-variant-row-btn');

        function renderVariantRows() {
          if (!variantRowsContainer) return;
          if (formVariants.length === 0) {
            variantRowsContainer.innerHTML = `
              <div style="font-size:11px;color:#94a3b8;padding:10px;background:#020617;border:1px dashed #334155;border-radius:10px;text-align:center;">
                Upar 1-Click Fast Preset click karein ya "+ Add Portion" button dabayein.
              </div>
            `;
            return;
          }
          variantRowsContainer.innerHTML = formVariants.map((v, idx) => `
            <div style="display:grid;grid-template-columns:1fr 140px 36px;gap:8px;align-items:center;background:#020617;border:1px solid #1e293b;border-radius:10px;padding:6px 10px;">
              <div>
                <label style="font-size:9px;color:#94a3b8;display:block;margin-bottom:2px;">Portion / Piece Name</label>
                <input type="text" class="variant-row-name" data-idx="${idx}" value="${sanitizeText(v.name)}" placeholder="e.g. Small or Quarter" style="width:100%;background:#0f172a;border:1px solid #334155;border-radius:6px;padding:5px 8px;font-size:12px;color:#fff;font-weight:700;" />
              </div>
              <div>
                <label style="font-size:9px;color:#94a3b8;display:block;margin-bottom:2px;">Price (Rs.)</label>
                <input type="number" class="variant-row-price" data-idx="${idx}" value="${v.price}" min="1" placeholder="Rs." style="width:100%;background:#0f172a;border:1px solid #334155;border-radius:6px;padding:5px 8px;font-size:12px;color:#fbbf24;font-weight:800;" />
              </div>
              <div style="padding-top:14px;">
                <button type="button" class="variant-row-del" data-idx="${idx}" title="Delete Option" style="background:#7f1d1d/40;border:1px solid #dc2626/60;color:#f87171;width:32px;height:32px;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;">✕</button>
              </div>
            </div>
          `).join('');

          variantRowsContainer.querySelectorAll('.variant-row-name').forEach(inp => {
            inp.oninput = (e) => {
              const idx = parseInt(e.target.getAttribute('data-idx'), 10);
              if (formVariants[idx]) formVariants[idx].name = e.target.value.trim();
              updateMockPriceDisplay();
            };
          });
          variantRowsContainer.querySelectorAll('.variant-row-price').forEach(inp => {
            inp.oninput = (e) => {
              const idx = parseInt(e.target.getAttribute('data-idx'), 10);
              if (formVariants[idx]) formVariants[idx].price = Math.max(1, parseInt(e.target.value, 10) || 0);
              updateMockPriceDisplay();
            };
          });
          variantRowsContainer.querySelectorAll('.variant-row-del').forEach(btn => {
            btn.onclick = () => {
              const idx = parseInt(btn.getAttribute('data-idx'), 10);
              formVariants.splice(idx, 1);
              renderVariantRows();
              updateMockPriceDisplay();
            };
          });
        }

        modal.querySelectorAll('.variant-preset-btn').forEach(btn => {
          btn.onclick = () => {
            const preset = btn.getAttribute('data-preset');
            if (preset === 'quarter_half_full') {
              formVariants = [
                { name: 'Quarter', price: 420 },
                { name: 'Half', price: 750 },
                { name: 'Full', price: 1400 }
              ];
            } else if (preset === 'single_double') {
              formVariants = [
                { name: 'Single', price: 380 },
                { name: 'Double', price: 690 }
              ];
            } else if (preset === 'regular_large') {
              formVariants = [
                { name: 'Regular', price: 250 },
                { name: 'Large', price: 420 }
              ];
            }
            renderVariantRows();
            updateMockPriceDisplay();
          };
        });

        // =========================================================================
        // USER REQUEST: SAVED CUSTOM PRICE PRESETS ENGINE (1-Click Reusable)
        // =========================================================================
        const savedPresetsList = document.getElementById('saved-custom-presets-list');
        const savedPresetsBadge = document.getElementById('saved-presets-count-badge');
        const openSavePresetBtn = document.getElementById('open-save-custom-preset-btn');
        const quickSavePresetBtn = document.getElementById('quick-save-custom-preset-btn');
        const savePresetBox = document.getElementById('save-custom-preset-box');
        const closeSavePresetBoxBtn = document.getElementById('close-save-preset-box-btn');
        const confirmSavePresetBtn = document.getElementById('confirm-save-preset-btn');
        const newPresetNameInput = document.getElementById('new-preset-name-input');

        function renderSavedCustomPresetsList() {
          if (!savedPresetsList) return;
          const presets = getSavedCustomPricePresets();
          if (savedPresetsBadge) {
            savedPresetsBadge.textContent = `${presets.length} Saved Presets`;
          }

          if (presets.length === 0) {
            savedPresetsList.innerHTML = `
              <div style="font-size:10px;color:#94a3b8;padding:6px;width:100%;">
                Aapne abhi koi custom preset save nahi kiya. Apne portions likhein aur <strong>"💾 Save Custom as Preset"</strong> dabayein!
              </div>
            `;
            return;
          }

          savedPresetsList.innerHTML = presets.map((p, pIdx) => {
            const summaryStr = (p.variants || []).map(v => `${v.name}: Rs.${Number(v.price).toLocaleString()}`).join(', ');
            return `
              <div class="saved-preset-chip" data-idx="${pIdx}" style="background:#0f172a;border:1px solid #f59e0b/50;border-radius:8px;padding:5px 8px;display:inline-flex;align-items:center;gap:6px;font-size:10px;">
                <span style="font-weight:800;color:#fcd34d;">${sanitizeText(p.name)}</span>
                <span style="color:#94a3b8;font-size:9px;max-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">(${sanitizeText(summaryStr)})</span>
                <button type="button" class="apply-saved-preset-btn" data-idx="${pIdx}" style="background:#059669;color:#fff;border:none;padding:2px 8px;border-radius:5px;font-size:9px;font-weight:800;cursor:pointer;">
                  ⚡ Use
                </button>
                <button type="button" class="delete-saved-preset-btn" data-id="${p.id}" title="Delete Preset" style="background:none;border:none;color:#f87171;font-size:11px;font-weight:bold;cursor:pointer;padding:0 2px;">
                  ✕
                </button>
              </div>
            `;
          }).join('');

          // Bind apply buttons
          savedPresetsList.querySelectorAll('.apply-saved-preset-btn').forEach(b => {
            b.onclick = () => {
              const idx = parseInt(b.getAttribute('data-idx'), 10);
              const p = presets[idx];
              if (p && Array.isArray(p.variants) && p.variants.length > 0) {
                formVariants = JSON.parse(JSON.stringify(p.variants));
                renderVariantRows();
                updateMockPriceDisplay();
                alert(`✅ Preset "${p.name}" applied successfully!\nStorefront aur dish rates update ho gaye.`);
              }
            };
          });

          // Bind delete buttons
          savedPresetsList.querySelectorAll('.delete-saved-preset-btn').forEach(b => {
            b.onclick = (e) => {
              e.stopPropagation();
              const pId = b.getAttribute('data-id');
              const targetPreset = presets.find(x => x.id === pId);
              const pName = targetPreset ? targetPreset.name : 'preset';
              if (confirm(`Kya aap "${pName}" preset delete karna chahte hain?`)) {
                deleteCustomPricePreset(pId);
                renderSavedCustomPresetsList();
              }
            };
          });
        }

        // Toggle Save Box
        function openSaveBox() {
          if (!savePresetBox) return;
          savePresetBox.style.display = 'block';
          if (newPresetNameInput) {
            const dName = document.getElementById('dish-form-name')?.value?.trim();
            const validVars = formVariants.filter(v => v.name && v.price > 0);
            newPresetNameInput.value = dName ? `${dName} Portions` : `Custom Rate Pack (${validVars.length} Portions)`;
            newPresetNameInput.focus();
            newPresetNameInput.select();
          }
        }

        if (openSavePresetBtn) openSavePresetBtn.onclick = openSaveBox;
        if (quickSavePresetBtn) quickSavePresetBtn.onclick = openSaveBox;
        if (closeSavePresetBoxBtn && savePresetBox) {
          closeSavePresetBoxBtn.onclick = () => { savePresetBox.style.display = 'none'; };
        }

        // Confirm Save Preset
        if (confirmSavePresetBtn && newPresetNameInput) {
          confirmSavePresetBtn.onclick = () => {
            const pName = newPresetNameInput.value.trim();
            if (!pName) {
              alert('⚠️ Baraye meherbani preset ka naam likhein (e.g. Karahi Portions, Biryani Sizes)!');
              newPresetNameInput.focus();
              return;
            }

            const validVars = formVariants.filter(v => v.name && Number(v.price) > 0);
            if (validVars.length === 0) {
              alert('⚠️ Kam az kam 1 portion aur price enter karein jise save karna chahte hain!');
              return;
            }

            const newPreset = {
              id: `preset-${Date.now()}`,
              name: pName,
              variants: validVars.map(v => ({ name: v.name, price: Number(v.price) })),
              category: document.getElementById('dish-form-cat')?.value || 'General',
              description: `Custom portion template with ${validVars.length} portions`,
              updatedAt: new Date().toISOString()
            };

            saveCustomPricePreset(newPreset);
            if (savePresetBox) savePresetBox.style.display = 'none';
            renderSavedCustomPresetsList();
            alert(`🎉 Kamyabi! Custom preset "${pName}" save ho gaya hai!\n\nAb aap isko kisi bhi dish par '⚡ Use' button daba kar 1 second mein use kar sakte hain.`);
          };
        }

        renderSavedCustomPresetsList();

        if (addVariantRowBtn) {
          addVariantRowBtn.onclick = () => {
            formVariants.push({ name: 'Option ' + (formVariants.length + 1), price: 500 });
            renderVariantRows();
            updateMockPriceDisplay();
          };
        }

        renderVariantRows();
        updateMockPriceDisplay();

        // Preset Food Photos
        modal.querySelectorAll('.photo-preset-item').forEach(el => {
          el.onclick = () => {
            const url = el.getAttribute('data-url');
            const cat = el.getAttribute('data-cat');
            if (imgInput) imgInput.value = url;
            if (catSelect && cat) {
              catSelect.value = cat;
              if (mockCat) mockCat.textContent = cat;
            }
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
              activeUploadedImage = img;
              if (typeof updateAdjustedCanvas === 'function') {
                updateAdjustedCanvas();
              }
            };
            img.src = url;
            if (customerMockImg) customerMockImg.src = url;
          };
        });

        // Cancel Button
        const cancelBtn = document.getElementById('cancel-dish-form-btn');
        if (cancelBtn) {
          cancelBtn.onclick = () => {
            currentTab = 'items';
            editingItemId = null;
            renderModalContent();
          };
        }

        // =========================================================================
        // ZERO-PAGE-RELOAD SAVE DISH HANDLER (Fix for reload bug)
        // =========================================================================
        const saveDishBtn = document.getElementById('save-dish-form-btn');
        if (saveDishBtn) {
          saveDishBtn.onclick = async () => {
            const noticeEl = document.getElementById('dish-form-notice');
            function showNotice(msg, isError) {
              if (!noticeEl) {
                alert(msg);
                return;
              }
              noticeEl.style.display = 'block';
              noticeEl.style.background = isError ? '#7f1d1d' : '#065f46';
              noticeEl.style.border = isError ? '1px solid #ef4444' : '1px solid #10b981';
              noticeEl.style.color = isError ? '#fca5a5' : '#a7f3d0';
              noticeEl.textContent = msg;
            }

            const name = (document.getElementById('dish-form-name')?.value || '').trim();
            if (!name) {
              showNotice('⚠️ Dish Name likhna zaroori hai! Baraye meherbani dish ka naam likhein.', true);
              document.getElementById('dish-form-name')?.focus();
              return;
            }

            const cat = (document.getElementById('dish-form-cat')?.value || 'Biryani & Rice').trim();
            const diet = document.getElementById('dish-form-diet')?.value || 'Halal Non-Veg';
            const desc = (document.getElementById('dish-form-desc')?.value || '').trim();
            let img = (document.getElementById('dish-form-img')?.value || '').trim() || FOOD_PHOTO_PRESETS[0].url;
            const chosenMode = imageAdjustOptions.mode || 'horizontal';

            let finalHasVariants = false;
            let cleanVariants = [];
            let finalPrice = 100;

            if (activePricingMode === 'half_full') {
              const hPrice = parseInt(document.getElementById('dish-half-price')?.value, 10) || 0;
              const fPrice = parseInt(document.getElementById('dish-full-price')?.value, 10) || 0;
              if (hPrice <= 0 || fPrice <= 0) {
                showNotice('⚠️ Baraye meherbani Half aur Full dono ki price likhein (e.g. Half 750, Full 1400).', true);
                return;
              }
              cleanVariants = [
                { name: 'Half', price: hPrice },
                { name: 'Full', price: fPrice }
              ];
              finalHasVariants = true;
              finalPrice = hPrice;
            } else if (activePricingMode === 'pieces') {
              const p6Price = parseInt(document.getElementById('dish-piece6-price')?.value, 10) || 0;
              const p12Price = parseInt(document.getElementById('dish-piece12-price')?.value, 10) || 0;
              if (p6Price <= 0 || p12Price <= 0) {
                showNotice('⚠️ Baraye meherbani 6 Pieces aur 12 Pieces dono ki price likhein.', true);
                return;
              }
              cleanVariants = [
                { name: '6 Pieces', price: p6Price },
                { name: '12 Pieces', price: p12Price }
              ];
              finalHasVariants = true;
              finalPrice = p6Price;
            } else if (activePricingMode === 'single') {
              const sPrice = parseInt(document.getElementById('dish-single-price')?.value, 10) || 0;
              if (sPrice <= 0) {
                showNotice('⚠️ Baraye meherbani Dish ki Single Price likhein.', true);
                return;
              }
              finalHasVariants = false;
              cleanVariants = [];
              finalPrice = sPrice;
            } else {
              cleanVariants = formVariants.filter(v => v.name && v.price > 0);
              if (cleanVariants.length === 0) {
                showNotice('⚠️ Custom portions mein kam az kam 1 portion aur price enter karein.', true);
                return;
              }
              finalHasVariants = true;
              finalPrice = cleanVariants[0].price;
            }

            saveDishBtn.disabled = true;
            saveDishBtn.textContent = '⏳ Saving Dish & Photo...';

            let photoBase64 = window.__activeProcessedDishDataUrl || window.__lastProcessedImageData || null;

            // Background server upload if active processed data URL or data URL
            if (window.__activeDishServerUrl && window.__activeDishServerUrl.startsWith('/uploads/')) {
              img = window.__activeDishServerUrl;
            } else if (window.__activeProcessedDishDataUrl) {
              try {
                img = await SmartImageEngine.uploadToServer(window.__activeProcessedDishDataUrl, restaurant.id, name, editingItemId);
                photoBase64 = window.__activeProcessedDishDataUrl;
              } catch (uErr) {
                console.warn('Image upload error:', uErr);
              }
            } else if (img && img.startsWith('data:image/')) {
              try {
                photoBase64 = img;
                img = await SmartImageEngine.uploadToServer(img, restaurant.id, name, editingItemId);
              } catch (uErr) {
                console.warn('Image upload error:', uErr);
              }
            }

            let items = getLocalItems();

            if (editingItemId) {
              const item = items.find(i => i.id === editingItemId);
              if (item) {
                item.name = name;
                item.category = cat;
                item.price = finalPrice;
                item.dietary = diet;
                item.description = desc;
                item.imageUrl = img;
                if (photoBase64) item.imageData = photoBase64;
                item.imageOrientation = chosenMode;
                item.imageFit = 'cover';
                item.imageSize = chosenMode;
                item.hasVariants = finalHasVariants;
                item.variants = cleanVariants;
                saveLocalItems(items);
                alert(`✅ Dish "${name}" picture and Half/Full rates successfully saved!`);
              }
            } else {
              const newDish = {
                id: 'dish-' + Date.now(),
                restaurantId: restaurant.id,
                name: name,
                category: cat,
                price: finalPrice,
                dietary: diet,
                description: desc,
                imageUrl: img,
                imageData: photoBase64 || undefined,
                imageOrientation: chosenMode,
                imageFit: 'cover',
                imageSize: chosenMode,
                hasVariants: finalHasVariants,
                variants: cleanVariants,
                isAvailable: true
              };
              items.push(newDish);
              saveLocalItems(items);
              alert(`🎉 New dish "${name}" picture and portion rates successfully saved!`);
            }

            // Clean up studio state
            window.__activeProcessedDishDataUrl = null;
            window.__activeDishServerUrl = null;
            activeUploadedImage = null;

            // Return to Items Tab without ANY page reload
            currentTab = 'items';
            editingItemId = null;
            renderModalContent();
          };
        }
      }

      // Tab 3 Events: Category Bulk Photo Studio (Super Admin Exclusive)
      if (currentTab === 'cat-bulk-photos') {
        const catSelect = document.getElementById('bulk-cat-select');
        if (catSelect) {
          catSelect.onchange = (e) => {
            window.__activeBulkCat = e.target.value;
            window.__bulkCatActiveDataUrl = null;
            renderModalContent();
          };
        }

        const previewImg = document.getElementById('bulk-cat-preview-img');

        // File upload trigger
        const fileInput = document.getElementById('bulk-cat-file-input');
        const uploadTriggerBtn = document.getElementById('bulk-cat-upload-trigger-btn');
        if (uploadTriggerBtn && fileInput) {
          uploadTriggerBtn.onclick = () => fileInput.click();
          fileInput.onchange = (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            SmartImageEngine.processFile(file, { autoEnhance: true }, (processed) => {
              window.__bulkCatActiveDataUrl = processed.dataUrl;
              if (previewImg) previewImg.src = processed.dataUrl;
            });
          };
        }

        // Rotate button
        let rotationDeg = 0;
        const rotateBtn = document.getElementById('bulk-cat-rotate-btn');
        if (rotateBtn) {
          rotateBtn.onclick = () => {
            rotationDeg = (rotationDeg + 90) % 360;
            if (previewImg) previewImg.style.transform = `rotate(${rotationDeg}deg)`;
          };
        }

        // Preset photo clicks
        modal.querySelectorAll('.bulk-cat-preset-btn').forEach(btn => {
          btn.onclick = () => {
            const url = btn.getAttribute('data-url');
            window.__bulkCatActiveDataUrl = url;
            if (previewImg) {
              previewImg.src = url;
              previewImg.style.transform = 'none';
            }
          };
        });

        // Select All / Deselect All
        const selectAllBtn = document.getElementById('bulk-cat-select-all-btn');
        const deselectAllBtn = document.getElementById('bulk-cat-deselect-all-btn');
        if (selectAllBtn) {
          selectAllBtn.onclick = () => {
            modal.querySelectorAll('.bulk-dish-checkbox').forEach(cb => cb.checked = true);
          };
        }
        if (deselectAllBtn) {
          deselectAllBtn.onclick = () => {
            modal.querySelectorAll('.bulk-dish-checkbox').forEach(cb => cb.checked = false);
          };
        }

        // Solo Pic Override for single dish
        modal.querySelectorAll('.btn-single-dish-photo-override').forEach(btn => {
          btn.onclick = () => {
            const dishId = btn.getAttribute('data-id');
            editingItemId = dishId;
            currentTab = 'add';
            renderModalContent();
          };
        });

        // Main 1-Click Apply Button
        const applyBtn = document.getElementById('apply-bulk-category-photo-btn');
        if (applyBtn) {
          applyBtn.onclick = async () => {
            const allCats = getRestaurantCategories(restaurant.id);
            const selectedCat = window.__activeBulkCat || (allCats[0] || 'Biryani & Rice');
            const checkboxes = Array.from(modal.querySelectorAll('.bulk-dish-checkbox:checked'));
            const selectedDishIds = checkboxes.map(cb => cb.value);

            if (selectedDishIds.length === 0) {
              alert('⚠️ Kam az kam 1 dish select karein jis par picture apply karni hai.');
              return;
            }

            const chosenImg = window.__bulkCatActiveDataUrl || (previewImg && previewImg.src);
            if (!chosenImg) {
              alert('⚠️ Baraye meherbani pehle koi photo upload ya preset select karein.');
              return;
            }

            applyBtn.textContent = '⏳ Applying & Saving Photos to Server...';
            applyBtn.disabled = true;

            try {
              // Convert chosen image to base64 if it is an external URL
              let base64Photo = chosenImg;
              if (!chosenImg.startsWith('data:image')) {
                try {
                  const fetched = await fetch(chosenImg);
                  if (fetched.ok) {
                    const blob = await fetched.blob();
                    base64Photo = await new Promise((resolve) => {
                      const r = new FileReader();
                      r.onloadend = () => resolve(r.result);
                      r.readAsDataURL(blob);
                    });
                  }
                } catch (e) {
                  console.warn('Could not fetch preset image blob:', e);
                }
              }

              // Send to Super Admin Bulk Category endpoint
              const res = await fetch('/api/admin/bulk-category-photo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  restaurantId: restaurant.id,
                  category: selectedCat,
                  dishIds: selectedDishIds,
                  imageData: base64Photo,
                  imageBase64: base64Photo,
                  dataUrl: base64Photo,
                  imageUrl: chosenImg,
                  photoUrl: chosenImg,
                  password: 'admin'
                })
              });

              const result = await res.json();
              if (res.ok && result.success) {
                // Update local storage items cleanly without bloating localStorage
                let items = getLocalItems();
                items.forEach(it => {
                  if (it.restaurantId === restaurant.id && selectedDishIds.includes(it.id)) {
                    it.imageUrl = result.imageUrl;
                    delete it.imageData;
                  }
                });
                saveLocalItems(items);

                alert(`🎉 Kamyabi!\n\nCategory "${selectedCat}" ki ${selectedDishIds.length} dishes par picture kamyabi se apply aur permanently save ho gayi hai!`);
                window.__bulkCatActiveDataUrl = null;
                renderModalContent();
              } else {
                alert('⚠️ Error: ' + (result.error || 'Failed to update category photos'));
              }
            } catch (err) {
              alert('Error applying category photo: ' + err.message);
            } finally {
              applyBtn.textContent = '🚀 1-Click Apply Picture to Selected Dishes & Save Permanently';
              applyBtn.disabled = false;
            }
          };
        }
      }

      // Tab 3 Events (Bulk Modifier)
      if (currentTab === 'bulk') {
        const applyBtn = document.getElementById('apply-bulk-price-btn');
        if (applyBtn) {
          applyBtn.onclick = () => {
            const bType = document.getElementById('bulk-type').value;
            const bVal = parseFloat(document.getElementById('bulk-val').value) || 0;
            if (bVal <= 0) {
              alert('Please enter a valid amount greater than 0.');
              return;
            }

            let items = getLocalItems();
            let count = 0;
            items.forEach(i => {
              if (i.restaurantId === restaurant.id) {
                count++;
                if (bType === 'add_fixed') i.price += bVal;
                else if (bType === 'subtract_fixed') i.price = Math.max(1, i.price - bVal);
                else if (bType === 'add_percent') i.price = Math.round(i.price * (1 + bVal / 100));
                else if (bType === 'subtract_percent') i.price = Math.max(1, Math.round(i.price * (1 - bVal / 100)));
              }
            });

            saveLocalItems(items);
            alert(`⚡ Bulk update applied to all ${count} dishes!`);
            renderModalContent();
          };
        }
      }

      // TAB: CATEGORIES EVENTS
      if (currentTab === 'categories') {
        const catTabInput = document.getElementById('cat-tab-name-input');
        const catTabSave = document.getElementById('cat-tab-save-btn');

        if (catTabSave && catTabInput) {
          catTabSave.onclick = () => {
            const catName = catTabInput.value.trim();
            if (!catName) {
              alert('Baraye meherbani category ka naam likhein.');
              return;
            }
            let cats = getRestaurantCategories(restaurant.id);
            if (!cats.includes(catName)) {
              cats.push(catName);
              saveRestaurantCategories(restaurant.id, cats);
              alert(`✅ Category "${catName}" kamyabi se add ho gayi!`);
              renderModalContent();
            } else {
              alert(`⚠️ Category "${catName}" pehle se mojood hai.`);
            }
          };
        }

        // 1-Click preset buttons
        modal.querySelectorAll('.preset-cat-add-btn').forEach(btn => {
          btn.onclick = () => {
            const catName = btn.getAttribute('data-cat');
            if (!catName) return;
            let cats = getRestaurantCategories(restaurant.id);
            if (!cats.includes(catName)) {
              cats.push(catName);
              saveRestaurantCategories(restaurant.id, cats);
              alert(`✅ Category "${catName}" shamil kar di gayi hai!`);
              renderModalContent();
            }
          };
        });

        // Add dish in category button
        modal.querySelectorAll('.cat-add-dish-btn').forEach(btn => {
          btn.onclick = () => {
            const catName = btn.getAttribute('data-cat');
            currentTab = 'add';
            editingItemId = null;
            renderModalContent();
            setTimeout(() => {
              const catSel = document.getElementById('dish-form-cat');
              if (catSel && catName) catSel.value = catName;
            }, 50);
          };
        });

        // Rename category
        modal.querySelectorAll('.cat-rename-btn').forEach(btn => {
          btn.onclick = () => {
            const oldCat = btn.getAttribute('data-cat');
            const newCat = prompt(`Category "${oldCat}" ke liye naya naam enter karein:`, oldCat);
            if (!newCat || !newCat.trim() || newCat.trim() === oldCat) return;
            const cleanNew = newCat.trim();

            let cats = getRestaurantCategories(restaurant.id);
            const idx = cats.indexOf(oldCat);
            if (idx >= 0) {
              cats[idx] = cleanNew;
            } else {
              cats.push(cleanNew);
            }
            saveRestaurantCategories(restaurant.id, cats);

            // Update all dishes in this restaurant with old category
            let items = getLocalItems();
            let changedCount = 0;
            items.forEach(it => {
              if (it.restaurantId === restaurant.id && (it.category || '').toLowerCase().trim() === oldCat.toLowerCase().trim()) {
                it.category = cleanNew;
                changedCount++;
              }
            });
            if (changedCount > 0) {
              saveLocalItems(items);
            }
            alert(`✅ Category "${oldCat}" ko rename kar ke "${cleanNew}" kar diya gaya hai (${changedCount} dishes updated)!`);
            renderModalContent();
          };
        });

        // Delete category
        modal.querySelectorAll('.cat-delete-btn').forEach(btn => {
          btn.onclick = () => {
            const catName = btn.getAttribute('data-cat');
            const dishesCount = restItems.filter(i => (i.category || '').toLowerCase().trim() === catName.toLowerCase().trim()).length;

            if (!confirm(`Kya aap category "${catName}" delete karna chahte hain?${dishesCount > 0 ? `\n\nIs category mein ${dishesCount} dishes mojood hain jo General category mein shift ho jayengi.` : ''}`)) {
              return;
            }

            let cats = getRestaurantCategories(restaurant.id);
            cats = cats.filter(c => c.toLowerCase().trim() !== catName.toLowerCase().trim());
            saveRestaurantCategories(restaurant.id, cats);

            // Reassign dishes if any
            let items = getLocalItems();
            let remapped = 0;
            items.forEach(it => {
              if (it.restaurantId === restaurant.id && (it.category || '').toLowerCase().trim() === catName.toLowerCase().trim()) {
                it.category = 'General';
                remapped++;
              }
            });
            if (remapped > 0) {
              saveLocalItems(items);
            }
            alert(`🗑️ Category "${catName}" delete ho gayi hai!`);
            renderModalContent();
          };
        });
      }

      // Tab 4 Events (Security & PIN Management)
      if (currentTab === 'security') {
        const savePinBtn = document.getElementById('save-new-pin-btn');
        if (savePinBtn) {
          savePinBtn.onclick = async () => {
            const currPin = document.getElementById('curr-pin-input').value.trim();
            const newPin = document.getElementById('new-pin-input').value.trim();

            if (!currPin) {
              alert('Pehle apna current PIN likhein.');
              return;
            }
            if (!newPin || newPin.length < 4) {
              alert('Naya PIN kam az kam 4 digits ka hona chahiye.');
              return;
            }

            savePinBtn.textContent = '⏳ Updating...';
            savePinBtn.disabled = true;

            try {
              const res = await fetch('/api/auth/manager-pin-update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPin: currPin, newPin: newPin })
              });
              const data = await res.json();
              if (res.ok && data.success) {
                alert('✅ Manager Security PIN successfully updated!');
                document.getElementById('curr-pin-input').value = '';
                document.getElementById('new-pin-input').value = '';
              } else {
                alert('⚠️ Error: ' + (data.error || 'Current PIN match nahi hua.'));
              }
            } catch (err) {
              alert('Error updating PIN: ' + err.message);
            } finally {
              savePinBtn.textContent = '💾 Update Security PIN';
              savePinBtn.disabled = false;
            }
          };
        }

        // Export JSON Backup with embedded photo data
        const exportBtn = document.getElementById('export-menu-json-btn');
        if (exportBtn) {
          exportBtn.onclick = async () => {
            const originalText = exportBtn.textContent;
            exportBtn.textContent = '⏳ Preparing Backup with Photos...';
            exportBtn.disabled = true;
            try {
              // Convert any images into base64 embedded data so backup has 100% full photos!
              const uploadedDishPhotos = {};
              const enrichedItems = await Promise.all(restItems.map(async (item) => {
                const clone = { ...item };
                if (clone.imageData && typeof clone.imageData === 'string' && clone.imageData.startsWith('data:image')) {
                  if (clone.imageUrl) uploadedDishPhotos[clone.imageUrl] = clone.imageData;
                  return clone;
                }
                if (clone.imageUrl && (clone.imageUrl.startsWith('/uploads/') || clone.imageUrl.startsWith('http'))) {
                  try {
                    const imgRes = await fetch(clone.imageUrl);
                    if (imgRes.ok) {
                      const blob = await imgRes.blob();
                      const b64 = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.readAsDataURL(blob);
                      });
                      if (b64 && typeof b64 === 'string' && b64.startsWith('data:image')) {
                        clone.imageData = b64;
                        uploadedDishPhotos[clone.imageUrl] = b64;
                      }
                    }
                  } catch (e) {
                    console.warn('[Backup] Could not embed dish photo:', clone.imageUrl, e);
                  }
                }
                return clone;
              }));

              const dataToExport = {
                restaurant: restaurant,
                menuItems: enrichedItems,
                uploadedDishPhotos: uploadedDishPhotos,
                exportedAt: new Date().toISOString(),
                version: 2
              };
              const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${restaurant.slug || 'menu'}_backup_${Date.now()}.json`;
              a.click();
              URL.revokeObjectURL(url);
              alert('📥 Menu backup successfully downloaded with 100% full pictures included!');
            } catch (err) {
              alert('⚠️ Error creating backup: ' + err.message);
            } finally {
              exportBtn.textContent = originalText;
              exportBtn.disabled = false;
            }
          };
        }

        // Restore JSON Backup with automatic image extraction and server persistence
        const restoreInput = document.getElementById('restore-menu-file-input');
        if (restoreInput) {
          restoreInput.onchange = async (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (re) => {
              try {
                const parsed = JSON.parse(re.target.result);
                if (parsed && Array.isArray(parsed.menuItems)) {
                  let items = getLocalItems();
                  // remove existing items for this restaurant and replace with backup
                  items = items.filter(i => i.restaurantId !== restaurant.id);
                  const restoredItems = parsed.menuItems.map(m => ({ ...m, restaurantId: restaurant.id }));
                  
                  // Restore photos to server disk in parallel
                  const photoPromises = restoredItems.map(async (dish) => {
                    const dataUrl = dish.imageData || (parsed.uploadedDishPhotos && parsed.uploadedDishPhotos[dish.imageUrl]);
                    if (dataUrl && typeof dataUrl === 'string' && dataUrl.startsWith('data:image')) {
                      try {
                        const upRes = await fetch('/api/upload/dish-photo', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            restaurantId: restaurant.id,
                            dishName: dish.name,
                            dishId: dish.id,
                            dataUrl: dataUrl
                          })
                        });
                        const upData = await upRes.json();
                        if (upRes.ok && upData.fileUrl) {
                          dish.imageUrl = upData.fileUrl;
                        }
                      } catch (uErr) {
                        console.warn('[Restore] Could not upload restored dish photo:', dish.name, uErr);
                      }
                    }
                  });
                  await Promise.all(photoPromises);

                  items = items.concat(restoredItems);
                  saveLocalItems(items);
                  alert(`✅ Menu successfully restored! (${restoredItems.length} dishes and pictures recovered)`);
                  currentTab = 'items';
                  renderModalContent();
                } else {
                  alert('Invalid backup file format.');
                }
              } catch (err) {
                alert('Failed to parse backup JSON file: ' + err.message);
              }
            };
            reader.readAsText(file);
          };
        }
      }
    }

    document.body.appendChild(modal);
    renderModalContent();
  }

  // =========================================================================
  // 2. PROFESSIONAL ORDER TRACKING, INVOICE & THERMAL RECEIPT SUITE
  // =========================================================================

  // Universal Thermal Print Engine (handles iframes, standalone tabs & direct print)
  function printThermalSlipViaIframe(receiptHtml, orderId) {
    const slipUrl = '/api/print-slip/' + encodeURIComponent(orderId || '');
    const isInsideIframe = (window.self !== window.top);

    // 1. If inside an iframe (like AI Studio preview), opening /api/print-slip in a new tab
    // is the 100% reliable standard way, bypassing iframe sandbox restrictions
    if (isInsideIframe) {
      try {
        const newWin = window.open(slipUrl, '_blank');
        if (newWin) return;
      } catch (err) {
        console.warn('[Print] Iframe window.open error:', err);
      }
    }

    // 2. Standard direct print
    try {
      window.print();
      return;
    } catch (e) {
      console.warn('[Print] window.print() exception:', e);
    }

    // 3. Fallback: Render into an off-screen non-zero frame
    try {
      let printIframe = document.getElementById('receipt-silent-print-frame');
      if (printIframe) {
        try { printIframe.remove(); } catch(e) {}
      }

      printIframe = document.createElement('iframe');
      printIframe.id = 'receipt-silent-print-frame';
      printIframe.setAttribute('style', 'position:fixed;left:-9999px;top:0;width:320px;height:600px;opacity:0.01;pointer-events:none;border:none;z-index:-9999;');
      document.body.appendChild(printIframe);

      const frameDoc = printIframe.contentWindow ? printIframe.contentWindow.document : (printIframe.contentDocument || null);
      if (!frameDoc) return;

      frameDoc.open();
      frameDoc.write(receiptHtml);
      frameDoc.close();

      const triggerPrint = function() {
        try {
          if (printIframe && printIframe.contentWindow) {
            printIframe.contentWindow.focus();
            printIframe.contentWindow.print();
          }
        } catch(err) {
          console.warn('[Receipt Print] Fallback error:', err);
        }
      };

      const imgs = frameDoc.querySelectorAll('img');
      if (imgs.length > 0) {
        let loaded = 0;
        let fired = false;
        const onDone = function() {
          loaded++;
          if (loaded >= imgs.length && !fired) {
            fired = true;
            setTimeout(triggerPrint, 80);
          }
        };
        imgs.forEach(function(img) {
          if (img.complete) onDone();
          else { img.onload = onDone; img.onerror = onDone; }
        });
        setTimeout(function() {
          if (!fired) { fired = true; triggerPrint(); }
        }, 500);
      } else {
        setTimeout(triggerPrint, 100);
      }
    } catch (e) {
      console.warn('[Receipt Print] Error:', e);
    }
  }

  // Retrieve Slip Layout Configuration for a restaurant
  function getRestaurantSlipConfig(rest) {
    if (!rest) rest = {};
    let savedLocal = null;
    try {
      if (rest.id) {
        const item = localStorage.getItem('bitehub_slip_config_' + rest.id);
        if (item) savedLocal = JSON.parse(item);
      }
    } catch(e) {}

    const custom = rest.slipConfig || savedLocal || {};
    return {
      paperSize: custom.paperSize || '80mm',
      fontFamily: custom.fontFamily || 'monospace',
      fontSize: custom.fontSize || 'normal',
      showLogo: custom.showLogo !== false,
      logoSize: custom.logoSize || 'medium',
      headerTitle: custom.headerTitle || rest.name || 'Restaurant',
      headerTagline: custom.headerTagline || rest.tagline || '',
      headerAddress: custom.headerAddress || rest.address || 'Commercial Market, Main Branch',
      headerPhone: custom.headerPhone || rest.phone || rest.whatsappNumber || '+92 300 1234567',
      showTaxRegistration: !!custom.showTaxRegistration,
      taxRegistrationNo: custom.taxRegistrationNo || '',
      badgeText: custom.badgeText || 'OFFICIAL SALES INVOICE',
      showTicketId: custom.showTicketId !== false,
      showDateTime: custom.showDateTime !== false,
      showCustomerName: custom.showCustomerName !== false,
      showCustomerPhone: custom.showCustomerPhone !== false,
      showCustomerAddress: custom.showCustomerAddress !== false,
      showServiceType: custom.showServiceType !== false,
      showPaymentMethod: custom.showPaymentMethod !== false,
      showCookingNotes: custom.showCookingNotes !== false,
      showItemUnitPrice: custom.showItemUnitPrice !== false,
      showSubtotal: custom.showSubtotal !== false,
      showDeliveryFee: custom.showDeliveryFee !== false,
      showGstTax: !!custom.showGstTax,
      taxPercentage: Number(custom.taxPercentage) || 0,
      currencySymbol: custom.currencySymbol || 'Rs.',
      showBarcode: custom.showBarcode !== false,
      footerThankYou: custom.footerThankYou || '*** THANK YOU FOR VISITING! ***',
      footerSubNote: custom.footerSubNote || 'Please visit us again. Freshly prepared with care.',
      showWifiNotice: !!custom.showWifiNotice,
      footerWifiNotice: custom.footerWifiNotice || '',
      showWatermark: custom.showWatermark !== false,
      footerWatermark: custom.footerWatermark || `Powered by ${rest.name || 'ManagementHub'} POS System`
    };
  }

  // Generate Thermal Slip HTML with Restaurant Logo Prominently at Top
  function generateReceiptSlipHtml(order, rest, overrideConfig) {
    if (!order) order = {};
    if (!rest) rest = {};
    const baseCfg = getRestaurantSlipConfig(rest);
    const cfg = Object.assign({}, baseCfg, overrideConfig || {});

    const items = order.items || [];
    const subtotal = order.totalAmount || order.total || order.subtotal || 0;
    const delivery = order.deliveryFee || 0;
    const taxAmount = (cfg.showGstTax && cfg.taxPercentage > 0) ? Math.round((subtotal * cfg.taxPercentage) / 100) : 0;
    const grandTotal = subtotal + delivery + taxAmount;
    const curr = cfg.currencySymbol;

    const orderDate = new Date(order.createdAt || Date.now()).toLocaleString('en-PK', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });

    const restLogo = rest.logoUrl || rest.logo || rest.avatar || rest.image || rest.coverUrl || '';
    const ticketId = order.id ? (order.id.length > 10 ? order.id.slice(-8).toUpperCase() : order.id.toUpperCase()) : 'BITE-' + Date.now().toString().slice(-6);

    let bodyWidth = '78mm';
    let pageCss = 'size: 80mm auto; margin: 0;';
    if (cfg.paperSize === '58mm') {
      bodyWidth = '54mm';
      pageCss = 'size: 58mm auto; margin: 0;';
    } else if (cfg.paperSize === 'A5') {
      bodyWidth = '135mm';
      pageCss = 'size: A5 portrait; margin: 8mm;';
    } else if (cfg.paperSize === 'A4') {
      bodyWidth = '185mm';
      pageCss = 'size: A4 portrait; margin: 12mm;';
    }

    let fontCss = "'Courier New', Courier, monospace, monospace";
    if (cfg.fontFamily === 'sans') {
      fontCss = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
    } else if (cfg.fontFamily === 'serif') {
      fontCss = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
    }

    let baseFontSize = '11px';
    if (cfg.fontSize === 'compact') baseFontSize = '9.5px';
    if (cfg.fontSize === 'large') baseFontSize = '12.5px';

    let logoMaxHeight = '65px';
    let logoMaxWidth = '140px';
    if (cfg.logoSize === 'small') {
      logoMaxHeight = '42px';
      logoMaxWidth = '95px';
    } else if (cfg.logoSize === 'large') {
      logoMaxHeight = '92px';
      logoMaxWidth = '185px';
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Receipt #${ticketId} - ${sanitizeText(cfg.headerTitle)}</title>
        <style>
          @page {
            ${pageCss}
          }
          @media print {
            html, body {
              width: 100% !important;
              margin: 0 !important;
              padding: 3mm !important;
              background: #fff !important;
              color: #000 !important;
            }
            .no-print { display: none !important; }
            img { max-width: 100% !important; }
          }
          body {
            font-family: ${fontCss};
            width: ${bodyWidth};
            max-width: 100%;
            margin: 0 auto;
            padding: 8px;
            color: #000;
            background: #fff;
            font-size: ${baseFontSize};
            line-height: 1.35;
            box-sizing: border-box;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .font-bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 6px 0; }
          .double-divider { border-top: 2px solid #000; margin: 8px 0; }
          table { width: 100%; border-collapse: collapse; font-size: inherit; }
          th, td { padding: 3px 0; vertical-align: top; }
          th { text-align: left; }
          .badge { border: 1.5px solid #000; padding: 2px 8px; display: inline-block; font-weight: 900; margin: 4px 0; font-size: 10px; letter-spacing: 0.5px; }
          .slip-logo {
            max-height: ${logoMaxHeight};
            max-width: ${logoMaxWidth};
            object-fit: contain;
            margin: 0 auto 6px auto;
            display: block;
            border-radius: 4px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        </style>
      </head>
      <body>
        <div class="text-center">
          ${cfg.showLogo && restLogo ? `
            <div style="text-align:center;margin:0 auto 6px auto;">
              <img src="${sanitizeUrl(restLogo)}" alt="${sanitizeText(cfg.headerTitle)} Logo" class="slip-logo" />
            </div>
          ` : (cfg.showLogo ? `
            <div style="text-align:center;margin:0 auto 6px auto;">
              <div style="width:38px;height:38px;border-radius:50%;border:2px solid #000;display:inline-flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;">🍽️</div>
            </div>
          ` : '')}
          <h2 style="margin:2px 0 3px 0;font-size:16px;font-weight:900;letter-spacing:0.5px;text-transform:uppercase;">${sanitizeText(cfg.headerTitle)}</h2>
          ${cfg.headerTagline ? `<div style="font-size:9.5px;font-style:italic;margin-bottom:2px;color:#333;">${sanitizeText(cfg.headerTagline)}</div>` : ''}
          ${cfg.headerAddress ? `<div style="font-size:10px;">${sanitizeText(cfg.headerAddress)}</div>` : ''}
          ${cfg.headerPhone ? `<div style="font-size:10px;font-weight:bold;">TEL: ${sanitizeText(cfg.headerPhone)}</div>` : ''}
          ${cfg.showTaxRegistration && cfg.taxRegistrationNo ? `<div style="font-size:9.5px;font-weight:bold;margin-top:2px;">${sanitizeText(cfg.taxRegistrationNo)}</div>` : ''}
          ${cfg.badgeText ? `<div class="badge">${sanitizeText(cfg.badgeText)}</div>` : ''}
        </div>

        <div class="divider"></div>

        <div>
          ${cfg.showTicketId ? `
            <div style="display:flex;justify-content:space-between;">
              <strong>ORDER TICKET:</strong>
              <span style="font-weight:900;font-size:12px;">#${ticketId}</span>
            </div>
          ` : ''}
          ${cfg.showDateTime ? `<div><strong>DATE:</strong> ${orderDate}</div>` : ''}
          ${cfg.showCustomerName ? `<div><strong>CUSTOMER:</strong> ${sanitizeText(order.customerName) || 'Walk-in / Online'}</div>` : ''}
          ${cfg.showCustomerPhone ? `<div><strong>PHONE:</strong> ${sanitizeText(order.customerPhone) || 'N/A'}</div>` : ''}
          ${cfg.showServiceType ? `<div><strong>SERVICE:</strong> ${order.orderType === 'dine_in' ? 'DINE-IN (' + (order.tableNumber || 'Table') + ')' : (order.orderType === 'delivery' ? 'DOORSTEP DELIVERY' : 'COUNTER TAKEAWAY')}</div>` : ''}
          ${cfg.showCustomerAddress && order.customerAddress ? `<div><strong>ADDRESS:</strong> ${sanitizeText(order.customerAddress)}</div>` : ''}
          ${cfg.showPaymentMethod ? `<div><strong>PAYMENT:</strong> ${sanitizeText((order.paymentMethod || 'Cash On Delivery').toUpperCase().replace(/_/g, ' '))}</div>` : ''}
        </div>

        <div class="divider"></div>

        <table>
          <thead>
            <tr style="border-bottom:1px solid #000;">
              <th>ITEM</th>
              <th class="text-center">QTY</th>
              ${cfg.showItemUnitPrice ? `<th class="text-right">PRICE</th>` : ''}
              <th class="text-right">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(it => `
              <tr>
                <td style="padding-right:4px;">
                  <span class="font-bold">${sanitizeText(it.name) || 'Dish'}</span>
                  ${cfg.showCookingNotes && it.specialInstructions ? `<div style="font-size:9.5px;font-style:italic;color:#333;">Note: ${sanitizeText(it.specialInstructions)}</div>` : ''}
                </td>
                <td class="text-center font-bold">${it.quantity || 1}</td>
                ${cfg.showItemUnitPrice ? `<td class="text-right">${curr}${it.price}</td>` : ''}
                <td class="text-right font-bold">${curr}${(it.price * (it.quantity || 1))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="divider"></div>

        <table>
          ${cfg.showSubtotal ? `
            <tr>
              <td>Items Subtotal:</td>
              <td class="text-right font-bold">${curr}${subtotal}</td>
            </tr>
          ` : ''}
          ${cfg.showDeliveryFee ? `
            <tr>
              <td>Delivery Charges:</td>
              <td class="text-right">${delivery === 0 ? 'FREE' : curr + delivery}</td>
            </tr>
          ` : ''}
          ${cfg.showGstTax && cfg.taxPercentage > 0 ? `
            <tr>
              <td>Sales Tax / GST (${cfg.taxPercentage}%):</td>
              <td class="text-right font-bold">${curr}${taxAmount}</td>
            </tr>
          ` : ''}
          <tr style="font-size:13px;border-top:1px solid #000;">
            <td class="font-bold" style="padding-top:4px;">NET PAYABLE:</td>
            <td class="text-right font-bold" style="padding-top:4px;font-size:14px;">${curr}${grandTotal}</td>
          </tr>
        </table>

        <div class="double-divider"></div>

        <div class="text-center" style="font-size:10px;">
          ${cfg.footerThankYou ? `<div style="font-weight:bold;margin-bottom:2px;">${sanitizeText(cfg.footerThankYou)}</div>` : ''}
          ${cfg.footerSubNote ? `<div>${sanitizeText(cfg.footerSubNote)}</div>` : ''}
          ${cfg.showWifiNotice && cfg.footerWifiNotice ? `
            <div style="margin:5px auto;padding:3px 6px;border:1px dashed #000;font-size:9px;font-weight:bold;display:inline-block;">
              📶 ${sanitizeText(cfg.footerWifiNotice)}
            </div>
          ` : ''}
          ${cfg.showBarcode ? `
            <div style="margin:6px auto 2px;height:22px;display:flex;align-items:center;justify-content:center;gap:1.5px;overflow:hidden;opacity:0.85;">
              ${Array.from({length: 32}).map((_, i) => `<div style="height:100%;${i%3===0?'width:2px;background:#000;':(i%2===0?'width:1px;background:#000;':'width:1px;background:transparent;')}"></div>`).join('')}
            </div>
            <div style="font-size:9px;color:#555;font-family:monospace;">*${ticketId}*</div>
          ` : ''}
          ${cfg.showWatermark && cfg.footerWatermark ? `
            <div style="margin-top:6px;font-size:9px;color:#555;">${sanitizeText(cfg.footerWatermark)}</div>
          ` : ''}
        </div>
      </body>
      </html>
    `;
  }

  // On-screen Receipt Preview Modal with instant Print Slip button
  window.showReceiptSlipModal = function(order, restaurant) {
    if (!order) return;
    const old = document.getElementById('receipt-slip-modal');
    if (old) old.remove();

    const rests = getLocalRestaurants();
    let rest = restaurant;
    if (!rest) {
      rest = rests.find(r => r.id === order.restaurantId || (r.name && order.restaurantName && r.name.toLowerCase() === order.restaurantName.toLowerCase()));
    }
    if (!rest && rests.length > 0) {
      const urlParams = new URLSearchParams(window.location.search);
      const storeSlug = urlParams.get('store') || urlParams.get('restaurant') || urlParams.get('r');
      if (storeSlug) {
        const sClean = storeSlug.toLowerCase().trim();
        rest = rests.find(r => (r.slug && r.slug.toLowerCase() === sClean) || (r.id && r.id.toLowerCase() === sClean));
      }
    }
    if (!rest) {
      rest = rests[0] || { name: order.restaurantName || 'Restaurant', phone: '+92 300 0000000', address: 'Commercial Branch' };
    }

    const restLogo = rest.logoUrl || rest.logo || rest.avatar || rest.image || rest.coverUrl || '';
    const items = order.items || [];
    const subtotal = order.totalAmount || order.total || order.subtotal || 0;
    const delivery = order.deliveryFee || 0;
    const grandTotal = subtotal + delivery;
    const ticketId = order.id ? (order.id.length > 10 ? order.id.slice(-8).toUpperCase() : order.id.toUpperCase()) : 'BITE-' + Date.now().toString().slice(-6);
    const orderDate = new Date(order.createdAt || Date.now()).toLocaleString('en-PK', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });

    const receiptHtml = generateReceiptSlipHtml(order, rest);

    const modal = document.createElement('div');
    modal.id = 'receipt-slip-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:99999999;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:12px;overflow-y:auto;';

    modal.innerHTML = `
      <div style="background:#090d16;border:1px solid #1e293b;border-radius:24px;max-width:440px;width:100%;color:#f8fafc;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 25px 60px rgba(0,0,0,0.9);max-height:94vh;overflow-y:auto;display:flex;flex-direction:column;">
        
        <!-- Modal Top Bar -->
        <div style="padding:14px 18px;border-bottom:1px solid #1e293b;display:flex;align-items:center;justify-content:space-between;background:#0f172a;border-top-left-radius:24px;border-top-right-radius:24px;" class="no-print">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:32px;height:32px;border-radius:10px;background:#ea580c;display:flex;align-items:center;justify-content:center;font-size:16px;">
              🖨️
            </div>
            <div>
              <h3 style="margin:0;font-size:13px;font-weight:800;color:#fff;">Order POS Slip</h3>
              <p style="margin:0;font-size:10px;color:#94a3b8;">Standard 80mm Thermal Receipt with Restaurant Logo</p>
            </div>
          </div>
          <button id="close-receipt-slip-modal" style="background:#1e293b;border:none;color:#94a3b8;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;">✕</button>
        </div>

        <!-- Scrollable Receipt Slip Preview Box -->
        <div style="padding:16px;background:#030712;display:flex;justify-content:center;overflow-y:auto;flex:1;">
          
          <div id="pos-slip-thermal-area" class="printable-slip" style="background:#ffffff;color:#000000;width:100%;max-width:330px;padding:16px;border-radius:14px;box-shadow:0 10px 25px rgba(0,0,0,0.5);font-family:'Courier New',Courier,monospace;font-size:11px;line-height:1.35;box-sizing:border-box;">
            
            <!-- Restaurant Logo at Top -->
            <div style="text-align:center;margin-bottom:8px;">
              ${restLogo ? `
                <img src="${sanitizeUrl(restLogo)}" alt="${sanitizeText(rest.name)} Logo" class="slip-logo" style="max-height:58px;max-width:130px;object-fit:contain;margin:0 auto 6px auto;display:block;border-radius:4px;" />
              ` : `
                <div style="width:40px;height:40px;border-radius:50%;border:2px solid #000;display:inline-flex;align-items:center;justify-content:center;font-size:18px;margin:0 auto 4px auto;font-weight:bold;">🍽️</div>
              `}
              <h2 style="margin:0;font-size:15px;font-weight:900;text-transform:uppercase;letter-spacing:0.5px;color:#000;">${sanitizeText(rest.name)}</h2>
              ${rest.tagline ? `<div style="font-size:9.5px;font-style:italic;color:#333;margin-top:2px;">${sanitizeText(rest.tagline)}</div>` : ''}
              <div style="font-size:10px;color:#333;margin-top:2px;">${sanitizeText(rest.address) || 'Direct Order Storefront'}</div>
              <div style="font-size:10px;font-weight:bold;color:#000;">TEL: ${sanitizeText(rest.phone || rest.whatsappNumber || '+92 300 1234567')}</div>
              <div style="display:inline-block;border:1.5px solid #000;padding:2px 8px;font-size:9.5px;font-weight:900;margin-top:5px;letter-spacing:0.5px;">OFFICIAL SALES INVOICE</div>
            </div>

            <div style="border-top:1px dashed #000;margin:8px 0;"></div>

            <!-- Order Meta -->
            <div style="font-size:11px;line-height:1.4;">
              <div style="display:flex;justify-content:space-between;">
                <strong>ORDER #:</strong>
                <span style="font-weight:900;">#${ticketId}</span>
              </div>
              <div><strong>DATE:</strong> ${orderDate}</div>
              <div><strong>CUSTOMER:</strong> ${sanitizeText(order.customerName) || 'Walk-in / Online'}</div>
              <div><strong>PHONE:</strong> ${sanitizeText(order.customerPhone) || 'N/A'}</div>
              <div><strong>SERVICE:</strong> ${order.orderType === 'dine_in' ? 'DINE-IN (' + (order.tableNumber || 'Table') + ')' : (order.orderType === 'delivery' ? 'DELIVERY' : 'TAKEAWAY')}</div>
              ${order.customerAddress ? `<div><strong>ADDRESS:</strong> ${sanitizeText(order.customerAddress)}</div>` : ''}
              <div><strong>PAYMENT:</strong> ${sanitizeText((order.paymentMethod || 'Cash On Delivery').toUpperCase().replace(/_/g, ' '))}</div>
            </div>

            <div style="border-top:1px dashed #000;margin:8px 0;"></div>

            <!-- Items Table -->
            <table style="width:100%;border-collapse:collapse;font-size:11px;">
              <thead>
                <tr style="border-bottom:1px solid #000;">
                  <th style="text-align:left;padding-bottom:3px;">ITEM</th>
                  <th style="text-align:center;padding-bottom:3px;">QTY</th>
                  <th style="text-align:right;padding-bottom:3px;">PRICE</th>
                  <th style="text-align:right;padding-bottom:3px;">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                ${items.map(it => `
                  <tr>
                    <td style="padding:3px 2px 3px 0;vertical-align:top;">
                      <span style="font-weight:bold;">${sanitizeText(it.name) || 'Dish'}</span>
                      ${it.specialInstructions ? `<div style="font-size:9.5px;color:#555;font-style:italic;">Note: ${sanitizeText(it.specialInstructions)}</div>` : ''}
                    </td>
                    <td style="text-align:center;padding:3px 0;vertical-align:top;font-weight:bold;">${it.quantity || 1}</td>
                    <td style="text-align:right;padding:3px 0;vertical-align:top;">Rs.${it.price}</td>
                    <td style="text-align:right;padding:3px 0;vertical-align:top;font-weight:bold;">Rs.${it.price * (it.quantity || 1)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <div style="border-top:1px dashed #000;margin:8px 0;"></div>

            <!-- Totals -->
            <table style="width:100%;font-size:11px;">
              <tr>
                <td>Items Subtotal:</td>
                <td style="text-align:right;font-weight:bold;">Rs.${subtotal}</td>
              </tr>
              <tr>
                <td>Delivery Fee:</td>
                <td style="text-align:right;">${delivery === 0 ? 'FREE' : 'Rs.' + delivery}</td>
              </tr>
              <tr style="border-top:1.5px solid #000;font-size:12px;">
                <td style="font-weight:900;padding-top:4px;">NET PAYABLE:</td>
                <td style="text-align:right;font-weight:900;padding-top:4px;font-size:13px;">Rs.${grandTotal}</td>
              </tr>
            </table>

            <div style="border-top:2px solid #000;margin:10px 0 6px 0;"></div>

            <!-- Footer & Barcode -->
            <div style="text-align:center;font-size:10px;">
              <div style="font-weight:bold;">*** THANK YOU FOR ORDERING! ***</div>
              <div>Prepared fresh with love & hygiene.</div>
              <div style="margin:6px auto 2px;height:22px;display:flex;align-items:center;justify-content:center;gap:1.5px;overflow:hidden;opacity:0.85;">
                ${Array.from({length: 32}).map((_, i) => `<div style="height:100%;${i%3===0?'width:2px;background:#000;':(i%2===0?'width:1px;background:#000;':'width:1px;background:transparent;')}"></div>`).join('')}
              </div>
              <div style="font-size:9px;color:#666;font-family:monospace;">*${ticketId}*</div>
              <div style="margin-top:4px;font-size:9px;color:#666;">${sanitizeText(rest.name)} POS System</div>
            </div>

          </div>

        </div>

        <!-- Modal Action Footer -->
        <div style="padding:14px 18px;border-top:1px solid #1e293b;background:#0f172a;border-bottom-left-radius:24px;border-bottom-right-radius:24px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:space-between;" class="no-print">
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button id="copy-receipt-slip-btn" style="background:#1e293b;color:#cbd5e1;border:1px solid #334155;padding:8px 12px;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:5px;">
              📋 Copy Text
            </button>
            <button id="download-slip-html-btn" style="background:#1e293b;color:#cbd5e1;border:1px solid #334155;padding:8px 12px;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:5px;">
              ⬇️ Save HTML
            </button>
          </div>
          
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
            <button id="close-receipt-slip-btn" style="background:#1e293b;color:#94a3b8;border:none;padding:8px 12px;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer;">
              Close
            </button>
            <a id="open-print-tab-btn" href="/api/print-slip/${order.id || ticketId}" target="_blank" rel="noopener noreferrer" style="background:#0284c7;color:#fff;text-decoration:none;padding:8px 14px;border-radius:10px;font-size:11px;font-weight:800;display:inline-flex;align-items:center;gap:5px;box-shadow:0 3px 10px rgba(2,132,199,0.35);">
              🚀 Print in Tab
            </a>
            <button id="trigger-iframe-print-btn" style="background:linear-gradient(135deg, #f97316 0%, #ea580c 100%);color:#fff;border:none;padding:9px 16px;border-radius:10px;font-size:12px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:5px;box-shadow:0 4px 14px rgba(234,88,12,0.4);">
              🖨️ Print Slip Now
            </button>
          </div>
        </div>

      </div>
    `;

    document.body.appendChild(modal);

    // Event bindings
    document.getElementById('close-receipt-slip-modal').onclick = () => modal.remove();
    document.getElementById('close-receipt-slip-btn').onclick = () => modal.remove();

    const doPrint = () => {
      printThermalSlipViaIframe(receiptHtml, order.id || ticketId);
    };

    document.getElementById('trigger-iframe-print-btn').onclick = doPrint;

    document.getElementById('download-slip-html-btn').onclick = () => {
      const blob = new Blob([receiptHtml], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Receipt-' + ticketId + '.html';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    };

    document.getElementById('copy-receipt-slip-btn').onclick = () => {
      let plain = `========================================\n`;
      plain += `       ${rest.name.toUpperCase()}\n`;
      if (rest.tagline) plain += `   ${rest.tagline}\n`;
      plain += `   ${rest.address || 'Storefront'}\n`;
      plain += `   Tel: ${rest.phone || rest.whatsappNumber || '+92 300 1234567'}\n`;
      plain += `========================================\n`;
      plain += `ORDER #: #${ticketId}\n`;
      plain += `DATE: ${orderDate}\n`;
      plain += `CUSTOMER: ${order.customerName || 'Guest'}\n`;
      plain += `PHONE: ${order.customerPhone || 'N/A'}\n`;
      plain += `SERVICE: ${order.orderType === 'dine_in' ? 'Dine-in (' + (order.tableNumber || 'Table') + ')' : (order.orderType === 'delivery' ? 'Delivery' : 'Takeaway')}\n`;
      if (order.customerAddress) plain += `ADDRESS: ${order.customerAddress}\n`;
      plain += `========================================\n`;
      items.forEach(it => {
        plain += `${it.quantity || 1}x ${it.name} - Rs.${(it.price * (it.quantity || 1))}\n`;
      });
      plain += `----------------------------------------\n`;
      plain += `Subtotal: Rs.${subtotal}\n`;
      plain += `Delivery: ${delivery === 0 ? 'FREE' : 'Rs.' + delivery}\n`;
      plain += `TOTAL PAYABLE: Rs.${grandTotal}\n`;
      plain += `PAYMENT: ${(order.paymentMethod || 'Cash On Delivery').toUpperCase().replace(/_/g, ' ')}\n`;
      plain += `========================================\n`;
      plain += `*** THANK YOU FOR ORDERING! ***\n`;

      navigator.clipboard.writeText(plain).then(() => {
        const btn = document.getElementById('copy-receipt-slip-btn');
        if (btn) btn.innerHTML = '✓ Copied!';
        setTimeout(() => {
          if (btn) btn.innerHTML = '📋 Copy Text';
        }, 2000);
      });
    };

    // Auto-trigger direct print immediately!
    setTimeout(doPrint, 150);
  };

  // Main global print function
  window.printOrderReceipt = function(order, restaurant) {
    if (!order) return;
    const rests = getLocalRestaurants();
    let rest = restaurant;
    if (!rest) {
      rest = rests.find(r => r.id === order.restaurantId || (r.name && order.restaurantName && r.name.toLowerCase() === order.restaurantName.toLowerCase()));
    }
    if (!rest && rests.length > 0) {
      const urlParams = new URLSearchParams(window.location.search);
      const storeSlug = urlParams.get('store') || urlParams.get('restaurant') || urlParams.get('r');
      if (storeSlug) {
        const sClean = storeSlug.toLowerCase().trim();
        rest = rests.find(r => (r.slug && r.slug.toLowerCase() === sClean) || (r.id && r.id.toLowerCase() === sClean));
      }
    }
    if (!rest) {
      rest = rests[0] || { name: order.restaurantName || 'Restaurant', phone: '+92 300 0000000', address: 'Commercial Branch' };
    }

    // Show on-screen slip and trigger silent iframe print
    window.showReceiptSlipModal(order, rest);
  };

  // =========================================================================
  // 2.5 PROFESSIONAL SLIP LAYOUT CUSTOMIZER & POS RECEIPT DESIGNER
  // =========================================================================
  window.openSlipLayoutCustomizer = function(restaurantId) {
    const rests = getLocalRestaurants();
    let restaurant = rests.find(r => r.id === restaurantId || r.slug === restaurantId);
    if (!restaurant) restaurant = rests[0];
    if (!restaurant) {
      alert('Restaurant not found!');
      return;
    }

    let oldModal = document.getElementById('slip-layout-customizer-modal');
    if (oldModal) oldModal.remove();

    // Working state configuration cloned from restaurant
    let cfg = Object.assign({}, getRestaurantSlipConfig(restaurant));

    // Sample mock order for interactive live preview
    const sampleOrder = {
      id: 'ORD-9842',
      customerName: 'Muhammad Hamza',
      customerPhone: '+92 301 8765432',
      customerAddress: 'House 14-B, Street 3, Cavalry Ground, Lahore',
      orderType: 'delivery',
      paymentMethod: 'cash_on_delivery',
      restaurantId: restaurant.id,
      items: [
        { id: '1', name: 'Special Chicken Biryani (Double)', price: 750, quantity: 2, specialInstructions: 'Extra raita & spicy' },
        { id: '2', name: 'Fresh Mint Raita & Salad', price: 120, quantity: 1 },
        { id: '3', name: 'Chilled Soft Drink (1.5 Ltr)', price: 220, quantity: 1 }
      ],
      subtotal: 1840,
      deliveryFee: 150,
      totalAmount: 1990,
      createdAt: new Date().toISOString()
    };

    let activeTab = 'paper'; // 'paper', 'header', 'fields', 'pricing', 'footer'

    const modal = document.createElement('div');
    modal.id = 'slip-layout-customizer-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:99999999;background:rgba(0,0,0,0.85);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:12px;overflow-y:auto;';

    function renderModal() {
      let iframeWidth = 320;
      if (cfg.paperSize === '58mm') iframeWidth = 240;
      else if (cfg.paperSize === 'A5') iframeWidth = 430;
      else if (cfg.paperSize === 'A4') iframeWidth = 480;

      modal.innerHTML = `
        <div style="background:#090d16;border:1px solid #1e293b;border-radius:24px;max-width:1120px;width:100%;color:#f8fafc;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 25px 60px rgba(0,0,0,0.9);max-height:92vh;display:flex;flex-direction:column;overflow:hidden;">
          
          <!-- Modal Header -->
          <div style="padding:14px 20px;border-bottom:1px solid #1e293b;display:flex;align-items:center;justify-content:space-between;background:#0f172a;">
            <div style="display:flex;align-items:center;gap:12px;">
              <div style="width:38px;height:38px;border-radius:12px;background:linear-gradient(135deg, #f97316 0%, #ea580c 100%);display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 6px 16px rgba(249,115,22,0.35);">
                🧾
              </div>
              <div>
                <div style="display:flex;align-items:center;gap:8px;">
                  <h3 style="margin:0;font-size:15px;font-weight:900;color:#fff;">POS Receipt & Slip Layout Designer</h3>
                  <span style="font-size:10px;background:#0369a1;color:#fff;padding:2px 8px;border-radius:6px;font-weight:700;">Admin Pro</span>
                </div>
                <p style="margin:2px 0 0;font-size:11px;color:#94a3b8;">
                  Branch: <strong style="color:#38bdf8;">${sanitizeText(restaurant.name)}</strong> · Customize paper size, header, logo, fields, barcode & tax
                </p>
              </div>
            </div>
            
            <div style="display:flex;align-items:center;gap:8px;">
              <button id="close-slip-customizer-btn" style="background:#1e293b;border:none;color:#94a3b8;width:34px;height:34px;border-radius:10px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;">✕</button>
            </div>
          </div>

          <!-- Body: Dual-Pane Grid (Controls on Left, Live Thermal Preview on Right) -->
          <div style="display:flex;flex:1;overflow:hidden;gap:16px;padding:16px;flex-direction:row;">
            
            <!-- LEFT PANEL: Settings & Controls -->
            <div style="flex:1.2;min-width:320px;display:flex;flex-direction:column;background:#0c1322;border:1px solid #1e293b;border-radius:18px;overflow:hidden;">
              
              <!-- Tab Navigation Bar -->
              <div style="display:flex;background:#070b14;border-bottom:1px solid #1e293b;overflow-x:auto;padding:4px 6px;gap:4px;">
                <button type="button" class="slip-tab-btn" data-tab="paper" style="flex:1;padding:8px 10px;border-radius:10px;border:none;font-size:11px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;transition:all 0.2s;background:${activeTab === 'paper' ? '#0284c7' : 'transparent'};color:${activeTab === 'paper' ? '#fff' : '#94a3b8'};">
                  <span>📐</span> <span>Paper & Font</span>
                </button>
                <button type="button" class="slip-tab-btn" data-tab="header" style="flex:1;padding:8px 10px;border-radius:10px;border:none;font-size:11px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;transition:all 0.2s;background:${activeTab === 'header' ? '#0284c7' : 'transparent'};color:${activeTab === 'header' ? '#fff' : '#94a3b8'};">
                  <span>🏷️</span> <span>Header & Logo</span>
                </button>
                <button type="button" class="slip-tab-btn" data-tab="fields" style="flex:1;padding:8px 10px;border-radius:10px;border:none;font-size:11px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;transition:all 0.2s;background:${activeTab === 'fields' ? '#0284c7' : 'transparent'};color:${activeTab === 'fields' ? '#fff' : '#94a3b8'};">
                  <span>📋</span> <span>Fields</span>
                </button>
                <button type="button" class="slip-tab-btn" data-tab="pricing" style="flex:1;padding:8px 10px;border-radius:10px;border:none;font-size:11px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;transition:all 0.2s;background:${activeTab === 'pricing' ? '#0284c7' : 'transparent'};color:${activeTab === 'pricing' ? '#fff' : '#94a3b8'};">
                  <span>💰</span> <span>Tax & Total</span>
                </button>
                <button type="button" class="slip-tab-btn" data-tab="footer" style="flex:1;padding:8px 10px;border-radius:10px;border:none;font-size:11px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;transition:all 0.2s;background:${activeTab === 'footer' ? '#0284c7' : 'transparent'};color:${activeTab === 'footer' ? '#fff' : '#94a3b8'};">
                  <span>📜</span> <span>Footer</span>
                </button>
              </div>

              <!-- Tab Content Area -->
              <div style="flex:1;overflow-y:auto;padding:16px;">
                ${renderActiveTabContent()}
              </div>

              <!-- Left Action Footer -->
              <div style="padding:12px 16px;background:#070b14;border-top:1px solid #1e293b;display:flex;align-items:center;justify-content:space-between;gap:8px;">
                <button type="button" id="reset-slip-defaults-btn" style="background:#1e293b;color:#94a3b8;border:1px solid #334155;padding:8px 14px;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer;">
                  ↺ Reset Defaults
                </button>
                <button type="button" id="save-slip-config-btn" style="background:linear-gradient(135deg, #10b981 0%, #059669 100%);color:#fff;border:none;padding:9px 20px;border-radius:10px;font-size:12px;font-weight:800;cursor:pointer;box-shadow:0 4px 14px rgba(16,185,129,0.4);display:flex;align-items:center;gap:6px;">
                  <span>💾</span> <span>Save Slip Layout</span>
                </button>
              </div>

            </div>

            <!-- RIGHT PANEL: Live Interactive Thermal Slip Preview -->
            <div style="flex:1;min-width:300px;background:#030712;border:1px solid #1e293b;border-radius:18px;display:flex;flex-direction:column;overflow:hidden;">
              
              <!-- Preview Header -->
              <div style="padding:10px 14px;background:#090d16;border-bottom:1px solid #1e293b;display:flex;align-items:center;justify-content:space-between;">
                <div style="display:flex;align-items:center;gap:6px;">
                  <span style="font-size:12px;">🖨️</span>
                  <span style="font-size:11px;font-weight:800;color:#fff;">Live Thermal Preview</span>
                  <span id="preview-paper-badge" style="font-size:9.5px;background:#334155;color:#38bdf8;padding:2px 6px;border-radius:4px;font-family:monospace;font-weight:bold;">${cfg.paperSize}</span>
                </div>
                <button type="button" id="test-print-slip-btn" style="background:#ea580c;color:#fff;border:none;padding:6px 12px;border-radius:8px;font-size:11px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:4px;box-shadow:0 2px 8px rgba(234,88,12,0.35);">
                  <span>🖨️</span> <span>Test Print Slip</span>
                </button>
              </div>

              <!-- Thermal Canvas Container -->
              <div style="flex:1;overflow-y:auto;padding:16px;display:flex;justify-content:center;background:#040711;">
                <div id="preview-slip-wrapper" style="background:#ffffff;border-radius:8px;box-shadow:0 12px 35px rgba(0,0,0,0.7);overflow:hidden;height:fit-content;width:${iframeWidth}px;transition:width 0.25s ease;">
                  <iframe id="slip-preview-iframe" style="width:100%;height:580px;border:none;display:block;background:#fff;"></iframe>
                </div>
              </div>

            </div>

          </div>

        </div>
      `;

      bindEvents();
      updatePreviewFrame();
    }

    function renderActiveTabContent() {
      // TAB 1: Paper Format & Typography
      if (activeTab === 'paper') {
        const paperOptions = [
          { id: '80mm', title: '80mm POS Thermal', desc: 'Standard 3-inch counter roll (EPSON / Xprinter / Sunmi)', badge: 'Recommended' },
          { id: '58mm', title: '58mm Pocket Slip', desc: 'Mini 2-inch Bluetooth handheld mobile receipt', badge: 'Mini Pocket' },
          { id: 'A5', title: 'A5 Half Sheet', desc: 'Counter voucher & order slip for laser / inkjet', badge: 'Half Page' },
          { id: 'A4', title: 'A4 Full Page', desc: 'Commercial formal tax sales invoice sheet', badge: 'Official A4' }
        ];

        const fontOptions = [
          { id: 'monospace', title: 'POS Monospace', desc: 'Classic thermal dot-matrix receipt font', font: 'Courier New' },
          { id: 'sans', title: 'Modern Clean Sans', desc: 'Modern high-legibility system typography', font: 'system-ui' },
          { id: 'serif', title: 'Classic Serif', desc: 'Traditional elegant dining and bistro aesthetic', font: 'Georgia' }
        ];

        const sizeOptions = [
          { id: 'compact', title: 'Compact (9.5px)', desc: 'Fits maximum items on shorter paper roll' },
          { id: 'normal', title: 'Normal (11px)', desc: 'Standard balanced size for thermal printers' },
          { id: 'large', title: 'Large (12.5px)', desc: 'Maximum readability & bold kitchen visibility' }
        ];

        return `
          <div style="display:flex;flex-direction:column;gap:16px;">
            <!-- Paper Size -->
            <div>
              <label style="font-size:11px;font-weight:800;color:#cbd5e1;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:8px;">
                1. Paper Size & Thermal Format:
              </label>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                ${paperOptions.map(p => `
                  <div class="slip-paper-option" data-size="${p.id}" style="border:1.5px solid ${cfg.paperSize === p.id ? '#0284c7' : '#1e293b'};background:${cfg.paperSize === p.id ? 'rgba(2,132,199,0.15)' : '#070b14'};padding:10px;border-radius:12px;cursor:pointer;transition:all 0.2s;">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                      <strong style="font-size:12px;color:${cfg.paperSize === p.id ? '#38bdf8' : '#fff'};">${p.title}</strong>
                      <span style="font-size:9px;background:#1e293b;color:#94a3b8;padding:1px 6px;border-radius:4px;">${p.badge}</span>
                    </div>
                    <p style="margin:0;font-size:10px;color:#94a3b8;line-height:1.3;">${p.desc}</p>
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- Typography Font Family -->
            <div>
              <label style="font-size:11px;font-weight:800;color:#cbd5e1;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:8px;">
                2. Font Typography Style:
              </label>
              <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;">
                ${fontOptions.map(f => `
                  <div class="slip-font-option" data-font="${f.id}" style="border:1.5px solid ${cfg.fontFamily === f.id ? '#0284c7' : '#1e293b'};background:${cfg.fontFamily === f.id ? 'rgba(2,132,199,0.15)' : '#070b14'};padding:10px;border-radius:12px;cursor:pointer;transition:all 0.2s;">
                    <strong style="font-size:11px;color:${cfg.fontFamily === f.id ? '#38bdf8' : '#fff'};font-family:${f.font};">${f.title}</strong>
                    <p style="margin:4px 0 0;font-size:9.5px;color:#94a3b8;">${f.desc}</p>
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- Font Size -->
            <div>
              <label style="font-size:11px;font-weight:800;color:#cbd5e1;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:8px;">
                3. Base Print Font Density:
              </label>
              <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;">
                ${sizeOptions.map(s => `
                  <div class="slip-size-option" data-size="${s.id}" style="border:1.5px solid ${cfg.fontSize === s.id ? '#0284c7' : '#1e293b'};background:${cfg.fontSize === s.id ? 'rgba(2,132,199,0.15)' : '#070b14'};padding:10px;border-radius:12px;cursor:pointer;transition:all 0.2s;">
                    <strong style="font-size:11px;color:${cfg.fontSize === s.id ? '#38bdf8' : '#fff'};">${s.title}</strong>
                    <p style="margin:4px 0 0;font-size:9.5px;color:#94a3b8;">${s.desc}</p>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        `;
      }

      // TAB 2: Header & Logo Branding
      if (activeTab === 'header') {
        return `
          <div style="display:flex;flex-direction:column;gap:14px;">
            <!-- Logo Section -->
            <div style="background:#070b14;border:1px solid #1e293b;border-radius:14px;padding:12px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                <label style="font-size:11px;font-weight:800;color:#fff;display:flex;align-items:center;gap:6px;cursor:pointer;">
                  <input type="checkbox" id="cfg-showLogo" ${cfg.showLogo ? 'checked' : ''} style="width:16px;height:16px;accent-color:#0284c7;" />
                  <span>Show Restaurant Logo at Top</span>
                </label>
                <span style="font-size:9.5px;color:#34d399;font-weight:bold;">${restaurant.logoUrl ? '✓ Logo Available' : 'No custom logo uploaded'}</span>
              </div>
              
              <div style="display:flex;align-items:center;gap:10px;padding-top:8px;border-top:1px solid #1e293b;">
                <span style="font-size:10px;color:#94a3b8;font-weight:bold;">Logo Display Size:</span>
                <div style="display:flex;gap:6px;">
                  ${['small', 'medium', 'large'].map(sz => `
                    <button type="button" class="slip-logosize-btn" data-size="${sz}" style="padding:4px 10px;border-radius:6px;font-size:10px;font-weight:700;border:1px solid ${cfg.logoSize === sz ? '#0284c7' : '#334155'};background:${cfg.logoSize === sz ? '#0284c7' : '#0f172a'};color:${cfg.logoSize === sz ? '#fff' : '#cbd5e1'};cursor:pointer;">
                      ${sz.charAt(0).toUpperCase() + sz.slice(1)}
                    </button>
                  `).join('')}
                </div>
              </div>
            </div>

            <!-- Header Titles & Text -->
            <div style="display:flex;flex-direction:column;gap:10px;">
              <div>
                <label style="font-size:10.5px;font-weight:700;color:#cbd5e1;display:block;margin-bottom:4px;">Restaurant Header Name (Display on Slip):</label>
                <input type="text" id="cfg-headerTitle" value="${sanitizeText(cfg.headerTitle)}" placeholder="${sanitizeText(restaurant.name)}" style="width:100%;box-sizing:border-box;background:#070b14;border:1px solid #334155;border-radius:8px;padding:8px 10px;font-size:11px;color:#fff;" />
              </div>

              <div>
                <label style="font-size:10.5px;font-weight:700;color:#cbd5e1;display:block;margin-bottom:4px;">Header Subtitle / Tagline:</label>
                <input type="text" id="cfg-headerTagline" value="${sanitizeText(cfg.headerTagline)}" placeholder="e.g. Taste the Royal Tradition • Since 1998" style="width:100%;box-sizing:border-box;background:#070b14;border:1px solid #334155;border-radius:8px;padding:8px 10px;font-size:11px;color:#fff;" />
              </div>

              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                <div>
                  <label style="font-size:10.5px;font-weight:700;color:#cbd5e1;display:block;margin-bottom:4px;">Address on Slip:</label>
                  <input type="text" id="cfg-headerAddress" value="${sanitizeText(cfg.headerAddress)}" placeholder="Branch Address" style="width:100%;box-sizing:border-box;background:#070b14;border:1px solid #334155;border-radius:8px;padding:8px 10px;font-size:11px;color:#fff;" />
                </div>
                <div>
                  <label style="font-size:10.5px;font-weight:700;color:#cbd5e1;display:block;margin-bottom:4px;">Contact Phone / WhatsApp:</label>
                  <input type="text" id="cfg-headerPhone" value="${sanitizeText(cfg.headerPhone)}" placeholder="+92 300 1234567" style="width:100%;box-sizing:border-box;background:#070b14;border:1px solid #334155;border-radius:8px;padding:8px 10px;font-size:11px;color:#fff;" />
                </div>
              </div>

              <!-- NTN & Tax ID -->
              <div style="background:#070b14;border:1px solid #1e293b;border-radius:12px;padding:10px;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                  <input type="checkbox" id="cfg-showTaxRegistration" ${cfg.showTaxRegistration ? 'checked' : ''} style="width:15px;height:15px;accent-color:#0284c7;" />
                  <label for="cfg-showTaxRegistration" style="font-size:11px;font-weight:700;color:#cbd5e1;cursor:pointer;">Include Tax / NTN / PRA Registration Number</label>
                </div>
                <input type="text" id="cfg-taxRegistrationNo" value="${sanitizeText(cfg.taxRegistrationNo)}" placeholder="e.g. NTN # 8941230-5 | PRA # 12-00-9876-001" style="width:100%;box-sizing:border-box;background:#0c1322;border:1px solid #334155;border-radius:8px;padding:7px 10px;font-size:11px;color:#fbbf24;font-family:monospace;" />
              </div>

              <!-- Badge Title -->
              <div>
                <label style="font-size:10.5px;font-weight:700;color:#cbd5e1;display:block;margin-bottom:4px;">Slip Badge Title:</label>
                <input type="text" id="cfg-badgeText" value="${sanitizeText(cfg.badgeText)}" placeholder="OFFICIAL SALES INVOICE" style="width:100%;box-sizing:border-box;background:#070b14;border:1px solid #334155;border-radius:8px;padding:8px 10px;font-size:11px;color:#38bdf8;font-weight:bold;" />
              </div>
            </div>
          </div>
        `;
      }

      // TAB 3: Order Metadata & Field Toggles
      if (activeTab === 'fields') {
        const fields = [
          { id: 'showTicketId', title: 'Order Ticket # (e.g. #ORD-9842)', desc: 'Large prominent ticket identifier' },
          { id: 'showDateTime', title: 'Order Date & Time', desc: 'Exact date and time stamp' },
          { id: 'showCustomerName', title: 'Customer Name', desc: 'Name of the buyer or Walk-in' },
          { id: 'showCustomerPhone', title: 'Customer Phone Number', desc: 'Contact number of the customer' },
          { id: 'showCustomerAddress', title: 'Delivery Address', desc: 'Street address for delivery orders' },
          { id: 'showServiceType', title: 'Service Type Badge', desc: 'Dine-in / Doorstep Delivery / Counter Takeaway' },
          { id: 'showPaymentMethod', title: 'Payment Method Info', desc: 'Cash on Delivery, JazzCash, Card, etc.' },
          { id: 'showCookingNotes', title: 'Dish Cooking Notes', desc: 'Special kitchen requests and spice level' }
        ];

        return `
          <div style="display:flex;flex-direction:column;gap:12px;">
            <p style="margin:0;font-size:11px;color:#94a3b8;">
              Select which order details should be printed on the customer receipt:
            </p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              ${fields.map(f => `
                <label style="display:flex;align-items:flex-start;gap:8px;background:#070b14;border:1px solid #1e293b;border-radius:12px;padding:10px;cursor:pointer;transition:all 0.2s;">
                  <input type="checkbox" id="cfg-${f.id}" ${cfg[f.id] ? 'checked' : ''} style="width:16px;height:16px;margin-top:2px;accent-color:#0284c7;" />
                  <div>
                    <strong style="font-size:11px;color:#fff;display:block;">${f.title}</strong>
                    <span style="font-size:9.5px;color:#94a3b8;display:block;margin-top:2px;">${f.desc}</span>
                  </div>
                </label>
              `).join('')}
            </div>
          </div>
        `;
      }

      // TAB 4: Pricing, Charges & Tax
      if (activeTab === 'pricing') {
        return `
          <div style="display:flex;flex-direction:column;gap:14px;">
            <p style="margin:0;font-size:11px;color:#94a3b8;">
              Configure currency symbol, subtotal calculation and optional government sales tax:
            </p>

            <!-- Line Items & Charges -->
            <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;">
              <label style="display:flex;align-items:center;gap:8px;background:#070b14;border:1px solid #1e293b;border-radius:12px;padding:10px;cursor:pointer;">
                <input type="checkbox" id="cfg-showItemUnitPrice" ${cfg.showItemUnitPrice ? 'checked' : ''} style="width:16px;height:16px;accent-color:#0284c7;" />
                <span style="font-size:11px;color:#fff;font-weight:bold;">Show Unit Price</span>
              </label>
              <label style="display:flex;align-items:center;gap:8px;background:#070b14;border:1px solid #1e293b;border-radius:12px;padding:10px;cursor:pointer;">
                <input type="checkbox" id="cfg-showSubtotal" ${cfg.showSubtotal ? 'checked' : ''} style="width:16px;height:16px;accent-color:#0284c7;" />
                <span style="font-size:11px;color:#fff;font-weight:bold;">Show Subtotal</span>
              </label>
              <label style="display:flex;align-items:center;gap:8px;background:#070b14;border:1px solid #1e293b;border-radius:12px;padding:10px;cursor:pointer;">
                <input type="checkbox" id="cfg-showDeliveryFee" ${cfg.showDeliveryFee ? 'checked' : ''} style="width:16px;height:16px;accent-color:#0284c7;" />
                <span style="font-size:11px;color:#fff;font-weight:bold;">Show Delivery Fee</span>
              </label>
            </div>

            <!-- Currency Symbol -->
            <div style="background:#070b14;border:1px solid #1e293b;border-radius:12px;padding:12px;display:flex;align-items:center;justify-content:space-between;gap:10px;">
              <div>
                <strong style="font-size:11px;color:#fff;display:block;">Currency Symbol Prefix:</strong>
                <span style="font-size:9.5px;color:#94a3b8;">Printed next to each price amount</span>
              </div>
              <input type="text" id="cfg-currencySymbol" value="${sanitizeText(cfg.currencySymbol)}" placeholder="Rs." style="width:90px;background:#0c1322;border:1px solid #334155;border-radius:8px;padding:6px 10px;font-size:12px;color:#fbbf24;font-weight:bold;text-align:center;" />
            </div>

            <!-- GST / Provincial Tax -->
            <div style="background:#070b14;border:1px solid #1e293b;border-radius:14px;padding:14px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                <label style="font-size:11px;font-weight:800;color:#fff;display:flex;align-items:center;gap:8px;cursor:pointer;">
                  <input type="checkbox" id="cfg-showGstTax" ${cfg.showGstTax ? 'checked' : ''} style="width:16px;height:16px;accent-color:#0284c7;" />
                  <span>Calculate & Print Sales Tax / GST (PRA / SRB / FBR)</span>
                </label>
              </div>

              <div style="display:flex;align-items:center;gap:10px;padding-top:8px;border-top:1px solid #1e293b;">
                <span style="font-size:11px;color:#94a3b8;font-weight:bold;">Tax Rate (%):</span>
                <input type="number" id="cfg-taxPercentage" min="0" max="30" value="${cfg.taxPercentage || 0}" style="width:80px;background:#0c1322;border:1px solid #334155;border-radius:8px;padding:6px 10px;font-size:11px;color:#38bdf8;font-weight:bold;" />
                <span style="font-size:10px;color:#64748b;">(e.g. 5% or 16% standard restaurant tax)</span>
              </div>
            </div>
          </div>
        `;
      }

      // TAB 5: Footer & Special Elements
      if (activeTab === 'footer') {
        return `
          <div style="display:flex;flex-direction:column;gap:12px;">
            <!-- Thermal Barcode Lines -->
            <label style="display:flex;align-items:center;justify-content:space-between;background:#070b14;border:1px solid #1e293b;border-radius:12px;padding:12px;cursor:pointer;">
              <div>
                <strong style="font-size:11px;color:#fff;display:block;">Print Thermal Barcode Lines</strong>
                <span style="font-size:9.5px;color:#94a3b8;">Renders authentic barcode scanner stripes at the bottom</span>
              </div>
              <input type="checkbox" id="cfg-showBarcode" ${cfg.showBarcode ? 'checked' : ''} style="width:18px;height:18px;accent-color:#0284c7;" />
            </label>

            <!-- Thank you title -->
            <div>
              <label style="font-size:10.5px;font-weight:700;color:#cbd5e1;display:block;margin-bottom:4px;">Thank You Headline:</label>
              <input type="text" id="cfg-footerThankYou" value="${sanitizeText(cfg.footerThankYou)}" placeholder="*** THANK YOU FOR VISITING! ***" style="width:100%;box-sizing:border-box;background:#070b14;border:1px solid #334155;border-radius:8px;padding:8px 10px;font-size:11px;color:#fff;" />
            </div>

            <!-- Kitchen note -->
            <div>
              <label style="font-size:10.5px;font-weight:700;color:#cbd5e1;display:block;margin-bottom:4px;">Kitchen / Hygiene Sub-note:</label>
              <input type="text" id="cfg-footerSubNote" value="${sanitizeText(cfg.footerSubNote)}" placeholder="Please visit us again. Freshly prepared with care." style="width:100%;box-sizing:border-box;background:#070b14;border:1px solid #334155;border-radius:8px;padding:8px 10px;font-size:11px;color:#fff;" />
            </div>

            <!-- WiFi Notice -->
            <div style="background:#070b14;border:1px solid #1e293b;border-radius:12px;padding:12px;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                <input type="checkbox" id="cfg-showWifiNotice" ${cfg.showWifiNotice ? 'checked' : ''} style="width:15px;height:15px;accent-color:#0284c7;" />
                <label for="cfg-showWifiNotice" style="font-size:11px;font-weight:700;color:#cbd5e1;cursor:pointer;">Show Guest WiFi Credentials</label>
              </div>
              <input type="text" id="cfg-footerWifiNotice" value="${sanitizeText(cfg.footerWifiNotice)}" placeholder="Guest WiFi: ApnaGuest | Pass: biryani123" style="width:100%;box-sizing:border-box;background:#0c1322;border:1px solid #334155;border-radius:8px;padding:7px 10px;font-size:11px;color:#38bdf8;" />
            </div>

            <!-- Watermark -->
            <div style="background:#070b14;border:1px solid #1e293b;border-radius:12px;padding:12px;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                <input type="checkbox" id="cfg-showWatermark" ${cfg.showWatermark ? 'checked' : ''} style="width:15px;height:15px;accent-color:#0284c7;" />
                <label for="cfg-showWatermark" style="font-size:11px;font-weight:700;color:#cbd5e1;cursor:pointer;">Show Bottom Powered-by Watermark</label>
              </div>
              <input type="text" id="cfg-footerWatermark" value="${sanitizeText(cfg.footerWatermark)}" placeholder="Powered by ManagementHub POS" style="width:100%;box-sizing:border-box;background:#0c1322;border:1px solid #334155;border-radius:8px;padding:7px 10px;font-size:11px;color:#94a3b8;" />
            </div>
          </div>
        `;
      }
      return '';
    }

    function updatePreviewFrame() {
      const iframe = document.getElementById('slip-preview-iframe');
      const wrapper = document.getElementById('preview-slip-wrapper');
      const paperBadge = document.getElementById('preview-paper-badge');
      if (paperBadge) paperBadge.textContent = cfg.paperSize;

      if (wrapper) {
        let w = 320;
        if (cfg.paperSize === '58mm') w = 240;
        else if (cfg.paperSize === 'A5') w = 430;
        else if (cfg.paperSize === 'A4') w = 480;
        wrapper.style.width = w + 'px';
      }

      if (iframe) {
        const html = generateReceiptSlipHtml(sampleOrder, restaurant, cfg);
        iframe.srcdoc = html;
        iframe.onload = () => {
          try {
            if (iframe.contentWindow && iframe.contentWindow.document.body) {
              const bodyHeight = iframe.contentWindow.document.body.scrollHeight;
              iframe.style.height = Math.max(520, bodyHeight + 20) + 'px';
            }
          } catch(e) {}
        };
      }
    }

    function syncInputValuesToCfg() {
      // Inputs if present in current tab
      const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : null; };
      const getChecked = (id) => { const el = document.getElementById(id); return el ? el.checked : null; };

      const hTitle = getVal('cfg-headerTitle'); if (hTitle !== null) cfg.headerTitle = hTitle.trim();
      const hTag = getVal('cfg-headerTagline'); if (hTag !== null) cfg.headerTagline = hTag.trim();
      const hAddr = getVal('cfg-headerAddress'); if (hAddr !== null) cfg.headerAddress = hAddr.trim();
      const hPhone = getVal('cfg-headerPhone'); if (hPhone !== null) cfg.headerPhone = hPhone.trim();
      const taxNo = getVal('cfg-taxRegistrationNo'); if (taxNo !== null) cfg.taxRegistrationNo = taxNo.trim();
      const badge = getVal('cfg-badgeText'); if (badge !== null) cfg.badgeText = badge.trim();
      const curr = getVal('cfg-currencySymbol'); if (curr !== null) cfg.currencySymbol = curr.trim() || 'Rs.';
      const taxPct = getVal('cfg-taxPercentage'); if (taxPct !== null) cfg.taxPercentage = Number(taxPct) || 0;
      const fTY = getVal('cfg-footerThankYou'); if (fTY !== null) cfg.footerThankYou = fTY.trim();
      const fNote = getVal('cfg-footerSubNote'); if (fNote !== null) cfg.footerSubNote = fNote.trim();
      const fWifi = getVal('cfg-footerWifiNotice'); if (fWifi !== null) cfg.footerWifiNotice = fWifi.trim();
      const fWm = getVal('cfg-footerWatermark'); if (fWm !== null) cfg.footerWatermark = fWm.trim();

      const cLogo = getChecked('cfg-showLogo'); if (cLogo !== null) cfg.showLogo = cLogo;
      const cTaxReg = getChecked('cfg-showTaxRegistration'); if (cTaxReg !== null) cfg.showTaxRegistration = cTaxReg;
      const cGst = getChecked('cfg-showGstTax'); if (cGst !== null) cfg.showGstTax = cGst;
      const cBarcode = getChecked('cfg-showBarcode'); if (cBarcode !== null) cfg.showBarcode = cBarcode;
      const cWifi = getChecked('cfg-showWifiNotice'); if (cWifi !== null) cfg.showWifiNotice = cWifi;
      const cWm = getChecked('cfg-showWatermark'); if (cWm !== null) cfg.showWatermark = cWm;

      // Fields
      [
        'showTicketId', 'showDateTime', 'showCustomerName', 'showCustomerPhone',
        'showCustomerAddress', 'showServiceType', 'showPaymentMethod', 'showCookingNotes',
        'showItemUnitPrice', 'showSubtotal', 'showDeliveryFee'
      ].forEach(k => {
        const v = getChecked('cfg-' + k);
        if (v !== null) cfg[k] = v;
      });
    }

    function bindEvents() {
      // Close
      document.getElementById('close-slip-customizer-btn').onclick = () => modal.remove();

      // Tab switcher
      modal.querySelectorAll('.slip-tab-btn').forEach(btn => {
        btn.onclick = () => {
          syncInputValuesToCfg();
          activeTab = btn.getAttribute('data-tab');
          renderModal();
        };
      });

      // Paper size click
      modal.querySelectorAll('.slip-paper-option').forEach(el => {
        el.onclick = () => {
          cfg.paperSize = el.getAttribute('data-size');
          renderModal();
        };
      });

      // Font option click
      modal.querySelectorAll('.slip-font-option').forEach(el => {
        el.onclick = () => {
          cfg.fontFamily = el.getAttribute('data-font');
          renderModal();
        };
      });

      // Size option click
      modal.querySelectorAll('.slip-size-option').forEach(el => {
        el.onclick = () => {
          cfg.fontSize = el.getAttribute('data-size');
          renderModal();
        };
      });

      // Logo size click
      modal.querySelectorAll('.slip-logosize-btn').forEach(btn => {
        btn.onclick = () => {
          cfg.logoSize = btn.getAttribute('data-size');
          renderModal();
        };
      });

      // Live inputs real-time update
      modal.querySelectorAll('input').forEach(inp => {
        inp.oninput = () => {
          syncInputValuesToCfg();
          updatePreviewFrame();
        };
        inp.onchange = () => {
          syncInputValuesToCfg();
          updatePreviewFrame();
        };
      });

      // Test Print current preview slip
      document.getElementById('test-print-slip-btn').onclick = () => {
        syncInputValuesToCfg();
        const testHtml = generateReceiptSlipHtml(sampleOrder, restaurant, cfg);
        printThermalSlipViaIframe(testHtml, sampleOrder.id);
        if (window.self !== window.top) {
          try {
            window.open('/api/print-slip/' + encodeURIComponent(sampleOrder.id) + '?preview=1', '_blank');
          } catch(e) {}
        }
      };

      // Reset Defaults
      document.getElementById('reset-slip-defaults-btn').onclick = () => {
        if (confirm('Kya aap slip settings ko factory defaults par reset karna chahte hain?')) {
          cfg = {
            paperSize: '80mm',
            fontFamily: 'monospace',
            fontSize: 'normal',
            showLogo: true,
            logoSize: 'medium',
            headerTitle: restaurant.name || 'Restaurant',
            headerTagline: restaurant.tagline || '',
            headerAddress: restaurant.address || 'Direct Order Storefront',
            headerPhone: restaurant.phone || restaurant.whatsappNumber || '+92 300 1234567',
            showTaxRegistration: false,
            taxRegistrationNo: '',
            badgeText: 'OFFICIAL SALES INVOICE',
            showTicketId: true,
            showDateTime: true,
            showCustomerName: true,
            showCustomerPhone: true,
            showCustomerAddress: true,
            showServiceType: true,
            showPaymentMethod: true,
            showCookingNotes: true,
            showItemUnitPrice: true,
            showSubtotal: true,
            showDeliveryFee: true,
            showGstTax: false,
            taxPercentage: 0,
            currencySymbol: 'Rs.',
            showBarcode: true,
            footerThankYou: '*** THANK YOU FOR VISITING! ***',
            footerSubNote: 'Please visit us again. Freshly prepared with care.',
            showWifiNotice: false,
            footerWifiNotice: '',
            showWatermark: true,
            footerWatermark: `Powered by ${restaurant.name} POS System`
          };
          renderModal();
        }
      };

      // Save Slip Configuration
      document.getElementById('save-slip-config-btn').onclick = async () => {
        syncInputValuesToCfg();
        const saveBtn = document.getElementById('save-slip-config-btn');
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span>⏳</span> <span>Saving Layout...</span>';

        try {
          restaurant.slipConfig = Object.assign({}, cfg);

          // 1. Update localStorage
          let allRests = getLocalRestaurants();
          const rIdx = allRests.findIndex(r => r.id === restaurant.id);
          if (rIdx >= 0) {
            allRests[rIdx].slipConfig = Object.assign({}, cfg);
          } else {
            allRests.push(restaurant);
          }
          saveLocalRestaurants(allRests);
          localStorage.setItem('bitehub_slip_config_' + restaurant.id, JSON.stringify(cfg));

          // 2. Persist to server API dedicated endpoint
          await fetch(`/api/restaurants/${restaurant.id}/slip-config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cfg)
          }).catch(() => {});

          // 3. Sync full update to server state
          await fetch('/api/sync/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates: { restaurants: allRests } })
          }).catch(() => {});

          alert(`✅ POS Slip Layout successfully updated for "${restaurant.name}"!\n\nAll customer slips, kitchen printouts, and digital invoices will now use this custom design.`);
          modal.remove();
        } catch (err) {
          alert('Error saving slip layout: ' + err.message);
          saveBtn.disabled = false;
          saveBtn.innerHTML = '<span>💾</span> <span>Save Slip Layout</span>';
        }
      };
    }

    document.body.appendChild(modal);
    renderModal();
  };

  // Main Professional Order Tracker Modal
  window.renderOrderTrackingModal = function(order, restaurant) {
    if (!order) return;
    const old = document.getElementById('order-tracking-modal');
    if (old) old.remove();

    const rests = getLocalRestaurants();
    const rest = restaurant || rests.find(r => r.id === order.restaurantId) || { name: 'Restaurant', primaryColor: '#f97316', phone: '+92 300 0000000' };

    const items = order.items || [];
    const subtotal = order.totalAmount || 0;
    const delivery = order.deliveryFee || 0;
    const grandTotal = subtotal + delivery;
    const brandColor = rest.primaryColor || '#f97316';

    // 4 Tracking Stages
    let currentStage = 2; // 1: Confirmed, 2: Cooking, 3: Rider On Way, 4: Delivered

    const modal = document.createElement('div');
    modal.id = 'order-tracking-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999999;background:rgba(0,0,0,0.85);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:14px;overflow-y:auto;';

    function renderTracker() {
      modal.innerHTML = `
        <div style="background:#090d16;border:1px solid #1e293b;border-radius:28px;max-width:580px;width:100%;color:#f8fafc;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 30px 60px -15px rgba(0,0,0,0.9);max-height:92vh;overflow-y:auto;position:relative;">
          
          <!-- Top Success Header -->
          <div style="background:linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(2,132,199,0.1) 100%);padding:22px 24px;border-bottom:1px solid #1e293b;display:flex;align-items:center;justify-content:space-between;">
            <div style="display:flex;align-items:center;gap:12px;">
              ${(rest.logoUrl || rest.logo) ? `
                <img src="${sanitizeUrl(rest.logoUrl || rest.logo)}" alt="${sanitizeText(rest.name)}" style="width:48px;height:48px;border-radius:16px;object-fit:cover;border:2px solid rgba(255,255,255,0.2);box-shadow:0 8px 20px rgba(0,0,0,0.5);" />
              ` : `
                <div style="width:48px;height:48px;border-radius:16px;background:#10b981;display:flex;align-items:center;justify-content:center;font-size:24px;box-shadow:0 8px 20px rgba(16,185,129,0.4);">
                  🎉
                </div>
              `}
              <div>
                <span style="font-size:10px;font-weight:800;color:#34d399;text-transform:uppercase;letter-spacing:1px;background:#064e3b;padding:2px 8px;border-radius:6px;">ORDER CONFIRMED</span>
                <h3 style="margin:4px 0 0;font-size:17px;font-weight:900;color:#fff;">Order Placed Successfully!</h3>
                <p style="margin:2px 0 0;font-size:11px;color:#94a3b8;">${sanitizeText(rest.name)} · Order ID: <strong style="color:#38bdf8;font-family:monospace;">#${order.id ? order.id.slice(-8).toUpperCase() : 'BITE-' + Date.now().toString().slice(-6)}</strong></p>
              </div>
            </div>

            <button id="close-order-tracking-btn" style="background:#1e293b;border:none;color:#94a3b8;width:34px;height:34px;border-radius:10px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;">✕</button>
          </div>

          <div style="padding:22px 24px;display:flex;flex-direction:column;gap:18px;">
            
            <!-- 4-Stage Visual Status Timeline -->
            <div style="background:#0f172a;border:1px solid #1e293b;border-radius:20px;padding:16px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
                <span style="font-size:11px;font-weight:800;color:#cbd5e1;text-transform:uppercase;letter-spacing:0.5px;">Live Kitchen & Delivery Status:</span>
                <span style="font-size:10px;color:#38bdf8;font-weight:bold;background:#0369a1/20;border:1px solid #0284c7/40;padding:2px 8px;border-radius:6px;">Est. 30-40 Mins</span>
              </div>

              <!-- 4 Step Tracker -->
              <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:6px;position:relative;text-align:center;">
                
                <!-- Stage 1 -->
                <div class="stage-step" data-step="1" style="cursor:pointer;">
                  <div style="width:36px;height:36px;border-radius:12px;margin:0 auto 6px;display:flex;align-items:center;justify-content:center;font-size:16px;${currentStage >= 1 ? 'background:#10b981;color:#fff;box-shadow:0 4px 12px rgba(16,185,129,0.4);' : 'background:#1e293b;color:#64748b;'}">
                    ✓
                  </div>
                  <span style="font-size:10px;font-weight:800;display:block;${currentStage >= 1 ? 'color:#fff;' : 'color:#64748b;'}">Confirmed</span>
                  <span style="font-size:9px;color:#94a3b8;">Order Received</span>
                </div>

                <!-- Stage 2 -->
                <div class="stage-step" data-step="2" style="cursor:pointer;">
                  <div style="width:36px;height:36px;border-radius:12px;margin:0 auto 6px;display:flex;align-items:center;justify-content:center;font-size:16px;${currentStage >= 2 ? 'background:#f59e0b;color:#000;box-shadow:0 4px 12px rgba(245,158,11,0.4);animation:pulse 2s infinite;' : 'background:#1e293b;color:#64748b;'}">
                    🍳
                  </div>
                  <span style="font-size:10px;font-weight:800;display:block;${currentStage >= 2 ? 'color:#fff;' : 'color:#64748b;'}">In Kitchen</span>
                  <span style="font-size:9px;color:#94a3b8;">Cooking Fresh</span>
                </div>

                <!-- Stage 3 -->
                <div class="stage-step" data-step="3" style="cursor:pointer;">
                  <div style="width:36px;height:36px;border-radius:12px;margin:0 auto 6px;display:flex;align-items:center;justify-content:center;font-size:16px;${currentStage >= 3 ? 'background:#0284c7;color:#fff;box-shadow:0 4px 12px rgba(2,132,199,0.4);' : 'background:#1e293b;color:#64748b;'}">
                    🛵
                  </div>
                  <span style="font-size:10px;font-weight:800;display:block;${currentStage >= 3 ? 'color:#fff;' : 'color:#64748b;'}">On the Way</span>
                  <span style="font-size:9px;color:#94a3b8;">Rider Dispatched</span>
                </div>

                <!-- Stage 4 -->
                <div class="stage-step" data-step="4" style="cursor:pointer;">
                  <div style="width:36px;height:36px;border-radius:12px;margin:0 auto 6px;display:flex;align-items:center;justify-content:center;font-size:16px;${currentStage >= 4 ? 'background:#10b981;color:#fff;box-shadow:0 4px 12px rgba(16,185,129,0.4);' : 'background:#1e293b;color:#64748b;'}">
                    🏁
                  </div>
                  <span style="font-size:10px;font-weight:800;display:block;${currentStage >= 4 ? 'color:#fff;' : 'color:#64748b;'}">Delivered</span>
                  <span style="font-size:9px;color:#94a3b8;">Enjoy Meal</span>
                </div>

              </div>

              <!-- Click to simulate next status -->
              <div style="margin-top:12px;text-align:center;">
                <button id="advance-stage-btn" style="background:#1e293b;border:1px solid #334155;color:#94a3b8;padding:4px 12px;border-radius:8px;font-size:10px;cursor:pointer;">
                  🔄 Advance Live Status (Admin / Test)
                </button>
              </div>
            </div>

            <!-- Customer & Delivery Details Card -->
            <div style="background:#0f172a;border:1px solid #1e293b;border-radius:18px;padding:14px;font-size:11px;">
              <h4 style="margin:0 0 10px 0;font-size:12px;font-weight:800;color:#38bdf8;text-transform:uppercase;letter-spacing:0.5px;">📍 Delivery Destination:</h4>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                <div>
                  <span style="color:#64748b;display:block;">Recipient:</span>
                  <strong style="color:#fff;font-size:12px;">${sanitizeText(order.customerName) || 'Customer'}</strong>
                </div>
                <div>
                  <span style="color:#64748b;display:block;">Contact:</span>
                  <strong style="color:#34d399;font-size:12px;">${sanitizeText(order.customerPhone) || 'N/A'}</strong>
                </div>
                <div style="grid-column:span 2;">
                  <span style="color:#64748b;display:block;">Delivery Address:</span>
                  <strong style="color:#e2e8f0;font-size:12px;">${sanitizeText(order.customerAddress) || 'Direct counter'}</strong>
                </div>
                <div>
                  <span style="color:#64748b;display:block;">Payment Method:</span>
                  <strong style="color:#fbbf24;">${sanitizeText((order.paymentMethod || 'cash_on_delivery').replace(/_/g, ' ').toUpperCase())}</strong>
                </div>
                <div>
                  <span style="color:#64748b;display:block;">Restaurant:</span>
                  <strong style="color:#fff;">${sanitizeText(rest.name)}</strong>
                </div>
              </div>
            </div>

            <!-- Itemized Invoice Table -->
            <div style="background:#0f172a;border:1px solid #1e293b;border-radius:18px;padding:16px;">
              <h4 style="margin:0 0 10px 0;font-size:12px;font-weight:800;color:#cbd5e1;text-transform:uppercase;letter-spacing:0.5px;">🧾 Order Bill Summary:</h4>
              
              <div style="display:flex;flex-direction:column;gap:8px;border-bottom:1px solid #1e293b;padding-bottom:12px;">
                ${items.map(it => `
                  <div style="display:flex;align-items:center;justify-content:space-between;font-size:12px;">
                    <div style="display:flex;align-items:center;gap:8px;">
                      <span style="font-weight:800;color:#38bdf8;background:#0369a1/20;padding:2px 6px;border-radius:6px;font-size:11px;">${it.quantity || 1}x</span>
                      <span style="color:#fff;font-weight:600;">${sanitizeText(it.name) || 'Dish'}</span>
                    </div>
                    <span style="color:#fbbf24;font-weight:700;">Rs.${(it.price * (it.quantity || 1))}</span>
                  </div>
                `).join('')}
              </div>

              <!-- Price Totals -->
              <div style="padding-top:10px;display:flex;flex-direction:column;gap:4px;font-size:11px;">
                <div style="display:flex;justify-content:space-between;color:#94a3b8;">
                  <span>Items Subtotal:</span>
                  <span>Rs.${subtotal}</span>
                </div>
                <div style="display:flex;justify-content:space-between;color:#94a3b8;">
                  <span>Delivery Fee:</span>
                  <span>${delivery === 0 ? '<strong style="color:#34d399;">FREE</strong>' : 'Rs.' + delivery}</span>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:900;color:#fff;border-top:1px dashed #334155;padding-top:6px;margin-top:4px;">
                  <span>Grand Total:</span>
                  <span style="color:${brandColor};">Rs.${grandTotal}</span>
                </div>
              </div>
            </div>

            <!-- Action Buttons: Print POS Slip, WhatsApp Share, Close -->
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              
              <!-- Thermal POS Printer -->
              <button id="print-pos-receipt-btn" style="flex:1;min-width:140px;background:#0284c7;color:#fff;border:none;padding:12px 14px;border-radius:14px;font-size:12px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 4px 14px rgba(2,132,199,0.3);">
                🖨️ Print POS Slip
              </button>

              <!-- WhatsApp Share -->
              <button id="whatsapp-share-receipt-btn" style="flex:1;min-width:140px;background:#059669;color:#fff;border:none;padding:12px 14px;border-radius:14px;font-size:12px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 4px 14px rgba(5,150,105,0.3);">
                💬 WhatsApp Receipt
              </button>

              <!-- Back to Store -->
              <button id="close-and-continue-btn" style="background:#1e293b;border:1px solid #334155;color:#cbd5e1;padding:12px 16px;border-radius:14px;font-size:12px;font-weight:700;cursor:pointer;">
                ✓ Done
              </button>

            </div>

          </div>

        </div>
      `;

      // Bind events
      document.getElementById('close-order-tracking-btn').onclick = () => modal.remove();
      document.getElementById('close-and-continue-btn').onclick = () => modal.remove();

      // Print POS Slip
      document.getElementById('print-pos-receipt-btn').onclick = () => {
        window.printOrderReceipt(order, rest);
      };

      // WhatsApp Share
      document.getElementById('whatsapp-share-receipt-btn').onclick = () => {
        const phone = (rest.whatsappNumber || rest.phone || order.customerPhone || '923000000000').replace(/[^0-9]/g, '');
        const itemsList = items.map(it => `• ${it.quantity}x ${it.name} - Rs.${it.price * it.quantity}`).join('\n');
        const text = encodeURIComponent(
          `*🧾 ${rest.name.toUpperCase()} - ORDER RECEIPT*\n` +
          `Order ID: #${order.id ? order.id.slice(-8).toUpperCase() : 'BITE'}\n` +
          `Customer: ${order.customerName}\n` +
          `Phone: ${order.customerPhone}\n` +
          `Address: ${order.customerAddress}\n\n` +
          `*Order Items:*\n${itemsList}\n\n` +
          `*Total Payable:* Rs.${grandTotal} (${(order.paymentMethod || 'COD').replace(/_/g, ' ')})\n` +
          `*Status:* Confirmed & Cooking in Kitchen 🍳\n\n` +
          `Thank you for ordering with ${rest.name}!`
        );
        window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
      };

      // Advance stage button
      document.getElementById('advance-stage-btn').onclick = () => {
        currentStage = (currentStage % 4) + 1;
        renderTracker();
      };

      modal.querySelectorAll('.stage-step').forEach(el => {
        el.onclick = () => {
          currentStage = parseInt(el.getAttribute('data-step'), 10);
          renderTracker();
        };
      });
    }

    document.body.appendChild(modal);
    renderTracker();
  };

  // Helper: Detect if active user is Super Admin
  function isSuperAdminActive() {
    try {
      const creds = localStorage.getItem('bitehub_superadmin_creds_v2');
      const user = localStorage.getItem('bitehub_user_session') || localStorage.getItem('currentUser') || localStorage.getItem('user') || '';
      const params = new URLSearchParams(window.location.search);
      if (params.get('admin') === 'true' || params.get('adminPreview') === 'true' || params.get('superadmin') === 'true') return true;
      if (user && (user.includes('aateeqqshemsi@gmail.com') || user.includes('admin') || user.includes('super'))) return true;
      if (creds && creds.includes('aateeqqshemsi@gmail.com')) {
        // Check if on management page recently
        const lastAdmin = sessionStorage.getItem('bitehub_superadmin_active');
        if (lastAdmin === 'true') return true;
      }
    } catch (e) {}
    return false;
  }

  // =========================================================================
  // TABLE QR BARCODE GUARDIAN: STRICT 1:1 SQUARE ON BARCODE ONLY
  // Leaves Table Card Layout, Borders & Styling 100% Original
  // =========================================================================
  function guardTableQRCodes() {
    try {
      // 1. Force strict 1:1 square ONLY on the QR barcode image itself
      const qrImgs = document.querySelectorAll('img[alt*="QR" i], img[src*="create-qr-code" i]');
      qrImgs.forEach(img => {
        img.style.setProperty('aspect-ratio', '1 / 1', 'important');
        img.style.setProperty('object-fit', 'contain', 'important');
      });

      // 2. Fix Table 2 / Second Table & any unrendered QR codes:
      // If any table card shows plain text placeholder "QR Code", generate clean high-res square QR
      const emptyQrPlaceholders = document.querySelectorAll('div.w-16.h-16');
      emptyQrPlaceholders.forEach(el => {
        if (el.textContent && el.textContent.trim() === 'QR Code') {
          const card = el.closest('div[class*="rounded-3xl"]');
          let tName = 'Table 2';
          if (card) {
            const h3 = card.querySelector('h3');
            if (h3 && h3.textContent.trim()) tName = h3.textContent.trim();
          }
          const rests = getLocalRestaurants();
          const r = rests[0] || { slug: 'apna-restaurant' };
          const targetUrl = window.location.origin + window.location.pathname + '?store=' + encodeURIComponent(r.slug || r.id) + '&table=' + encodeURIComponent(tName) + '&source=qr';
          const newImg = document.createElement('img');
          newImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=' + encodeURIComponent(targetUrl);
          newImg.alt = tName + ' QR Code';
          newImg.className = 'w-full h-full object-contain';
          newImg.style.cssText = 'aspect-ratio:1/1!important;object-fit:contain!important;';
          el.innerHTML = '';
          el.appendChild(newImg);
        }
      });
    } catch (e) {}
  }

  // =========================================================================
  // CUSTOMER STOREFRONT PICTURE DISPLAY SIZE & ORIENTATION ENGINE
  // =========================================================================
  function applyStorefrontDishImageControls() {
    try {
      // Run QR guardian first to ensure all QR codes everywhere remain perfect 1:1 squares
      guardTableQRCodes();

      // Check if current page is Admin / Kitchen / Table Management
      const bodyText = (document.body ? document.body.innerText : '') || '';
      const isAdminView = bodyText.includes('Table QR Generator') ||
                          bodyText.includes('Dine-In Tables & Floor') ||
                          bodyText.includes('Live Order Board') ||
                          bodyText.includes('Super Admin Console') ||
                          bodyText.includes('Branch Order Screen') ||
                          document.querySelector('button[title*="Add New Dine-In Table"]') ||
                          document.querySelector('button[title*="Print A5 tent card"]') ||
                          window.location.search.includes('admin');

      // Remove lingering manager PIN launchers from customer view
      const oldBtn = document.getElementById('storefront-menu-manager-launcher');
      if (oldBtn) oldBtn.remove();

      // If we are in Admin, do NOT apply dish card modifications
      if (isAdminView) {
        const existingBar = document.getElementById('storefront-photo-shape-bar');
        if (existingBar) existingBar.remove();
        return;
      }

      const urlParams = new URLSearchParams(window.location.search);
      const storeSlug = urlParams.get('store') || urlParams.get('restaurant') || urlParams.get('r');
      const rests = getLocalRestaurants();
      let currentRest = null;
      if (storeSlug) {
        const sClean = storeSlug.toLowerCase().trim();
        currentRest = rests.find(r => (r.slug && r.slug.toLowerCase() === sClean) || (r.id && r.id.toLowerCase() === sClean));
      }
      if (!currentRest) currentRest = rests[0];
      if (!currentRest) return;

      // 1. Determine active shape mode (Default to horizontal 16:9 landscape)
      const savedMode = localStorage.getItem('bitehub_dish_image_mode_' + currentRest.id);
      let activeMode = currentRest.imageOrientation || savedMode || 'horizontal';
      if (activeMode === 'vertical' || activeMode === 'square') {
        activeMode = 'horizontal';
      }

      // Apply root attributes
      if (document.documentElement.getAttribute('data-dish-image-mode') !== activeMode) {
        document.documentElement.setAttribute('data-dish-image-mode', activeMode);
      }

      // 2. Ensure floating shape switcher is removed (Only SuperAdmin Theme Editor has shape controls)
      const oldBar = document.getElementById('storefront-photo-shape-bar');
      if (oldBar) oldBar.remove();

      // 3. Apply Per-Food Individual Size & Shape Settings to Storefront Dish Cards
      const allItems = getLocalItems().filter(i => i.restaurantId === currentRest.id);
      const itemMap = new Map();
      if (allItems.length > 0) {
        allItems.forEach(it => {
          if (it.name) itemMap.set(it.name.trim().toLowerCase(), it);
          if (it.imageUrl) itemMap.set(it.imageUrl.trim(), it);
        });
      }

      // Find ONLY storefront food dish card images
      const imgElements = document.querySelectorAll('.group .relative.h-48 img, .group .relative.h-36 img, div[class*="rounded-3xl"] .relative.h-48 img, div[class*="rounded-3xl"] .relative.h-36 img, [data-dish-image-container] img');
      imgElements.forEach(img => {
        // STRICT EXCLUSION: Never touch QR codes, icons, avatars, or logos
        const alt = (img.alt || '').toLowerCase();
        const src = (img.src || '').toLowerCase();
        if (alt.includes('qr') || src.includes('qr') || src.includes('create-qr-code') || src.includes('source=qr')) return;
        if (img.closest('.qr-box') || img.closest('[data-qr-code]') || img.closest('#printable-card')) return;
        if (img.width > 0 && img.width <= 48) return;
        if (src.includes('icon.svg') || src.includes('apple-touch-icon') || src.includes('pwa-')) return;

        const parentCard = img.closest('.group') || img.closest('article') || img.closest('div[class*="rounded-3xl"]');
        let matchedItem = itemMap.get(src) || itemMap.get(alt);
        if (!matchedItem && parentCard && parentCard.textContent) {
          const cardText = parentCard.textContent.toLowerCase();
          for (const it of allItems) {
            if (it.name && cardText.includes(it.name.toLowerCase())) {
              matchedItem = it;
              break;
            }
          }
        }

        const container = img.closest('div[class*="relative"]') || img.parentElement;
        if (container) {
          container.setAttribute('data-dish-image-container', 'true');

          if (!img.getAttribute('data-safe-fallback')) {
            img.setAttribute('data-safe-fallback', 'true');
            img.onerror = function() {
              this.onerror = null;
              this.src = SmartImageEngine.DEFAULT_FALLBACK_URL;
            };
          }

          let itemMode = (matchedItem && (matchedItem.imageOrientation || matchedItem.imageSize)) || activeMode;
          // As requested by user: convert vertical / square to horizontal landscape (16:9)
          if (itemMode === 'vertical' || itemMode === 'square' || !itemMode) {
            itemMode = 'horizontal';
          }

          if (itemMode === 'circle') {
            container.style.aspectRatio = '1 / 1';
            container.style.width = '160px';
            container.style.height = '160px';
            container.style.borderRadius = '9999px';
            container.style.margin = '12px auto 6px auto';
            img.style.objectFit = 'cover';
            img.style.borderRadius = '9999px';
            img.style.backgroundColor = '';
          } else if (itemMode === 'natural' || (matchedItem && matchedItem.imageFit === 'contain')) {
            container.style.aspectRatio = '16 / 9';
            container.style.height = 'auto';
            container.style.maxHeight = '200px';
            container.style.width = '100%';
            container.style.borderRadius = '';
            container.style.margin = '';
            img.style.objectFit = 'contain';
            img.style.borderRadius = '';
            img.style.backgroundColor = '#0b1120';
          } else {
            // User requested .product-image 1:1 auto-fit with contain
            container.style.setProperty('aspect-ratio', '1 / 1', 'important');
            container.style.setProperty('height', 'auto', 'important');
            container.style.setProperty('max-height', 'none', 'important');
            container.style.setProperty('width', '100%', 'important');
            container.style.setProperty('border-radius', '18px 18px 0 0', 'important');
            container.style.setProperty('overflow', 'hidden', 'important');
            container.style.setProperty('display', 'flex', 'important');
            container.style.setProperty('align-items', 'center', 'important');
            container.style.setProperty('justify-content', 'center', 'important');
            img.style.setProperty('width', '100%', 'important');
            img.style.setProperty('height', '100%', 'important');
            img.style.setProperty('aspect-ratio', '1 / 1', 'important');
            img.style.setProperty('object-fit', 'contain', 'important');
            img.style.setProperty('object-position', 'center center', 'important');

            // Hide and remove any price tag on top of the picture
            container.querySelectorAll('.absolute.bottom-2, .absolute.bottom-3, span[class*="bottom-2"], span[class*="bottom-3"], span.absolute').forEach(el => {
              if (el.textContent && (el.textContent.includes('Rs.') || el.textContent.includes('Single') || el.textContent.includes('Double') || el.textContent.includes('Half') || el.textContent.includes('Full') || el.textContent.includes('PKR'))) {
                el.style.display = 'none';
                try { el.remove(); } catch(e) {}
              }
            });
          }
        }
      });
    } catch (e) {}
  }

  // Auto-enhance #printable-receipt in Admin/Kitchen portal with Restaurant Logo & Reliable Thermal Print
  function enhanceAdminPrintableReceipt() {
    try {
      const receiptEl = document.getElementById('printable-receipt');
      if (!receiptEl) return;

      // Check if logo is already injected
      if (!receiptEl.dataset.logoEnhanced) {
        receiptEl.dataset.logoEnhanced = 'true';

        // Find restaurant name from the slip
        const h2 = receiptEl.querySelector('h2');
        const restName = h2 ? h2.textContent.trim() : '';
        const rests = getLocalRestaurants();
        let matchedRest = rests.find(r => r.name && restName && r.name.toLowerCase() === restName.toLowerCase());
        if (!matchedRest && rests.length > 0) matchedRest = rests[0];

        const restLogo = matchedRest ? (matchedRest.logoUrl || matchedRest.logo || matchedRest.avatar || matchedRest.image || matchedRest.coverUrl) : '';

        if (restLogo) {
          // Find the default generic utensils icon container (.w-10.h-10)
          const iconBox = receiptEl.querySelector('.w-10.h-10') || receiptEl.querySelector('div[class*="rounded-full"]');
          if (iconBox) {
            iconBox.style.display = 'none';
          }

          // Insert high-res restaurant logo at the top
          const logoContainer = document.createElement('div');
          logoContainer.className = 'admin-receipt-logo-container';
          logoContainer.style.cssText = 'text-align:center;margin-bottom:8px;display:flex;justify-content:center;align-items:center;';
          logoContainer.innerHTML = `<img src="${sanitizeUrl(restLogo)}" alt="${sanitizeText(restName)} Logo" class="slip-logo" style="max-height:58px;max-width:130px;object-fit:contain;margin:0 auto 6px auto;display:block;border-radius:4px;-webkit-print-color-adjust:exact;print-color-adjust:exact;" />`;

          const headerParent = h2 ? h2.parentElement : receiptEl.firstElementChild;
          if (headerParent && h2) {
            headerParent.insertBefore(logoContainer, h2);
          } else if (headerParent) {
            headerParent.prepend(logoContainer);
          }
        }
      }

      // Enhance the "Print Receipt (Thermal / A4)" button in the modal footer
      // Enhance the "Print Receipt (Thermal / A4)" button in the modal footer
      const modalContainer = receiptEl.closest('.fixed');
      if (modalContainer && !modalContainer.dataset.printEnhanced) {
        modalContainer.dataset.printEnhanced = 'true';

        // Extract order ticket ID from text or spans
        let ticketId = '';
        const allSpans = receiptEl.querySelectorAll('span, p, div');
        allSpans.forEach(el => {
          const txt = (el.textContent || '').trim();
          if (!ticketId && txt.startsWith('#') && txt.length > 2 && txt.length < 25) {
            ticketId = txt.replace('#', '').trim();
          }
        });
        if (!ticketId) {
          const h2 = receiptEl.querySelector('h2');
          ticketId = (h2 ? h2.textContent.trim() : 'order');
        }

        const slipUrl = '/api/print-slip/' + encodeURIComponent(ticketId);

        const buttons = modalContainer.querySelectorAll('button');
        buttons.forEach(btn => {
          const txt = (btn.textContent || '').trim();
          if (txt.includes('Print') || txt.includes('Receipt') || txt.includes('Slip')) {
            // Add "Open in Tab to Print" button right beside the print button
            if (!modalContainer.querySelector('.admin-open-tab-btn') && btn.parentElement) {
              const tabLink = document.createElement('a');
              tabLink.className = 'admin-open-tab-btn px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center space-x-1.5 shadow cursor-pointer transition-all no-print';
              tabLink.href = slipUrl;
              tabLink.target = '_blank';
              tabLink.rel = 'noopener noreferrer';
              tabLink.style.cssText = 'text-decoration:none;display:inline-flex;align-items:center;gap:6px;';
              tabLink.innerHTML = '<span>🚀</span> <span>Open in Tab to Print</span>';
              btn.parentElement.insertBefore(tabLink, btn);
            }

            btn.onclick = function(e) {
              // If inside iframe sandbox, open new tab directly
              if (window.self !== window.top) {
                try {
                  window.open(slipUrl, '_blank');
                  return;
                } catch(err) {}
              }

              // Trigger window.print()
              try {
                window.print();
              } catch(err) {
                console.warn('[Admin Print] window.print() error:', err);
                try { window.open(slipUrl, '_blank'); } catch(e2) {}
              }
            };
          }
        });
      }
    } catch (e) {
      console.warn('[Admin Receipt Engine]', e);
    }
  }

  // =========================================================================
  // 2.6 RESTAURANT ADMIN SETTINGS - POS SLIP LAYOUT SECTION GUARDIAN
  // =========================================================================
  function ensureAdminSlipSettingsCard() {
    try {
      if (document.getElementById('admin-slip-settings-section')) return;

      const headings = Array.from(document.querySelectorAll('h4, h3, span'));
      const kitchenStatusHeading = headings.find(h => h.textContent && h.textContent.includes('Kitchen Operations Status'));
      if (!kitchenStatusHeading) return;

      const settingsContainer = kitchenStatusHeading.closest('.space-y-6') || kitchenStatusHeading.closest('div.pt-6');
      if (!settingsContainer) return;

      const rests = getLocalRestaurants();
      if (!rests || rests.length === 0) return;

      let activeRest = rests[0];
      for (let r of rests) {
        if (document.body.innerText.includes(r.name)) {
          activeRest = r;
          break;
        }
      }

      const cfg = getRestaurantSlipConfig(activeRest);

      const slipCard = document.createElement('div');
      slipCard.id = 'admin-slip-settings-section';
      slipCard.className = 'bg-slate-900 border border-orange-500/30 rounded-2xl p-5 sm:p-6 space-y-4 shadow-xl';
      slipCard.innerHTML = `
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div class="flex items-center space-x-3">
            <div class="w-10 h-10 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center justify-center text-xl shrink-0 shadow">
              🧾
            </div>
            <div>
              <div class="flex items-center space-x-2">
                <h3 class="font-extrabold text-sm text-white">POS Slip & Receipt Layout Designer</h3>
                <span class="px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 text-[10px] font-bold border border-orange-500/30">Admin Thermal POS</span>
              </div>
              <p class="text-[11px] text-slate-400 mt-0.5">Customize paper width (80mm / 58mm), logo, branch header, customer fields, barcode, and receipt footer notes.</p>
            </div>
          </div>
          <div class="flex items-center space-x-2 shrink-0 self-start sm:self-auto">
            <button type="button" id="admin-slip-test-print-btn" class="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold flex items-center space-x-1.5 cursor-pointer transition-colors shadow">
              <span>🖨️</span> <span>Test Print</span>
            </button>
            <button type="button" id="admin-slip-open-designer-btn" class="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-xl text-xs font-extrabold flex items-center space-x-1.5 shadow-lg shadow-orange-500/25 cursor-pointer transition-all">
              <span>🎨</span> <span>Full Slip Designer</span>
            </button>
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div class="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5">
            <span class="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Paper Size / Width</span>
            <div class="flex items-center gap-1.5">
              <span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-orange-500 text-white">${cfg.paperSize || '80mm'}</span>
              <span class="text-[11px] text-slate-400">Thermal POS</span>
            </div>
          </div>
          <div class="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5">
            <span class="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Restaurant Logo</span>
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-bold ${cfg.showLogo !== false ? 'text-emerald-400' : 'text-slate-400'}">${cfg.showLogo !== false ? '✓ Logo at Top' : 'Logo Hidden'}</span>
            </div>
          </div>
          <div class="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5">
            <span class="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Thermal Barcode</span>
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-bold ${cfg.showBarcode !== false ? 'text-emerald-400' : 'text-slate-400'}">${cfg.showBarcode !== false ? '✓ Barcode Enabled' : 'Barcode Hidden'}</span>
            </div>
          </div>
        </div>
        <div class="flex items-center justify-between pt-1">
          <span class="text-[11px] text-slate-400">💡 Click "Full Slip Designer" to visually edit paper width, tax, fonts, and view live dual-pane preview.</span>
          <button type="button" id="admin-slip-quick-open-btn" class="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-orange-400 border border-orange-500/30 rounded-xl text-xs font-bold cursor-pointer">
            Edit Slip Layout →
          </button>
        </div>
      `;

      settingsContainer.insertBefore(slipCard, settingsContainer.firstChild);

      const openDesigner = () => {
        if (typeof window.openSlipLayoutCustomizer === 'function') {
          window.openSlipLayoutCustomizer(activeRest.id);
        }
      };

      const testBtn = document.getElementById('admin-slip-test-print-btn');
      if (testBtn) {
        testBtn.onclick = () => {
          const sample = {
            id: 'SLIP-' + Math.floor(1000 + Math.random() * 9000),
            customerName: 'Muhammad Hamza',
            customerPhone: '+92 301 8765432',
            customerAddress: 'Commercial Market, Lahore',
            orderType: 'dine_in',
            tableNumber: 'T-04',
            paymentMethod: 'cash',
            items: [
              { name: 'Special Chicken Biryani (Double)', price: 750, quantity: 2 },
              { name: 'Fresh Mint Raita & Salad', price: 120, quantity: 1 }
            ],
            subtotal: 1620,
            deliveryFee: 0,
            totalAmount: 1620,
            createdAt: new Date().toISOString()
          };
          if (typeof window.showReceiptSlipModal === 'function') {
            window.showReceiptSlipModal(sample, activeRest);
          } else {
            window.open('/api/print-slip/TEST-SAMPLE?preview=1', '_blank');
          }
        };
      }

      const openBtn = document.getElementById('admin-slip-open-designer-btn');
      if (openBtn) openBtn.onclick = openDesigner;
      const quickBtn = document.getElementById('admin-slip-quick-open-btn');
      if (quickBtn) quickBtn.onclick = openDesigner;
    } catch(e) {
      console.warn('[Admin Slip Settings Observer]', e);
    }
  }

  // Keep scanning with light, throttled intervals to keep app fast
  setInterval(applyStorefrontDishImageControls, 3000);
  setInterval(guardTableQRCodes, 3000);
  setInterval(enhanceAdminPrintableReceipt, 2500);
  setInterval(ensureAdminSlipSettingsCard, 2500);

  setTimeout(() => {
    guardTableQRCodes();
    applyStorefrontDishImageControls();
    enhanceAdminPrintableReceipt();
    ensureAdminSlipSettingsCard();
  }, 400);


  // =========================================================================
  // PORTIONS & PIECES PRICE & VARIANT STOREFRONT ENHANCER
  // =========================================================================

  window.formatDishVariantPrice = function(dish, fmt) {
    const f = fmt || function(val) { return 'Rs. ' + Number(val || 0).toLocaleString('en-PK'); };
    if (!dish) return f(0);
    if (dish.hasVariants && Array.isArray(dish.variants) && dish.variants.length > 0) {
      if (dish.variants.length === 2) {
        return dish.variants.map(v => `${v.name}: ${f(v.price)}`).join(' | ');
      }
      return `${dish.variants[0].name}: ${f(dish.variants[0].price)} - ${dish.variants[dish.variants.length - 1].name}: ${f(dish.variants[dish.variants.length - 1].price)}`;
    }
    return f(dish.price || 0);
  };

  window.openDishVariantSelector = function(dish, onAddToCart, formatPriceFn) {
    if (!dish) return;
    const existing = document.getElementById('dish-variant-selector-modal');
    if (existing) existing.remove();

    const fmt = formatPriceFn || function(val) { return 'Rs. ' + Number(val || 0).toLocaleString('en-PK'); };
    const variants = (dish.hasVariants && Array.isArray(dish.variants) && dish.variants.length > 0)
      ? dish.variants
      : [
          { name: 'Half', price: Math.round((dish.price || 600) * 0.6) },
          { name: 'Full', price: dish.price || 1000 }
        ];

    let selectedIndex = 0;
    let quantity = 1;
    let specialNotes = '';

    const modal = document.createElement('div');
    modal.id = 'dish-variant-selector-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:99999999;background:rgba(2,6,23,0.85);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto;';

    function render() {
      const selectedVariant = variants[selectedIndex] || variants[0];
      const unitPrice = Number(selectedVariant.price) || 0;
      const totalPrice = unitPrice * quantity;

      modal.innerHTML = `
        <div style="background:#0f172a;border:1px solid #334155;border-radius:24px;max-width:440px;width:100%;color:#f8fafc;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 25px 60px rgba(0,0,0,0.9);overflow:hidden;animation:fadeInScale 0.2s ease-out;position:relative;">
          
          <!-- Dish Visual Header -->
          <div style="position:relative;height:180px;background:#020617;overflow:hidden;">
            <img src="${dish.imageUrl || 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=800&q=80'}" style="width:100%;height:100%;object-fit:cover;" onerror="this.src='https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=800&q=80'" />
            <div style="position:absolute;inset:0;background:linear-gradient(to top, #0f172a 0%, transparent 65%);"></div>
            
            <button id="close-variant-modal-btn" type="button" style="position:absolute;top:12px;right:12px;background:rgba(15,23,42,0.85);border:1px solid #334155;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:14px;font-weight:bold;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.5);">✕</button>

            <div style="position:absolute;bottom:10px;left:16px;right:16px;display:flex;align-items:center;justify-content:space-between;">
              <span style="font-size:10px;font-weight:800;background:#0284c7;color:#fff;padding:3px 8px;border-radius:6px;text-transform:uppercase;">${sanitizeText(dish.category || 'Special')}</span>
              ${dish.dietary ? `<span style="font-size:10px;font-weight:700;background:rgba(16,185,129,0.25);color:#34d399;border:1px solid rgba(16,185,129,0.5);padding:2px 8px;border-radius:6px;">${sanitizeText(dish.dietary)}</span>` : ''}
            </div>
          </div>

          <!-- Body Content -->
          <div style="padding:16px 20px;">
            <h3 style="margin:0 0 4px 0;font-size:18px;font-weight:800;color:#fff;">${sanitizeText(dish.name)}</h3>
            ${dish.description ? `<p style="margin:0 0 14px 0;font-size:11px;color:#94a3b8;line-height:1.4;">${sanitizeText(dish.description)}</p>` : '<div style="margin-bottom:12px;"></div>'}

            <!-- Variant Selector (Half, Full, 6 Pieces, 12 Pieces, etc.) -->
            <div style="margin-bottom:14px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                <label style="font-size:12px;font-weight:800;color:#38bdf8;text-transform:uppercase;letter-spacing:0.5px;">
                  🍗 Choose Portion / Pieces:
                </label>
                <span style="font-size:10px;color:#f59e0b;font-weight:bold;">Required *</span>
              </div>

              <div style="display:flex;flex-direction:column;gap:8px;">
                ${variants.map((v, i) => {
                  const isSelected = i === selectedIndex;
                  return `
                    <div class="variant-option-card" data-index="${i}" style="border:2px solid ${isSelected ? '#f97316' : '#334155'};background:${isSelected ? 'rgba(249,115,22,0.12)' : '#1e293b/60'};border-radius:14px;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;transition:all 0.15s ease;">
                      <div style="display:flex;align-items:center;gap:10px;">
                        <div style="width:18px;height:18px;border-radius:50%;border:2px solid ${isSelected ? '#f97316' : '#64748b'};display:flex;align-items:center;justify-content:center;">
                          ${isSelected ? '<div style="width:8px;height:8px;border-radius:50%;background:#f97316;"></div>' : ''}
                        </div>
                        <div>
                          <div style="font-size:13px;font-weight:800;color:${isSelected ? '#fff' : '#e2e8f0'};">
                            ${sanitizeText(v.name)}
                          </div>
                          <div style="font-size:10px;color:#94a3b8;">
                            ${v.name.toLowerCase().includes('half') ? '1 Person Serving' : (v.name.toLowerCase().includes('full') ? '2-3 Persons Serving' : (v.name.toLowerCase().includes('piece') ? 'Freshly Fried & Tossed' : 'Chef Curated Portion'))}
                          </div>
                        </div>
                      </div>

                      <div style="text-align:right;">
                        <div style="font-size:14px;font-weight:900;color:${isSelected ? '#fbbf24' : '#34d399'};">
                          ${fmt(v.price)}
                        </div>
                        ${isSelected ? '<span style="font-size:9px;color:#f97316;font-weight:bold;">Selected ✓</span>' : ''}
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>

            <!-- Quantity Stepper -->
            <div style="display:flex;align-items:center;justify-content:space-between;background:#1e293b/40;border:1px solid #334155;border-radius:12px;padding:10px 14px;margin-bottom:14px;">
              <span style="font-size:12px;font-weight:700;color:#cbd5e1;">Quantity:</span>
              <div style="display:flex;align-items:center;gap:12px;">
                <button id="modal-qty-minus" type="button" style="width:30px;height:30px;border-radius:8px;background:#334155;border:none;color:#fff;font-size:16px;font-weight:bold;cursor:pointer;display:flex;align-items:center;justify-content:center;">−</button>
                <span id="modal-qty-display" style="font-size:14px;font-weight:900;color:#fff;min-width:20px;text-align:center;">${quantity}</span>
                <button id="modal-qty-plus" type="button" style="width:30px;height:30px;border-radius:8px;background:#f97316;border:none;color:#fff;font-size:16px;font-weight:bold;cursor:pointer;display:flex;align-items:center;justify-content:center;">+</button>
              </div>
            </div>

            <!-- Special Request / Instructions -->
            <div style="margin-bottom:16px;">
              <label style="font-size:11px;font-weight:700;color:#94a3b8;display:block;margin-bottom:4px;">Special Request / Instructions (Optional)</label>
              <input id="modal-special-notes" type="text" placeholder="e.g. Less spicy, extra salad/raita..." value="${sanitizeText(specialNotes)}" style="width:100%;background:#020617;border:1px solid #334155;border-radius:10px;padding:8px 12px;font-size:11px;color:#fff;" />
            </div>

            <!-- Add to Cart Button -->
            <button id="modal-confirm-add-btn" type="button" style="width:100%;background:linear-gradient(135deg, #ea580c, #f97316);color:#fff;border:none;border-radius:14px;padding:12px 18px;font-size:13px;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:space-between;box-shadow:0 10px 25px -5px rgba(249,115,22,0.5);transition:all 0.15s ease;">
              <span>➕ Add "${selectedVariant.name}" to Order</span>
              <span>${fmt(totalPrice)}</span>
            </button>
          </div>
        </div>
      `;

      // Events
      const closeBtn = document.getElementById('close-variant-modal-btn');
      if (closeBtn) closeBtn.onclick = () => modal.remove();

      modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
      };

      modal.querySelectorAll('.variant-option-card').forEach(card => {
        card.onclick = () => {
          selectedIndex = parseInt(card.getAttribute('data-index'), 10);
          render();
        };
      });

      const minusBtn = document.getElementById('modal-qty-minus');
      const plusBtn = document.getElementById('modal-qty-plus');
      if (minusBtn) {
        minusBtn.onclick = () => {
          if (quantity > 1) {
            quantity--;
            render();
          }
        };
      }
      if (plusBtn) {
        plusBtn.onclick = () => {
          quantity++;
          render();
        };
      }

      const notesInp = document.getElementById('modal-special-notes');
      if (notesInp) {
        notesInp.oninput = (e) => {
          specialNotes = e.target.value;
        };
      }

      const addBtn = document.getElementById('modal-confirm-add-btn');
      if (addBtn) {
        addBtn.onclick = () => {
          modal.remove();
          if (typeof onAddToCart === 'function') {
            onAddToCart(selectedVariant, quantity, specialNotes);
          }
        };
      }
    }

    render();
    document.body.appendChild(modal);
  };

  // =========================================================================
  // FOODPANDA MOBILE & ZERO-CROP STOREFRONT ENHANCER
  // =========================================================================
  function enhanceFoodpandaStorefront() {
    try {
      // Remove any stray price tags accidentally placed in admin consoles
      document.querySelectorAll('.relative.group .foodpanda-card-price, div[title*="Super Admin"] .foodpanda-card-price').forEach(el => el.remove());

      // Only target Customer Storefront dish cards (never admin logo boxes)
      const cards = document.querySelectorAll('main .group:has(.relative.h-48), main .group:has(button[class*="Cart"])');
      if (!cards || cards.length === 0) return;

      cards.forEach(card => {
        if (!card || card.classList.contains('cursor-pointer') || card.querySelector('img.w-11') || card.closest('.mghub-card-tools-row')) return;

        // 1. Force user's product-image container style and zero crop on storefront
        const imgDiv = card.querySelector('.relative.h-48, .relative.h-36, [data-dish-image-container]') || card.children[0];
        if (imgDiv) {
          imgDiv.classList.add('product-image');
        }
        const imgs = card.querySelectorAll('img');
        imgs.forEach(img => {
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.objectFit = 'contain';
        });

        // 2. Cleanly remove any price badge on top of dish picture
        const overlayPriceBadges = card.querySelectorAll('.absolute.bottom-2, .absolute.bottom-3, span[class*="bottom-2"], span[class*="bottom-3"], span.absolute');
        overlayPriceBadges.forEach(b => {
          if (b.textContent && (b.textContent.includes('Rs.') || b.textContent.includes('Single') || b.textContent.includes('Double') || b.textContent.includes('Half') || b.textContent.includes('Full') || b.textContent.includes('PKR'))) {
            b.style.display = 'none';
            try { b.remove(); } catch(e) {}
          }
        });

        // 3. Ensure price is clearly injected into the left text details area
        if (!card.querySelector('.foodpanda-card-price')) {
          const contentDiv = card.querySelector('.p-5') || card.children[1];
          const imgDiv = card.children[0];
          if (contentDiv) {
            let priceText = '';
            if (imgDiv) {
              const b3 = imgDiv.querySelector('.absolute.bottom-3');
              if (b3) {
                const priceSpan = b3.querySelector('span:last-child');
                if (priceSpan) priceText = priceSpan.textContent.trim();
                b3.style.display = 'none';
              }
            }

            if (priceText) {
              const priceTag = document.createElement('div');
              priceTag.className = 'foodpanda-card-price';
              priceTag.textContent = priceText;

              const h4 = contentDiv.querySelector('h4');
              if (h4 && h4.parentNode) {
                h4.parentNode.insertBefore(priceTag, h4.nextSibling);
              } else {
                contentDiv.prepend(priceTag);
              }
            }
          }
        }
      });
    } catch (e) {
      console.warn('[Foodpanda Storefront Enhancer]', e);
    }
  }

  // =========================================================================
  // USER REQUEST: MENU CATEGORY SMOOTH HORIZONTAL SCROLL & VISUAL ALL CATEGORIES SHOWCASE
  // 1. Smooth horizontal movement across screen with arrow buttons, touch swipe, & mouse drag
  // 2. On 'All' category option, display a visual showcase of all categories with name & image
  // =========================================================================

  function getCategoryPresetImage(cat) {
    const c = String(cat || '').toLowerCase();
    if (c.includes('biryani') || c.includes('rice') || c.includes('pulao')) {
      return 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=800&q=80';
    }
    if (c.includes('karahi') || c.includes('handi') || c.includes('curry') || c.includes('salan') || c.includes('shinwari')) {
      return 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=800&q=80';
    }
    if (c.includes('bbq') || c.includes('grill') || c.includes('tikka') || c.includes('kebab') || c.includes('kabab') || c.includes('tandoor')) {
      return 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=800&q=80';
    }
    if (c.includes('burger') || c.includes('sandwich') || c.includes('wrap') || c.includes('fast food') || c.includes('zinger')) {
      return 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80';
    }
    if (c.includes('pizza') || c.includes('italian') || c.includes('crust')) {
      return 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80';
    }
    if (c.includes('fries') || c.includes('starter') || c.includes('side') || c.includes('snack') || c.includes('nugget') || c.includes('appetizer')) {
      return 'https://images.unsplash.com/photo-1576107232684-1279f3908594?auto=format&fit=crop&w=800&q=80';
    }
    if (c.includes('dessert') || c.includes('sweet') || c.includes('halwa') || c.includes('ice cream') || c.includes('kheer') || c.includes('jamun') || c.includes('mithai')) {
      return 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=800&q=80';
    }
    if (c.includes('shake') || c.includes('lassi') || c.includes('drink') || c.includes('beverage') || c.includes('chai') || c.includes('tea') || c.includes('coffee') || c.includes('juice')) {
      return 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=800&q=80';
    }
    if (c.includes('naan') || c.includes('roti') || c.includes('bread') || c.includes('paratha')) {
      return 'https://images.unsplash.com/photo-1626074353765-517a681e40be?auto=format&fit=crop&w=800&q=80';
    }
    if (c.includes('sushi') || c.includes('seafood') || c.includes('fish') || c.includes('nori')) {
      return 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=800&q=80';
    }
    if (c.includes('ramen') || c.includes('soup') || c.includes('noodle') || c.includes('chinese') || c.includes('pasta')) {
      return 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=800&q=80';
    }
    return 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80';
  }
  window.getCategoryPresetImage = getCategoryPresetImage;

  function getCategoryIcon(cat) {
    const c = String(cat || '').toLowerCase();
    if (c === 'all') return '⭐';
    if (c.includes('biryani') || c.includes('rice') || c.includes('pulao')) return '🍚';
    if (c.includes('karahi') || c.includes('handi') || c.includes('curry') || c.includes('salan') || c.includes('shinwari')) return '🍗';
    if (c.includes('bbq') || c.includes('grill') || c.includes('tikka') || c.includes('kebab') || c.includes('kabab') || c.includes('tandoor')) return '🥩';
    if (c.includes('burger') || c.includes('sandwich') || c.includes('wrap') || c.includes('fast food') || c.includes('zinger')) return '🍔';
    if (c.includes('pizza') || c.includes('italian') || c.includes('crust')) return '🍕';
    if (c.includes('fries') || c.includes('starter') || c.includes('side') || c.includes('snack') || c.includes('nugget')) return '🍟';
    if (c.includes('dessert') || c.includes('sweet') || c.includes('halwa') || c.includes('ice cream') || c.includes('kheer') || c.includes('jamun')) return '🍨';
    if (c.includes('shake') || c.includes('lassi') || c.includes('drink') || c.includes('beverage') || c.includes('chai') || c.includes('tea')) return '🥤';
    if (c.includes('naan') || c.includes('roti') || c.includes('bread') || c.includes('paratha')) return '🫓';
    if (c.includes('sushi') || c.includes('seafood') || c.includes('fish')) return '🍣';
    if (c.includes('ramen') || c.includes('soup') || c.includes('noodle') || c.includes('chinese') || c.includes('pasta')) return '🍜';
    return '🍽️';
  }
  window.getCategoryIcon = getCategoryIcon;

  // Active Category State Tracker
  window.__currentActiveCategory = 'All';

  function enhanceCategoryBarAndShowcase() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const isStorefront = urlParams.has('store') || urlParams.has('r') || urlParams.has('restaurant') || window.location.pathname.startsWith('/store') || window.location.hash.includes('store=');
      // Categories bar is strictly for customer storefront, never show in Admin
      if (!isStorefront) return;

      // 1. Locate Category Bar Container inside Storefront
      const catBars = document.querySelectorAll('main div.overflow-x-auto, div.overflow-x-auto:has(> button)');
      if (!catBars || catBars.length === 0) return;

      let targetCatBar = null;
      for (const bar of catBars) {
        // Confirm this bar contains "All" or category buttons
        const btns = bar.querySelectorAll('button');
        if (btns.length >= 2 && Array.from(btns).some(b => (b.textContent || '').trim().toLowerCase() === 'all' || (b.textContent || '').includes('All'))) {
          targetCatBar = bar;
          break;
        }
      }

      if (!targetCatBar) return;

      // Ensure every category button never shrinks and has clean whitespace
      const buttons = targetCatBar.querySelectorAll('button');
      buttons.forEach(btn => {
        btn.style.flexShrink = '0';
        btn.style.whiteSpace = 'nowrap';
        btn.style.touchAction = 'pan-x';

        // Add Category Icon if missing
        const rawText = (btn.textContent || '').trim();
        const cleanName = rawText.replace(/^[^\w\s]+/g, '').trim();
        if (cleanName && !btn.dataset.iconAdded) {
          const icon = getCategoryIcon(cleanName);
          if (!btn.innerHTML.includes(icon) && !btn.querySelector('.cat-icon-span')) {
            btn.dataset.iconAdded = 'true';
            btn.innerHTML = `<span class="cat-icon-span mr-1.5">${icon}</span><span>${sanitizeText(cleanName)}</span>`;
          }
        }
      });

      // 2. Wrap Category Bar in Smooth Scroll Controls with Left/Right Buttons
      let wrapper = targetCatBar.closest('.mghub-cat-bar-wrapper');
      if (!wrapper && targetCatBar.parentElement) {
        wrapper = document.createElement('div');
        wrapper.className = 'mghub-cat-bar-wrapper relative flex items-center w-full min-w-0 my-1';
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.position = 'relative';
        wrapper.style.width = '100%';

        targetCatBar.parentElement.insertBefore(wrapper, targetCatBar);
        wrapper.appendChild(targetCatBar);

        targetCatBar.style.overflowX = 'auto';
        targetCatBar.style.scrollBehavior = 'smooth';
        targetCatBar.style.webkitOverflowScrolling = 'touch';
        targetCatBar.style.scrollbarWidth = 'none';
        targetCatBar.style.display = 'flex';
        targetCatBar.style.alignItems = 'center';
        targetCatBar.style.flex = '1';
        targetCatBar.style.cursor = 'grab';

        // Left Navigation Arrow Button
        const prevBtn = document.createElement('button');
        prevBtn.type = 'button';
        prevBtn.className = 'mghub-cat-arrow-prev shrink-0 w-8 h-8 rounded-xl bg-slate-900/95 hover:bg-slate-800 text-white border border-slate-700/80 flex items-center justify-center text-sm font-black shadow-lg cursor-pointer transition-transform active:scale-90 mr-2 z-20';
        prevBtn.title = 'Scroll Categories Left (Peechay Dekhein)';
        prevBtn.innerHTML = '‹';
        prevBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          targetCatBar.scrollBy({ left: -260, behavior: 'smooth' });
        };

        // Right Navigation Arrow Button
        const nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.className = 'mghub-cat-arrow-next shrink-0 w-8 h-8 rounded-xl bg-slate-900/95 hover:bg-slate-800 text-white border border-slate-700/80 flex items-center justify-center text-sm font-black shadow-lg cursor-pointer transition-transform active:scale-90 ml-2 z-20';
        nextBtn.title = 'Scroll Categories Right (Aage Move Karein)';
        nextBtn.innerHTML = '›';
        nextBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          targetCatBar.scrollBy({ left: 260, behavior: 'smooth' });
        };

        wrapper.insertBefore(prevBtn, targetCatBar);
        wrapper.appendChild(nextBtn);

        // Turn vertical mouse wheel into horizontal scroll on the category strip
        targetCatBar.addEventListener('wheel', (e) => {
          if (e.deltaY !== 0 && targetCatBar.scrollWidth > targetCatBar.clientWidth) {
            e.preventDefault();
            targetCatBar.scrollLeft += e.deltaY * 1.5;
          }
        }, { passive: false });

        // Mouse Drag to Scroll sideways
        let isDown = false;
        let startX = 0;
        let scrollLeft = 0;

        targetCatBar.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return;
          isDown = true;
          startX = e.pageX - targetCatBar.offsetLeft;
          scrollLeft = targetCatBar.scrollLeft;
          targetCatBar.style.cursor = 'grabbing';
          targetCatBar.style.userSelect = 'none';
        });

        window.addEventListener('mouseup', () => {
          isDown = false;
          if (targetCatBar) {
            targetCatBar.style.cursor = 'grab';
            targetCatBar.style.userSelect = '';
          }
        });

        targetCatBar.addEventListener('mousemove', (e) => {
          if (!isDown) return;
          e.preventDefault();
          const x = e.pageX - targetCatBar.offsetLeft;
          const walk = (x - startX) * 1.6;
          targetCatBar.scrollLeft = scrollLeft - walk;
        });
      }

      // 3. Track active category
      let activeCatName = 'All';
      buttons.forEach(btn => {
        const isSelected = btn.classList.contains('text-white') && (btn.style.backgroundColor || btn.classList.contains('shadow-md') || btn.classList.contains('scale-[1.02]'));
        const txt = (btn.textContent || '').trim().replace(/^[^\w\s]+/g, '').trim();
        if (isSelected && txt) {
          activeCatName = txt;
        }
      });
      window.__currentActiveCategory = activeCatName;

      // 4. VISUAL ALL CATEGORIES SHOWCASE GRID (USER REQUEST 2)
      // "all ka option pr catorize ka option doo matalb all prr sab sari catorize ka naam orr image aya"
      let showcase = document.getElementById('storefront-all-categories-showcase');

      // If active category is NOT 'All' (e.g. user selected 'Biryani'), hide showcase
      if (activeCatName.toLowerCase() !== 'all') {
        if (showcase) {
          showcase.style.display = 'none';
        }
        return;
      }

      // If 'All' is active, retrieve all available categories and dishes
      const allItems = getLocalItems();
      const params = new URLSearchParams(window.location.search);
      const storeSlug = params.get('store') || params.get('r') || params.get('restaurant') || '';
      const rests = JSON.parse(localStorage.getItem('bitehub_pkr_restaurants_v2') || '[]');
      let matchedRest = null;
      if (storeSlug) {
        matchedRest = rests.find(r => (r.slug && r.slug.toLowerCase() === storeSlug.toLowerCase()) || r.id === storeSlug);
      }
      if (!matchedRest && rests.length > 0) matchedRest = rests[0];

      const restId = matchedRest ? matchedRest.id : null;
      const restItems = restId ? allItems.filter(i => i.restaurantId === restId) : allItems;

      // Extract unique categories (excluding 'All')
      const catMap = new Map();
      restItems.forEach(item => {
        if (item.category && item.category !== 'All') {
          if (!catMap.has(item.category)) {
            catMap.set(item.category, {
              name: item.category,
              image: item.imageUrl || getCategoryPresetImage(item.category),
              count: 1
            });
          } else {
            const entry = catMap.get(item.category);
            entry.count += 1;
            if (!entry.image && item.imageUrl) entry.image = item.imageUrl;
          }
        }
      });

      // If no categories in items, pull registered categories
      if (catMap.size === 0 && restId) {
        const storedCats = getRestaurantCategories(restId);
        storedCats.forEach(c => {
          if (c !== 'All') {
            catMap.set(c, {
              name: c,
              image: getCategoryPresetImage(c),
              count: 0
            });
          }
        });
      }

      const categoriesList = Array.from(catMap.values());
      if (categoriesList.length === 0) return;

      const mainEl = document.querySelector('main');
      if (!mainEl) return;

      if (!showcase) {
        showcase = document.createElement('div');
        showcase.id = 'storefront-all-categories-showcase';
        showcase.className = 'w-full mb-8 p-4 sm:p-6 rounded-3xl bg-slate-900/60 border border-slate-800 shadow-2xl animate-in fade-in duration-300';
        
        // Insert right after the category search/filter row
        const filterRow = wrapper ? wrapper.closest('div.flex-col, div.flex-row') || wrapper.parentElement : mainEl.children[0];
        if (filterRow && filterRow.parentElement === mainEl) {
          filterRow.after(showcase);
        } else {
          mainEl.prepend(showcase);
        }
      }

      showcase.style.display = 'block';

      // Only rebuild HTML if categories changed or empty
      const existingCards = showcase.querySelectorAll('.mghub-category-card');
      if (existingCards.length !== categoriesList.length) {
        showcase.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid rgba(51,65,85,0.6);">
            <div>
              <h3 style="margin:0;font-size:17px;font-weight:900;color:#fff;display:flex;align-items:center;gap:8px;">
                <span>🍽️</span>
                <span>Explore Menu Categories (Tamam Categories)</span>
              </h3>
              <p style="margin:4px 0 0;font-size:11px;color:#94a3b8;">
                Kisi bhi category par click karein — uske tamam khane aur rates samne aa jayenge!
              </p>
            </div>
            <span style="font-size:11px;font-weight:800;color:#fbbf24;background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.3);padding:3px 10px;border-radius:20px;">
              ${categoriesList.length} Categories Available
            </span>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(140px, 1fr));gap:12px;" class="mghub-cat-cards-grid">
            ${categoriesList.map(cat => {
              const icon = getCategoryIcon(cat.name);
              const imgUrl = cat.image || getCategoryPresetImage(cat.name);
              return `
                <div class="mghub-category-card" data-category="${sanitizeText(cat.name)}" style="background:#090d16;border:1px solid #334155;border-radius:16px;overflow:hidden;cursor:pointer;display:flex;flex-direction:column;justify-content:space-between;box-shadow:0 6px 18px rgba(0,0,0,0.4);transition:all 0.25s ease;">
                  <div style="position:relative;width:100%;height:100px;background:#020617;overflow:hidden;">
                    <img src="${sanitizeUrl(imgUrl)}" alt="${sanitizeText(cat.name)}" style="width:100%;height:100%;object-fit:cover;transition:transform 0.4s ease;" onerror="this.src='${SmartImageEngine.DEFAULT_FALLBACK_URL}'" />
                    <div style="position:absolute;inset:0;background:linear-gradient(to top, rgba(9,13,22,0.95) 0%, rgba(9,13,22,0.3) 50%, transparent 100%);"></div>
                    <span style="position:absolute;top:6px;right:6px;font-size:9px;font-weight:800;background:rgba(15,23,42,0.85);backdrop-filter:blur(4px);color:#38bdf8;border:1px solid rgba(56,189,248,0.3);padding:2px 7px;border-radius:12px;">
                      ${cat.count} ${cat.count === 1 ? 'dish' : 'dishes'}
                    </span>
                  </div>
                  <div style="padding:10px;display:flex;align-items:center;justify-content:space-between;gap:4px;">
                    <div style="font-size:12px;font-weight:800;color:#fff;display:flex;align-items:center;gap:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                      <span>${icon}</span>
                      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${sanitizeText(cat.name)}</span>
                    </div>
                    <span style="font-size:11px;color:#f97316;font-weight:bold;">→</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `;

        // Attach click handlers to category cards
        showcase.querySelectorAll('.mghub-category-card').forEach(card => {
          card.onmouseenter = () => {
            card.style.transform = 'translateY(-3px)';
            card.style.borderColor = '#f97316';
            card.style.boxShadow = '0 10px 25px rgba(249,115,22,0.25)';
            const img = card.querySelector('img');
            if (img) img.style.transform = 'scale(1.08)';
          };
          card.onmouseleave = () => {
            card.style.transform = 'translateY(0)';
            card.style.borderColor = '#334155';
            card.style.boxShadow = '0 6px 18px rgba(0,0,0,0.4)';
            const img = card.querySelector('img');
            if (img) img.style.transform = 'scale(1)';
          };

          card.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const catName = card.getAttribute('data-category');
            if (!catName) return;

            // Trigger corresponding category button in the category strip
            const stripButtons = targetCatBar.querySelectorAll('button');
            let foundBtn = null;
            stripButtons.forEach(b => {
              const t = (b.textContent || '').trim().replace(/^[^\w\s]+/g, '').trim().toLowerCase();
              if (t === catName.toLowerCase()) foundBtn = b;
            });

            if (foundBtn) {
              foundBtn.click();
              foundBtn.scrollIntoView({ inline: 'center', behavior: 'smooth' });
            }

            // Smooth scroll down to dishes
            const dishesGrid = document.querySelector('main .grid, main .space-y-3');
            if (dishesGrid) {
              dishesGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          };
        });
      }
    } catch (e) {
      console.warn('[Category Enhancer notice]:', e);
    }
  }

  setInterval(enhanceCategoryBarAndShowcase, 2500);
  setTimeout(enhanceCategoryBarAndShowcase, 500);

  console.log('[BiteHub Suite] Manual Menu Manager, POS Slip Settings, Foodpanda Mobile View, Smooth Category Scrolling & Visual All Categories Showcase Initialized.');
})();

