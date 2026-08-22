const fs = require("node:fs");
const path = require("node:path");

const distIndexPath = path.join(process.cwd(), "dist", "index.html");
const html = fs.readFileSync(distIndexPath, "utf8");

const headTags = `
<title>DayRange by WZXU</title>
<link rel="manifest" href="/dayrange/manifest.webmanifest">
<link rel="apple-touch-icon" href="/dayrange/dayrange-icon.svg">
`;

const serviceWorkerScript = `
<script>
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    var base = window.location.pathname.indexOf("/dayrange") === 0 ? "/dayrange" : "";
    navigator.serviceWorker.register(base + "/service-worker.js", { scope: base + "/" }).catch(function () {});
  });
}
</script>
`;

let nextHtml = html;

if (!nextHtml.includes("manifest.webmanifest")) {
  nextHtml = nextHtml.replace("</head>", `${headTags}</head>`);
}

if (!nextHtml.includes("serviceWorker")) {
  nextHtml = nextHtml.replace("</body>", `${serviceWorkerScript}</body>`);
}

fs.writeFileSync(distIndexPath, nextHtml);
