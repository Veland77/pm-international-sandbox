// src/views/layout.js
// Shared page wrapper: sandbox banner + site nav + shared stylesheet/script,
// used by every app page. src/views/inquiryPrintPage.js is the one
// exception — it's a standalone document, not wrapped by this.

function layout({ title, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — PM International Sandbox</title>
  <link rel="stylesheet" href="/styles.css">
  <script src="/app.js" defer></script>
</head>
<body>
  <div class="banner">SANDBOX — TEST DATA</div>
  <nav class="site-nav">
    <a class="site-title" href="/">PM International Sandbox</a>
    <div class="site-links">
      <a href="/rfqs">RFQs</a>
    </div>
  </nav>
  <div class="page-container">
    ${bodyHtml}
  </div>
</body>
</html>`;
}

module.exports = { layout };
