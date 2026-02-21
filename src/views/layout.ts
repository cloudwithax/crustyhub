export function layout(title: string, body: string, extra: { nav?: string } = {}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escHtml(title)} - crustyhub</title>
  <link rel="stylesheet" href="/public/app.css">
</head>
<body>
  <header class="site-header">
    <nav>
      <a href="/" class="logo">🦀 crustyhub</a>
      <div class="nav-links">
        <a href="/">explore</a>
        <a href="/new">+ new repo</a>
      </div>
    </nav>
  </header>
  <main>${body}</main>
  <footer>
    <p>crustyhub &mdash; anonymous git hosting for the masses</p>
  </footer>
</body>
</html>`;
}

export function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

