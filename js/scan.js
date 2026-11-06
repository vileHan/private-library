// Barcode-Scan mit der Handykamera (kostenlos, alles im Browser).
// Android/Chrome: eingebaute BarcodeDetector-Schnittstelle. iPhone/Safari & Co.: freie Bibliothek ZXing (wird nur
// beim ersten Scan nachgeladen). Kamera geht nur über HTTPS – GitHub Pages und localhost passen.
import { normalizeIsbn } from './isbn.js';
import { $ } from './util.js';

const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm';

/** Öffnet den Scanner. Liefert die ISBN-13 oder null (abgebrochen/Fehler). */
export function scanIsbn() {
  return new Promise((resolve) => {
    const box = $('#scanner');
    const video = $('#scanVideo');
    const hint = $('#scanHint');
    let stream = null;
    let stopZxing = null;
    let timer = null;
    let done = false;

    const finish = (isbn) => {
      if (done) return;
      done = true;
      clearInterval(timer);
      stopZxing?.();
      stream?.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      box.hidden = true;
      $('#scanClose').onclick = null;
      document.removeEventListener('keydown', onKey);
      resolve(isbn);
    };
    const onKey = (ev) => { if (ev.key === 'Escape') finish(null); };
    const found = (raw) => {
      const isbn = normalizeIsbn(raw);
      if (isbn) { navigator.vibrate?.(60); finish(isbn); }
      else hint.textContent = 'Das ist keine Buch-ISBN – bitte den Barcode mit 978… scannen.';
    };

    box.hidden = false;
    hint.textContent = 'Halte den Barcode auf der Buchrückseite in den Rahmen.';
    $('#scanClose').onclick = () => finish(null);
    document.addEventListener('keydown', onKey);

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      } catch (err) {
        hint.textContent = err.name === 'NotAllowedError'
          ? 'Kein Kamerazugriff erlaubt. Bitte in den Browser-Einstellungen die Kamera für diese Seite erlauben.'
          : 'Die Kamera konnte nicht gestartet werden.';
        return;
      }
      if (done) { stream.getTracks().forEach((t) => t.stop()); return; }
      video.srcObject = stream;
      await video.play().catch(() => {});

      const native = 'BarcodeDetector' in window
        && (await window.BarcodeDetector.getSupportedFormats?.().catch(() => []) || []).includes('ean_13');
      if (native) {
        const detector = new window.BarcodeDetector({ formats: ['ean_13'] });
        timer = setInterval(async () => {
          if (done || video.readyState < 2) return;
          try {
            const codes = await detector.detect(video);
            if (codes[0]) found(codes[0].rawValue);
          } catch { /* nächster Versuch */ }
        }, 250);
        return;
      }
      try {
        hint.textContent = 'Scanner wird geladen …';
        const { BrowserMultiFormatReader } = await import(ZXING_URL);
        if (done) return;
        hint.textContent = 'Halte den Barcode auf der Buchrückseite in den Rahmen.';
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromStream(stream, video, (result) => { if (result) found(result.getText()); });
        stopZxing = () => controls.stop();
        if (done) stopZxing();
      } catch {
        hint.textContent = 'Der Scanner konnte nicht geladen werden (keine Internetverbindung?).';
      }
    })();
  });
}
