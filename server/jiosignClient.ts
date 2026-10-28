/**
 * jiosignClient.ts — thin client for JioSign's upstream document-signing API.
 * Endpoint shapes and headers are cross-checked against both the official
 * "JioSign API Specification v2.5" PDF and a live Postman SIT walkthrough
 * (JIO SIGN API Routing doc) that captured real request/response payloads.
 *
 * JioSign does NOT host a signing page — it emails/SMSes the OTP straight to
 * the participant, and this app is responsible for the full loop: initiate →
 * collect the OTP from the signer → verifyOtp → collect their name +
 * signature/initial images → completeSign → poll status → download.
 *
 * Headers used on every call: Ip-Address, Mac-Id, Token, Txn, Content-Type
 * (json or multipart depending on the endpoint) — no mTLS client certificate.
 * `Token` is the long-lived JWT downloaded once from Profile → Integrations →
 * "Generate Access Token" in the JioSign portal. `Txn` is a per-request
 * identifier the *caller* generates for traceability; JioSign does not
 * enforce any particular format or uniqueness beyond "don't reuse it," so a
 * fresh UUID is generated for every call here. `Action-Token` (returned by
 * sign/initiate) scopes every subsequent call in that signer's flow.
 */
import axios, { type AxiosInstance } from 'axios';
import { randomUUID } from 'crypto';
import { PDFParse } from 'pdf-parse';
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
//
// `cards` uses JioSign's manual-placement coordinates rather than the `cTag`-based
// auto-locate shorthand — `autoLocateCards: 1` alone requires a text-tag marker
// embedded in the PDF content that we have no way to guarantee is present, so every
// signer gets an explicit card instead. Confirmed against a live, successful SIT
// request: cardType/cardX/cardY/cardH/cardW/totalPage/cardPageNo/cardOnPage/cardColor.
// Cards are placed on the document's last page; multiple signers on that page are
// staggered horizontally (cardX) so their cards don't overlap.
function buildParticipantPayload(participants: JioSignParticipant[], totalPage: number) {
  const cardPageNo = totalPage;
  let signerTag = 0;
  let cardOnPage = 0;
  return participants.map(p => {
    const isViewer = p.role === 'viewer';
    if (!isViewer) { signerTag += 1; cardOnPage += 1; }
    return {
      idValue: p.email,
      idType: 1,
      access: isViewer ? 2 : 1,
      signOrder: -1,
      assuranceLevel: '4',
      ...(isViewer ? {} : { participantTag: String(signerTag) }),
      notifications: [
        { frequency: 1, freq_unit: 3, notification_type: 1, enable: 1 },
        { frequency: 1, freq_unit: 3, notification_type: 2, enable: 1 },
        { frequency: 1, freq_unit: 3, notification_type: 6, enable: 1 },
        { frequency: 1, freq_unit: 3, notification_type: 13, enable: 1 },
      ],
      ...(isViewer ? {} : {
        cards: [{
          cardType: 2,
          cardX: 23 + (cardOnPage - 1) * 130,
          cardY: 710,
          cardH: 44,
          cardW: 105,
          totalPage,
          cardPageNo,
          cardOnPage,
          cardColor: '#8CF2CE',
        }],
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
  const parser = new PDFParse({ data: opts.fileBuffer });
  const info = await parser.getInfo();
  await parser.destroy();
  const totalPage = info.total || 1;

  const form = new FormData();
  form.append('groupId', opts.groupId);
  form.append('message', opts.message || '');
  form.append('file', new Blob([new Uint8Array(opts.fileBuffer)]), opts.fileName);
  form.append('participants', JSON.stringify(buildParticipantPayload(opts.participants, totalPage)));
  // Field name is "settings" (not "grpSettings") per the live Postman collection —
  // the walkthrough doc's field name was wrong and JioSign silently ignores unknown keys.
  form.append('settings', JSON.stringify([{ type: 24, enable: 1 }]));
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

/** Step 4: verify the OTP JioSign emailed/texted to the signer. */
export async function verifyOtp(actionToken: string, code: string): Promise<Record<string, unknown>> {
  const res = await getClient().post('/docmgmt/v1.1/document/sign/verifyotp', { code }, {
    headers: { ...txnHeader(), 'Action-Token': actionToken },
  });
  return res.data || {};
}

/** Step 5: render the signer's name + signature/initial images onto the document to finalize it. */
export async function completeSign(opts: {
  actionToken: string;
  name: string;
  signatureImg: Buffer;
  signatureFileName?: string;
  initialImg?: Buffer;
  initialFileName?: string;
}): Promise<Record<string, unknown>> {
  const form = new FormData();
  form.append('name', opts.name);
  form.append('signatureImg', new Blob([new Uint8Array(opts.signatureImg)]), opts.signatureFileName || 'signature.png');
  // JioSign's own walkthrough reuses the signature image as the initial image when a
  // separate one isn't supplied — initials are a secondary mark, not a distinct signature.
  const initialBuf = opts.initialImg || opts.signatureImg;
  form.append('initialImg', new Blob([new Uint8Array(initialBuf)]), opts.initialFileName || opts.signatureFileName || 'initial.png');
  const res = await getClient().post('/docmgmt/v1.1/document/sign', form, {
    headers: { ...txnHeader(), 'Action-Token': opts.actionToken },
  });
  return res.data || {};
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
