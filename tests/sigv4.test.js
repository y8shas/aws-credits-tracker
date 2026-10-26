const test = require('node:test');
const assert = require('node:assert');
if (!globalThis.crypto) globalThis.crypto = require('node:crypto').webcrypto;
const { signRequest } = require('../extension/sigv4.js');

// Official example from the AWS "Signature Version 4 signing process" documentation (IAM ListUsers).
test('SigV4 signature matches the AWS documentation example', async () => {
  const r = await signRequest({
    method: 'GET',
    path: '/',
    query: 'Action=ListUsers&Version=2010-05-08',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
      Host: 'iam.amazonaws.com',
      'X-Amz-Date': '20150830T123600Z',
    },
    body: '',
    creds: { accessKey: 'AKIDEXAMPLE', secretKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' },
    region: 'us-east-1',
    service: 'iam',
    amzDate: '20150830T123600Z',
  });
  assert.strictEqual(r.signedHeaders, 'content-type;host;x-amz-date');
  assert.strictEqual(r.signature, '5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7');
  assert.match(r.authorization, /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20150830\/us-east-1\/iam\/aws4_request, /);
});
