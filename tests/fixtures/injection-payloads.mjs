// These are inert test data. Reviews must remain literal strings, not executable syntax.
export const injectionPayloads = [
  { name: 'HTML event handler', text: '<img src=x onerror=alert(1)>' },
  { name: 'SVG handler', text: '<svg onload=alert(1)></svg>' },
  {
    name: 'HTML breakout',
    text: '</blockquote><iframe srcdoc="<script>alert(1)</script>"></iframe>',
  },
  { name: 'Encoded HTML', text: '&lt;img src=x onerror=alert(1)&gt;' },
  { name: 'Script URL', text: '<a href="javascript:alert(1)">click</a>' },
  { name: 'SQL syntax', text: "'); DROP TABLE reviews; --" },
  { name: 'SQL boolean expression', text: "' OR '1'='1" },
];
