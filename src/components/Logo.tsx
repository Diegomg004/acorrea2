// Logotipo: «Acorrea» + una chapa de perro con el «2», colgada de una correa
// que sale del asa. La correa se dibuja sola y la chapa se balancea.
export function Logo({ animate = false, className = '' }: { animate?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 440 160"
      className={`logo ${animate ? 'anim' : ''} ${className}`}
      role="img"
      aria-label="Acorrea2"
    >
      {/* asa de la correa */}
      <path
        className="leash"
        d="M66 44 C 52 58, 18 56, 14 36 C 10 16, 38 6, 56 18 C 64 24, 68 34, 66 44"
        fill="none" stroke="var(--coral)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"
      />
      {/* correa: del asa a la anilla de la chapa */}
      <path
        className="leash"
        d="M66 44 C 120 6, 190 62, 262 30 S 362 6, 392 50"
        fill="none" stroke="var(--coral)" strokeWidth="9" strokeLinecap="round"
      />
      <path
        className="leash"
        d="M66 44 C 120 6, 190 62, 262 30 S 362 6, 392 50"
        fill="none" stroke="var(--ink)" strokeWidth="2" strokeDasharray="2 10" strokeLinecap="round" opacity="0.55"
      />
      <text x="10" y="142" textLength="334" lengthAdjust="spacingAndGlyphs" className="logo-word">
        Acorrea
      </text>
      {/* chapa con el 2 */}
      <g className="tag">
        <circle cx="392" cy="58" r="9" fill="none" stroke="var(--ink)" strokeWidth="5" />
        <circle cx="396" cy="110" r="38" fill="var(--ink)" />
        <circle cx="392" cy="106" r="38" fill="var(--sun)" stroke="var(--ink)" strokeWidth="5" />
        <text x="392" y="127" textAnchor="middle" className="logo-two">2</text>
      </g>
    </svg>
  );
}
