import { copyFile, mkdir } from "node:fs/promises";

await mkdir(new URL("./vendor/", import.meta.url), { recursive: true });
await copyFile(
  new URL("./node_modules/@azure/msal-browser/lib/msal-browser.min.js", import.meta.url),
  new URL("./vendor/msal-browser.min.js", import.meta.url)
);
console.log("Copied the locally installed MSAL browser bundle to vendor/msal-browser.min.js");
