/**
 * invoiceFileProxyRouter.ts
 * Express route: GET /api/invoice/file/:fileId
 * Streams a Google Drive file directly to the browser for PDF preview.
 * Mirrors the Python app.py proxy_drive_file() endpoint.
 */
import { Router } from 'express';
import { google } from 'googleapis';

const router = Router();

function getDriveClient() {
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set');
  const credentials = JSON.parse(saJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  return google.drive({ version: 'v3', auth });
}

router.get('/:fileId', async (req, res) => {
  const { fileId } = req.params;
  if (!fileId) {
    res.status(400).json({ ok: false, error: 'Missing fileId' });
    return;
  }
  try {
    const drive = getDriveClient();
    // Get file metadata
    const meta = await drive.files.get({
      fileId,
      fields: 'name,mimeType',
      supportsAllDrives: true,
    });
    const mimeType = meta.data.mimeType || 'application/pdf';
    const fileName = meta.data.name || 'invoice';
    // Stream file content
    const fileResp = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream' }
    );
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    (fileResp.data as any).pipe(res);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export { router as invoiceFileProxyRouter };
