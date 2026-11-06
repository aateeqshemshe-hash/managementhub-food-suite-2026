/**
 * apiService.ts
 *
 * Dedicated client-side service module to interact with all backend API routes
 * defined in vite.config.ts and server.ts.
 *
 * Provides real-time synchronization, state updates, Server-Sent Events (SSE),
 * Super Admin authentication, and platform backup import/export.
 */

// Persistent device identifier to avoid echoing updates back to the sender
const CLIENT_DEVICE_STORAGE_KEY = 'mghub_client_device_id';

export function getClientDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  try {
    let id = localStorage.getItem(CLIENT_DEVICE_STORAGE_KEY);
    if (!id) {
      id = 'dev-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now().toString(36);
      localStorage.setItem(CLIENT_DEVICE_STORAGE_KEY, id);
    }
    return id;
  } catch {
    return 'dev-transient-' + Date.now();
  }
}

export interface AppSyncState {
  version: number;
  lastUpdated: string;
  superAdminCredentials?: {
    email: string;
    password: string;
    updatedAt: string;
  };
  restaurants: any[];
  menuItems: any[];
  orders: any[];
  customerAccounts: any[];
  qrVisitors: any[];
  subscriptionPlans: any[];
  planPayments: any[];
  dailyDeals: any[];
  branding: {
    appName?: string;
    appShortName?: string;
    themeMode?: string;
    colorPalette?: string;
    customDashboardBg?: string;
    customCardBg?: string;
    customPrimaryColor?: string;
    logoUrl?: string;
  };
  loyaltyConfig: { isEnabled: boolean; [key: string]: any };
  availableVouchers: any[];
  reviews: any[];
  broadcastHistory: any[];
  customerNotifications: any[];
  restaurantTables: any[];
  sharedOrderScreens?: any[];
  paymentMethods?: any[];
  publishedInfo?: {
    isPublished: boolean;
    status: string;
    publishUrl?: string;
    lastRepublishedAt?: string;
    deploymentVersion?: string;
    republishCount?: number;
  };
  currencySymbol?: string;
  currencyCode?: string;
}

export interface SyncResponse<T = any> {
  success: boolean;
  version?: number;
  lastUpdated?: string;
  unchanged?: boolean;
  data?: T;
  error?: string;
}

export interface RestoreResponse {
  success: boolean;
  version: number;
  lastUpdated: string;
  restoredKeys: string[];
  restaurantsCount: number;
  menuItemsCount: number;
  ordersCount: number;
  error?: string;
}

export interface HealthResponse {
  status: string;
  version: number;
  lastUpdated: string;
  activeDevices: number;
  restaurantsCount: number;
  ordersCount: number;
}

/**
 * 1. Fetch current centralized app state from the cloud server
 * If a version number is provided and server version matches, returns { unchanged: true }.
 */
export async function fetchAppState(version?: number): Promise<SyncResponse<AppSyncState>> {
  try {
    const url = version !== undefined ? `/api/sync/state?version=${version}` : `/api/sync/state`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch state: HTTP ${response.status}`);
    }

    return await response.json();
  } catch (err: any) {
    console.error('[ApiService] fetchAppState error:', err);
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * 2. Update a single key in the cloud app state (e.g. orders, restaurants, branding)
 */
export async function updateAppStateKey<T = any>(
  key: keyof AppSyncState | string,
  data: T,
  clientDeviceId?: string
): Promise<SyncResponse> {
  try {
    const deviceId = clientDeviceId || getClientDeviceId();
    const response = await fetch('/api/sync/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        key,
        data,
        clientDeviceId: deviceId
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to update key "${key}": HTTP ${response.status}`);
    }

    return await response.json();
  } catch (err: any) {
    console.error(`[ApiService] updateAppStateKey("${key}") error:`, err);
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * 3. Batch update multiple keys in the cloud app state simultaneously
 */
export async function updateAppStateBatch(
  updates: Partial<AppSyncState> | Record<string, any>,
  clientDeviceId?: string
): Promise<SyncResponse> {
  try {
    const deviceId = clientDeviceId || getClientDeviceId();
    const response = await fetch('/api/sync/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        updates,
        clientDeviceId: deviceId
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to update batch: HTTP ${response.status}`);
    }

    return await response.json();
  } catch (err: any) {
    console.error('[ApiService] updateAppStateBatch error:', err);
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * 4. Subscribe to real-time Server-Sent Events (SSE)
 * Calls onUpdate whenever any other laptop or device makes a change.
 * Returns an unsubscribe cleanup function.
 */
export function subscribeToSyncEvents(callbacks: {
  onUpdate?: (eventData: { updates?: Partial<AppSyncState>; key?: string; data?: any; version: number; lastUpdated: string; clientDeviceId?: string }) => void;
  onConnected?: (info: { status: string; version: number; activeDevices: number }) => void;
  onError?: (err: Event) => void;
}): () => void {
  if (typeof window === 'undefined' || !window.EventSource) {
    console.warn('[ApiService] EventSource is not supported in this environment');
    return () => {};
  }

  const currentDeviceId = getClientDeviceId();
  let eventSource: EventSource | null = null;
  let isClosed = false;

  function connect() {
    if (isClosed) return;

    eventSource = new EventSource('/api/sync/events');

    eventSource.addEventListener('connected', (e: MessageEvent) => {
      try {
        const info = JSON.parse(e.data);
        callbacks.onConnected?.(info);
      } catch {}
    });

    eventSource.addEventListener('sync_update', (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data);
        // Ignore updates originated from this exact client to avoid redundant renders
        if (payload.clientDeviceId && payload.clientDeviceId === currentDeviceId) {
          return;
        }
        callbacks.onUpdate?.(payload);
      } catch (err) {
        console.error('[ApiService] Error parsing sync_update event:', err);
      }
    });

    eventSource.onerror = (err) => {
      callbacks.onError?.(err);
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      // Auto-reconnect after 3 seconds if not deliberately closed
      if (!isClosed) {
        setTimeout(connect, 3000);
      }
    };
  }

  connect();

  return () => {
    isClosed = true;
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  };
}

/**
 * 5. Verify Super Admin credentials
 */
export async function verifySuperAdmin(credentials: {
  email: string;
  password: string;
}): Promise<{ valid: boolean }> {
  try {
    const response = await fetch('/api/auth/superadmin-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });

    if (!response.ok) return { valid: false };
    return await response.json();
  } catch (err) {
    console.error('[ApiService] verifySuperAdmin error:', err);
    return { valid: false };
  }
}

/**
 * 6. Update Super Admin credentials across all devices
 */
export async function updateSuperAdmin(credentials: {
  email: string;
  password: string;
  clientDeviceId?: string;
}): Promise<{ success: boolean; credentials?: any; error?: string }> {
  try {
    const response = await fetch('/api/auth/superadmin-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...credentials,
        clientDeviceId: credentials.clientDeviceId || getClientDeviceId()
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { success: false, error: err.error || 'Failed to update credentials' };
    }

    return await response.json();
  } catch (err: any) {
    console.error('[ApiService] updateSuperAdmin error:', err);
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * 7. Export complete platform backup data
 */
export async function exportBackup(): Promise<AppSyncState | null> {
  try {
    const response = await fetch('/api/backup/export', {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (err) {
    console.error('[ApiService] exportBackup error:', err);
    return null;
  }
}

/**
 * 8. Download the full platform backup as a JSON file to user's device
 */
export async function downloadBackupFile(filename?: string): Promise<boolean> {
  try {
    const backupData = await exportBackup();
    if (!backupData) throw new Error('Could not retrieve backup data');

    const dateStr = new Date().toISOString().slice(0, 10);
    const targetFilename = filename || `ManagementHub_Safety_Backup_${dateStr}.json`;

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = targetFilename;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(blobUrl);
    }, 1000);

    return true;
  } catch (err) {
    console.error('[ApiService] downloadBackupFile error:', err);
    // Direct link fallback
    if (typeof window !== 'undefined') {
      window.location.href = '/api/backup/download';
      return true;
    }
    return false;
  }
}

/**
 * 9. Restore complete platform from a backup object
 */
export async function restoreBackup(
  backupData: Partial<AppSyncState> | any,
  clientDeviceId?: string
): Promise<RestoreResponse> {
  try {
    const response = await fetch('/api/backup/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        backup: backupData,
        clientDeviceId: clientDeviceId || getClientDeviceId()
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (err: any) {
    console.error('[ApiService] restoreBackup error:', err);
    return {
      success: false,
      version: 0,
      lastUpdated: '',
      restoredKeys: [],
      restaurantsCount: 0,
      menuItemsCount: 0,
      ordersCount: 0,
      error: err?.message || 'Restore failed'
    };
  }
}

/**
 * 10. Check health and active cloud connection count
 */
export async function checkHealth(): Promise<HealthResponse | null> {
  try {
    const response = await fetch('/api/health');
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * 11. Force-save and commit state to disk in both state.json and seed.json
 */
export async function forceSaveToCloud(): Promise<{ success: boolean; version?: number; message?: string }> {
  try {
    const response = await fetch('/api/sync/force-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (err: any) {
    console.error('[ApiService] forceSaveToCloud error:', err);
    return { success: false, message: err?.message || 'Failed to save to cloud' };
  }
}

/**
 * 12. Trigger platform republish with version increment and live device sync
 */
export async function republishPlatform(options?: {
  publisherEmail?: string;
  notes?: string;
}): Promise<{ success: boolean; publishedInfo?: any; version?: number; error?: string }> {
  try {
    const response = await fetch('/api/publish/republish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publisherEmail: options?.publisherEmail || 'aateeqqshemsi@gmail.com',
        notes: options?.notes || 'Republished with latest updates'
      })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (err: any) {
    console.error('[ApiService] republishPlatform error:', err);
    return { success: false, error: err?.message || 'Failed to republish platform' };
  }
}

/**
 * 13. Fetch current publish / deployment status
 */
export async function getPublishStatus(): Promise<{ success: boolean; publishedInfo?: any }> {
  try {
    const response = await fetch('/api/publish/status');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch {
    return { success: false };
  }
}

/**
 * 14. Permanently reset application state (zero clean wipe, demo, or orders)
 */
export async function resetAppState(resetType: 'zero' | 'demo' | 'orders' = 'zero'): Promise<SyncResponse> {
  try {
    const deviceId = getClientDeviceId();
    const response = await fetch('/api/sync/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetType, clientDeviceId: deviceId })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (err: any) {
    console.error('[ApiService] resetAppState error:', err);
    return { success: false, error: err?.message || 'Failed to reset state' };
  }
}


