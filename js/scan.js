// Barcode-Scan mit der Handykamera (kostenlos, alles im Browser).
// Erkennung: eingebaute BarcodeDetector-Schnittstelle (Android/Chrome) und – sobald sie fehlt oder nach 3 s nichts
// gefunden hat – die freie Bibliothek ZXing (iPhone/Safari; wird nur beim ersten Scan nachgeladen).
// Kamera geht nur über HTTPS – GitHub Pages und localhost passen.
//
// Für Buch-Barcodes wichtig (iPhone-Test 11/2026: Kamera lief, aber nichts wurde erkannt):
//  * nur Strichcodes suchen (BrowserMultiFormatOneDReader, „Try harder“) – schneller und treffsicherer
//  * hohe Auflösung + Dauer-Autofokus anfordern, sonst sind die feinen Striche unscharf
//  * ZXing liest aus dem schon laufenden Video (decodeFromVideoElement) statt die Kamera neu zu starten
import { normalizeIsbn } from './isbn.js';
import { $, haptic } from './util.js';

const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm';
const TRY_HARDER = 3; // DecodeHintType.TRY_HARDER in @zxing/library

/**
 * Öffnet den Scanner. Liefert die ISBN-13 oder null (abgebrochen).
 */
export function scanIsbn() {
  return new Promise((resolve) => {
    const box = $('#scanner');
    const video = $('#scanVideo');
    const hint = $('#scanHint');
    const engine = $('#scanEngine');
    let stream = null;
    const stoppers = [];
    let done = false;

    const finish = (result) => {
      if (done) return;
      done = true;
      stoppers.forEach((stop) => { try { stop(); } catch { /* egal */ } });
      stream?.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      box.hidden = true;
      $('#scanClose').onclick = null;
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const onKey = (ev) => { if (ev.key === 'Escape') finish(null); };
    const found = (raw) => {
      if (done) return;
      const isbn = normalizeIsbn(raw);
      if (isbn) { haptic(60); finish(isbn); }
      else hint.textContent = 'Das ist keine Buch-ISBN – bitte den Barcode mit 978… scannen.';
    };

    box.hidden = false;
    hint.textContent = 'Halte den Barcode auf der Buchrückseite in den Rahmen – etwa 15 cm Abstand.';
    engine.textContent = 'Kamera wird gestartet …';
    $('#scanClose').onclick = () => finish(null);
    document.addEventListener('keydown', onKey);

    const startZxing = async () => {
      try {
        engine.textContent = 'Scanner wird geladen …';
        const { BrowserMultiFormatOneDReader } = await import(ZXING_URL);
        if (done) return;
        const reader = new BrowserMultiFormatOneDReader(new Map([[TRY_HARDER, true]]), { delayBetweenScanAttempts: 120 });
        const controls = await reader.decodeFromVideoElement(video, (result) => { if (result) found(result.getText()); });
        stoppers.push(() => controls.stop());
        if (done) controls.stop();
        engine.textContent = 'Erkennung: ZXing (Strichcodes)';
      } catch {
        engine.textContent = 'Der Scanner konnte nicht geladen werden (keine Internetverbindung?).';
      }
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
      } catch (err) {
        engine.textContent = err.name === 'NotAllowedError'
          ? 'Kein Kamerazugriff erlaubt. Bitte in den Einstellungen die Kamera für diese Seite erlauben.'
          : 'Die Kamera konnte nicht gestartet werden.';
        return;
      }
      if (done) { stream.getTracks().forEach((t) => t.stop()); return; }
      // Dauer-Autofokus, wo möglich (sonst bleibt das Bild bei Nahaufnahmen unscharf)
      const track = stream.getVideoTracks()[0];
      try { await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch { /* nicht unterstützt */ }
      video.srcObject = stream;
      await video.play().catch(() => {});

      const formats = 'BarcodeDetector' in window ? await window.BarcodeDetector.getSupportedFormats?.().catch(() => []) || [] : [];
      if (formats.includes('ean_13')) {
        engine.textContent = 'Erkennung: eingebaut';
        const detector = new window.BarcodeDetector({ formats: ['ean_13'] });
        const timer = setInterval(async () => {
          if (done || video.readyState < 2) return;
          try {
            const codes = await detector.detect(video);
            if (codes[0]) found(codes[0].rawValue);
          } catch { /* nächster Versuch */ }
        }, 200);
        stoppers.push(() => clearInterval(timer));
        // Findet die eingebaute Erkennung nichts, zusätzlich ZXing starten
        const fallback = setTimeout(() => { if (!done) startZxing(); }, 3000);
        stoppers.push(() => clearTimeout(fallback));
      } else {
        startZxing();
      }
    })();
  });
}
