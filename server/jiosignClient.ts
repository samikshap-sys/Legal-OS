/**
 * jiosignClient.ts — thin client for JioSign's upstream document-signing API.
 * Endpoint shapes and sequence are taken from JIOSIGN_INTEGRATION.md (the
 * repo-inventory doc shared for this integration), scoped to the "sender"
 * side of the flow: create → upload → initiate. OTP entry and signature
 * capture happen on JioSign's own hosted UI once a signer is notified —
 * this app never collects OTPs or signature images itself.
 *
 * Unlike the source doc's file-path certs (JIOSIGN_CLIENT_CERT_PATH /
 * JIOSIGN_CLIENT_KEY_PATH), this client reads the certificate and key as PEM
 * text directly from JIOSIGN_CLIENT_CERT / JIOSIGN_CLIENT_KEY env vars —
 * simpler to store as a Boltic secret than a mounted file.
 */
import axios, { type AxiosInstance } from 'axios';
import https from 'https';
import { ENV } from './_core/env';

let client: AxiosInstance | null = null;

function getClient(): AxiosInstance {
  if (client) return client;
  if (!ENV.jiosignBaseUrl || !ENV.jiosignToken || !ENV.jiosignClientCert || !ENV.jiosignClientKey) {
    throw new Error(
      'JioSign config missing: set JIOSIGN_BASE_URL, JIOSIGN_TOKEN, JIOSIGN_CLIENT_CERT, JIOSIGN_CLIENT_KEY ' +
      '(and JIOSIGN_IP_ADDRESS, JIOSIGN_MAC_ID, JIOSIGN_TXN) in the Boltic Secrets config.'
    );
  }
  const httpsAgent = new https.Agent({
    cert: ENV.jiosignClientCert,
    key: ENV.jiosignClientKey,
    ca: ENV.jiosignCaCert || undefined,
    rejectUnauthorized: true,
  });
  client = axios.create({
    baseURL: ENV.jiosignBaseUrl,
    httpsAgent,
    headers: {
      'Ip-Address': ENV.jiosignIpAddress,
      'Mac-Id': ENV.jiosignMacId,
      Token: ENV.jiosignToken,
      Txn: ENV.jiosignTxn,
    },
  });
  return client;
}

export interface JioSignParticipant {
  email: string;
  role: 'signer' | 'viewer';
}

// idType 1 = email identifier. access 1 = sign, access 2 = view.
// participantTag increments per signer (matches the "1", "2" tags in the doc's example).
function buildParticipantPayload(participants: JioSignParticipant[]) {
  let signerTag = 0;
  return participants.map(p => {
    const isViewer = p.role === 'viewer';
    if (!isViewer) signerTag += 1;
    return {
      idValue: p.email,
      idType: 1,
      access: isViewer ? 2 : 1,
      signOrder: -1,
      assuranceLevel: '4',
      ...(isViewer ? {} : { participantTag: String(signerTag) }),
      notifications: [
        { frequency: 1, freq_unit: 3, notification_type: 1, enable: 1 },
        { frequency: 1, freq_unit: 3, notification_type: 6, enable: isViewer ? 1 : 0 },
        { frequency: 1, freq_unit: 3, notification_type: 7, enable: 1 },
      ],
      ...(isViewer ? {} : {
        settings: [{ type: 22, enable: 1 }],
        cards: [{ cTag: 1, cardColor: '#8cf2ce' }],
      }),
    };
  });
}

/** Step 1: create a JioSign document/envelope shell, returns groupId. */
export async function createDocument(name: string): Promise<string> {
  const res = await getClient().post('/docmgmt/v1.1/document', { name });
  const groupId = res.data?.groupId;
  if (!groupId) throw new Error('JioSign did not return a groupId');
  return groupId;
}

/** Step 2: upload the PDF + participants + signing-card settings against a groupId. */
export async function uploadDocumentData(opts: {
  groupId: string;
  fileBuffer: Buffer;
  fileName: string;
  message: string;
  participants: JioSignParticipant[];
}): Promise<void> {
  const form = new FormData();
  form.append('groupId', opts.groupId);
  form.append('message', opts.message || '');
  form.append('file', new Blob([new Uint8Array(opts.fileBuffer)]), opts.fileName);
  form.append('participants', JSON.stringify(buildParticipantPayload(opts.participants)));
  form.append('grpSettings', JSON.stringify([{ type: 24, enable: 1 }]));
  // Cards are auto-placed by JioSign rather than positioned pixel-by-pixel from this app.
  form.append('autoLocateCards', '1');
  await getClient().post('/docmgmt/v1.1/document/data', form);
}

/** Step 3: start the signing action for one signer — JioSign notifies them directly. */
export async function initiateSign(
  groupId: string,
  signerEmail: string,
  message: string,
): Promise<{ actionToken: string; txnId: string }> {
  const res = await getClient().post('/docmgmt/v1.1/document/sign/initiate', {
    identifier: signerEmail,
    assuranceLevel: 4,
    groupId,
    message: message || 'Please sign the agreement',
    authType: 2,
    tandc: 'Y',
    action: 101,
  });
  const data = res.data || {};
  const actionToken = data['action-token'] || data.actionToken || data?.data?.['action-token'] || '';
  const txnId = data.txnid || data.transactionId || data.txn || data?.data?.txnid || '';
  return { actionToken, txnId };
}

/** Poll completion for a signer's action. Scoped by Action-Token, not groupId, per JioSign. */
export async function getSignStatus(actionToken: string): Promise<Record<string, unknown>> {
  const res = await getClient().get('/docmgmt/v1.1/document/sign/status', {
    headers: { 'Action-Token': actionToken },
  });
  return res.data || {};
}

const COMPLETE_FIELDS = ['status', 'state', 'signStatus', 'signingStatus', 'message', 'description', 'result'];
const COMPLETE_MARKERS = ['COMPLETE', 'COMPLETED', 'SUCCESS', 'SUCCESSFUL', 'SIGNED'];
const COMPLETE_MESSAGE_MARKERS = [
  'DOCUMENT SIGNED', 'SIGNATURE SUCCESS', 'SIGNED SUCCESS', 'SIGNING COMPLETE', 'SIGNING COMPLETED',
];

export function isSignComplete(status: Record<string, unknown>): boolean {
  if (status.success === true || status.signed === true || status.completed === true) return true;
  for (const field of COMPLETE_FIELDS) {
    const value = String(status[field] ?? '').toUpperCase();
    if (!value) continue;
    if (COMPLETE_MARKERS.includes(value)) return true;
    if (COMPLETE_MESSAGE_MARKERS.some(m => value.includes(m))) return true;
  }
  return false;
}

/** Fetch the signed PDF once complete. */
export async function downloadSignedFile(groupId: string): Promise<Buffer> {
  const res = await getClient().get('/docmgmt/v1.1/signed/file', {
    params: { groupId },
    responseType: 'arraybuffer',
  });
  return Buffer.from(res.data as ArrayBuffer);
}
