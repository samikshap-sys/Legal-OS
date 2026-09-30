/**
 * jiosignClient.ts — thin client for JioSign's upstream document-signing API.
 * Endpoint shapes and headers are taken from the official "JioSign API
 * Specification v2.5" PDF (downloaded from the Integrations tab of the
 * gofynd.com JioSign business account), cross-checked against
 * JIOSIGN_INTEGRATION.md. Scoped to the "sender" side of the flow: create →
 * upload → initiate. Once initiated, JioSign notifies the signer directly
 * (email/SMS) and they complete OTP entry + signing on JioSign's own hosted
 * page — this app never collects OTPs or signature images itself.
 *
 * Per the official spec's Request Headers tables (sections 4.1.2 / 4.2.1),
 * document-management calls need only: Ip-Address, Content-Type, Token, Txn,
 * and (optional) Mac-Id — no mTLS client certificate. `Token` is the
 * long-lived JWT downloaded once from Profile → Integrations → "Generate
 * Access Token" in the JioSign portal (not something this app requests via
 * API — the old token/session-generation endpoints are deprecated). `Txn` is
 * a per-request identifier the *caller* generates for traceability; JioSign
 * does not enforce any particular format or uniqueness beyond "don't reuse
 * it," so a fresh UUID is generated for every call here.
 */
import axios, { type AxiosInstance } from 'axios';
import { randomUUID } from 'crypto';
import { ENV } from './_core/env';

let client: AxiosInstance | null = null;

function getClient(): AxiosInstance {
  if (client) return client;
  if (!ENV.jiosignBaseUrl || !ENV.jiosignToken) {
    throw new Error(
      'JioSign config missing: set JIOSIGN_BASE_URL and JIOSIGN_TOKEN (from Profile > Integrations > ' +
      'Generate Access Token in the JioSign portal) in the Boltic Secrets config.'
    );
  }
  client = axios.create({
    baseURL: ENV.jiosignBaseUrl,
    headers: {
      'Ip-Address': ENV.jiosignIpAddress || '127.0.0.1',
      Token: ENV.jiosignToken,
      ...(ENV.jiosignMacId ? { 'Mac-Id': ENV.jiosignMacId } : {}),
    },
  });
  return client;
}

// Per-request Txn header — JioSign requires it present and caller-unique, not a fixed secret.
function txnHeader(): Record<string, string> {
  return { Txn: randomUUID() };
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
  const res = await getClient().post('/docmgmt/v1.1/document', { name }, { headers: txnHeader() });
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
  await getClient().post('/docmgmt/v1.1/document/data', form, { headers: txnHeader() });
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
  }, { headers: txnHeader() });
  const data = res.data || {};
  const actionToken = data['action-token'] || data.actionToken || data?.data?.['action-token'] || '';
  const txnId = data.txnid || data.transactionId || data.txn || data?.data?.txnid || '';
  return { actionToken, txnId };
}

/** Poll completion for a signer's action. Scoped by Action-Token, not groupId, per JioSign. */
export async function getSignStatus(actionToken: string): Promise<Record<string, unknown>> {
  const res = await getClient().get('/docmgmt/v1.1/document/sign/status', {
    headers: { ...txnHeader(), 'Action-Token': actionToken },
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
    headers: txnHeader(),
    responseType: 'arraybuffer',
  });
  return Buffer.from(res.data as ArrayBuffer);
}
