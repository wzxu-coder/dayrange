import { ScrollViewStyleReset } from "expo-router/html";
import { PropsWithChildren } from "react";

const serviceWorkerRegistration = `
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    var base = window.location.pathname.indexOf("/dayrange") === 0 ? "/dayrange" : "";
    navigator.serviceWorker.register(base + "/service-worker.js", { scope: base + "/" }).catch(function () {});
  });
}
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content="#1E6F5C" />
        <meta
          name="description"
          content="DayRange by WZXU helps people track and organize manually entered glucose readings locally."
        />
        <link rel="manifest" href="/dayrange/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/dayrange/dayrange-icon.svg" />
        <ScrollViewStyleReset />
      </head>
      <body>
        {children}
        <script dangerouslySetInnerHTML={{ __html: serviceWorkerRegistration }} />
      </body>
    </html>
  );
}
