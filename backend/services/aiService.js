/**
 * Google Gemini AI Integration Service (gemini-2.5-flash)
 */

export const generateAIInsight = async (prompt, systemInstruction) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      insight: 'Gemini API key is not configured on the backend server. Please set GEMINI_API_KEY in backend/.env to enable spending insights.',
      isFallback: true,
    };
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemInstruction}\n\n${prompt}` }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 600,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API returned status ${response.status}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  return {
    insight: text || 'Unable to generate financial analysis.',
    isFallback: false,
  };
};

export const generateAIChatResponse = async (question, history, systemInstruction) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      answers: 'Gemini API key is not configured on the backend server. Please set GEMINI_API_KEY in backend/.env to enable spending insights.',
      isFallback: true,
    };
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  // Cap history to last 6 turns to manage context size
  const formattedHistory = (history || []).slice(-6).map((h) => ({
    role: h.role === 'user' ? 'user' : 'model',
    parts: [{ text: h.text }],
  }));

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        ...formattedHistory,
        {
          role: 'user',
          parts: [{ text: `${systemInstruction}\n\nUser Question: ${question}` }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 600,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API returned status ${response.status}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  return {
    answers: text || 'Unable to generate response.',
    isFallback: false,
  };
};
