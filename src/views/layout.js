// src/views/layout.js
// Shared page wrapper: sandbox banner + minimal styling, used by every page.

function layout({ title, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${title} — PM International Sandbox</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; color: #222; }
    .banner { background: #b00020; color: #fff; padding: 0.5rem 1rem; font-weight: bold; margin-bottom: 1.5rem; }
    table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
    th, td { border: 1px solid #ccc; padding: 0.5rem 0.75rem; text-align: left; }
    th { background: #f0f0f0; }
    a { color: #0645ad; }
    h1, h2 { margin-top: 1.5rem; }
    .back-link { display: inline-block; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="banner">SANDBOX — TEST DATA</div>
  ${bodyHtml}
</body>
</html>`;
}

module.exports = { layout };
