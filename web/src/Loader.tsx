/** Latausnäkymä: pyörivä rinkula ja teksti. Tyylit styles.css:ssä (.loader). */
export function Loader({ text }: { text: string }) {
  return (
    <div className="loader" role="status" aria-live="polite">
      <span className="loader-spinner" aria-hidden="true" />
      <p className="loader-text">{text}</p>
    </div>
  );
}
