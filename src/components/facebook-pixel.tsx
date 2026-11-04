"use client";

import Script from "next/script";

// Pixel Facebook (Meta) de la page d'accueil publique — mesure les visites et les demandes de
// contact pour les campagnes publicitaires. Volontairement absent de tout l'espace connecté :
// les adresses et contenus de ces pages portent des données de patients, qui ne doivent jamais
// partir vers un service publicitaire. Le CSP n'autorise d'ailleurs ses domaines que sur « / »
// (cf. src/middleware.ts).
export const FACEBOOK_PIXEL_ID = "1105587948944981";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

// Événement standard « Lead » : une demande de contact envoyée depuis le site.
export function trackLead() {
  window.fbq?.("track", "Lead");
}

export default function FacebookPixel() {
  return (
    <>
      <Script id="facebook-pixel" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;
n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${FACEBOOK_PIXEL_ID}');fbq('track','PageView');`}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img height="1" width="1" style={{ display: "none" }} alt="" src={`https://www.facebook.com/tr?id=${FACEBOOK_PIXEL_ID}&ev=PageView&noscript=1`} />
      </noscript>
    </>
  );
}
