import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, createPublicClient, http, parseUnits, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';
import { wrapFetchWithPayment } from 'x402-fetch';

var USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
var x402v2Fetch = null;

function loadEnv(path) {
  try {
    var content = readFileSync(path, 'utf-8');
    var vars = {};
    content.split('\n').forEach(function(line) {
      var idx = line.indexOf('=');
      if (idx > 0) vars[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    });
    return vars;
  } catch(e) { return {}; }
}

// Try multiple env file locations
var env = loadEnv('/opt/openclaw/.env');
if (!env.AGENT_WALLET_PRIVATE_KEY) env = loadEnv('.env');
var pk = env.AGENT_WALLET_PRIVATE_KEY || process.env.AGENT_WALLET_PRIVATE_KEY;
if (!pk || !pk.startsWith('0x')) {
  console.error('AGENT_WALLET_PRIVATE_KEY not found or invalid');
  console.error('Set it in /opt/openclaw/.env, .env, or as an environment variable');
  process.exit(1);
}

var account = privateKeyToAccount(pk);

var walletClient = createWalletClient({
  account: account,
  chain: base,
  transport: http('https://mainnet.base.org'),
});
var publicClient = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org'),
});

// x402 v1: EIP-3009 transferWithAuthorization (Portal Foundation, etc)
var x402Fetch = wrapFetchWithPayment(walletClient);

// x402 v2: Permit2 (loaded dynamically — optional, graceful fallback)
(async function() {
  try {
    var mod1 = await import('@x402/fetch');
    var mod2;
    try { mod2 = await import('@x402/evm'); } catch(e) { mod2 = await import('@x402/evm/exact/client'); }
    var client = new mod1.x402Client();
    mod2.registerExactEvmScheme(client, { signer: account });
    x402v2Fetch = mod1.wrapFetchWithPaymentFromConfig(client);
    console.log('x402 v2 SDK loaded (Permit2 support)');
  } catch(e) {
    console.log('x402 v2 not available, using v1 only: ' + e.message);
  }
})();

// ERC-8128: sign an HTTP request with the agent wallet
async function erc8128Sign(url, method, body) {
  var timestamp = Math.floor(Date.now() / 1000).toString();
  var bodyStr = body || '';
  var bodyHash = createHash('sha256').update(bodyStr).digest('hex');
  var message = [method.toUpperCase(), url, bodyHash, timestamp, '8453'].join('\n');
  var signature = await account.signMessage({ message: message });
  return {
    'X-ERC8128-Address': account.address,
    'X-ERC8128-Signature': signature,
    'X-ERC8128-Timestamp': timestamp,
    'X-ERC8128-Chain-Id': '8453',
  };
}

function readBody(req) {
  return new Promise(function(resolve) {
    var chunks = [];
    req.on('data', function(c) { chunks.push(c); });
    req.on('end', function() { resolve(Buffer.concat(chunks).toString()); });
  });
}

function jsonRes(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.url === '/health') {
    return jsonRes(res, 200, { status: 'ok', address: account.address, chain: 'base', chainId: 8453 });
  }

  if (req.url === '/identity') {
    return jsonRes(res, 200, { address: account.address, chain: 'base', chainId: 8453 });
  }

  if (req.url === '/balance') {
    try {
      var ethBal = await publicClient.getBalance({ address: account.address });
      var usdcBal = await publicClient.readContract({
        address: USDC, abi: [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }],
        functionName: 'balanceOf', args: [account.address],
      });
      var formatEther = function(wei) { return (Number(wei) / 1e18).toFixed(8); };
      var formatUsdc = function(raw) { return (Number(raw) / 1e6).toFixed(2); };
      return jsonRes(res, 200, { address: account.address, chain: 'base', eth: formatEther(ethBal), usdc: formatUsdc(usdcBal) });
    } catch(e) { return jsonRes(res, 500, { error: e.message }); }
  }

  if (req.url === '/transfer' && req.method === 'POST') {
    try {
      var body = JSON.parse(await readBody(req));
      if (!body.to || !body.amount) return jsonRes(res, 400, { error: 'to and amount required' });
      var token = (body.token || 'eth').toLowerCase();
      var txHash;
      if (token === 'usdc') {
        var amt = parseUnits(String(body.amount), 6);
        var data = encodeFunctionData({
          abi: [{ name: 'transfer', type: 'function', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] }],
          functionName: 'transfer', args: [body.to, amt],
        });
        txHash = await walletClient.sendTransaction({ to: USDC, data: data });
      } else {
        var weiAmount = BigInt(Math.floor(Number(body.amount) * 1e18));
        txHash = await walletClient.sendTransaction({ to: body.to, value: weiAmount });
      }
      await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 30000 });
      return jsonRes(res, 200, { success: true, hash: txHash, token: token, amount: body.amount, to: body.to });
    } catch(e) { return jsonRes(res, 500, { error: e.message }); }
  }

  if (req.url === '/sign' && req.method === 'POST') {
    try {
      var body = JSON.parse(await readBody(req));
      var hdrs = await erc8128Sign(body.url, body.method || 'GET', body.body || '');
      return jsonRes(res, 200, { headers: hdrs });
    } catch(e) { return jsonRes(res, 500, { error: e.message }); }
  }

  if (req.url === '/fetch' && req.method === 'POST') {
    try {
      var body = JSON.parse(await readBody(req));
      var method = body.method || 'GET';
      var headers = Object.assign({}, body.headers || {});
      // Add ERC-8128 signature headers
      var sigHeaders = await erc8128Sign(body.url, method, body.body || '');
      Object.assign(headers, sigHeaders);
      var init = { method: method, headers: headers };
      if (body.body) init.body = body.body;
      // x402 v1 (EIP-3009) — handles most x402 servers
      var response = await x402Fetch(body.url, init);
      // If still 402 and v2 SDK loaded, try v2 (Permit2)
      if (response.status === 402 && x402v2Fetch) {
        console.log('x402 v1 did not resolve 402, trying v2...');
        var init2 = { method: method, headers: Object.assign({}, headers) };
        if (body.body) init2.body = body.body;
        response = await x402v2Fetch(body.url, init2);
      }
      var respBody = await response.text();
      var respHdrs = {};
      response.headers.forEach(function(v, k) { respHdrs[k] = v; });
      return jsonRes(res, 200, { status: response.status, headers: respHdrs, body: respBody });
    } catch(e) { return jsonRes(res, 500, { error: e.message }); }
  }

  jsonRes(res, 404, { error: 'not found' });
}

createServer(handler).listen(8128, '127.0.0.1', function() {
  console.log('Clawtrl signing proxy on 127.0.0.1:8128 | wallet: ' + account.address);
});
