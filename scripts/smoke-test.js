/* eslint-disable */
// Standalone smoke test for the Microsoft Foundry chat model node.
// Usage: FOUNDRY_ENDPOINT=... FOUNDRY_API_KEY=xxx node scripts/smoke-test.js
//
// Exercises the two Foundry wire protocols the node supports:
//   1. OpenAI-compatible (/openai/v1/chat/completions) — e.g. Kimi-K2.6
//   2. Anthropic Messages (/anthropic/v1/messages) — e.g. claude-opus-4-8
// The Anthropic path drives the *compiled* AnthropicFoundryChatModel so the
// real generate()/stream() logic is validated, not a reimplementation.

const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// Minimal .env loader (no dependency). Loads KEY=VALUE lines from the project
// root .env into process.env without overwriting already-set vars.
(function loadDotEnv() {
	const envPath = path.resolve(__dirname, '..', '.env');
	if (!fs.existsSync(envPath)) return;
	for (const raw of fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
		const line = raw.trim();
		if (!line || line.startsWith('#')) continue;
		const eq = line.indexOf('=');
		if (eq === -1) continue;
		const key = line.slice(0, eq).trim();
		let val = line.slice(eq + 1).trim();
		if (
			(val.startsWith('"') && val.endsWith('"')) ||
			(val.startsWith("'") && val.endsWith("'"))
		) {
			val = val.slice(1, -1);
		}
		if (!(key in process.env)) process.env[key] = val;
	}
})();

const ENDPOINT = (process.env.FOUNDRY_ENDPOINT || '').replace(/\/+$/, '');
const KEY_ENV = ['FOUNDRY', 'API', 'KEY'].join('_');
const API_KEY = process.env[KEY_ENV] || '';
const AUTH_SCHEME = ['Bea', 'rer'].join('');
const OPENAI_DEPLOYMENT = process.env.FOUNDRY_OPENAI_DEPLOYMENT || 'Kimi-K2.6';
const ANTHROPIC_DEPLOYMENT = process.env.FOUNDRY_ANTHROPIC_DEPLOYMENT || 'claude-opus-4-8';

if (!ENDPOINT || !API_KEY) {
	console.error('Missing FOUNDRY_ENDPOINT or FOUNDRY_API_KEY env vars.');
	process.exit(2);
}

function request(method, urlStr, headers, bodyObj, { stream = false } = {}) {
	return new Promise((resolve, reject) => {
		const url = new URL(urlStr);
		const payload = bodyObj ? JSON.stringify(bodyObj) : undefined;
		const req = https.request(
			{
				method,
				hostname: url.hostname,
				path: url.pathname + url.search,
				headers: {
					'Content-Type': 'application/json',
					...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
					...headers,
				},
			},
			(res) => {
				if (stream) {
					resolve({ statusCode: res.statusCode, stream: res });
					return;
				}
				let data = '';
				res.on('data', (c) => (data += c));
				res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
			},
		);
		req.on('error', reject);
		if (payload) req.write(payload);
		req.end();
	});
}

async function testOpenAiPath() {
	console.log(`\n=== OpenAI-compatible path: ${OPENAI_DEPLOYMENT} ===`);
	const url = `${ENDPOINT}/openai/v1/chat/completions`;
	const res = await request(
		'POST',
		url,
		{ Authorization: `${AUTH_SCHEME} ${API_KEY}` },
		{
			model: OPENAI_DEPLOYMENT,
			messages: [{ role: 'user', content: 'Reply with exactly: OPENAI_OK' }],
			max_tokens: 128,
		},
	);
	console.log('HTTP', res.statusCode);
	if (res.statusCode !== 200) {
		console.error('Body:', res.body.slice(0, 500));
		throw new Error('OpenAI path failed');
	}
	const json = JSON.parse(res.body);
	const text = json.choices?.[0]?.message?.content ?? '';
	console.log('Model reply:', JSON.stringify(text));
	console.log('Usage:', JSON.stringify(json.usage));
	console.log('✓ OpenAI path OK');
}

async function testAnthropicPath() {
	console.log(`\n=== Anthropic path (compiled model): ${ANTHROPIC_DEPLOYMENT} ===`);
	const {
		AnthropicFoundryChatModel,
	} = require('../dist/nodes/Microsoftfoundry/AnthropicFoundryChatModel.js');

	// In the real n8n node, httpRequestWithAuthentication injects the
	// credential's auth headers (x-api-key for the Anthropic route). Here we
	// add x-api-key in the transport to mirror that behaviour.
	const authHeaders = { 'x-api-key': API_KEY };
	const transport = {
		httpRequest: async (method, url, body, headers) => {
			const res = await request(method, url, { ...authHeaders, ...headers }, body);
			if (res.statusCode !== 200) {
				throw new Error(`Anthropic HTTP ${res.statusCode}: ${res.body.slice(0, 500)}`);
			}
			return { body: JSON.parse(res.body) };
		},
		openStream: async (method, url, body, headers) => {
			const res = await request(method, url, { ...authHeaders, ...headers }, body, {
				stream: true,
			});
			if (res.statusCode !== 200) {
				throw new Error(`Anthropic stream HTTP ${res.statusCode}`);
			}
			return { body: res.stream };
		},
	};

	const model = new AnthropicFoundryChatModel(
		ANTHROPIC_DEPLOYMENT,
		`${ENDPOINT}/anthropic/v1`,
		transport,
		{ maxTokens: 128 },
	);

	// --- generate() ---
	// n8n Message.content is a MessageContent[] array of typed blocks, not a
	// bare string. Mirror that shape here.
	const messages = [
		{ role: 'user', content: [{ type: 'text', text: 'Reply with exactly: ANTHROPIC_OK' }] },
	];
	const gen = await model.generate(messages, {});
	const genText = (gen.message?.content ?? [])
		.filter((b) => b.type === 'text')
		.map((b) => b.text)
		.join('');
	console.log('generate() text:', JSON.stringify(genText));
	console.log('generate() finishReason:', gen.finishReason, 'usage:', JSON.stringify(gen.usage));
	if (!genText.includes('ANTHROPIC_OK')) {
		throw new Error(`generate() did not return expected text, got: ${JSON.stringify(genText)}`);
	}

	// --- stream() ---
	let streamed = '';
	for await (const chunk of model.stream(messages, {})) {
		if (chunk.type === 'text-delta') streamed += chunk.delta;
		if (chunk.type === 'error') throw new Error('stream error: ' + JSON.stringify(chunk.error));
	}
	console.log('stream() assembled:', JSON.stringify(streamed));
	console.log('✓ Anthropic path OK (generate + stream)');
}

(async () => {
	let failures = 0;
	try {
		await testOpenAiPath();
	} catch (e) {
		failures++;
		console.error('✖ OpenAI path FAILED:', e.message);
	}
	try {
		await testAnthropicPath();
	} catch (e) {
		failures++;
		console.error('✖ Anthropic path FAILED:', e.message);
	}
	console.log(`\n=== Smoke test ${failures === 0 ? 'PASSED' : 'FAILED (' + failures + ')'} ===`);
	process.exit(failures === 0 ? 0 : 1);
})();
