import React from 'react';
import { REGLAMENTO } from '../data/boardConfig';

function renderMarkdown(text) {
  // Minimal markdown renderer for the rules
  return text.split('\n').map((line, i) => {
    if (line.startsWith('# '))
      return <h2 key={i} style={{ color: '#fbbf24', margin: '0 0 12px', fontSize: 20 }}>{line.slice(2)}</h2>;
    if (line.startsWith('## '))
      return <h3 key={i} style={{ color: '#93c5fd', margin: '16px 0 6px', fontSize: 16 }}>{line.slice(3)}</h3>;
    if (line.startsWith('### '))
      return <h4 key={i} style={{ color: '#e2e8f0', margin: '12px 0 4px', fontSize: 14, fontWeight: 700 }}>{line.slice(4)}</h4>;
    if (line.startsWith('- '))
      return <li key={i} style={{ color: '#cbd5e1', fontSize: 13, marginBottom: 4, marginLeft: 16 }}>
        {renderInline(line.slice(2))}
      </li>;
    if (line.trim() === '') return <br key={i} />;
    return <p key={i} style={{ color: '#cbd5e1', fontSize: 13, margin: '4px 0', lineHeight: 1.6 }}>
      {renderInline(line)}
    </p>;
  });
}

function renderInline(text) {
  // Bold **text**
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((p, i) =>
    i % 2 === 1 ? <strong key={i} style={{ color: 'white' }}>{p}</strong> : p
  );
}

export default function HelpModal({ onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 2000,
      backdropFilter: 'blur(6px)',
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: 16,
        padding: 24,
        maxWidth: 600,
        width: '90%',
        maxHeight: '80vh',
        overflowY: 'auto',
        boxShadow: '0 25px 80px rgba(0,0,0,0.6)',
        position: 'relative',
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: 16, right: 16,
          background: '#374151', border: 'none', color: 'white',
          width: 32, height: 32, borderRadius: '50%',
          cursor: 'pointer', fontSize: 18, fontWeight: 700,
        }}>×</button>
        <div>{renderMarkdown(REGLAMENTO)}</div>
      </div>
    </div>
  );
}
