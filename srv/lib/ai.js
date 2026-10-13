const cds = require('@sap/cds');
const LOG = cds.log('claude');

const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-5-5';
const API_VERSION = '2023-06-01';

// Send one request to the Claude Messages API
async function callAnthropic(body) {
  // Local development: API key from environment variable
  if (process.env.ANTHROPIC_API_KEY) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
           headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': API_VERSION,
        'content-type': 'application/json',
        ...(process.env.ANTHROPIC_WORKSPACE_ID && { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID })
      },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Claude API ${res.status}: ${data?.error?.message || res.statusText}`);
    return data;
  }

  // Deployed on BTP: destination "ClaudeAPI" adds the x-api-key and anthropic-version headers
  const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');
  try {
    const res = await executeHttpRequest(
      { destinationName: 'ClaudeAPI' },
      { method: 'post', url: '/v1/messages', data: body, headers: { 'content-type': 'application/json' } }
    );
    return res.data;
  } catch (e) {
    throw new Error(`Claude API ${e.response?.status || ''}: ${e.response?.data?.error?.message || e.message}`);
  }
}

// Write the log in its OWN transaction, so it is kept even if the calling action fails
function writeLog(entry) {
  cds.spawn({ user: cds.context?.user }, async () => {
    try {
      const { AICallLogs } = cds.entities('nw.replenish');
      await INSERT.into(AICallLogs).entries(entry);
    } catch (e) {
      LOG.error('Could not write AI call log:', e.message);
    }
  });
}

// Ask Claude and log the call. Returns the response text.
async function askClaude({ feature, system, prompt, maxTokens = 400, productID, supplierID }) {
  const started = Date.now();
  const entry = {
    ID: cds.utils.uuid(), feature, model: MODEL,
    prompt: system ? `[system]\n${system}\n\n[user]\n${prompt}` : prompt,
    product_ID: productID, supplier_ID: supplierID
  };

  try {
    const data = await callAnthropic({
      model: MODEL, max_tokens: maxTokens, system,
      messages: [{ role: 'user', content: prompt }]
    });
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (!text) {
      const types = (data.content || []).map(b => b.type).join(', ') || 'none';
      throw new Error(`Claude returned no text (stop_reason: ${data.stop_reason}, blocks: ${types}, ` +
                      `output tokens: ${data.usage?.output_tokens})`);
    }
    Object.assign(entry, {
      response: text, status: 'SUCCESS', durationMs: Date.now() - started,
      inputTokens: data.usage?.input_tokens, outputTokens: data.usage?.output_tokens
    });
    await writeLog(entry);
    return text;
  } catch (e) {
    Object.assign(entry, { status: 'ERROR', errorMessage: String(e.message).slice(0, 500), durationMs: Date.now() - started });
    await writeLog(entry);
    throw e;
  }
}

module.exports = { askClaude };