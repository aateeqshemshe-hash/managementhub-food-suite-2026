import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();
import {
  handleGetState,
  handlePostUpdate,
  handleGetEvents,
  handleSuperAdminVerify,
  handleSuperAdminUpdate,
  handleHealth,
  handleBackupExport,
  handleBackupRestore,
  handleForceSave,
  handleAIAgent,
  handleGetSharedScreens,
  handleSaveSharedScreen,
  handleDeleteSharedScreen,
  handleRepublish,
  handlePublishStatus,
  handleRestaurantThemeUpdate,
  handleRestaurantCustomDomain,
  handlePWAManifest,
  handleUploadDishPhoto,
  handleServeDishPhoto,
  handleVerifyManagerPin,
  handleUpdateManagerPin,
  handleRestaurantSlipConfig,
  handlePrintSlip,
  handleResetState,
  handlePermanentSave,
  handleGetSnapshots,
  handleRestoreSnapshot,
  handleGetPricePresets,
  handleSavePricePreset,
  handleDeletePricePreset,
  handleReconcileState,
  handleBulkCategoryPhoto
} from './src/api.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));

// Static uploads serving with dedicated binary dish photo endpoint
app.get('/uploads/dishes/:filename', handleServeDishPhoto);
const uploadsDir = path.resolve(__dirname, 'public', 'uploads');
app.use('/uploads', express.static(uploadsDir));

// Standalone Printable Receipt Slip Route (100% immune to iframe sandboxes)
app.get('/api/print-slip/:orderId?', handlePrintSlip);
app.get('/print-slip/:orderId?', handlePrintSlip);

// API Endpoints for Real-Time Multi-Device Sync & Backups
app.get('/api/sync/state', handleGetState);
app.post('/api/sync/update', handlePostUpdate);
app.post('/api/sync/reset', handleResetState);
app.post('/api/sync/force-save', handleForceSave);
app.post('/api/super-admin/ai-agent', handleAIAgent);
app.get('/api/sync/events', handleGetEvents);
app.post('/api/auth/superadmin-verify', handleSuperAdminVerify);
app.post('/api/auth/superadmin-update', handleSuperAdminUpdate);
app.get('/api/health', handleHealth);
app.get('/api/backup/export', handleBackupExport);
app.get('/api/backup/download', handleBackupExport);
app.post('/api/backup/restore', handleBackupRestore);
app.get('/api/shared-screens', handleGetSharedScreens);
app.post('/api/shared-screens/save', handleSaveSharedScreen);
app.post('/api/shared-screens/delete', handleDeleteSharedScreen);
app.post('/api/publish/republish', handleRepublish);
app.get('/api/publish/status', handlePublishStatus);
app.post('/api/restaurants/:id/theme', handleRestaurantThemeUpdate);
app.post('/api/restaurants/theme', handleRestaurantThemeUpdate);
app.post('/api/restaurants/:id/domain', handleRestaurantCustomDomain);
app.get('/api/pwa/manifest.json', handlePWAManifest);
app.post('/api/upload/dish-photo', handleUploadDishPhoto);
app.post('/api/auth/manager-pin-verify', handleVerifyManagerPin);
app.post('/api/auth/manager-pin-update', handleUpdateManagerPin);
app.post('/api/restaurants/:id/slip-config', handleRestaurantSlipConfig);
app.post('/api/restaurants/slip-config', handleRestaurantSlipConfig);

// Super Admin Permanent Data Storage, Snapshots, Pricing Presets & Reconcile
app.post('/api/sync/reconcile', handleReconcileState);
app.post('/api/admin/permanent-save', handlePermanentSave);
app.get('/api/admin/snapshots', handleGetSnapshots);
app.post('/api/admin/snapshots/restore', handleRestoreSnapshot);
app.get('/api/pricing-presets', handleGetPricePresets);
app.post('/api/pricing-presets/save', handleSavePricePreset);
app.post('/api/pricing-presets/delete', handleDeletePricePreset);
app.post('/api/admin/bulk-category-photo', handleBulkCategoryPhoto);

// Static assets with strict no-cache for index.html to ensure live updates
const distDir = path.resolve(__dirname, 'dist');
app.use(express.static(distDir, {
  etag: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// Fallback to index.html for SPA client routing
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[ManagementHub Server] Running on http://0.0.0.0:${PORT}`);
});
