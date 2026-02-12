import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, createPublicClient, http, parseUnits, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';

// Polyfill global fetch (required by @x402/fetch, may be missing in some Node builds)
if (typeof globalThis.fetch === 'undefined') {
  try {
    var _undici = await import('undici');
    globalThis.fetch = _undici.fetch;
    globalThis.Headers = _undici.Headers;
    globalThis.Request = _undici.Request;
    globalThis.Response = _undici.Response;
    console.log('Polyfilled global fetch via undici');
  } catch(_e) {
    console.error('WARNING: global fetch not available — x402 payments will not work');
  }
}

// x402 v2 SDK — matches official coinbase/x402 example
var x402Loaded = false;
var x402WrapFetch = null;
var x402ClientInstance = null;
try {
  var fetchMod = await import('@x402/fetch');
  var evmMod = await import('@x402/evm/exact/client');
  x402WrapFetch = fetchMod.wrapFetchWithPayment;
  var X402Client = fetchMod.x402Client;
  x402ClientInstance = new X402Client();
  // Will register signer after account is created (below)
  console.log('@x402/fetch + @x402/evm loaded (v2)');
  x402Loaded = true;
} catch(_e) {
  console.log('x402 v2 SDK not available: ' + _e.message);
  // Try v1 fallback (x402-fetch)
  try {
    var v1mod = await import('x402-fetch');
    x402WrapFetch = v1mod.wrapFetchWithPayment;
    console.log('x402-fetch v1 SDK loaded (fallback)');
    x402Loaded = true;
  } catch(_e2) {
    console.log('x402-fetch v1 also not available: ' + _e2.message);
  }
}

var USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

function loadEnv(path) {
  try {
    var content = readFileSync(path, 'utf-8');
    var vars = {};
    content.split('\n').forEach(function(line) {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      var idx = line.indexOf('=');
      if (idx > 0) vars[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    });
    return vars;
  } catch(e) { return {}; }
}

// Try multiple env file locations (root + non-root installs)
var HOME = homedir();
var env = loadEnv('/opt/openclaw/.env');
if (!env.AGENT_WALLET_PRIVATE_KEY) env = loadEnv(HOME + '/.clawtrl/.env');
if (!env.AGENT_WALLET_PRIVATE_KEY) env = loadEnv(HOME + '/.env');
if (!env.AGENT_WALLET_PRIVATE_KEY) env = loadEnv('.env');
var pk = env.AGENT_WALLET_PRIVATE_KEY || process.env.AGENT_WALLET_PRIVATE_KEY;
if (!pk || !pk.startsWith('0x')) {
  console.error('AGENT_WALLET_PRIVATE_KEY not found or invalid');
  console.error('Searched: /opt/openclaw/.env, ~/.clawtrl/.env, ~/.env, .env, $AGENT_WALLET_PRIVATE_KEY');
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

// Initialize x402 payment-wrapped fetch
var x402Fetch = null;
if (x402Loaded && x402WrapFetch) {
  try {
    if (x402ClientInstance) {
      // v2: register EVM signer on x402Client, then wrap fetch
      var evmMod = await import('@x402/evm/exact/client');
      evmMod.registerExactEvmScheme(x402ClientInstance, { signer: account });
      x402Fetch = x402WrapFetch(globalThis.fetch, x402ClientInstance);
      console.log('x402 v2 payment fetch ready (scheme: exact, network: base)');
    } else {
      // v1 fallback: wrapFetchWithPayment(fetch, walletClient)
      x402Fetch = x402WrapFetch(globalThis.fetch, walletClient);
      console.log('x402 v1 payment fetch ready');
    }
  } catch(e) {
    console.log('Failed to init x402 fetch: ' + e.message);
  }
}

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

      var response;
      if (x402Fetch) {
        // x402 payment — auto-handles 402 responses
        console.log('fetch via x402: ' + method + ' ' + body.url);
        response = await x402Fetch(body.url, init);
      } else if (typeof globalThis.fetch === 'function') {
        // Fallback: plain fetch (no x402 payment handling)
        console.log('fetch (no x402): ' + method + ' ' + body.url);
        response = await globalThis.fetch(body.url, init);
      } else {
        return jsonRes(res, 500, { error: 'No fetch implementation available. Ensure Node 18+ is installed.' });
      }

      var respBody = await response.text();
      var respHdrs = {};
      response.headers.forEach(function(v, k) { respHdrs[k] = v; });
      return jsonRes(res, 200, { status: response.status, headers: respHdrs, body: respBody });
    } catch(e) {
      console.error('/fetch error:', e.message);
      return jsonRes(res, 500, { error: e.message });
    }
  }

  jsonRes(res, 404, { error: 'not found' });
}

createServer(handler).listen(8128, '127.0.0.1', function() {
  console.log('Clawtrl signing proxy on 127.0.0.1:8128 | wallet: ' + account.address);
});
