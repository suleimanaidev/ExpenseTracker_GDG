import { Fragment } from 'react';

/**
 * The monthly analysis is written as short bullet lines with the key numbers
 * wrapped in **double asterisks**, and the closing bullet is labelled
 * "Recommendation:". The chat bubbles strip markdown so casual replies stay
 * conversational, but this panel is a summary: bullets keep it skimmable and
 * the recommendation is pulled out into its own highlighted block so it cannot
 * get lost among the numbers. Rendering happens as React nodes (never raw
 * HTML), so a model response cannot inject markup.
 */
function renderEmphasis(line) {
  return line
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part, index) =>
      part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
        <strong key={index}>{part.slice(2, -2)}</strong>
      ) : (
        <Fragment key={index}>{part}</Fragment>
      )
    );
}

// Matches "Recommendation:", "**Recommendation:**" and the variants a model
// might produce ("Recommendation -", "**RECOMMENDATION:**").
const RECOMMENDATION_LABEL = /^\s*(\*\*)?\s*recommendation\s*:?\s*(\*\*)?\s*[-–]?\s*/i;

function splitRecommendation(content) {
  const match = content.match(RECOMMENDATION_LABEL);
  if (!match) return null;
  return content.slice(match[0].length).trim();
}

export default function InsightText({ text, className = '' }) {
  if (!text) return null;

  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const bullets = [];
  let recommendation = null;

  lines.forEach((line) => {
    const isBullet = /^[•\-*–]\s+/.test(line);
    const content = isBullet ? line.replace(/^[•\-*–]\s+/, '') : line;
    const tip = splitRecommendation(content);

    if (tip !== null) {
      recommendation = tip || content;
      return;
    }

    bullets.push({ content, isBullet });
  });

  return (
    <div className={`insight-list ${className}`.trim()}>
      {bullets.map((bullet, index) => (
        <p key={index} className={`insight-line${bullet.isBullet ? ' insight-line--bullet' : ''}`}>
          {bullet.isBullet && (
            <span className="insight-bullet" aria-hidden="true">
              •
            </span>
          )}
          <span className="insight-line-text">{renderEmphasis(bullet.content)}</span>
        </p>
      ))}

      {recommendation && (
        <div className="insight-recommendation">
          <span className="insight-recommendation-label">Recommendation</span>
          <p className="insight-recommendation-text">{renderEmphasis(recommendation)}</p>
        </div>
      )}
    </div>
  );
}
