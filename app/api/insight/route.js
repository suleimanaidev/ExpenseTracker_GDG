export async function POST(request) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === 'your_key_here') {
    return Response.json(
      { error: 'Gemini API key not configured. Add GEMINI_API_KEY to .env.local and restart the server.' },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { summary, question, history } = body;

  if (!summary) {
    return Response.json({ error: 'Missing spending summary data.' }, { status: 400 });
  }

  // Build prompt
  let prompt;
  if (question) {
    // Chat follow-up mode
    const contextBlock = `You are a friendly personal finance assistant inside a budgeting app called Ledger. Here is the user's current spending data:
Monthly budget: ${summary.budget}
Total spent so far: ${summary.totalSpent}
Remaining: ${summary.remaining}
Spending by category: ${summary.categories}
Recent transactions: ${summary.recent}
Days left in month: ${summary.daysLeft}`;

    // Build conversation history
    let conversationHistory = contextBlock + '\n\n';
    if (history && history.length > 0) {
      conversationHistory += 'Previous conversation:\n';
      history.forEach(m => {
        conversationHistory += `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}\n`;
      });
      conversationHistory += '\n';
    }

    prompt = conversationHistory + `User asks: "${question}"

Answer the user's question based on their spending data. Keep it highly concise, specific, and conversational. Use plain text only (no bold text, no headers), but you can use clean bullet points starting with an asterisk (*) if listing items.`;
  } else {
    prompt = `You are a friendly personal finance assistant inside a budgeting app called Ledger. Here is the user's data:
Monthly budget: ${summary.budget}
Total spent so far: ${summary.totalSpent}
Remaining: ${summary.remaining}
Spending by category: ${summary.categories}
Recent transactions: ${summary.recent}
Days left in month: ${summary.daysLeft}

Provide a very concise spending analysis formatted as exactly 4 bullet points using asterisk (*) prefixes:
* Top Category: [A 1-sentence callout of the top spending category and what it represents]
* Budget Status: [A 1-sentence status on whether they are on track or near/over budget]
* Actionable Tip: [One specific, highly concrete saving tip based on their transaction history]
* Budget Runway: [Calculate daily velocity. Predict exactly which day they will hit the budget limit if velocity continues. If they are already over budget, state that runway is finished. If they are safe and will not exceed budget, state they are fully safe.]

Keep it friendly and conversational. Use plain text only — no markdown headers, no bold text, just clean bullet points starting with * and separated by newlines.`;
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      const errMsg = data?.error?.message || 'Gemini API request failed.';
      // Never leak the API key in error messages
      const safeMsg = errMsg.replace(apiKey, '[REDACTED]');
      return Response.json({ error: safeMsg }, { status: res.status });
    }

    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';

    if (!text) {
      return Response.json({ error: 'Empty response from the model. Please try again.' }, { status: 502 });
    }

    return Response.json({ insight: text });
  } catch (err) {
    return Response.json(
      { error: 'Failed to connect to Gemini API. Please check your network connection and API key.' },
      { status: 500 }
    );
  }
}
