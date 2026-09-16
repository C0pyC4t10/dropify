"use client";

import { useEffect } from "react";

const themeBootstrap = `(function(){try{var t=localStorage.getItem('dropify-theme')||localStorage.getItem('bazarey-theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;}}catch(e){}})();`;

/** Imperatively inject the theme-bootstrap script into <head>. Done from an
 *  effect (not as a JSX <script>) so React 19 doesn't emit its
 *  "Encountered a script tag while rendering React component" warning.
 *  Trade-off: the script runs after first paint rather than synchronously
 *  with the HTML parser, so users with light mode saved may see a brief
 *  dark flash — acceptable in exchange for a clean console. */
export function ThemeBootstrapScript() {
  useEffect(() => {
    if (document.getElementById("theme-bootstrap")) return;
    const s = document.createElement("script");
    s.id = "theme-bootstrap";
    s.textContent = themeBootstrap;
    document.head.appendChild(s);
  }, []);
  return null;
}